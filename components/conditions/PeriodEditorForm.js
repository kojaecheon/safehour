'use client';

// 본인 체크 기간 편집기 (AX-315 · spec 4.4)
//
// 틀은 components/ui 의 PeriodEditor, 예/아니오/모르겠음은 AnswerInput 을 쓴다.
//   - spec 4.4 표의 항목을 모두 묻는다. 자유 서술 칸은 없다.
//   - 필수 항목(외출 허용·복귀 시각)에는 '모르겠음'이 없다. 외출 불가면 복귀 시각을 묻지 않는다.
//   - 복귀 장소가 병원이면 등록된 병원 중에서 고른다. 병원이 하나면 자동으로 고른다.
//   - 동행 필수=예 이면 '보호자가 곁을 지켜야 하나요?'는 '예'로 고정해 보여주고, 저장도 '예'로 한다.
//   - 복약 시각마다 '숙소에서 복용'(기본 예)을 고른다.
//   - 제한 없음 기간을 켜면 항목을 묻지 않는다.
// 저장은 validatePeriodForm(도메인 검증) → 부모의 onSave(기간). 오류는 항목마다 붙이고 맨 위에 모아 보여준다.
// 기기 저장이 실패하면 부모가 saveErrorKey 로 알려 준다. 그 문장은 저장 버튼 곁(하단 바 안 맨 앞)에 보인다(설계서 6.1,
// 체류 설정·보호자와 같은 자리).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { AnswerInput, Button, Icon, PeriodEditor } from '@/components/ui/index.js';
import { postProcedureBoundary } from '@/src/stay/stay.js';
import { VALIDATION_ISSUE } from '@/src/stay/errorCodes.js';
import ChoiceInput from './ChoiceInput.js';
import { ITEM_LABEL_KEY } from './values.js';
import {
  ANSWER,
  emptyMedicationRow,
  emptyPeriodForm,
  periodToForm,
  returnHospitalId,
  validatePeriodForm,
} from './periodFormModel.js';

/** 항목 → 질문 문구 키 (spec 4.4 표) */
const QUESTION_KEY = {
  outing: 'conditions.qOuting',
  returnTime: 'conditions.qReturnTime',
  walkLimit: 'conditions.qWalkLimit',
  travelLimit: 'conditions.qTravelLimit',
  avoidUv: 'conditions.qAvoidUv',
  avoidHeat: 'conditions.qAvoidHeat',
  avoidWater: 'conditions.qAvoidWater',
  escortRequired: 'conditions.qEscortRequired',
  guardianMustStay: 'conditions.qGuardianMustStay',
  mealRestriction: 'conditions.qMealRestriction',
  'diet.spicy': 'conditions.qDietSpicy',
  'diet.alcohol': 'conditions.qDietAlcohol',
  'diet.hard': 'conditions.qDietHard',
  'diet.hot': 'conditions.qDietHot',
  'diet.raw': 'conditions.qDietRaw',
  medication: 'conditions.qMedication',
};

const FIELD_LABEL_KEY = {
  ...ITEM_LABEL_KEY,
  startDate: 'common.periodStart',
  endDate: 'common.periodEnd',
  'returnTime.hospitalId': 'conditions.returnHospitalLabel',
  noRestriction: 'conditions.noRestrictionLabel',
};

/** 화면 순서 — 오류 요약도 이 순서로 보인다 */
const FIELD_ORDER = [
  'startDate',
  'endDate',
  'noRestriction',
  'outing',
  'returnTime',
  'returnTime.hospitalId',
  'walkLimit',
  'travelLimit',
  'avoidUv',
  'avoidHeat',
  'avoidWater',
  'escortRequired',
  'guardianMustStay',
  'mealRestriction',
  'diet.spicy',
  'diet.alcohol',
  'diet.hard',
  'diet.hot',
  'diet.raw',
  'medication',
];

const OUTING_OPTIONS = [
  { value: 'ALLOWED', key: 'conditions.outingALLOWED' },
  { value: 'INDOOR_ONLY', key: 'conditions.outingINDOOR_ONLY' },
  { value: 'FORBIDDEN', key: 'conditions.outingFORBIDDEN' },
];
const PLACE_OPTIONS = [
  { value: 'LODGING', key: 'conditions.placeLODGING' },
  { value: 'HOSPITAL', key: 'conditions.placeHOSPITAL' },
];
const MEAL_OPTIONS = [
  { value: 'ALL_DAY', key: 'conditions.mealALL_DAY' },
  { value: 'UNTIL', key: 'conditions.mealUNTIL' },
];

