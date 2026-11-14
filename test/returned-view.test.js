// '돌아왔어요'와 되돌리기 표시 규칙 (components/trip/returnedView.js · 계획 2026-11-15 Task 9, D10·D14)
//
// 이 파일이 고정하는 것
//   - 단계마다 버튼·줄·되돌리기가 계획의 표와 같다(QUEUED 는 되돌리기가 보인다: 보내기 전이라 요청 없이 취소된다)
//   - 되돌리기는 SENT 에서 되돌리기 마감 전까지만 보인다(마감 1ms 전 보임, 마감 시각에 숨음)
//   - '전달했어요'(return.backSent)는 SENT 에서만 나온다
//   - 갈아 끼움 직후(lineOnly)는 FAILED·UNDO_FAILED 줄만, 버튼·되돌리기 없음(작업 7 검토 반영 M1)
//   - 새 문구 키는 네 언어가 모두 있고 '안전합니다'·대시가 없다. 상태 문장은 safety, 버튼 이름은 messages 다
//
// 시각은 모두 +09:00 오프셋으로 만든다(기기 시간대와 무관).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { returnedView } from '../components/trip/returnedView.js';
import { BACK_PHASE } from '../lib/trip/watchSync.js';
import { undoUntilMs } from '../lib/trip/watchPlan.js';
import { messages as tripMessages, safety as tripSafety } from '../src/i18n/messages/trip.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';
import { LANGS } from '../src/i18n/index.js';

const kst = (date, hhmm, ss = '00') => Date.parse(`${date}T${hhmm}:${ss}+09:00`);
const TARGET = Object.freeze({ date: '2026-10-02', by: '12:30' });
const UNTIL = undoUntilMs(TARGET);
const BEFORE_UNTIL = UNTIL - 60_000;

const ALL_PHASES = [null, ...Object.values(BACK_PHASE)];

describe('단계별 표시', () => {
  test('단계마다 버튼·줄·되돌리기가 표와 같다', () => {
    const table = [
      [null, { button: true, busy: false, lineKey: 'return.backHint', undo: false }],
      [BACK_PHASE.SENDING, { button: false, busy: true, lineKey: 'return.backSending', undo: false }],
      [BACK_PHASE.QUEUED, { button: false, busy: false, lineKey: 'return.backQueued', undo: true }],
      [BACK_PHASE.UNDO_QUEUED, { button: false, busy: false, lineKey: 'return.backUndoQueued', undo: false }],
      [BACK_PHASE.SENT, { button: false, busy: false, lineKey: 'return.backSent', undo: true }],
      [BACK_PHASE.FAILED, { button: true, busy: false, lineKey: 'return.backFailed', undo: false }],
      [BACK_PHASE.UNDO_FAILED, { button: false, busy: false, lineKey: 'return.backUndoFailed', undo: false }],
    ];
    assert.equal(table.length, ALL_PHASES.length, '표가 모든 단계를 다룬다');
    for (const [phase, expected] of table) {
      assert.deepEqual(returnedView({ phase, nowMs: BEFORE_UNTIL, undoUntilMs: UNTIL }), expected, String(phase));
    }
  });

  test('보내는 중(SENDING)에는 버튼도 되돌리기도 없고 busy 다', () => {
    const view = returnedView({ phase: BACK_PHASE.SENDING, nowMs: BEFORE_UNTIL, undoUntilMs: UNTIL });
    assert.equal(view.busy, true);
    assert.equal(view.button, false);
    assert.equal(view.undo, false);
    for (const phase of ALL_PHASES.filter((p) => p !== BACK_PHASE.SENDING)) {
      assert.equal(returnedView({ phase, nowMs: BEFORE_UNTIL, undoUntilMs: UNTIL }).busy, false, String(phase));
    }
  });

  test('모르는 단계는 누르기 전과 같다(전달했다고 쓰지 않는다)', () => {
    assert.deepEqual(returnedView({ phase: 'SOMETHING' }), returnedView({ phase: null }));
    assert.deepEqual(returnedView(), returnedView({ phase: null }));
    assert.deepEqual(returnedView({ phase: 'toString' }), returnedView({ phase: null }));
  });
});

describe('되돌리기 마감', () => {
  test('되돌리기는 SENT 에서 되돌리기 마감 전까지만 보인다', () => {
    assert.equal(UNTIL, kst('2026-10-02', '12:39', '30'), '마감 + 10분 - 30초');
    assert.equal(returnedView({ phase: BACK_PHASE.SENT, nowMs: UNTIL - 1, undoUntilMs: UNTIL }).undo, true);
    assert.equal(returnedView({ phase: BACK_PHASE.SENT, nowMs: UNTIL, undoUntilMs: UNTIL }).undo, false);
    assert.equal(returnedView({ phase: BACK_PHASE.SENT, nowMs: UNTIL + 60_000, undoUntilMs: UNTIL }).undo, false);
    // 마감을 넘긴 뒤에도 줄은 '전달했어요' 그대로다
    assert.equal(returnedView({ phase: BACK_PHASE.SENT, nowMs: UNTIL, undoUntilMs: UNTIL }).lineKey, 'return.backSent');
  });

  test('시각이나 되돌리기 마감을 모르면 SENT 의 되돌리기를 숨긴다', () => {
    for (const [nowMs, until] of [
      [Number.NaN, UNTIL],
      [undefined, UNTIL],
      [BEFORE_UNTIL, null],
      [BEFORE_UNTIL, undefined],
      [BEFORE_UNTIL, Number.NaN],
    ]) {
      assert.equal(returnedView({ phase: BACK_PHASE.SENT, nowMs, undoUntilMs: until }).undo, false, `${nowMs} ${until}`);
    }
  });

  test('되돌리기 마감은 SENT 의 되돌리기만 바꾼다(다른 단계는 시각과 무관하다)', () => {
    for (const phase of ALL_PHASES.filter((p) => p !== BACK_PHASE.SENT)) {
      assert.deepEqual(
        returnedView({ phase, nowMs: UNTIL + 1, undoUntilMs: UNTIL }),
        returnedView({ phase, nowMs: UNTIL - 1, undoUntilMs: UNTIL }),
        String(phase),
      );
    }
  });
});

