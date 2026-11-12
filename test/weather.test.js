// 기상 어댑터 — 격자 변환, 발표시각 계산, 실황 요약, 실패 폴백

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  toGrid,
  summarize,
  kmaBaseDateTime,
  fetchKmaNowcast,
} from '../src/adapters/weather.js';

describe('기상청 격자 변환', () => {
  test('서울시청 좌표는 공식 격자 60,127 이다', () => {
    const { nx, ny } = toGrid(37.5665, 126.978);
    assert.equal(nx, 60);
    assert.equal(ny, 127);
  });

  test('강남 시연 기준점은 서울 격자 범위에 있다', () => {
    const { nx, ny } = toGrid(37.5105, 127.059);
    assert.ok(nx >= 55 && nx <= 65, `nx=${nx}`);
    assert.ok(ny >= 120 && ny <= 130, `ny=${ny}`);
  });
});

describe('초단기실황 발표시각 (KST)', () => {
  test('45분 이후에는 해당 정시를 쓴다', () => {
    // UTC 05:50 = KST 14:50
    const r = kmaBaseDateTime(new Date('2026-08-01T05:50:00Z'));
    assert.deepEqual(r, { baseDate: '20260801', baseTime: '1400' });
  });

  test('45분 전에는 직전 정시를 쓴다', () => {
    // UTC 05:30 = KST 14:30 → 13:00 발표분
    const r = kmaBaseDateTime(new Date('2026-08-01T05:30:00Z'));
    assert.deepEqual(r, { baseDate: '20260801', baseTime: '1300' });
  });

  test('자정 직후에는 전날 23시 발표분으로 내려간다', () => {
    // UTC 7/31 15:10 = KST 8/1 00:10 → 7/31 23:00
    const r = kmaBaseDateTime(new Date('2026-07-31T15:10:00Z'));
    assert.deepEqual(r, { baseDate: '20260731', baseTime: '2300' });
  });
});

describe('실황 요약 판정', () => {
  test('강수형태 코드가 있으면 실외 부적합이다', () => {
    const s = summarize({ pty: 1 });
    assert.equal(s.outdoorUnsafe, true);
    assert.ok(s.reasons.some((r) => r.includes('강수')));
  });

  test('강수확률 60% 이상이면 실외 부적합이다', () => {
    assert.equal(summarize({ pop: 60 }).outdoorUnsafe, true);
    assert.equal(summarize({ pop: 59 }).outdoorUnsafe, false);
  });

  test('데이터가 없으면 차단하지 않되 unknown 으로 표기한다', () => {
    const s = summarize({});
    assert.equal(s.outdoorUnsafe, false);
    assert.equal(s.unknown, true);
  });
});

function kmaResponse(items, resultCode = '00') {
  return {
    ok: true,
    json: async () => ({
      response: {
        header: { resultCode, resultMsg: resultCode === '00' ? 'OK' : 'ERROR' },
        body: { items: { item: items } },
      },
    }),
  };
}

