'use client';

// 더보기의 설치 안내 상자 (S5)
//
// 홈 화면에 설치된 앱으로 열리지 않았을 때만 보인다. 도움말(/help#install)로 이어 준다.
//   - 서버에서 그릴 때와 첫 그림은 "설치됨"으로 보고 아무것도 그리지 않는다. 하이드레이션 뒤에 기기 값을 읽는다.
//   - 시안 보드는 이 화면을 쓰지 않는다(기기 값을 읽지 않는 규칙). 시안이 이 부품을 쓰게 되면 `disabled` 를 준다.
//   - 닫기 버튼은 없다. 탭 임시 보관(sessionStorage)은 보호자 링크 전용이라 다른 용도로 쓰지 않는다.

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import Icon from '@/components/ui/Icon.js';
import { readInstalled } from './installState.js';

const NO_SUBSCRIPTION = () => () => {};
const subscribe = NO_SUBSCRIPTION;
const getServerSnapshot = () => true;

export default function InstallCallout({ disabled = false }) {
  const { t } = useLang();
  const installed = useSyncExternalStore(subscribe, readInstalled, getServerSnapshot);
  if (disabled || installed) return null;
  return (
    <section className="more-install" aria-label={t('help.installTitle')}>
      <div className="ui-callout has-icon" role="note">
        <span className="ui-callout-icon" aria-hidden="true">
          <Icon name="info" size={20} />
        </span>
        <div className="more-install-text">
          <p>{t('help.installCallout')}</p>
          <Link href="/help#install" className="more-install-link">
            {t('help.installCalloutLink')}
          </Link>
        </div>
      </div>
    </section>
  );
}
