// 기기 알림 예약: 하루 일정에서 알림 시각을 계산한다 (AX-319 · docs/business-rules.md '알림과 카드', lib/notify/AGENTS.md)
//
// 순수 함수다. 브라우저 API·저장소·i18n 에 의존하지 않는다 — 시각과 문구 키만 만든다.
// 서버 없이 동작한다(lib/notify/AGENTS.md). 실행과 전달은 ./runtime.js, 문구는 ./text.js 가 맡는다.
//
// ── 알림 대상과 시점 (DEFAULTS.notifications, 조정 가능: docs/platform/ITINERARY_RULES.md '조정 가능한 기본값') ──
//   | 대상                    | 시점                                                         | 문구 키
//   | 외출 복귀 마감(환자)     | returnBy 의 60분 전, 30분 전                                 | returnLodging / returnOther
//   | '숙소에서 복용' 복약     | 그 시각 10분 전                                              | atLodging
//   | '숙소 밖 복용' 복약      | 그 시각                                                      | scheduledNow
//   | 병원 일정               | 숙소에서 출발해야 하는 시각의 15분 전                          | leaveLodging
//   | 복귀 마감 지남(환자)     | returnBy 그 시각. 마감 뒤 60분까지 늦게라도 낸다               | returnPassed
//   | 복귀 마감 지남(보호자)   | 받은 일정(companionDay)의 by 그 시각. 마감 뒤 60분까지          | companionReturnPassed
//
//   - 외출 중 재계획으로 즉시 복귀가 켜져(`returnNow === true` 이고 사유에 OUTING_OVERDUE) 마감이 당겨진(출발 시각 또는 지금) 외출
//     (slackMin < 0)만 복귀 마감 지남(환자)을 내지 않는다. 그 returnBy 는 엔진이 '지금'으로 당겨 놓은 값이라 실제 마감 시각이
//     아니고, '지금 돌아가세요' 시트가 같은 순간에 열린다. 같은 날의 다른 외출, PATIENT_RECALLED·PLAN_REVOKED·PLAN_EXPIRED 로
//     켜진 날의 외출은 실제 마감이 남아 있으므로 그대로 낸다(isOverdueClampedDay, src/domain/states.js). 보호자 사본 알림은 그대로다.
//   - 외출은 `Outing.returnBy`(안전 마감)를 쓴다. `plannedReturnAt`(예상 귀가)이 아니다 (docs/engineering-notes.md '복귀 마감과 예상 귀가 시각은 다른 값이다').
//     출발(departAt) 전 시각의 복귀 알림은 만들지 않는다 — 나가기 전에 '돌아갈 시간'이라고 하지 않는다.
//     보호자 외출(guardianOutings)은 대상이 아니다 — 이 기기의 알림은 환자 일정 기준이다.
//   - 병원 블록의 시작(`blocks[kind=APPOINTMENT].start`)은 일정 시작 − 숙소→병원 이동 − 도착 여유 10분,
//     곧 '숙소에서 출발해야 하는 시각'이다(src/stay/dayFrame.js appointmentBlockMinutes).
//     직전 외출이 그 병원에서 끝나면(병원으로 돌아가는 외출의 returnBy = 블록 시작) 블록은 일정 시작부터이고,
//     병원 알림은 만들지 않는다 — 그 외출의 복귀 마감 알림이 대신한다.
//   - 복약 시각은 합성 조건 `effective.medication` 에서 읽는다('숙소에서 복용'은 false 로 명시된 경우만 아니오).
//     합성 조건이 없고 복약 블록만 있으면 블록 시작을 '숙소에서 복용'으로 본다.
//
// ── 정리 규칙 ──
//   - 같은 시각에 울릴 알림은 하나로 합친다. 우선순위: 마감 지남(환자) > 마감 지남(보호자) > 복귀 마감 > 출발 > 숙소 복용 > 숙소 밖 복용.
//   - 지난 시각(nowMs 보다 이른)은 건너뛴다. 지금 이 시각은 지난 것이 아니다.
//     단 마감 지남 두 종류(LATE_NOTIFY_KINDS)는 시각이 지나도 expiresAt 전이면 남는다(앱을 늦게 연 경우).
//   - 결과는 시각 순이고, 같은 입력이면 같은 결과다(id 결정적).
//
// ── 예약 항목에는 허용 목록 필드만 있다 (NOTIFY_ITEM_FIELDS, docs/business-rules.md '알림과 카드'의 문구 제한과 같은 이유) ──
//   { id, kind, key, time, at, expiresAt } — 장소 이름·주소·병원 일정 id·숙소 id·조건 값이 들어갈 자리가 없다.
//   이 항목이 저장소 알림 예약(writeNotificationSchedule)에 그대로 남는다.
//
// 상대 경로 사용 — Next 밖(node --test)에서도 이 모듈을 그대로 테스트한다.

