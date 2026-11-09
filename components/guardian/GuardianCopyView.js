'use client';

// 보호자 사본 보기 (AX-320 · docs/business-rules.md '보호자', docs/platform/IA_AND_FLOWS.md '보호자'·'보기 전용 상태')
//
// 가져온 스냅샷(허용 목록 필드만)을 그린다. 로그인 만료·오프라인에서도 그린다(보기 전용 안전 정보).
//   - 맨 위: '○월 ○일 ○시 기준'(만든 시각, 한국 시각) + 담긴 날짜 범위(days[].date 처음·끝) + 자동으로 바뀌지 않는다는 고지 + 만료 시각
//   - 사본은 만든 날부터 7일만 담는다. 출국일이 범위 뒤면 그 뒤 일정은 새 링크로 받으라고 알리고,
//     범위가 다 지났으면(만료 전) 지난 범위와 새 링크 안내를 주의 안내로 띄운다. 빈 화면을 설명 없이 두지 않는다
//   - 긴급 연락 119·1330 (스냅샷의 번호 그대로 전화 걸기 링크). 회색 채움 버튼이고 119 아이콘만 긴급 빨강이다(하단 긴급 바가 이미 빨강 채움이라 그렇게 한다)
//   - 머리 바로 아래 '오늘 환자 복귀 마감' 카드 하나(사용성 점검 D3): 오늘 마감 가운데 아직 지나지 않은 가장 가까운 것,
//     모두 지났으면 가장 늦게 지난 것과 장소. 아래 줄에 이미 있는 값을 다시 보여 줄 뿐이고, 누르면 오늘 날짜로 내려간다.
//     오늘이 사본 날짜 밖(입국 전, 범위 지남)이면 카드를 두지 않는다
//   - 날짜별: 동행 필요 안내, 환자 복귀 마감·장소(병원이면 '병원' 라벨만), 보호자 일정(타임라인).
//     같은 시각·같은 장소 마감은 한 줄로 합친다. 오늘을 맨 앞에 펼쳐 두고 다른 날짜는 접는다(<details>).
//     오늘이 사본 날짜 밖이면 모든 날짜를 펼친다(전부 접힌 화면을 두지 않는다)
// 스냅샷에 없는 것(병원 이름·주소, 조건 세부, 마감 이유)은 그릴 수도 없다.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider.js';
import { DayTimeline, Icon } from '@/components/ui/index.js';
import { EMERGENCY_NUMBERS, HOSPITAL_RETURN_LABEL, guardianCoverage } from '@/src/guardian/index.js';
import { parseInstantMs } from '@/src/stay/index.js';
import { dateLabel, kstClock, kstDate } from './errorView.js';
import { patientReturnStatus } from './returnStatus.js';
import { dedupePatientReturns, orderDaysForView, todayReturnSummary } from './copyView.js';
import { WarningNote } from './Feedback.js';
import SafetyNote from './SafetyNote.js';

const TICK_MS = 60 * 1000;

const CALL_KEY = { 119: 'guardian.call119', 1330: 'guardian.call1330' };

/** ISO 시각 → { date, time } (한국 시각). 읽을 수 없으면 null */
export function kstStamp(iso, locale) {
  const ms = typeof iso === 'string' ? parseInstantMs(iso) : null;
  if (ms === null) return null;
  return { date: dateLabel(kstDate(ms), locale), time: kstClock(ms) };
}

function returnPlaceLabel(place, t) {
  return place === 'HOSPITAL' ? t('guardian.placeHospital') : t('guardian.placeLodging');
}

function outingEntries(outing, t) {
  const entries = [];
  if (outing.departAt) {
    entries.push({ id: `${outing.id}:d`, kind: 'depart', time: outing.departAt, title: t('guardian.placeLodging') });
  }
  outing.stops.forEach((stop, index) => {
    entries.push({
      id: `${outing.id}:s${index}`,
      kind: 'stop',
      time: stop.arriveAt,
      endTime: stop.leaveAt,
      title: stop.title ?? stop.ko?.title ?? '',
      note: stop.address ?? stop.ko?.address ?? undefined,
    });
  });
  if (outing.returnBy) {
    entries.push({ id: `${outing.id}:r`, kind: 'return', time: outing.returnBy, title: returnPlaceLabel(outing.returnPlace, t) });
  }
  return entries;
}

/** 지금 시각(ms). 1분마다 갱신해 화면을 연 채로도 마감이 지나면 바뀐다 */
function useNowMs() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return nowMs;
}

function ReturnTag({ status }) {
  const { t } = useLang();
  if (status === 'PASSED') {
    return (
      <span className="guardian-tag is-passed">
        <Icon name="alert" size={16} strokeWidth={2.4} />
        {t('guardian.overdueTag')}
      </span>
    );
  }
  if (status === 'UPCOMING') return <span className="guardian-tag is-upcoming">{t('guardian.upcomingTag')}</span>;
  return null;
}

