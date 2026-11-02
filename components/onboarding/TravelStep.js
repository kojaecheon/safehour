'use client';

// 1단계 — 입국·출국 날짜·시각·공항 (spec 4.1)
//
// 규칙 1(출국 < 입국, 45박 초과)은 validateStay() 가 판정하고, 이 화면은 그 결과를 출국 칸에 붙인다.

import { useLang } from '../LanguageProvider.js';
import { DEFAULTS } from '@/src/stay/defaults.js';
import { ChoiceGroup, SafetyNote, TextField } from './Fields.js';
import { nightsOf } from './draft.js';

const ENDPOINTS = [
  {
    which: 'arrival',
    title: 'onboarding.arrival',
    date: 'onboarding.arrivalDate',
    time: 'onboarding.arrivalTime',
    airport: 'onboarding.arrivalAirport',
  },
  {
    which: 'departure',
    title: 'onboarding.departure',
    date: 'onboarding.departureDate',
    time: 'onboarding.departureTime',
    airport: 'onboarding.departureAirport',
  },
];

const AIRPORT_LABEL = { ICN: 'onboarding.airportICN', GMP: 'onboarding.airportGMP' };
const DELETION_NOTICE = 'onboarding.deletionNotice';

export default function TravelStep({ draft, update, issues }) {
  const { t, minutesLabel } = useLang();
  const nights = nightsOf(draft);
  const airportOptions = Object.entries(AIRPORT_LABEL).map(([value, key]) => ({ value, label: t(key) }));

  const setEndpoint = (which, key, value) => update((d) => ({ ...d, [which]: { ...d[which], [key]: value } }));

  return (
    <>
      {ENDPOINTS.map((endpoint) => (
        <fieldset key={endpoint.which} className="onboarding-card onboarding-group">
          <legend className="onboarding-group-title">{t(endpoint.title)}</legend>
          <div className="onboarding-row">
            <TextField
              field={`${endpoint.which}.date`}
              issues={issues}
              type="date"
              label={t(endpoint.date)}
              value={draft[endpoint.which].date}
              onChange={(value) => setEndpoint(endpoint.which, 'date', value)}
            />
            <TextField
              field={`${endpoint.which}.time`}
              issues={issues}
              type="time"
              label={t(endpoint.time)}
              value={draft[endpoint.which].time}
              onChange={(value) => setEndpoint(endpoint.which, 'time', value)}
            />
          </div>
          <ChoiceGroup
            field={`${endpoint.which}.airport`}
            issues={issues}
            name={`ob-${endpoint.which}-airport`}
            legend={t(endpoint.airport)}
            value={draft[endpoint.which].airport}
            onChange={(value) => setEndpoint(endpoint.which, 'airport', value)}
            options={airportOptions}
          />
        </fieldset>
      ))}

      {nights !== null && <p className="onboarding-tally">{t('onboarding.nights', { n: nights })}</p>}

      <p className="onboarding-note">
        {t('onboarding.travelHint', {
          processing: minutesLabel(DEFAULTS.airport.arrivalProcessingMin),
          lead: minutesLabel(DEFAULTS.airport.departureArrivalLeadMin),
        })}
      </p>

      <SafetyNote noticeKey={DELETION_NOTICE} vars={{ days: DEFAULTS.stay.deleteAfterDepartureDays }} />
    </>
  );
}
