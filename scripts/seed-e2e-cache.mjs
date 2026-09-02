// E2E 용 TourAPI 캐시 시드
//
// E2E 는 외부 API 에 의존하면 안 된다 — 호출 한도를 태우고, 네트워크 상태에 따라
// 결과가 달라지며, 실패 원인이 우리 코드인지 공급자인지 구분되지 않는다.
// 그래서 실제 호출 경로(callTourApi)를 그대로 쓰되 캐시를 미리 심어 외부로 나가지
// 않게 한다. 판정 엔진·정규화·API 라우트는 모두 실제 코드가 실행된다.

import fs from 'node:fs';
import path from 'node:path';
import { tourApiCachePath } from '../src/tour-api/client.js';
import { TOUR_API_PATHS } from '../src/tour-api/config.js';

/** E2E 고정 기준점 — /plan 의 강남 프리셋과 같아야 캐시가 적중한다 */
export const E2E_ORIGIN = { lat: 37.5105, lng: 127.059 };
const RADIUS_METERS = 3000;
const NUM_OF_ROWS = 100;

/** 결정적 후보 — 실내/실외, 영문 유무, 보행시간을 판정이 갈리도록 배치했다 */
const KOREAN_ITEMS = [
  {
    contentid: '900001',
    title: '이순위 실내 전시관',
    addr1: '서울특별시 강남구 테스트로 1',
    mapx: '127.0600',
    mapy: '37.5115',
    contenttypeid: '14',
    cat1: 'A02',
    cat2: 'A0206',
    cat3: 'A02060100',
    modifiedtime: '20260801120000',
    firstimage: 'https://example.test/indoor-1.jpg',
    cpyrhtDivCd: 'Type1',
  },
  {
    contentid: '900002',
    title: '일순위 실내 미술관',
    addr1: '서울특별시 강남구 테스트로 2',
    mapx: '127.0595',
    mapy: '37.5110',
    contenttypeid: '14',
    cat1: 'A02',
    cat2: 'A0206',
    cat3: 'A02060100',
    modifiedtime: '20260801120000',
    firstimage: 'https://example.test/indoor-2.jpg',
    cpyrhtDivCd: 'Type1',
  },
  {
    contentid: '900003',
    title: '삼순위 실내 박물관',
    addr1: '서울특별시 강남구 테스트로 3',
    mapx: '127.0610',
    mapy: '37.5120',
    contenttypeid: '14',
    cat1: 'A02',
    cat2: 'A0206',
    cat3: 'A02060100',
    modifiedtime: '20260801120000',
    cpyrhtDivCd: 'Type3',
  },
  {
    contentid: '900004',
    title: '대체 후보 실내 공연장',
    addr1: '서울특별시 강남구 테스트로 4',
    mapx: '127.0615',
    mapy: '37.5125',
    contenttypeid: '14',
    cat1: 'A02',
    cat2: 'A0208',
    cat3: 'A02080400',
    modifiedtime: '20260801120000',
    cpyrhtDivCd: 'Type3',
  },
  {
    contentid: '900005',
    title: '먼 실내 시설',
    addr1: '서울특별시 강남구 테스트로 5',
    mapx: '127.0900',
    mapy: '37.5300',
    contenttypeid: '14',
    cat1: 'A02',
    cat2: 'A0206',
    cat3: 'A02060100',
    modifiedtime: '20260801120000',
  },
];

/** 영문은 일부만 매칭시켜 국문 폴백·번역 필요 배지가 둘 다 나오게 한다 */
const ENGLISH_ITEMS = [
  {
    contentid: '910002',
    title: 'First Indoor Art Museum',
    addr1: '2 Test-ro, Gangnam-gu, Seoul',
    mapx: '127.0595',
    mapy: '37.5110',
    contenttypeid: '76',
    modifiedtime: '20260801120000',
  },
];

function tourBody(items) {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        items: { item: items },
        numOfRows: items.length,
        pageNo: 1,
        totalCount: items.length,
      },
    },
  };
}

function locationParams() {
  return {
    mapX: String(E2E_ORIGIN.lng),
    mapY: String(E2E_ORIGIN.lat),
    radius: String(RADIUS_METERS),
    arrange: 'E',
    numOfRows: String(NUM_OF_ROWS),
    pageNo: '1',
  };
}

function writeCache(serviceName, operation, parameters, items) {
  const file = tourApiCachePath(serviceName, operation, parameters);
  const payload = {
    serviceName,
    operation,
    parameters,
    payload: tourBody(items),
    meta: { fetchedAt: new Date().toISOString(), elapsedMs: 0, fromCache: false },
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

/**
 * 추천 경로가 후보 상위 몇 건에 대해 운영·휴무를 조회한다(`detailIntro2`).
 * 캐시에 심지 않으면 E2E 가 외부로 나가므로 전부 심는다.
 *
 * 값은 **닫히지 않는 형태**로 둔다 — 이 시드의 목적은 외부 호출을 막는 것이지
 * 휴무 판정을 시연하는 것이 아니다. 휴무 판정 자체는 단위 테스트가 덮는다.
 */
function seedSchedules(written) {
  for (const item of KOREAN_ITEMS) {
    written.push(
      writeCache(
        'korean',
        'detailIntro2',
        {
          contentId: String(item.contentid),
          contentTypeId: String(item.contenttypeid ?? ''),
          numOfRows: '10',
          pageNo: '1',
        },
        [
          {
            contentid: item.contentid,
            contenttypeid: item.contenttypeid,
            usetime: '09:00~18:00',
            restdate: '연중무휴',
          },
        ],
      ),
    );
  }
}

export function seedE2eCache() {
  const params = locationParams();
  const written = [
    writeCache('korean', 'locationBasedList2', params, KOREAN_ITEMS),
    writeCache('english', 'locationBasedList2', params, ENGLISH_ITEMS),
    // 무장애 목록은 비워 detailWithTour2 후속 호출까지 막는다
    writeCache('barrierFree', 'locationBasedList2', params, []),
  ];
  seedSchedules(written);
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = seedE2eCache();
  console.log(`E2E 캐시 ${files.length}건을 심었습니다.`);
  console.log(`  위치: ${TOUR_API_PATHS.cache}`);
}
