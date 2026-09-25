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
// 스타일: 기능 스타일 파일을 새로 만들지 않고(app/layout.js 등록 규칙) 토큰 변수만 쓰는 인라인 스타일로 그린다.

import Link from 'next/link';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import Icon from '@/components/ui/Icon.js';
import { getNotifier } from '@/lib/notify/client.js';
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

const SLOT = {
  position: 'fixed',
  zIndex: 45,
  top: 'calc(var(--space-3) + env(safe-area-inset-top))',
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: '0 var(--gutter)',
  pointerEvents: 'none',
};

const CARD = {
  pointerEvents: 'auto',
  width: '100%',
  maxWidth: 'calc(var(--shell-max) - 2 * var(--gutter))',
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'flex-start',
  padding: 'var(--space-3) var(--space-2) var(--space-3) var(--space-4)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--line-strong)',
  borderLeft: '4px solid var(--accent)',
  borderRadius: 'var(--radius-16)',
  boxShadow: 'var(--shadow-float)',
};

const ICON = {
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  width: '32px',
  height: '32px',
  borderRadius: 'var(--radius-full)',
  background: 'var(--accent-soft)',
  color: 'var(--accent-strong)',
};

const TEXT = { minWidth: 0, flex: 1 };
const TITLE = { display: 'block', fontWeight: 'var(--weight-heavy)', lineHeight: 'var(--leading-snug)' };
const PRIMARY = { marginTop: 'var(--space-1)', fontSize: 'var(--text-body)', color: 'var(--ink)' };
const SECONDARY = { fontSize: 'var(--text-body)', color: 'var(--ink-soft)' };
const LINK = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 'var(--tap-min)',
  fontWeight: 'var(--weight-bold)',
  color: 'var(--accent-strong)',
  textDecoration: 'underline',
  textUnderlineOffset: '4px',
};
const CLOSE = {
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  width: 'var(--tap-min)',
  height: 'var(--tap-min)',
  border: 0,
  borderRadius: 'var(--radius-full)',
  background: 'transparent',
  color: 'var(--ink-soft)',
  cursor: 'pointer',
};

export default function NotificationBanner() {
  const { t, pair } = useLang();
  const item = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 실행기를 시작한다 — 여러 번 불러도 한 번만 시작한다
  useEffect(() => {
    getNotifier()?.start();
  }, []);

  const dismiss = useCallback(() => getNotifier()?.dismiss(), []);

  const lines = item ? pair(item.key, { time: item.time }) : null;

  return (
    <div className="pwa-notify-slot" style={SLOT} aria-live="assertive" aria-atomic="true">
      {item && lines && (
        <section className="pwa-notify" style={CARD} aria-label={t(NOTIFY_TITLE_KEY)} data-notify-kind={item.kind}>
          <span style={ICON}>
            <Icon name="flag" size={18} />
          </span>
          <div style={TEXT}>
            <strong style={TITLE}>{t(NOTIFY_TITLE_KEY)}</strong>
            <p style={PRIMARY} lang={lines.primary.lang}>
              {lines.primary.text}
            </p>
            <p style={SECONDARY} lang={lines.secondary.lang}>
              {lines.secondary.text}
            </p>
            <Link href="/today" style={LINK} onClick={dismiss}>
              {t('notifications.openToday')}
            </Link>
          </div>
          <button type="button" style={CLOSE} onClick={dismiss} aria-label={t('notifications.dismiss')}>
            <Icon name="close" size={20} />
          </button>
        </section>
      )}
    </div>
  );
}
