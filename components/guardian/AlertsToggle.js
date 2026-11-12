'use client';

// 복귀 마감 알림 스위치 (보호자 화면 전용, docs/business-rules.md '보호자')
//
// 설정 화면의 알림 스위치와 같은 기기 설정(prefs.notifications)을 읽고 쓴다.
// 켤 때는 설정 화면과 같은 turnOnDeviceNotifications 로 권한을 요청한다.
// 저장소를 읽으므로 GuardianOpen 만 쓴다. 디자인 보드는 AlertsToggleView 를 고정 상태로 그린다.

import { useState } from 'react';
import { usePrefs } from '@/components/cards/useDeviceData.js';
import useStoreStatus, { shouldShowReadOnly } from '@/components/ui/useStoreStatus.js';
import { turnOnDeviceNotifications } from '@/lib/notify/permission.js';
import { READ_ONLY_REASON, getStore } from '@/lib/store/index.js';
import AlertsToggleView from './AlertsToggleView.js';

/** 로그인하고 받은 일정 화면으로 돌아온다 */
const LOGIN_HREF = `/login?returnTo=${encodeURIComponent('/g')}`;

export default function AlertsToggle() {
  const prefs = usePrefs();
  const status = useStoreStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const on = prefs?.notifications === true;

  async function onChange(event) {
    if (status.readOnly || busy) return;
    const want = event.target.checked;
    setBusy(true);
    try {
      if (want) setMessage(await turnOnDeviceNotifications({ store: getStore() }));
      else setMessage(getStore().writePrefs({ notifications: false }).ok ? 'off' : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertsToggleView
      on={on}
      disabled={status.readOnly || busy || prefs === null}
      message={message}
      showReadOnly={shouldShowReadOnly(status)}
      offline={status.reason === READ_ONLY_REASON.OFFLINE}
      loginHref={LOGIN_HREF}
      onChange={onChange}
    />
  );
}
