// 행정안전부 도로명주소 검색 API · 좌표제공 API 가짜 응답 (AX-310)
//
// 실제 API 를 부르지 않는다. 모양은 공식 개발자센터 문서의 출력 항목과 JSON 예제 코드
// (`jsonStr.results.common.errorCode`, `jsonStr.results.juso`)를 따른다.
//   검색 API: https://business.juso.go.kr/jst/jstRoadNmAddrApiSearch
//   좌표 API: https://business.juso.go.kr/jst/jstCoordApiSearch
//
// 주소 값은 지어낸 것이다(가상구·예시로). 실존 업소·개인정보를 담지 않는다.
// 좌표 값만 공식 예제에서 가져왔다:
//   - 945959.0381341814, 1953851.7348996028 → 경도 126.88793748501445, 위도 37.582468731587305
//     (도로명주소 개발자센터 Tech&Tips, https://business.juso.go.kr/jsi/jsiTechTipsDetails?pstRfrncUnqNo=712)
//   - 1000000, 2000000 → 위도 38°, 경도 127.5° (EPSG:5179 투영 원점, EPSG 레지스트리)

export const FAKE_SEARCH_KEY = 'fake-search-key-7f3a9c';
export const FAKE_COORD_KEY = 'fake-coord-key-b41e22';

function jusoItem(overrides) {
  return {
    roadAddr: '서울특별시 가상구 예시로 10 (예시동)',
    roadAddrPart1: '서울특별시 가상구 예시로 10',
    roadAddrPart2: ' (예시동)',
    jibunAddr: '서울특별시 가상구 예시동 100-1',
    engAddr: '10 Yesi-ro, Gasang-gu, Seoul',
    zipNo: '00000',
    admCd: '1100000001',
    rnMgtSn: '110000000001',
    bdMgtSn: '1100000001100010000000001',
    detBdNmList: '',
    bdNm: '예시빌딩',
    bdKdcd: '0',
    siNm: '서울특별시',
    sggNm: '가상구',
    emdNm: '예시동',
    liNm: '',
    rn: '예시로',
    udrtYn: '0',
    buldMnnm: '10',
    buldSlno: '0',
    mtYn: '0',
    lnbrMnnm: '100',
    lnbrSlno: '1',
    emdNo: '01',
    ...overrides,
  };
}

/** 검색 결과 3건. 두 번째는 건물명·지번이 비어 있다. 세 번째는 좌표가 없다. */
export const SEARCH_ITEMS = [
  jusoItem({}),
  jusoItem({
    roadAddr: '서울특별시 가상구 예시로 20',
    roadAddrPart1: '서울특별시 가상구 예시로 20',
    roadAddrPart2: '',
    jibunAddr: '',
    bdNm: '',
    rnMgtSn: '110000000002',
    buldMnnm: 20,
    buldSlno: 0,
  }),
  jusoItem({
    roadAddr: '서울특별시 가상구 예시로 30 (예시동)',
    roadAddrPart1: '서울특별시 가상구 예시로 30',
    rnMgtSn: '110000000003',
    buldMnnm: '30',
    buldSlno: '2',
    bdNm: '좌표없는동',
  }),
];

export function searchResponse(items = SEARCH_ITEMS, { errorCode = '0', errorMessage = '정상' } = {}) {
  return {
    results: {
      common: {
        errorMessage,
        countPerPage: '10',
        totalCount: String(items?.length ?? 0),
        errorCode,
        currentPage: '1',
      },
      juso: items,
    },
  };
}

/** 좌표 API 응답. entX=동향, entY=북향 (UTM-K) */
export function coordResponse(item, { entX, entY } = {}, { errorCode = '0', errorMessage = '정상' } = {}) {
  const juso =
    entX === undefined
      ? []
      : [
          {
            admCd: item.admCd,
            rnMgtSn: item.rnMgtSn,
            bdMgtSn: item.bdMgtSn,
            udrtYn: item.udrtYn,
            buldMnnm: String(item.buldMnnm),
            buldSlno: String(item.buldSlno),
            entX: String(entX),
            entY: String(entY),
            bdNm: item.bdNm,
          },
        ];
  return {
    results: {
      common: { errorMessage, totalCount: String(juso.length), errorCode },
      juso,
    },
  };
}

/** rnMgtSn 별 좌표 — 세 번째 건물은 좌표 없음 */
export const COORDS_BY_ROAD = {
  '110000000001': { entX: '945959.0381341814', entY: '1953851.7348996028' },
  '110000000002': { entX: '1000000', entY: '2000000' },
};

export const EXPECTED_FIRST = { lat: 37.582468731587305, lng: 126.88793748501445 };
