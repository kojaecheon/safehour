'use client';

// 하루 소개 문장 — AI 또는 정해진 문장 (AX-317 · spec 4.16 · 규칙 36 · ADR-0008)
//
//   - 요청은 허용 목록만 담는다: 언어, 그날 환자 정거장의 공개 이름·유형·도착 시각, 관심사, 이동 강도
//     (viewModel.introRequestFor). 조건·병원·숙소·날짜·계정은 보내지 않는다.
//   - 같은 요청이면 기기에 저장한 문장을 다시 쓴다(getStore().readAiIntro / writeAiIntro). 하루 내용이 바뀌면
//     요청이 달라지므로 한 번 더 받는다. 보기 전용(로그인 만료·오프라인)이면 부르지 않고 저장한 문장만 보인다.
//   - source 가 AI 면 'AI 소개' 출처 영역에 'AI가 쓴 소개'라고 밝힌다. 템플릿이면 '정해진 문장'이라고 밝힌다.
//     어느 쪽이든 판정·사유 영역과 시각적으로 떨어진 별도 영역이다. 이 문장은 판정에 쓰지 않는다.
//   - 실패하면 아무것도 보이지 않는다(판정과 무관한 보강이다).

import { useEffect, useId, useMemo, useSyncExternalStore } from 'react';
import { useLang } from '../LanguageProvider.js';
import { Icon, SourceArea } from '../ui/index.js';
import { getStore } from '@/lib/store/index.js';
import { introCacheKey, introRequestFor } from './viewModel.js';

const INTRO_PATH = '/api/itinerary/intro';
/** 같은 키를 두 번 받지 않는다(화면을 오가도) */
const inFlight = new Set();

function subscribeIntro(onChange) {
  return getStore().subscribe('aiIntroCache', onChange);
}

async function fetchIntro(key, body) {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const res = await fetch(INTRO_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok === true && typeof data.text === 'string' && data.text && (data.source === 'AI' || data.source === 'TEMPLATE')) {
      getStore().writeAiIntro(key, { text: data.text, source: data.source });
    }
  } catch {
    // 연결 실패 — 소개 문장은 보강일 뿐이다. 다음에 화면을 열 때 다시 받는다
  } finally {
    inFlight.delete(key);
  }
}

/**
 * @param {object} props
 * @param {object|null} props.day
 * @param {object|null} props.stay
 * @param {boolean} props.readOnly
 */
export default function IntroArea({ day, stay, readOnly }) {
  const { t, lang } = useLang();
  const labelId = useId();
  const request = useMemo(() => introRequestFor(day, stay, lang), [day, stay, lang]);
  const key = request ? introCacheKey(request) : null;
  const intro = useSyncExternalStore(
    subscribeIntro,
    () => (key ? getStore().readAiIntro(key) : null),
    () => null,
  );

  useEffect(() => {
    if (!key || intro || readOnly) return;
    void fetchIntro(key, request);
  }, [key, intro, readOnly, request]);

  if (!intro) return null;

  if (intro.source === 'AI') {
    return (
      <SourceArea source="ai" title={t('trip.introTitle')} note={t('trip.introAiNote')}>
        <p>{intro.text}</p>
      </SourceArea>
    );
  }
  return (
    <section className="trip-intro" aria-labelledby={labelId}>
      <p className="trip-intro-head" id={labelId}>
        <Icon name="quote" size={18} />
        <span>{t('trip.introTemplateLabel')}</span>
      </p>
      <p className="trip-intro-text">{intro.text}</p>
      <p className="trip-intro-note">{t('trip.introTemplateNote')}</p>
    </section>
  );
}
