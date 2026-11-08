#!/usr/bin/env node
// 배포본 검증 — 배포 직후·kill switch 발동 후·롤백 후에 **사람이 손으로** 실행한다.
//
// 사용법: node scripts/verify-deployment.mjs https://<배포주소> [--skip-plan]
//
// 수동 실행 전용이다. CI·npm test·E2E 는 이 스크립트를 부르지 않는다.
// 데모 로그인이 켜진 배포본에서는 일정 API 를 실제로 부르므로 관광공사 API 호출이 생긴다(요청 날짜 1일, 일정 요청 1회:
// 캐시가 없으면 목록 조회 2회와 상세 조회 몇 회). 국외 좌표 검사는 입력 검증에서 끝나 호출이 없다.
// 오늘 호출 한도가 빠듯하면 --skip-plan(또는 SAFEHOUR_VERIFY_SKIP_PLAN=1)으로 일정 생성 검사 두 건을 '생략'으로 둔다.
// 생략은 실패로 세지 않는다. 헬스 응답에 호출 카운터가 있으면 operation별 사용량을 한 줄로 보인다.
//
// 확인 항목 (docs/DEPLOYMENT.md 5장 체크리스트와 대응)
//   1. 헬스 응답과 인증키 설정 여부, 로그인 가능 여부
//   2. 보안 헤더 — 특히 geolocation 차단 (D07-BAN002)
//   3. 로그인 가드와 입력 검증 — 세션 없음 401, 국외 좌표 400 (spec 6장)
//   4. 일정 API 스모크 — 데모 로그인이 켜져 있을 때만: 데모 체류로 POST /api/itinerary/plan
//      (외출 불가 조건 → 환자 외출 0개, 추천 중단 스위치가 켜져 있으면 SERVICE_PAUSED)
//   5. 인증키가 응답 어디에도 노출되지 않음 (D07-POL009)
//
// 퇴역한 단일 외출 API(/api/recommend·/api/recalculate)는 부르지 않는다 (AX-308 에서 삭제, AX-321 에서 이 스크립트 갱신).

const args = process.argv.slice(2);
const baseUrl = args.find((a) => !a.startsWith('--'))?.replace(/\/$/, '');
const skipPlan = args.includes('--skip-plan') || process.env.SAFEHOUR_VERIFY_SKIP_PLAN === '1';
if (!baseUrl) {
  console.error('사용법: node scripts/verify-deployment.mjs https://<배포주소> [--skip-plan]');
  process.exit(1);
}

const results = [];
const skipped = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  ✓' : '  ✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** 일부러 하지 않은 검사(관광공사 호출 한도 절약 등). 실패로 세지 않는다 */
function skip(name, detail) {
  skipped.push({ name, detail });
  console.log(`  - ${name} (생략)${detail ? `: ${detail}` : ''}`);
}

/** 헬스의 관광공사 자체 호출 카운터를 한 줄로. 키·URL 은 헬스 응답에 없다 */
function describeTourApiUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  if (usage.counterReadable === false) return { ok: false, line: '호출 카운터를 읽을 수 없음(손상), 이 상태면 관광공사 호출이 막힌다' };
  const ops = Object.entries(usage.operations ?? {});
  const list = ops.length
    ? ops.map(([name, o]) => `${name} ${o.used}/${o.limit}${o.state && o.state !== 'OK' ? ` ${o.state}` : ''}`).join(', ')
    : '오늘 호출 없음';
  return { ok: true, line: `${usage.date ?? '?'} 경고 ${usage.warningAt} · 차단 ${usage.dailyLimit} · ${list}` };
}

/** 실패는 아니지만 알아야 하는 것 — 종료 코드에 반영하지 않는다 */
function warn(name, detail) {
  console.log(`  ! ${name}${detail ? ` — ${detail}` : ''}`);
}

async function postJson(path, body, { cookie } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  // 서버가 500 을 내면 Next 가 HTML 오류 페이지를 준다. 진단 도구가 여기서
  // 죽으면 정작 원인을 못 본다 — 파싱 실패를 결과로 돌려준다.
  const raw = await res.text();
  try {
    return { res, data: JSON.parse(raw) };
  } catch {
    return {
      res,
      data: null,
      parseError: `HTTP ${res.status} — JSON 이 아닌 응답 (앞 120자: ${raw.slice(0, 120)})`,
    };
  }
}