const GROUPS = [
  { key: 'conditions.groupExposure', items: ['avoidUv', 'avoidHeat', 'avoidWater'] },
];
const DATE_FIELDS = ['startDate', 'endDate'];
const DIET_ITEMS = ['diet.spicy', 'diet.alcohol', 'diet.hard', 'diet.hot', 'diet.raw'];

/** 검증 문제 → 문구 키 */
function errorKey(field, code) {
  switch (code) {
    case VALIDATION_ISSUE.REQUIRED:
      return field === 'startDate' || field === 'endDate' ? 'conditions.errDateRequired' : 'conditions.errRequired';
    case VALIDATION_ISSUE.UNKNOWN_NOT_ALLOWED:
      return 'conditions.errUnknownNotAllowed';
    case VALIDATION_ISSUE.OUT_OF_RANGE:
      return 'conditions.errRange';
    case VALIDATION_ISSUE.HOSPITAL_ID_REQUIRED:
      return 'conditions.errHospital';
    case VALIDATION_ISSUE.UNKNOWN_HOSPITAL:
      return 'conditions.errUnknownHospital';
    case VALIDATION_ISSUE.PERIOD_DATES_ORDER:
      return 'conditions.errDates';
    case VALIDATION_ISSUE.INVALID_VALUE:
      if (field === 'returnTime') return 'conditions.errTime';
      if (field === 'mealRestriction') return 'conditions.errMeal';
      if (field === 'medication') return 'conditions.errMedication';
      if (field === 'walkLimit' || field === 'travelLimit') return 'conditions.errRange';
      return 'conditions.errInvalid';
    default:
      return 'conditions.errInvalid';
  }
}

function initialForm(period, stay) {
  if (period) return periodToForm(period);
  const start = postProcedureBoundary(stay) ?? stay?.arrival?.date ?? '';
  return emptyPeriodForm({ startDate: start, endDate: start });
}

/**
 * @param {object} props
 * @param {object} props.stay
 * @param {object|null} props.period      고칠 SELF 기간(없으면 새 기간)
 * @param {string} props.periodId         저장할 id
 * @param {boolean} props.readOnly
 * @param {(period: object) => void} props.onSave
 * @param {() => void} props.onCancel
 * @param {string|null} [props.saveErrorKey]  기기 저장 실패 문구 키(없으면 null). 하단 바 안 맨 앞에 보인다
 */
