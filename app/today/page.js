'use client';

// /today 홈: 오늘 상태·매일 확인·다음 일정·복귀 마감·변경 알림 (AX-317 · docs/platform/IA_AND_FLOWS.md '매일 쓰는 흐름'·'매일 확인과 오늘 게이트 덧씌우기'·'보기 전용 상태')
//
// 화면 원칙
//   - **판정을 새로 만들지 않는다.** 기기에 저장된 확정 일정을 동기화 모듈(lib/trip useTrip)로만 읽는다.
//     오늘은 매일 확인·확인하지 않은 병원 중요 안내를 덧씌운 표시용 일정이다. 저장 일정은 바꾸지 않는다(docs/business-rules.md '전체 일정 확정과 변화 대응', 오늘 게이트 덧씌우기).
//   - 매일 확인 카드는 맨 위에 고정한다. 확인 전에는 상태가 STANDBY + DAILY_CHECK_PENDING 이고
//     길찾기·장소 이동과 편집을 막는다(docs/business-rules.md '매일 확인'·'사용자 편집').
//   - 상태·사유는 늘 보인다(안전 문구 병기). 복귀 마감은 마감 이유·예상 귀가와 함께, 두 언어로 보인다.
//   - '변경됨'은 전후 비교 시트로 연다(닫으면 본 것으로 기록). 즉시 복귀 시트는 앱 셸 옆 TripRuntime 이 자동으로 연다.
//   - 업데이트 실패·보호자 링크 다시 보내기·동반 보호자 '다시 만들기' 안내를 보인다.
//   - 로그인 만료·오프라인에서는 보기 전용이다 — 오늘 일정과 복귀 마감은 보이고, 확인·편집은 막는다.
//   - SEED ③층(설계서 6.2 7번): 회색 바탕 위 흰 블록. 갱신 실패(있을 때만) / 매일 확인 / 날짜·상태 / 병원 안내 / 다음 외출 / 바로가기 / 보호자·동반 안내.
//     '새로 고치는 중' 줄은 따로 블록을 두지 않고 날짜·상태 블록 안 날짜 줄 아래에 둔다(열 때마다 화면이 흔들리지 않게).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CourseCard from '@/components/CourseCard.js';
import DeltaSheet from '@/components/DeltaSheet.js';
import ReturnSheet from '@/components/ReturnSheet.js';
import { useLang } from '@/components/LanguageProvider.js';
import { Badge, Button, EmptyState, Icon, ListGroup, ListItem, StateBanner, TopBar } from '@/components/ui/index.js';
import DailyCheckCard from '@/components/trip/DailyCheckCard.js';
import MapLinks from '@/components/trip/MapLinks.js';
import RegenerateSheet from '@/components/trip/RegenerateSheet.js';
import TripNotice from '@/components/trip/TripNotice.js';
import UpdateFailedNotice from '@/components/trip/UpdateFailedNotice.js';
import useKstClock from '@/components/trip/useKstClock.js';
import { GUARDIAN_WINDOW_DAYS } from '@/src/guardian/index.js';
import { dayActionKey, deadlineCopyOf, deltaSummary, formatDate, isDemoMode, needsInputFix, outingDayNote, plannedReturnOf, returnPlaceOf, todayFocus } from '@/components/trip/viewModel.js';
import useTrip from '@/lib/trip/useTrip.js';
import { RETURN_NOW_CAUSES } from '@/src/domain/states.js';
import { isStayDate } from '@/src/stay/stay.js';

function nextDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 복귀 마감: 안전 문구 두 줄(주 언어 + 병기). 하루 활동 종료(DAY_END)면 '오늘 활동 종료'로 부른다(viewModel deadlineCopyOf) */
function Deadline({ outing, day, stay }) {
  const { t, pair } = useLang();
  const copy = deadlineCopyOf(outing, { isToday: true });
  const deadline = pair(copy.timeKey, { time: outing.returnBy });
  const reason = copy.reasonKey ? pair(copy.reasonKey) : null;
  const plannedAt = plannedReturnOf(outing);
  const planned = plannedAt ? pair('trip.plannedReturn', { time: plannedAt }) : null;
  const place = returnPlaceOf(outing, day, stay);
  const placeName = place.name ?? (place.kind === 'HOSPITAL' ? t('trip.placeHospital') : t('trip.placeLodging'));
  return (
    <div className="today-deadline">
      <p className="today-deadline-main" lang={deadline.primary.lang}>
        <Icon name="flag" size={20} /> {deadline.primary.text}
      </p>
      <p className="today-deadline-place">{t('today.returnTo', { place: placeName })}</p>
      {reason && <p lang={reason.primary.lang}>{reason.primary.text}</p>}
      {planned && (
        <p lang={planned.primary.lang}>
          {planned.primary.text} <span className="today-estimate">({t('common.badgeEstimate')})</span>
        </p>
      )}
      <p className="trip-pair-secondary" lang={deadline.secondary.lang}>
        {[deadline.secondary.text, reason?.secondary.text, planned?.secondary.text].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

export default function TodayPage() {
  const router = useRouter();
  const { t, locale, pair } = useLang();
  const trip = useTrip();
  const clock = useKstClock();
  const [sheet, setSheet] = useState(null);
  const [notice, setNotice] = useState(null);
  const dateRef = useRef(null);

  // 첫 조건 기간을 저장하고 넘어온 경우(/today?welcome=1) 한 번만 알린다. 주소에서 바로 지워 새로 고쳐도 다시 뜨지 않는다
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('welcome') !== '1') return undefined;
    const timer = window.setTimeout(() => {
      url.searchParams.delete('welcome');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      setNotice('today.firstPlanReady');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const today = trip.todayDate;
  const stay = trip.stay;
  const day = trip.today.day;
  const stored = trip.today.stored;
  const nowMin = clock && clock.date === today ? clock.minutes : null;
  const gated = trip.dailyCheckPending || trip.unconfirmedHospitalUpdate;
  const inStay = today && stay ? isStayDate(stay, today) : false;
  const tomorrow = today ? nextDate(today) : null;
  const hasTomorrow = inStay && tomorrow && isStayDate(stay, tomorrow);

  function confirmSame() {
    const res = trip.confirmDailyCheck();
    setNotice(res?.ok ? 'today.checkDone' : 'trip.editReadOnly');
    // 누른 카드가 사라진다 — 포커스를 오늘 날짜 줄로 옮긴다
    if (res?.ok) window.setTimeout(() => dateRef.current?.focus(), 0);
  }

  function changed() {
    const res = trip.dailyCheckChanged();
    if (res?.ok) router.push('/conditions');
    else setNotice('trip.editReadOnly');
  }

  function closeDelta() {
    setSheet(null);
    if (today) void trip.markDeltaSeen(today);
  }

  const top = <TopBar title={t('today.header')} />;
  // 체류 중이 아닌 화면(일정 만드는 중·도착 전·출국 뒤·그날 일정 없음)에도 알림 자리를 둔다.
  // 첫 기간을 도착 전에 저장하면 여기로 와서 '첫 일정을 만들었어요'를 보여야 한다 (2026-11-08 검토 반영)
  const noticeSlot = (
    <TripNotice slot role="status">
      {notice ? t(notice) : ''}
    </TripNotice>
  );
  let body;

  if (!today) {
    body = (
      <div className="ui-block">
        <p className="today-loading" role="status">
          {t('today.loading')}
        </p>
      </div>
    );
  } else if (!stay) {
    body = (
      <div className="ui-block">
        <EmptyState
          icon="navToday"
          title={t('today.noStayTitle')}
          body={t('today.noStayBody')}
          action={<Button href="/onboarding">{t('today.noStayAction')}</Button>}
        />
      </div>
    );
  } else if (!trip.tripPlan) {
    body = (
      <div className="ui-block">
        {noticeSlot}
        <EmptyState
          icon="navToday"
          title={trip.syncing ? t('today.generatingTitle') : t('today.noPlanTitle')}
          body={trip.syncing ? t('today.generatingBody') : trip.readOnly ? t('today.noPlanReadOnly') : t('today.noPlanBody')}
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
  } else if (!inStay) {
    const before = stay.arrival?.date && today < stay.arrival.date;
    body = (
      <div className="ui-block">
        {noticeSlot}
        <EmptyState
          icon="navTrip"
          title={before ? t('today.beforeTripTitle') : t('today.afterTripTitle')}
          body={before ? t('today.beforeTripBody', { date: formatDate(stay.arrival.date, locale) }) : t('today.afterTripBody')}
          action={<Button href="/trip">{t('today.seeTrip')}</Button>}
        />
      </div>
    );
  } else if (!day) {
    body = (
      <div className="ui-block">
        {noticeSlot}
        <EmptyState
          icon="navToday"
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
    const focus = nowMin === null ? null : todayFocus(day, nowMin);
    const delta = deltaSummary(day);
    const fix = needsInputFix(day);
    const returnTitle = pair('return.title');
    const outingNow = Boolean(focus && focus.phase !== 'DONE' && focus.outing);
    // 즉시 복귀 중에는 '외출을 모두 마쳤어요'를 보이지 않는다(복귀 배너와 어긋난다)
    const outingDone = focus?.phase === 'DONE' && !stored?.returnNow;
    const outingNone = !focus && nowMin !== null && !fix && !stored?.returnNow;
    const hasOutingBlock = outingNow || outingDone || outingNone || Boolean(focus?.nextAppointment);
    body = (
      <>
        {trip.dailyCheckPending && (
          <div className="ui-block today-check-block">
            <DailyCheckCard day={stored} stay={stay} readOnly={trip.readOnly} onSame={confirmSame} onChanged={changed} />
          </div>
        )}

        <div className="ui-block today-status-block">
          <p className="today-date" tabIndex={-1} ref={dateRef}>
            <span>{formatDate(today, locale)}</span>
            {/* 연결된 지침이 데모면 늘 밝힌다. 데모를 실제 연동처럼 보이지 않게 (docs/business-rules.md '병원 연동') */}
            {isDemoMode(stay) && <Badge kind="demo" label={t('link.demoBadge')} />}
          </p>

          {/* 새로 고치는 중: 따로 흰 블록을 띄우면 열 때마다 화면이 흔들린다. 상태 블록 안 날짜 줄 바로 아래 한 줄로 둔다 */}
          {trip.syncing && trip.tripPlan && (
            <p className="today-syncing" role="status">
              {t('today.syncing')}
            </p>
          )}

          <StateBanner
            state={day.dayState}
            reasons={day.reasons ?? []}
            actionKey={dayActionKey(day, { isToday: true, screen: 'today' })}
            outingNote={outingDayNote(day)}
            live
          />

          {noticeSlot}

          {/* 변경됨 알림 (SEED Callout · actionable, 설계서 5.6): 누르면 전후 비교 시트 */}
          {delta?.unseen && (
            <button type="button" className="trip-changed" onClick={() => setSheet('delta')}>
              <span className="trip-changed-dot" aria-hidden="true" />
              <span className="trip-changed-text">{t('trip.changedCta')}</span>
              <Icon name="chevronRight" size={18} />
            </button>
          )}

          {stored?.returnNow && !trip.immediateReturn && (
            <section className="trip-return-banner" aria-labelledby="today-return-h">
              <h2 id="today-return-h" lang={returnTitle.primary.lang}>
                {returnTitle.primary.text}
              </h2>
              <p className="trip-pair-secondary" lang={returnTitle.secondary.lang}>
                {returnTitle.secondary.text}
              </p>
              <button type="button" className="btn btn-return" onClick={() => setSheet('return')}>
                {t('return.reopen')}
              </button>
            </section>
          )}

          {fix && (
            <section className="trip-fix" aria-labelledby="today-fix-h">
              <h2 id="today-fix-h">{t('today.needsInputTitle')}</h2>
              <Button href={trip.readOnly ? undefined : fix.href} disabled={trip.readOnly}>
                {t(fix.key)}
              </Button>
            </section>
          )}
        </div>

        {trip.unconfirmedHospitalUpdate && (
          <section className="ui-block today-section" aria-labelledby="today-hospital-h">
            <h2 id="today-hospital-h">
              <Icon name="hospital" size={20} /> {t('today.unconfirmedTitle')}
            </h2>
            <p>{t('today.unconfirmedBody')}</p>
            <Button href="/guide" variant="secondary">
              {t('today.unconfirmedCta')}
            </Button>
          </section>
        )}

        {hasOutingBlock && (
          <div className="ui-block today-outing-block">
            {outingNow && (
              <section className="today-focus" aria-labelledby="today-focus-h">
                <h2 id="today-focus-h">{focus.phase === 'OUT' ? t('today.nextOutTitle') : t('today.nextNextTitle')}</h2>
                <p className="today-focus-depart">{t('today.departAt', { time: focus.outing.departAt })}</p>
                <Deadline outing={focus.outing} day={day} stay={stay} />
                {focus.stop && (
                  <div className="today-next-stop">
                    <h3>{t('today.nextStop')}</h3>
                    <CourseCard stop={focus.stop} variant="compact" headingLevel={4} />
                    <MapLinks stop={focus.stop} disabled={gated || focus.outing.actionable === false} disabledKey={trip.dailyCheckPending ? 'today.gatedMaps' : 'today.gatedHospital'} showNote />
                  </div>
                )}
              </section>
            )}
            {outingDone && (
              <section className="today-outing-empty" aria-labelledby="today-done-h">
                <h2 id="today-done-h">{t('today.nextDoneTitle')}</h2>
              </section>
            )}
            {outingNone && (
              <section className="today-outing-empty" aria-labelledby="today-none-h">
                <h2 id="today-none-h">{t('today.noOutingTitle')}</h2>
                <p>{t('today.noOutingBody')}</p>
              </section>
            )}
            {focus?.nextAppointment && (
              <p className="today-appointment">
                <Icon name="hospital" size={18} /> {t('today.appointmentLine', { start: focus.nextAppointment.start, end: focus.nextAppointment.end })}
              </p>
            )}
          </div>
        )}

        <div className="ui-block today-links-block">
          <ListGroup>
            <li>
              <ListItem title={t('today.fullDay')} leading={<Icon name="navTrip" size={22} />} trailing="chevron" href={`/trip/${today}`} />
            </li>
            {hasTomorrow && (
              <li>
                <ListItem title={t('today.tomorrow')} leading={<Icon name="navTrip" size={22} />} trailing="chevron" href={`/trip/${tomorrow}`} />
              </li>
            )}
          </ListGroup>
        </div>

        {(trip.guardianResendNeeded || trip.guardianWindowPassed) && (
          <section className="ui-block today-section" aria-labelledby="today-guardian-h">
            {/* 일정 변화가 있으면 그 안내가 앞선다. 없고 보낸 링크의 7일 범위만 지났으면 다음 7일 링크를 안내한다 */}
            <h2 id="today-guardian-h">{t(trip.guardianResendNeeded ? 'today.guardianResendTitle' : 'today.guardianWindowTitle')}</h2>
            <p>
              {trip.guardianResendNeeded
                ? t('today.guardianResendBody')
                : t('today.guardianWindowBody', { n: GUARDIAN_WINDOW_DAYS })}
            </p>
            <Button href={trip.readOnly ? undefined : '/guardian'} variant="secondary" disabled={trip.readOnly}>
              {t('today.guardianResendCta')}
            </Button>
          </section>
        )}

        {trip.companionChangeNeedsRegenerate && (
          <section className="ui-block today-section" aria-labelledby="today-companion-h">
            <h2 id="today-companion-h">{t('today.companionTitle')}</h2>
            <p>{t('today.companionBody')}</p>
            {/* 닫기 + 행동 (설계서 5.1): [나중에 3][다시 만들기 7]. 보이는 순서와 DOM 순서가 같다 */}
            <div className="today-section-actions">
              <Button variant="secondary" onClick={() => trip.dismissCompanionNotice()}>
                {t('today.companionDismiss')}
              </Button>
              <Button variant="secondary" disabled={trip.readOnly || trip.dailyCheckPending} onClick={() => setSheet('regenerate')}>
                {t('today.companionCta')}
              </Button>
            </div>
            {trip.dailyCheckPending && <p className="trip-map-note">{t('trip.editGated')}</p>}
          </section>
        )}
      </>
    );
  }

  return (
    <>
      {top}
      <main className="page today-page is-basement">
        {trip.updateFailed && (
          <div className="ui-block today-sync-block">
            <UpdateFailedNotice readOnly={trip.readOnly} upstream={trip.lastUpstream} onRetry={() => trip.retry()} />
          </div>
        )}
        {body}
        <p className="trip-footer">
          <Link className="trip-inline-link" href="/privacy">
            {t('today.privacyLink')}
          </Link>
        </p>
      </main>
      {sheet === 'delta' && day && <DeltaSheet day={day} dateLabel={formatDate(today, locale)} isToday onClose={closeDelta} />}
      {sheet === 'return' && !trip.immediateReturn && (
        <ReturnSheet
          day={stored}
          stay={stay}
          cause={(stored?.reasons ?? []).find((r) => RETURN_NOW_CAUSES.includes(r)) ?? null}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'regenerate' && (
        <RegenerateSheet
          date={null}
          initialScope="FROM_TODAY"
          regenerate={(scope) => trip.regenerate(scope)}
          onDone={(key) => {
            setNotice(key);
            trip.dismissCompanionNotice();
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
