'use client';

// 체류 설정 (/onboarding) — 단계형, 360px 기준 (AX-314 · spec 3.1–3.2, 4.1–4.3, 4.18, 5.1)
//
// 흐름: 입·출국 → 숙소 → 병원·일정 → 동반 보호자 → 관심사·강도 → 저장 → /conditions
//
// - '다음'을 누르면 이 단계의 문제만 보여 주고 막는다. 저장 때는 전체를 다시 검사해 첫 문제 단계로 돌아간다.
//   규칙은 validateStay() 하나뿐이다(draft.js). 화면은 결과를 필드별 문구로 옮긴다.
// - 저장은 기기 저장소(getStore().writeStay / updateStay)로만 한다. 서버에 보내지 않는다.
//   새 체류: schemaVersion 2, 일정 출처 USER, 민감정보 동의 없음(consent.sensitive = null).
// - 수정(?edit=1): 저장된 체류를 불러와 고친다. 조건 기간·연동 지침·동의·보호자 공유는 그대로 둔다.
//   저장 뒤 returnTo(같은 출처 경로만) 또는 /conditions 로 간다.
// - 계정마다 활성 체류는 하나다(spec 4.1). 새로 만들기 화면에서 이미 체류가 있으면 수정·오늘 보기로 안내한다.
// - 보기 전용(로그인 없음·만료·오프라인)이면 저장 버튼을 끄고 '보기 전용' 배지와 이유를 보여 준다(spec 4.18).
// - 현재 위치를 쓰지 않는다. 주소는 사용자가 검색해 고른 것만 쓴다.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from '../LanguageProvider.js';
import { Badge, Button, EmptyState, Icon, TopBar, shouldShowReadOnly, useStoreStatus } from '../ui/index.js';
import { READ_ONLY_REASON, STORE_ERROR, getStore } from '@/lib/store/index.js';
import { safeReturnTo } from '@/src/auth/config.js';
import CompanionStep from './CompanionStep.js';
import ErrorSummary from './ErrorSummary.js';
import HospitalStep from './HospitalStep.js';
import LodgingStep from './LodgingStep.js';
import PreferencesStep from './PreferencesStep.js';
import StepIndicator from './StepIndicator.js';
import TravelStep from './TravelStep.js';
import {
  STEPS,
  STEP_LABEL_KEY,
  draftFromStay,
  draftIssues,
  emptyDraft,
  firstStepWithIssues,
  prefillLodgingDates,
  stayFromDraft,
  stepOfField,
} from './draft.js';

const STEP_LEAD_KEY = {
  travel: 'onboarding.stepTravelLead',
  lodging: 'onboarding.stepLodgingLead',
  hospital: 'onboarding.stepHospitalLead',
  companion: 'onboarding.stepCompanionLead',
  preferences: 'onboarding.stepPreferencesLead',
};

const STEP_VIEW = {
  travel: TravelStep,
  lodging: LodgingStep,
  hospital: HospitalStep,
  companion: CompanionStep,
  preferences: PreferencesStep,
};

const LAST_STEP = STEPS.length - 1;
const NO_ATTEMPTS = Object.freeze(STEPS.map(() => false));
const EMPTY_PERIODS = Object.freeze([]);

function subscribeStay(onChange) {
  return getStore().subscribe('stay', onChange);
}
function readStaySnapshot() {
  return getStore().readStay();
}
function readNoStay() {
  return null;
}
function subscribeNothing() {
  return () => {};
}

function Loading() {
  const { t } = useLang();
  return (
    <div className="loading-block" role="status">
      <div className="spinner" aria-hidden="true" />
      <p>{t('onboarding.loading')}</p>
    </div>
  );
}

