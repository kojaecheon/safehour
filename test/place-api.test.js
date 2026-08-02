// AX-005 — 장소 상세 API 계약 (D03-SCR006, D04-F009, D09-AC016)
//
// 계약:
//   - 상세는 보강 조회다. 실패해도 추천 판정에 영향을 주지 않는다.
//   - 클라이언트가 보낸 식별자만 신뢰하고, 형식이 맞지 않으면 외부 호출 전에 거부한다.
//   - 영문 우선·국문 폴백이 동작하고 어느 원문인지 표기된다.
//   - 운영시간 원문을 영업 여부로 해석하지 않는다 (D04-BR012).

import { test, describe, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'safehour-place-'));
process.env.SAFEHOUR_DATA_ROOT = DATA_ROOT;
process.env.TOUR_API_KEY = 'test-service-key';

let placePost;
let TOUR_API_PATHS;

const originalFetch = globalThis.fetch;

before(async () => {
  ({ POST: placePost } = await import('../app/api/place/route.js'));
  ({ TOUR_API_PATHS } = await import('../src/tour-api/config.js'));
});

after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  // 상세 API 는 캐시를 쓰므로(운영과 동일) 테스트 간 캐시도 비워 격리한다
  for (const dir of [TOUR_API_PATHS.logs, TOUR_API_PATHS.cache]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonRequest(body) {
  return new Request('http://test/api/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const CANDIDATE = {
  id: '126508',
  title: '코엑스',
  sourceIds: { korean: '126508', english: '264500', barrierFree: null },
  sourceMetadata: { contentTypeIds: { korean: '12', english: '76' } },
};

function successBody(items) {
  return JSON.stringify({
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: { items: { item: items }, totalCount: items.length },
    },
  });
}

/** 로케일·오퍼레이션별 응답 스텁. failFor 에 걸리면 HTTP 500 */
function stubFetch({ failFor = [], korean = {}, english = {} } = {}) {
  const state = { calls: [] };
  globalThis.fetch = async (url) => {
    const target = String(url);
    state.calls.push(target);
    if (failFor.some((p) => target.includes(p))) {
      return { ok: false, status: 500, text: async () => '{}' };
    }
    const locale = target.includes('EngService2') ? english : korean;
    if (target.includes('detailCommon2')) {
      return { ok: true, status: 200, text: async () => successBody(locale.common ?? []) };
    }
    if (target.includes('detailIntro2')) {
      return { ok: true, status: 200, text: async () => successBody(locale.intro ?? []) };
    }
    if (target.includes('detailImage2')) {
      return { ok: true, status: 200, text: async () => successBody(locale.images ?? []) };
    }
    return { ok: true, status: 200, text: async () => successBody([]) };
  };
  return state;
}

describe('입력 검증 (외부 호출 전 차단)', () => {
  test('본문이 JSON 이 아니면 400', async () => {
    const res = await placePost(jsonRequest('{{'));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, 'SAFEHOUR_BAD_REQUEST');
  });

  test('장소 식별자가 없으면 호출하지 않고 400', async () => {
    const state = stubFetch();
    const res = await placePost(jsonRequest({ candidate: { id: 'x', title: '없음' } }));

    assert.equal(res.status, 400);
    assert.equal((await res.json()).errorCode, 'SAFEHOUR_PLACE_INVALID');
    assert.equal(state.calls.length, 0);
  });

  test('숫자가 아닌 식별자는 거부한다 (경로 조작 방지)', async () => {
    const state = stubFetch();
    const res = await placePost(
      jsonRequest({
        candidate: { sourceIds: { korean: '../../etc/passwd', english: null } },
      }),
    );

    assert.equal(res.status, 400);
    assert.equal(state.calls.length, 0);
  });

  test('클라이언트가 보낸 임의 필드는 조회에 쓰이지 않는다', async () => {
    const state = stubFetch({ korean: { common: [{ contentid: '126508', overview: '개요' }] } });
    await placePost(
      jsonRequest({
        candidate: { ...CANDIDATE, maliciousServiceKey: 'leak', overview: '위조된 개요' },
      }),
    );

    const joined = state.calls.join(' ');
    assert.equal(joined.includes('leak'), false);
    assert.equal(joined.includes('%EC%9C%84%EC%A1%B0'), false);
  });
});

describe('상세 조회 결과', () => {
  test('영문 원문이 있으면 영문을 우선하고 언어를 표기한다', async () => {
    stubFetch({
      korean: { common: [{ contentid: '126508', overview: '국문 개요', addr1: '서울 강남구' }] },
      english: { common: [{ contentid: '264500', overview: 'English overview' }] },
    });

    const res = await placePost(jsonRequest({ candidate: CANDIDATE }));
    const { details } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(details.overview, 'English overview');
    assert.equal(details.overviewLanguage, 'en');
  });

  test('영문이 없으면 국문으로 폴백하고 언어를 표기한다 (D09-AC016)', async () => {
    stubFetch({
      korean: { common: [{ contentid: '126508', overview: '국문 개요' }] },
      english: { common: [] },
    });

    const { details } = await (await placePost(jsonRequest({ candidate: CANDIDATE }))).json();

    assert.equal(details.overview, '국문 개요');
    assert.equal(details.overviewLanguage, 'ko');
  });

  test('운영시간 원문이 있어도 영업 여부를 단정하지 않는다 (D04-BR012)', async () => {
    stubFetch({
      korean: {
        common: [{ contentid: '126508', overview: '개요' }],
        intro: [{ contentid: '126508', usetime: '09:00~18:00', restdate: '매주 월요일' }],
      },
    });

    const { details } = await (await placePost(jsonRequest({ candidate: CANDIDATE }))).json();

    assert.equal(details.openNow, null);
    assert.equal(details.openNowReason, 'UNVERIFIED_SCHEDULE_TEXT');
    assert.ok(details.operatingSchedule.usetime);
  });

  test('이미지의 저작권 구분 코드를 함께 반환한다 (D07-POL004)', async () => {
    stubFetch({
      korean: {
        common: [{ contentid: '126508', overview: '개요' }],
        images: [
          { originimgurl: 'https://img/1.jpg', imgname: '전경', cpyrhtDivCd: 'Type1' },
          { originimgurl: 'https://img/2.jpg', cpyrhtDivCd: 'Type3' },
        ],
      },
    });

    const { details } = await (await placePost(jsonRequest({ candidate: CANDIDATE }))).json();

    assert.equal(details.images.length, 2);
    assert.equal(details.images[0].copyrightDivisionCode, 'Type1');
    assert.equal(details.images[1].copyrightDivisionCode, 'Type3');
  });

  test('일부 오퍼레이션이 실패해도 200 으로 남은 정보를 돌려주고 실패를 기록한다', async () => {
    stubFetch({
      failFor: ['detailIntro2'],
      korean: { common: [{ contentid: '126508', overview: '국문 개요' }] },
    });

    const res = await placePost(jsonRequest({ candidate: CANDIDATE }));
    const { ok, details } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(ok, true);
    assert.equal(details.overview, '국문 개요', '부분 실패가 살아있는 정보까지 지웠다');
    assert.ok(details.errors.length > 0, '실패가 errors 에 기록되지 않았다');
  });

  test('영문 식별자만 있어도 조회한다', async () => {
    stubFetch({ english: { common: [{ contentid: '264500', overview: 'Only english' }] } });

    const res = await placePost(
      jsonRequest({
        candidate: {
          sourceIds: { korean: null, english: '264500' },
          sourceMetadata: { contentTypeIds: { english: '76' } },
        },
      }),
    );
    const { details } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(details.overview, 'Only english');
  });
});
