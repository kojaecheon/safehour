// UTM-K(GRS80) → WGS84 변환 정확도 (AX-310 · spec 6장 · 규칙 45)
//
// 규칙 45: 도로명주소 좌표 변환은 알려진 지점 3곳 이상에서 10m 이내다.
//
// 기준점과 출처
//   A. 공개된 UTM-K ↔ 위경도 쌍
//     1) 도로명주소 개발자센터(행정안전부) Tech&Tips 추천글 "proj4j를 활용한 경위도 좌표전환 방법"
//        UTM-K (945959.0381341814, 1953851.7348996028) → 경도 126.88793748501445, 위도 37.582468731587305
//        https://business.juso.go.kr/jsi/jsiTechTipsDetails?pstRfrncUnqNo=712
//     2) EPSG:5179 투영 원점 — 정의상 (E 1,000,000, N 2,000,000) = (38°N, 127°30′E)
//        https://apps.epsg.org/api/v1/CoordRefSystem/5179/export/?format=wkt&formatVersion=2
//   B. 공개된 위경도 + 독립 공식으로 만든 UTM-K
//     3) 국토지리정보원 대한민국 경위도원점: 동경 127°03′14.8913″, 북위 37°16′33.3659″
//        https://www.ngii.go.kr/kor/content.do?sq=272
//        UTM-K 값은 공개돼 있지 않아, IOGP GN7-2 의 USGS(Snyder) 정변환 공식 — 구현이 쓰는 JHS 공식과
//        독립된 공식 — 으로 이 테스트 안에서 계산한 뒤 구현의 역변환으로 되돌린다.
//   C. 공식 문서의 횡메르카토르 계산 예제 (같은 JHS 공식, 다른 매개변수)
//     4) IOGP Publication 373-7-2 (2019-09) 54–55쪽 OSGB 1936 / British National Grid 예제
//        50°30′00″N, 00°30′00″E ↔ E 577274.99, N 69740.50
//        https://www.iogp.org/wp-content/uploads/2019/09/373-07-02.pdf

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRS80,
  UTMK,
  isInKorea,
  transverseMercatorForward,
  transverseMercatorInverse,
  utmkToWgs84,
  wgs84ToUtmk,
} from '../src/adapters/utmk.js';

const RULE_45_TOLERANCE_M = 10;
const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

/** 가까운 두 점 사이 거리(m) — 수 m 단위 비교에는 평면 근사로 충분하다 */
function distanceMeters(a, b) {
  const dNorth = (a.lat - b.lat) * DEG * EARTH_RADIUS_M;
  const dEast = (a.lng - b.lng) * DEG * EARTH_RADIUS_M * Math.cos(((a.lat + b.lat) / 2) * DEG);
  return Math.hypot(dNorth, dEast);
}

function dms(deg, min, sec) {
  return deg + min / 60 + sec / 3600;
}

/**
 * IOGP GN7-2 53쪽 USGS(Snyder) 횡메르카토르 정변환. 구현(JHS/Krüger 급수)과 독립된 공식이다.
 * 중앙경선 ±4° 안에서 두 공식 차이는 3 mm 이하(같은 문서 51쪽).
 */
function usgsForward(lat, lng, p) {
  const a = p.ellipsoid.a;
  const f = 1 / p.ellipsoid.invFlattening;
  const e2 = f * (2 - f);
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const ep2 = e2 / (1 - e2);
  const meridian = (phi) =>
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));
  const phi = lat * DEG;
  const T = Math.tan(phi) ** 2;
  const C = (e2 * Math.cos(phi) ** 2) / (1 - e2);
  const A = (lng - p.longitudeOfOrigin) * DEG * Math.cos(phi);
  const nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const k0 = p.scaleFactor;
  return {
    easting:
      p.falseEasting +
      k0 * nu * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120),
    northing:
      p.falseNorthing +
      k0 *
        (meridian(phi) -
          meridian(p.latitudeOfOrigin * DEG) +
          nu *
            Math.tan(phi) *
            ((A * A) / 2 +
              ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
              ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720)),
  };
}

/** GN7-2 예제의 OSGB 1936 / British National Grid (Airy 1830, EPSG:7001 1/f = 299.3249646) */
const OSGB = Object.freeze({
  ellipsoid: { a: 6377563.396, invFlattening: 299.3249646 },
  latitudeOfOrigin: 49,
  longitudeOfOrigin: -2,
  scaleFactor: 0.9996012717,
  falseEasting: 400000,
  falseNorthing: -100000,
});

describe('UTM-K 매개변수는 EPSG:5179 와 같다', () => {
  test('GRS80 타원체와 Korea Unified Belt 변환 값', () => {
    assert.deepEqual({ ...GRS80 }, { a: 6378137, invFlattening: 298.257222101 });
    assert.equal(UTMK.latitudeOfOrigin, 38);
    assert.equal(UTMK.longitudeOfOrigin, 127.5);
    assert.equal(UTMK.scaleFactor, 0.9996);
    assert.equal(UTMK.falseEasting, 1_000_000);
    assert.equal(UTMK.falseNorthing, 2_000_000);
    assert.ok(Object.isFrozen(UTMK));
  });
});

