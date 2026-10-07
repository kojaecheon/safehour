'use client';

// 병원 연결 — 지침 계약 v2 (AX-216 → AX-315 · spec 4.19, 4.20, 5.1, 6장)
//
// 흐름: (동의) → 코드 입력 또는 데모 코드 A/B/C → 연결할 병원 고르기(기존 병원 또는 새 병원) → 저장
//
// 화면 원칙
//   - 사용자가 조건을 타이핑하지 않는다. 병원이 발행한 기간을 그대로 가져온다.
//   - 연동 전에 민감정보 동의가 있어야 한다(spec 4.19).
//   - 데모 지침은 '병원 연동 데모' 배지를 늘 붙인다. 데모를 실제 연동처럼 보이게 하지 않는다(spec 9.1).
//   - 연결 병원이 정해진 뒤에만 변환한다(planToStayParts). 병원 복귀는 그 병원 id 를 가리킨다(규칙 57).
//   - 지침의 병원 일정은 그 병원 일정으로 더하되, 같은 날짜·시각·유형이면 건너뛴다(spec 4.20).
//   - 만료된 지침(DEMO-C)도 기간을 저장한다. 적용 여부는 날짜별 합성이 정한다(규칙 12).
//   - 저장소에만 쓴다(한 번). 재계획은 저장소를 구독하는 동기화 작업(AX-316)이 한다.
//   - 오류는 errorCode 로 고른다. 로그인 필요(401)면 로그인 화면으로 보낸다.

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/components/LanguageProvider.js';
import { Badge, Button, EmptyState, Icon, TopBar, useStoreStatus } from '@/components/ui/index.js';
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
      {state === 'EXPIRED' && <SafetyText k={'link.expiredNote'} className="conditions-callout" />}
      {state === 'REVOKED' && <SafetyText k={'link.revokedNote'} className="conditions-callout" />}
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

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [fetched, setFetched] = useState(null); // { code, plan, fetchedAt }
  const [choice, setChoice] = useState(null);
  const [choiceError, setChoiceError] = useState(false);
  const [done, setDone] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);

  useEffect(() => {
    if (fetched) chooseHeadingRef.current?.focus();
  }, [fetched]);
  useEffect(() => {
    if (done) doneHeadingRef.current?.focus();
  }, [done]);

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
    if (!result.ok) setErrorKey(SAVE_ERROR_KEY[result.code] ?? 'link.errSave');
    setDisconnecting(null);
  }

  const doneState = done ? planState(done.plan, nowMs) : null;

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
                  <div className="conditions-alert" role="alert">
                    <p className="conditions-alert-title">
                      <Icon name="alert" size={20} />
                      <span>{t('link.errLabel')}</span>
                    </p>
                    <p>{t(errorKey)}</p>
                  </div>
                )}

                {done && (
                  <section className="card conditions-done" aria-labelledby="link-done-heading">
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
                    {doneState === 'EXPIRED' && <SafetyText k={'link.expiredNote'} className="conditions-callout" />}
                    {doneState === 'REVOKED' && <SafetyText k={'link.revokedNote'} className="conditions-callout" />}
                    {done.conflict && <SafetyText k={'link.conflictNote'} className="conditions-callout" />}
                    <div className="conditions-actions">
                      <Button href="/conditions">{t('link.goConditions')}</Button>
                      <Button variant="secondary" href="/guide">
                        {t('link.goGuide')}
                      </Button>
                    </div>
                  </section>
                )}

                {fetched ? (
                  <section className="card conditions-choose" aria-labelledby="link-choose-heading">
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
                            <input
                              type="radio"
                              name="link-hospital"
                              value={h.id}
                              checked={choice === h.id}
                              disabled={readOnly}
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
                          <input
                            type="radio"
                            name="link-hospital"
                            value={NEW_HOSPITAL}
                            checked={choice === NEW_HOSPITAL}
                            disabled={readOnly}
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
                      <p className="conditions-field-error" id="link-choose-error" role="alert">
                        {t('link.chooseRequired')}
                      </p>
                    )}
                    <div className="conditions-actions">
                      <Button onClick={confirmLink} disabled={readOnly}>
                        {t('link.confirm')}
                      </Button>
                      <Button variant="secondary" onClick={() => setFetched(null)}>
                        {t('link.cancel')}
                      </Button>
                    </div>
                  </section>
                ) : (
                  <>
                    <section className="card">
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
                        <Button type="submit" disabled={busy || readOnly}>
                          {busy ? t('link.submitting') : t('link.submit')}
                        </Button>
                      </form>
                    </section>

                    <section className="card conditions-demo" aria-labelledby="link-demo-heading">
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
                    <h2 id="link-list-heading">{t('link.listTitle')}</h2>
                    <ul className="conditions-period-list">
                      {linkedPlans.map((lp) => {
                        const state = planState(lp.plan, nowMs);
                        const hospitalName = hospitals.find((h) => h.id === lp.hospitalId)?.name ?? '';
                        return (
                          <li key={lp.code} className="conditions-period conditions-period-HOSPITAL">
                            <div className="conditions-period-head">
                              <h3>{t('link.connected', { issuer: lp.plan?.issuer?.name ?? '' })}</h3>
                              <span className="conditions-tags">
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
                            {disconnecting === lp.code ? (
                              <div className="conditions-confirm" role="group" aria-labelledby={`link-q-${lp.code}`}>
                                <p id={`link-q-${lp.code}`} className="conditions-confirm-question">
                                  {t('link.disconnectQuestion')}
                                </p>
                                <div className="conditions-actions">
                                  <Button onClick={() => disconnect(lp.code)} disabled={readOnly}>
                                    {t('link.disconnectConfirm')}
                                  </Button>
                                  <Button variant="secondary" onClick={() => setDisconnecting(null)}>
                                    {t('conditions.cancel')}
                                  </Button>
                                </div>
                              </div>
                            ) : (
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
                            )}
                          </li>
                        );
                      })}
                    </ul>
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