/** 한국 날짜 'YYYY-MM-DD' (오늘 + days) — 서버도 KST 오늘을 기준으로 판정한다 */
function kstDate(days = 0) {
  return new Date(Date.now() + 9 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 데모 체류(PlanStay 허용 목록 필드만) — 오늘 입국·오늘 수술·시술(경계일)·모레 출국, 숙소·병원은 데모 좌표.
 * 이름·주소·전화는 보내지 않는다(서버도 버린다). 오늘부터 본인 체크 기간 '외출 불가'를 둔다.
 */
function demoStay(overrides = {}) {
  const today = kstDate(0);
  const departure = kstDate(2);
  return {
    arrival: { date: today, time: '06:00', airport: 'ICN' },
    departure: { date: departure, time: '23:00', airport: 'ICN' },
    hasCompanion: false,
    interests: [],
    pace: 'RELAXED',
    lodgings: [{ id: 'L1', lat: 37.5609, lng: 126.986, checkIn: today, checkOut: departure }],
    hospitals: [{ id: 'H1', lat: 37.5163, lng: 127.0203 }],
    appointments: [{ id: 'A1', hospitalId: 'H1', type: 'PROCEDURE', date: today, start: '07:00' }],
    periods: [
      {
        id: 'P1',
        source: 'SELF',
        startDate: today,
        endDate: departure,
        items: {
          outing: 'FORBIDDEN',
          returnTime: { kind: 'NOT_SET' },
          walkLimit: { kind: 'NONE' },
          travelLimit: { kind: 'NONE' },
          avoidUv: { kind: 'NONE' },
          avoidHeat: { kind: 'NONE' },
          avoidWater: { kind: 'NONE' },
          escortRequired: { kind: 'NONE' },
          guardianMustStay: { kind: 'NONE' },
          mealRestriction: { kind: 'NONE' },
          diet: { spicy: { kind: 'NONE' }, alcohol: { kind: 'NONE' }, hard: { kind: 'NONE' }, hot: { kind: 'NONE' }, raw: { kind: 'NONE' } },
          medication: { kind: 'NONE' },
        },
      },
    ],
    consent: { sensitive: { version: 'deploy-check', agreedAt: new Date().toISOString() } },
    ...overrides,
  };
}

/** 데모 로그인 → 세션 쿠키 한 줄('safehour.session=…'). 실패하면 null */
async function demoLogin() {
  const res = await fetch(`${baseUrl}/api/auth/login?provider=demo&returnTo=%2F`, { redirect: 'manual' });
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? ''];
  const session = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('safehour.session='));
  return session ?? null;
}

console.log(`\n배포본 검증: ${baseUrl}\n`);

// ── 1. 헬스 ──
console.log('1. 헬스와 설정');
const healthRes = await fetch(`${baseUrl}/api/health`);
const health = await healthRes.json();
record('헬스 응답', healthRes.ok && health.ok === true, `HTTP ${healthRes.status}`);
record('TourAPI 키 설정됨', health.config?.tourApiKeyConfigured === true);
// 기상은 판정에 반영되지 않는 보강 정보다. 없어도 서비스는 안전하게 동작한다.
if (health.config?.weatherApiKeyConfigured) {
  record('기상 키 설정됨', true);
} else {
  warn('기상 키 미설정', '기상은 "확인 불가"로 표기되고 판정에 반영되지 않음 (AC011 증거 없음)');
}
const usage = describeTourApiUsage(health.tourApiUsage);
if (usage?.ok) console.log(`  · TourAPI 오늘 호출: ${usage.line}`);
else if (usage) warn('TourAPI 호출 카운터', usage.line);
if (health.flags?.recommendationKilled) {
  console.log('\n  ⚠ kill switch 가 켜져 있습니다. 아래 판정 검사는 미추천이 정상입니다.\n');
}