export default function PeriodForm({ stay, period, periodId, readOnly, onSave, onCancel, saveErrorKey = null }) {
  const { t } = useLang();
  // 오류 요약의 #링크로도 쓰므로 URL 조각에 안전한 글자만 남긴다
  const base = `pf${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const [form, setForm] = useState(() => initialForm(period, stay));
  const [showErrors, setShowErrors] = useState(false);
  const summaryRef = useRef(null);
  const [focusSummary, setFocusSummary] = useState(0);
  const hospitals = useMemo(() => stay?.hospitals ?? [], [stay]);

  const validation = useMemo(
    () => validatePeriodForm(form, { id: periodId, hospitals }),
    [form, periodId, hospitals],
  );
  const errors = showErrors ? validation.errors : {};
  const errorFields = FIELD_ORDER.filter((field) => field in errors);

  useEffect(() => {
    if (focusSummary > 0) summaryRef.current?.focus();
  }, [focusSummary]);

  const fieldId = (field) => `${base}-f-${field.replace(/\./g, '-')}`;
  // 날짜 입력은 틀(PeriodEditor) 안에 있어 id 를 알 수 없다 — 요약 링크는 그 오류 문구로 간다
  const anchorId = (field) => (DATE_FIELDS.includes(field) ? errorId(field) : fieldId(field));
  const errorId = (field) => `${base}-e-${field.replace(/\./g, '-')}`;
  const describedBy = (field) => (errors[field] ? errorId(field) : undefined);

  function update(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }
  function updateNested(key, patch) {
    setForm((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function updateYesNo(key, value) {
    setForm((prev) => ({ ...prev, yesNo: { ...prev.yesNo, [key]: value } }));
  }
  function updateMedicationRow(index, patch) {
    setForm((prev) => ({
      ...prev,
      medication: {
        ...prev.medication,
        times: prev.medication.times.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      },
    }));
  }

  function submit(event) {
    event?.preventDefault?.();
    if (readOnly) return;
    if (!validation.ok) {
      setShowErrors(true);
      setFocusSummary((n) => n + 1);
      return;
    }
    onSave(validation.period);
  }

  function renderError(field) {
    if (!errors[field]) return null;
    return (
      <p className="ui-field-error conditions-field-error" id={errorId(field)} tabIndex={DATE_FIELDS.includes(field) ? -1 : undefined}>
        <Icon name="alert" size={20} />
        <span>{t(errorKey(field, errors[field]))}</span>
      </p>
    );
  }

  function renderYesNo({ field, hint, fixed = false }) {
    return (
      <div className="conditions-item" id={fieldId(field)} tabIndex={-1}>
        <AnswerInput
          legend={t(QUESTION_KEY[field])}
          hint={hint}
          value={fixed ? ANSWER.YES : form.yesNo[field]}
          onChange={(value) => updateYesNo(field, value)}
          disabled={readOnly || fixed}
          showMeaning={!fixed}
        />
        {renderError(field)}
      </div>
    );
  }

  function renderLimit({ field, hint }) {
    const value = form[field];
    const inputId = `${fieldId(field)}-minutes`;
    return (
      <div className="conditions-item" id={fieldId(field)} tabIndex={-1}>
        <AnswerInput
          legend={t(QUESTION_KEY[field])}
          hint={hint}
          value={value.answer}
          onChange={(answer) => updateNested(field, { answer })}
          disabled={readOnly}
        />
        {value.answer === ANSWER.YES && (
          <div className="conditions-subfield field">
            <label htmlFor={inputId}>{t('conditions.minutesLabel')}</label>
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={5}
              max={240}
              step={1}
              value={value.minutes}
              disabled={readOnly}
              aria-invalid={errors[field] ? 'true' : undefined}
              aria-describedby={describedBy(field)}
              onChange={(e) => updateNested(field, { minutes: e.target.value })}
            />
          </div>
        )}
        {renderError(field)}
      </div>
    );
  }

  const escortFixed = form.yesNo.escortRequired === ANSWER.YES;
  const autoHospital = hospitals.length === 1 ? hospitals[0] : null;
  const chosenHospitalId = returnHospitalId(form.returnTime, hospitals);

  return (
    <form className="conditions-form" onSubmit={submit} noValidate>
      {errorFields.length > 0 && (
        <div className="conditions-error-summary" role="alert" tabIndex={-1} ref={summaryRef}>
          <p className="conditions-error-summary-title">
            <Icon name="alert" size={20} />
            <span>{t('conditions.errorSummary')}</span>
          </p>
          <ul>
            {errorFields.map((field) => (
              <li key={field}>
                <a href={`#${anchorId(field)}`}>
                  {t(FIELD_LABEL_KEY[field] ?? 'conditions.errInvalid')}: {t(errorKey(field, errors[field]))}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PeriodEditor
        title={t('conditions.periodSelfTitle')}
        source="SELF"
        startDate={form.startDate}
        endDate={form.endDate}
        onStartChange={(startDate) => update({ startDate })}
        onEndChange={(endDate) => update({ endDate })}
        minDate={stay?.arrival?.date}
        maxDate={stay?.departure?.date}
        disabled={readOnly}
      >
        {renderError('startDate')}
        {renderError('endDate')}

        <p className="conditions-editor-lead">{t('conditions.editorLead')}</p>

        <label className="toggle-row conditions-toggle" id={fieldId('noRestriction')}>
          <span>
            <span className="label">{t('conditions.noRestrictionLabel')}</span>
            <span className="sub">{t('conditions.noRestrictionSub')}</span>
          </span>
          <input
            type="checkbox"
            checked={form.noRestriction}
            disabled={readOnly}
            onChange={(e) => update({ noRestriction: e.target.checked })}
          />
        </label>

        {!form.noRestriction && (
          <>
            <h4 className="conditions-group-title">{t('conditions.groupOuting')}</h4>
            <div className="conditions-item" id={fieldId('outing')} tabIndex={-1}>
              <ChoiceInput
                legend={t('conditions.qOuting')}
                value={form.outing}
                options={OUTING_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))}
                onChange={(outing) => update({ outing })}
                disabled={readOnly}
                describedBy={describedBy('outing')}
              />
              {renderError('outing')}
            </div>

            {form.outing !== 'FORBIDDEN' && (
              <div className="conditions-item" id={fieldId('returnTime')} tabIndex={-1}>
                <AnswerInput
                  legend={t('conditions.qReturnTime')}
                  value={form.returnTime.answer}
                  onChange={(answer) => updateNested('returnTime', { answer })}
                  disallowUnknown
                  showMeaning={false}
                  disabled={readOnly}
                />
                {form.returnTime.answer === ANSWER.NO && (
                  <p className="conditions-hint">{t('conditions.returnNotSetHint')}</p>
                )}
                {form.returnTime.answer === ANSWER.YES && (
                  <div className="conditions-subfield">
                    <div className="field">
                      <label htmlFor={`${fieldId('returnTime')}-time`}>{t('conditions.returnTimeLabel')}</label>
                      <input
                        id={`${fieldId('returnTime')}-time`}
                        type="time"
                        value={form.returnTime.time}
                        disabled={readOnly}
                        aria-invalid={errors.returnTime ? 'true' : undefined}
                        aria-describedby={describedBy('returnTime')}
                        onChange={(e) => updateNested('returnTime', { time: e.target.value })}
                      />
                    </div>
                    <ChoiceInput
                      legend={t('conditions.returnPlaceLegend')}
                      value={form.returnTime.place}
                      options={PLACE_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))}
                      onChange={(place) => updateNested('returnTime', { place })}
                      disabled={readOnly}
                    />
                    {form.returnTime.place === 'HOSPITAL' && (
                      <div id={fieldId('returnTime.hospitalId')} tabIndex={-1}>
                        {autoHospital ? (
                          <p className="conditions-auto-hospital">
                            <Icon name="hospital" size={18} />
                            <span>{t('conditions.returnHospitalAuto', { name: autoHospital.name })}</span>
                          </p>
                        ) : (
                          <div className="field">
                            <label htmlFor={`${fieldId('returnTime.hospitalId')}-select`}>
                              {t('conditions.returnHospitalLabel')}
                            </label>
                            <select
                              id={`${fieldId('returnTime.hospitalId')}-select`}
                              value={chosenHospitalId}
                              disabled={readOnly}
                              aria-invalid={errors['returnTime.hospitalId'] ? 'true' : undefined}
                              aria-describedby={describedBy('returnTime.hospitalId')}
                              onChange={(e) => updateNested('returnTime', { hospitalId: e.target.value })}
                            >
                              <option value="">{t('conditions.returnHospitalChoose')}</option>
                              {hospitals.map((h) => (
                                <option key={h.id} value={h.id}>
                                  {h.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {renderError('returnTime.hospitalId')}
                      </div>
                    )}
                  </div>
                )}
                {renderError('returnTime')}
              </div>
            )}

            <h4 className="conditions-group-title">{t('conditions.groupLimits')}</h4>
            {renderLimit({ field: 'walkLimit', hint: t('conditions.walkHint') })}
            {renderLimit({ field: 'travelLimit' })}

            {GROUPS.map((group) => (
              <div key={group.key}>
                <h4 className="conditions-group-title">{t(group.key)}</h4>
                {group.items.map((field) => (
                  <div key={field}>{renderYesNo({ field })}</div>
                ))}
              </div>
            ))}

            <h4 className="conditions-group-title">{t('conditions.groupGuardian')}</h4>
            {renderYesNo({ field: 'escortRequired' })}
            {renderYesNo({
              field: 'guardianMustStay',
              hint: escortFixed ? t('conditions.guardianFixedHint') : t('conditions.guardianHint'),
              fixed: escortFixed,
            })}

            <h4 className="conditions-group-title">{t('conditions.groupMeal')}</h4>
            <div className="conditions-item" id={fieldId('mealRestriction')} tabIndex={-1}>
              <AnswerInput
                legend={t('conditions.qMealRestriction')}
                value={form.mealRestriction.answer}
                onChange={(answer) => updateNested('mealRestriction', { answer })}
                disabled={readOnly}
              />
              {form.mealRestriction.answer === ANSWER.YES && (
                <div className="conditions-subfield">
                  <ChoiceInput
                    legend={t('conditions.mealModeLegend')}
                    value={form.mealRestriction.mode}
                    options={MEAL_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))}
                    onChange={(mode) => updateNested('mealRestriction', { mode })}
                    disabled={readOnly}
                  />
                  {form.mealRestriction.mode === 'UNTIL' && (
                    <div className="field">
                      <label htmlFor={`${fieldId('mealRestriction')}-until`}>{t('conditions.mealUntilLabel')}</label>
                      <input
                        id={`${fieldId('mealRestriction')}-until`}
                        type="time"
                        value={form.mealRestriction.until}
                        disabled={readOnly}
                        aria-invalid={errors.mealRestriction ? 'true' : undefined}
                        aria-describedby={describedBy('mealRestriction')}
                        onChange={(e) => updateNested('mealRestriction', { until: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )}
              {renderError('mealRestriction')}
            </div>
            {DIET_ITEMS.map((field) => (
              <div key={field}>{renderYesNo({ field })}</div>
            ))}

            <h4 className="conditions-group-title">{t('conditions.groupMedication')}</h4>
            <div className="conditions-item" id={fieldId('medication')} tabIndex={-1}>
              <AnswerInput
                legend={t('conditions.qMedication')}
                value={form.medication.answer}
                onChange={(answer) => updateNested('medication', { answer })}
                disabled={readOnly}
              />
              {form.medication.answer === ANSWER.YES && (
                <div className="conditions-subfield">
                  <ol className="conditions-med-list">
                    {form.medication.times.map((row, index) => {
                      const n = index + 1;
                      const timeId = `${fieldId('medication')}-t${index}`;
                      return (
                        <li key={index} className="conditions-med-row">
                          <div className="field">
                            <label htmlFor={timeId}>{t('conditions.medTimeLabel', { n })}</label>
                            <input
                              id={timeId}
                              type="time"
                              value={row.time}
                              disabled={readOnly}
                              aria-invalid={errors.medication && !row.time ? 'true' : undefined}
                              aria-describedby={describedBy('medication')}
                              onChange={(e) => updateMedicationRow(index, { time: e.target.value })}
                            />
                          </div>
                          <label className="toggle-row conditions-toggle">
                            <span>
                              <span className="label">{t('conditions.medAtLodging')}</span>
                              <span className="sub">{t('conditions.medAtLodgingSub')}</span>
                            </span>
                            <input
                              type="checkbox"
                              checked={row.atLodging !== false}
                              disabled={readOnly}
                              onChange={(e) => updateMedicationRow(index, { atLodging: e.target.checked })}
                            />
                          </label>
                          {form.medication.times.length > 1 && (
                            <Button
                              variant="secondary"
                              size="small"
                              disabled={readOnly}
                              onClick={() =>
                                updateNested('medication', {
                                  times: form.medication.times.filter((_, i) => i !== index),
                                })
                              }
                            >
                              {t('conditions.medRemove', { n })}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <Button
                    variant="secondary"
                    size="small"
                    icon="plus"
                    disabled={readOnly}
                    onClick={() =>
                      updateNested('medication', { times: [...form.medication.times, emptyMedicationRow()] })
                    }
                  >
                    {t('conditions.medAdd')}
                  </Button>
                </div>
              )}
              {renderError('medication')}
            </div>
          </>
        )}
      </PeriodEditor>

      {/* 하단 고정 바(설계서 6.1): 하단 내비 바로 위에 [취소 3][저장 7].
          저장하지 못한 이유는 버튼 곁에 보이도록 바 안 맨 앞에 둔다(체류 설정 .onboarding-save-error 와 같은 자리·모양) */}
      <div className="ui-bar-split conditions-editor-actions sticky-return is-flow">
        {saveErrorKey && (
          <p className="ui-field-error conditions-save-error" role="alert">
            <Icon name="alert" size={20} />
            <span>{t(saveErrorKey)}</span>
          </p>
        )}
        <Button variant="secondary" onClick={onCancel}>
          {t('conditions.cancel')}
        </Button>
        <Button type="submit" disabled={readOnly}>
          {t('conditions.save')}
        </Button>
      </div>
    </form>
  );
}
