'use client';

// 오늘의 한국어 안내 카드 화면 본문 (AX-318 · spec 4.12 · 4.14 · 4.18 · 규칙 40)
//
//   식이 → 이동 → 복귀 → 병원 순서. 위에 바로가기 칩을 둔다.
//
// - **고정 문구만 쓴다.** 카드의 한국어 문장은 src/i18n/messages/cards.js 의 ko 값이고, AI 를 쓰지 않는다.
//   사용자 언어 설명은 같은 키의 en·ja·zh 값이다(선택 언어가 한국어면 설명을 붙이지 않는다).
// - **보기 전용·오프라인에서도 보인다.** 기기 저장소의 마지막 계정 사본만 읽고, 쓰기·네트워크가 없다.
// - 복귀·병원 카드는 주소 글자만 보여준다. 숙소·병원 좌표·지도 링크를 두지 않는다(spec 4.14 · 규칙 39).
// - 매일 확인 전이면 이동 카드 위에 '오늘 조건 확인 전' 안전 문구를 병기한다(spec 4.6). 카드 자체는 가리지 않는다.
// - SEED ③층(설계서 6.2 9번): 회색 바탕 위 흰 블록. 첫 블록(안내·날짜·바로가기 칩) / 식이 / 이동 / 복귀 / 병원. 칩은 바로가기 링크다(카드는 늘 모두 보인다).

import Link from 'next/link';
import { useLang } from '../LanguageProvider.js';
import { Button, EmptyState, Icon, KoreanCard } from '../ui/index.js';
import PairText from '../settings/PairText.js';
import { isDailyCheckPending } from '@/src/stay/index.js';
import { translate } from '@/src/i18n/index.js';
import { DIET_STATUS, buildTodayCards } from './cardModel.js';
import { useHydrated, usePrefs, useStay, useTodayTomorrow } from './useDeviceData.js';

/** 식이 항목 → 고정 문장 키. ko 값이 카드 본문, 나머지 언어가 설명이다 */
const DIET_KEY = Object.freeze({
  spicy: 'cards.dietSpicy',
  alcohol: 'cards.dietAlcohol',
  hard: 'cards.dietHard',
  hot: 'cards.dietHot',
  raw: 'cards.dietRaw',
});

const SECTIONS = Object.freeze([
  { id: 'cards-diet', key: 'cards.dietTitle' },
  { id: 'cards-move', key: 'cards.moveTitle' },
  { id: 'cards-return', key: 'cards.returnTitle' },
  { id: 'cards-hospital', key: 'cards.hospitalTitle' },
]);

const DAILY_CHECK_KEY = 'cards.dailyCheckPending';

/** 같은 줄이 두 번 나오지 않게(카드 틀이 줄 글자를 key 로 쓴다) */
function uniqueLines(lines) {
  return [...new Set(lines.filter(Boolean))];
}

