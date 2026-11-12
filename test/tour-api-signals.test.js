// AX-305: 관광 후보 분류 신호 (docs/business-rules.md '장소 후보와 필터'의 분류 부분, docs/platform/ITINERARY_RULES.md '단서 목록 (`src/tour-api/cues.js`)',
// 테스트 이름의 규칙 21, 22, 25 는 옛 설계서 번호다)
//
// 계약:
//   - 판정(제외)은 엔진(T6a)이 한다. 이 모듈은 **신호**만 만든다.
//   - 신호는 SafeHour 추정값이다. 관광공사 원문 필드(sourceMetadata)와 섞지 않고 `signals` 에 둔다.
//   - 매운 음식·날음식은 3상태다: 단서 있음 true / '아님' 근거 있음 false / 판단 불가 null.
//     엔진은 null 을 MENU_UNKNOWN 으로 제외한다(docs/business-rules.md '장소 후보와 필터').
//   - 열·물은 단서가 없으면 노출이 없는 것으로 본다(docs/business-rules.md '장소 후보와 필터'): boolean.
//   - 신호는 언어와 무관해야 한다(docs/business-rules.md '장소 후보와 필터'·'전체 일정 확정과 변화 대응', 테스트 이름의 규칙 27 은 옛 설계서 번호다): 국문 제목·유형·분류·국문 메뉴만 쓴다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BAR_CUES,
  CAFE_CUES,
  HEAT_CUES,
  INTEREST_TAGS,
  RAW_CUES,
  SPICY_CUES,
  WATER_CUES,
} from '../src/tour-api/cues.js';
import { deriveSignals } from '../src/tour-api/signals.js';
import { INTERESTS } from '../src/stay/stay.js';
import { normalizeTourCandidate, applyIntro } from '../src/tour-api/mapper.js';
import { canonicalContentType } from '../src/tour-api/content-types.js';

const NOW = new Date('2026-08-17T01:00:00Z');

const food = (title, classification = {}, menu) =>
  deriveSignals({ title, contentTypeId: '39', classification, menu });
const spot = (title, classification = {}, contentTypeId = '12') =>
  deriveSignals({ title, contentTypeId, classification });

describe('단서 목록은 관광 후보 모듈의 상수 한곳에 있다 (spec 11장)', () => {
  test('열·물·매운·날음식·주점·카페 단서와 관심사 태그가 모두 내보내진다', () => {
    for (const cues of [HEAT_CUES, WATER_CUES, SPICY_CUES, RAW_CUES, BAR_CUES, CAFE_CUES]) {
      assert.ok(Object.isFrozen(cues), '단서 목록은 고정 상수여야 한다');
    }
    assert.deepEqual(INTEREST_TAGS, [
      'SHOPPING',
      'KBEAUTY',
      'PALACE_HISTORY',
      'CAFE',
      'EXHIBITION',
      'FOOD',
      'NATURE',
      'FESTIVAL',
    ]);
  });

  // 두 목록은 서로를 모르고 각자 같은 여덟 개를 적고 있다. 갈라져도 오류가 나지 않는다 —
  // 체류에서 받아들여지지만 후보에는 아무것도 맞지 않는 태그, 또는 그 반대가 생길 뿐이다.
  test('관심사 태그 집합은 체류 도메인의 INTERESTS 와 같다 (spec 4.8)', () => {
    assert.deepEqual([...INTEREST_TAGS], [...INTERESTS], '순서까지 같아야 한다 — 태그는 이 순서로 붙는다');
  });
});

describe('열 노출 단서 (규칙 25 — avoidHeat)', () => {
  test('찜질·사우나·스파·온천·한증 이름 단서가 있으면 true', () => {
    for (const title of ['드래곤힐스파', '강남 찜질방', '테스트 사우나', '온천랜드', '황토 한증막']) {
      assert.equal(spot(title).heatExposure, true, title);
    }
  });

  test('분류체계 찜질방·온천/사우나/스파 코드만으로도 true', () => {
    const s = spot('이름에 단서 없음', { lclsSystm1: 'EX', lclsSystm2: 'EX05', lclsSystm3: 'EX050200' });
    assert.equal(s.heatExposure, true);
    assert.deepEqual(s.evidence.heatExposure, [{ field: 'lclsSystm3', cue: 'EX050200' }]);
  });

  test('단서가 없으면 노출 없음(false) — null 이 아니다', () => {
    assert.equal(spot('테스트 미술관', {}, '14').heatExposure, false);
  });

  test('스파게티·스파오 같은 비슷한 말은 단서가 아니다', () => {
    assert.equal(food('스파게티 하우스', { lclsSystm2: 'FD02' }).heatExposure, false);
    assert.equal(spot('스파오 명동점', {}, '38').heatExposure, false);
  });
});

