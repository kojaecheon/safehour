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
