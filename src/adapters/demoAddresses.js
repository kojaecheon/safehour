// 데모 주소 — 도로명주소 키가 없고 데모 로그인 모드일 때만 쓴다 (AX-310 · spec 6장)
//
// 원칙
//   - 데모를 실제처럼 보이게 하지 않는다(spec 9.1). 이름과 주소 칸 모두 '데모'로 시작하고 source 는 "DEMO" 다.
//   - 실존 업소·병원 이름을 쓰지 않는다. 주소는 동네 수준의 설명이고 특정 건물을 가리키지 않는다.
//   - 좌표는 동네 중심 부근의 대략값(소수 넷째 자리)이다. 판정 흐름을 시연하기 위한 고정값일 뿐이다.
//   - 병원 목록을 보여주지 않는다(spec 4.3). 사용자가 입력한 검색어에 맞는 항목만 돌려준다.

import { ADDRESS_RESULT_LIMIT } from './juso.js';

const DEMO_TAGS = ['데모', 'demo', '서울', 'seoul'];

const DEMO_ENTRIES = [
  {
    address: {
      roadAddress: '데모 주소 · 서울 강남구 강남역 인근',
      buildingName: '데모 숙소 (강남역 인근)',
      lat: 37.4979,
      lng: 127.0276,
    },
    tags: ['강남', '강남역', 'gangnam', '숙소', 'lodging', 'hotel', '호텔'],
  },
  {
    address: {
      roadAddress: '데모 주소 · 서울 중구 명동 인근',
      buildingName: '데모 숙소 (명동 인근)',
      lat: 37.5609,
      lng: 126.986,
    },
    tags: ['명동', 'myeongdong', '중구', '숙소', 'lodging', 'hotel', '호텔'],
  },
  {
    address: {
      roadAddress: '데모 주소 · 서울 마포구 홍대입구역 인근',
      buildingName: '데모 숙소 (홍대입구역 인근)',
      lat: 37.5572,
      lng: 126.9245,
    },
    tags: ['홍대', '홍대입구', '홍대입구역', 'hongdae', '마포', '마포구', '숙소', 'lodging', 'hotel', '호텔'],
  },
  {
    address: {
      roadAddress: '데모 주소 · 서울 강남구 신사동 일대',
      buildingName: '데모 의원 (신사동)',
      lat: 37.5163,
      lng: 127.0203,
    },
    tags: ['신사', '신사동', 'sinsa', '강남', '강남구', '의원', 'clinic'],
  },
  {
    address: {
      roadAddress: '데모 주소 · 서울 강남구 압구정동 일대',
      buildingName: '데모 의원 (압구정동)',
      lat: 37.5271,
      lng: 127.0286,
    },
    tags: ['압구정', '압구정동', 'apgujeong', '강남', '강남구', '의원', 'clinic'],
  },
];

/** 비교용 정규화 — 대소문자·공백·구두점 차이를 없앤다 */
function fold(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function matches(entry, keyword) {
  const haystack = [entry.address.buildingName, entry.address.roadAddress, ...entry.tags, ...DEMO_TAGS].map(fold);
  const whole = fold(keyword);
  const tokens = keyword
    .split(/\s+/)
    .map(fold)
    .filter((t) => Array.from(t).length >= 2);
  const candidates = whole ? [whole, ...tokens] : tokens;
  // 느슨한 일치: 검색어(또는 그 낱말)가 항목 글자에 들어 있거나, 항목 태그가 검색어에 들어 있으면 맞다
  return candidates.some((needle) => haystack.some((hay) => hay.includes(needle) || (hay.length >= 2 && needle.includes(hay))));
}

/**
 * 검색어에 느슨하게 맞는 데모 주소(최대 10건). 맞는 것이 없으면 빈 목록이다.
 * @param {string} keyword  `normalizeAddressKeyword` 를 통과한 검색어
 * @returns {Array<{roadAddress: string, buildingName: string, lat: number, lng: number, source: 'DEMO'}>}
 */
export function searchDemoAddresses(keyword) {
  return DEMO_ENTRIES.filter((entry) => matches(entry, keyword))
    .slice(0, ADDRESS_RESULT_LIMIT)
    .map((entry) => ({ ...entry.address, source: 'DEMO' }));
}
