// 날씨 어댑터 + 기상청 격자 변환
//
// 기상청 단기예보 API 는 위경도가 아닌 격자(nx, ny)를 받는다.
// 아래 변환식은 기상청이 공개한 Lambert Conformal Conic 파라미터 기준이다.

/** 위경도 → 기상청 격자(nx, ny) */
export function toGrid(lat, lon) {
  const RE = 6371.00877;   // 지구 반경(km)
  const GRID = 5.0;        // 격자 간격(km)
  const SLAT1 = 30.0, SLAT2 = 60.0;
  const OLON = 126.0, OLAT = 38.0;
  const XO = 43, YO = 136;

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

/** SafeHour 판정에 쓰는 기상 임계값 */
export const WEATHER_THRESHOLD = {
  /** 강수확률(%) 이상이면 실외 부적합 */
  popPct: 60,
  /** 1시간 강수량(mm) 이상이면 실외 부적합 */
  rainMm: 1,
  /** 체감 위험 기온(℃) — 회복기 환자 기준으로 보수적 */
  maxTempC: 31,
  minTempC: 0,
};

/**
 * 예보 데이터 → SafeHour 판정용 요약
 * @param {{pop?:number, rn1?:number, t1h?:number, sky?:number, pty?:number}} f
 */
export function summarize(f = {}) {
  const reasons = [];
  if (f.pty && f.pty > 0) reasons.push('강수 중');
  if (typeof f.pop === 'number' && f.pop >= WEATHER_THRESHOLD.popPct) reasons.push(`강수확률 ${f.pop}%`);
  if (typeof f.rn1 === 'number' && f.rn1 >= WEATHER_THRESHOLD.rainMm) reasons.push(`강수량 ${f.rn1}mm`);
  if (typeof f.t1h === 'number' && f.t1h >= WEATHER_THRESHOLD.maxTempC) reasons.push(`고온 ${f.t1h}℃`);
  if (typeof f.t1h === 'number' && f.t1h <= WEATHER_THRESHOLD.minTempC) reasons.push(`저온 ${f.t1h}℃`);

  return {
    outdoorUnsafe: reasons.length > 0,
    reasons,
    // 데이터가 아예 없으면 보수적으로 실외 차단하지 않되, 화면에 "확인 불가" 표기
    unknown: Object.keys(f).length === 0,
    observedAt: f.observedAt ?? null,
  };
}

/** 장애 시 안전한 기본값 — 실외를 막지 않되 불확실함을 표기 */
export function createFallbackWeather() {
  return {
    name: 'fallback-weather',
    get() {
      return { outdoorUnsafe: false, reasons: [], unknown: true, degraded: true };
    },
  };
}

// ── 기상청 초단기실황 (VilageFcstInfoService_2.0/getUltraSrtNcst) ──
//
// 발표: 매시 정각 관측, 매시 40분 이후 제공.
// 실패 시 판정을 왜곡하지 않는다 — 실외를 막지도, 허용 근거로 쓰지도 않고
// unknown·degraded 로만 표기한다 (D06-E012).

const KMA_BASE_URL =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';

function encodeServiceKey(serviceKey) {
  // 공공데이터포털 키는 이미 URL 인코딩된 형태로 발급되는 경우가 있다.
  return /%[0-9A-F]{2}/i.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey);
}