import { isOverdueClampedDay } from '../../src/domain/states.js';
import { DEFAULTS } from '../../src/stay/defaults.js';
import { isClockTime, isDateString, kstInstantMs } from '../../src/stay/time.js';

export const NOTIFY_KIND = Object.freeze({
  /** 외출 복귀 마감 */
  RETURN: 'RETURN',
  /** 병원 일정 — 숙소 출발 */
  LEAVE: 'LEAVE',
  /** '숙소에서 복용' 복약 */
  AT_LODGING: 'AT_LODGING',
  /** '숙소 밖 복용' 복약 */
  AWAY: 'AWAY',
  /** 환자 외출의 복귀 마감이 지남 */
  RETURN_PASSED: 'RETURN_PASSED',
  /** 보호자 기기: 일행의 복귀 마감이 지남 */
  COMPANION_RETURN_PASSED: 'COMPANION_RETURN_PASSED',
});

/** 시각이 지나도 expiresAt 전이면 예약에 남는 종류 */
export const LATE_NOTIFY_KINDS = Object.freeze([NOTIFY_KIND.RETURN_PASSED, NOTIFY_KIND.COMPANION_RETURN_PASSED]);

/** 본문 문구 키 — src/i18n/messages/notifications.js 의 safety 구역 */
export const NOTIFY_TEXT_KEY = Object.freeze({
  RETURN_LODGING: 'notifications.returnLodging',
  RETURN_OTHER: 'notifications.returnOther',
  LEAVE: 'notifications.leaveLodging',
  AT_LODGING: 'notifications.atLodging',
  AWAY: 'notifications.scheduledNow',
  RETURN_PASSED: 'notifications.returnPassed',
  COMPANION_RETURN_PASSED: 'notifications.companionReturnPassed',
});

/** 예약 항목의 허용 목록 필드 (위 머리 주석) */
export const NOTIFY_ITEM_FIELDS = Object.freeze(['id', 'kind', 'key', 'time', 'at', 'expiresAt']);

/** 같은 시각이면 남기는 순서 — 작은 값이 이긴다 */
const PRIORITY = Object.freeze({
  [NOTIFY_KIND.RETURN_PASSED]: 0,
  [NOTIFY_KIND.COMPANION_RETURN_PASSED]: 1,
  [NOTIFY_KIND.RETURN]: 2,
  [NOTIFY_KIND.LEAVE]: 3,
  [NOTIFY_KIND.AT_LODGING]: 4,
  [NOTIFY_KIND.AWAY]: 5,
});

const MIN_MS = 60 * 1000;

/** 목표 시각과 알림 시각이 같은 알림(숙소 밖 복용)을 늦게라도 낼 수 있는 여유 */
export const SAME_TIME_GRACE_MIN = 10;

function leadList(value) {
  return (Array.isArray(value) ? value : [value]).filter((n) => Number.isFinite(n) && n >= 0);
}