describe('물 단서 (규칙 25 — avoidWater)', () => {
  test('수영장·워터파크·온천·수상레저 단서가 있으면 true', () => {
    for (const title of ['테스트 수영장', '캐리비안 워터파크', '온천랜드', '한강 수상레저']) {
      assert.equal(spot(title).waterActivity, true, title);
    }
  });

  test('수상레저스포츠·워터파크 분류 코드만으로도 true', () => {
    assert.equal(spot('이름 단서 없음', { lclsSystm2: 'LS02', lclsSystm3: 'LS020200' }, '28').waterActivity, true);
    assert.equal(spot('이름 단서 없음', { lclsSystm2: 'VE02', lclsSystm3: 'VE020200' }).waterActivity, true);
  });

  test('단서가 없으면 false', () => {
    assert.equal(spot('테스트 박물관', {}, '14').waterActivity, false);
  });
});

describe('주점 유형 (규칙 21 — diet.alcohol)', () => {
  test('분류체계 FD04(주점)이면 true', () => {
    assert.equal(food('테스트 가게', { lclsSystm1: 'FD', lclsSystm2: 'FD04', lclsSystm3: 'FD040100' }).isBar, true);
  });

  test('주점이 아닌 음식 분류가 확인되면 false', () => {
    assert.equal(food('테스트 한식당', { lclsSystm1: 'FD', lclsSystm2: 'FD01', lclsSystm3: 'FD010100' }).isBar, false);
  });

  test('분류가 없으면 이름 단서로만 true, 그마저 없으면 null', () => {
    assert.equal(food('테스트 이자카야').isBar, true);
    assert.equal(food('테스트 식당').isBar, null);
  });

  test('음식점이 아니면 false (유형이 확인됨)', () => {
    assert.equal(spot('테스트 박물관', {}, '14').isBar, false);
  });
});

describe('카페·전통찻집 유형 (규칙 22)', () => {
  test('분류체계 FD05(카페/찻집)이면 true', () => {
    assert.equal(food('테스트', { lclsSystm2: 'FD05', lclsSystm3: 'FD050200' }).isCafe, true);
  });

  test('이름에 카페가 있어도 분류가 없으면 확정하지 않는다(null) — 식이 필터를 느슨하게 만들지 않는다', () => {
    assert.equal(food('카페 테스트').isCafe, null);
  });

  test('다른 음식 분류면 false', () => {
    assert.equal(food('테스트', { lclsSystm2: 'FD02' }).isCafe, false);
  });
});

describe('매운 음식·날음식 3상태 (규칙 22)', () => {
  test('메뉴·이름 단서가 없고 메뉴 정보도 없으면 null (엔진이 MENU_UNKNOWN 으로 제외)', () => {
    const s = food('테스트 식당', { lclsSystm2: 'FD01' });
    assert.equal(s.spicy, null);
    assert.equal(s.raw, null);
    assert.equal(s.hasMenuInfo, null);
  });

  test('카페 유형은 매운 음식·날음식 아님(false) 근거다', () => {
    const s = food('테스트 카페', { lclsSystm2: 'FD05', lclsSystm3: 'FD050100' });
    assert.equal(s.spicy, false);
    assert.equal(s.raw, false);
  });

  test('이름 단서가 있으면 true', () => {
    assert.equal(food('테스트 마라탕', { lclsSystm2: 'FD02' }).spicy, true);
    assert.equal(food('테스트 떡볶이').spicy, true);
    assert.equal(food('스시 테스트').raw, true);
    assert.equal(food('테스트 횟집').raw, true);
  });

  test('대표·취급 메뉴에 단서가 있으면 true, 근거 필드를 남긴다', () => {
    const s = food('테스트 식당', { lclsSystm2: 'FD01' }, { firstmenu: '김치찌개', treatmenu: '육회, 된장찌개' });
    assert.equal(s.spicy, true);
    assert.equal(s.raw, true);
    assert.deepEqual(s.evidence.spicy, [{ field: 'firstmenu', cue: '김치' }]);
    assert.deepEqual(s.evidence.raw, [{ field: 'treatmenu', cue: '육회' }]);
  });

  test('메뉴 정보가 있고 단서가 없으면 false', () => {
    const s = food('테스트 식당', { lclsSystm2: 'FD01' }, { firstmenu: '갈비탕', treatmenu: '설렁탕' });
    assert.equal(s.hasMenuInfo, true);
    assert.equal(s.spicy, false);
    assert.equal(s.raw, false);
  });

  test('메뉴를 조회했지만 비어 있으면 hasMenuInfo=false, 판단은 여전히 null', () => {
    const s = food('테스트 식당', { lclsSystm2: 'FD01' }, {});
    assert.equal(s.hasMenuInfo, false);
    assert.equal(s.spicy, null);
  });

  test('회관·사회처럼 "회"가 들어간 다른 말은 날음식 단서가 아니다', () => {
    const s = food('테스트회관', { lclsSystm2: 'FD01' }, { firstmenu: '불고기 정식' });
    assert.equal(s.raw, false);
    assert.equal(food('테스트 식당', {}, { treatmenu: '회, 매운탕' }).raw, true);
    assert.equal(food('테스트 식당', {}, { treatmenu: '모듬회' }).raw, true);
  });

  test('카페라도 단서가 있으면 true 가 이긴다(보수적 방향)', () => {
    assert.equal(food('테스트', { lclsSystm2: 'FD05' }, { firstmenu: '떡볶이' }).spicy, true);
  });

  test('음식점이 아니면 식이 신호는 적용 대상이 아니다(null) — isFoodPlace 로 구분한다', () => {
    const s = spot('테스트 박물관', {}, '14');
    assert.equal(s.isFoodPlace, false);
    assert.equal(s.spicy, null);
    assert.equal(s.raw, null);
    assert.equal(s.hasMenuInfo, null);
  });
});