export default function OnboardingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const editMode = params.get('edit') === '1';
  const returnTo = safeReturnTo(params.get('returnTo'), '/conditions');
  const { t } = useLang();
  const status = useStoreStatus();
  const stay = useSyncExternalStore(subscribeStay, readStaySnapshot, readNoStay);
  // 서버 렌더와 첫 하이드레이션에서는 false — 저장소를 읽는 화면을 그 뒤에 그린다
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const [draft, setDraft] = useState(null);
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [attempted, setAttempted] = useState(NO_ATTEMPTS);
  const [saveState, setSaveState] = useState({ phase: 'idle', errorKey: null });
  const focusTarget = useRef(null);
  const headingRef = useRef(null);
  const summaryRef = useRef(null);

  // 단계가 바뀌면 단계 제목, 문제가 있으면 요약 상자로 초점을 옮긴다
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    (target === 'summary' ? summaryRef : headingRef).current?.focus();
  });

  const previous = editMode ? stay : null;
  // 손대기 전에는 저장된 체류(수정) 또는 빈 초안(새로 만들기)을 그대로 보여 준다
  const current = useMemo(
    () => draft ?? (editMode && stay ? draftFromStay(stay) : emptyDraft()),
    [draft, editMode, stay],
  );
  const issues = useMemo(() => draftIssues(current, previous), [current, previous]);

  const update = useCallback((fn) => setDraft((prev) => fn(prev ?? current)), [current]);

  const sessionKnown = status.sessionChecked || status.reason === READ_ONLY_REASON.OFFLINE;
  const title = t(editMode ? 'onboarding.headerEdit' : 'onboarding.header');
  const top = <TopBar title={title} backHref={editMode ? returnTo : undefined} />;

  if (!mounted || (editMode && !stay && !sessionKnown && saveState.phase !== 'saved')) {
    return (
      <>
        {top}
        <main className="page onboarding-page">
          <Loading />
        </main>
      </>
    );
  }

  if (saveState.phase === 'saved') {
    return (
      <>
        {top}
        <main className="page onboarding-page">
          <p className="onboarding-saved" role="status">
            {t('onboarding.saved')}
          </p>
        </main>
      </>
    );
  }

  // 계정마다 활성 체류는 하나다 — 새로 만들지 않고 수정·오늘 보기로 안내한다
  if (!editMode && stay) {
    return (
      <>
        {top}
        <main className="page onboarding-page">
          <EmptyState
            icon="navTrip"
            title={t('onboarding.existsTitle')}
            body={t('onboarding.existsBody')}
            action={
              <div className="onboarding-stack">
                <Button href="/onboarding?edit=1">{t('onboarding.headerEdit')}</Button>
                <Button variant="secondary" href="/today">
                  {t('onboarding.existsToday')}
                </Button>
              </div>
            }
          />
        </main>
      </>
    );
  }

  if (editMode && !stay) {
    return (
      <>
        {top}
        <main className="page onboarding-page">
          <EmptyState
            icon="navTrip"
            title={t('onboarding.editMissingTitle')}
            body={t('onboarding.editMissingBody')}
            action={<Button href="/onboarding">{t('onboarding.startNew')}</Button>}
          />
        </main>
      </>
    );
  }

  const stepName = STEPS[step];
  const StepView = STEP_VIEW[stepName];
  const shown = issues.filter((issue) => attempted[stepOfField(issue.field)]);
  const stepIssues = shown.filter((issue) => stepOfField(issue.field) === step);
  const readOnlyVisible = shouldShowReadOnly(status);

  function goTo(index) {
    setStep(index);
    setFurthest((f) => Math.max(f, index));
    focusTarget.current = 'heading';
  }

  function markAttempted(steps) {
    setAttempted((prev) => prev.map((value, i) => value || steps.includes(i)));
  }

  function next() {
    const own = issues.filter((issue) => stepOfField(issue.field) === step);
    if (own.length > 0) {
      markAttempted([step]);
      focusTarget.current = 'summary';
      return;
    }
    // 첫 숙소 날짜를 입·출국 날짜로 제안한다(비어 있을 때만, 고칠 수 있다)
    if (stepName === 'travel') update(prefillLodgingDates);
    goTo(step + 1);
  }

  function save() {
    if (issues.length > 0) {
      markAttempted(STEPS.map((_, i) => i));
      setStep(firstStepWithIssues(issues));
      focusTarget.current = 'summary';
      return;
    }
    const store = getStore();
    if (store.getStatus().readOnly) {
      setSaveState({ phase: 'error', errorKey: 'onboarding.readOnlySave' });
      return;
    }
    let result;
    if (editMode) {
      result = store.updateStay((saved) => stayFromDraft(current, saved));
    } else if (store.readStay()) {
      // 다른 탭에서 먼저 만들었다 — 덮어쓰지 않는다(화면이 '이미 있음' 안내로 바뀐다)
      return;
    } else {
      result = store.writeStay(stayFromDraft(current, null));
    }
    if (result?.ok) {
      setSaveState({ phase: 'saved', errorKey: null });
      router.push(returnTo);
      return;
    }
    setSaveState({
      phase: 'error',
      errorKey: result?.code === STORE_ERROR.READ_ONLY ? 'onboarding.readOnlySave' : 'onboarding.saveFailed',
    });
  }

  return (
    <>
      {top}
      <main className="page onboarding-page">
        <form
          className="onboarding-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (step === LAST_STEP) save();
            else next();
          }}
        >
          <StepIndicator step={step} furthest={furthest} onGo={goTo} />

          <section className="onboarding-step" aria-labelledby="ob-step-title">
            <h2 id="ob-step-title" className="onboarding-step-title" tabIndex={-1} ref={headingRef}>
              {t(STEP_LABEL_KEY[stepName])}
            </h2>
            <p className="onboarding-lead">{t(STEP_LEAD_KEY[stepName])}</p>
            <ErrorSummary issues={stepIssues} ref={summaryRef} />
            <StepView
              draft={current}
              update={update}
              issues={shown}
              periods={Array.isArray(previous?.periods) ? previous.periods : EMPTY_PERIODS}
            />
          </section>

          {/* 하단 고정 바(설계서 6.1) — 하단 긴급 바 바로 위에 선다. [이전 3][다음 7].
              저장 버튼을 못 누르는 이유(보기 전용·저장 실패)는 버튼 곁에 보이도록 바 안 맨 앞에 둔다 */}
          <div className="onboarding-actions sticky-return">
            {step === LAST_STEP && readOnlyVisible && (
              <p className="onboarding-readonly" id="ob-readonly">
                <Badge kind="readOnly" />
                <span>{t('onboarding.readOnlySave')}</span>
              </p>
            )}
            {saveState.phase === 'error' && (
              <p className="onboarding-save-error" role="alert">
                <Icon name="alert" size={20} />
                <span>{t(saveState.errorKey)}</span>
              </p>
            )}
            {step > 0 && (
              <Button variant="secondary" onClick={() => goTo(step - 1)}>
                {t('onboarding.prev')}
              </Button>
            )}
            {step === LAST_STEP ? (
              <Button type="submit" disabled={status.readOnly} aria-describedby={readOnlyVisible ? 'ob-readonly' : undefined}>
                {t(editMode ? 'onboarding.saveEdit' : 'onboarding.save')}
              </Button>
            ) : (
              <Button type="submit">{t('onboarding.next')}</Button>
            )}
          </div>
        </form>
      </main>
    </>
  );
}