function leadMin(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function toMin(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 합성 조건의 복약 시각 [{ time, atLodging }] — 없거나 '모르겠음'이면 [] */
function effectiveDoses(plan) {
  const value = plan?.effective?.medication?.value;
  if (value?.kind !== 'SET' || !Array.isArray(value.value)) return [];
  return value.value
    .filter((m) => m && isClockTime(m.time))
    .map((m) => ({ time: m.time, atLodging: m.atLodging !== false }));
}

/** 복약 시각 목록 — 합성 조건 + 복약 블록(숙소 복용). 같은 시각은 숙소 복용이 이긴다 */
function doses(plan) {
  const byTime = new Map();
  for (const dose of effectiveDoses(plan)) byTime.set(dose.time, byTime.get(dose.time) === true || dose.atLodging);
  for (const block of Array.isArray(plan?.blocks) ? plan.blocks : []) {
    if (block?.kind === 'MEDICATION' && isClockTime(block.start)) byTime.set(block.start, true);
  }
  return [...byTime.entries()].map(([time, atLodging]) => ({ time, atLodging }));
}

function patientOutings(plan) {
  return (Array.isArray(plan?.outings) ? plan.outings : []).filter((o) => o && isClockTime(o.returnBy));
}

/**
 * 오늘 하루 일정에서 알림 예약을 만든다.
 *
 * @param {object|null} dayPlan  DayPlan, docs/contracts.md '`POST /api/itinerary/plan`' (date·outings·blocks·effective 만 읽는다)
 * @param {object} [options]
 * @param {number} [options.nowMs]  지금(ms). 이보다 이른 알림은 건너뛴다
 * @param {typeof DEFAULTS.notifications} [options.leads]  알림 시점(분 전)
 * @param {{date: string, patientReturn: Array<{by: string|null}>}|null} [options.companionDay]
 *   보호자 스냅샷 days[] 의 하루. date 와 by 만 읽는다. dayPlan 이 없어도 이것만으로 동작한다
 * @returns {Array<{id: string, kind: string, key: string, time: string, at: string, expiresAt: string}>}
 *   at·expiresAt 는 ISO 절대 시각. expiresAt 이 지나면 늦게라도 내지 않는다
 */
export function planNotifications(dayPlan, { nowMs = Date.now(), leads = DEFAULTS.notifications, companionDay = null } = {}) {
  const date = dayPlan?.date;
  const hasPlan = isDateString(date);
  const companionDate = companionDay?.date;
  const hasCompanion = isDateString(companionDate) && Array.isArray(companionDay?.patientReturn);
  if (!hasPlan && !hasCompanion) return [];

  const candidates = [];
  const add = (kind, key, time, lead, day = date) => {
    const targetMs = kstInstantMs(day, time);
    const atMs = targetMs - lead * MIN_MS;
    // 목표 시각까지만 늦게 낼 수 있다. 그 시각에 울리는 알림은 여유를 조금 둔다
    const expiresMs = lead > 0 ? targetMs : targetMs + SAME_TIME_GRACE_MIN * MIN_MS;
    candidates.push({ kind, key, time, lead, day, atMs, expiresMs });
  };
  // 마감 지남: 그 시각에 울리고, 마감 뒤 returnPassedGraceMin 분까지 늦게라도 낸다
  const addPassed = (kind, key, time, day) => {
    const targetMs = kstInstantMs(day, time);
    const grace = Number.isFinite(leads?.returnPassedGraceMin) ? leadMin(leads.returnPassedGraceMin) : DEFAULTS.notifications.returnPassedGraceMin;
    const expiresMs = targetMs + grace * MIN_MS;
    candidates.push({ kind, key, time, lead: 0, day, atMs: targetMs, expiresMs });
  };

  // 보호자: 받은 일정에 담긴 환자 복귀 마감. by 가 깨졌으면 건너뛴다
  if (hasCompanion) {
    for (const entry of companionDay.patientReturn) {
      if (!isClockTime(entry?.by)) continue;
      addPassed(NOTIFY_KIND.COMPANION_RETURN_PASSED, NOTIFY_TEXT_KEY.COMPANION_RETURN_PASSED, entry.by, companionDate);
    }
  }

  // 외출 복귀 마감 (환자). 일정이 없으면(보호자 기기) 아래 세 구역은 비어 있다
  const outings = hasPlan ? patientOutings(dayPlan) : [];
  const overdueClamped = hasPlan && isOverdueClampedDay(dayPlan);
  for (const outing of outings) {
    // 외출 중 재계획으로 마감이 당겨진(출발 시각 또는 지금) 외출(OUTING_OVERDUE 날의 여유 음수 외출)만 마감 지남 알림을 내지 않는다.
    // 다른 즉시 복귀 원인의 날은 실제 마감이 남아 있으므로 그대로 낸다
    const clamped = overdueClamped && typeof outing.slackMin === 'number' && outing.slackMin < 0;
    if (!clamped) addPassed(NOTIFY_KIND.RETURN_PASSED, NOTIFY_TEXT_KEY.RETURN_PASSED, outing.returnBy, date);
    const key = outing.returnPlace === 'LODGING' ? NOTIFY_TEXT_KEY.RETURN_LODGING : NOTIFY_TEXT_KEY.RETURN_OTHER;
    const departMin = isClockTime(outing.departAt) ? toMin(outing.departAt) : null;
    for (const lead of leadList(leads?.returnBeforeMin)) {
      if (departMin !== null && toMin(outing.returnBy) - lead < departMin) continue;
      add(NOTIFY_KIND.RETURN, key, outing.returnBy, lead);
    }
  }

  // 병원 일정 — 숙소 출발 시각(블록 시작) 전. 직전 외출이 병원에서 끝나면 복귀 마감 알림이 대신한다
  const chainedStarts = new Set(outings.filter((o) => o.returnPlace === 'HOSPITAL').map((o) => o.returnBy));
  for (const block of Array.isArray(dayPlan?.blocks) ? dayPlan.blocks : []) {
    if (block?.kind !== 'APPOINTMENT' || !isClockTime(block.start)) continue;
    if (chainedStarts.has(block.start)) continue;
    add(NOTIFY_KIND.LEAVE, NOTIFY_TEXT_KEY.LEAVE, block.start, leadMin(leads?.appointmentBeforeMin));
  }

  // 복약
  for (const dose of hasPlan ? doses(dayPlan) : []) {
    if (dose.atLodging) {
      add(NOTIFY_KIND.AT_LODGING, NOTIFY_TEXT_KEY.AT_LODGING, dose.time, leadMin(leads?.medicationAtLodgingBeforeMin));
    } else {
      add(NOTIFY_KIND.AWAY, NOTIFY_TEXT_KEY.AWAY, dose.time, leadMin(leads?.medicationAwayBeforeMin));
    }
  }

  // 같은 시각은 하나로, 지난 시각은 건너뛴다
  const byAt = new Map();
  for (const c of candidates) {
    if (c.atMs < nowMs && !(LATE_NOTIFY_KINDS.includes(c.kind) && nowMs < c.expiresMs)) continue;
    const kept = byAt.get(c.atMs);
    if (!kept || PRIORITY[c.kind] < PRIORITY[kept.kind] || (PRIORITY[c.kind] === PRIORITY[kept.kind] && c.time < kept.time)) {
      byAt.set(c.atMs, c);
    }
  }

  return [...byAt.values()]
    .sort((a, b) => a.atMs - b.atMs)
    .map((c) =>
      Object.freeze({
        id: `${c.day}:${c.kind}:${c.time}:${c.lead}`,
        kind: c.kind,
        key: c.key,
        time: c.time,
        at: new Date(c.atMs).toISOString(),
        expiresAt: new Date(c.expiresMs).toISOString(),
      }),
    );
}