function formatDate(date, locale) {
  try {
    return new Date(`${date}T12:00:00+09:00`).toLocaleDateString(locale, {
      timeZone: 'Asia/Seoul',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
  } catch {
    return date;
  }
}

function Section({ id, title, children }) {
  return (
    <section className="ui-block cards-section" id={id} aria-labelledby={`${id}-title`} tabIndex={-1}>
      <h2 className="cards-section-title" id={`${id}-title`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Note({ children, action }) {
  return (
    <div className="ui-callout cards-note">
      <p>{children}</p>
      {action}
    </div>
  );
}

function DietSection({ diet }) {
  const { t, lang } = useLang();
  if (diet.status === DIET_STATUS.APPLIED) {
    const keys = diet.items.map((item) => DIET_KEY[item]);
    return (
      <KoreanCard title={t('cards.dietTitle')} korean={uniqueLines(keys.map((key) => translate(key, 'ko')))}>
        {lang !== 'ko' && (
          <div className="cards-explain">
            <p className="cards-explain-title">{t('cards.explainTitle')}</p>
            <ul role="list">
              {keys.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
        )}
      </KoreanCard>
    );
  }
  if (diet.status === DIET_STATUS.NEEDS_INPUT) {
    return (
      <Note
        action={
          <Link className="cards-link" href="/conditions">
            {t('cards.conditionsAction')}
          </Link>
        }
      >
        {t('cards.dietNeedsInput')}
      </Note>
    );
  }
  if (diet.status === DIET_STATUS.NONE) return <Note>{t('cards.dietNone')}</Note>;
  return null;
}

function MoveCard({ move }) {
  const { t, lang } = useLang();
  const title = [
    move.role === 'G' ? t('cards.moveGuardian') : null,
    move.arriveAt ? t('cards.moveArrive', { time: move.arriveAt }) : t('cards.moveTitle'),
  ]
    .filter(Boolean)
    .join(' · ');
  const korean = uniqueLines([translate('cards.moveKo', 'ko'), move.koTitle, move.koAddress]);
  const explanation = lang === 'ko' ? undefined : t('cards.moveKo');

  return (
    <KoreanCard title={title} korean={korean} explanation={explanation}>
      {move.needsKoreanCheck && (
        <div className="cards-fallback">
          <p className="cards-flag">
            <Icon name="clockQuestion" size={18} />
            <span lang="ko">{translate('cards.koAddressMissing', 'ko')}</span>
            {lang !== 'ko' && <span>{t('cards.koAddressMissing')}</span>}
          </p>
          <div className="cards-fallback-text" lang={move.displayLang ?? undefined}>
            {!move.koTitle && move.displayTitle && <p className="cards-fallback-title">{move.displayTitle}</p>}
            {move.displayAddress && <p>{move.displayAddress}</p>}
          </div>
          <p className="cards-fallback-body">{t('cards.koAddressMissingBody')}</p>
        </div>
      )}
    </KoreanCard>
  );
}

export default function TodayCards({ intro = null }) {
  const { t, lang, locale } = useLang();
  const hydrated = useHydrated();
  const stay = useStay();
  const todayTomorrow = useTodayTomorrow();
  const prefs = usePrefs();

  if (!hydrated || !todayTomorrow) {
    return (
      <div className="ui-block cards-top-block">
        {intro}
        <div className="loading-block">
          <div className="spinner" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const { date, plan } = todayTomorrow.today;
  const cards = buildTodayCards({ stay, dayPlan: plan ? { ...plan, date: plan.date ?? date } : null, date });
  const hasAnything = Boolean(stay) || cards.moves.length > 0;

  if (!hasAnything) {
    return (
      <>
        <div className="ui-block cards-top-block">{intro}</div>
        <div className="ui-block">
          <EmptyState
            icon="quote"
            title={t('cards.emptyTitle')}
            body={t('cards.emptyBody')}
            action={<Button href="/onboarding">{t('cards.emptyAction')}</Button>}
          />
        </div>
      </>
    );
  }

  let dailyCheckPending = false;
  try {
    dailyCheckPending = Boolean(stay) && isDailyCheckPending(stay, date, prefs?.dailyCheck ?? {});
  } catch {
    dailyCheckPending = false;
  }
  const outsideStay = cards.diet.status === DIET_STATUS.OUTSIDE_STAY;

  return (
    <>
      <div className="ui-block cards-top-block">
        {intro}
        <p className="cards-date">{t('cards.todayLabel', { date: formatDate(date, locale) })}</p>

        <nav className="cards-jump" aria-label={t('cards.jumpAria')}>
          <ul role="list">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{t(section.key)}</a>
              </li>
            ))}
          </ul>
        </nav>

        {outsideStay && <Note>{t('cards.outsideStay')}</Note>}
      </div>

      <Section id="cards-diet" title={t('cards.dietTitle')}>
        <DietSection diet={cards.diet} />
      </Section>

      <Section id="cards-move" title={t('cards.moveTitle')}>
        {dailyCheckPending && (
          <div className="cards-pending" role="note">
            <Icon name="stateStandby" size={22} />
            <div>
              <PairText k={DAILY_CHECK_KEY} />
              <Link className="cards-link" href="/today">
                {t('cards.todayAction')}
              </Link>
            </div>
          </div>
        )}
        {cards.moves.length > 0 ? (
          cards.moves.map((move) => <MoveCard key={move.stopId} move={move} />)
        ) : (
          <Note>{t('cards.moveNone')}</Note>
        )}
      </Section>

      <Section id="cards-return" title={t('cards.returnTitle')}>
        {cards.returnCard ? (
          <KoreanCard
            title={t('cards.returnTitle')}
            korean={uniqueLines([translate('cards.returnKo', 'ko'), cards.returnCard.name, cards.returnCard.address])}
            explanation={lang === 'ko' ? undefined : t('cards.returnKo')}
          />
        ) : (
          <Note>{t('cards.returnNone')}</Note>
        )}
      </Section>

      <Section id="cards-hospital" title={t('cards.hospitalTitle')}>
        {cards.hospitals.length > 0 ? (
          cards.hospitals.map((hospital) => (
            <KoreanCard
              key={hospital.hospitalId}
              title={
                hospital.appointmentToday
                  ? `${t('cards.hospitalTitle')} · ${t('cards.hospitalToday')}`
                  : t('cards.hospitalTitle')
              }
              korean={uniqueLines([translate('cards.hospitalKo', 'ko'), hospital.name, hospital.address])}
              explanation={lang === 'ko' ? undefined : t('cards.hospitalKo')}
            />
          ))
        ) : (
          <Note>{t('cards.hospitalNone')}</Note>
        )}
      </Section>
    </>
  );
}
