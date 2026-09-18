// UTM-K(GRS80) ↔ 위경도 변환 — 라이브러리 없이 직접 구현 (AX-310 · spec 6장 · 규칙 45)
//
// 행정안전부 좌표제공 API 의 entX·entY 는 UTM-K(GRS80) 좌표다. 서버에서 위경도로 바꿔 돌려준다.
// 새 패키지를 설치하지 않는다(handoff 3장 2). 그래서 역 횡메르카토르 투영을 여기서 계산한다.
//
// 근거 (기억이 아니라 공식 문서로 확인한 것 — handoff 3장 10)
//   1) 좌표계: 도로명주소 도움센터(행정안전부) 공식 답변
//      "좌표는 EPSG5179(UTM-K GRS80)좌표로 제공하고 있습니다." (2025-08-12)
//      https://business.juso.go.kr/jsi/jsiInquiryDetails?qaPstUnqMgno=139182&qaPstRfrncMgno=139182
//      같은 내용: 좌표계(ITRF2000), 기준타원체(GRS80), 투영법(UTM), 장반경(6,378,137m)
//      https://business.juso.go.kr/jsi/jsiInquiryDetails?qaPstUnqMgno=118883&qaPstRfrncMgno=118883
//   2) 투영 매개변수: EPSG 레지스트리 EPSG:5179 "KGD2002 / Unified CS" (변환 EPSG:5100 "Korea Unified Belt")
//      https://apps.epsg.org/api/v1/CoordRefSystem/5179/export/?format=wkt&formatVersion=2
//      - 타원체 GRS 1980: a = 6378137 m, 1/f = 298.257222101 (EPSG:7019)
//      - Transverse Mercator (EPSG:9807)
//      - 원점 위도 38°, 원점 경도 127°30′(=127.5°), 원점 축척계수 0.9996
//      - False easting 1,000,000 m, false northing 2,000,000 m
//      - 축 순서는 Northing(X), Easting(Y) 이지만, 좌표제공 API 의 entX 는 동향(easting),
//        entY 는 북향(northing)이다 — 도로명주소 개발자센터 Tech&Tips 의 공식 예제
//        (entX 945959.04 → 경도 126.888°) 로 확인했다.
//        https://business.juso.go.kr/jsi/jsiTechTipsDetails?pstRfrncUnqNo=712
//   3) 측지계: KGD2002 = ITRF2000 epoch 2002.0 (EPSG:6737).
//      EPSG:15831 "KGD2002 to WGS 84 (1)" 은 이동량 0,0,0, 정확도 ±1 m 다.
//      https://apps.epsg.org/api/v1/Transformation/15831/
//      그래서 투영만 풀면 WGS84 위경도로 쓸 수 있다(1 m 수준 — 규칙 45 의 10 m 기준 안).
//   4) 공식: IOGP Publication 373-7-2 (Geomatics Guidance Note 7 part 2, 2019-09)
//      Transverse Mercator "JHS formulas"(Krüger 급수, EPSG 권장) 정·역변환, 52–55쪽.
//      https://www.iogp.org/wp-content/uploads/2019/09/373-07-02.pdf
//      중앙경선 ±4° 안에서 역변환 오차 0.0005″ 이하(약 1.5 cm). 한국 영역(124–132°E)은 중앙경선
//      127.5° 에서 최대 약 4.5° 떨어져 있고, JHS 공식은 ±40° 까지 견고하다(같은 문서 51쪽).

const DEG = Math.PI / 180;

/** GRS 1980 타원체 (EPSG:7019) */
export const GRS80 = Object.freeze({ a: 6378137, invFlattening: 298.257222101 });

/** EPSG:5179 KGD2002 / Unified CS (UTM-K) 투영 매개변수 */
export const UTMK = Object.freeze({
  ellipsoid: GRS80,
  latitudeOfOrigin: 38,
  longitudeOfOrigin: 127.5,
  scaleFactor: 0.9996,
  falseEasting: 1_000_000,
  falseNorthing: 2_000_000,
});

/**
 * 대한민국 범위 — spec 6장 "좌표는 대한민국 범위만 받는다".
 * 기존 기준점 검사(`lib/server/engine-io.js` normalizeOrigin)와 같은 경계를 쓴다.
 */
export function isInKorea(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132;
}

/** 투영 상수 — 매개변수가 같으면 결과가 같으므로 한 번만 계산한다 */
const constantsCache = new WeakMap();

