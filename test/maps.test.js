// 지도 길찾기 링크 — 목적지 전용 (AX-318 · spec 4.14 · 규칙 39 · ADR-0010)
//
// 이 파일이 고정하는 것
//   - 링크에는 목적지 장소의 이름과 좌표만 있다. 출발지 매개변수가 없다.
//   - 숙소·병원 객체(주소 객체·체크인·전화·연결 지침)는 받지 않는다 — 좌표가 지도 사업자로 가지 않는다.
//   - 정거장(Stop)을 통째로 넘겨도 제목·좌표 밖의 필드(주소·한국어 원문·id·조건)는 링크에 실리지 않는다.
//   - URL 모양은 공식 문서의 형식 그대로다(Google Maps URLs `dir` 동작, 카카오맵 `/link/to/`).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildMapLinks, MAP_LINK_BASE } from '../lib/maps.js';

/** 가상의 정거장 — 실제 장소를 가리키지 않는다 */
function stop(overrides = {}) {
  return {
    id: '2026-10-04:P:900001',
    candidateId: 'cand-900001',
    contentId: '900001',
    title: 'Test Palace',
    address: '1 Test-ro, Jongno-gu, Seoul',
    lang: 'en',
    category: 'SPOT',
    isMeal: false,
    lat: 37.5796123456,
    lng: 126.9770987654,
    ko: { title: '테스트궁', address: '서울특별시 종로구 테스트로 1' },
    sourceIds: { ko: '900001', en: '900002' },
    contentTypeIds: { canonical: '12' },
    arriveAt: '10:30',
    leaveAt: '11:30',
    stayMin: 60,
    labels: [],
    ...overrides,
  };
}

/** 가상의 숙소 구간 (spec 5.1 LodgingSegment) */
const LODGING = Object.freeze({
  id: 'L1',
  name: '테스트 숙소',
  address: { roadAddress: '서울특별시 중구 테스트로 9', lat: 37.561, lng: 126.982, source: 'DEMO' },
  checkIn: '2026-10-01',
  checkOut: '2026-10-05',
});

/** 가상의 병원 (spec 5.1 Hospital) */
const HOSPITAL = Object.freeze({
  id: 'H1',
  name: '테스트 병원',
  address: { roadAddress: '서울특별시 강남구 테스트로 3', lat: 37.52, lng: 127.02, source: 'DEMO' },
  phone: '02-0000-0000',
});

const ORIGIN_PARAMS = ['origin', 'origin_place_id', 'saddr', 'from', 'sp', 'waypoints', 'travelmode', 'dir_action'];

describe('규칙 39 — 지도 링크는 목적지 이름·좌표만', () => {
  test('구글: Maps URLs dir 동작 + api=1 + destination(좌표)만 있다', () => {
    const { google } = buildMapLinks(stop());
    const url = new URL(google);
    assert.equal(url.origin, 'https://www.google.com');
    assert.equal(url.pathname, '/maps/dir/');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['api', 'destination']);
    assert.equal(url.searchParams.get('api'), '1');
    assert.equal(url.searchParams.get('destination'), '37.579612,126.977099');
    // 공식 문서의 인코딩 — 쉼표는 %2C
    assert.ok(google.includes('destination=37.579612%2C126.977099'), google);
  });

  test('카카오: /link/to/이름,위도,경도 — 출발지(/from/) 경로가 없다', () => {
    const { kakao } = buildMapLinks(stop());
    const url = new URL(kakao);
    assert.equal(url.origin, 'https://map.kakao.com');
    assert.ok(url.pathname.startsWith('/link/to/'), url.pathname);
    assert.ok(!url.pathname.includes('/from/'), url.pathname);
    assert.ok(!url.pathname.includes('/by/'), url.pathname);
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    const [name, lat, lng, ...rest] = decodeURIComponent(url.pathname.slice('/link/to/'.length)).split(',');
    assert.deepEqual({ name, lat, lng, rest }, { name: 'Test Palace', lat: '37.579612', lng: '126.977099', rest: [] });
  });

  test('출발지 매개변수가 어느 링크에도 없다 — 입력에 출발지가 섞여 와도 버린다', () => {
    const links = buildMapLinks(
      stop({
        origin: { lat: 37.561, lng: 126.982 },
        from: 'hotel',
        saddr: '37.561,126.982',
        waypoints: '37.52,127.02',
      }),
    );
    for (const href of Object.values(links)) {
      const url = new URL(href);
      for (const param of ORIGIN_PARAMS) assert.equal(url.searchParams.has(param), false, `${param} in ${href}`);
      assert.ok(!href.includes('/from/'), href);
      assert.ok(!href.includes('37.561'), href);
      assert.ok(!href.includes('126.982'), href);
      assert.ok(!href.includes('hotel'), href);
    }
  });

  test('정거장을 통째로 넘겨도 제목·좌표 밖의 값은 링크에 없다', () => {
    const s = stop();
    const links = buildMapLinks(s);
    const leaks = [s.id, s.candidateId, s.contentId, s.address, s.ko.title, s.ko.address, s.arriveAt, '900002'];
    for (const href of Object.values(links)) {
      const decoded = decodeURIComponent(href);
      for (const value of leaks) assert.ok(!decoded.includes(value), `${value} 가 ${href} 에 있다`);
    }
  });

  test('결과는 google·kakao 두 링크만 담은 얼린 객체다', () => {
    const links = buildMapLinks(stop());
    assert.deepEqual(Object.keys(links).sort(), ['google', 'kakao']);
    assert.ok(Object.isFrozen(links));
    assert.ok(links.google.startsWith(MAP_LINK_BASE.google));
    assert.ok(links.kakao.startsWith(MAP_LINK_BASE.kakao));
  });
});