describe('규칙 45 — 알려진 지점 3곳 이상에서 10m 이내', () => {
  const results = [];

  test('① 도로명주소 개발자센터 공식 예제 좌표', () => {
    const got = utmkToWgs84('945959.0381341814', '1953851.7348996028');
    const expected = { lat: 37.582468731587305, lng: 126.88793748501445 };
    const d = distanceMeters(got, expected);
    results.push(d);
    assert.ok(d <= RULE_45_TOLERANCE_M, `오차 ${d} m`);
    // 회귀 감지용 — 실제로는 mm 이하다
    assert.ok(d < 0.01, `오차 ${d} m`);
  });

  test('② EPSG:5179 투영 원점', () => {
    const got = utmkToWgs84(1_000_000, 2_000_000);
    const d = distanceMeters(got, { lat: 38, lng: 127.5 });
    results.push(d);
    assert.ok(d <= RULE_45_TOLERANCE_M);
    assert.ok(d < 0.001, `오차 ${d} m`);
  });

  test('③ 국토지리정보원 대한민국 경위도원점 (독립 공식으로 만든 UTM-K 에서 되돌림)', () => {
    const origin = { lat: dms(37, 16, 33.3659), lng: dms(127, 3, 14.8913) };
    const { easting, northing } = usgsForward(origin.lat, origin.lng, UTMK);
    const got = utmkToWgs84(easting, northing);
    const d = distanceMeters(got, origin);
    results.push(d);
    assert.ok(d <= RULE_45_TOLERANCE_M, `오차 ${d} m`);
    assert.ok(d < 0.01, `오차 ${d} m`);
  });

  test('3곳 모두 통과했다', () => {
    assert.equal(results.length, 3);
    assert.ok(results.every((d) => d <= RULE_45_TOLERANCE_M));
  });
});

describe('공식 계산 예제로 공식 자체를 검증한다 (IOGP GN7-2)', () => {
  test('역변환: E 577274.99, N 69740.50 → 50°30′00″N, 00°30′00″E (0.001″ 이내)', () => {
    const got = transverseMercatorInverse(577274.99, 69740.5, OSGB);
    assert.ok(Math.abs(got.lat - 50.5) * 3600 < 0.001, `위도 오차 ${(got.lat - 50.5) * 3600}″`);
    assert.ok(Math.abs(got.lng - 0.5) * 3600 < 0.001, `경도 오차 ${(got.lng - 0.5) * 3600}″`);
  });

  test('정변환: 50°30′00″N, 00°30′00″E → E 577274.99, N 69740.50 (문서 표기 자릿수 안에서 2 cm 이내)', () => {
    const got = transverseMercatorForward(50.5, 0.5, OSGB);
    assert.ok(Math.abs(got.easting - 577274.99) < 0.02, `E ${got.easting}`);
    assert.ok(Math.abs(got.northing - 69740.5) < 0.02, `N ${got.northing}`);
  });

  test('USGS 공식과 JHS 공식이 문서 예제에서 같은 값을 낸다', () => {
    const jhs = transverseMercatorForward(50.5, 0.5, OSGB);
    const usgs = usgsForward(50.5, 0.5, OSGB);
    assert.ok(Math.abs(jhs.easting - usgs.easting) < 0.003);
    assert.ok(Math.abs(jhs.northing - usgs.northing) < 0.003);
  });
});

describe('대한민국 전역에서 독립 공식과 1 m 안에서 맞는다', () => {
  // 국토 끝 지점 근처(대략값). 중앙경선에서 가장 먼 곳은 동·서 끝이다.
  const EDGE_POINTS = [
    { name: '남단(마라도 부근)', lat: 33.1144, lng: 126.2677 },
    { name: '동단(독도 부근)', lat: 37.2411, lng: 131.8647 },
    { name: '서단(백령도 부근)', lat: 37.9669, lng: 124.6308 },
    { name: '북단(고성 부근)', lat: 38.6128, lng: 128.3572 },
    { name: '서울 도심', lat: 37.5665, lng: 126.978 },
    { name: '부산 도심', lat: 35.1796, lng: 129.0756 },
  ];

  for (const point of EDGE_POINTS) {
    test(point.name, () => {
      const { easting, northing } = usgsForward(point.lat, point.lng, UTMK);
      const got = utmkToWgs84(easting, northing);
      assert.ok(got, '대한민국 범위 안이어야 한다');
      const d = distanceMeters(got, point);
      assert.ok(d < 1, `오차 ${d} m`);
    });
  }

  test('정변환 → 역변환 왕복이 mm 이하로 닫힌다', () => {
    for (const point of EDGE_POINTS) {
      const { easting, northing } = wgs84ToUtmk(point.lat, point.lng);
      const back = utmkToWgs84(easting, northing);
      assert.ok(distanceMeters(back, point) < 0.001);
    }
  });
});

describe('추정값으로 채우지 않는다', () => {
  test('숫자가 아니거나 비어 있으면 null', () => {
    assert.equal(utmkToWgs84('', '1953851'), null);
    assert.equal(utmkToWgs84('abc', '1953851'), null);
    assert.equal(utmkToWgs84(undefined, undefined), null);
    assert.equal(utmkToWgs84('945959', null), null);
    assert.equal(utmkToWgs84(Number.NaN, 2_000_000), null);
  });

  test('대한민국 범위 밖이면 null', () => {
    // 동향·북향을 바꿔 넣은 경우(축 순서 실수)도 범위 밖이 된다
    assert.equal(utmkToWgs84('1953851.7348996028', '945959.0381341814'), null);
    assert.equal(utmkToWgs84(0, 0), null);
  });

  test('대한민국 범위 판정', () => {
    assert.equal(isInKorea(37.5, 127), true);
    assert.equal(isInKorea(33, 127), false);
    assert.equal(isInKorea(37.5, 132), false);
    assert.equal(isInKorea(Number.NaN, 127), false);
  });
});
