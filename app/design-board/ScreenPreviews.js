'use client';

// 시안 보드 '화면 시안' — 주요 화면 8개의 축소 시안 (AX-321 · spec 7장)
//
// 대상: 오늘 · 전체 일정 · 하루 일정 · 조건 · 장소 상세 · 한국어 카드 · 긴급 연락 · 보호자 열기.
//
// 원칙
//   - **실제 화면 부품**(components/ui · StateBanner · CourseCard · MapLinks · DayFacts ·
//     ConsentPanel · PeriodCard · DayConditions · CoverageTag · GuardianCopyView · PairText)과 **실제 표시 모델**
//     (components/trip/viewModel.js · components/cards/cardModel.js · app/emergency/contacts.js ·
//     src/guardian buildGuardianSnapshot)을 쓴다.
//   - 화면 페이지 자체는 기기 저장소(useTrip·useStay)를 읽으므로 여기서 부르지 않는다. 페이지가 부품을 늘어놓는
//     배치만 같은 클래스·같은 문구 키로 옮겨 적었다. 페이지 배치가 바뀌면 이 파일도 같이 고친다.
//   - 저장소를 읽거나 서버를 부르는 부품은 마크업만 옮겨 적었다(같은 클래스·같은 문구 키):
//     오늘의 Deadline, 하루 일정의 StopActions·타임라인 변환·하루 소개(IntroArea 의 정해진 문장 가지),
//     조건의 동의 철회(ConsentWithdraw). 원본이 바뀌면 같이 고친다.
//   - 데이터는 ./screenData.js 의 고정 데모 값뿐이다. 저장소·세션·서버를 부르지 않는다(spec 7장).
//     오늘·전체 일정·하루 일정은 매일 확인을 마친 오늘로 그린다. 확인 전이면 매일 확인 카드가 첫 화면을 다 차지해
//     복귀 마감이 틀 아래로 잘린다(실제 화면도 확인 카드는 확인 전에만 맨 위에 선다).
//     확인 전 모습(매일 확인 카드, 규칙 32의 관문)은 DesignBoard.js 부품 견본의 '매일 확인 카드 (확인 전)'가 보인다.
//   - 시안 맨 바깥은 실제 화면의 main 과 같은 클래스를 단 div 다(main 랜드마크는 두지 않는다).
//     회색 바탕 화면은 is-basement + .ui-block 이다(오늘 · 하루 일정 · 조건).
//   - 시안은 그림이다: 화면 틀 전체를 `inert` 로 둬 누르거나 포커스할 수 없다(전화 걸기·길찾기 링크 포함).
//     무엇을 보여 주는지는 그림 아래 설명(figcaption)이 알린다.
//   - 화면 틀은 지금 앱의 셸을 따른다(components/ui/AppShell.js). 하단 내비가 있으면 다섯째 칸이 긴급이라
//     떠 있는 긴급 버튼을 두지 않고, 내비가 없는 화면(/g)은 하단 긴급 바를 둔다.
//     시안 안에는 .sticky-return 을 두지 않는다(보드 페이지가 아래 여백·초점 스크롤 여백을 더 받게 된다).
//   - 화면 틀은 360×760 으로 그리고 CSS transform 으로 줄인다. 틀 밖으로 넘치는 아래쪽은 잘린다.

