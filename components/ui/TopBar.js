'use client';

// 화면 상단 바 (AX-304) — 새 화면이 같은 모양의 머리를 쓰게 한다.
//
//   <TopBar title={화면 제목} backHref="/trip" />
//
// - 제목은 기본 h1 이다. 좁은 화면에서는 줄바꿈 대신 말줄임으로 줄어든다(전체 이름은 DOM 에 남는다).
// - 오른쪽에 언어 선택(지구본 버튼)이 늘 붙는다 — 4개 언어가 늘어도 제목 자리를 빼앗지 않는다.
// - 뒤로 가기는 backHref(링크) 또는 onBack(버튼) 중 하나. 44px 터치 대상.
// - actions 는 언어 선택 앞에 붙는 작은 버튼 자리다(44px 이상을 지킨다).

import Link from 'next/link';
import { useLang } from '../LanguageProvider.js';
import LanguageToggle from '../LanguageToggle.js';
import Icon from './Icon.js';

export default function TopBar({ title, titleLang, backHref, onBack, backLabel, as: Heading = 'h1', actions }) {
  const { t } = useLang();
  const label = backLabel ?? t('common.back');
  return (
    <header className="top-bar">
      {backHref ? (
        <Link className="back" href={backHref} aria-label={label}>
          <Icon name="chevronLeft" size={24} />
        </Link>
      ) : onBack ? (
        <button type="button" className="back" aria-label={label} onClick={onBack}>
          <Icon name="chevronLeft" size={24} />
        </button>
      ) : null}
      <Heading className="brand" lang={titleLang}>
        {title}
      </Heading>
      {actions}
      <LanguageToggle />
    </header>
  );
}
