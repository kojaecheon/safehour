'use client';

// 교체 시트: 같은 자리에 넣을 수 있는 후보 최대 5곳 (AX-317 · docs/business-rules.md '사용자 편집'의 교체)
//
//   - 후보는 서버가 게이트와 외출 전체 재검증(복귀 계산·보행 누적·이동 한도)을 통과시킨 것만 준다(최대 5곳).
//     각 후보에 그 후보를 넣었을 때의 외출 미리보기(도착·머무름·예상 귀가·복귀 여유)를 붙인다.
//   - 고르면 동기화 모듈 applySwap 이 편집 기록(고정·삭제)과 함께 그 날짜를 다시 판정한다. 그사이 판정이 바뀌어
//     넣을 수 없으면 아무것도 저장하지 않고 이유를 보인다. 교체한 장소는 '직접 고름'(고정)으로 표시된다.
//   - 시트 닫기·뒤로 가기는 시트만 닫는다(useModalSheet).

import { useEffect, useState } from 'react';
import CourseCard from '../CourseCard.js';
import { useLang } from '../LanguageProvider.js';
import { Sheet } from '../ui/index.js';
import TripNotice from './TripNotice.js';
import { editErrorKey } from './viewModel.js';

/**
 * @param {object} props
 * @param {string} props.date
 * @param {string} props.outingId
 * @param {object} props.stop                 바꿀 정거장
 * @param {(date: string, outingId: string, stopId: string) => Promise<object>} props.loadAlternatives
 * @param {(date: string, stopId: string, alternative: object) => Promise<object>} props.applySwap
 * @param {(messageKey: string) => void} props.onDone   바꾼 뒤(시트를 닫은 뒤 알릴 문구)
 * @param {() => void} props.onClose
 */
export default function SwapSheet({ date, outingId, stop, loadAlternatives, applySwap, onDone, onClose }) {
  const { t } = useLang();
  const [state, setState] = useState({ status: 'loading', alternatives: [], paused: false, errorKey: null });
  const [picking, setPicking] = useState(null);

  useEffect(() => {
    let alive = true;
    loadAlternatives(date, outingId, stop.id).then((res) => {
      if (!alive) return;
      if (res?.ok) setState({ status: 'ready', alternatives: (res.alternatives ?? []).slice(0, 5), paused: res.servicePaused === true, errorKey: null });
      else setState({ status: 'error', alternatives: [], paused: false, errorKey: editErrorKey(res?.code) });
    });
    return () => {
      alive = false;
    };
  }, [date, outingId, stop.id, loadAlternatives]);

  async function pick(alternative, requestClose) {
    if (picking) return;
    setPicking(alternative.stop?.contentId ?? 'x');
    const res = await applySwap(date, stop.id, alternative);
    setPicking(null);
    if (res?.ok) {
      onDone('trip.swapped');
      requestClose();
    } else {
      setState((s) => ({ ...s, errorKey: editErrorKey(res?.code) }));
    }
  }

  return (
    <Sheet title={t('trip.swapTitle')} onClose={onClose}>
      {({ requestClose }) => (
        <div className="trip-swap">
          <p className="trip-swap-from">{t('trip.swapFrom', { title: stop.title })}</p>
          <p className="trip-swap-lead">{t('trip.swapLead')}</p>
          <div role="status" className="trip-swap-status">
            {state.status === 'loading' && t('trip.swapLoading')}
            {picking && t('trip.working')}
          </div>
          {state.errorKey && (
            <TripNotice as="p" error role="alert">
              {t(state.errorKey)}
            </TripNotice>
          )}
          {state.status === 'ready' && state.alternatives.length === 0 && (
            <p className="trip-swap-empty">{state.paused ? t('trip.swapPaused') : t('trip.swapEmpty')}</p>
          )}
          {state.alternatives.length > 0 && (
            <ul className="trip-swap-list">
              {state.alternatives.map((alt) => {
                const preview = alt.outingPreview ?? {};
                const alternative = alt.stop;
                if (!alternative) return null;
                return (
                  <li key={alternative.contentId}>
                    <CourseCard stop={alternative} link={false} headingLevel={3} showPinned={false}>
                      <ul className="trip-swap-preview">
                        <li>
                          <time>{alternative.arriveAt}</time>–<time>{alternative.leaveAt}</time>
                        </li>
                        {preview.plannedReturnAt && <li>{t('trip.plannedReturn', { time: preview.plannedReturnAt })}</li>}
                        {Number.isFinite(preview.slackMin) && <li>{t('trip.swapSlack', { n: preview.slackMin })}</li>}
                      </ul>
                      <button
                        type="button"
                        className="btn btn-small"
                        aria-disabled={picking ? 'true' : undefined}
                        onClick={() => pick(alt, requestClose)}
                      >
                        {t('trip.swapPick')}
                        <span className="visually-hidden"> — {alternative.title}</span>
                      </button>
                    </CourseCard>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
