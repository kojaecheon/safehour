#!/usr/bin/env node
// 배포본 검증 — 배포 직후·kill switch 발동 후·롤백 후에 실행한다.
//
// 사용법: node scripts/verify-deployment.mjs https://<배포주소>
//
// 확인 항목 (docs/DEPLOYMENT.md 5장 체크리스트와 대응)
//   1. 헬스 응답과 인증키 설정 여부
//   2. 보안 헤더 — 특히 geolocation 차단 (D07-BAN002)
//   3. 안전 게이트 — 외출 미허용 시 미추천, 잘못된 좌표 거부
//   4. 판정 경로 — 추천 생성과 재판정
//   5. 인증키가 응답 어디에도 노출되지 않음 (D07-POL009)

const baseUrl = process.argv[2]?.replace(/\/$/, '');
if (!baseUrl) {
  console.error('사용법: node scripts/verify-deployment.mjs https://<배포주소>');
  process.exit(1);
}

const results = [];
const iso = (offsetMin) => new Date(Date.now() + offsetMin * 60000).toISOString();

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  ✓' : '  ✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** 실패는 아니지만 알아야 하는 것 — 종료 코드에 반영하지 않는다 */
function warn(name, detail) {
  console.log(`  ! ${name}${detail ? ` — ${detail}` : ''}`);
}

async function postJson(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

function condition(overrides = {}) {
  return {
    version: 'deploy-check',
    issuedAt: iso(-10),
    issuedBy: 'medical_staff',
    outingAllowed: true,
    avoidUv: true,
    maxWalkMin: 20,
    maxTravelMin: 30,
    ...overrides,
  };
}

function planBody(overrides = {}) {
  return {
    origin: { lat: 37.5105, lng: 127.059, label: '병원' },
    returnBy: iso(240),
    condition: condition(),
    roles: { hasCompanion: true, patientResting: false, companionSeparateAllowed: false },
    ...overrides,
  };
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
if (health.flags?.recommendationKilled) {
  console.log('\n  ⚠ kill switch 가 켜져 있습니다. 아래 판정 검사는 미추천이 정상입니다.\n');
}

// ── 2. 보안 헤더 ──
console.log('\n2. 보안 헤더');
const pageRes = await fetch(baseUrl);
const permissions = pageRes.headers.get('permissions-policy') ?? '';
record('geolocation 차단', permissions.includes('geolocation=()'), permissions || '헤더 없음');
record('nosniff', pageRes.headers.get('x-content-type-options') === 'nosniff');
record('frame 차단', pageRes.headers.get('x-frame-options') === 'DENY');

// ── 3. 안전 게이트 ──
console.log('\n3. 안전 게이트');
const blocked = await postJson('/api/recommend', {
  ...planBody(),
  condition: condition({ outingAllowed: false }),
});
record(
  '외출 미허용 → 미추천',
  blocked.data?.decision?.state === 'NO_TOURISM' && blocked.data.decision.course.length === 0,
  blocked.parseError ?? blocked.data?.decision?.state,
);

const stale = await postJson('/api/recommend', {
  ...planBody(),
  condition: condition({ issuedAt: iso(-25 * 60) }),
});
record(
  '25시간 지난 조건 → 미추천',
  stale.data?.decision?.state === 'NO_TOURISM',
  stale.parseError ?? stale.data?.decision?.reasons?.join(','),
);

const badOrigin = await postJson('/api/recommend', {
  ...planBody(),
  origin: { lat: 48.85, lng: 2.35 },
});
record('국외 좌표 → 400 거부', badOrigin.res.status === 400, `HTTP ${badOrigin.res.status}`);

// ── 4. 판정 경로 ──
console.log('\n4. 판정과 재판정');
const paused = health.flags?.recommendationKilled === true;
const plan = await postJson('/api/recommend', planBody());
if (paused) {
  record('kill switch 적용됨', plan.data?.servicePaused === true && plan.data.decision.state === 'NO_TOURISM', plan.parseError);
} else {
  const decision = plan.data?.decision;
  record(
    '추천 생성',
    plan.data?.ok === true,
    plan.parseError ?? `state=${decision?.state} 후보=${plan.data?.diagnostics?.candidateCount}`,
  );
  record('화면 노출 3개 제한', plan.data?.displayLimit === 3);

  if (decision?.course?.length > 0) {
    const recalc = await postJson('/api/recalculate', {
      recalcPayload: plan.data.recalcPayload,
      event: { type: 'PATIENT_RECALL' },
    });
    record(
      '환자 호출 → 즉시 복귀 전환',
      recalc.data?.recalc?.result?.state === 'NO_TOURISM' && recalc.data.recalc.result.returnNow === true,
      recalc.parseError,
    );
  } else {
    record('재판정 검사', true, '추천 0건이라 생략 (조건상 정상일 수 있음)');
  }
}

// ── 5. 비밀정보 노출 ──
//
// 검사 대상은 키 "값" 이지 키 "이름" 이 아니다. health 는 어느 키를 쓰는지
// (weatherKeySource) 를 의도적으로 알리는데, 이름만 보고 실패로 판정하면
// 진짜 노출과 구분되지 않는다.
console.log('\n5. 비밀정보 노출');
const bodies = [JSON.stringify(health), JSON.stringify(plan.data ?? {}), await pageRes.text()];
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
if (failed.length === 0) {
  console.log(`✓ 전체 ${results.length}건 통과`);
} else {
  console.log(`✖ ${failed.length}/${results.length} 실패:`);
  for (const f of failed) console.log(`    - ${f.name}`);
}
console.log(`${'─'.repeat(50)}\n`);
process.exit(failed.length === 0 ? 0 : 1);
