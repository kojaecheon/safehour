// 복귀 장소 찾기 (규칙 13-1 · 마감 지남 설계서 4.2·4.3)
//
// 병원으로 복귀하는 외출의 병원을 찾는 규칙 하나를 둔다. 엔진(tripPlan.js 즉시 복귀의 복귀 시간 재계산)과
// 화면(components/trip/viewModel.js returnTargetOf)이 같은 규칙을 쓰도록 여기서만 정한다.

/**
 * 병원으로 복귀하는 외출의 병원 (규칙 13-1). dayContext.returnPointOf 와 같은 순서다.
 * 마감이 병원 일정에서 왔으면 그 일정의 병원, 합성된 복귀 시각(RETURN_TIME)에서 왔으면 그 시각의 `hospitalId` 다.
 * 어느 쪽으로도 찾지 못하면 null 이다. 첫 번째 병원으로 추측하지 않는다.
 * 병원이 둘 이상인 것은 정상이고(사용자 병원 + 연동 지침이 더한 병원), 즉시 복귀는 숫자가 가장 중요한 순간이다.
 * @param {object} outing
 * @param {{ stay: object, day: object }} ctx
 * @returns {object|null} Hospital
 */
export function returnHospitalOf(outing, { stay, day }) {
  const hospitalId = declaredReturnHospitalId(outing, { stay, day });
  if (hospitalId === null) return null;
  return (stay.hospitals ?? []).find((h) => h?.id === hospitalId) ?? null;
}

/**
 * 외출의 복귀 병원으로 적힌 `hospitalId` (returnHospitalOf 와 같은 순서). 적힌 것이 없으면 null.
 * 적혀 있는데 병원 목록에 없으면 returnHospitalOf 는 null 이지만 이 값은 남는다. 화면은 이 둘을 구분해
 * 적힌 병원을 못 찾았을 때 다른 병원으로 대신하지 않는다.
 * @param {object} outing
 * @param {{ stay: object, day: object }} ctx
 * @returns {string|null}
 */
export function declaredReturnHospitalId(outing, { stay, day }) {
  const appt = (stay.appointments ?? []).find((a) => a?.date === day.date && a.start === outing.returnBy);
  const hospitalId = appt?.hospitalId ?? day.effective?.returnTime?.value?.hospitalId;
  return typeof hospitalId === 'string' && hospitalId !== '' ? hospitalId : null;
}
