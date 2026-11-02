'use client';

// 하루 일정 화면 본문 — /trip/[date] (AX-317 · spec 3.1, 4.5–4.11, 4.16, 4.18)
//
// 날짜는 클라이언트에서 읽는다(useParams). 페이지는 정적으로 그려져 서비스 워커가 한 번 연 날짜를 오프라인에서도 연다.
// 일정은 기기 저장소의 확정 일정만 읽는다 — 동기화 모듈(lib/trip useTrip)이 유일한 통로다.
//
// 화면 원칙
//   - 상태와 사유는 늘 보인다(StateBanner). 오늘은 매일 확인·병원 중요 안내 대기를 덧씌운 표시용 일정이다.
//   - 환자 / 보호자 탭. 보호자 단독 외출을 만들 수 없는 날은 잠금 표시와 사유(합성된 동행 필수·곁 지키기)를 보인다.
//   - 타임라인: 병원 일정·복약 블록, 외출(출발 → 장소 → 복귀), 식사 칸(추천 장소 없음·비움·해당 없음은 사유와 함께),
//     이동 시간은 늘 '추정'. 복귀는 예상 귀가와 복귀 마감·마감 이유를 함께 쓴다.
//   - 적용한 조건(출처: 병원 발행 / 본인 체크 / 기본값 적용)과 빠진 장소(사유)는 접어 둔다.
//   - 편집: 바꾸기(후보 최대 5곳) · 빼기 · 식사 칸 비우기 · 다시 만들기(확인 대화). 지난 날짜·보기 전용·매일 확인 전인
//     오늘·이미 도착한 장소는 막고 이유를 보인다.
//   - '변경됨'은 전후 비교 시트로 연다. 닫으면 본 것으로 기록한다.
//   - AI/정해진 문장 소개는 판정 영역과 떨어진 별도 영역이다.
//   - 데모 사건 패널은 '병원 연동 데모' 모드의 오늘에만 단다.
//   - 시트는 뒤로 가기로 시트만 닫힌다.
//   - SEED ③층(설계서 6.2 6번): 회색 바탕 위 흰 블록. 날짜 칩 줄 / 상태 / 전환·타임라인 / 소개 / 도구.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import CourseCard from '../CourseCard.js';
import DeltaSheet from '../DeltaSheet.js';
import EventPanel from '../EventPanel.js';
import ReturnSheet from '../ReturnSheet.js';
import { useLang } from '../LanguageProvider.js';
import { Button, DateChip, DayTimeline, EmptyState, Icon, MealSlot, SourceTag, StateBanner, TopBar, Badge } from '../ui/index.js';
import useTrip from '@/lib/trip/useTrip.js';
import { isStayDate } from '@/src/stay/stay.js';
import { AppliedConditions, ExcludedList } from './DayFacts.js';
import IntroArea from './IntroArea.js';
import RegenerateSheet from './RegenerateSheet.js';
import SwapSheet from './SwapSheet.js';
import TripNotice from './TripNotice.js';
import UpdateFailedNotice from './UpdateFailedNotice.js';
import useKstClock from './useKstClock.js';
import {
  DEADLINE_REASON_KEY,
  canEditDay,
  deltaSummary,
  editErrorKey,
  formatDate,
  guardianTabInfo,
  isDemoMode,
  needsInputFix,
  stopEditable,
  timelineEntries,
} from './viewModel.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const GUARDIAN_REASON_KEY = {
  ESCORT_REQUIRED: 'trip.guardianESCORT_REQUIRED',
  GUARDIAN_MUST_STAY: 'trip.guardianGUARDIAN_MUST_STAY',
  NO_COMPANION: 'trip.guardianNO_COMPANION',
  WITH_PATIENT: 'trip.guardianWITH_PATIENT',
  NEEDS_INPUT: 'trip.guardianNEEDS_INPUT',
  NO_OUTING: 'trip.guardianNO_OUTING',
};