/** 복귀 장소 표시: 병원이면 '병원' 라벨만, 숙소면 이름(없으면 '숙소')과 주소 */
function returnPlaceView(entry, t) {
  const hospital = entry.placeName === HOSPITAL_RETURN_LABEL;
  return { hospital, name: hospital ? t('guardian.placeHospital') : entry.placeName ?? t('guardian.placeLodging') };
}

function ReturnPlace({ entry }) {
  const { t } = useLang();
  const { hospital, name } = returnPlaceView(entry, t);
  return (
    <span className="guardian-return-place">
      <span className="guardian-return-icon" aria-hidden="true">
        <Icon name={hospital ? 'hospital' : 'bed'} size={18} />
      </span>
      <span>
        <strong>{name}</strong>
        {!hospital && entry.placeAddress && <span className="guardian-return-address">{entry.placeAddress}</span>}
      </span>
    </span>
  );
}

/** 맨 위 '오늘 환자 복귀 마감' 카드. 누르면 오늘 날짜 제목으로 내려간다 */
function TodayReturnCard({ summary }) {
  const { t } = useLang();
  const targetId = `guardian-day-${summary.date}`;
  // 오늘 일정 제목으로 옮겨 가고 초점을 거기 둔다. 주소 해시는 남기지 않는다: /g 는 주소 해시를 보호자 링크 암호문으로
  // 읽으므로(hooks.js useIncomingLink) '#guardian-day-…'가 남으면 '링크가 올바르지 않아요'가 뜬다(2026-11-10 리뷰 I1).
  function jump(event) {
    event.preventDefault();
    const heading = document.getElementById(targetId);
    if (!heading) return;
    heading.scrollIntoView({ block: 'start' });
    heading.focus();
  }
  return (
    <a className="guardian-today" href={`#${targetId}`} onClick={jump}>
      <h3 className="guardian-today-title">{t('guardian.todayReturnTitle')}</h3>
      {summary.none ? (
        <span className="guardian-today-none">{t('guardian.noPatientOutings')}</span>
      ) : (
        <>
          <span className="guardian-today-time">
            <Icon name="flag" size={20} strokeWidth={2.4} />
            <time>{t('guardian.returnBy', { time: summary.by })}</time>
            <ReturnTag status={summary.status} />
          </span>
          <ReturnPlace entry={summary} />
          {summary.total > 1 && <span className="guardian-today-more">{t('guardian.todayReturnMore', { count: summary.total })}</span>}
        </>
      )}
    </a>
  );
}