describe('관심사 태그 매핑 (spec 4.8)', () => {
  test('유형·분류·이름으로 태그를 붙인다', () => {
    assert.deepEqual(spot('테스트 백화점', { lclsSystm1: 'SH' }, '38').interestTags, ['SHOPPING']);
    assert.deepEqual(spot('경복궁', { lclsSystm1: 'HS', lclsSystm3: 'HS010100' }).interestTags, ['PALACE_HISTORY']);
    assert.deepEqual(food('테스트 카페', { lclsSystm2: 'FD05' }).interestTags, ['CAFE']);
    assert.deepEqual(spot('테스트 미술관', { lclsSystm2: 'VE07', lclsSystm3: 'VE070600' }, '14').interestTags, ['EXHIBITION']);
    assert.deepEqual(food('테스트 한식당', { lclsSystm2: 'FD01' }).interestTags, ['FOOD']);
    assert.deepEqual(spot('테스트 수목원', { lclsSystm1: 'NA' }).interestTags, ['NATURE']);
    assert.deepEqual(spot('테스트 축제', { lclsSystm1: 'EV' }, '15').interestTags, ['FESTIVAL']);
    assert.deepEqual(spot('테스트 화장품 매장', { lclsSystm1: 'SH' }, '38').interestTags, ['SHOPPING', 'KBEAUTY']);
  });

  test('의료 시설 단서가 있으면 K-뷰티 태그를 붙이지 않는다(병원 알선 금지)', () => {
    assert.deepEqual(spot('테스트 뷰티 피부과', {}, '38').interestTags, ['SHOPPING']);
  });

  test('주점은 FOOD 관심사로 올리지 않는다', () => {
    assert.deepEqual(food('테스트', { lclsSystm2: 'FD04' }).interestTags, []);
  });
});

describe('외국어 유형 코드 정규화 (공식 문서 확인)', () => {
  test('영·일·중 서비스 공통 코드를 국문 체계로 바꾼다', () => {
    assert.equal(canonicalContentType('75'), '28');
    assert.equal(canonicalContentType('76'), '12');
    assert.equal(canonicalContentType('78'), '14');
    assert.equal(canonicalContentType('79'), '38');
    assert.equal(canonicalContentType('80'), '32');
    assert.equal(canonicalContentType('82'), '39');
    assert.equal(canonicalContentType('85'), '15');
  });

  test('77(교통)은 국문 여행코스(25)가 아니다 — 대응하는 국문 유형이 없으므로 그대로 둔다', () => {
    assert.equal(canonicalContentType('77'), '77');
  });
});

