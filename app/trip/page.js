'use client';

// /trip — 전체 일정: 입국부터 출국까지 날짜 목록 (AX-317 · spec 3.1 · 4.5 · 4.9)
//
// 화면 원칙
//   - 날짜마다 상태(색 + 아이콘 + 글자), 날짜 분류, 병원 일정 표시, 장소 수, '변경됨', 사유를 보인다.
//     상태는 오늘이면 매일 확인·병원 안내 대기를 덧씌운 표시용 값이다(저장 일정은 그대로).
//   - 입력이 필요한 날짜(NEEDS_INPUT)는 사유에 맞는 고칠 곳으로 잇는다(숙소 → 체류 설정, 동의·조건 → 조건 화면).
//   - 일정은 기기 저장소의 확정 일정만 읽는다. 로그인 만료·오프라인에서도 보기 전용으로 보인다.
//   - SEED ③층(설계서 6.2 5번): 흰 바탕 한 장, 날짜마다 목록 행 [날짜 칩][날짜 · 상태 · 장소 수 · 사유][화살표].

import { useState } from 'react';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider.js';
import { Button, DateChip, EmptyState, Icon, TopBar } from '@/components/ui/index.js';
import CoverageTag from '@/components/conditions/CoverageTag.js';
import RegenerateSheet from '@/components/trip/RegenerateSheet.js';
import TripNotice from '@/components/trip/TripNotice.js';
import UpdateFailedNotice from '@/components/trip/UpdateFailedNotice.js';
import { formatDate, tripDateRows } from '@/components/trip/viewModel.js';
import useTrip from '@/lib/trip/useTrip.js';

export default function TripPage() {
  const { t, locale, lang, safety, reasonText } = useLang();
  const trip = useTrip();
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState(null);
  const today = trip.todayDate;
  const stay = trip.stay;
  const reasonLang = safety.primary === lang ? undefined : safety.primary;

  const days = {};
  for (const date of Object.keys(trip.tripPlan?.days ?? {})) days[date] = date === today ? trip.today.day : trip.tripPlan.days[date];
  const rows = today ? tripDateRows({ stay, days, today }) : [];
  // '오늘 이후 전체' 다시 만들기 — 보기 전용·일정 없음·매일 확인 전인 오늘이면 막는다 (spec 4.10)
  const regenerate = trip.readOnly
    ? { allowed: false, reasonKey: 'trip.editReadOnly' }
    : !trip.tripPlan
      ? { allowed: false, reasonKey: 'trip.editNoPlan' }
      : trip.dailyCheckPending
        ? { allowed: false, reasonKey: 'trip.editGated' }
        : { allowed: true, reasonKey: null };

  let body;
  if (!today) {
    body = (
      <p className="trip-loading" role="status">
        {t('trip.loading')}
      </p>
    );
  } else if (!stay) {
    body = (
      <EmptyState
        icon="navTrip"
        title={t('today.noStayTitle')}
        body={t('today.noStayBody')}
        action={<Button href="/onboarding">{t('today.noStayAction')}</Button>}
      />
    );
  } else if (!trip.tripPlan) {
    body = (
      <EmptyState
        icon="navTrip"
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
    );
  } else {
    body = (
      <>
        <p className="trip-lead">
          {t('trip.range', { start: formatDate(stay.arrival?.date, locale), end: formatDate(stay.departure?.date, locale) })}
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
                  {row.returnNow && <span className="trip-return-tag">{t('trip.returnNowTag')}</span>}
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
                {row.fix && (
                  <p className="trip-day-fix">
                    {trip.readOnly ? (
                      <span>{t(row.fix.key)}</span>
                    ) : (
                      <Link className="trip-inline-link" href={row.fix.href}>
                        {t(row.fix.key)}
                        <span className="visually-hidden"> — {formatDate(row.date, locale)}</span>
                      </Link>
                    )}
                  </p>
                )}
              </div>
              <span className="trip-day-chevron" aria-hidden="true">
                <Icon name="chevronRight" size={18} />
              </span>
              {/* 날짜 칩과 같은 곳으로 가는 마우스 누름 자리, CSS 로 행 전체로 늘린다. 키보드·스크린리더는 날짜 칩 링크 하나만 만난다.
                  눌렀을 때 줄어드는 정보 묶음 밖(행의 마지막 칸)에 둔다. 줄어드는 상자 안에 두면 늘린 영역이 그 상자 크기로 줄어든다 */}
              <Link className="trip-day-link" href={`/trip/${row.date}`} tabIndex={-1} aria-hidden="true" />
            </li>
          ))}
        </ol>

        <section className="trip-tools" aria-labelledby="trip-tools-h">
          <h2 id="trip-tools-h" className="visually-hidden">
            {t('trip.toolsTitle')}
          </h2>
          <TripNotice slot role="status">
            {notice ? t(notice) : ''}
          </TripNotice>
          <Button variant="secondary" disabled={!regenerate.allowed} onClick={() => setSheet(true)}>
            {t('trip.regenerateAll')}
          </Button>
          {!regenerate.allowed && regenerate.reasonKey && <p className="trip-map-note">{t(regenerate.reasonKey)}</p>}
        </section>
      </>
    );
  }

  return (
    <>
      <TopBar title={t('trip.header')} />
      <main className="page trip-page">
        {trip.updateFailed && <UpdateFailedNotice readOnly={trip.readOnly} onRetry={() => trip.retry()} />}
        {body}
      </main>
      {sheet && (
        <RegenerateSheet
          date={null}
          initialScope="FROM_TODAY"
          regenerate={(scope) => trip.regenerate(scope)}
          onDone={(key) => setNotice(key)}
          onClose={() => setSheet(false)}
        />
      )}
    </>
  );
}