import { useId, useMemo } from 'react';
import Link from 'next/link';
import CourseCard from '@/components/CourseCard.js';
import { useLang } from '@/components/LanguageProvider.js';
import {
  Badge,
  BottomNav,
  Button,
  DateChip,
  DayTimeline,
  EmergencyButton,
  Icon,
  KoreanCard,
  ListGroup,
  ListItem,
  MealSlot,
  SourceArea,
  StateBanner,
  TopBar,
} from '@/components/ui/index.js';
import ConsentPanel from '@/components/conditions/ConsentPanel.js';
import CoverageTag from '@/components/conditions/CoverageTag.js';
import DayConditions from '@/components/conditions/DayConditions.js';
import PeriodCard from '@/components/conditions/PeriodCard.js';
import SafetyText from '@/components/conditions/SafetyText.js';
import GuardianCopyView from '@/components/guardian/GuardianCopyView.js';
import PairText from '@/components/settings/PairText.js';
import { AppliedConditions, ExcludedList } from '@/components/trip/DayFacts.js';
import MapLinks from '@/components/trip/MapLinks.js';
import {
  DEADLINE_REASON_KEY,
  deltaSummary,
  formatDate,
  guardianTabInfo,
  introRequestFor,
  returnPlaceOf,
  stopBadges,
  timelineEntries,
  todayFocus,
  tripDateRows,
} from '@/components/trip/viewModel.js';
import { EMERGENCY_LINES, hospitalContacts } from '@/app/emergency/contacts.js';
import { fmtDateTime } from '@/lib/format.js';
import { translate } from '@/src/i18n/index.js';
import { templates as INTRO_TEMPLATES } from '@/src/i18n/messages/aiIntro.js';
import { DEMO_DETAIL_DATE, DEMO_NOW_MIN, DEMO_NOW_MS, DEMO_PERIODS, DEMO_TODAY, buildDemoTrip } from './screenData.js';

/** 화면 틀 하나. 그림(inert) + 설명. 틀 아래 독은 셸을 따른다: 내비가 있으면 내비만, 없으면 하단 긴급 바 */
function Phone({ name, route, note, nav, children }) {
  return (
    <figure className="designBoard-screen">
      <div className="designBoard-phone">
        <div className="designBoard-phone-screen" inert>
          <div className="designBoard-phone-scroll">{children}</div>
          <div className="designBoard-phone-dock">
            {nav ? (
              <BottomNav pathname={nav} preview />
            ) : (
              <div className="ui-emergency-bar">
                <EmergencyButton preview docked />
              </div>
            )}
          </div>
        </div>
      </div>
      <figcaption className="designBoard-screen-caption">
        <span className="designBoard-screen-name">{name}</span>
        <code>{route}</code>
        <span className="designBoard-screen-note">{note}</span>
      </figcaption>
    </figure>
  );
}

// ── 1. 오늘 (app/today/page.js 의 '하루 있음' 가지) ──

