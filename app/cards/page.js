'use client';

// /cards: 한국어 안내 카드 (AX-318 · docs/platform/IA_AND_FLOWS.md '경로'·'보기 전용 상태', docs/business-rules.md '알림과 카드'·'운영 안전장치')
//
// 식당 직원·택시 기사에게 보여 주는 고정 문구 카드다. 로그인 만료·오프라인에서도 열린다
// (이 기기에 마지막으로 로그인한 계정의 사본을 읽기만 한다). 추천 중단 스위치와도 무관하다.
// 본문은 components/cards/TodayCards.js, 무엇을 넣을지는 components/cards/cardModel.js 가 정한다.

import { useLang } from '@/components/LanguageProvider.js';
import TodayCards from '@/components/cards/TodayCards.js';
import { TopBar } from '@/components/ui/index.js';

export default function CardsPage() {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t('cards.header')} backHref="/more" />
      <main className="page cards-page is-basement">
        <TodayCards intro={<p className="cards-intro">{t('cards.intro')}</p>} />
      </main>
    </>
  );
}