// ── 1-1. 로그인 가능 여부 ──
//
// 이 검사가 없던 시절, 배포본에 로그인 수단이 하나도 없어 지침 연결부터 막혔는데
// 검증 13건이 전부 통과했다. 제품은 이미 /api/auth/session 으로 그 사실을 정확히
// 보고하고 있었다 — 사람이 눈으로 볼 때만 보였고 자동 검증이 보지 않았을 뿐이다.
//
// 로그인이 막히면 병원 지침을 연결할 수 없고, 지침이 없으면 연결 게이트가 관광지
// 표시 자체를 막는다. 즉 로그인 불가는 "일부 기능 제한" 이 아니라 **제품 전체가
// 도달 불가능** 하다는 뜻이라, 경고가 아니라 실패로 다룬다.
const sessionRes = await fetch(`${baseUrl}/api/auth/session`);
const session = await sessionRes.json();
const auth = session.auth ?? {};

// `auth.ready` 만 보면 안 된다. 그것은 "세션 키와 콜백 주소가 있다" 는 뜻이고
// 로그인 **수단**이 있는지는 보지 않는다 — 실제로 ready=true 인데 아무도 로그인할
// 수 없는 조합이 존재한다. 여기서는 "지금 누군가 로그인을 끝낼 수 있는가" 로 판정한다.
const loginMethods = (auth.providers ?? []).filter((p) => p.configured).map((p) => p.id);
if (auth.demoLogin) loginMethods.push('demo');
const loginUsable = auth.ready === true && loginMethods.length > 0;

record('로그인 가능', loginUsable, describeLogin(auth, loginMethods, loginUsable));

function describeLogin(a, open, usable) {
  if (usable) return `사용 가능: ${open.join(', ')}`;

  const missing = [];
  if (!a.sessionSecretConfigured) missing.push('SAFEHOUR_SESSION_SECRET (32자 이상)');
  if (!a.callbackConfigured) missing.push('SAFEHOUR_BASE_URL');
  if (open.length === 0) {
    missing.push('로그인 수단 (GOOGLE_/KAKAO_CLIENT_ID·SECRET 또는 SAFEHOUR_ALLOW_DEMO_LOGIN=1)');
  }
  return `없는 것: ${missing.join(' / ')} — 심사위원이 지침 연결부터 막힌다`;
}

// ── 2. 보안 헤더 ──
console.log('\n2. 보안 헤더');
const pageRes = await fetch(baseUrl);
const permissions = pageRes.headers.get('permissions-policy') ?? '';
record('geolocation 차단', permissions.includes('geolocation=()'), permissions || '헤더 없음');
record('nosniff', pageRes.headers.get('x-content-type-options') === 'nosniff');
record('frame 차단', pageRes.headers.get('x-frame-options') === 'DENY');

// ── 3. 로그인 가드와 입력 검증 ──
console.log('\n3. 로그인 가드와 입력 검증');
const unauth = await postJson('/api/itinerary/plan', { lang: 'ko', stay: demoStay(), dates: [kstDate(0)] });
record(
  '세션 없음 → 401 SAFEHOUR_AUTH_REQUIRED',
  unauth.res.status === 401 && unauth.data?.errorCode === 'SAFEHOUR_AUTH_REQUIRED',
  unauth.parseError ?? `HTTP ${unauth.res.status} ${unauth.data?.errorCode ?? ''}`,
);