/** 초단기실황 base_date/base_time (KST) — 45분 전이면 직전 정시를 쓴다 */
export function kmaBaseDateTime(now = new Date()) {
  let kst = new Date(now.getTime() + 9 * 3600000);
  if (kst.getUTCMinutes() < 45) {
    kst = new Date(kst.getTime() - 3600000);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return {
    baseDate: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    baseTime: `${pad(kst.getUTCHours())}00`,
  };
}

/**
 * 기준점 좌표의 현재 기상 실황을 조회해 SafeHour 판정용 요약으로 반환한다.
 * 어떤 실패에서도 throw 하지 않고 unknown·degraded 요약을 반환한다.
 */
export async function fetchKmaNowcast({
  lat,
  lng,
  serviceKey,
  fetchImpl = fetch,
  timeoutMs = 4000,
  now = new Date(),
}) {
  if (!serviceKey) {
    return { ...createFallbackWeather().get(), source: 'none', error: 'NO_SERVICE_KEY' };
  }

  const { nx, ny } = toGrid(Number(lat), Number(lng));
  const { baseDate, baseTime } = kmaBaseDateTime(now);
  const query = new URLSearchParams({
    pageNo: '1',
    numOfRows: '10',
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });
  const url = `${KMA_BASE_URL}?serviceKey=${encodeServiceKey(serviceKey)}&${query}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`KMA HTTP ${res.status}`);
    const json = await res.json();
    const code = json?.response?.header?.resultCode;
    if (code !== '00') {
      throw new Error(`KMA ${code ?? 'INVALID'} ${json?.response?.header?.resultMsg ?? ''}`.trim());
    }

    const items = json?.response?.body?.items?.item ?? [];
    const byCategory = {};
    for (const item of items) byCategory[item.category] = item.obsrValue;
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const forecast = {};
    if (num(byCategory.PTY) !== undefined) forecast.pty = num(byCategory.PTY);
    if (num(byCategory.RN1) !== undefined) forecast.rn1 = num(byCategory.RN1);
    if (num(byCategory.T1H) !== undefined) forecast.t1h = num(byCategory.T1H);

    const summary = summarize(forecast);
    summary.observedAt = `${baseDate} ${baseTime}`;
    summary.source = 'kma-ultra-nowcast';
    summary.grid = { nx, ny };
    return summary;
  } catch (error) {
    // 인증키 미신청·타임아웃·형식 오류 등 — 판정에 반영하지 않고 확인 불가로만 표기
    return { ...createFallbackWeather().get(), source: 'kma-ultra-nowcast', error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── 기상청 단기예보 (VilageFcstInfoService_2.0/getVilageFcst): AX-308 · docs/platform/ITINERARY_RULES.md '변화 원천'(표의 4번 행), docs/contracts.md '`POST /api/itinerary/plan`'의 diagnostics.weather ──
//
// 일정 API 가 숙소 좌표의 오늘~모레 날짜별 '실외 부적합' 여부를 정한다.
// 요청·응답 형식 근거 (2026-09-19 확인)
//   - 공공데이터포털 '기상청_단기예보 ((구)_동네예보) 조회서비스' https://www.data.go.kr/data/15084084/openapi.do
//     오퍼레이션 목록에 단기예보조회(getVilageFcst). 호스트 apis.data.go.kr/1360000/VilageFcstInfoService_2.0
//     (초단기실황 fetchKmaNowcast 와 같은 서비스·같은 serviceKey)
//   - 기상청 '단기예보 조회서비스 API활용가이드'(apihub.kma.go.kr 첨부 docx, 공공데이터포털 활용가이드와 같은 메시지 명세)
//     요청: numOfRows, pageNo, dataType(XML/JSON), base_date(YYYYMMDD), base_time(HHMM), nx, ny
//     응답 item: baseDate, baseTime, category, fcstDate, fcstTime, fcstValue, nx, ny / header.resultCode "00"=NORMAL_SERVICE
//     발표: Base_time 0200·0500·0800·1100·1400·1700·2000·2300 (1일 8회), API 제공 시간은 각 발표 10분 뒤
//     단기예보 코드: POP 강수확률(%), PTY 강수형태(없음0·비1·비/눈2·눈3·소나기4), PCP 1시간 강수량(범주, 1mm),
//                    TMP 1시간 기온(℃), SKY 하늘상태 등. ±900 이상 값은 결측(Missing)
//     PCP 표시: "-, null, 0값은 '강수없음'", 0.1~1.0mm 미만 "1.0mm 미만", 1.0~30mm 미만 "정수값+mm",
//               30~50mm "30.0~50.0mm", 50mm 이상 "50.0mm 이상"
// 판정 기준은 위 WEATHER_THRESHOLD(초단기실황과 같은 값)를 시간별로 적용한다.
// 실패·키 없음·자료 부족은 '확인 불가'(outdoorUnsafe: null)이며 판정에 반영하지 않는다 — 실외를 막지도, 허용 근거로 쓰지도 않는다.
// 오류는 분류 코드만 돌려준다. 키·전체 조회 URL 은 반환값·로그에 남기지 않는다(docs/security.md '비밀값'·'기록').

const KMA_VILAGE_FCST_URL =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';

/** 단기예보 발표시각 (KST, 1일 8회) */
export const KMA_SHORT_TERM_BASE_TIMES = Object.freeze(['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300']);
/** 발표 후 API 제공까지(분) */
const SHORT_TERM_AVAILABLE_AFTER_MIN = 10;
/** 오늘~모레(약 67시간 × 12요소)를 한 쪽에 받는 크기. 초과분(글피)은 쓰지 않는다 */
const SHORT_TERM_ROWS = 1000;
/** 결측 표기: +900 이상, -900 이하 */
const MISSING_ABS = 900;
/** 판정에 쓰는 활동 시간 (stay/defaults.js DEFAULTS.activityHours 와 같은 값) */
const DEFAULT_ACTIVITY_HOURS = Object.freeze({ start: '09:00', end: '21:00' });

const pad2 = (n) => String(n).padStart(2, '0');

function kstParts(now) {
  const kst = new Date(now.getTime() + 9 * 3600000);
  return {
    date: `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`,
    minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
    ms: kst.getTime(),
  };
}

/**
 * 지금 받을 수 있는 가장 최근 단기예보 발표 (KST). 발표 10분 뒤부터 제공된다.
 * 02:10 전이면 전날 2300 발표다.
 * @param {Date} [now]
 * @returns {{baseDate: string, baseTime: string}}
 */
export function vilageFcstBaseDateTime(now = new Date()) {
  const { minutes, ms } = kstParts(now);
  const ready = KMA_SHORT_TERM_BASE_TIMES.filter(
    (t) => Number(t.slice(0, 2)) * 60 + SHORT_TERM_AVAILABLE_AFTER_MIN <= minutes,
  );
  let day = new Date(ms);
  let baseTime = ready.at(-1);
  if (!baseTime) {
    day = new Date(ms - 24 * 3600000);
    baseTime = KMA_SHORT_TERM_BASE_TIMES.at(-1);
  }
  return {
    baseDate: `${day.getUTCFullYear()}${pad2(day.getUTCMonth() + 1)}${pad2(day.getUTCDate())}`,
    baseTime,
  };
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || Math.abs(n) >= MISSING_ABS) return undefined;
  return n;
}

/**
 * PCP(1시간 강수량 범주) → mm. '강수없음'·'-'·0·null 은 0, '1mm 미만'은 1보다 작은 값(0.5),
 * 범위·'이상' 표기는 아래 경계. 읽을 수 없거나 결측이면 null.
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
export function parsePrecipitationMm(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) < MISSING_ABS ? value : null;
  const text = String(value).replace(/\s+/g, '');
  if (text === '' || text === '-' || text === '0' || text === '강수없음') return 0;
  if (text.includes('미만')) return 0.5; // 0.1~1.0mm 미만 — 기준(1mm)보다 작다
  const m = /^(-?\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Math.abs(n) >= MISSING_ABS ? null : n;
}

function hourUnsafe(record) {
  const pty = numeric(record.PTY);
  const pop = numeric(record.POP);
  const tmp = numeric(record.TMP);
  const pcp = record.PCP === undefined ? undefined : parsePrecipitationMm(record.PCP);
  if (pty !== undefined && pty > 0) return true;
  if (pop !== undefined && pop >= WEATHER_THRESHOLD.popPct) return true;
  if (typeof pcp === 'number' && pcp >= WEATHER_THRESHOLD.rainMm) return true;
  if (tmp !== undefined && (tmp >= WEATHER_THRESHOLD.maxTempC || tmp <= WEATHER_THRESHOLD.minTempC)) return true;
  return false;
}

function hasReading(record) {
  return ['PTY', 'POP', 'TMP', 'PCP'].some((k) => (k === 'PCP' ? parsePrecipitationMm(record[k]) !== null && record[k] !== undefined : numeric(record[k]) !== undefined));
}

/**
 * 단기예보 항목 → 날짜별 실외 부적합.
 * 날짜의 활동 시간(09–21시, 오늘은 지금 시각 이후)에서
 *   - 한 시간이라도 부적합(강수 형태, 강수확률 60% 이상, 강수량 1mm 이상, 31℃ 이상·0℃ 이하)이면 true
 *   - 모든 시간이 예보로 덮이고 부적합이 없으면 false
 *   - 그 밖(자료 부족·결측)은 null — 확인 불가, 판정에 반영하지 않는다
 * @param {Array<{category: string, fcstDate: string, fcstTime: string, fcstValue: string}>} items
 * @param {{dates: string[], now?: Date, activityHours?: {start: string, end: string}}} opts
 * @returns {Record<string, {outdoorUnsafe: boolean|null}>}
 */
export function summarizeShortTermForecast(items, { dates, now = new Date(), activityHours = DEFAULT_ACTIVITY_HOURS } = {}) {
  const byHour = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const d = String(item?.fcstDate ?? '');
    const t = String(item?.fcstTime ?? '');
    if (!/^\d{8}$/.test(d) || !/^\d{4}$/.test(t) || typeof item?.category !== 'string') continue;
    const key = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.slice(0, 2)}`;
    if (!byHour.has(key)) byHour.set(key, {});
    byHour.get(key)[item.category] = item.fcstValue;
  }

  const startHour = Number(activityHours.start.slice(0, 2));
  const endHour = Number(activityHours.end.slice(0, 2)); // 끝 시각의 시간대는 포함하지 않는다(21시 → 20시까지)
  const clock = kstParts(now);
  const out = {};
  for (const date of dates ?? []) {
    const from = date === clock.date ? Math.max(startHour, Math.floor(clock.minutes / 60)) : startHour;
    let unsafe = false;
    let covered = 0;
    let wanted = 0;
    for (let h = from; h < endHour; h += 1) {
      wanted += 1;
      const record = byHour.get(`${date} ${pad2(h)}`);
      if (!record || !hasReading(record)) continue;
      covered += 1;
      if (hourUnsafe(record)) unsafe = true;
    }
    out[date] = { outdoorUnsafe: unsafe ? true : wanted > 0 && covered === wanted ? false : null };
  }
  return out;
}

