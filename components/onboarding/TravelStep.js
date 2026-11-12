'use client';

// 1단계: 입국·출국 날짜·시각·공항 (docs/business-rules.md '체류')
//
// 체류 거부 조건(출국 < 입국, 45박 초과, docs/business-rules.md '체류')은 validateStay() 가 판정하고, 이 화면은 그 결과를 출국 칸에 붙인다.
// 공항은 인천(ICN)이 미리 골라져 있다(바꿀 수 있다). 출발 시각은 선택이다: 비우면 출국일 가장 이른 시각을
// 기준으로 삼아 출국일에는 외출을 만들지 않는다(src/stay/defaults.js DEPARTURE_TIME_UNSET). 그 뜻을 칸 아래에 적는다.

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
    time: 'onboarding.departureTimeOptional',
    timeHint: 'onboarding.departureTimeHint',
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
              hint={endpoint.timeHint ? t(endpoint.timeHint) : undefined}
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
