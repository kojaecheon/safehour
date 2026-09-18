// AX-307 — 체류 전체 일정·재계획 테스트용 가짜 데이터 (실제 호출 없음)
//
// 하루 일정 엔진 fixture(day-plan-fixtures.js)를 그대로 쓰고, 체류 전체에 걸칠 만큼 후보를 늘린다.
// 이름·주소·좌표는 모두 지어낸 것이다. 실제 장소·의료기관·사람을 가리키지 않는다.

import { cafe, museum, period, place, restaurant, shop, stay } from './day-plan-fixtures.js';

export { AIRPORT_TRAVEL, SET, NONE, UNKNOWN, mins, period, place, stay } from './day-plan-fixtures.js';

/** "YYYY-MM-DDTHH:MM:00+09:00" — 엔진에 넘기는 now */
export const at = (date, hhmm) => `${date}T${hhmm}:00+09:00`;

/** "HH:MM" + n분 */
export const plus = (hhmm, n) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + n;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * 체류 10-01~10-10. 경계일 10-04 부터 10-10 까지 본인 체크 기간 P1(기본: 모든 항목 '아니오')이 덮는다.
 * 10-01~10-03 은 FREE, 10-04~10-10 은 RESTRICTED.
 */
export function tripStay(itemOverrides = {}, stayOverrides = {}) {
  return stay({
    periods: [period(itemOverrides, { startDate: '2026-10-04', endDate: '2026-10-10' })],
    ...stayOverrides,
  });
}

const KINDS = [museum, shop, restaurant, cafe, museum, restaurant];

/**
 * 결정적 후보 묶음 — 숙소 반경 0.4~2.4km 안에 n곳. 언어별 제목은 일부만 있다(대체 사슬 확인용).
 * @param {'ko'|'en'|'ja'|'zh'} lang
 */
export function tripPool(lang = 'en', n = 60) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const angle = i * 2.399963;
    const r = 0.4 + (i % 11) * 0.19;
    const id = String(5000 + i);
    const make = KINDS[i % KINDS.length];
    out.push(
      make(id, {
        title: `테스트 장소 ${i}`,
        north: Number((r * Math.cos(angle)).toFixed(3)),
        east: Number((r * Math.sin(angle)).toFixed(3)),
        lang,
        en: i % 3 === 0 ? undefined : `Test Place ${i}`,
        ja: i % 2 === 0 ? `テスト ${i}` : undefined,
        zh: i % 5 === 0 ? `测试 ${i}` : undefined,
      }),
    );
  }
  return out;
}

/** 실외 공원(관심사 NATURE, 실외) — 기상 사건 확인용 */
export const park = (id, o = {}) => place(id, { type: '12', tags: { indoor: false }, ...o });

/** 체류 전체 후보 제공 — 숙소 L1 */
export const byLodging = (list) => ({ L1: list });

/** 모든 외출(환자·보호자)의 정거장 */
export const stopsOf = (day) => [...day.outings, ...day.guardianOutings].flatMap((o) => o.stops);
export const contentIdsOf = (day) => stopsOf(day).map((s) => s.contentId);

/** 외출의 복귀 계산식 required (spec 4.7) */
export function requiredMin(outing, { recovery, extra = 0 }) {
  const stays = outing.stops.reduce((sum, s) => sum + s.stayMin, 0);
  const travel = outing.travelTotalMin;
  return 5 + travel + stays + Math.ceil(travel * 0.25) + 10 + (recovery ? 10 : 0) + extra;
}

/** delta 를 뺀 하루 (경로가 다른 두 재계획 결과를 비교할 때) */
export const withoutDelta = (day) => {
  const { delta, ...rest } = day;
  void delta;
  return rest;
};
