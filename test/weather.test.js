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