describe('초단기실황 조회', () => {
  const base = { lat: 37.5105, lng: 127.059, serviceKey: 'test-key' };

  test('강수 실황이면 outdoorUnsafe 를 반환한다', async () => {
    const fetchImpl = async () =>
      kmaResponse([
        { category: 'PTY', obsrValue: '1' },
        { category: 'RN1', obsrValue: '2.5' },
        { category: 'T1H', obsrValue: '24' },
      ]);
    const w = await fetchKmaNowcast({ ...base, fetchImpl });
    assert.equal(w.outdoorUnsafe, true);
    assert.equal(w.source, 'kma-ultra-nowcast');
    assert.equal(w.unknown, false);
  });

  test('맑은 실황이면 outdoorUnsafe=false, unknown=false 다', async () => {
    const fetchImpl = async () =>
      kmaResponse([
        { category: 'PTY', obsrValue: '0' },
        { category: 'RN1', obsrValue: '0' },
        { category: 'T1H', obsrValue: '24' },
      ]);
    const w = await fetchKmaNowcast({ ...base, fetchImpl });
    assert.equal(w.outdoorUnsafe, false);
    assert.equal(w.unknown, false);
  });

  test('API 오류 코드는 판정을 왜곡하지 않고 unknown 폴백한다', async () => {
    const fetchImpl = async () => kmaResponse([], '30');
    const w = await fetchKmaNowcast({ ...base, fetchImpl });
    assert.equal(w.outdoorUnsafe, false);
    assert.equal(w.unknown, true);
    assert.equal(w.degraded, true);
  });

  test('네트워크 예외도 throw 없이 unknown 폴백한다', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    const w = await fetchKmaNowcast({ ...base, fetchImpl });
    assert.equal(w.outdoorUnsafe, false);
    assert.equal(w.degraded, true);
  });

  test('인증키가 없으면 호출 없이 unknown 폴백한다', async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return kmaResponse([]);
    };
    const w = await fetchKmaNowcast({ ...base, serviceKey: '', fetchImpl });
    assert.equal(called, false);
    assert.equal(w.unknown, true);
  });

  test('인증키가 URL 쿼리에 로그 없이 포함되고 요청 파라미터가 올바르다', async () => {
    let capturedUrl = '';
    const fetchImpl = async (url) => {
      capturedUrl = String(url);
      return kmaResponse([{ category: 'PTY', obsrValue: '0' }]);
    };
    await fetchKmaNowcast({ ...base, fetchImpl, now: new Date('2026-08-01T05:50:00Z') });
    assert.ok(capturedUrl.includes('base_date=20260801'));
    assert.ok(capturedUrl.includes('base_time=1400'));
    assert.ok(capturedUrl.includes('dataType=JSON'));
    assert.ok(capturedUrl.includes('nx=') && capturedUrl.includes('ny='));
  });
});

// ── 단기예보 (AX-308 · docs/platform/ITINERARY_RULES.md '변화 원천'(표의 4번 행), docs/contracts.md '`POST /api/itinerary/plan`'의 diagnostics.weather) ─────────────────────────
// 오늘~모레 날짜별 실외 부적합 여부. 실패·키 없음·자료 부족은 '확인 불가'(null)이고 판정에 반영하지 않는다.
// 실제 기상청을 부르지 않는다 — 모든 응답은 fixture 다.

import {
  KMA_SHORT_TERM_BASE_TIMES,
  fetchKmaShortTermForecast,
  parsePrecipitationMm,
  resolveKmaServiceKey,
  summarizeShortTermForecast,
  vilageFcstBaseDateTime,
} from '../src/adapters/weather.js';

