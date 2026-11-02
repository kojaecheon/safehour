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
//   - SEED ③층(설계서 6.2 4번): 회색 바탕 위 흰 블록. 안내·동의 / 조건 기간 / 날짜별 적용 조건 / 동의 철회 / 체류 정보 고치기.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, EmptyState, Icon, ListGroup, ListItem, TopBar, useStoreStatus } from '@/components/ui/index.js';
import ConsentPanel from '@/components/conditions/ConsentPanel.js';
import ConsentWithdraw from '@/components/conditions/ConsentWithdraw.js';
import DayConditions from '@/components/conditions/DayConditions.js';
import PeriodCard from '@/components/conditions/PeriodCard.js';
import PeriodEditorForm from '@/components/conditions/PeriodEditorForm.js';
import useStay, { useHydrated, useNowMs } from '@/components/conditions/useStay.js';
import { makeSelfPeriodId } from '@/components/conditions/periodFormModel.js';
import { safeClassifyStay } from '@/components/conditions/summary.js';
import { STORE_ERROR, getStore } from '@/lib/store/index.js';
import { useRefocusAfterDialog } from '@/lib/useRefocusAfterDialog.js';
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
  // 편집기가 열려 있는 동안의 저장 실패 문구 키. 맨 위 안내 자리가 아니라 저장 버튼 곁(편집기 하단 바 안)에 보인다
  const [saveErrorKey, setSaveErrorKey] = useState(null);
  const editorHeadingRef = useRef(null);
  const periodsHeadingRef = useRef(null);
  const consentHeadingRef = useRef(null);
  const returnFocus = useRef(false);
  // 기간 삭제를 확인하면 지운 행의 삭제 버튼이 DOM 에서 사라져 AlertDialog 가 돌려줄 초점이 body 로 떨어진다.
  // 그때만 조건 기간 제목으로 옮긴다(마지막 기간을 지워도 이 제목은 목록 대신 빈 상태 안내와 함께 남는다).
  // 동의 철회를 확인하면 철회 블록과 조건 기간 블록이 통째로 사라지고 동의 요청 블록이 나타난다: 그 제목으로 옮긴다
  const armRefocus = useRefocusAfterDialog(() => [periodsHeadingRef.current, consentHeadingRef.current]);

  // 동의 철회가 성공하면 철회 블록이 그 안의 완료 문구와 함께 사라진다(운영자 결정 2026-10-30: 완료 문구를 보여 준다).
  // 완료 문구는 맨 위 흰 블록의 철회 알림 자리(안내 문단과 동의 제목 사이)에 남긴다: 초점이 가는 동의 제목 바로 위라
  // 함께 보이고, 늘 있는 role=status 자리라 화면 읽기에도 읽힌다. 다른 화면으로 갔다 오면 사라지는 화면 상태다
  const [withdrawn, setWithdrawn] = useState(false);
  const withdrawStatusRef = useRef(null);
  function handleWithdrawn() {
    setWithdrawn(true);
    armRefocus();
    // 확인 대화상자는 history 한 칸을 되돌리며 닫힌다(lib/useModalSheet). 그 popstate 뒤 브라우저가 스크롤을 대화상자를 연
    // 자리(철회 블록이 있던 화면 끝)로 되돌려, 완료 문구와 초점이 간 동의 제목이 화면 밖에 남는다.
    // 되돌림이 끝난 다음 그리기에서 완료 문구를 화면 가운데로 데려온다. popstate 가 없으면(기록을 못 쌓은 대화상자) 1초 뒤 걷는다
    const reveal = () =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => withdrawStatusRef.current?.scrollIntoView({ block: 'center' })),
      );
    window.addEventListener('popstate', reveal, { once: true });
    setTimeout(() => window.removeEventListener('popstate', reveal), 1000);
  }

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
    setSaveErrorKey(null);
    setEditing({ period: null, id: makeSelfPeriodId((stay?.periods ?? []).map((p) => p.id)) });
  }

  function closeEditor() {
    returnFocus.current = true;
    setSaveErrorKey(null);
    setEditing(null);
  }

  function save(period) {
    const current = getStore().readPeriods();
    const exists = current.some((p) => p.id === period.id);
    const next = exists ? current.map((p) => (p.id === period.id ? period : p)) : [...current, period];
    const result = getStore().writePeriods(next);
    if (!result.ok) {
      setSaveErrorKey(SAVE_ERROR_KEY[result.code] ?? 'conditions.errSave');
      return;
    }
    setNotice({ key: 'conditions.saved', error: false });
    closeEditor();
  }

  function remove(period) {
    const result = getStore().writePeriods(getStore().readPeriods().filter((p) => p.id !== period.id));
    setNotice(result.ok ? { key: 'conditions.deleted', error: false } : { key: SAVE_ERROR_KEY[result.code] ?? 'conditions.errSave', error: true });
    if (result.ok) armRefocus();
  }

  const hasLinkedPlans = (stay?.linkedPlans ?? []).length > 0;

  return (
    <>
      <TopBar title={t('conditions.header')} />
      <main className="page conditions-page is-basement">
        {!hydrated ? (
          <div className="ui-block">
            <p className="conditions-hint">{t('conditions.loading')}</p>
          </div>
        ) : !stay ? (
          <div className="ui-block">
            <EmptyState
              icon="navConditions"
              title={t('conditions.noStayTitle')}
              body={t('conditions.noStayBody')}
              action={<Button href="/onboarding">{t('conditions.noStayAction')}</Button>}
            />
          </div>
        ) : (
          <>
            <div className="ui-block">
              <p className="conditions-lead">{t('conditions.lead')}</p>

              {/* 다시 동의하면 철회 완료 문구는 맞지 않는다: 동의가 없을 때만 보인다 */}
              <div role="status" className="conditions-withdraw-status" ref={withdrawStatusRef}>
                {withdrawn && !consented && (
                  <p className="ui-callout has-icon conditions-withdraw-done">
                    <span className="ui-callout-icon" aria-hidden="true">
                      <Icon name="check" size={20} />
                    </span>
                    <span>{t('conditions.withdrawDone')}</span>
                  </p>
                )}
              </div>

              <ConsentPanel consent={stay.consent} readOnly={readOnly} headingRef={consentHeadingRef} />

              <div role="status" className={notice?.error ? 'conditions-notice is-error' : 'conditions-notice'}>
                {notice ? t(notice.key) : ''}
              </div>
            </div>

            {consented && editing && (
              <section className="ui-block conditions-section" aria-labelledby="conditions-editor-heading">
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
                  saveErrorKey={saveErrorKey}
                />
              </section>
            )}

            {consented && !editing && (
              <section className="ui-block conditions-section" aria-labelledby="conditions-periods-heading">
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
                  <ul className="conditions-period-list is-rows">
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
                          setSaveErrorKey(null);
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
                </div>
                {readOnly && <p className="conditions-hint">{t('conditions.readOnlyHint')}</p>}
              </section>
            )}

            {/* 병원 지침 연결·병원 안내 보기: 다른 화면으로 가는 이동이라 화살표 목록 행(설계서 5.5) */}
            {consented && !editing && (
              <div className="ui-block">
                <ListGroup>
                  <li>
                    <ListItem
                      title={t('conditions.linkHospital')}
                      leading={<Icon name="hospital" size={22} />}
                      trailing="chevron"
                      href="/link"
                    />
                  </li>
                  {hasLinkedPlans && (
                    <li>
                      <ListItem
                        title={t('conditions.openGuide')}
                        leading={<Icon name="quote" size={22} />}
                        trailing="chevron"
                        href="/guide"
                      />
                    </li>
                  )}
                </ListGroup>
              </div>
            )}

            {!editing && (
              <DayConditions
                stay={stay}
                byDate={classification.byDate}
                error={classification.error}
                nowMs={nowMs}
              />
            )}

            {consented && !editing && <ConsentWithdraw onWithdrawn={handleWithdrawn} />}

            {/* 다른 화면으로 가는 이동이라 버튼이 아니라 화살표 목록 행(설계서 5.5).
                편집 중에는 숨긴다: DOM 에서 하단 고정 바 뒤에 와 Tab 순서가 거꾸로 가고, 누르면 입력이 사라진다 */}
            {!editing && (
              <div className="ui-block">
                <ListGroup>
                  <li>
                    <ListItem title={t('conditions.editStay')} trailing="chevron" href="/onboarding" />
                  </li>
                </ListGroup>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
