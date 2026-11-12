'use client';

// 병원 연결: 지침 계약 v2 (AX-216 → AX-315 · docs/security.md '민감정보 동의', docs/business-rules.md '병원 연동', docs/contracts.md '`POST /api/plan/link`')
//
// 흐름: (동의) → 코드 입력 또는 데모 코드 A/B/C → 연결할 병원 고르기(기존 병원 또는 새 병원) → 저장
//
// 화면 원칙
//   - 사용자가 조건을 타이핑하지 않는다. 병원이 발행한 기간을 그대로 가져온다.
//   - 연동 전에 민감정보 동의가 있어야 한다(docs/security.md '민감정보 동의').
//   - 데모 지침은 '병원 연동 데모' 배지를 늘 붙인다. 데모를 실제 연동처럼 보이게 하지 않는다(docs/business-rules.md '병원 연동').
//   - 연결 병원이 정해진 뒤에만 변환한다(planToStayParts). 병원 복귀는 그 병원 id 를 가리킨다(docs/contracts.md '`POST /api/plan/link`').
//   - 지침의 병원 일정은 그 병원 일정으로 더하되, 같은 날짜·시각·유형이면 건너뛴다(docs/platform/IA_AND_FLOWS.md '병원 연동(데모)').
//   - 만료된 지침(DEMO-C)도 기간을 저장한다. 적용 여부는 날짜별 합성이 정한다(docs/business-rules.md '병원 연동'·'날짜별 합성').
//   - 저장소에만 쓴다(한 번). 재계획은 저장소를 구독하는 동기화 작업(AX-316)이 한다.
//   - 오류는 errorCode 로 고른다. 로그인 필요(401)면 로그인 화면으로 보낸다.

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/components/LanguageProvider.js';
import { AlertDialog, Badge, Button, EmptyState, Icon, SourceTag, TopBar, useStoreStatus } from '@/components/ui/index.js';
import ConsentPanel from '@/components/conditions/ConsentPanel.js';
import SafetyText from '@/components/conditions/SafetyText.js';
import useStay, { useHydrated, useNowMs } from '@/components/conditions/useStay.js';
import {
  DEMO_CODES,
  applyLinkedPlan,
  isAuthRequired,
  linkErrorKey,
  planState,
} from '@/components/conditions/linkPlan.js';
import { STORE_ERROR, getStore } from '@/lib/store/index.js';
import { fmtDateTime } from '@/lib/format.js';
import { useRefocusAfterDialog } from '@/lib/useRefocusAfterDialog.js';
import { normalizeLinkCode } from '@/src/recovery/gateway.js';
import { hasSensitiveConsent, validateStay } from '@/src/stay/stay.js';

const STATE_KEY = {
  ACTIVE: 'link.stateACTIVE',
  EXPIRED: 'link.stateEXPIRED',
  REVOKED: 'link.stateREVOKED',
};

const SAVE_ERROR_KEY = {
  [STORE_ERROR.READ_ONLY]: 'conditions.errReadOnly',
  [STORE_ERROR.CONSENT_REQUIRED]: 'conditions.errConsent',
};

const NEW_HOSPITAL = '__new__';

function PlanSummary({ plan, nowMs }) {
  const { t, locale } = useLang();
  const state = planState(plan, nowMs);
  return (
    <div className="conditions-plan-summary">
      <p className="conditions-tags">
        {plan.demo === true && <Badge kind="demo" />}
        <span className={`conditions-plain-tag conditions-state-${state}`}>{t(STATE_KEY[state])}</span>
      </p>
      <p>{t('link.planHospital', { name: plan.hospital?.name ?? '' })}</p>
      <p>{t('link.planIssuer', { issuer: plan.issuer?.name ?? '' })}</p>
      <p>{t('link.expires', { at: fmtDateTime(plan.expiresAt, locale) })}</p>
      <p>
        {t('link.planCounts', {
          periods: plan.periods?.length ?? 0,
          appointments: plan.appointments?.length ?? 0,
        })}
      </p>
      {state === 'EXPIRED' && <SafetyText k={'link.expiredNote'} className="ui-callout conditions-callout" />}
      {state === 'REVOKED' && <SafetyText k={'link.revokedNote'} className="ui-callout conditions-callout" />}
    </div>
  );
}

