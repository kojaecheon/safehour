// 설정의 '서버 알림' 절 (components/settings/serverPushView.js · 계획 2026-11-15 Task 10, D11·D13·D14)
//
// 이 파일이 고정하는 것
//   - 절은 스위치가 켜져 있거나 이 기기에 지켜보기 레코드(ON·REPLACED)가 있을 때만 보인다(다르게 정한 것 18)
//   - 상태 줄 키는 ON, REPLACED, NONE 마다 다르다. ON 인데 서버가 스위치가 꺼졌다고 답했으면 멈춤 줄(안전 문구)이고,
//     읽지 못했으면 예전 줄이다
//   - '내 정보 지우기' 안내는 지켜보기 레코드(ON·REPLACED)가 있으면 서버 알림 저장을 적은 줄, 없으면 예전 줄이다
//   - 끄기는 ON·REPLACED 이고 쓰기 가능할 때, 서버 지우기는 쓰기 가능하고 온라인일 때만
//   - 끄기 결과: { ok: true, pending: false } 일 때만 '껐어요', pending 이면 알림이 갈 수 있다는 줄, 실패면 끄지 못했다는 줄
//     (뒤의 둘은 안전 문구, 작업 7 검토 반영)
//   - 서버 지우기 결과: 성공(지운 수), 로그인 필요, 그 밖 실패
//   - 새 문구 키는 네 언어가 모두 있고 '안전합니다'·대시가 없다

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { clearNoteKey, serverPushRemoveResult, serverPushSectionView, serverPushTurnOffResult } from '../components/settings/serverPushView.js';
import { messages as settingsMessages, safety as settingsSafety } from '../src/i18n/messages/settings.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';
import { LANGS } from '../src/i18n/index.js';

const WRITABLE = Object.freeze({ readOnly: false, online: true });

describe('절을 보이는 조건', () => {
  test('절은 스위치가 켜져 있거나 레코드가 있을 때만 보인다', () => {
    assert.equal(serverPushSectionView({ enabled: true, state: 'NONE', ...WRITABLE }).visible, true);
    assert.equal(serverPushSectionView({ enabled: false, state: 'ON', ...WRITABLE }).visible, true);
    assert.equal(serverPushSectionView({ enabled: false, state: 'REPLACED', ...WRITABLE }).visible, true);
    assert.equal(serverPushSectionView({ enabled: false, state: 'NONE', ...WRITABLE }).visible, false, '스위치가 꺼져 있고 레코드가 없으면 예전과 같다');
  });

  test('스위치를 아직 읽지 못했거나(true 가 아님) 상태가 틀리면 레코드가 있을 때만 보인다', () => {
    assert.equal(serverPushSectionView({ enabled: undefined, state: 'NONE', ...WRITABLE }).visible, false);
    assert.equal(serverPushSectionView({ enabled: 'true', state: 'NONE', ...WRITABLE }).visible, false);
    assert.equal(serverPushSectionView({ enabled: false, state: 'OFF', ...WRITABLE }).visible, false);
    assert.equal(serverPushSectionView().visible, false);
  });
});

describe('상태 줄', () => {
  test('상태 줄 키는 ON, REPLACED, NONE 마다 다르다', () => {
    const keyOf = (state) => serverPushSectionView({ enabled: true, state, ...WRITABLE }).stateKey;
    assert.equal(keyOf('ON'), 'settings.serverPushOn');
    assert.equal(keyOf('REPLACED'), 'settings.serverPushReplaced');
    assert.equal(keyOf('NONE'), 'settings.serverPushOff');
    assert.equal(new Set(['ON', 'REPLACED', 'NONE'].map(keyOf)).size, 3);
    assert.equal(keyOf(undefined), 'settings.serverPushOff');
    for (const state of ['ON', 'REPLACED', 'NONE']) assert.equal(serverPushSectionView({ enabled: true, checked: true, state, ...WRITABLE }).statePair, false);
  });

  test('ON 인데 서버가 스위치가 꺼졌다고 답했으면 멈춤 줄(안전 문구)이고, 읽지 못했으면 예전 줄이다', () => {
    const view = (args) => serverPushSectionView({ ...WRITABLE, ...args });
    const paused = view({ enabled: false, checked: true, state: 'ON' });
    assert.equal(paused.stateKey, 'settings.serverPushPaused');
    assert.equal(paused.statePair, true);
    assert.equal(paused.visible, true);
    assert.equal(paused.canTurnOff, true, '멈춰 있어도 끌 수 있다');
    // 읽지 못했거나(오프라인·실패) 아직 읽는 중이면 예전 줄 그대로다
    for (const checked of [false, undefined]) {
      const unknown = view({ enabled: false, checked, state: 'ON' });
      assert.deepEqual([unknown.stateKey, unknown.statePair], ['settings.serverPushOn', false], String(checked));
    }
    // 켜져 있다고 답했으면 예전 줄
    assert.equal(view({ enabled: true, checked: true, state: 'ON' }).stateKey, 'settings.serverPushOn');
    // ON 이 아니면 멈춤 줄이 아니다
    assert.equal(view({ enabled: false, checked: true, state: 'REPLACED' }).stateKey, 'settings.serverPushReplaced');
    assert.equal(view({ enabled: false, checked: true, state: 'NONE' }).visible, false);
  });

  test("'내 정보 지우기' 안내: 지켜보기 레코드(ON·REPLACED)가 있으면 서버 알림 저장을 적은 줄, 없으면 예전 줄", () => {
    assert.equal(clearNoteKey('ON'), 'clear.noteServerPush');
    assert.equal(clearNoteKey('REPLACED'), 'clear.noteServerPush');
    for (const state of ['NONE', undefined, null, 'OFF']) assert.equal(clearNoteKey(state), 'clear.note', String(state));
  });
});

