'use client';

// 3단계 — 병원과 병원 일정 (spec 4.3)
//
// - 병원: 이름(40자), 도로명주소 검색(사용자 검색어만 — 병원 목록·추천·순위 없음), 전화(선택).
// - 병원 일정: 병원, 유형(수술·시술 / 진료), 날짜, 시작, 종료(선택). 종료가 없으면 '예상 종료'를 보여준다
//   (PROCEDURE 240분, VISIT 90분 — DEFAULTS). 시술 종류·증상은 묻지 않는다.
// - 규칙 2: 수술·시술 일정이 하나도 없으면 저장할 수 없다(validateStay PROCEDURE_REQUIRED).
// - 병원 연동으로 받은 일정(source HOSPITAL)은 읽기만 한다.

import { useLang } from '../LanguageProvider.js';
import { Badge, Button, SourceTag } from '../ui/index.js';
import AddressSearch from './AddressSearch.js';
import { ChoiceGroup, FieldErrors, SafetyNote, SelectField, TextField, focusById } from './Fields.js';
import { NameField } from './LodgingStep.js';
import {
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  addAppointment,
  emptyHospital,
  estimatedEnd,
  fieldDomId,
  hospitalRemovalBlock,
  issuesFor,
  newId,
} from './draft.js';

const TYPE_OPTIONS = [
  { value: 'PROCEDURE', label: 'onboarding.typePROCEDURE', hint: 'onboarding.typePROCEDUREHint' },
  { value: 'VISIT', label: 'onboarding.typeVISIT', hint: 'onboarding.typeVISITHint' },
];

const TYPE_LABEL = { PROCEDURE: 'onboarding.typePROCEDURE', VISIT: 'onboarding.typeVISIT' };

const REMOVAL_BLOCK_KEY = {
  LINKED: 'onboarding.hospitalLinked',
  APPOINTMENTS: 'onboarding.hospitalHasAppointments',
  PERIODS: 'onboarding.hospitalUsedByPeriods',
};

const APPOINTMENT_NOTICE = 'onboarding.appointmentNotice';

function hospitalName(hospital, index, t) {
  return hospital.name.trim() || t('onboarding.hospitalItem', { n: index + 1 });
}

function AppointmentCard({ draft, appointment, index, issues, patch, onRemove, canRemove }) {
  const { t, minutesLabel } = useLang();
  const titleId = `ob-appointments-${index}-title`;
  const estimate = appointment.end === '' ? estimatedEnd(appointment.type, appointment.start) : null;
  const estimateId = `${fieldDomId(`appointments[${index}].end`)}-estimate`;
  return (
    <section className="onboarding-card" aria-labelledby={titleId} id={`ob-appointments-${index}`} tabIndex={-1}>
      <div className="onboarding-card-head">
        <h4 id={titleId}>{t('onboarding.appointmentItem', { n: index + 1 })}</h4>
        {canRemove && (
          <Button variant="quiet" size="small" onClick={onRemove}>
            {t('onboarding.removeAppointment', { n: index + 1 })}
          </Button>
        )}
      </div>
      <SelectField
        field={`appointments[${index}].hospitalId`}
        issues={issues}
        label={t('onboarding.appointmentHospital')}
        placeholder={t('onboarding.chooseHospital')}
        value={appointment.hospitalId}
        onChange={(value) => patch((a) => ({ ...a, hospitalId: value }))}
        options={draft.hospitals.map((h, i) => ({ value: h.id, label: hospitalName(h, i, t) }))}
      />
      <ChoiceGroup
        field={`appointments[${index}].type`}
        issues={issues}
        name={`ob-appointment-type-${appointment.id}`}
        legend={t('onboarding.appointmentType')}
        value={appointment.type}
        onChange={(value) => patch((a) => ({ ...a, type: value }))}
        options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label), hint: t(o.hint) }))}
      />
      <div className="onboarding-row">
        <TextField
          field={`appointments[${index}].date`}
          issues={issues}
          type="date"
          label={t('onboarding.appointmentDate')}
          value={appointment.date}
          min={draft.arrival.date || undefined}
          max={draft.departure.date || undefined}
          onChange={(value) => patch((a) => ({ ...a, date: value }))}
        />
        <TextField
          field={`appointments[${index}].start`}
          issues={issues}
          type="time"
          label={t('onboarding.appointmentStart')}
          value={appointment.start}
          onChange={(value) => patch((a) => ({ ...a, start: value }))}
        />
      </div>
      <TextField
        field={`appointments[${index}].end`}
        issues={issues}
        type="time"
        label={t('onboarding.appointmentEnd')}
        value={appointment.end}
        onChange={(value) => patch((a) => ({ ...a, end: value }))}
        afterId={estimate ? estimateId : undefined}
        after={
          estimate ? (
            <div className="onboarding-estimate" id={estimateId}>
              <p className="onboarding-estimate-head">
                <Badge kind="estimate" />
                <strong>{t('onboarding.estimatedEnd', { time: estimate.end })}</strong>
              </p>
              <p>{t('onboarding.estimatedEndNote', { duration: minutesLabel(estimate.durationMin) })}</p>
            </div>
          ) : null
        }
      />
    </section>
  );
}

