'use client';

// 다시 만들기 확인 대화 (AX-317 · spec 4.10 다시 만들기)
//
// 범위는 '이 날짜' 또는 '오늘 이후 전체'다. 확인을 받은 뒤에만 동기화 모듈 regenerate 를 부른다.
// 고정·삭제·비움 기록을 지우고 새로 만든다. 오늘 이미 출발한 외출과 즉시 복귀 상태는 동기화 모듈이 지킨다.

import { useId, useState } from 'react';
import { useLang } from '../LanguageProvider.js';
import { Sheet } from '../ui/index.js';
import TripNotice from './TripNotice.js';
import { editErrorKey } from './viewModel.js';

/**
 * @param {object} props
 * @param {string|null} props.date            '이 날짜' 범위의 날짜 (없으면 '오늘 이후 전체'만)
 * @param {string} [props.dateLabel]
 * @param {'DAY'|'FROM_TODAY'} [props.initialScope]
 * @param {(scope: 'DAY'|'FROM_TODAY', date: string|null) => Promise<object>} props.regenerate
 * @param {(messageKey: string) => void} props.onDone
 * @param {() => void} props.onClose
 */
export default function RegenerateSheet({ date, dateLabel, initialScope = 'DAY', regenerate, onDone, onClose }) {
  const { t } = useLang();
  const name = useId();
  const [scope, setScope] = useState(date ? initialScope : 'FROM_TODAY');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);

  async function confirm(requestClose) {
    if (busy) return;
    setBusy(true);
    setErrorKey(null);
    const res = await regenerate(scope, scope === 'DAY' ? date : null);
    setBusy(false);
    if (res?.ok) {
      onDone('trip.regenerateDone');
      requestClose();
    } else {
      setErrorKey(editErrorKey(res?.code));
    }
  }

  const options = [
    ...(date ? [{ value: 'DAY', label: t('trip.regenerateDay'), sub: dateLabel }] : []),
    { value: 'FROM_TODAY', label: t('trip.regenerateFromToday'), sub: null },
  ];

  return (
    <Sheet
      title={t('trip.regenerateTitle')}
      onClose={onClose}
      footer={({ requestClose }) => (
        <div className="trip-sheet-actions">
          <button type="button" className="btn" aria-disabled={busy ? 'true' : undefined} onClick={() => confirm(requestClose)}>
            {busy ? t('trip.working') : t('trip.regenerateConfirm')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={requestClose}>
            {t('trip.cancel')}
          </button>
        </div>
      )}
    >
      <p>{t('trip.regenerateBody')}</p>
      <fieldset className="trip-scope">
        <legend>{t('trip.regenerateScope')}</legend>
        <div className="radio-group">
          {options.map((option) => (
            <label key={option.value} className={scope === option.value ? 'radio-option selected' : 'radio-option'}>
              <input type="radio" name={name} value={option.value} checked={scope === option.value} onChange={() => setScope(option.value)} />
              <span>
                <span className="trip-scope-label">{option.label}</span>
                {option.sub && <span className="sub">{option.sub}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {errorKey && (
        <TripNotice as="p" error role="alert">
          {t(errorKey)}
        </TripNotice>
      )}
    </Sheet>
  );
}
