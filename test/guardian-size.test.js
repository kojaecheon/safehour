// 보호자 링크 길이 — 압축·최소화 효과 측정 (AX-313)
//
// 링크는 메신저로 보낸다. 7박 최악 크기 일정의 링크가 8 KB(8,192자) 이하여야 한다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARDIAN_LINK_BUDGET_CHARS,
  buildGuardianLink,
  buildGuardianSnapshot,
  decryptSnapshot,
  encryptSnapshot,
  measureGuardianLink,
} from '../src/guardian/index.js';
import { makeGuardianStay, makeTripPlan, makeWorstCase } from './guardian-fixtures.js';

const PIN = '271828';
const ORIGIN = 'https://safehour.vercel.app';

function worstSnapshot(nights) {
  const { stay, tripPlan, now } = makeWorstCase(nights);
  return buildGuardianSnapshot({ stay, tripPlan, now, lang: 'en' });
}

describe('링크 길이 측정', () => {
  test('측정값은 실제로 만든 링크 길이와 같다', async () => {
    const snapshot = buildGuardianSnapshot({ stay: makeGuardianStay(), tripPlan: makeTripPlan(), now: '2026-10-01T09:30:00+09:00' });
    const size = await measureGuardianLink(snapshot, { origin: ORIGIN });
    const link = buildGuardianLink(ORIGIN, await encryptSnapshot(snapshot, PIN));
    assert.equal(size.format, 'DEFLATE_RAW_JSON');
    assert.equal(size.linkChars, link.length);
    assert.equal(size.fragmentChars, link.length - `${ORIGIN}/g#`.length);
    assert.equal(size.jsonBytes, Buffer.byteLength(JSON.stringify(snapshot)));
    assert.ok(size.plaintextBytes < size.jsonBytes);
  });

  test('기준 한도는 8 KB 다', () => {
    assert.equal(GUARDIAN_LINK_BUDGET_CHARS, 8 * 1024);
  });

  test('7박 최악 크기 일정의 링크가 8 KB 이하이고, 올바른 PIN 으로 풀린다', async (t) => {
    const snapshot = worstSnapshot(7);
    assert.equal(snapshot.days.length, 8);
    assert.equal(snapshot.days.flatMap((d) => d.guardianOutings.flatMap((o) => o.stops)).length, 40);
    const size = await measureGuardianLink(snapshot, { origin: ORIGIN });
    t.diagnostic(`7박: JSON ${size.jsonBytes}B → 평문 ${size.plaintextBytes}B → 링크 ${size.linkChars}자`);
    assert.ok(size.linkChars <= GUARDIAN_LINK_BUDGET_CHARS, `링크 ${size.linkChars}자`);

    const link = buildGuardianLink(ORIGIN, await encryptSnapshot(snapshot, PIN));
    assert.equal(link.length, size.linkChars);
    assert.deepEqual(await decryptSnapshot(link.split('#')[1], PIN), snapshot);
  });

  test('14박·45박 최악 크기 일정의 링크 길이를 기록한다', async (t) => {
    for (const nights of [14, 45]) {
      const size = await measureGuardianLink(worstSnapshot(nights), { origin: ORIGIN });
      t.diagnostic(`${nights}박: JSON ${size.jsonBytes}B → 평문 ${size.plaintextBytes}B → 링크 ${size.linkChars}자`);
      assert.ok(size.plaintextBytes < size.jsonBytes / 2, '압축이 절반 이하로 줄여야 한다');
    }
  });

  test('체류 중간에 만들면 지난 날이 빠져 링크가 짧아진다', async () => {
    const { stay, tripPlan } = makeWorstCase(7);
    const atArrival = buildGuardianSnapshot({ stay, tripPlan, now: '2026-10-01T08:00:00+09:00' });
    const midway = buildGuardianSnapshot({ stay, tripPlan, now: '2026-10-05T08:00:00+09:00' });
    assert.equal(midway.days.length, 4);
    const a = await measureGuardianLink(atArrival, { origin: ORIGIN });
    const b = await measureGuardianLink(midway, { origin: ORIGIN });
    assert.ok(b.linkChars < a.linkChars);
  });

  test('origin 없이 재면 링크 길이 대신 암호문 길이만 준다', async () => {
    const size = await measureGuardianLink(worstSnapshot(7));
    assert.equal(size.linkChars, null);
    assert.ok(size.fragmentChars > 0);
  });
});
