// 기기 체류(Stay) → 일정 API 요청 모델(PlanStay) (AX-316 · docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)')
//
// 허용 목록만 **새 객체로** 옮긴다. 이름·주소 글자·전화·병원 안내문·연결 코드·연동 사본·보호자 공유 기록·
// 동의 문구 버전·시각은 옮기지 않는다. 서버도 버리지만(docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)') 애초에 기기 밖으로 보내지 않는다.
// 좌표는 Stay 의 address 안에서 PlanStay 의 최상위(lat·lng)로 옮긴다. 동의는 boolean 이 된다.
//
// 순수 함수다. 입력을 바꾸지 않는다.

import { hasSensitiveConsent, pointOf } from '../../src/stay/stay.js';

/** ConditionItems 의 판정 항목: 서버 cleanItems 와 같은 목록 (src/stay/conditions.js @typedef ConditionItems) */
const ITEM_KEYS = Object.freeze([
  'outing',
  'returnTime',
  'walkLimit',
  'travelLimit',
  'avoidUv',
  'avoidHeat',
  'avoidWater',
  'escortRequired',
  'guardianMustStay',
  'mealRestriction',
  'medication',
]);
const DIET_KEYS = Object.freeze(['spicy', 'alcohol', 'hard', 'hot', 'raw']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function has(object, key) {
  return isPlainObject(object) && Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined;
}

function endpoint(value) {
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of ['date', 'time', 'airport']) if (has(value, key)) out[key] = value[key];
  return out;
}

function items(value) {
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of ITEM_KEYS) if (has(value, key)) out[key] = structuredClone(value[key]);
  if (isPlainObject(value.diet)) {
    out.diet = {};
    for (const key of DIET_KEYS) if (has(value.diet, key)) out.diet[key] = structuredClone(value.diet[key]);
  }
  return out;
}

function period(p) {
  const out = { id: p?.id, source: p?.source, startDate: p?.startDate, endDate: p?.endDate };
  if (has(p, 'noRestriction')) out.noRestriction = p.noRestriction;
  out.items = items(p?.items);
  if (p?.source === 'HOSPITAL') {
    if (has(p, 'expiresAt')) out.expiresAt = p.expiresAt;
    if (has(p, 'revoked')) out.revoked = p.revoked;
  }
  return out;
}

/**
 * @param {object|null|undefined} stay  기기 저장 체류 (src/stay/stay.js @typedef Stay)
 * @returns {object|null}  PlanStay (docs/contracts.md '판정 요청에 실리는 체류 (`PlanStay`)'). 체류가 없으면 null
 */
export function toPlanStay(stay) {
  if (!isPlainObject(stay)) return null;
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    arrival: endpoint(stay.arrival),
    departure: endpoint(stay.departure),
    hasCompanion: stay.hasCompanion,
    interests: [...list(stay.interests)],
    pace: stay.pace,
    lodgings: list(stay.lodgings).map((l) => {
      const { lat, lng } = pointOf(l);
      return { id: l?.id, lat, lng, checkIn: l?.checkIn, checkOut: l?.checkOut };
    }),
    hospitals: list(stay.hospitals).map((h) => {
      const { lat, lng } = pointOf(h);
      return { id: h?.id, lat, lng };
    }),
    appointments: list(stay.appointments).map((a) => ({
      id: a?.id,
      hospitalId: a?.hospitalId,
      type: a?.type,
      date: a?.date,
      start: a?.start,
      ...(a?.end !== undefined && a?.end !== null ? { end: a.end } : {}),
    })),
    periods: list(stay.periods).map(period),
    consent: { sensitive: hasSensitiveConsent(stay) },
  };
}