function PatientReturns({ day, nowMs }) {
  const { t } = useLang();
  const entries = dedupePatientReturns(day.patientReturn);
  if (entries.length === 0) return <p className="guardian-meta">{t('guardian.noPatientOutings')}</p>;
  return (
    <ul className="guardian-returns">
      {entries.map((entry, index) => {
        const status = patientReturnStatus({ date: day.date, by: entry.by, nowMs });
        return (
          <li key={`${entry.by}-${index}`} className="guardian-return">
            <span className="guardian-return-time">
              <Icon name="flag" size={16} strokeWidth={2.4} />
              <time>{t('guardian.returnBy', { time: entry.by })}</time>
              <ReturnTag status={status} />
            </span>
            <ReturnPlace entry={entry} />
            {status === 'PASSED' && (
              <>
                <p className="guardian-overdue-help">{t('guardian.overdueHelp')}</p>
                <span className="guardian-overdue-actions">
                  <a className="btn btn-critical" href="tel:119">
                    <Icon name="phone" size={20} />
                    <span>{t('guardian.call119')}</span>
                  </a>
                  <Link className="btn btn-secondary" href="/emergency">
                    {t('common.emergency')}
                  </Link>
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 날짜 하나. folded 면 <details> 안에 넣어 제목(요약)만 보인다. 펼치면 같은 내용이다 */
function GuardianDay({ day, nowMs, folded = false }) {
  const { t, locale } = useLang();
  const label = dateLabel(day.date, locale);
  const headingId = `guardian-day-${day.date}`;
  let guardianPart;
  if (!day.guardianSoloAllowed) guardianPart = <p className="guardian-meta">{t('guardian.soloNotAllowed')}</p>;
  else if (day.guardianOutings.length === 0) guardianPart = <p className="guardian-meta">{t('guardian.noGuardianOutings')}</p>;
  else {
    guardianPart = day.guardianOutings.map((outing) => (
      <DayTimeline
        key={outing.id}
        person="guardian"
        label={t('guardian.timelineLabel', { date: label })}
        entries={outingEntries(outing, t)}
      />
    ));
  }
  const title = (
    <h3 id={headingId} className="guardian-day-title" tabIndex={-1}>
      {label}
    </h3>
  );
  const body = (
    <>
      {day.escortRequired && <SafetyNote messageKey={'guardian.escortRequired'} both icon="walk" className="guardian-escort" />}
      <h4 className="guardian-subtitle">{t('guardian.patientReturnTitle')}</h4>
      <PatientReturns day={day} nowMs={nowMs} />
      <h4 className="guardian-subtitle">{t('guardian.guardianPlanTitle')}</h4>
      {guardianPart}
    </>
  );
  if (!folded) {
    return (
      <article className="guardian-day" aria-labelledby={headingId}>
        {title}
        {body}
      </article>
    );
  }
  return (
    <article className="guardian-day is-folded" aria-labelledby={headingId}>
      <details className="guardian-day-fold">
        <summary className="guardian-day-summary">
          {title}
          <span className="guardian-day-chevron" aria-hidden="true">
            <Icon name="chevronDown" size={20} />
          </span>
        </summary>
        <div className="guardian-day-body">{body}</div>
      </details>
    </article>
  );
}

/** 오늘을 맨 앞에, 나머지는 날짜 순서 그대로. 오늘이 없으면 원래 순서 */

/**
 * @param {object} props
 * @param {import('@/src/guardian/snapshot.js').GuardianSnapshot} props.snapshot
 * @param {React.Ref} [props.headingRef]
 * @param {React.ReactNode} [props.notice]  저장 실패 같은 안내
 * @param {React.ReactNode} [props.alerts]  복귀 마감 알림 스위치 자리. 부품은 저장소를 읽지 않으므로
 *   실제 화면은 AlertsToggle, 디자인 보드는 고정 상태의 AlertsToggleView 를 넘긴다
 * @param {number} [props.fixedNowMs]  디자인 보드처럼 '지금'을 고정해 그릴 때만 넘긴다. 없으면 기기 시계(1분마다 갱신)
 */
export default function GuardianCopyView({ snapshot, headingRef, notice, alerts, fixedNowMs }) {
  const { t, locale } = useLang();
  const asOf = kstStamp(snapshot.createdAt, locale);
  const expires = kstStamp(snapshot.expiresAt, locale);
  // 번호는 스냅샷 내용과 무관하게 늘 119·1330 이다(docs/business-rules.md '보호자', 긴급 번호)
  const numbers = EMERGENCY_NUMBERS;
  const tickMs = useNowMs();
  const nowMs = typeof fixedNowMs === 'number' ? fixedNowMs : tickMs;
  const range = guardianCoverage(snapshot);
  const coverage = range && { from: dateLabel(range.from, locale), to: dateLabel(range.to, locale) };
  const passed = range !== null && kstDate(nowMs) > range.to;
  const summary = todayReturnSummary(snapshot, nowMs);
  const { todayDay, days } = orderDaysForView(snapshot.days, kstDate(nowMs));

  return (
    <section className="guardian-copy" aria-labelledby="guardian-copy-title">
      <header className="guardian-asof">
        <h2 id="guardian-copy-title" ref={headingRef} tabIndex={-1}>
          {t('guardian.copyTitle')}
        </h2>
        {asOf && <p className="guardian-asof-time">{t('guardian.asOf', asOf)}</p>}
        {coverage && <p className="guardian-meta guardian-coverage-range">{t('guardian.coverage', coverage)}</p>}
        {passed && <WarningNote>{t('guardian.coveragePassed', coverage)}</WarningNote>}
        {!passed && range?.more && <p className="guardian-meta">{t('guardian.coverageMore', coverage)}</p>}
        <SafetyNote messageKey={'guardian.notAutoUpdated'} icon="info" role={null} />
        {expires && <p className="guardian-meta">{t('guardian.expiresAt', expires)}</p>}
        <p className="guardian-meta">{t('guardian.timesKst')}</p>
        {notice}
      </header>

      {summary && <TodayReturnCard summary={summary} />}

      {alerts}

      <section className="guardian-emergency" aria-labelledby="guardian-emergency-title">
        <h3 id="guardian-emergency-title">{t('guardian.emergencyTitle')}</h3>
        <ul className="guardian-calls">
          {numbers.map((number) => (
            <li key={number}>
              <a className={`btn btn-secondary guardian-call${number === '119' ? ' is-119' : ''}`} href={`tel:${number}`}>
                <Icon name="phone" size={20} />
                <span>{t(CALL_KEY[number] ?? 'guardian.call119')}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {days.map((day) => (
        <GuardianDay key={day.date} day={day} nowMs={nowMs} folded={todayDay !== null && day !== todayDay} />
      ))}
    </section>
  );
}
