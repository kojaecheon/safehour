// 합성 값 → 화면 문구 (AX-315 · spec 4.5)
//
// 값을 해석하지 않고 정해진 문구로만 옮긴다. 문구는 conditions 이름공간에 있다.

export const OUTING_LABEL_KEY = Object.freeze({
  ALLOWED: 'conditions.outingALLOWED',
  INDOOR_ONLY: 'conditions.outingINDOOR_ONLY',
  FORBIDDEN: 'conditions.outingFORBIDDEN',
});

/** 합성 결과 줄의 짧은 항목 이름 */
export const ITEM_LABEL_KEY = Object.freeze({
  outing: 'conditions.item.outing',
  returnTime: 'conditions.item.returnTime',
  walkLimit: 'conditions.item.walkLimit',
  travelLimit: 'conditions.item.travelLimit',
  avoidUv: 'conditions.item.avoidUv',
  avoidHeat: 'conditions.item.avoidHeat',
  avoidWater: 'conditions.item.avoidWater',
  escortRequired: 'conditions.item.escortRequired',
  guardianMustStay: 'conditions.item.guardianMustStay',
  mealRestriction: 'conditions.item.mealRestriction',
  'diet.spicy': 'conditions.item.diet.spicy',
  'diet.alcohol': 'conditions.item.diet.alcohol',
  'diet.hard': 'conditions.item.diet.hard',
  'diet.hot': 'conditions.item.diet.hot',
  'diet.raw': 'conditions.item.diet.raw',
  medication: 'conditions.item.medication',
});

/**
 * @param {string} key  ITEM_KEYS 의 점 표기 키
 * @param {any} value   합성 값 (UNKNOWN 은 이미 기본값으로 바뀌어 있다)
 * @param {(key: string, vars?: object) => string} t
 * @param {Array<{id: string, name: string}>} hospitals
 */
export function formatEffectiveValue(key, value, t, hospitals = []) {
  if (key === 'outing') return t(OUTING_LABEL_KEY[value] ?? 'conditions.errInvalid');
  if (key === 'returnTime') {
    if (value?.kind !== 'SET') return t('conditions.valReturnNotSet');
    if (value.place === 'HOSPITAL') {
      const name = hospitals.find((h) => h?.id === value.hospitalId)?.name ?? t('conditions.placeHOSPITAL');
      return t('conditions.valReturnHospital', { time: value.time, name });
    }
    return t('conditions.valReturnLodging', { time: value.time });
  }
  if (key === 'walkLimit') return value?.kind === 'SET' ? t('conditions.valWalk', { n: value.value }) : t('conditions.valNoLimit');
  if (key === 'travelLimit') {
    return value?.kind === 'SET' ? t('conditions.valTravel', { n: value.value }) : t('conditions.valNoLimit');
  }
  if (key === 'mealRestriction') {
    if (value?.kind !== 'SET') return t('conditions.valNone');
    return value.value?.mode === 'UNTIL'
      ? t('conditions.valMealUntil', { time: value.value.until })
      : t('conditions.valMealAllDay');
  }
  if (key === 'medication') {
    if (value?.kind !== 'SET' || !Array.isArray(value.value) || value.value.length === 0) return t('conditions.valNone');
    return value.value
      .map((m) => t(m.atLodging ? 'conditions.valMedAtLodging' : 'conditions.valMedAway', { time: m.time }))
      .join(', ');
  }
  return value?.kind === 'SET' ? t('conditions.valYes') : t('conditions.valNo');
}