describe('버튼', () => {
  test('끄기는 ON·REPLACED 이고 쓰기 가능할 때, 서버 지우기는 쓰기 가능하고 온라인일 때만', () => {
    for (const state of ['ON', 'REPLACED']) {
      assert.deepEqual(
        pick(serverPushSectionView({ enabled: true, state, readOnly: false, online: true })),
        { canTurnOff: true, canRemoveAll: true },
        state,
      );
      assert.deepEqual(
        pick(serverPushSectionView({ enabled: true, state, readOnly: true, online: true })),
        { canTurnOff: false, canRemoveAll: false },
        `${state} 보기 전용`,
      );
      assert.deepEqual(
        pick(serverPushSectionView({ enabled: true, state, readOnly: true, online: false })),
        { canTurnOff: false, canRemoveAll: false },
        `${state} 오프라인`,
      );
    }
    assert.deepEqual(pick(serverPushSectionView({ enabled: true, state: 'NONE', readOnly: false, online: true })), {
      canTurnOff: false,
      canRemoveAll: true,
    });
    // 쓰기 가능이어도 오프라인이면 서버 지우기를 막는다(저장소 상태가 어긋난 순간)
    assert.equal(serverPushSectionView({ enabled: true, state: 'ON', readOnly: false, online: false }).canRemoveAll, false);
    // 보기 전용 여부를 모르면(하이드레이션 전) 막는다
    assert.deepEqual(pick(serverPushSectionView({ enabled: true, state: 'ON' })), { canTurnOff: false, canRemoveAll: false });
  });

  function pick({ canTurnOff, canRemoveAll }) {
    return { canTurnOff, canRemoveAll };
  }
});

describe('결과 줄', () => {
  test("끄기: { ok: true, pending: false } 일 때만 '껐어요'", () => {
    assert.deepEqual(serverPushTurnOffResult({ ok: true, pending: false }), { key: 'settings.serverPushTurnedOff', pair: false });
    assert.deepEqual(serverPushTurnOffResult({ ok: true, pending: true }), { key: 'settings.serverPushTurnOffPending', pair: true });
    for (const result of [{ ok: false, reason: 'LOGIN_REQUIRED' }, { ok: false, reason: 'UNAVAILABLE' }, { ok: false }, null, undefined, { ok: true }, {}]) {
      assert.deepEqual(serverPushTurnOffResult(result), { key: 'settings.serverPushTurnOffFailed', pair: true }, JSON.stringify(result));
    }
  });

  test('서버 지우기: 성공은 지운 수, LOGIN_REQUIRED 는 로그인 줄, 그 밖은 실패 줄', () => {
    assert.deepEqual(serverPushRemoveResult({ ok: true, deleted: 2 }), { key: 'settings.serverPushRemoved', vars: { count: 2 } });
    assert.deepEqual(serverPushRemoveResult({ ok: true, deleted: 0 }), { key: 'settings.serverPushRemoved', vars: { count: 0 } });
    assert.deepEqual(serverPushRemoveResult({ ok: true, deleted: -1 }), { key: 'settings.serverPushRemoved', vars: { count: 0 } });
    assert.deepEqual(serverPushRemoveResult({ ok: true }), { key: 'settings.serverPushRemoved', vars: { count: 0 } });
    assert.deepEqual(serverPushRemoveResult({ ok: false, reason: 'LOGIN_REQUIRED' }), { key: 'settings.serverPushRemoveLogin' });
    for (const result of [{ ok: false, reason: 'RATE_LIMITED' }, { ok: false, reason: 'UNAVAILABLE' }, { ok: false }, null, undefined]) {
      assert.deepEqual(serverPushRemoveResult(result), { key: 'settings.serverPushRemoveFailed' }, JSON.stringify(result));
    }
  });
});