function projectionConstants(params) {
  const cached = constantsCache.get(params);
  if (cached) return cached;

  const { a, invFlattening } = params.ellipsoid;
  const f = 1 / invFlattening;
  const e2 = f * (2 - f);
  const e = Math.sqrt(e2);
  const n = f / (2 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;

  // GN7-2 52쪽: B 와 정변환 계수 h1..h4
  const B = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
  const h = [
    n / 2 - (2 / 3) * n2 + (5 / 16) * n3 + (41 / 180) * n4,
    (13 / 48) * n2 - (3 / 5) * n3 + (557 / 1440) * n4,
    (61 / 240) * n3 - (103 / 140) * n4,
    (49561 / 161280) * n4,
  ];
  // GN7-2 53쪽: 역변환 계수 h1'..h4'
  const hr = [
    n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4,
    (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4,
    (17 / 480) * n3 - (37 / 840) * n4,
    (4397 / 161280) * n4,
  ];

  // 적도에서 투영 원점 위도까지의 자오선 호 길이 M_O (GN7-2 52쪽)
  const phi0 = params.latitudeOfOrigin * DEG;
  let M0;
  if (phi0 === 0) M0 = 0;
  else if (phi0 === Math.PI / 2) M0 = B * (Math.PI / 2);
  else if (phi0 === -Math.PI / 2) M0 = -B * (Math.PI / 2);
  else {
    const Q0 = Math.asinh(Math.tan(phi0)) - e * Math.atanh(e * Math.sin(phi0));
    const beta0 = Math.atan(Math.sinh(Q0));
    const xi00 = Math.asin(Math.sin(beta0));
    let xi0 = xi00;
    for (let k = 0; k < 4; k += 1) xi0 += h[k] * Math.sin(2 * (k + 1) * xi00);
    M0 = B * xi0;
  }

  const constants = { e, B, h, hr, M0 };
  constantsCache.set(params, constants);
  return constants;
}

/**
 * 횡메르카토르 정변환 (위경도 → 동향·북향). GN7-2 JHS 공식.
 * 서버 경로에서는 역변환만 쓴다. 정변환은 왕복 검증과 테스트 기준값 계산용이다.
 * @returns {{easting: number, northing: number}}
 */
export function transverseMercatorForward(lat, lng, params = UTMK) {
  const { e, B, h, M0 } = projectionConstants(params);
  const phi = lat * DEG;
  const dLambda = (lng - params.longitudeOfOrigin) * DEG;

  const Q = Math.asinh(Math.tan(phi)) - e * Math.atanh(e * Math.sin(phi));
  const beta = Math.atan(Math.sinh(Q));
  const eta0 = Math.atanh(Math.cos(beta) * Math.sin(dLambda));
  const xi0 = Math.asin(Math.sin(beta) * Math.cosh(eta0));

  let xi = xi0;
  let eta = eta0;
  for (let k = 0; k < 4; k += 1) {
    const m = 2 * (k + 1);
    xi += h[k] * Math.sin(m * xi0) * Math.cosh(m * eta0);
    eta += h[k] * Math.cos(m * xi0) * Math.sinh(m * eta0);
  }

  return {
    easting: params.falseEasting + params.scaleFactor * B * eta,
    northing: params.falseNorthing + params.scaleFactor * (B * xi - M0),
  };
}

/**
 * 횡메르카토르 역변환 (동향·북향 → 위경도). GN7-2 JHS 공식(53쪽).
 * @returns {{lat: number, lng: number}}  도 단위
 */
export function transverseMercatorInverse(easting, northing, params = UTMK) {
  const { e, B, hr, M0 } = projectionConstants(params);
  const k0 = params.scaleFactor;

  const etaP = (easting - params.falseEasting) / (B * k0);
  const xiP = (northing - params.falseNorthing + k0 * M0) / (B * k0);

  let xi0 = xiP;
  let eta0 = etaP;
  for (let k = 0; k < 4; k += 1) {
    const m = 2 * (k + 1);
    xi0 -= hr[k] * Math.sin(m * xiP) * Math.cosh(m * etaP);
    eta0 -= hr[k] * Math.cos(m * xiP) * Math.sinh(m * etaP);
  }

  const betaP = Math.asin(Math.sin(xi0) / Math.cosh(eta0));
  const QP = Math.asinh(Math.tan(betaP));

  // Q" = Q' + e·atanh(e·tanh Q") 를 수렴할 때까지 반복한다(문서 예제는 4회에 수렴).
  let Qpp = QP + e * Math.atanh(e * Math.tanh(QP));
  for (let i = 0; i < 20; i += 1) {
    const next = QP + e * Math.atanh(e * Math.tanh(Qpp));
    if (Math.abs(next - Qpp) < 1e-14) {
      Qpp = next;
      break;
    }
    Qpp = next;
  }

  const phi = Math.atan(Math.sinh(Qpp));
  const lambda = params.longitudeOfOrigin * DEG + Math.asin(Math.tanh(eta0) / Math.cos(betaP));
  return { lat: phi / DEG, lng: lambda / DEG };
}

/**
 * 좌표제공 API 의 entX(동향)·entY(북향) → WGS84 위경도.
 * 숫자로 읽을 수 없거나 대한민국 범위 밖이면 null — 추정값으로 채우지 않는다.
 * @param {string|number} entX
 * @param {string|number} entY
 * @returns {{lat: number, lng: number} | null}
 */
export function utmkToWgs84(entX, entY) {
  const easting = toFiniteNumber(entX);
  const northing = toFiniteNumber(entY);
  if (easting === null || northing === null) return null;
  const { lat, lng } = transverseMercatorInverse(easting, northing, UTMK);
  if (!isInKorea(lat, lng)) return null;
  return { lat, lng };
}

/** WGS84 위경도 → UTM-K 동향·북향 (검증·테스트용) */
export function wgs84ToUtmk(lat, lng) {
  return transverseMercatorForward(lat, lng, UTMK);
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}