function unknownDates(dates) {
  return Object.fromEntries((dates ?? []).map((d) => [d, { outdoorUnsafe: null }]));
}

/**
 * 기상청 서비스 키.
 *   - 설정 안 함 또는 빈 값(`KMA_API_KEY=`) → 공공데이터포털 공용 키 `TOUR_API_KEY` 를 쓴다(.env.example 안내와 같다.
 *     같은 계정 키로 기상청 서비스를 활용 신청한 경우)
 *   - 공백만 있는 값(`' '`) 또는 `off` → 기상 조회를 끈다. E2E 는 `KMA_API_KEY: ' '` 로 외부 호출을 막는다(playwright.config.js)
 *   - 그 밖 → 그 값(앞뒤 공백 제거)
 * 꺼지면 모든 날짜가 '확인 불가'이고 판정에 반영하지 않는다.
 * @param {Record<string, string|undefined>} [env]
 * @returns {string|null}
 */
export function resolveKmaServiceKey(env = process.env) {
  const raw = env?.KMA_API_KEY;
  if (raw === undefined || raw === null || raw === '') return env?.TOUR_API_KEY?.trim() || null;
  const key = String(raw).trim();
  if (key === '' || key.toLowerCase() === 'off') return null;
  return key;
}

/**
 * 숙소 좌표의 단기예보를 조회해 날짜별 실외 부적합을 돌려준다. 어떤 실패에서도 throw 하지 않는다.
 * @param {{lat: number, lng: number, serviceKey: string|null, dates: string[], fetchImpl?: Function, timeoutMs?: number, now?: Date}} args
 * @returns {Promise<{source: 'kma-short-term'|'none', byDate: Record<string, {outdoorUnsafe: boolean|null}>,
 *                    unknown: boolean, degraded: boolean, error?: string}>}
 *   error 는 분류 코드(NO_SERVICE_KEY·HTTP_500·RESULT_03·INVALID_RESPONSE·TIMEOUT·NETWORK)뿐이다
 */