describe('문구', () => {
  const MESSAGE_KEYS = [
    'settings.serverPushTitle',
    'settings.serverPushOn',
    'settings.serverPushReplaced',
    'settings.serverPushOff',
    'settings.serverPushTurnOff',
    'settings.serverPushTurnedOff',
    'settings.serverPushRemoveAll',
    'settings.serverPushRemoveConfirm',
    'settings.serverPushRemoved',
    'settings.serverPushRemoveLogin',
    'settings.serverPushRemoveFailed',
    'clear.noteServerPush',
  ];
  const SAFETY_KEYS = ['settings.serverPushTurnOffPending', 'settings.serverPushTurnOffFailed', 'settings.serverPushPaused'];
  const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

  function checkEntry(key, entry) {
    for (const lang of LANGS) {
      assert.equal(typeof entry[lang], 'string', `${key}.${lang}`);
      assert.ok(entry[lang].trim().length > 0, `${key}.${lang}`);
      assert.ok(!dashes.test(entry[lang]), `${key}.${lang} 에 대시`);
    }
    assert.ok(!/안전/.test(entry.ko), `${key}.ko`);
    assert.ok(!/\bsafe/i.test(entry.en), `${key}.en`);
    assert.ok(!/安全/.test(entry.ja) && !/安全/.test(entry.zh), `${key} ja·zh`);
    assert.ok(!/[가-힣]/.test(entry.ja) && !/[가-힣]/.test(entry.zh), `${key} ja·zh 에 한글`);
  }

  test('새 문구 키는 네 언어가 모두 있다(버튼·상태 줄은 messages, 알림이 갈 수 있는지 말하는 줄은 safety)', () => {
    for (const key of MESSAGE_KEYS) {
      assert.ok(settingsMessages[key], `${key} 는 messages 에 있다`);
      assert.equal(settingsSafety[key], undefined, `${key} 는 safety 가 아니다`);
      assert.equal(UI_TEXT[key], settingsMessages[key]);
      checkEntry(key, settingsMessages[key]);
    }
    for (const key of SAFETY_KEYS) {
      assert.ok(settingsSafety[key], `${key} 는 safety 에 있다`);
      assert.equal(settingsMessages[key], undefined, `${key} 는 messages 가 아니다`);
      checkEntry(key, settingsSafety[key]);
    }
  });

  test('결과 줄 키는 pair 표시와 같은 블록에 있다', () => {
    for (const result of [{ ok: true, pending: false }, { ok: true, pending: true }, { ok: false }]) {
      const { key, pair } = serverPushTurnOffResult(result);
      assert.ok(pair ? settingsSafety[key] : settingsMessages[key], key);
    }
    for (const result of [{ ok: true, deleted: 1 }, { ok: false, reason: 'LOGIN_REQUIRED' }, { ok: false }]) {
      assert.ok(settingsMessages[serverPushRemoveResult(result).key]);
    }
    // 상태 줄도 같다(멈춤 줄만 안전 문구)
    for (const args of [{ enabled: false, checked: true, state: 'ON' }, { enabled: true, checked: true, state: 'ON' }, { enabled: true, state: 'NONE' }]) {
      const { stateKey, statePair } = serverPushSectionView({ ...WRITABLE, ...args });
      assert.ok(statePair ? settingsSafety[stateKey] : settingsMessages[stateKey], stateKey);
    }
    for (const state of ['ON', 'NONE']) assert.ok(settingsMessages[clearNoteKey(state)], state);
  });

  test('계획의 한국어 원문을 쓰고, 지운 수 자리표시자가 네 언어에 있다', () => {
    assert.equal(settingsMessages['settings.serverPushReplaced'].ko, '다른 기기에서 서버 알림을 다시 설정했어요.');
    assert.equal(settingsMessages['settings.serverPushOff'].ko, '서버 알림이 꺼져 있어요. 보호자 링크를 만들 때 켤 수 있어요.');
    assert.equal(settingsMessages['settings.serverPushTurnedOff'].ko, '서버 알림을 껐어요. 보호자에게 링크를 다시 보내면 반영돼요.');
    assert.equal(settingsMessages['settings.serverPushRemoveLogin'].ko, 'Google 또는 카카오로 로그인해야 지울 수 있어요.');
    assert.equal(
      settingsSafety['settings.serverPushTurnOffPending'].ko,
      '이 기기에서는 껐어요. 서버에 남은 정보는 연결되면 지워요. 그 전까지는 보호자에게 알림이 갈 수 있어요.',
    );
    assert.equal(settingsSafety['settings.serverPushTurnOffFailed'].ko, '서버 알림을 끄지 못했어요. 연결과 로그인을 확인한 뒤 다시 해 주세요.');
    for (const lang of LANGS) assert.match(settingsMessages['settings.serverPushRemoved'][lang], /\{count\}/, lang);
    assert.equal(settingsSafety['settings.serverPushPaused'].ko, '서버 알림이 지금 멈춰 있어요. 그동안 보호자에게 서버 알림이 가지 않아요.');
    assert.equal(
      settingsMessages['clear.noteServerPush'].ko,
      "체류·조건·일정은 이 기기에만 저장됩니다. 서버 알림을 켜 두면 날짜별 복귀 마감 시각과 '돌아왔어요' 기록이 서버에 저장됩니다.",
    );
    // 레코드가 없을 때의 예전 안내는 그대로다
    assert.equal(settingsMessages['clear.note'].ko, '체류·조건·일정은 이 기기에만 저장됩니다. 서버에는 저장되지 않습니다.');
  });
});