describe("'전달했어요'", () => {
  test('"전달했어요"는 SENT 에서만 나온다', () => {
    for (const phase of ALL_PHASES) {
      for (const lineOnly of [false, true]) {
        for (const nowMs of [UNTIL - 1, UNTIL]) {
          const { lineKey } = returnedView({ phase, nowMs, undoUntilMs: UNTIL, lineOnly });
          if (lineKey === 'return.backSent') assert.equal(phase, BACK_PHASE.SENT);
        }
      }
    }
    assert.equal(returnedView({ phase: BACK_PHASE.SENT, lineOnly: true }).lineKey, null, '갈아 끼운 뒤에는 전달했다고 쓰지 않는다');
  });
});

describe('갈아 끼움 직후 (lineOnly)', () => {
  test('FAILED·UNDO_FAILED 줄만 보이고 버튼·되돌리기는 없다', () => {
    const none = { button: false, busy: false, lineKey: null, undo: false };
    assert.deepEqual(returnedView({ phase: BACK_PHASE.FAILED, lineOnly: true }), { ...none, lineKey: 'return.backFailed' });
    assert.deepEqual(returnedView({ phase: BACK_PHASE.UNDO_FAILED, lineOnly: true }), { ...none, lineKey: 'return.backUndoFailed' });
    for (const phase of [null, BACK_PHASE.SENDING, BACK_PHASE.QUEUED, BACK_PHASE.UNDO_QUEUED, BACK_PHASE.SENT, 'SOMETHING']) {
      assert.deepEqual(returnedView({ phase, nowMs: UNTIL - 1, undoUntilMs: UNTIL, lineOnly: true }), none, String(phase));
    }
  });
});

describe('문구', () => {
  const BUTTON_KEYS = ['return.back', 'return.backUndo'];
  const LINE_KEYS = [
    'return.backHint',
    'return.backSending',
    'return.backQueued',
    'return.backUndoQueued',
    'return.backSent',
    'return.backFailed',
    'return.backUndoFailed',
  ];
  const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

  function checkEntry(key, entry) {
    for (const lang of LANGS) {
      assert.equal(typeof entry[lang], 'string', `${key}.${lang}`);
      assert.ok(entry[lang].trim().length > 0, `${key}.${lang}`);
      assert.ok(!dashes.test(entry[lang]), `${key}.${lang} 에 대시`);
    }
    assert.ok(!/안전합니다|안전해요|안전/.test(entry.ko), `${key}.ko`);
    assert.ok(!/\bsafe/i.test(entry.en), `${key}.en`);
    assert.ok(!/安全/.test(entry.ja), `${key}.ja`);
    assert.ok(!/安全/.test(entry.zh), `${key}.zh`);
    assert.ok(!/[가-힣]/.test(entry.ja) && !/[가-힣]/.test(entry.zh), `${key} ja·zh 에 한글`);
  }

  test('새 문구 키는 네 언어가 모두 있고 "안전합니다"가 없다', () => {
    for (const key of BUTTON_KEYS) {
      assert.ok(tripMessages[key], `${key} 는 messages 에 있다`);
      assert.equal(tripSafety[key], undefined, `${key} 는 safety 가 아니다`);
      assert.equal(UI_TEXT[key], tripMessages[key]);
      checkEntry(key, tripMessages[key]);
    }
    for (const key of LINE_KEYS) {
      assert.ok(tripSafety[key], `${key} 는 safety 에 있다(상태 문장)`);
      assert.equal(tripMessages[key], undefined, `${key} 는 messages 가 아니다`);
      checkEntry(key, tripSafety[key]);
    }
  });

  test('표의 줄 키는 모두 safety 에 있다', () => {
    for (const phase of ALL_PHASES) {
      for (const lineOnly of [false, true]) {
        const { lineKey } = returnedView({ phase, nowMs: UNTIL - 1, undoUntilMs: UNTIL, lineOnly });
        if (lineKey !== null) assert.ok(LINE_KEYS.includes(lineKey), lineKey);
      }
    }
  });

  test('영어는 guardian 을 쓰고, 상태 줄은 돌아왔는지 단정하지 않는다', () => {
    for (const key of ['return.backHint', 'return.backQueued', 'return.backSent', 'return.backFailed', 'return.backUndoFailed']) {
      assert.match(tripSafety[key].en, /guardian/, key);
      assert.match(tripSafety[key].ko, /보호자/, key);
    }
    for (const key of LINE_KEYS) {
      assert.ok(!/돌아왔습니다|돌아왔어요\./.test(tripSafety[key].ko), `${key} 는 돌아왔다고 단정하지 않는다`);
      assert.ok(!/you are back\.|you're back\./i.test(tripSafety[key].en), `${key}.en`);
    }
    assert.equal(tripMessages['return.back'].ko, '돌아왔어요');
    assert.equal(tripSafety['return.backSent'].ko, '보호자에게 전달했어요.');
  });
});
