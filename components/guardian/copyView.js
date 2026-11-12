// 받은 일정(/g) 화면의 순수 도우미 (사용성 점검 D3)
//
// 사본에 담긴 값을 다시 고르고 묶기만 한다. 새 판단을 만들지 않는다.
//   - dedupePatientReturns: 같은 시각·같은 장소(이름·주소)의 환자 복귀 마감을 한 줄로 합친다
//   - todayReturnSummary: 맨 위 '오늘 환자 복귀 마감' 카드에 놓을 한 건을 고른다
// 'PASSED' 는 '마감 시각이 지났다'는 뜻 하나다. 환자가 돌아왔는지는 앱이 알 수 없다(returnStatus.js).

import { kstDate } from './errorView.js';
import { patientReturnStatus } from './returnStatus.js';

const keyOf = (entry) => JSON.stringify([entry?.by ?? null, entry?.placeName ?? null, entry?.placeAddress ?? null]);

/**
 * 같은 by + placeName + placeAddress 를 하나로 합친다. 처음 나온 순서를 지킨다.
 * @param {Array<{by: string, placeName: string|null, placeAddress: string|null}>} entries
 */
export function dedupePatientReturns(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const key = keyOf(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/**
 * 오늘(nowMs 의 KST 날짜) 환자 복귀 마감 요약.
 * - 아직 지나지 않은 마감이 있으면 그 가운데 가장 이른 것(UPCOMING)
 * - 모두 지났으면 가장 늦은 것(PASSED)
 * - 오늘이 사본에 있지만 환자 외출이 없으면 { date, none: true }
 * - 오늘이 사본 날짜에 없으면(입국 전, 범위 지남) null
 * @returns {null | { date: string, none: true } | { date, by, placeName, placeAddress, status, total }}
 */
export function todayReturnSummary(snapshot, nowMs) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return null;
  if (!Array.isArray(snapshot?.days)) return null;
  const date = kstDate(nowMs);
  const day = snapshot.days.find((d) => d?.date === date);
  if (!day) return null;
  const deduped = dedupePatientReturns(day.patientReturn);
  const entries = deduped
    .map((entry) => ({ entry, status: patientReturnStatus({ date, by: entry.by, nowMs }) }))
    .filter((item) => item.status !== null);
  // 마감이 하나도 없으면 '오늘 환자 외출 없음'. 마감은 있는데 시각을 읽을 수 없으면 카드를 그리지 않는다(아래 줄과 어긋나게 말하지 않는다)
  if (entries.length === 0) return deduped.length > 0 ? null : { date, none: true };

  const upcoming = entries.filter((item) => item.status === 'UPCOMING');
  const pool = upcoming.length > 0 ? upcoming : entries;
  const pick = pool.reduce((best, item) => {
    if (upcoming.length > 0) return item.entry.by < best.entry.by ? item : best;
    return item.entry.by > best.entry.by ? item : best;
  });
  const { by, placeName, placeAddress } = pick.entry;
  return { date, by, placeName: placeName ?? null, placeAddress: placeAddress ?? null, status: pick.status, total: entries.length };
}

/**
 * 받은 일정 화면의 날짜 순서. 오늘이 있으면 오늘을 맨 앞에 두고, 그다음 앞으로 올 날짜(원래 순서), 마지막에 지난 날짜(원래 순서)다.
 * 오늘이 범위 밖이면 순서를 바꾸지 않는다(모두 펼친 채 그대로 보인다).
 * @param {Array<{date: string}>} days
 * @param {string} today  'YYYY-MM-DD'(한국 날짜)
 * @returns {{ todayDay: object|null, days: Array<object> }}
 */
export function orderDaysForView(days, today) {
  const list = Array.isArray(days) ? days : [];
  const todayDay = list.find((d) => d?.date === today) ?? null;
  if (!todayDay) return { todayDay: null, days: list };
  const future = list.filter((d) => d !== todayDay && typeof d?.date === 'string' && d.date > today);
  const past = list.filter((d) => d !== todayDay && !(typeof d?.date === 'string' && d.date > today));
  return { todayDay, days: [todayDay, ...future, ...past] };
}
