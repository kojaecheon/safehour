'use client';

// 조건 — 조건 기간 목록·입력·수정, 민감정보 동의 (AX-315 · spec 3.1, 4.4, 4.5, 4.19)
//
// 화면 원칙
//   - 동의가 먼저다. 동의가 없으면 본인 체크 입력과 병원 연동을 열지 않는다(spec 4.19).
//     거부하면 수술·시술 전 자유일만 일정이 생긴다는 것을 알려준다.
//   - 본인 체크는 정해진 항목만 고른다. 자유 서술 칸은 없고, 앱은 값을 해석하지 않는다(spec 4.4).
//   - 날짜별 분류와 합성 결과(출처: 병원 발행 / 본인 체크 / 기본값 적용)를 보여준다(spec 4.5).
//   - 이 화면은 저장소에만 쓴다. 일정 API 를 부르지 않는다 — 재계획은 저장소를 구독하는 동기화 작업(AX-316)이 한다.
//   - 보기 전용(로그인 만료·오프라인)에서는 동의·입력·삭제를 모두 막는다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, EmptyState, TopBar, useStoreStatus } from '@/components/ui/index.js';
import ConsentPanel from '@/components/conditions/ConsentPanel.js';
import ConsentWithdraw from '@/components/conditions/ConsentWithdraw.js';
import DayConditions from '@/components/conditions/DayConditions.js';
import PeriodCard from '@/components/conditions/PeriodCard.js';
import PeriodEditorForm from '@/components/conditions/PeriodEditorForm.js';
import useStay, { useHydrated, useNowMs } from '@/components/conditions/useStay.js';
import { makeSelfPeriodId } from '@/components/conditions/periodFormModel.js';
import { safeClassifyStay } from '@/components/conditions/summary.js';
import { STORE_ERROR, getStore } from '@/lib/store/index.js';
import { hasSensitiveConsent } from '@/src/stay/stay.js';

const SAVE_ERROR_KEY = {
  [STORE_ERROR.READ_ONLY]: 'conditions.errReadOnly',
  [STORE_ERROR.CONSENT_REQUIRED]: 'conditions.errConsent',
};

