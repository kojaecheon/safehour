'use client';

// 2단계: 숙소 구간 (docs/business-rules.md '숙소와 병원')
//
// - 구간마다 이름(선택, 40자), 도로명주소 검색 결과, 체크인·체크아웃 날짜.
//   이름을 비우면 저장하지 않고 화면은 '숙소'로 부른다(운영자 결정 2026-11-08). 주소·좌표는 그대로 필수다.
// - 숙소 구간 날짜 겹침(docs/business-rules.md '체류')은 validateStay() 가 판정하고, 겹친 두 구간의 체크인 칸에 붙인다.
// - 숙소가 없는 밤은 오류가 아니라 안내다 — 그 날짜는 일정을 만들지 않는다(LODGING_REQUIRED).

import { useLang } from '../LanguageProvider.js';
import { Button } from '../ui/index.js';
import AddressSearch from './AddressSearch.js';
import { FieldErrors, TextField, focusById } from './Fields.js';
import { NAME_MAX_LENGTH, addLodging, fieldDomId, issuesFor, newId, uncoveredNights } from './draft.js';

/** 'YYYY-MM-DD' → 짧은 날짜(선택 언어). 시간대에 흔들리지 않게 UTC 달력으로 만든다 */
function shortDate(date, locale) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

export function NameField({ field, issues, label, value, onChange, hintKey = 'onboarding.nameHint' }) {
  const { t } = useLang();
  const id = fieldDomId(field);
  const countId = `${id}-count`;
  return (
    <TextField
      field={field}
      issues={issues}
      label={label}
      hint={t(hintKey, { max: NAME_MAX_LENGTH })}
      value={value}
      onChange={onChange}
      maxLength={NAME_MAX_LENGTH}
      autoComplete="off"
      afterId={countId}
      after={
        <p className="onboarding-count" id={countId}>
          {t('onboarding.nameCount', { n: value.length, max: NAME_MAX_LENGTH })}
        </p>
      }
    />
  );
}

export default function LodgingStep({ draft, update, issues }) {
  const { t, locale } = useLang();
  const missing = uncoveredNights(draft);
  const count = draft.lodgings.length;

  const patch = (index, fn) =>
    update((d) => ({ ...d, lodgings: d.lodgings.map((l, i) => (i === index ? fn(l) : l)) }));

  function add() {
    update((d) => addLodging(d, newId('lodging')));
    focusById(fieldDomId(`lodgings[${count}].name`));
  }

  function remove(index) {
    update((d) => ({ ...d, lodgings: d.lodgings.filter((_, i) => i !== index) }));
    focusById('ob-lodgings-add');
  }

  return (
    <div className="onboarding-list" id="ob-lodgings" tabIndex={-1}>
      <FieldErrors id="ob-lodgings-error" issues={issuesFor(issues, 'lodgings')} />
      {draft.lodgings.map((lodging, index) => {
        const titleId = `ob-lodgings-${index}-title`;
        return (
          <section key={lodging.id} className="onboarding-card" aria-labelledby={titleId}>
            <div className="onboarding-card-head">
              <h3 id={titleId}>{t('onboarding.lodgingItem', { n: index + 1 })}</h3>
              {count > 1 && (
                <Button variant="secondary" size="small" onClick={() => remove(index)}>
                  {t('onboarding.removeLodging', { n: index + 1 })}
                </Button>
              )}
            </div>
            <NameField
              field={`lodgings[${index}].name`}
              issues={issues}
              label={t('onboarding.lodgingNameOptional')}
              hintKey={'onboarding.lodgingNameHint'}
              value={lodging.name}
              onChange={(value) => patch(index, (l) => ({ ...l, name: value }))}
            />
            <AddressSearch
              field={`lodgings[${index}].address`}
              issues={issues}
              kind="lodging"
              value={lodging.address}
              onSelect={(address) =>
                patch(index, (l) => ({
                  ...l,
                  address,
                  // 이름이 비어 있으면 건물 이름을 제안한다(고칠 수 있다)
                  name: l.name.trim() === '' && address.buildingName ? address.buildingName.slice(0, NAME_MAX_LENGTH) : l.name,
                }))
              }
            />
            <div className="onboarding-row">
              <TextField
                field={`lodgings[${index}].checkIn`}
                extraIssueFields={[`lodgings[${index}]`]}
                issues={issues}
                type="date"
                label={t('onboarding.checkIn')}
                value={lodging.checkIn}
                min={draft.arrival.date || undefined}
                max={draft.departure.date || undefined}
                onChange={(value) => patch(index, (l) => ({ ...l, checkIn: value }))}
              />
              <TextField
                field={`lodgings[${index}].checkOut`}
                issues={issues}
                type="date"
                label={t('onboarding.checkOut')}
                value={lodging.checkOut}
                min={lodging.checkIn || draft.arrival.date || undefined}
                max={draft.departure.date || undefined}
                onChange={(value) => patch(index, (l) => ({ ...l, checkOut: value }))}
              />
            </div>
          </section>
        );
      })}

      <Button variant="secondary" icon="plus" id="ob-lodgings-add" onClick={add}>
        {t('onboarding.addLodging')}
      </Button>

      {missing.length > 0 && (
        <p className="onboarding-note" role="note">
          {t('onboarding.uncoveredNights', { dates: missing.map((date) => shortDate(date, locale)).join(', ') })}
        </p>
      )}
    </div>
  );
}