/** 병원 연동으로 받은 일정 — 고치거나 지우지 않는다 */
function LockedAppointment({ draft, appointment, index }) {
  const { t } = useLang();
  const hospitalIndex = draft.hospitals.findIndex((h) => h.id === appointment.hospitalId);
  const hospital = draft.hospitals[hospitalIndex];
  const titleId = `ob-appointments-${index}-title`;
  return (
    <section className="onboarding-card is-locked" aria-labelledby={titleId} id={`ob-appointments-${index}`} tabIndex={-1}>
      <div className="onboarding-card-head">
        <h4 id={titleId}>{t('onboarding.appointmentItem', { n: index + 1 })}</h4>
        <SourceTag source="hospital" />
      </div>
      <p className="onboarding-locked-line">
        <strong>{appointment.type ? t(TYPE_LABEL[appointment.type]) : ''}</strong>
        {hospital ? ` · ${hospitalName(hospital, hospitalIndex, t)}` : ''}
      </p>
      <p className="onboarding-locked-line">
        <time dateTime={appointment.date}>{appointment.date}</time>{' '}
        <time>{appointment.start}</time>
        {appointment.end ? (
          <>
            {' – '}
            <time>{appointment.end}</time>
          </>
        ) : null}
      </p>
      <p className="onboarding-hint">{t('onboarding.appointmentFromHospital')}</p>
    </section>
  );
}

export default function HospitalStep({ draft, update, issues, periods }) {
  const { t } = useLang();
  const hospitalCount = draft.hospitals.length;
  const userAppointments = draft.appointments.filter((a) => a.source !== 'HOSPITAL').length;

  const patchHospital = (index, fn) =>
    update((d) => ({ ...d, hospitals: d.hospitals.map((h, i) => (i === index ? fn(h) : h)) }));
  const patchAppointment = (index, fn) =>
    update((d) => ({ ...d, appointments: d.appointments.map((a, i) => (i === index ? fn(a) : a)) }));

  function addHospital() {
    update((d) => ({ ...d, hospitals: [...d.hospitals, emptyHospital(newId('hospital'))] }));
    focusById(fieldDomId(`hospitals[${hospitalCount}].name`));
  }

  function removeHospital(index) {
    update((d) => ({ ...d, hospitals: d.hospitals.filter((_, i) => i !== index) }));
    focusById('ob-hospitals-add');
  }

  function addAppointmentItem() {
    const next = draft.appointments.length;
    update((d) => addAppointment(d, newId('appointment')));
    focusById(fieldDomId(`appointments[${next}].hospitalId`));
  }

  function removeAppointment(index) {
    update((d) => ({ ...d, appointments: d.appointments.filter((_, i) => i !== index) }));
    focusById('ob-appointments-add');
  }

  return (
    <>
      <SafetyNote noticeKey={APPOINTMENT_NOTICE} />

      <h3 className="onboarding-subhead">{t('onboarding.hospitalsTitle')}</h3>
      <div className="onboarding-list" id="ob-hospitals" tabIndex={-1}>
        <FieldErrors id="ob-hospitals-error" issues={issuesFor(issues, 'hospitals')} />
        {draft.hospitals.map((hospital, index) => {
          const titleId = `ob-hospitals-${index}-title`;
          const block = hospitalCount > 1 ? hospitalRemovalBlock(draft, periods, hospital.id) : null;
          const phoneField = `hospitals[${index}].phone`;
          return (
            <section key={hospital.id} className="onboarding-card" aria-labelledby={titleId}>
              <div className="onboarding-card-head">
                <h4 id={titleId}>{t('onboarding.hospitalItem', { n: index + 1 })}</h4>
                {hospitalCount > 1 && block === null && (
                  <Button variant="quiet" size="small" onClick={() => removeHospital(index)}>
                    {t('onboarding.removeHospital', { n: index + 1 })}
                  </Button>
                )}
                {hospital.linkedPlanId && <SourceTag source="hospital" />}
              </div>
              {block && <p className="onboarding-hint">{t(REMOVAL_BLOCK_KEY[block])}</p>}
              <NameField
                field={`hospitals[${index}].name`}
                issues={issues}
                label={t('onboarding.hospitalName')}
                value={hospital.name}
                onChange={(value) => patchHospital(index, (h) => ({ ...h, name: value }))}
              />
              <AddressSearch
                field={`hospitals[${index}].address`}
                issues={issues}
                kind="hospital"
                value={hospital.address}
                onSelect={(address) =>
                  patchHospital(index, (h) => ({
                    ...h,
                    address,
                    name: h.name.trim() === '' && address.buildingName ? address.buildingName.slice(0, NAME_MAX_LENGTH) : h.name,
                  }))
                }
              />
              <TextField
                field={phoneField}
                issues={issues}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={PHONE_MAX_LENGTH}
                label={t('onboarding.hospitalPhone')}
                hint={t('onboarding.hospitalPhoneHint')}
                value={hospital.phone}
                onChange={(value) => patchHospital(index, (h) => ({ ...h, phone: value }))}
              />
            </section>
          );
        })}
        <Button variant="secondary" icon="plus" id="ob-hospitals-add" onClick={addHospital}>
          {t('onboarding.addHospital')}
        </Button>
      </div>

      <h3 className="onboarding-subhead">{t('onboarding.appointmentsTitle')}</h3>
      <p className="onboarding-note">{t('onboarding.procedureRule')}</p>
      <div className="onboarding-list" id="ob-appointments" tabIndex={-1}>
        <FieldErrors id="ob-appointments-error" issues={issuesFor(issues, 'appointments')} />
        {draft.appointments.map((appointment, index) =>
          appointment.source === 'HOSPITAL' ? (
            <LockedAppointment key={appointment.id} draft={draft} appointment={appointment} index={index} />
          ) : (
            <AppointmentCard
              key={appointment.id}
              draft={draft}
              appointment={appointment}
              index={index}
              issues={issues}
              patch={(fn) => patchAppointment(index, fn)}
              canRemove={userAppointments > 1}
              onRemove={() => removeAppointment(index)}
            />
          ),
        )}
        <Button variant="secondary" icon="plus" id="ob-appointments-add" onClick={addAppointmentItem}>
          {t('onboarding.addAppointment')}
        </Button>
      </div>
    </>
  );
}