// ── 4. 일정 API 스모크 (데모 로그인이 켜진 배포본만) ──
console.log('\n4. 일정 API 스모크');
const paused = health.flags?.recommendationKilled === true;
let planData = null;
if (!auth.demoLogin) {
  warn('일정 API 스모크 생략', '데모 로그인(SAFEHOUR_ALLOW_DEMO_LOGIN=1)이 꺼져 있다 — 실제 계정으로 화면에서 확인한다');
} else {
  const cookie = await demoLogin();
  record('데모 로그인 세션 발급', Boolean(cookie));
  if (cookie) {
    const badOrigin = await postJson(
      '/api/itinerary/plan',
      { lang: 'ko', stay: demoStay({ lodgings: [{ id: 'L1', lat: 48.85, lng: 2.35, checkIn: kstDate(0), checkOut: kstDate(2) }] }), dates: [kstDate(0)] },
      { cookie },
    );
    record(
      '국외 좌표 → 400 SAFEHOUR_STAY_INVALID',
      badOrigin.res.status === 400 && badOrigin.data?.errorCode === 'SAFEHOUR_STAY_INVALID',
      badOrigin.parseError ?? `HTTP ${badOrigin.res.status} ${badOrigin.data?.errorCode ?? ''}`,
    );

    const today = kstDate(0);
    const plan = skipPlan ? null : await postJson('/api/itinerary/plan', { lang: 'ko', stay: demoStay(), dates: [today] }, { cookie });
    planData = plan?.data ?? null;
    const day = plan?.data?.days?.[today];
    // 502 면 관광공사 실패 분류(upstream)를 함께 보인다(QUOTA·AUTH·NETWORK 등, 키·URL 은 없다)
    const upstreamNote = plan?.data?.upstream ? ` upstream=${plan.data.upstream}` : '';
    if (skipPlan) {
      const why = '--skip-plan / SAFEHOUR_VERIFY_SKIP_PLAN=1, 관광공사 호출 한도 절약';
      skip(paused ? '추천 중단 스위치 적용됨' : '일정 생성 응답', why);
      if (!paused) skip('외출 불가 조건 → 환자 외출 0개', why);
    } else if (paused) {
      record(
        '추천 중단 스위치 적용됨',
        plan.data?.servicePaused === true && day?.dayState === 'NO_TOURISM' && (day?.reasons ?? []).includes('SERVICE_PAUSED'),
        plan.parseError ?? `state=${day?.dayState} reasons=${(day?.reasons ?? []).join(',')}`,
      );
    } else {
      record(
        '일정 생성 응답',
        plan.res.status === 200 && plan.data?.ok === true && typeof plan.data.engineVersion === 'string' && Boolean(day),
        plan.parseError ??
          `HTTP ${plan.res.status} engine=${plan.data?.engineVersion} 후보=${plan.data?.diagnostics?.candidateCount}${upstreamNote}`,
      );
      record(
        '외출 불가 조건 → 환자 외출 0개',
        Array.isArray(day?.outings) && day.outings.length === 0 && day?.coverage === 'REST_DAY',
        `coverage=${day?.coverage} state=${day?.dayState} 외출=${day?.outings?.length}`,
      );
    }
  }
}

// ── 5. 비밀정보 노출 ──
//
// 검사 대상은 키 "값" 이지 키 "이름" 이 아니다. health 는 어느 키를 쓰는지
// (weatherKeySource) 를 의도적으로 알리는데, 이름만 보고 실패로 판정하면
// 진짜 노출과 구분되지 않는다.
console.log('\n5. 비밀정보 노출');
const bodies = [JSON.stringify(health), JSON.stringify(planData ?? {}), await pageRes.text()];
const joined = bodies.join('\n');

// (1) URL 에 serviceKey 가 값과 함께 실려 나간 경우
const keyInUrl = /serviceKey=[A-Za-z0-9%+/=]{10,}/.test(joined);
record('URL 에 serviceKey 값 미노출', !keyInUrl);

// (2) 로컬에 키가 있으면 그 값 자체가 응답에 있는지 대조한다 (가장 확실한 검사)
const localKeys = [process.env.TOUR_API_KEY, process.env.KMA_API_KEY]
  .map((k) => k?.trim())
  .filter((k) => k && k.length >= 10);
if (localKeys.length > 0) {
  record('인증키 값 미노출', !localKeys.some((k) => joined.includes(k)));
} else {
  warn('인증키 값 대조 생략', '로컬에 키가 없어 값 비교 불가 — URL 패턴 검사만 수행');
}

// ── 요약 ──
const failed = results.filter((r) => !r.passed);
console.log(`\n${'─'.repeat(50)}`);
const skippedNote = skipped.length ? ` (생략 ${skipped.length}건)` : '';
if (failed.length === 0) {
  console.log(`✓ 전체 ${results.length}건 통과${skippedNote}`);
} else {
  console.log(`✖ ${failed.length}/${results.length} 실패${skippedNote}:`);
  for (const f of failed) console.log(`    - ${f.name}`);
}
console.log(`${'─'.repeat(50)}\n`);
process.exit(failed.length === 0 ? 0 : 1);
