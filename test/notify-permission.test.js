// 기기 알림 켜기 흐름 (설정 화면과 보호자 받은 일정 화면이 함께 쓴다)
//   권한 요청은 'default' 일 때만, granted 일 때만 prefs.notifications 를 켠다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { turnOnDeviceNotifications } from '../lib/notify/permission.js';

function fakeStore({ ok = true } = {}) {
  const writes = [];
  return {
    writes,
    writePrefs(patch) {
      writes.push(patch);
      return { ok };
    },
  };
}

function fakeNotification(permission, requested) {
  return {
    permission,
    async requestPermission() {
      requested.count += 1;
      return requested.answer;
    },
  };
}

test('권한이 default 면 요청하고 granted 면 켠다', async () => {
  const store = fakeStore();
  const requested = { count: 0, answer: 'granted' };
  const result = await turnOnDeviceNotifications({ store, NotificationImpl: fakeNotification('default', requested) });
  assert.equal(result, 'on');
  assert.equal(requested.count, 1);
  assert.deepEqual(store.writes, [{ notifications: true }]);
});

test('이미 granted 면 다시 묻지 않고 켠다', async () => {
  const store = fakeStore();
  const requested = { count: 0, answer: 'granted' };
  assert.equal(await turnOnDeviceNotifications({ store, NotificationImpl: fakeNotification('granted', requested) }), 'on');
  assert.equal(requested.count, 0);
});

test('denied 면 켜지 않는다', async () => {
  const store = fakeStore();
  const requested = { count: 0, answer: 'denied' };
  assert.equal(await turnOnDeviceNotifications({ store, NotificationImpl: fakeNotification('default', requested) }), 'denied');
  assert.equal(await turnOnDeviceNotifications({ store, NotificationImpl: fakeNotification('denied', requested) }), 'denied');
  assert.deepEqual(store.writes, []);
});

test('요청이 던지면 denied 로 본다', async () => {
  const store = fakeStore();
  const NotificationImpl = {
    permission: 'default',
    async requestPermission() {
      throw new Error('blocked');
    },
  };
  assert.equal(await turnOnDeviceNotifications({ store, NotificationImpl }), 'denied');
  assert.deepEqual(store.writes, []);
});

test('Notification 이 없으면 unsupported', async () => {
  const store = fakeStore();
  assert.equal(await turnOnDeviceNotifications({ store, NotificationImpl: undefined }), 'unsupported');
  assert.deepEqual(store.writes, []);
});

test('저장 실패면 failed', async () => {
  const store = fakeStore({ ok: false });
  const requested = { count: 0, answer: 'granted' };
  assert.equal(await turnOnDeviceNotifications({ store, NotificationImpl: fakeNotification('granted', requested) }), 'failed');
});