export default function LinkPage() {
  const router = useRouter();
  const { t, locale } = useLang();
  const hydrated = useHydrated();
  const stay = useStay();
  const status = useStoreStatus();
  const nowMs = useNowMs();
  const readOnly = status.readOnly;
  const codeId = useId();
  const chooseHeadingRef = useRef(null);
  const doneHeadingRef = useRef(null);
  const listHeadingRef = useRef(null);
  const codeInputRef = useRef(null);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [fetched, setFetched] = useState(null); // { code, plan, fetchedAt }
  const [choice, setChoice] = useState(null);
  const [choiceError, setChoiceError] = useState(false);
  // 병원을 고르지 않고 누른 횟수: 오류가 이미 떠 있어도 다시 누를 때마다 오류 문장을 화면 안으로 옮기는 효과를 돌린다
  const [choiceErrorPresses, setChoiceErrorPresses] = useState(0);
  const [done, setDone] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);
  // 연결 해제를 확인하면 지운 행의 버튼은 DOM 에서 사라져 AlertDialog 가 돌려줄 초점이 body 로 떨어진다.
  // 그때만 목록 제목(목록이 비었으면 코드 입력칸, 병원 고르기 중이면 그 제목)으로 옮긴다
  const armRefocus = useRefocusAfterDialog(() => [listHeadingRef.current, codeInputRef.current, chooseHeadingRef.current]);

  useEffect(() => {
    if (fetched) chooseHeadingRef.current?.focus();
  }, [fetched]);
  useEffect(() => {
    if (done) doneHeadingRef.current?.focus();
  }, [done]);
  // 고르기 오류 문장은 라디오 묶음 뒤 흐름 안에 생겨 하단 고정 바·내비 뒤에 깔리기 쉽다. 그려진 뒤 화면 안으로 옮긴다
  // (전역 scroll-padding-bottom 이 두 바를 피해 준다). 오류 여부(true 그대로)가 아니라 누른 횟수에 묶어,
  // 사용자가 스크롤해 벗어난 뒤 다시 눌러도 두 번째부터 다시 옮긴다
  useEffect(() => {
    if (choiceErrorPresses > 0) document.getElementById('link-choose-error')?.scrollIntoView({ block: 'nearest' });
  }, [choiceErrorPresses]);

  const consented = hasSensitiveConsent(stay);
  const hospitals = stay?.hospitals ?? [];
  const linkedPlans = stay?.linkedPlans ?? [];

  async function connect(value) {
    setErrorKey(null);
    setDone(null);
    if (!value.trim()) {
      setErrorKey('link.errRequired');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/plan/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code: value }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok || !data?.ok) {
        const errorCode = data?.errorCode;
        setErrorKey(linkErrorKey(errorCode));
        if (isAuthRequired(res.status, errorCode)) {
          router.push(`/login?returnTo=${encodeURIComponent('/link')}`);
        }
        return;
      }
      setChoice(null);
      setChoiceError(false);
      setFetched({ code: normalizeLinkCode(value), plan: data.plan, fetchedAt: new Date().toISOString() });
    } catch {
      setErrorKey('link.errNetwork');
    } finally {
      setBusy(false);
    }
  }

  function confirmLink() {
    if (!fetched || !stay) return;
    if (!choice) {
      setChoiceError(true);
      setChoiceErrorPresses((n) => n + 1);
      return;
    }
    const hospital = choice === NEW_HOSPITAL ? { kind: 'NEW' } : { kind: 'EXISTING', id: choice };
    let outcome;
    try {
      outcome = applyLinkedPlan(stay, { code: fetched.code, plan: fetched.plan, hospital, fetchedAt: fetched.fetchedAt });
    } catch {
      setErrorKey('link.errInvalid');
      return;
    }
    // 원래 체류가 검증을 통과했다면, 합친 뒤에도 통과해야 저장한다
    if (validateStay(stay).ok && !validateStay(outcome.stay).ok) {
      setErrorKey('link.errSave');
      return;
    }
    const result = getStore().updateStay(() => outcome.stay);
    if (!result.ok) {
      setErrorKey(SAVE_ERROR_KEY[result.code] ?? 'link.errSave');
      return;
    }
    setDone({
      plan: fetched.plan,
      periods: outcome.periodIds.length,
      added: outcome.addedAppointments.length,
      skipped: outcome.skippedAppointments.length,
      conflict: outcome.conflictingPeriodIds.length > 0,
    });
    setFetched(null);
    setCode('');
  }

  function disconnect(linkCode) {
    const result = getStore().removeLinkedPlan(linkCode);
    if (result.ok) armRefocus();
    else setErrorKey(SAVE_ERROR_KEY[result.code] ?? 'link.errSave');
    setDisconnecting(null);
  }

  const doneState = done ? planState(done.plan, nowMs) : null;
  // 연결 해제 대화상자가 어느 지침인지 밝힌다: 행 제목과 같은 문구 + 연결 코드(기존 문구 두 개를 이어 붙인다)
  const disconnectingPlan = disconnecting ? linkedPlans.find((lp) => lp.code === disconnecting) : null;
  const disconnectingLabel = disconnectingPlan
    ? [
        t('link.connected', { issuer: disconnectingPlan.plan?.issuer?.name ?? '' }),
        t('link.codeValue', { code: disconnectingPlan.code }),
      ].join(' · ')
    : undefined;

  return (
    <>
      <TopBar title={t('link.header')} backHref="/conditions" />
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
            <section className="conditions-section">
              <h2 className="conditions-link-title">{t('link.title')}</h2>
              <p className="conditions-section-lead">{t('link.lead')}</p>
            </section>

            {!consented ? (
              <ConsentPanel consent={stay.consent} readOnly={readOnly} lead={t('link.consentNeeded')} />
            ) : (
              <>
                {errorKey && (
                  <div className="ui-error-summary conditions-alert" role="alert">
                    <p className="ui-error-summary-title conditions-alert-title">
                      <Icon name="alert" size={20} />
                      <span>{t('link.errLabel')}</span>
                    </p>
                    <p>{t(errorKey)}</p>
                  </div>
                )}

                {done && (
                  <section className="conditions-done" aria-labelledby="link-done-heading">
                    <h2 id="link-done-heading" tabIndex={-1} ref={doneHeadingRef}>
                      <Icon name="check" size={22} strokeWidth={2.6} />
                      <span>{t('link.doneTitle')}</span>
                    </h2>
                    <p className="conditions-tags">
                      {done.plan.demo === true && <Badge kind="demo" />}
                      <span className={`conditions-plain-tag conditions-state-${doneState}`}>{t(STATE_KEY[doneState])}</span>
                    </p>
                    <p>{t('link.donePeriods', { n: done.periods })}</p>
                    <p>{t('link.doneAdded', { n: done.added })}</p>
                    {done.skipped > 0 && <p>{t('link.doneSkipped', { n: done.skipped })}</p>}
                    {doneState === 'EXPIRED' && <SafetyText k={'link.expiredNote'} className="ui-callout conditions-callout" />}
                    {doneState === 'REVOKED' && <SafetyText k={'link.revokedNote'} className="ui-callout conditions-callout" />}
                    {done.conflict && <SafetyText k={'link.conflictNote'} className="ui-callout conditions-callout" />}
                    <div className="conditions-actions">
                      <Button href="/conditions">{t('link.goConditions')}</Button>
                      <Button variant="secondary" href="/guide">
                        {t('link.goGuide')}
                      </Button>
                    </div>
                  </section>
                )}

                {fetched ? (
                  <section className="conditions-choose" aria-labelledby="link-choose-heading">
                    <h2 id="link-choose-heading" tabIndex={-1} ref={chooseHeadingRef}>
                      {t('link.chooseTitle')}
                    </h2>
                    <PlanSummary plan={fetched.plan} nowMs={nowMs} />
                    <p className="conditions-section-lead">{t('link.chooseLead')}</p>
                    <fieldset className="conditions-choice-list" aria-describedby={choiceError ? 'link-choose-error' : undefined}>
                      <legend>{t('link.chooseLegend')}</legend>
                      <div className="radio-group">
                        {hospitals.map((h) => (
                          <label key={h.id} className={choice === h.id ? 'radio-option selected' : 'radio-option'}>
                            {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- 온보딩 라디오 묶음과 같다: aria-invalid 로 오류를 보조기기에 알리고 globals 의 .radio-option:has(input[aria-invalid]) 칸 테두리가 이 값을 읽는다(axe 위반 없음) */}
                            <input
                              type="radio"
                              name="link-hospital"
                              value={h.id}
                              checked={choice === h.id}
                              disabled={readOnly}
                              aria-invalid={choiceError ? 'true' : undefined}
                              onChange={() => {
                                setChoice(h.id);
                                setChoiceError(false);
                              }}
                            />
                            <span>
                              <strong>{h.name}</strong>
                              {h.address?.roadAddress && <span className="sub">{h.address.roadAddress}</span>}
                            </span>
                          </label>
                        ))}
                        <label className={choice === NEW_HOSPITAL ? 'radio-option selected' : 'radio-option'}>
                          {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- 위 라디오와 같다 */}
                          <input
                            type="radio"
                            name="link-hospital"
                            value={NEW_HOSPITAL}
                            checked={choice === NEW_HOSPITAL}
                            disabled={readOnly}
                            aria-invalid={choiceError ? 'true' : undefined}
                            onChange={() => {
                              setChoice(NEW_HOSPITAL);
                              setChoiceError(false);
                            }}
                          />
                          <span>
                            <strong>{t('link.chooseNew', { name: fetched.plan.hospital?.name ?? '' })}</strong>
                            {fetched.plan.hospital?.address?.roadAddress && (
                              <span className="sub">{fetched.plan.hospital.address.roadAddress}</span>
                            )}
                          </span>
                        </label>
                      </div>
                    </fieldset>
                    {choiceError && (
                      <p className="ui-field-error conditions-field-error" id="link-choose-error" role="alert">
                        <Icon name="alert" size={20} />
                        <span>{t('link.chooseRequired')}</span>
                      </p>
                    )}
                    <div className="conditions-actions ui-bar-split link-bar sticky-return is-flow">
                      <Button variant="secondary" onClick={() => setFetched(null)}>
                        {t('link.cancel')}
                      </Button>
                      <Button onClick={confirmLink} disabled={readOnly}>
                        {t('link.confirm')}
                      </Button>
                    </div>
                  </section>
                ) : (
                  <>
                    <section className="link-section">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void connect(code);
                        }}
                      >
                        <div className="field">
                          <label htmlFor={codeId}>{t('link.codeLabel')}</label>
                          <input
                            id={codeId}
                            ref={codeInputRef}
                            type="text"
                            value={code}
                            autoCapitalize="characters"
                            autoComplete="off"
                            spellCheck={false}
                            disabled={readOnly}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder={t('link.codePlaceholder')}
                          />
                        </div>
                        <Button type="submit" variant={done ? 'secondary' : 'primary'} disabled={busy || readOnly}>
                          {busy ? t('link.submitting') : t('link.submit')}
                        </Button>
                      </form>
                    </section>

                    <section className="conditions-demo" aria-labelledby="link-demo-heading">
                      <div className="conditions-section-head">
                        <h2 id="link-demo-heading">{t('link.demoTitle')}</h2>
                        <Badge kind="demo" />
                      </div>
                      <p>{t('link.demoLead')}</p>
                      <div className="conditions-actions">
                        {DEMO_CODES.map((item) => (
                          <Button
                            key={item.code}
                            variant="secondary"
                            disabled={busy || readOnly}
                            onClick={() => void connect(item.code)}
                          >
                            {t(item.labelKey)}
                          </Button>
                        ))}
                      </div>
                    </section>
                  </>
                )}

                {linkedPlans.length > 0 && (
                  <section className="conditions-section" aria-labelledby="link-list-heading">
                    <h2 id="link-list-heading" tabIndex={-1} ref={listHeadingRef}>
                      {t('link.listTitle')}
                    </h2>
                    <ul className="conditions-period-list is-rows">
                      {linkedPlans.map((lp) => {
                        const state = planState(lp.plan, nowMs);
                        const hospitalName = hospitals.find((h) => h.id === lp.hospitalId)?.name ?? '';
                        return (
                          <li key={lp.code} className="conditions-period">
                            <div className="conditions-period-head">
                              <h3>{t('link.connected', { issuer: lp.plan?.issuer?.name ?? '' })}</h3>
                              <span className="conditions-tags">
                                <SourceTag source="hospital" />
                                {lp.plan?.demo === true && <Badge kind="demo" />}
                                <span className={`conditions-plain-tag conditions-state-${state}`}>{t(STATE_KEY[state])}</span>
                              </span>
                            </div>
                            <div className="conditions-period-meta">
                              <p>{t('link.codeValue', { code: lp.code })}</p>
                              <p>{t('link.linkedTo', { name: hospitalName })}</p>
                              <p>{t('link.fetchedAt', { at: fmtDateTime(lp.fetchedAt, locale) })}</p>
                              <p>{t('link.expires', { at: fmtDateTime(lp.plan?.expiresAt, locale) })}</p>
                            </div>
                            <div className="conditions-actions is-inline">
                              <Button variant="secondary" size="small" href="/guide">
                                {t('conditions.openGuide')}
                              </Button>
                              <Button
                                variant="secondary"
                                size="small"
                                disabled={readOnly}
                                onClick={() => setDisconnecting(lp.code)}
                              >
                                {t('link.disconnect')}
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {/* 되돌릴 수 없는 확인이라 대화상자로 묻는다(설계서 5.6). 초점 가두기·Escape·초점 복귀는 AlertDialog 가 한다 */}
                    {disconnecting && (
                      <AlertDialog
                        title={t('link.disconnectQuestion')}
                        description={disconnectingLabel}
                        cancelLabel={t('conditions.cancel')}
                        confirmLabel={t('link.disconnectConfirm')}
                        critical
                        onConfirm={({ requestClose }) => {
                          requestClose();
                          disconnect(disconnecting);
                        }}
                        onClose={() => setDisconnecting(null)}
                      />
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