export async function fetchKmaShortTermForecast({
  lat,
  lng,
  serviceKey,
  dates = [],
  fetchImpl = fetch,
  timeoutMs = 4000,
  now = new Date(),
}) {
  if (!Array.isArray(dates) || dates.length === 0) {
    return { source: 'none', byDate: {}, unknown: false, degraded: false };
  }
  if (!serviceKey) {
    return { source: 'none', byDate: unknownDates(dates), unknown: true, degraded: true, error: 'NO_SERVICE_KEY' };
  }

  const { nx, ny } = toGrid(Number(lat), Number(lng));
  const { baseDate, baseTime } = vilageFcstBaseDateTime(now);
  const query = new URLSearchParams({
    pageNo: '1',
    numOfRows: String(SHORT_TERM_ROWS),
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });
  const url = `${KMA_VILAGE_FCST_URL}?serviceKey=${encodeServiceKey(serviceKey)}&${query}`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const fail = (error) => ({ source: 'kma-short-term', byDate: unknownDates(dates), unknown: true, degraded: true, error });
  try {
    let res;
    try {
      res = await fetchImpl(url, { signal: controller.signal });
    } catch {
      return fail(timedOut ? 'TIMEOUT' : 'NETWORK');
    }
    if (!res?.ok) return fail(`HTTP_${Number(res?.status) || 0}`);
    let json;
    try {
      json = await res.json();
    } catch {
      return fail(timedOut ? 'TIMEOUT' : 'INVALID_RESPONSE');
    }
    const code = String(json?.response?.header?.resultCode ?? '');
    if (code !== '00' && code !== '0') return fail(/^\d{1,3}$/.test(code) ? `RESULT_${code}` : 'INVALID_RESPONSE');
    const raw = json?.response?.body?.items?.item ?? [];
    const items = Array.isArray(raw) ? raw : [raw];
    const byDate = summarizeShortTermForecast(items, { dates, now });
    const unknown = Object.values(byDate).some((v) => v.outdoorUnsafe === null);
    return { source: 'kma-short-term', byDate, unknown, degraded: false };
  } finally {
    clearTimeout(timer);
  }
}