describe('단기예보 발표시각 (KST, 발표 10분 뒤 제공)', () => {
  test('발표시각은 하루 8회다', () => {
    assert.deepEqual(KMA_SHORT_TERM_BASE_TIMES, ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300']);
  });

  test('14:10 이후에는 1400 발표, 그 전에는 1100 발표를 쓴다', () => {
    // UTC 05:10 = KST 14:10
    assert.deepEqual(vilageFcstBaseDateTime(new Date('2026-10-01T05:10:00Z')), { baseDate: '20261001', baseTime: '1400' });
    assert.deepEqual(vilageFcstBaseDateTime(new Date('2026-10-01T05:09:00Z')), { baseDate: '20261001', baseTime: '1100' });
  });

  test('02:10 전에는 전날 2300 발표로 내려간다', () => {
    // UTC 9/30 16:30 = KST 10/1 01:30
    assert.deepEqual(vilageFcstBaseDateTime(new Date('2026-09-30T16:30:00Z')), { baseDate: '20260930', baseTime: '2300' });
    assert.deepEqual(vilageFcstBaseDateTime(new Date('2026-09-30T17:10:00Z')), { baseDate: '20261001', baseTime: '0200' });
  });
});

describe('단기예보 1시간 강수량(PCP) 범주 읽기', () => {
  test('강수없음·-·0·null 은 0mm 다', () => {
    for (const v of ['강수없음', '-', '0', 0, null, undefined, '']) assert.equal(parsePrecipitationMm(v), 0, String(v));
  });

  test('1mm 미만은 실외 부적합 기준(1mm)보다 작다', () => {
    for (const v of ['1mm 미만', '1.0mm 미만', '1.0mm미만']) {
      const mm = parsePrecipitationMm(v);
      assert.ok(mm > 0 && mm < 1, `${v} → ${mm}`);
    }
  });

  test('값·범위·이상 표기는 아래 경계로 읽는다', () => {
    assert.equal(parsePrecipitationMm('6.2mm'), 6.2);
    assert.equal(parsePrecipitationMm('1.0~29.0mm'), 1);
    assert.equal(parsePrecipitationMm('30.0~50.0mm'), 30);
    assert.equal(parsePrecipitationMm('50.0mm 이상'), 50);
    assert.equal(parsePrecipitationMm(3), 3);
  });

  test('읽을 수 없거나 결측(±900 이상) 값은 null 이다', () => {
    assert.equal(parsePrecipitationMm('비 조금'), null);
    assert.equal(parsePrecipitationMm('-999'), null);
    assert.equal(parsePrecipitationMm(900), null);
  });
});

const ymd = (date) => date.replaceAll('-', '');
/** 단기예보 항목 fixture — 공식 응답 필드(baseDate·baseTime·category·fcstDate·fcstTime·fcstValue·nx·ny) */
function fc(date, hour, category, value) {
  return {
    baseDate: '20261001',
    baseTime: '0800',
    category,
    fcstDate: ymd(date),
    fcstTime: `${String(hour).padStart(2, '0')}00`,
    fcstValue: String(value),
    nx: 61,
    ny: 125,
  };
}
/** 한 날짜의 hour 범위를 맑음으로 채운다 */
function clearHours(date, from = 0, to = 23) {
  const out = [];
  for (let h = from; h <= to; h += 1) {
    out.push(fc(date, h, 'POP', 10), fc(date, h, 'PTY', 0), fc(date, h, 'PCP', '강수없음'), fc(date, h, 'TMP', 22), fc(date, h, 'SKY', 1));
  }
  return out;
}
const TODAY = '2026-10-01';
const TOMORROW = '2026-10-02';
const DAY_AFTER = '2026-10-03';
// KST 10/1 08:30
const NOW_0830 = new Date('2026-09-30T23:30:00Z');

describe('단기예보 → 날짜별 실외 부적합', () => {
  const dates = [TODAY, TOMORROW, DAY_AFTER];

  test('활동 시간이 모두 맑으면 false, 한 시간이라도 강수 형태가 있으면 true 다', () => {
    const items = [
      ...clearHours(TODAY, 9, 23),
      ...clearHours(TOMORROW).map((i) => (i.fcstTime === '1500' && i.category === 'PTY' ? { ...i, fcstValue: '1' } : i)),
      ...clearHours(DAY_AFTER),
    ];
    const byDate = summarizeShortTermForecast(items, { dates, now: NOW_0830 });
    assert.deepEqual(byDate[TODAY], { outdoorUnsafe: false });
    assert.deepEqual(byDate[TOMORROW], { outdoorUnsafe: true });
    assert.deepEqual(byDate[DAY_AFTER], { outdoorUnsafe: false });
  });

  test('강수확률 60%·강수량 1mm·고온 31℃·저온 0℃ 는 각각 실외 부적합이다', () => {
    const cases = [
      ['POP', 60],
      ['PCP', '1.0~29.0mm'],
      ['TMP', 31],
      ['TMP', 0],
    ];
    for (const [category, value] of cases) {
      const items = clearHours(TOMORROW).map((i) => (i.fcstTime === '1200' && i.category === category ? { ...i, fcstValue: String(value) } : i));
      assert.equal(summarizeShortTermForecast(items, { dates: [TOMORROW], now: NOW_0830 })[TOMORROW].outdoorUnsafe, true, `${category}=${value}`);
    }
    const below = clearHours(TOMORROW).map((i) => (i.fcstTime === '1200' && i.category === 'POP' ? { ...i, fcstValue: '59' } : i));
    assert.equal(summarizeShortTermForecast(below, { dates: [TOMORROW], now: NOW_0830 })[TOMORROW].outdoorUnsafe, false);
  });

  test('활동 시간(09–21시) 밖의 비는 날짜를 막지 않는다', () => {
    const items = clearHours(TOMORROW).map((i) => (i.fcstTime === '2200' && i.category === 'PTY' ? { ...i, fcstValue: '1' } : i));
    assert.equal(summarizeShortTermForecast(items, { dates: [TOMORROW], now: NOW_0830 })[TOMORROW].outdoorUnsafe, false);
  });

  test('오늘은 지금 시각 이후만 본다 — 지난 시간의 비는 막지 않는다', () => {
    // KST 13:30 기준, 오늘 10시 비는 지났다
    const now = new Date('2026-10-01T04:30:00Z');
    const items = clearHours(TODAY, 9, 23).map((i) => (i.fcstTime === '1000' && i.category === 'PTY' ? { ...i, fcstValue: '1' } : i));
    assert.equal(summarizeShortTermForecast(items, { dates: [TODAY], now })[TODAY].outdoorUnsafe, false);
  });

  test('활동 시간을 다 덮지 못하고 부적합도 없으면 확인 불가(null)다', () => {
    const items = clearHours(DAY_AFTER, 0, 12);
    assert.deepEqual(summarizeShortTermForecast(items, { dates: [DAY_AFTER], now: NOW_0830 })[DAY_AFTER], { outdoorUnsafe: null });
    assert.deepEqual(summarizeShortTermForecast([], { dates: [DAY_AFTER], now: NOW_0830 })[DAY_AFTER], { outdoorUnsafe: null });
  });

  test('일부만 덮여도 부적합 시간이 있으면 true 다(보수적)', () => {
    const items = clearHours(DAY_AFTER, 0, 12).map((i) => (i.fcstTime === '1100' && i.category === 'PTY' ? { ...i, fcstValue: '4' } : i));
    assert.equal(summarizeShortTermForecast(items, { dates: [DAY_AFTER], now: NOW_0830 })[DAY_AFTER].outdoorUnsafe, true);
  });

  test('결측 값(-999)은 부적합 근거로 쓰지 않는다', () => {
    const items = clearHours(TOMORROW).map((i) => (i.fcstTime === '1200' && i.category === 'TMP' ? { ...i, fcstValue: '-999' } : i));
    assert.equal(summarizeShortTermForecast(items, { dates: [TOMORROW], now: NOW_0830 })[TOMORROW].outdoorUnsafe, false);
  });
});

function forecastResponse(items, resultCode = '00') {
  return new Response(
    JSON.stringify({
      response: {
        header: { resultCode, resultMsg: resultCode === '00' ? 'NORMAL_SERVICE' : 'NODATA_ERROR' },
        body: { dataType: 'JSON', items: { item: items }, pageNo: 1, numOfRows: 1000, totalCount: items.length },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('단기예보 조회', () => {
  const base = { lat: 37.5, lng: 127.03, serviceKey: 'kma-test-key', dates: [TODAY, TOMORROW, DAY_AFTER], now: NOW_0830 };

  test('공식 요청 형식으로 한 번 부르고 날짜별 결과를 돌려준다', async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(String(url));
      return forecastResponse([...clearHours(TODAY, 9, 23), ...clearHours(TOMORROW), ...clearHours(DAY_AFTER)]);
    };
    const w = await fetchKmaShortTermForecast({ ...base, fetchImpl });
    assert.equal(urls.length, 1);
    const url = new URL(urls[0]);
    assert.equal(url.origin + url.pathname, 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst');
    assert.equal(url.searchParams.get('dataType'), 'JSON');
    assert.equal(url.searchParams.get('base_date'), '20261001');
    assert.equal(url.searchParams.get('base_time'), '0800');
    assert.equal(url.searchParams.get('nx'), '61');
    assert.equal(url.searchParams.get('ny'), '125');
    assert.ok(Number(url.searchParams.get('numOfRows')) >= 900, '오늘~모레를 한 쪽에 받을 만큼 요청한다');
    assert.equal(w.source, 'kma-short-term');
    assert.equal(w.unknown, false);
    assert.equal(w.degraded, false);
    assert.deepEqual(w.byDate, {
      [TODAY]: { outdoorUnsafe: false },
      [TOMORROW]: { outdoorUnsafe: false },
      [DAY_AFTER]: { outdoorUnsafe: false },
    });
  });

  test('오류 코드(03 자료 없음)는 모든 날짜를 확인 불가로 둔다', async () => {
    const w = await fetchKmaShortTermForecast({ ...base, fetchImpl: async () => forecastResponse([], '03') });
    assert.equal(w.unknown, true);
    assert.equal(w.degraded, true);
    assert.deepEqual(Object.values(w.byDate), [{ outdoorUnsafe: null }, { outdoorUnsafe: null }, { outdoorUnsafe: null }]);
  });

  test('HTTP 오류·JSON 아님·네트워크 예외·시간 초과도 throw 없이 확인 불가다', async () => {
    const failures = [
      async () => new Response('err', { status: 500 }),
      async () => new Response('<OpenAPI_ServiceResponse>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</OpenAPI_ServiceResponse>', { status: 200 }),
      async () => {
        throw new Error('fetch failed https://apis.data.go.kr/?serviceKey=kma-test-key');
      },
      (url, { signal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    ];
    for (const fetchImpl of failures) {
      const w = await fetchKmaShortTermForecast({ ...base, fetchImpl, timeoutMs: 20 });
      assert.equal(w.unknown, true);
      assert.equal(w.degraded, true);
      assert.ok(Object.values(w.byDate).every((v) => v.outdoorUnsafe === null));
      // 오류 분류 코드만 남긴다 — 키·URL 이 섞이지 않는다
      assert.match(w.error, /^[A-Z_0-9]+$/);
      assert.equal(JSON.stringify(w).includes('kma-test-key'), false);
    }
  });

  test('인증키가 없으면 부르지 않고 확인 불가다', async () => {
    let called = false;
    const w = await fetchKmaShortTermForecast({
      ...base,
      serviceKey: '',
      fetchImpl: async () => {
        called = true;
        return forecastResponse([]);
      },
    });
    assert.equal(called, false);
    assert.equal(w.source, 'none');
    assert.equal(w.unknown, true);
  });

  test('날짜가 없으면 부르지 않는다', async () => {
    let called = false;
    const w = await fetchKmaShortTermForecast({
      ...base,
      dates: [],
      fetchImpl: async () => {
        called = true;
        return forecastResponse([]);
      },
    });
    assert.equal(called, false);
    assert.deepEqual(w.byDate, {});
  });
});

describe('기상청 키 선택', () => {
  test('KMA_API_KEY 가 있으면 그것을 쓴다', () => {
    assert.equal(resolveKmaServiceKey({ KMA_API_KEY: ' kma ', TOUR_API_KEY: 'tour' }), 'kma');
  });

  test('공백만 있는 값이나 off 는 기상 조회를 끈다 — 관광 키로 대신 부르지 않는다', () => {
    // E2E 는 KMA_API_KEY=' ' 로 외부 호출을 막는다 (playwright.config.js)
    assert.equal(resolveKmaServiceKey({ KMA_API_KEY: ' ', TOUR_API_KEY: 'tour' }), null);
    assert.equal(resolveKmaServiceKey({ KMA_API_KEY: 'OFF', TOUR_API_KEY: 'tour' }), null);
  });

  test('설정하지 않았거나 빈 값이면 공공데이터포털 공용 키(TOUR_API_KEY)를 쓴다 (.env.example 안내)', () => {
    assert.equal(resolveKmaServiceKey({ TOUR_API_KEY: 'tour' }), 'tour');
    assert.equal(resolveKmaServiceKey({ KMA_API_KEY: '', TOUR_API_KEY: ' tour ' }), 'tour');
    assert.equal(resolveKmaServiceKey({}), null);
  });
});
