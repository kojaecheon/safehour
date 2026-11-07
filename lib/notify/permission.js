// 기기 알림 켜기 (설정 화면과 보호자 받은 일정 화면이 함께 쓴다)
//
// 브라우저 알림 권한은 사용자가 켜기를 누른 순간에만 묻는다. 이 함수가 그 유일한 자리다.
//   - Notification 이 없으면 'unsupported'
//   - 권한이 'default' 일 때만 요청한다. 'granted' 가 아니면 'denied' (켜짐을 저장하지 않는다)
//   - 'granted' 면 prefs.notifications = true 를 쓰고 'on'. 쓰기 실패는 'failed'

/**
 * @param {object} args
 * @param {{ writePrefs: (patch: object) => { ok: boolean } }} args.store
 * @param {{ permission: string, requestPermission: () => Promise<string> } | undefined} [args.NotificationImpl]
 * @returns {Promise<'on'|'denied'|'unsupported'|'failed'>}
 */
export async function turnOnDeviceNotifications({ store, NotificationImpl = globalThis.Notification }) {
  if (!NotificationImpl) return 'unsupported';
  let permission = NotificationImpl.permission;
  if (permission === 'default') {
    try {
      permission = await NotificationImpl.requestPermission();
    } catch {
      permission = 'denied';
    }
  }
  if (permission !== 'granted') return 'denied';
  return store.writePrefs({ notifications: true }).ok ? 'on' : 'failed';
}
