// 사용자 편집 기록 (AX-316 · docs/business-rules.md '사용자 편집', TripPlan.edits 저장은 docs/security.md '기기 저장소와 계정 이름공간')
//
// 기록은 날짜별 `{ pinned: contentId[], deleted: contentId[], clearedMeals: ('LUNCH'|'DINNER')[] }` 이다.
//   - 교체: 새 장소는 고정(pinned), 옛 장소는 삭제(deleted). 엔진이 옛 자리에 고정 장소를 넣는다
//   - 삭제: 삭제(deleted). 식사 칸 식당이면 그 칸을 비움(clearedMeals)으로도 남겨 다시 채우지 않는다
//   - 식사 칸 비움: clearedMeals
//   - 다시 만들기: 범위 날짜의 기록을 지운다
// 순수 함수다. 입력을 바꾸지 않고 새 기록을 돌려준다.

export const MEAL_SLOTS = Object.freeze(['LUNCH', 'DINNER']);

function uniq(list) {
  return [...new Set(list)];
}

function record(edits, date) {
  const r = edits?.[date] ?? {};
  return {
    pinned: (r.pinned ?? []).map(String),
    deleted: (r.deleted ?? []).map(String),
    clearedMeals: [...(r.clearedMeals ?? [])],
  };
}

function put(edits, date, next) {
  return { ...(edits ?? {}), [date]: next };
}

/** 교체 — 새 장소 고정, 옛 장소 삭제 */
export function withSwap(edits, date, { fromContentId, toContentId }) {
  const from = String(fromContentId);
  const to = String(toContentId);
  const r = record(edits, date);
  return put(edits, date, {
    pinned: uniq([...r.pinned.filter((id) => id !== from), to]),
    deleted: uniq([...r.deleted.filter((id) => id !== to), from]),
    clearedMeals: r.clearedMeals,
  });
}

/** 삭제 — slot 이 있으면(식사 칸 식당) 그 칸을 비움으로 */
export function withDelete(edits, date, { contentId, slot = null }) {
  const id = String(contentId);
  if (slot !== null && !MEAL_SLOTS.includes(slot)) throw new RangeError(`식사 칸이 올바르지 않습니다: ${String(slot)}`);
  const r = record(edits, date);
  return put(edits, date, {
    pinned: r.pinned.filter((x) => x !== id),
    deleted: uniq([...r.deleted, id]),
    clearedMeals: slot ? uniq([...r.clearedMeals, slot]) : r.clearedMeals,
  });
}

/** 식사 칸 비움 */
export function withClearedMeal(edits, date, slot) {
  if (!MEAL_SLOTS.includes(slot)) throw new RangeError(`식사 칸이 올바르지 않습니다: ${String(slot)}`);
  const r = record(edits, date);
  return put(edits, date, { ...r, clearedMeals: uniq([...r.clearedMeals, slot]) });
}

/** 다시 만들기 — 범위 날짜의 기록을 지운다 */
export function withoutDates(edits, dates) {
  const drop = new Set(dates ?? []);
  return Object.fromEntries(Object.entries(edits ?? {}).filter(([date]) => !drop.has(date)));
}

/**
 * 하루 일정에서 정거장을 찾는다.
 * @returns {{stop: object, outing: object, role: 'P'|'G', slot: 'LUNCH'|'DINNER'|null} | null}
 *   slot: 이 정거장이 채운 식사 칸
 */
export function findStop(day, stopId) {
  for (const [role, list] of [
    ['P', day?.outings ?? []],
    ['G', day?.guardianOutings ?? []],
  ]) {
    for (const outing of list) {
      const stop = (outing?.stops ?? []).find((s) => s?.id === stopId);
      if (stop) {
        const meal = (day?.mealSlots ?? []).find((m) => m?.stopId === stopId && m?.status === 'FILLED');
        return { stop, outing, role, slot: stop.isMeal ? meal?.slot ?? null : null };
      }
    }
  }
  return null;
}