/** 복귀 마감 — app/today/page.js 의 Deadline 과 같은 배치 */
function Deadline({ outing, day, stay }) {
  const { t, pair } = useLang();
  const deadline = pair('return.deadline', { time: outing.returnBy });
  const reasonKey = DEADLINE_REASON_KEY[outing.deadlineReason];
  const reason = reasonKey ? pair(reasonKey) : null;
  const planned = outing.plannedReturnAt ? pair('trip.plannedReturn', { time: outing.plannedReturnAt }) : null;
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

function TodayScreen({ demo }) {
  const { t, locale } = useLang();
  const focusId = useId();
  const day = demo.todayStored;
  const focus = todayFocus(day, DEMO_NOW_MIN);
  return (
    <>
      <TopBar title={t('today.header')} />
      <div className="page today-page is-basement designBoard-phone-page">
        <div className="ui-block today-status-block">
          <p className="today-date">
            <span>{formatDate(DEMO_TODAY, locale)}</span>
          </p>
          <StateBanner state={day.dayState} reasons={day.reasons ?? []} />
        </div>

        {(focus?.outing || focus?.nextAppointment) && (
          <div className="ui-block today-outing-block">
            {focus.outing && (
              <section className="today-focus" aria-labelledby={focusId}>
                <h2 id={focusId}>{focus.phase === 'OUT' ? t('today.nextOutTitle') : t('today.nextNextTitle')}</h2>
                <p className="today-focus-depart">{t('today.departAt', { time: focus.outing.departAt })}</p>
                <Deadline outing={focus.outing} day={day} stay={demo.stay} />
                {focus.stop && (
                  <div className="today-next-stop">
                    <h3>{t('today.nextStop')}</h3>
                    <CourseCard stop={focus.stop} variant="compact" headingLevel={4} />
                    <MapLinks stop={focus.stop} showNote />
                  </div>
                )}
              </section>
            )}
            {focus.nextAppointment && (
              <p className="today-appointment">
                <Icon name="hospital" size={18} />{' '}
                {t('today.appointmentLine', { start: focus.nextAppointment.start, end: focus.nextAppointment.end })}
              </p>
            )}
          </div>
        )}

        <div className="ui-block today-links-block">
          <ListGroup>
            <li>
              <ListItem title={t('today.fullDay')} leading={<Icon name="navTrip" size={22} />} trailing="chevron" href={`/trip/${DEMO_TODAY}`} />
            </li>
            <li>
              <ListItem title={t('today.tomorrow')} leading={<Icon name="navTrip" size={22} />} trailing="chevron" href={`/trip/${DEMO_DETAIL_DATE}`} />
            </li>
          </ListGroup>
        </div>

        <p className="trip-footer">
          <Link className="trip-inline-link" href="/privacy">
            {t('today.privacyLink')}
          </Link>
        </p>
      </div>
    </>
  );
}

// ── 2. 전체 일정 (app/trip/page.js) ──

function TripScreen({ demo }) {
  const { t, locale, lang, safety, reasonText } = useLang();
  const toolsId = useId();
  const rows = tripDateRows({ stay: demo.stay, days: demo.tripPlan.days, today: DEMO_TODAY });
  const reasonLang = safety.primary === lang ? undefined : safety.primary;
  return (
    <>
      <TopBar title={t('trip.header')} />
      <div className="page trip-page designBoard-phone-page">
        <p className="trip-lead">
          {t('trip.range', { start: formatDate(demo.stay.arrival.date, locale), end: formatDate(demo.stay.departure.date, locale) })}
        </p>
        <ol className="trip-days">
          {rows.map((row) => (
            <li key={row.date} data-date={row.date} className={row.isPast ? 'trip-day-row is-past' : 'trip-day-row'}>
              <DateChip
                date={row.date}
                state={row.state ?? undefined}
                isToday={row.isToday}
                hasAppointment={row.hasAppointment}
                href={`/trip/${row.date}`}
              />
              <div className="trip-day-info">
                <p className="trip-day-title">
                  <span aria-hidden="true">{formatDate(row.date, locale)}</span>
                  {row.changed && <span className="trip-changed-tag">{t('trip.changed')}</span>}
                </p>
                <p className="trip-day-meta">
                  {row.state ? (
                    <span className={`trip-state-text trip-state-${row.state}`} lang={reasonLang}>
                      {t(`state.${row.state}`)}
                    </span>
                  ) : (
                    <span>{t('trip.dayPending')}</span>
                  )}
                  {row.coverage && <CoverageTag coverage={row.coverage} />}
                </p>
                {(row.stopCount > 0 || row.guardianStopCount > 0) && (
                  <p className="trip-day-count">
                    {t('trip.stopCount', { n: row.stopCount })}
                    {row.guardianStopCount > 0 && ` · ${t('trip.guardianStopCount', { n: row.guardianStopCount })}`}
                  </p>
                )}
                {row.reasons.length > 0 && (
                  <ul className="trip-day-reasons" lang={reasonLang}>
                    {row.reasons.map((code) => (
                      <li key={code}>{reasonText(code)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <span className="trip-day-chevron" aria-hidden="true">
                <Icon name="chevronRight" size={18} />
              </span>
              {/* 행 끝 덮개 링크: 실제 화면과 같다. 시안은 inert 라 눌리지 않는다 */}
              <Link className="trip-day-link" href={`/trip/${row.date}`} tabIndex={-1} aria-hidden="true" />
            </li>
          ))}
        </ol>

        <section className="trip-tools" aria-labelledby={toolsId}>
          <h2 id={toolsId} className="visually-hidden">
            {t('trip.toolsTitle')}
          </h2>
          <Button variant="secondary">{t('trip.regenerateAll')}</Button>
        </section>
      </div>
    </>
  );
}

// ── 3. 하루 일정 (components/trip/DayScreen.js) ──

/** 타임라인 한 줄의 편집 버튼. DayScreen 의 StopActions 와 같은 배치 */
function StopActions({ stop, slot }) {
  const { t } = useLang();
  return (
    <div className="trip-stop-actions">
      <button type="button" className="btn btn-secondary btn-small">
        {t('trip.actionSwap')}
      </button>
      <button type="button" className="btn btn-secondary btn-small">
        {stop.isMeal && slot ? t('trip.actionClearMeal') : t('trip.actionDelete')}
      </button>
    </div>
  );
}

/** timelineEntries(표시 모델) → DayTimeline 항목. DayScreen 의 toTimeline 과 같은 규칙 */
function useTimeline(day, stay, role) {
  const { t } = useLang();
  const card = (entry) => (
    <CourseCard stop={entry.stop} headingLevel={3}>
      <StopActions stop={entry.stop} slot={entry.slot} />
    </CourseCard>
  );
  return timelineEntries(day, { role, stay })
    .map((entry) => {
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
          return { id: entry.id, kind: 'stop', time: entry.time, endTime: entry.endTime, leg: entry.leg, content: card(entry) };
        case 'meal':
          return {
            id: entry.id,
            kind: 'meal',
            time: entry.time,
            endTime: entry.endTime,
            leg: entry.stop ? entry.leg : undefined,
            content: (
              <MealSlot slot={entry.slot ?? 'LUNCH'} status={entry.status} reasons={entry.reasons}>
                {entry.stop ? card(entry) : null}
              </MealSlot>
            ),
          };
        default:
          return null;
      }
    })
    .filter(Boolean);
}

/** 하루 소개. components/trip/IntroArea.js 의 정해진 문장 가지(IntroArea 는 저장소를 읽고 서버에 요청하므로 부르지 않는다) */
function IntroBlock({ day, stay }) {
  const { t, lang } = useLang();
  const labelId = useId();
  const request = introRequestFor(day, stay, lang);
  if (!request) return null;
  const titles = request.stops.map((s) => s.title);
  const name = titles.length === 1 ? 'one' : titles.length === 2 ? 'two' : 'many';
  const vars = { place1: titles[0], place2: titles[1], count: String(titles.length) };
  const text = INTRO_TEMPLATES[name][lang].replace(/\{(place1|place2|count)\}/g, (_, key) => vars[key]);
  return (
    <div className="ui-block trip-intro-block">
      <section className="trip-intro" aria-labelledby={labelId}>
        <p className="trip-intro-head" id={labelId}>
          <Icon name="quote" size={18} />
          <span>{t('trip.introTemplateLabel')}</span>
        </p>
        <p className="trip-intro-text">{text}</p>
      </section>
    </div>
  );
}

function DayDetailScreen({ demo }) {
  const { t, locale, lang, safety } = useLang();
  const day = demo.detail;
  const stay = demo.stay;
  const delta = deltaSummary(day);
  const guardian = guardianTabInfo(day, stay);
  const entries = useTimeline(day, stay, 'P');
  const strip = Object.keys(demo.tripPlan.days).sort();
  const safetyLang = safety.primary === lang ? undefined : safety.primary;
  return (
    <>
      <TopBar title={formatDate(DEMO_DETAIL_DATE, locale)} backHref="/trip" backLabel={t('trip.backToTrip')} />
      <div className="page trip-page trip-day is-basement designBoard-phone-page">
        <div className="ui-block trip-strip">
          <ul className="ui-date-strip" role="list">
            {strip.map((d) => (
              <li key={d}>
                <DateChip
                  date={d}
                  state={demo.tripPlan.days[d]?.dayState}
                  isToday={d === DEMO_TODAY}
                  selected={d === DEMO_DETAIL_DATE}
                  hasAppointment={(demo.tripPlan.days[d]?.blocks ?? []).some((b) => b?.kind === 'APPOINTMENT')}
                  href={`/trip/${d}`}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="ui-block trip-status-block">
          <StateBanner state={day.dayState} reasons={day.reasons ?? []} />
          {delta?.unseen && (
            <button type="button" className="trip-changed">
              <span className="trip-changed-dot" aria-hidden="true" />
              <span className="trip-changed-text">{t('trip.changedCta')}</span>
              <Icon name="chevronRight" size={18} />
            </button>
          )}
        </div>

        <div className="ui-block trip-timeline-block">
          <div className="tabs" role="tablist" aria-label={t('trip.tabsLabel')}>
            <button type="button" role="tab" aria-selected="true">
              {t('trip.tabPatient')}
            </button>
            <button type="button" role="tab" aria-selected="false">
              {t('trip.tabGuardian')}
              {guardian.locked && (
                <span className="trip-tab-lock">
                  <Icon name="lock" size={16} />
                  <span className="visually-hidden">{t('trip.lockedLabel')}</span>
                </span>
              )}
            </button>
          </div>
          <section className="trip-panel">
            <h2 className="trip-panel-title">{t('trip.timelinePatient')}</h2>
            <DayTimeline label={t('trip.timelinePatient')} person="patient" entries={entries} />
          </section>
        </div>

        <IntroBlock day={day} stay={stay} />

        <div className="ui-block trip-tools-block">
          <section className="trip-tools">
            <h2 className="visually-hidden">{t('trip.toolsTitle')}</h2>
            <Button variant="secondary">{t('trip.regenerate')}</Button>
          </section>
          <AppliedConditions day={day} stay={stay} />
          <ExcludedList day={day} />
          <p className="trip-footer" lang={safetyLang}>
            {t('trip.footer')}
          </p>
        </div>
      </div>
    </>
  );
}

// ── 4. 조건 (app/conditions/page.js 의 동의한 뒤, 기간 목록을 보는 상태) ──

/** 동의 철회. components/conditions/ConsentWithdraw.js 의 마크업. 원본은 저장소를 읽으므로 부르지 않는다 */
function ConsentWithdrawBlock({ consent }) {
  const { t, locale } = useLang();
  const sensitive = consent?.sensitive;
  return (
    <section className="ui-block conditions-withdraw">
      <h2>{t('conditions.withdrawTitle')}</h2>
      <p>{t('conditions.consentGranted', { at: fmtDateTime(sensitive?.agreedAt, locale), version: sensitive?.version })}</p>
      <SafetyText k={'conditions.withdrawEffect'} className="conditions-callout" />
      <div className="conditions-actions">
        <Button variant="secondary">{t('conditions.withdrawAction')}</Button>
      </div>
    </section>
  );
}

function ConditionsScreen({ demo }) {
  const { t } = useLang();
  const stay = demo.stay;
  return (
    <>
      <TopBar title={t('conditions.header')} />
      <div className="page conditions-page is-basement designBoard-phone-page">
        <div className="ui-block">
          <p className="conditions-lead">{t('conditions.lead')}</p>
          <ConsentPanel consent={stay.consent} readOnly={false} />
        </div>

        <section className="ui-block conditions-section">
          <h2>{t('conditions.periodsTitle')}</h2>
          <p className="conditions-section-lead">{t('conditions.periodsLead')}</p>
          <ul className="conditions-period-list is-rows">
            {DEMO_PERIODS.map((period) => (
              <PeriodCard key={period.id} period={period} stay={stay} byDate={demo.byDate} nowMs={DEMO_NOW_MS} readOnly={false} />
            ))}
          </ul>
          <div className="conditions-actions">
            <Button icon="plus">{t('conditions.addPeriod')}</Button>
          </div>
        </section>

        <div className="ui-block">
          <ListGroup>
            <li>
              <ListItem title={t('conditions.linkHospital')} leading={<Icon name="hospital" size={22} />} trailing="chevron" href="/link" />
            </li>
          </ListGroup>
        </div>

        <DayConditions stay={stay} byDate={demo.byDate} error={false} nowMs={DEMO_NOW_MS} />

        <ConsentWithdrawBlock consent={stay.consent} />

        <div className="ui-block">
          <ListGroup>
            <li>
              <ListItem title={t('conditions.editStay')} trailing="chevron" href="/onboarding" />
            </li>
          </ListGroup>
        </div>
      </div>
    </>
  );
}

// ── 5. 장소 상세 (app/place/[candidateId]/page.js — 관광공사 상세를 부르기 전의 일정 속 정보) ──

const LEG_KEY = { WALK: 'common.legWalk', TAXI: 'common.legTaxi', TRANSIT: 'common.legTransit' };

function PlaceScreen({ demo }) {
  const { t, lang, locale, safety } = useLang();
  const stop = demo.todayStored.outings[0].stops.find((s) => s.isMeal);
  const flags = stopBadges(stop);
  const safetyLang = safety.primary === lang ? undefined : safety.primary;
  const leg = stop.legIn && LEG_KEY[stop.legIn.mode] ? t(LEG_KEY[stop.legIn.mode], { n: stop.legIn.min }) : null;
  return (
    <>
      <TopBar title={t('place.header')} backHref={`/trip/${DEMO_TODAY}`} backLabel={t('place.back')} />
      <div className="page place-page designBoard-phone-page">
        <CourseCard stop={stop} link={false} variant="feature" headingLevel={2} showTime={false} />
        <section className="place-block">
          <h2>{t('place.mapsTitle')}</h2>
          <MapLinks stop={stop} disabled disabledKey="today.gatedMaps" showNote />
        </section>
        <SourceArea source="estimate" title={t('place.planTitle')} note={t('place.estimateNote')}>
          <dl className="place-facts">
            <div>
              <dt>{t('place.visit')}</dt>
              <dd>
                {formatDate(DEMO_TODAY, locale)} · {stop.arriveAt}–{stop.leaveAt} · {t('trip.tabPatient')}
              </dd>
            </div>
            <div>
              <dt>{t('place.stay')}</dt>
              <dd>{t('trip.stayMin', { n: stop.stayMin })}</dd>
            </div>
            {leg && (
              <div>
                <dt>{t('place.leg')}</dt>
                <dd>
                  {leg} <Badge kind="estimate" />
                </dd>
              </div>
            )}
            <div>
              <dt>{t('place.walk')}</dt>
              <dd>
                {t('place.walkValue', { n: stop.walkBurdenMin })} <Badge kind="estimate" />
              </dd>
            </div>
            <div>
              <dt>{t('place.indoor')}</dt>
              <dd>{t(stop.indoor === true ? 'trip.indoor' : stop.indoor === false ? 'trip.outdoor' : 'trip.indoorUnknown')}</dd>
            </div>
          </dl>
          {flags.dietEstimated && <p className="place-note">{t('place.dietNote')}</p>}
        </SourceArea>
        {flags.orderCard && (
          <section className="place-block">
            <h2>{t('trip.orderCard')}</h2>
            <p>{t('place.orderCardBody')}</p>
            <Button href="/cards#cards-diet" variant="secondary">
              {t('place.orderCardCta')}
            </Button>
          </section>
        )}
        <SourceArea source="tourism" title={t('place.koTitle')} lang="ko">
          <p className="place-ko-name">{stop.ko.title}</p>
          <p>{stop.ko.address}</p>
        </SourceArea>
        <p className="trip-footer" lang={safetyLang}>
          {t('place.footer')}
        </p>
      </div>
    </>
  );
}

// ── 6. 한국어 카드 (components/cards/TodayCards.js) ──

const DIET_KEY = Object.freeze({
  spicy: 'cards.dietSpicy',
  alcohol: 'cards.dietAlcohol',
  hard: 'cards.dietHard',
  hot: 'cards.dietHot',
  raw: 'cards.dietRaw',
});

function CardsScreen({ demo }) {
  const { t, lang, locale } = useLang();
  const cards = demo.cards;
  const dietKeys = cards.diet.items.map((item) => DIET_KEY[item]);
  const move = cards.moves[0];
  const hospital = cards.hospitals[0];
  const sections = [
    ['cards-diet', t('cards.dietTitle')],
    ['cards-move', t('cards.moveTitle')],
    ['cards-return', t('cards.returnTitle')],
    ['cards-hospital', t('cards.hospitalTitle')],
  ];
  return (
    <>
      <TopBar title={t('cards.header')} backHref="/more" />
      <div className="page cards-page designBoard-phone-page">
        <p className="cards-intro">{t('cards.intro')}</p>
        <p className="cards-date">{t('cards.todayLabel', { date: formatDate(DEMO_TODAY, locale) })}</p>
        <div className="cards-jump">
          <ul role="list">
            {sections.map(([id, label]) => (
              <li key={id}>
                <a href={`/cards#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </div>
        <section className="cards-section">
          <h2 className="cards-section-title">{t('cards.dietTitle')}</h2>
          <KoreanCard title={t('cards.dietTitle')} korean={dietKeys.map((key) => translate(key, 'ko'))}>
            {lang !== 'ko' && (
              <div className="cards-explain">
                <p className="cards-explain-title">{t('cards.explainTitle')}</p>
                <ul role="list">
                  {dietKeys.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              </div>
            )}
          </KoreanCard>
        </section>
        <section className="cards-section">
          <h2 className="cards-section-title">{t('cards.moveTitle')}</h2>
          <div className="cards-pending" role="note">
            <Icon name="stateStandby" size={22} />
            <div>
              <PairText k="cards.dailyCheckPending" />
            </div>
          </div>
          {move && (
            <KoreanCard
              title={t('cards.moveArrive', { time: move.arriveAt })}
              korean={[translate('cards.moveKo', 'ko'), move.koTitle, move.koAddress].filter(Boolean)}
              explanation={lang === 'ko' ? undefined : t('cards.moveKo')}
            />
          )}
        </section>
        <section className="cards-section">
          <h2 className="cards-section-title">{t('cards.returnTitle')}</h2>
          <KoreanCard
            title={t('cards.returnTitle')}
            korean={[translate('cards.returnKo', 'ko'), cards.returnCard?.name, cards.returnCard?.address].filter(Boolean)}
            explanation={lang === 'ko' ? undefined : t('cards.returnKo')}
          />
        </section>
        {hospital && (
          <section className="cards-section">
            <h2 className="cards-section-title">{t('cards.hospitalTitle')}</h2>
            <KoreanCard
              title={`${t('cards.hospitalTitle')} · ${t('cards.hospitalToday')}`}
              korean={[translate('cards.hospitalKo', 'ko'), hospital.name, hospital.address].filter(Boolean)}
              explanation={lang === 'ko' ? undefined : t('cards.hospitalKo')}
            />
          </section>
        )}
      </div>
    </>
  );
}

// ── 7. 긴급 연락 (app/emergency/page.js) ──

const LINE_DESC = Object.freeze({ 119: 'emergency.desc119', 1330: 'emergency.desc1330' });

function EmergencyScreen({ demo }) {
  const { t } = useLang();
  const contacts = hospitalContacts(demo.stay);
  return (
    <>
      <TopBar title={t('emergency.header')} />
      <div className="page emergency-page designBoard-phone-page">
        <div className="emergency-lead" role="note">
          <PairText k="emergency.lead" />
        </div>
        <ul className="emergency-lines" role="list">
          {EMERGENCY_LINES.map((line) => (
            <li key={line.id} className="emergency-line">
              <a className={line.id === '119' ? 'emergency-call is-urgent' : 'emergency-call'} href={line.href}>
                <span className="emergency-call-icon">
                  <Icon name="phone" size={22} strokeWidth={2.4} />
                </span>
                <span className="emergency-call-text">
                  <strong>{t('emergency.callNumber', { number: line.number })}</strong>
                  <span>{t(LINE_DESC[line.id])}</span>
                </span>
              </a>
              {line.intl && (
                <p className="emergency-intl">
                  <span>{t('emergency.intlLabel')}</span>
                  <a className="emergency-intl-link" href={line.intl.href}>
                    {t('emergency.callNumber', { number: line.intl.number })}
                  </a>
                </p>
              )}
            </li>
          ))}
        </ul>
        <section className="emergency-section">
          <h2>{t('emergency.hospitalsTitle')}</h2>
          <ul className="emergency-hospitals" role="list">
            {contacts.map((contact) => (
              <li key={contact.hospitalId} className="emergency-hospital">
                <p className="emergency-hospital-name">{contact.name}</p>
                {contact.href ? (
                  <a className="emergency-call is-secondary" href={contact.href}>
                    <span className="emergency-call-icon">
                      <Icon name="phone" size={20} />
                    </span>
                    <span className="emergency-call-text">
                      <strong>{t('emergency.callNumber', { number: contact.phone })}</strong>
                    </span>
                  </a>
                ) : (
                  <p className="emergency-no-phone">{t('emergency.hospitalNoPhone')}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

// ── 8. 보호자 열기 (components/guardian/GuardianOpen.js — 새 링크의 PIN 입력 + 이미 가져온 사본) ──

function GuardianScreen({ demo }) {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t('guardian.openTitle')} />
      <div className="page guardian-page designBoard-phone-page">
        <p className="guardian-lead">{t('guardian.openLead')}</p>
        <section className="card guardian-pin-card">
          <h2>{t('guardian.pinEntryTitle')}</h2>
          <div className="field">
            <label htmlFor="designBoard-demo-pin">{t('guardian.pinEntryLabel')}</label>
            <input
              id="designBoard-demo-pin"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              className="guardian-pin"
              value=""
              readOnly
            />
          </div>
          <Button>{t('guardian.unlockButton')}</Button>
        </section>
        <GuardianCopyView snapshot={demo.guardianSnapshot} />
      </div>
    </>
  );
}

// ── 보드 절 ──

export default function ScreenPreviews() {
  const { t, lang } = useLang();
  // 언어가 바뀌면 장소 이름(관광공사 원문 자리)만 그 언어로 다시 채운다 — 시각·상태·장소는 그대로다
  const demo = useMemo(() => buildDemoTrip(lang), [lang]);

  return (
    <div className="designBoard-screens">
      <Phone name={t('designBoard.screenToday')} route="/today" note={t('designBoard.screenTodayNote')} nav="/today">
        <TodayScreen demo={demo} />
      </Phone>
      <Phone name={t('designBoard.screenTrip')} route="/trip" note={t('designBoard.screenTripNote')} nav="/trip">
        <TripScreen demo={demo} />
      </Phone>
      <Phone name={t('designBoard.screenDay')} route={`/trip/${DEMO_DETAIL_DATE}`} note={t('designBoard.screenDayNote')} nav="/trip">
        <DayDetailScreen demo={demo} />
      </Phone>
      <Phone name={t('designBoard.screenConditions')} route="/conditions" note={t('designBoard.screenConditionsNote')} nav="/conditions">
        <ConditionsScreen demo={demo} />
      </Phone>
      <Phone name={t('designBoard.screenPlace')} route="/place/[candidateId]" note={t('designBoard.screenPlaceNote')} nav="/place">
        <PlaceScreen demo={demo} />
      </Phone>
      <Phone name={t('designBoard.screenCards')} route="/cards" note={t('designBoard.screenCardsNote')} nav="/cards">
        <CardsScreen demo={demo} />
      </Phone>
      <Phone
        name={t('designBoard.screenEmergency')}
        route="/emergency"
        note={t('designBoard.screenEmergencyNote')}
        nav="/emergency"
      >
        <EmergencyScreen demo={demo} />
      </Phone>
      <Phone name={t('designBoard.screenGuardian')} route="/g" note={t('designBoard.screenGuardianNote')}>
        <GuardianScreen demo={demo} />
      </Phone>
    </div>
  );
}