function useDateParam() {
  const params = useParams();
  const raw = params?.date;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

/** 타임라인 한 줄의 편집 버튼 */
function StopActions({ stop, slot, onSwap, onDelete, onClearMeal, busy }) {
  const { t } = useLang();
  const guard = (fn) => () => {
    if (!busy) fn();
  };
  return (
    <div className="trip-stop-actions">
      <button type="button" className="btn btn-secondary btn-small" aria-disabled={busy ? 'true' : undefined} onClick={guard(onSwap)}>
        {t('trip.actionSwap')}
        <span className="visually-hidden"> — {stop.title}</span>
      </button>
      {stop.isMeal && slot ? (
        <button type="button" className="btn btn-secondary btn-small" aria-disabled={busy ? 'true' : undefined} onClick={guard(onClearMeal)}>
          {t('trip.actionClearMeal')}
          <span className="visually-hidden"> — {stop.title}</span>
        </button>
      ) : (
        <button type="button" className="btn btn-secondary btn-small" aria-disabled={busy ? 'true' : undefined} onClick={guard(onDelete)}>
          {t('trip.actionDelete')}
          <span className="visually-hidden"> — {stop.title}</span>
        </button>
      )}
    </div>
  );
}

export default function DayScreen() {
  const date = useDateParam();
  const trip = useTrip();
  const clock = useKstClock();
  const { t, locale, lang, safety, pair } = useLang();
  const tabsId = useId();
  const timelineHeadingRef = useRef(null);
  const [tab, setTab] = useState('P');
  const [sheet, setSheet] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const today = trip.todayDate;
  const stay = trip.stay;
  const valid = DATE_RE.test(date);
  const inStay = valid && stay ? isStayDate(stay, date) : false;
  const day = valid && today ? trip.dayView(date) : null;
  const stored = trip.tripPlan?.days?.[date] ?? null;
  const nowMin = clock && clock.date === today ? clock.minutes : null;
  const isToday = date === today;
  const safetyLang = safety.primary === lang ? undefined : safety.primary;
  const title = valid ? formatDate(date, locale) : t('trip.dayHeader');

  const edit = canEditDay({ date, today, readOnly: trip.readOnly, dailyCheckPending: trip.dailyCheckPending, day: stored });
  const delta = deltaSummary(day);
  const guardian = guardianTabInfo(day, stay);
  const fix = needsInputFix(day);
  const demo = isDemoMode(stay) && isToday;

  const stripDates = useMemo(() => {
    if (!stay?.arrival?.date || !stay?.departure?.date) return [];
    const out = [];
    for (let d = stay.arrival.date; d <= stay.departure.date && out.length < 60; ) {
      out.push(d);
      const next = new Date(`${d}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
    return out;
  }, [stay]);

  const selectedChipRef = useRef(null);
  useEffect(() => {
    selectedChipRef.current?.querySelector('a')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [date, stripDates.length]);

  // 편집 뒤 알림을 보이고, 누른 버튼이 사라져 포커스를 잃었을 때만 일정 제목으로 옮긴다.
  // 시트가 열려 있으면(즉시 복귀 시트 등) 포커스를 시트 밖으로 빼지 않는다 — 시트가 닫힌 뒤에 본다.
  const done = useCallback((key, error = false) => {
    setNotice({ key, error });
    window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]')) return;
      const active = document.activeElement;
      if (active && active !== document.body && document.contains(active)) return;
      timelineHeadingRef.current?.focus();
    }, 400);
  }, []);

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setNotice({ key: 'trip.working', error: false });
    const res = await action();
    setBusy(false);
    return res;
  }

  async function removeStop(stop) {
    const res = await run(() => trip.deleteStop(date, stop.id));
    if (res) done(res.ok ? 'trip.deleted' : editErrorKey(res.code), !res.ok);
  }

  async function clearMealSlot(slot) {
    const res = await run(() => trip.clearMeal(date, slot));
    if (res) done(res.ok ? 'trip.mealCleared' : editErrorKey(res.code), !res.ok);
  }

  function closeDelta() {
    setSheet(null);
    void trip.markDeltaSeen(date);
  }

  function stopContent(entry) {
    const stop = entry.stop;
    const canTouch = edit.allowed && stopEditable(stop, { date, today, nowMin });
    const actions = canTouch ? (
      <StopActions
        stop={stop}
        slot={entry.slot}
        busy={busy}
        onSwap={() => setSheet({ kind: 'swap', stop, outingId: entry.outingId })}
        onDelete={() => removeStop(stop)}
        onClearMeal={() => clearMealSlot(entry.slot)}
      />
    ) : null;
    return (
      <CourseCard stop={stop} headingLevel={3}>
        {actions}
      </CourseCard>
    );
  }

  function toTimeline(entries) {
    return entries.map((entry) => {
      switch (entry.kind) {
        case 'depart':
          return { id: entry.id, kind: 'depart', time: entry.time, title: entry.place?.name ?? t('trip.placeLodging') };
        case 'return': {
          const place = entry.place?.name ?? (entry.place?.kind === 'HOSPITAL' ? t('trip.placeHospital') : t('trip.placeLodging'));
          const notes = [
            entry.plannedReturnAt ? t('trip.plannedReturn', { time: entry.plannedReturnAt }) : null,
            t('return.deadline', { time: entry.returnBy }),
            entry.deadlineReason && DEADLINE_REASON_KEY[entry.deadlineReason] ? t(DEADLINE_REASON_KEY[entry.deadlineReason]) : null,
          ].filter(Boolean);
          return { id: entry.id, kind: 'return', time: entry.time, endTime: entry.endTime, title: place, note: notes.join(' · ') };
        }
        case 'appointment':
          return { id: entry.id, kind: 'appointment', time: entry.time, endTime: entry.endTime, title: entry.place?.name ?? t('trip.placeHospital') };
        case 'medication':
          return { id: entry.id, kind: 'medication', time: entry.time, endTime: entry.endTime, title: t('trip.medicationAtLodging') };
        case 'rest':
          return { id: entry.id, kind: 'rest', time: entry.time, endTime: entry.endTime };
        case 'stop':
          return { id: entry.id, kind: 'stop', time: entry.time, endTime: entry.endTime, leg: entry.leg, content: stopContent(entry) };
        case 'meal':
          return {
            id: entry.id,
            kind: 'meal',
            time: entry.time,
            endTime: entry.endTime,
            leg: entry.stop ? entry.leg : undefined,
            content: (
              <MealSlot slot={entry.slot ?? 'LUNCH'} status={entry.status} reasons={entry.reasons}>
                {entry.stop ? stopContent(entry) : null}
              </MealSlot>
            ),
          };
        default:
          return null;
      }
    }).filter(Boolean);
  }

  function onTabKey(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = tab === 'P' ? 'G' : 'P';
    const target = event.key === 'Home' ? 'P' : event.key === 'End' ? 'G' : next;
    setTab(target);
    document.getElementById(`${tabsId}-tab-${target}`)?.focus();
  }

  const top = <TopBar title={title} backHref="/trip" backLabel={t('trip.backToTrip')} />;

  if (!today) {
    return (
      <>
        {top}
        <main className="page trip-page trip-day is-basement">
          <div className="ui-block">
            <p className="trip-loading" role="status">
              {t('trip.loading')}
            </p>
          </div>
        </main>
      </>
    );
  }

  let body;
  if (!stay) {
    body = (
      <div className="ui-block">
        <EmptyState
          icon="navTrip"
          title={t('today.noStayTitle')}
          body={t('today.noStayBody')}
          action={<Button href="/onboarding">{t('today.noStayAction')}</Button>}
        />
      </div>
    );
  } else if (!valid || !inStay) {
    body = (
      <div className="ui-block">
        <EmptyState
          icon="navTrip"
          title={t('trip.notInStayTitle')}
          body={t('trip.notInStayBody')}
          action={<Button href="/trip">{t('trip.backToTrip')}</Button>}
        />
      </div>
    );
  } else if (!day) {
    body = (
      <div className="ui-block">
        <EmptyState
          icon="navTrip"
          title={trip.syncing ? t('today.generatingTitle') : t('trip.noDayTitle')}
          body={trip.syncing ? t('today.generatingBody') : t('trip.noDayBody')}
          action={
            !trip.syncing && !trip.readOnly ? (
              <Button variant="secondary" onClick={() => trip.retry()}>
                {t('today.retry')}
              </Button>
            ) : null
          }
        />
      </div>
    );
  } else {
    const patientEntries = toTimeline(timelineEntries(day, { role: 'P', stay }));
    const guardianEntries = toTimeline(timelineEntries(day, { role: 'G', stay }));
    const returnTitle = pair('return.title');
    body = (
      <>
        <div className="ui-block trip-status-block">
          <StateBanner state={day.dayState} reasons={day.reasons ?? []} live />

          {/* 변경됨 알림 (SEED Callout · actionable, 설계서 5.6): 누르면 전후 비교 시트 */}
          {delta?.unseen && (
            <button type="button" className="trip-changed" onClick={() => setSheet({ kind: 'delta' })}>
              <span className="trip-changed-dot" aria-hidden="true" />
              <span className="trip-changed-text">{t('trip.changedCta')}</span>
              <Icon name="chevronRight" size={18} />
            </button>
          )}

          {stored?.returnNow && (
            <section className="trip-return-banner" aria-labelledby={`${tabsId}-return`}>
              <h2 id={`${tabsId}-return`} lang={returnTitle.primary.lang}>
                {returnTitle.primary.text}
              </h2>
              <p className="trip-pair-secondary" lang={returnTitle.secondary.lang}>
                {returnTitle.secondary.text}
              </p>
              {!trip.immediateReturn && (
                <button type="button" className="btn btn-return" onClick={() => setSheet({ kind: 'return' })}>
                  {t('return.reopen')}
                </button>
              )}
            </section>
          )}

          {isToday && trip.dailyCheckPending && (
            <TripNotice as="p">
              {t('trip.gatedToday')}{' '}
              <Link className="trip-inline-link" href="/today">
                {t('trip.goDailyCheck')}
              </Link>
            </TripNotice>
          )}
          {isToday && trip.unconfirmedHospitalUpdate && (
            <TripNotice as="p">
              {t('today.unconfirmedTitle')}{' '}
              <Link className="trip-inline-link" href="/guide">
                {t('today.unconfirmedCta')}
              </Link>
            </TripNotice>
          )}

          {fix && (
            <section className="trip-fix" aria-labelledby={`${tabsId}-fix`}>
              <h2 id={`${tabsId}-fix`}>{t('trip.fixTitle')}</h2>
              <Button href={trip.readOnly ? undefined : fix.href} disabled={trip.readOnly}>
                {t(fix.key)}
              </Button>
            </section>
          )}
        </div>

        <div className="ui-block trip-timeline-block">
          <div className="tabs" role="tablist" aria-label={t('trip.tabsLabel')}>
            {[
              ['P', t('trip.tabPatient')],
              ['G', t('trip.tabGuardian')],
            ].map(([role, label]) => (
              <button
                key={role}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${role}`}
                aria-selected={tab === role}
                aria-controls={`${tabsId}-panel-${role}`}
                tabIndex={tab === role ? 0 : -1}
                onClick={() => setTab(role)}
                onKeyDown={onTabKey}
              >
                {label}
                {role === 'G' && guardian.locked && (
                  <span className="trip-tab-lock">
                    <Icon name="lock" size={16} />
                    <span className="visually-hidden">{t('trip.lockedLabel')}</span>
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 알림 자리: 진행·완료 알림은 상자 없이 글자만, 실패 알림만 실패 상자로 */}
          <TripNotice slot role="status" error={Boolean(notice?.error)} plain={!notice?.error}>
            {notice ? t(notice.key) : ''}
          </TripNotice>

          {['P', 'G'].map((role) => (
            <section
              key={role}
              id={`${tabsId}-panel-${role}`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-tab-${role}`}
              hidden={tab !== role}
              className="trip-panel"
            >
              <h2 className="trip-panel-title" tabIndex={-1} ref={tab === role ? timelineHeadingRef : undefined}>
                {role === 'P' ? t('trip.timelinePatient') : t('trip.timelineGuardian')}
              </h2>
              {role === 'G' && guardian.reason ? (
                <div className={guardian.locked ? 'trip-guardian-lock is-locked' : 'trip-guardian-lock'}>
                  <p className="trip-guardian-head">
                    <Icon name={guardian.locked ? 'lock' : 'stateSplit'} size={20} />
                    <span>{guardian.locked ? t('trip.guardianLockTitle') : t('trip.guardianInfoTitle')}</span>
                  </p>
                  <p lang={safetyLang}>{t(GUARDIAN_REASON_KEY[guardian.reason])}</p>
                  {(guardian.sources.length > 0 || guardian.defaulted) && (
                    <p className="trip-guardian-tags">
                      {guardian.sources.map((source) => (
                        <SourceTag key={source} source={source === 'HOSPITAL' ? 'hospital' : 'self'} />
                      ))}
                      {guardian.defaulted && <Badge kind="defaulted" />}
                    </p>
                  )}
                </div>
              ) : null}
              {(role === 'P' ? patientEntries : guardianEntries).length > 0 ? (
                <DayTimeline
                  label={role === 'P' ? t('trip.timelinePatient') : t('trip.timelineGuardian')}
                  person={role === 'P' ? 'patient' : 'guardian'}
                  entries={role === 'P' ? patientEntries : guardianEntries}
                />
              ) : role === 'P' ? (
                <p className="trip-empty-line">{t('trip.noTimeline')}</p>
              ) : null}
            </section>
          ))}
        </div>

        {/* 하루 소개는 타임라인 **뒤에** 둔다. 앞에 두면 일정이 첫 화면 밖으로 밀리는데,
            소개는 아래 타임라인을 한 줄로 요약한 것이라 먼저 읽을 이유가 없다.
            판정·사유 영역과 떨어진 별도 영역이라는 점은 그대로다(spec 4.16). */}
        <IntroArea day={day} stay={stay} readOnly={trip.readOnly} />

        <div className="ui-block trip-tools-block">
          <section className="trip-tools" aria-labelledby={`${tabsId}-tools`}>
            <h2 id={`${tabsId}-tools`} className="visually-hidden">
              {t('trip.toolsTitle')}
            </h2>
            <Button variant="secondary" disabled={!edit.allowed || busy} onClick={() => setSheet({ kind: 'regenerate' })}>
              {t('trip.regenerate')}
            </Button>
            {!edit.allowed && edit.reasonKey && <p className="trip-map-note">{t(edit.reasonKey)}</p>}
          </section>

          <AppliedConditions day={day} stay={stay} />
          <ExcludedList day={day} />

          {demo && (
            <EventPanel
              day={stored}
              nowMin={nowMin ?? 0}
              events={trip.todayEvents}
              busy={busy || trip.syncing}
              readOnly={trip.readOnly}
              onEvent={async (event) => {
                const res = await run(() => trip.addDemoEvent(event));
                if (res) done(res.ok ? 'trip.demoApplied' : editErrorKey(res.code), !res.ok);
              }}
              onReset={async () => {
                const res = await run(() => trip.resetDemoEvents());
                if (res) done(res.ok ? 'trip.demoResetDone' : editErrorKey(res.code), !res.ok);
              }}
            />
          )}

          <p className="trip-footer" lang={safetyLang}>
            {t('trip.footer')}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {top}
      <main className="page trip-page trip-day is-basement">
        {stripDates.length > 0 && (
          <nav className="ui-block trip-strip" aria-label={t('trip.stripLabel')}>
            <ul className="ui-date-strip" role="list">
              {stripDates.map((d) => {
                const shown = d === today ? trip.today.day : trip.tripPlan?.days?.[d] ?? null;
                return (
                  <li key={d} ref={d === date ? selectedChipRef : undefined}>
                    <DateChip
                      date={d}
                      state={shown?.dayState}
                      isToday={d === today}
                      selected={d === date}
                      hasAppointment={(shown?.blocks ?? []).some((b) => b?.kind === 'APPOINTMENT')}
                      href={`/trip/${d}`}
                    />
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {trip.updateFailed && (
          <div className="ui-block">
            <UpdateFailedNotice readOnly={trip.readOnly} onRetry={() => trip.retry()} />
          </div>
        )}

        {body}
      </main>

      {sheet?.kind === 'swap' && (
        <SwapSheet
          date={date}
          outingId={sheet.outingId}
          stop={sheet.stop}
          loadAlternatives={trip.alternatives}
          applySwap={trip.applySwap}
          onDone={(key) => done(key)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'delta' && day && <DeltaSheet day={day} dateLabel={title} onClose={closeDelta} />}
      {sheet?.kind === 'regenerate' && (
        <RegenerateSheet
          date={date}
          dateLabel={title}
          regenerate={(scope, d) => trip.regenerate(scope, d ?? undefined)}
          onDone={(key) => done(key)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'return' && !trip.immediateReturn && (
        <ReturnSheet day={stored} stay={stay} cause={(stored?.reasons ?? []).find((r) => ['PATIENT_RECALLED', 'PLAN_REVOKED', 'PLAN_EXPIRED'].includes(r)) ?? null} onClose={() => setSheet(null)} />
      )}
    </>
  );
}