describe('정규화 후보의 신호와 정거장 원본 정보 (spec 5.2 Stop)', () => {
  const korean = {
    contentid: '1001',
    contenttypeid: '39',
    title: '테스트 한식당',
    addr1: '서울특별시 강남구 테스트로 1',
    addr2: '2층',
    mapx: '127.0590',
    mapy: '37.5110',
    modifiedtime: '20260801120000',
    firstimage: 'https://example.test/a.jpg',
    cpyrhtDivCd: 'Type1',
    lclsSystm1: 'FD',
    lclsSystm2: 'FD01',
    lclsSystm3: 'FD010100',
  };
  const japanese = {
    contentid: '9001',
    contenttypeid: '82',
    title: 'テスト韓国料理',
    addr1: 'ソウル特別市 江南区',
    mapx: '127.0590',
    mapy: '37.5110',
  };
  const english = {
    contentid: '8001',
    contenttypeid: '82',
    title: 'Test Korean Restaurant',
    addr1: '1, Test-ro, Gangnam-gu, Seoul',
    mapx: '127.0590',
    mapy: '37.5110',
  };

  test('선택 언어 표시 정보와 한국어 원문·언어별 원본 ID·유형 코드를 싣는다', () => {
    const c = normalizeTourCandidate({ korean, japanese, lang: 'ja', now: NOW });

    assert.equal(c.title, 'テスト韓国料理');
    assert.equal(c.titleLanguage, 'ja');
    assert.equal(c.needsTranslation, false);
    assert.deepEqual(c.stop, {
      contentId: '1001',
      title: 'テスト韓国料理',
      address: 'ソウル特別市 江南区',
      lang: 'ja',
      lat: 37.511,
      lng: 127.059,
      ko: { title: '테스트 한식당', address: '서울특별시 강남구 테스트로 1 2층' },
      sourceIds: { ko: '1001', en: null, ja: '9001', zh: null, barrierFree: null },
      contentTypeIds: { canonical: '39', ko: '39', en: null, ja: '82', zh: null },
      image: { url: 'https://example.test/a.jpg', copyrightType: 'Type1' },
    });
  });

  test('일본어가 없으면 영문, 영문도 없으면 국문 + 번역 필요', () => {
    const en = normalizeTourCandidate({ korean, english, lang: 'ja', now: NOW });
    assert.equal(en.stop.lang, 'en');
    assert.equal(en.title, 'Test Korean Restaurant');
    assert.equal(en.needsTranslation, false);

    const ko = normalizeTourCandidate({ korean, lang: 'zh', now: NOW });
    assert.equal(ko.stop.lang, 'ko');
    assert.equal(ko.title, '테스트 한식당');
    assert.equal(ko.needsTranslation, true);
  });

  test('선택 언어가 ko 이면 국문을 그대로 쓰고 번역 필요가 아니다', () => {
    const c = normalizeTourCandidate({ korean, lang: 'ko', now: NOW });
    assert.equal(c.titleLanguage, 'ko');
    assert.equal(c.needsTranslation, false);
  });

  test('신호는 원문 필드와 분리된 signals 에 있고 원문 분류 코드는 sourceMetadata 에 남는다', () => {
    const c = normalizeTourCandidate({ korean, lang: 'en', now: NOW });
    assert.equal(c.signals.estimated, true);
    assert.equal(c.signals.isFoodPlace, true);
    assert.equal(c.signals.isCafe, false);
    assert.deepEqual(c.sourceMetadata.classification, {
      lclsSystm1: 'FD',
      lclsSystm2: 'FD01',
      lclsSystm3: 'FD010100',
    });
    assert.equal(c.sourceMetadata.menu, null, '메뉴를 조회하지 않았으면 null');
  });

  test('신호는 표시 언어와 무관하다 — 외국어 제목의 단서를 쓰지 않는다 (규칙 27)', () => {
    const spaEnglish = { ...english, title: 'Test Spa & Sauna' };
    const plainKorean = { ...korean, contenttypeid: '12', title: '테스트 관광지', lclsSystm1: 'VE', lclsSystm2: 'VE01', lclsSystm3: 'VE010100' };
    const a = normalizeTourCandidate({ korean: plainKorean, english: spaEnglish, lang: 'en', now: NOW });
    const b = normalizeTourCandidate({ korean: plainKorean, lang: 'ko', now: NOW });
    assert.deepEqual(a.signals, b.signals);
    assert.equal(a.signals.heatExposure, false);
  });

  test('상세 소개(메뉴·운영) 보강을 적용하면 원문은 sourceMetadata 에, 신호는 다시 계산된다', () => {
    const c = normalizeTourCandidate({ korean, lang: 'en', now: NOW });
    const enriched = applyIntro(c, {
      schedule: { restdatefood: '매주 월요일' },
      menu: { firstmenu: '육회비빔밥' },
    });
    assert.deepEqual(enriched.sourceMetadata.menu, { firstmenu: '육회비빔밥' });
    assert.deepEqual(enriched.sourceMetadata.schedule, { restdatefood: '매주 월요일' });
    assert.equal(enriched.signals.hasMenuInfo, true);
    assert.equal(enriched.signals.raw, true);
    assert.equal(c.signals.raw, null, '원래 후보를 바꾸지 않는다');
  });
});
