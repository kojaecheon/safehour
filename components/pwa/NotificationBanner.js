'use client';

// 앱 안 알림 배너 (AX-319 · spec 4.13)
//
// 예약한 시각이 되면 기기 알림과 **함께 항상** 이 배너가 뜬다 — 알림 권한이 없거나 설정에서 꺼 두었어도 뜬다.
//   - 화면 데이터를 받지 않는다. 저장소의 오늘 일정으로 실행기(lib/notify)가 스스로 예약한다.
//   - 이미 앱 전체에 한 번 달려 있다(app/layout.js → PwaRuntime). 화면이 따로 다시 달지 않는다 —
//     두 번 달면 배너가 두 개 보인다.
//   - 문구는 notifications 이름공간의 안전 문구다: 주 언어 + 병기 줄(safetyPair). 조건·병원·복약 정보가 없다(규칙 47).
//   - 닫을 수 있고, 목표 시각이 지나면 스스로 사라진다. 자리(aria-live)는 늘 DOM 에 남아 뜨는 순간 읽어 준다.
//
// 스타일: 공용 안내 상자(SEED Callout, .ui-callout.has-icon: 앞 20px info 아이콘 칸, 왼쪽 색 띠 없음, 설계서 5.6)를 쓴다.
//   떠 있는 자리·그림자·닫기 칸은 app/styles/ui.css 의 .pwa-notify-* 규칙이 정한다(기능 스타일 파일은 새로 만들지 않는다).

import Link from 'next/link';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import Icon from '@/components/ui/Icon.js';
import { getNotifier } from '@/lib/notify/client.js';
import { notificationOpenUrl } from '@/lib/notify/device.js';
import { NOTIFY_TITLE_KEY } from '@/lib/notify/text.js';

const NO_SUBSCRIPTION = () => {};

function subscribe(onChange) {
  return getNotifier()?.subscribe(onChange) ?? NO_SUBSCRIPTION;
}

function getSnapshot() {
  return getNotifier()?.getBanner() ?? null;
}

function getServerSnapshot() {
  return null;
}

export default function NotificationBanner() {
  const { t, pair } = useLang();
  const item = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 실행기를 시작한다 — 여러 번 불러도 한 번만 시작한다
  useEffect(() => {
    getNotifier()?.start();
  }, []);

  const dismiss = useCallback(() => getNotifier()?.dismiss(), []);

  const openUrl = notificationOpenUrl(item);
  const lines = item ? pair(item.key, { time: item.time }) : null;

  return (
    <div className="pwa-notify-slot" aria-live="assertive" aria-atomic="true">
      {item && lines && (
        <section className="ui-callout has-icon pwa-notify" aria-label={t(NOTIFY_TITLE_KEY)} data-notify-kind={item.kind}>
          <span className="ui-callout-icon" aria-hidden="true">
            <Icon name="info" size={20} />
          </span>
          <div className="pwa-notify-text">
            <strong className="pwa-notify-title">{t(NOTIFY_TITLE_KEY)}</strong>
            <p className="pwa-notify-primary" lang={lines.primary.lang}>
              {lines.primary.text}
            </p>
            <p className="pwa-notify-secondary" lang={lines.secondary.lang}>
              {lines.secondary.text}
            </p>
            <Link href={openUrl} className="pwa-notify-link" onClick={dismiss}>
              {t(openUrl === '/g' ? 'notifications.openGuardianCopy' : 'notifications.openToday')}
            </Link>
          </div>
          <button type="button" className="pwa-notify-close" onClick={dismiss} aria-label={t('notifications.dismiss')}>
            <Icon name="close" size={20} />
          </button>
        </section>
      )}
    </div>
  );
}
