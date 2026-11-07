'use client';

// 보호자 사본 보기 (AX-320 · spec 4.11, 4.18, 5.4)
//
// 가져온 스냅샷(허용 목록 필드만)을 그린다. 로그인 만료·오프라인에서도 그린다(보기 전용 안전 정보).
//   - 맨 위: '○월 ○일 ○시 기준'(만든 시각, 한국 시각) + 자동으로 바뀌지 않는다는 고지 + 만료 시각
//   - 긴급 연락 119·1330 (스냅샷의 번호 그대로 전화 걸기 링크). 회색 채움 버튼이고 119 아이콘만 긴급 빨강이다(하단 긴급 바가 이미 빨강 채움이라 그렇게 한다)
//   - 날짜별: 동행 필요 안내, 환자 복귀 마감·장소(병원이면 '병원' 라벨만), 보호자 일정(타임라인)
// 스냅샷에 없는 것(병원 이름·주소, 조건 세부, 마감 이유)은 그릴 수도 없다.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang } from '@/components/LanguageProvider.js';
import { usePrefs } from '@/components/cards/useDeviceData.js';
import { DayTimeline, Icon } from '@/components/ui/index.js';
import useStoreStatus, { shouldShowReadOnly } from '@/components/ui/useStoreStatus.js';
import { turnOnDeviceNotifications } from '@/lib/notify/permission.js';
import { getStore } from '@/lib/store/index.js';
import { EMERGENCY_NUMBERS, HOSPITAL_RETURN_LABEL } from '@/src/guardian/index.js';
import { parseInstantMs } from '@/src/stay/index.js';
import { dateLabel, kstClock, kstDate } from './errorView.js';
import { patientReturnStatus } from './returnStatus.js';
import SafetyNote from './SafetyNote.js';

const NOTIFY_MESSAGE = Object.freeze({
  on: 'settings.notifyOn',
  off: 'settings.notifyOff',
  unsupported: 'settings.notifyUnsupported',
  denied: 'settings.notifyDenied',
  failed: 'settings.saveFailed',
});
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

/** 복귀 마감 알림 스위치: 설정 화면의 알림 스위치와 같은 기기 설정(prefs.notifications) */
function AlertsToggle() {
  const { t } = useLang();
  const prefs = usePrefs();
  const status = useStoreStatus();
  const showReadOnly = shouldShowReadOnly(status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const on = prefs?.notifications === true;

  async function onChange(event) {
    if (status.readOnly || busy) return;
    const want = event.target.checked;
    setBusy(true);
    try {
      if (want) setMessage(await turnOnDeviceNotifications({ store: getStore() }));
      else setMessage(getStore().writePrefs({ notifications: false }).ok ? 'off' : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="guardian-alerts" aria-label={t('guardian.alertsToggle')}>
      <label className="toggle-row guardian-alerts-row">
        <span className="label">{t('guardian.alertsToggle')}</span>
        <input
          type="checkbox"
          role="switch"
          className="ui-switch"
          checked={on}
          aria-checked={on}
          disabled={status.readOnly || busy || prefs === null}
          onChange={onChange}
        />
      </label>
      <div className="ui-callout has-icon guardian-alerts-note" role="note">
        <span className="ui-callout-icon" aria-hidden="true">
          <Icon name="info" size={20} />
        </span>
        <p>{t('guardian.alertsNote')}</p>
      </div>
      <div role="status" className="guardian-alerts-status">
        {message && <p>{t(NOTIFY_MESSAGE[message])}</p>}
      </div>
      {showReadOnly && <p className="guardian-meta">{t('settings.readOnlyNote')}</p>}
    </section>
  );
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

function PatientReturns({ day, nowMs }) {
  const { t } = useLang();
  if (day.patientReturn.length === 0) return <p className="guardian-meta">{t('guardian.noPatientOutings')}</p>;
  return (
    <ul className="guardian-returns">
      {day.patientReturn.map((entry, index) => {
        const hospital = entry.placeName === HOSPITAL_RETURN_LABEL;
        const name = hospital ? t('guardian.placeHospital') : entry.placeName ?? t('guardian.placeLodging');
        const status = patientReturnStatus({ date: day.date, by: entry.by, nowMs });
        return (
          <li key={`${entry.by}-${index}`} className="guardian-return">
            <span className="guardian-return-time">
              <Icon name="flag" size={16} strokeWidth={2.4} />
              <time>{t('guardian.returnBy', { time: entry.by })}</time>
              <ReturnTag status={status} />
            </span>
            <span className="guardian-return-place">
              <span className="guardian-return-icon" aria-hidden="true">
                <Icon name={hospital ? 'hospital' : 'bed'} size={18} />
              </span>
              <span>
                <strong>{name}</strong>
                {!hospital && entry.placeAddress && <span className="guardian-return-address">{entry.placeAddress}</span>}
              </span>
            </span>
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

function GuardianDay({ day, nowMs }) {
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
  return (
    <article className="guardian-day" aria-labelledby={headingId}>
      <h3 id={headingId} className="guardian-day-title">
        {label}
      </h3>
      {day.escortRequired && <SafetyNote messageKey={'guardian.escortRequired'} both icon="walk" className="guardian-escort" />}
      <h4 className="guardian-subtitle">{t('guardian.patientReturnTitle')}</h4>
      <PatientReturns day={day} nowMs={nowMs} />
      <h4 className="guardian-subtitle">{t('guardian.guardianPlanTitle')}</h4>
      {guardianPart}
    </article>
  );
}

/**
 * @param {object} props
 * @param {import('@/src/guardian/snapshot.js').GuardianSnapshot} props.snapshot
 * @param {React.Ref} [props.headingRef]
 * @param {React.ReactNode} [props.notice]  저장 실패 같은 안내
 */
export default function GuardianCopyView({ snapshot, headingRef, notice }) {
  const { t, locale } = useLang();
  const asOf = kstStamp(snapshot.createdAt, locale);
  const expires = kstStamp(snapshot.expiresAt, locale);
  // 번호는 스냅샷 내용과 무관하게 늘 119·1330 이다(spec 4.11)
  const numbers = EMERGENCY_NUMBERS;
  const nowMs = useNowMs();

  return (
    <section className="guardian-copy" aria-labelledby="guardian-copy-title">
      <header className="guardian-asof">
        <h2 id="guardian-copy-title" ref={headingRef} tabIndex={-1}>
          {t('guardian.copyTitle')}
        </h2>
        {asOf && <p className="guardian-asof-time">{t('guardian.asOf', asOf)}</p>}
        <SafetyNote messageKey={'guardian.notAutoUpdated'} icon="info" role={null} />
        {expires && <p className="guardian-meta">{t('guardian.expiresAt', expires)}</p>}
        <p className="guardian-meta">{t('guardian.timesKst')}</p>
        {notice}
      </header>

      <AlertsToggle />

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

      {snapshot.days.map((day) => (
        <GuardianDay key={day.date} day={day} nowMs={nowMs} />
      ))}
    </section>
  );
}
