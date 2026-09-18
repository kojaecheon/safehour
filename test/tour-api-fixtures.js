// AX-305 — 관광 후보 테스트용 합성 fixture (실제 호출 없음, 인증키·조회 URL 없음)
//
// 필드 이름과 코드 체계는 공식 문서를 따른다.
//   - 목록(locationBasedList2) 응답 항목: contentid, contenttypeid, title, addr1, mapx, mapy,
//     lclsSystm1/2/3, firstimage, cpyrhtDivCd, modifiedtime
//   - 국문 유형 코드(12·14·15·25·28·32·38·39)와 외국어 유형 코드(75·76·77·78·79·80·82·85)
//   - 분류체계 코드(FD04 주점, FD05 카페/찻집, EX0502 찜질방 등)
// 근거 URL 은 src/tour-api/content-types.js·cues.js 주석에 있다.
// 값(제목·좌표)은 모두 테스트용으로 지어낸 것이다.

export const ORIGIN = Object.freeze({ kind: 'USER_SELECTED_FIXED', lat: 37.5105, lng: 127.059 });

export function koItem(contentid, title, extra = {}) {
  return {
    contentid: String(contentid),
    contenttypeid: '12',
    title,
    addr1: '서울특별시 강남구 테스트로 1',
    mapx: '127.0590',
    mapy: '37.5110',
    modifiedtime: '20260801120000',
    ...extra,
  };
}

/** 외국어 서비스 항목 — 국문과 contentId 가 다르고 유형 코드 체계가 다르다 */
export function foreignItem(contentid, title, extra = {}) {
  return {
    contentid: String(contentid),
    contenttypeid: '76',
    title,
    addr1: '1, Test-ro, Gangnam-gu, Seoul',
    mapx: '127.0590',
    mapy: '37.5110',
    modifiedtime: '20260801120000',
    ...extra,
  };
}

export function listBody(items) {
  return JSON.stringify({
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items: items.length ? { item: items } : '', totalCount: items.length },
    },
  });
}

const FAIL = Object.freeze({ ok: false, status: 500, text: async () => '{}' });

/**
 * 서비스별 응답을 지정하는 fetch 스텁.
 * 값이 null 이면 그 서비스는 HTTP 500 으로 실패한다(키 미신청·장애 모두 같은 경로).
 * intro: contentId → detailIntro2 항목(없으면 빈 응답)
 */
export function stubTourServices({
  korean = [],
  english = [],
  japanese = [],
  chinese = [],
  barrierFree = [],
  intro = {},
  introFails = false,
} = {}) {
  const state = { calls: [], byService: {} };
  const count = (key) => {
    state.byService[key] = (state.byService[key] ?? 0) + 1;
  };
  globalThis.fetch = async (url) => {
    const target = String(url);
    state.calls.push(target);
    const ok = (items) => ({ ok: true, status: 200, text: async () => listBody(items) });

    if (target.includes('detailWithTour2')) {
      count('barrierFree.detailWithTour2');
      return ok([]);
    }
    if (target.includes('detailIntro2')) {
      count('korean.detailIntro2');
      if (introFails) return FAIL;
      const id = new URL(target).searchParams.get('contentId');
      return ok(intro[id] ? [{ contentid: id, ...intro[id] }] : []);
    }
    const pick = (key, value) => {
      count(`${key}.locationBasedList2`);
      return value === null ? FAIL : ok(value);
    };
    if (target.includes('/KorWithService2/')) return pick('barrierFree', barrierFree);
    if (target.includes('/EngService2/')) return pick('english', english);
    if (target.includes('/JpnService2/')) return pick('japanese', japanese);
    if (target.includes('/ChsService2/')) return pick('chineseSimplified', chinese);
    if (target.includes('/KorService2/')) return pick('korean', korean);
    return FAIL;
  };
  return state;
}