/** 병원 발행 기간을 먼저, 그다음 시작일 순 */
function sortPeriods(periods) {
  return [...periods].sort(
    (a, b) =>
      String(a.startDate).localeCompare(String(b.startDate)) ||
      (a.source === b.source ? 0 : a.source === 'HOSPITAL' ? -1 : 1) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

export default function ConditionsPage() {
  const { t } = useLang();
  const hydrated = useHydrated();
  const stay = useStay();
  const status = useStoreStatus();
  const nowMs = useNowMs();
  const readOnly = status.readOnly;
  const [editing, setEditing] = useState(null); // null | { period: object|null, id: string }
  const [notice, setNotice] = useState(null); // { key, error: boolean }
  const editorHeadingRef = useRef(null);
  const periodsHeadingRef = useRef(null);
  const returnFocus = useRef(false);

  const classification = useMemo(() => (stay ? safeClassifyStay(stay) : { byDate: {}, error: false }), [stay]);
  const consented = hasSensitiveConsent(stay);
  const periods = useMemo(() => sortPeriods(stay?.periods ?? []), [stay]);

  useEffect(() => {
    if (editing) editorHeadingRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      periodsHeadingRef.current?.focus();
    }
  }, [editing]);

  function startNew() {
    setNotice(null);
    setEditing({ period: null, id: makeSelfPeriodId((stay?.periods ?? []).map((p) => p.id)) });
  }

  function closeEditor() {
    returnFocus.current = true;
    setEditing(null);
  }

  function save(period) {
    const current = getStore().readPeriods();
    const exists = current.some((p) => p.id === period.id);
    const next = exists ? current.map((p) => (p.id === period.id ? period : p)) : [...current, period];
    const result = getStore().writePeriods(next);
    if (!result.ok) {
      setNotice({ key: SAVE_ERROR_KEY[result.code] ?? 'conditions.errSave', error: true });
      return;
    }
    setNotice({ key: 'conditions.saved', error: false });
    closeEditor();
  }

  function remove(period) {
    const result = getStore().writePeriods(getStore().readPeriods().filter((p) => p.id !== period.id));
    setNotice(result.ok ? { key: 'conditions.deleted', error: false } : { key: SAVE_ERROR_KEY[result.code] ?? 'conditions.errSave', error: true });
    periodsHeadingRef.current?.focus();
  }

  const hasLinkedPlans = (stay?.linkedPlans ?? []).length > 0;

  return (
    <>
      <TopBar title={t('conditions.header')} />
      <main className="page conditions-page">
        {!hydrated ? (
          <p className="conditions-hint">{t('conditions.loading')}</p>
        ) : !stay ? (
          <EmptyState
            icon="navConditions"
            title={t('conditions.noStayTitle')}
            body={t('conditions.noStayBody')}
            action={<Button href="/onboarding">{t('conditions.noStayAction')}</Button>}
          />
        ) : (
          <>
            <p className="conditions-lead">{t('conditions.lead')}</p>

            <ConsentPanel consent={stay.consent} readOnly={readOnly} />

            <div role="status" className={notice?.error ? 'conditions-notice is-error' : 'conditions-notice'}>
              {notice ? t(notice.key) : ''}
            </div>

            {consented && editing && (
              <section className="conditions-section" aria-labelledby="conditions-editor-heading">
                <h2 id="conditions-editor-heading" tabIndex={-1} ref={editorHeadingRef}>
                  {editing.period ? t('conditions.editorEdit') : t('conditions.editorNew')}
                </h2>
                <PeriodEditorForm
                  stay={stay}
                  period={editing.period}
                  periodId={editing.id}
                  readOnly={readOnly}
                  onSave={save}
                  onCancel={closeEditor}
                />
              </section>
            )}

            {consented && !editing && (
              <section className="conditions-section" aria-labelledby="conditions-periods-heading">
                <h2 id="conditions-periods-heading" tabIndex={-1} ref={periodsHeadingRef}>
                  {t('conditions.periodsTitle')}
                </h2>
                <p className="conditions-section-lead">{t('conditions.periodsLead')}</p>
                {periods.length === 0 ? (
                  <EmptyState
                    icon="selfCheck"
                    headingLevel={3}
                    title={t('conditions.periodsEmpty')}
                    body={t('conditions.periodsEmptyBody')}
                  />
                ) : (
                  <ul className="conditions-period-list">
                    {periods.map((period) => (
                      <PeriodCard
                        key={period.id}
                        period={period}
                        stay={stay}
                        byDate={classification.byDate}
                        nowMs={nowMs}
                        readOnly={readOnly}
                        onEdit={(p) => {
                          setNotice(null);
                          setEditing({ period: p, id: p.id });
                        }}
                        onDelete={remove}
                      />
                    ))}
                  </ul>
                )}
                <div className="conditions-actions">
                  <Button icon="plus" onClick={startNew} disabled={readOnly}>
                    {t('conditions.addPeriod')}
                  </Button>
                  <Button variant="secondary" icon="hospital" href="/link">
                    {t('conditions.linkHospital')}
                  </Button>
                  {hasLinkedPlans && (
                    <Button variant="secondary" href="/guide">
                      {t('conditions.openGuide')}
                    </Button>
                  )}
                </div>
                {readOnly && <p className="conditions-hint">{t('conditions.readOnlyHint')}</p>}
              </section>
            )}

            {!editing && (
              <DayConditions
                stay={stay}
                byDate={classification.byDate}
                error={classification.error}
                nowMs={nowMs}
              />
            )}

            {consented && !editing && <ConsentWithdraw />}

            <div className="conditions-actions">
              <Button variant="quiet" href="/onboarding">
                {t('conditions.editStay')}
              </Button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
