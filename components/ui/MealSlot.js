'use client';

// 식사 칸 (AX-304 · docs/business-rules.md '하루 일정 생성'의 식사 칸, docs/contracts.md '`POST /api/itinerary/plan`'의 mealSlots)
//
//   <MealSlot slot="LUNCH" status="FILLED" time="12:00–13:00"><PlaceCard … /></MealSlot>
//   <MealSlot slot="DINNER" status="NONE_AVAILABLE" reasons={['MENU_UNKNOWN']} />
//
// - status: FILLED(식당 배치) · NONE_AVAILABLE(통과한 식당 없음) · CLEARED(사용자가 비움) · NOT_APPLICABLE
// - '추천 장소 없음'은 **정상 결과**다 — 오류 빨강을 쓰지 않고 점선 칸 + 중립 회색 + 사유 문구로 보인다.
// - 사유 문구는 안전 문구라 safetyPair() 의 주 언어로 보인다(useLang().reasonText).

import { useLang } from '../LanguageProvider.js';
import Icon from './Icon.js';

const SLOT_KEY = { LUNCH: 'common.mealLunch', DINNER: 'common.mealDinner' };
const STATUS_KEY = {
  NONE_AVAILABLE: 'common.mealNone',
  CLEARED: 'common.mealCleared',
  NOT_APPLICABLE: 'common.mealNotApplicable',
};

/**
 * @param {object} props
 * @param {'LUNCH'|'DINNER'} props.slot
 * @param {'FILLED'|'NONE_AVAILABLE'|'CLEARED'|'NOT_APPLICABLE'} props.status
 * @param {string} [props.time]
 * @param {string[]} [props.reasons]   REASON 코드
 */
export default function MealSlot({ slot, status, time, reasons = [], children }) {
  const { lang, safety, t, reasonText } = useLang();
  const filled = status === 'FILLED';
  const reasonLang = safety.primary === lang ? undefined : safety.primary;
  const slotName = t(SLOT_KEY[slot] ?? SLOT_KEY.LUNCH);

  return (
    <section className={filled ? 'ui-meal' : 'ui-meal is-empty'} aria-label={slotName}>
      <p className="ui-meal-head">
        <Icon name="meal" size={18} />
        <span>{slotName}</span>
        {time && <span className="ui-meal-time">{time}</span>}
      </p>
      {filled ? (
        children
      ) : (
        <>
          <p className="ui-meal-status">{t(STATUS_KEY[status] ?? STATUS_KEY.NONE_AVAILABLE)}</p>
          {reasons.length > 0 && (
            <ul className="ui-meal-reasons" lang={reasonLang}>
              {reasons.map((code) => (
                <li key={code}>{reasonText(code)}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