describe('규칙 39 — 숙소·병원 좌표는 어떤 지도 링크에도 넣지 않는다', () => {
  test('숙소 구간을 넘기면 링크를 만들지 않는다', () => {
    assert.equal(buildMapLinks(LODGING), null);
  });

  test('병원을 넘기면 링크를 만들지 않는다', () => {
    assert.equal(buildMapLinks(HOSPITAL), null);
  });

  test('주소 객체(Address)를 넘기면 링크를 만들지 않는다', () => {
    assert.equal(buildMapLinks(LODGING.address), null);
    assert.equal(buildMapLinks({ title: 'x', ...HOSPITAL.address }), null);
  });

  test('숙소·병원을 정거장 모양으로 흉내 내도 표지(체크인·전화·연결 지침·주소 객체)가 있으면 거부한다', () => {
    const disguised = [
      { title: LODGING.name, lat: 37.561, lng: 126.982, checkIn: '2026-10-01' },
      { title: LODGING.name, lat: 37.561, lng: 126.982, checkOut: '2026-10-05' },
      { title: HOSPITAL.name, lat: 37.52, lng: 127.02, phone: HOSPITAL.phone },
      { title: HOSPITAL.name, lat: 37.52, lng: 127.02, linkedPlanId: 'plan-1' },
      { title: HOSPITAL.name, lat: 37.52, lng: 127.02, hospitalId: 'H1' },
      { title: HOSPITAL.name, lat: 37.52, lng: 127.02, address: HOSPITAL.address },
      { title: LODGING.name, lat: 37.561, lng: 126.982, roadAddress: LODGING.address.roadAddress },
      { title: LODGING.name, lat: 37.561, lng: 126.982, jibunAddress: '테스트동 1' },
    ];
    for (const place of disguised) assert.equal(buildMapLinks(place), null, JSON.stringify(place));
  });

  test("이름 필드가 `name` 인 객체(숙소·병원 모양)는 받지 않는다 — 정거장은 `title` 을 쓴다", () => {
    assert.equal(buildMapLinks({ name: 'Test Palace', lat: 37.57, lng: 126.97 }), null);
  });
});

describe('입력 검사', () => {
  test('좌표가 유한한 숫자가 아니거나 범위를 벗어나면 null', () => {
    for (const [lat, lng] of [
      [Number.NaN, 126.97],
      [37.57, Number.POSITIVE_INFINITY],
      ['37.57', '126.97'],
      [null, 126.97],
      [undefined, undefined],
      [91, 126.97],
      [37.57, -181],
    ]) {
      assert.equal(buildMapLinks(stop({ lat, lng })), null, `${lat},${lng}`);
    }
  });

  test('제목이 비었거나 문자열이 아니면 null', () => {
    for (const title of ['', '   ', null, undefined, 42]) {
      assert.equal(buildMapLinks(stop({ title })), null, String(title));
    }
  });

  test('객체가 아니면 null', () => {
    for (const value of [null, undefined, 'Test Palace', 42, [stop()]]) {
      assert.equal(buildMapLinks(value), null, String(value));
    }
  });

  test('카카오 이름의 쉼표·빗금은 좌표 구분을 깨지 않는다', () => {
    const { kakao } = buildMapLinks(stop({ title: 'Cafe, Bar / Grill #1?' }));
    const path = new URL(kakao).pathname.slice('/link/to/'.length);
    assert.ok(!path.includes('/'), path);
    const parts = decodeURIComponent(path).split(',');
    assert.equal(parts.length, 3, parts.join(' | '));
    assert.equal(parts[1], '37.579612');
    assert.equal(parts[2], '126.977099');
    assert.ok(!kakao.includes('#'), kakao);
    assert.ok(!kakao.includes('?'), kakao);
  });

  test('한국어 이름은 인코딩되어 들어간다', () => {
    const { kakao } = buildMapLinks(stop({ title: '테스트궁' }));
    assert.ok(kakao.startsWith('https://map.kakao.com/link/to/%ED%85%8C'), kakao);
    assert.ok(decodeURIComponent(kakao).endsWith('/link/to/테스트궁,37.579612,126.977099'), kakao);
  });

  test('제목 앞뒤 공백과 연속 공백을 정리하고 80자로 자른다', () => {
    const { kakao } = buildMapLinks(stop({ title: `  A   B  ${'x'.repeat(200)}` }));
    const name = decodeURIComponent(new URL(kakao).pathname.slice('/link/to/'.length)).split(',')[0];
    assert.ok(name.startsWith('A B x'), name);
    assert.ok(name.length <= 80, String(name.length));
  });

  test('같은 입력이면 같은 링크다', () => {
    assert.deepEqual(buildMapLinks(stop()), buildMapLinks(stop()));
  });
});
