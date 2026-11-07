// 기기 알림 예약 (AX-319 · spec 4.13 · 규칙 47)
//
// 이 파일이 고정하는 것
//   - 알림 대상과 시점: 복귀 마감 60·30분 전, '숙소에서 복용' 10분 전, '숙소 밖 복용' 그 시각,
//     병원 일정은 숙소에서 출발해야 하는 시각(블록 시작 = 일정 시작 − 이동 − 10분)의 15분 전.
//     직전 외출이 병원에서 끝나면 병원 알림을 만들지 않는다(복귀 마감 알림이 대신한다).
//   - 시점은 DEFAULTS.notifications 에서 읽는다(조정 가능).
//   - 같은 시각의 알림은 하나로 합친다. 지난 시각은 건너뛴다.
//   - 규칙 47: 알림 문구에 조건·병원·복약 정보가 없다. 예약 항목에는 허용 목록 필드만 있다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { LATE_NOTIFY_KINDS, NOTIFY_ITEM_FIELDS, NOTIFY_KIND, NOTIFY_TEXT_KEY, planNotifications } from '../lib/notify/schedule.js';
import { NOTIFY_TITLE_KEY, notificationText } from '../lib/notify/text.js';
import { DEFAULTS } from '../src/stay/defaults.js';
import { LANGS, translate } from '../src/i18n/index.js';
import * as notificationsNs from '../src/i18n/messages/notifications.js';

const DATE = '2026-09-20';
const kst = (time, date = DATE) => Date.parse(`${date}T${time}:00+09:00`);
const iso = (time, date = DATE) => new Date(kst(time, date)).toISOString();
const EARLY = kst('06:00');

// 민감 문자열 — 일정 안에 있어도 알림 문구로 새면 안 된다
const HOSPITAL_NAME = '서울미래성형외과';
const STOP_TITLE = `${HOSPITAL_NAME} 옆 카페`;
const STOP_ADDRESS = '서울특별시 강남구 테헤란로 123';

function stop(overrides = {}) {
  return {
    id: `${DATE}:P:1001`,
    candidateId: 'c-1001',
    contentId: '1001',
    title: STOP_TITLE,
    address: STOP_ADDRESS,
    lang: 'ko',
    category: 'CAFE',
    isMeal: false,
    lat: 37.5,
    lng: 127.03,
    ko: { title: STOP_TITLE, address: STOP_ADDRESS },
    arriveAt: '15:20',
    leaveAt: '16:20',
    stayMin: 60,
    shortened: false,
    legIn: { min: 15, mode: 'TAXI', estimated: true },
    walkBurdenMin: 5,
    indoor: true,
    pinned: false,
    labels: [],
    ...overrides,
  };
}

function outing(overrides = {}) {
  return {
    id: `${DATE}:P:outing-1`,
    departAt: '15:00',
    returnBy: '18:00',
    returnPlace: 'LODGING',
    deadlineReason: 'RETURN_TIME',
    latestDepartureAt: '17:10',
    slackMin: 20,
    walkTotalMin: 10,
    travelTotalMin: 30,
    plannedReturnAt: '17:35',
    stops: [stop()],
    ...overrides,
  };
}

function medicationEffective(list) {
  return {
    value: { kind: 'SET', value: list },
    provenance: [{ periodId: 'p-self-1', source: 'SELF', defaulted: false }],
  };
}

function dayPlan({ outings = [], guardianOutings = [], blocks = [], medication = null, date = DATE, returnNow = false } = {}) {
  return {
    date,
    coverage: 'RESTRICTED',
    dayState: outings.length ? 'TOGETHER' : 'NO_TOURISM',
    reasons: [],
    window: { start: '09:00', end: '21:00' },
    lodgingId: 'lodging-gangnam-1',
    transportMode: 'TAXI',
    effective: {
      walkLimit: { value: { kind: 'SET', value: 15 }, provenance: [] },
      'diet.alcohol': { value: { kind: 'SET', value: true }, provenance: [] },
      avoidUv: { value: { kind: 'SET', value: true }, provenance: [] },
      ...(medication ? { medication: medicationEffective(medication) } : {}),
    },
    blocks,
    outings,
    guardianOutings,
    mealSlots: [],
    excluded: [],
    warnings: [],
    returnNow,
  };
}

const byKind = (items, kind) => items.filter((i) => i.kind === kind);

describe('시점은 조정 가능한 기본값 한곳(DEFAULTS.notifications)에서 온다', () => {
  test('spec 4.13 · 11장 값: 복귀 60·30, 숙소 복용 10, 숙소 밖 복용 0, 병원 15', () => {
    assert.deepEqual([...DEFAULTS.notifications.returnBeforeMin], [60, 30]);
    assert.equal(DEFAULTS.notifications.medicationAtLodgingBeforeMin, 10);
    assert.equal(DEFAULTS.notifications.medicationAwayBeforeMin, 0);
    assert.equal(DEFAULTS.notifications.appointmentBeforeMin, 15);
  });

  test('다른 시점을 넘기면 그 값을 쓴다', () => {
    const plan = dayPlan({ outings: [outing()] });
    const items = planNotifications(plan, {
      nowMs: EARLY,
      leads: { ...DEFAULTS.notifications, returnBeforeMin: [45] },
    });
    assert.deepEqual(
      byKind(items, NOTIFY_KIND.RETURN).map((i) => i.at),
      [iso('17:15')],
    );
  });
});

describe('외출 복귀 마감 — 60분 전, 30분 전', () => {
  test('숙소로 돌아오는 외출: 17:00 과 17:30 에 "18:00까지 숙소로" 알림', () => {
    const items = planNotifications(dayPlan({ outings: [outing()] }), { nowMs: EARLY });
    assert.deepEqual(
      byKind(items, NOTIFY_KIND.RETURN).map((i) => [i.kind, i.at, i.time, i.key]),
      [
        [NOTIFY_KIND.RETURN, iso('17:00'), '18:00', NOTIFY_TEXT_KEY.RETURN_LODGING],
        [NOTIFY_KIND.RETURN, iso('17:30'), '18:00', NOTIFY_TEXT_KEY.RETURN_LODGING],
      ],
    );
  });

  test('병원으로 돌아가는 외출은 병원을 적지 않는 일반 문구를 쓴다', () => {
    const plan = dayPlan({
      outings: [outing({ returnBy: '14:00', departAt: '11:00', returnPlace: 'HOSPITAL', deadlineReason: 'RETURN_TIME' })],
    });
    const items = byKind(planNotifications(plan, { nowMs: EARLY }), NOTIFY_KIND.RETURN);
    assert.equal(items.length, 2);
    for (const item of items) {
      assert.equal(item.key, NOTIFY_TEXT_KEY.RETURN_OTHER);
      assert.equal(item.time, '14:00');
    }
  });

  test('출발 전 시각의 복귀 알림은 만들지 않는다 (나가기 전에 "돌아갈 시간"이라고 하지 않는다)', () => {
    const plan = dayPlan({ outings: [outing({ departAt: '17:10', returnBy: '18:00' })] });
    const items = planNotifications(plan, { nowMs: EARLY });
    assert.deepEqual(
      byKind(items, NOTIFY_KIND.RETURN).map((i) => i.at),
      [iso('17:30')],
    );
  });

  test('보호자 외출은 이 기기 알림 대상이 아니다 (환자 외출만)', () => {
    const plan = dayPlan({
      guardianOutings: [outing({ id: `${DATE}:G:outing-1`, returnBy: '16:00', departAt: '13:00' })],
    });
    assert.deepEqual(planNotifications(plan, { nowMs: EARLY }), []);
  });

  test('외출 두 번은 각각 알린다', () => {
    const plan = dayPlan({
      outings: [
        outing({ id: `${DATE}:P:outing-1`, departAt: '10:00', returnBy: '12:00' }),
        outing({ id: `${DATE}:P:outing-2`, departAt: '15:00', returnBy: '18:00' }),
      ],
    });
    const items = planNotifications(plan, { nowMs: EARLY });
    assert.deepEqual(
      byKind(items, NOTIFY_KIND.RETURN).map((i) => i.at),
      [iso('11:00'), iso('11:30'), iso('17:00'), iso('17:30')],
    );
  });
});

describe('복약 — 숙소에서 복용 10분 전, 숙소 밖 복용 그 시각', () => {
  test('합성 조건의 복약 시각을 읽는다', () => {
    const plan = dayPlan({
      medication: [
        { time: '13:00', atLodging: false },
        { time: '20:00', atLodging: true },
      ],
    });
    const items = planNotifications(plan, { nowMs: EARLY });
    assert.deepEqual(
      items.map((i) => [i.kind, i.at, i.time, i.key]),
      [
        [NOTIFY_KIND.AWAY, iso('13:00'), '13:00', NOTIFY_TEXT_KEY.AWAY],
        [NOTIFY_KIND.AT_LODGING, iso('19:50'), '20:00', NOTIFY_TEXT_KEY.AT_LODGING],
      ],
    );
  });

  test("'숙소에서 복용'은 명시적으로 false 가 아니면 숙소 복용으로 본다 (기본 예)", () => {
    const plan = dayPlan({ medication: [{ time: '09:30' }] });
    const [item] = planNotifications(plan, { nowMs: EARLY });
    assert.equal(item.kind, NOTIFY_KIND.AT_LODGING);
    assert.equal(item.at, iso('09:20'));
  });

  test('합성 조건이 없어도 복약 블록이 있으면 숙소 복용으로 알린다', () => {
    const plan = dayPlan({ blocks: [{ kind: 'MEDICATION', start: '08:00', end: '08:15' }] });
    plan.effective = {};
    const items = planNotifications(plan, { nowMs: EARLY });
    assert.deepEqual(
      items.map((i) => [i.kind, i.at]),
      [[NOTIFY_KIND.AT_LODGING, iso('07:50')]],
    );
  });

  test('합성 조건과 블록에 같은 시각이 있으면 한 번만 알린다', () => {
    const plan = dayPlan({
      medication: [{ time: '08:00', atLodging: true }],
      blocks: [{ kind: 'MEDICATION', start: '08:00', end: '08:15' }],
    });
    assert.equal(planNotifications(plan, { nowMs: EARLY }).length, 1);
  });

  test("복약 '모르겠음'(NONE) 은 알림이 없다", () => {
    const plan = dayPlan();
    plan.effective.medication = { value: { kind: 'NONE' }, provenance: [] };
    assert.deepEqual(planNotifications(plan, { nowMs: EARLY }), []);
  });
});

describe('병원 일정 — 숙소에서 출발해야 하는 시각의 15분 전', () => {
  test('블록 시작(= 일정 시작 − 이동 − 10분)이 출발 시각이다: 14:20 출발 → 14:05 알림', () => {
    const plan = dayPlan({
      blocks: [{ kind: 'APPOINTMENT', start: '14:20', end: '17:30', appointmentId: 'appt-1' }],
    });
    const items = planNotifications(plan, { nowMs: EARLY });
    assert.deepEqual(
      items.map((i) => [i.kind, i.at, i.time, i.key]),
      [[NOTIFY_KIND.LEAVE, iso('14:05'), '14:20', NOTIFY_TEXT_KEY.LEAVE]],
    );
  });

  test('직전 외출이 병원에서 끝나면 병원 알림 대신 복귀 마감 알림만 있다', () => {
    const plan = dayPlan({
      outings: [
        outing({ departAt: '11:30', returnBy: '15:00', returnPlace: 'HOSPITAL', deadlineReason: 'APPOINTMENT' }),
      ],
      // 이어진 병원 블록은 일정 시작 시각부터다
      blocks: [{ kind: 'APPOINTMENT', start: '15:00', end: '17:00', appointmentId: 'appt-1' }],
    });
    const items = planNotifications(plan, { nowMs: EARLY });
    assert.equal(byKind(items, NOTIFY_KIND.LEAVE).length, 0);
    assert.deepEqual(
      byKind(items, NOTIFY_KIND.RETURN).map((i) => i.at),
      [iso('14:00'), iso('14:30')],
    );
  });

  test('다른 병원 일정은 이어진 외출이 있어도 따로 알린다', () => {
    const plan = dayPlan({
      outings: [outing({ departAt: '10:00', returnBy: '12:00', returnPlace: 'HOSPITAL', deadlineReason: 'APPOINTMENT' })],
      blocks: [
        { kind: 'APPOINTMENT', start: '12:00', end: '13:00', appointmentId: 'appt-1' },
        { kind: 'APPOINTMENT', start: '16:40', end: '18:00', appointmentId: 'appt-2' },
      ],
    });
    const leave = byKind(planNotifications(plan, { nowMs: EARLY }), NOTIFY_KIND.LEAVE);
    assert.deepEqual(
      leave.map((i) => [i.at, i.time]),
      [[iso('16:25'), '16:40']],
    );
  });
});

describe('중복 제거와 지난 시각', () => {
  test('같은 시각의 알림은 하나로 합친다 — 복귀 마감이 우선한다', () => {
    const plan = dayPlan({
      outings: [outing({ departAt: '15:00', returnBy: '18:00' })],
      medication: [{ time: '17:30', atLodging: false }],
    });
    const items = planNotifications(plan, { nowMs: EARLY });
    const at1730 = items.filter((i) => i.at === iso('17:30'));
    assert.equal(at1730.length, 1);
    assert.equal(at1730[0].kind, NOTIFY_KIND.RETURN);
    assert.equal(new Set(items.map((i) => i.at)).size, items.length);
  });

  test('출발 알림과 숙소 복용 알림이 같은 시각이면 출발 알림이 남는다', () => {
    const plan = dayPlan({
      blocks: [{ kind: 'APPOINTMENT', start: '14:25', end: '16:00', appointmentId: 'appt-1' }],
      medication: [{ time: '14:20', atLodging: true }],
    });
    const items = planNotifications(plan, { nowMs: EARLY });
    const at1410 = items.filter((i) => i.at === iso('14:10'));
    assert.equal(at1410.length, 1);
    assert.equal(at1410[0].kind, NOTIFY_KIND.LEAVE);
  });

  test('지난 시각은 건너뛴다', () => {
    const plan = dayPlan({
      outings: [outing()],
      medication: [
        { time: '13:00', atLodging: false },
        { time: '20:00', atLodging: true },
      ],
    });
    const items = planNotifications(plan, { nowMs: kst('17:10') });
    assert.deepEqual(
      items.filter((i) => i.kind !== NOTIFY_KIND.RETURN_PASSED).map((i) => i.at),
      [iso('17:30'), iso('19:50')],
    );
  });

  test('지금 이 시각의 알림은 지난 것이 아니다', () => {
    const plan = dayPlan({ outings: [outing()] });
    const items = planNotifications(plan, { nowMs: kst('17:30') });
    assert.deepEqual(
      byKind(items, NOTIFY_KIND.RETURN).map((i) => i.at),
      [iso('17:30')],
    );
  });

  test('시각 순으로 정렬되고 id 는 결정적이며 서로 다르다', () => {
    const plan = dayPlan({
      outings: [outing()],
      blocks: [{ kind: 'APPOINTMENT', start: '09:40', end: '11:00', appointmentId: 'appt-1' }],
      medication: [{ time: '21:00', atLodging: true }],
    });
    const a = planNotifications(plan, { nowMs: EARLY });
    const b = planNotifications(structuredClone(plan), { nowMs: EARLY });
    assert.deepEqual(a, b);
    const ats = a.map((i) => Date.parse(i.at));
    assert.deepEqual(ats, [...ats].sort((x, y) => x - y));
    assert.equal(new Set(a.map((i) => i.id)).size, a.length);
    for (const item of a) assert.ok(item.id.startsWith(`${DATE}:`), item.id);
  });
});

describe('복귀 마감이 지남 (설계서 4.1·4.2)', () => {
  test('환자 외출마다 returnBy 시각에 RETURN_PASSED 하나, expiresAt 은 +60분', () => {
    const items = planNotifications(dayPlan({ outings: [outing()] }), { nowMs: EARLY });
    assert.deepEqual(
      byKind(items, NOTIFY_KIND.RETURN_PASSED).map(({ at, expiresAt, time, key }) => ({ at, expiresAt, time, key })),
      [{ at: iso('18:00'), expiresAt: iso('19:00'), time: '18:00', key: NOTIFY_TEXT_KEY.RETURN_PASSED }],
    );
  });

  test('즉시 복귀 중인 날(returnNow)은 RETURN_PASSED 를 내지 않고, 보호자 사본 알림은 그대로 둔다', () => {
    const companionDay = { date: DATE, patientReturn: [{ by: '19:00' }] };
    const plan = dayPlan({ outings: [outing()], returnNow: true });
    const items = planNotifications(plan, { nowMs: EARLY, companionDay });
    assert.equal(byKind(items, NOTIFY_KIND.RETURN_PASSED).length, 0);
    assert.equal(byKind(items, NOTIFY_KIND.COMPANION_RETURN_PASSED).length, 1);
    // 늦게 깨어난 경우에도 내지 않는다(마감을 now 로 당겨 놓은 값이라 실제 마감 시각이 아니다)
    assert.equal(byKind(planNotifications(plan, { nowMs: kst('18:30') }), NOTIFY_KIND.RETURN_PASSED).length, 0);
  });

  test('returnNow 가 false 이면 그대로 낸다', () => {
    const plan = dayPlan({ outings: [outing()], returnNow: false });
    assert.equal(byKind(planNotifications(plan, { nowMs: EARLY }), NOTIFY_KIND.RETURN_PASSED).length, 1);
  });

  test('시점 기본값: returnPassedGraceMin 60', () => {
    assert.equal(DEFAULTS.notifications.returnPassedGraceMin, 60);
  });

  test('마감 뒤 60분 안이면 지난 시각이어도 남고, 60분이 지나면 없다', () => {
    const plan = dayPlan({ outings: [outing()] });
    assert.equal(byKind(planNotifications(plan, { nowMs: kst('18:59') }), NOTIFY_KIND.RETURN_PASSED).length, 1);
    assert.equal(byKind(planNotifications(plan, { nowMs: kst('19:00') }), NOTIFY_KIND.RETURN_PASSED).length, 0);
    assert.equal(byKind(planNotifications(plan, { nowMs: kst('18:59') }), NOTIFY_KIND.RETURN).length, 0);
  });

  test('LATE_NOTIFY_KINDS 는 동결된 두 종류', () => {
    assert.deepEqual([...LATE_NOTIFY_KINDS], [NOTIFY_KIND.RETURN_PASSED, NOTIFY_KIND.COMPANION_RETURN_PASSED]);
    assert.ok(Object.isFrozen(LATE_NOTIFY_KINDS));
  });

  test('보호자: companionDay 의 오늘 by 마다 COMPANION_RETURN_PASSED', () => {
    const items = planNotifications(null, {
      nowMs: EARLY,
      companionDay: { date: DATE, patientReturn: [{ by: '15:30' }, { by: '19:00' }] },
    });
    assert.equal(items.length, 2);
    for (const item of items) {
      assert.equal(item.kind, NOTIFY_KIND.COMPANION_RETURN_PASSED);
      assert.equal(item.key, NOTIFY_TEXT_KEY.COMPANION_RETURN_PASSED);
      assert.deepEqual(Object.keys(item).sort(), [...NOTIFY_ITEM_FIELDS].sort());
    }
    assert.deepEqual(
      items.map((i) => i.id),
      [`${DATE}:COMPANION_RETURN_PASSED:15:30:0`, `${DATE}:COMPANION_RETURN_PASSED:19:00:0`],
    );
    assert.equal(items[0].expiresAt, iso('16:30'));
  });

  test('깨진 by 는 건너뛴다', () => {
    const items = planNotifications(null, {
      nowMs: EARLY,
      companionDay: { date: DATE, patientReturn: [{ by: null }, { by: '25:00' }, { by: '' }, { by: '9:00' }, { by: '10:00' }, null] },
    });
    assert.deepEqual(items.map((i) => i.time), ['10:00']);
    assert.deepEqual(planNotifications(null, { nowMs: EARLY, companionDay: { date: 'x', patientReturn: 'no' } }), []);
  });

  test('같은 시각이면 RETURN_PASSED > COMPANION_RETURN_PASSED > RETURN', () => {
    const companionDay = { date: DATE, patientReturn: [{ by: '18:00' }] };
    const other = outing({ id: 'o2', departAt: '10:00', returnBy: '18:30' });
    const both = planNotifications(dayPlan({ outings: [outing(), other] }), { nowMs: EARLY, companionDay });
    assert.deepEqual(both.filter((i) => i.at === iso('18:00')).map((i) => i.kind), [NOTIFY_KIND.RETURN_PASSED]);
    const noOwn = planNotifications(dayPlan({ outings: [other] }), { nowMs: EARLY, companionDay });
    assert.deepEqual(noOwn.filter((i) => i.at === iso('18:00')).map((i) => i.kind), [NOTIFY_KIND.COMPANION_RETURN_PASSED]);
  });

  test('KST 기준 날짜: companionDay.date 로 계산한다', () => {
    const date = '2026-09-21';
    const [item] = planNotifications(null, {
      nowMs: EARLY,
      companionDay: { date, patientReturn: [{ by: '00:30' }] },
    });
    assert.equal(item.at, iso('00:30', date));
    assert.equal(item.id, `${date}:COMPANION_RETURN_PASSED:00:30:0`);
  });
});

describe('입력이 없거나 깨졌을 때', () => {
  test('일정이 없으면 빈 목록', () => {
    for (const value of [null, undefined, {}, { date: 'nope' }]) {
      assert.deepEqual(planNotifications(value, { nowMs: EARLY }), [], JSON.stringify(value));
    }
  });

  test('형식이 틀린 시각은 건너뛰고 나머지는 만든다', () => {
    const plan = dayPlan({
      outings: [outing({ returnBy: '25:99' }), outing({ id: 'o2', departAt: '10:00', returnBy: '12:00' })],
      blocks: [{ kind: 'APPOINTMENT', start: 'soon', end: '17:00' }],
      medication: [{ time: '8pm', atLodging: true }],
    });
    const items = planNotifications(plan, { nowMs: EARLY });
    assert.deepEqual(
      byKind(items, NOTIFY_KIND.RETURN).map((i) => i.at),
      [iso('11:00'), iso('11:30')],
    );
  });

  test('만료 시각: 목표 시각까지 (그 시각 알림은 10분 여유)', () => {
    const plan = dayPlan({ outings: [outing()], medication: [{ time: '13:00', atLodging: false }] });
    const items = planNotifications(plan, { nowMs: EARLY });
    const away = items.find((i) => i.kind === NOTIFY_KIND.AWAY);
    assert.equal(away.expiresAt, iso('13:10'));
    for (const item of byKind(items, NOTIFY_KIND.RETURN)) assert.equal(item.expiresAt, iso('18:00'));
  });
});

// ── 규칙 47 ───────────────────────────────────────────────────────

/** 잠금 화면에 나오면 안 되는 말: 조건 항목·병원·복약, 환자라는 말 */
const FORBIDDEN = {
  ko: /병원|의원|클리닉|진료|수술|시술|약|복용|투약|처방|조건|보행|걷기|식이|금식|음주|술|매운|날음식|자외선|햇빛|더위|물놀이|수중|동행|보호자|회복|증상|환자/,
  en: /hospital|clinic|doctor|appointment|surgery|procedure|medic|medicine|pill|dose|dosage|drug|prescri|condition|walk|diet|fast(ing)?\b|alcohol|spicy|\braw\b|\buv\b|sun|heat|water|swim|escort|guardian|recover|symptom|treatment|patient/i,
  ja: /病院|医院|クリニック|診察|診療|手術|施術|薬|服用|処方|条件|歩行|食事|断食|飲酒|酒|辛い|生もの|紫外線|暑|水|同行|保護者|回復|症状|通院|患者/,
  zh: /医院|诊所|就诊|门诊|手术|药|服用|处方|条件|步行|饮食|禁食|饮酒|酒|辣|生食|紫外线|高温|水|陪同|监护|恢复|症状|预约|患者/,
};

function everyNamespaceText() {
  const out = [];
  for (const section of ['messages', 'safety']) {
    for (const [key, entry] of Object.entries(notificationsNs[section])) {
      for (const lang of LANGS) out.push({ where: `${section}.${key}.${lang}`, lang, text: entry[lang] });
    }
  }
  return out;
}

describe('규칙 47 — 알림 문구에 조건·병원·복약 정보가 없다', () => {
  const fullPlan = dayPlan({
    outings: [
      outing({ departAt: '10:00', returnBy: '12:00' }),
      outing({ id: 'o2', departAt: '12:30', returnBy: '15:00', returnPlace: 'HOSPITAL', deadlineReason: 'APPOINTMENT' }),
    ],
    blocks: [
      { kind: 'APPOINTMENT', start: '15:00', end: '16:00', appointmentId: `appt-${HOSPITAL_NAME}` },
      { kind: 'APPOINTMENT', start: '18:20', end: '19:00', appointmentId: 'appt-2' },
      { kind: 'MEDICATION', start: '20:00', end: '20:15' },
    ],
    medication: [
      { time: '13:10', atLodging: false },
      { time: '20:00', atLodging: true },
    ],
  });

  const companionDay = { date: DATE, patientReturn: [{ by: '14:00' }] };
  const plansOf = () => planNotifications(fullPlan, { nowMs: EARLY, companionDay });

  test('모든 종류의 알림이 만들어진다 (아래 검사가 빈 목록을 통과하지 않게)', () => {
    const kinds = new Set(plansOf().map((i) => i.kind));
    assert.deepEqual([...kinds].sort(), Object.values(NOTIFY_KIND).sort());
    const keys = new Set(plansOf().map((i) => i.key));
    assert.deepEqual([...keys].sort(), Object.values(NOTIFY_TEXT_KEY).sort());
  });

  test('예약 항목에는 허용 목록 필드만 있고, 일정의 문자열(장소·주소·병원 일정 id·숙소 id)이 없다', () => {
    const items = plansOf();
    assert.deepEqual([...NOTIFY_ITEM_FIELDS].sort(), ['at', 'expiresAt', 'id', 'key', 'kind', 'time']);
    for (const item of items) {
      assert.deepEqual(Object.keys(item).sort(), [...NOTIFY_ITEM_FIELDS].sort());
      assert.match(item.time, /^\d{2}:\d{2}$/);
      const blob = JSON.stringify(item);
      for (const secret of [HOSPITAL_NAME, STOP_TITLE, STOP_ADDRESS, 'appt-', 'lodging-gangnam', '1001', 'CAFE']) {
        assert.ok(!blob.includes(secret), `${secret} 가 예약 항목에 있다: ${blob}`);
      }
    }
  });

  test('모든 언어 · 검수 스위치 켜짐/꺼짐에서 제목과 본문에 금지어가 없고 시각만 들어간다', () => {
    const items = plansOf();
    for (const item of items) {
      for (const lang of LANGS) {
        for (const reviewed of [
          { ja: false, zh: false },
          { ja: true, zh: true },
        ]) {
          const { title, body, lang: bodyLang } = notificationText(item, lang, reviewed);
          assert.ok(LANGS.includes(bodyLang));
          assert.ok(body.includes(item.time), `${lang}: ${body}`);
          assert.ok(!/\{\w+\}/.test(body), `자리표시자가 남았다: ${body}`);
          for (const text of [title, body]) {
            assert.ok(!FORBIDDEN[bodyLang].test(text), `${lang}→${bodyLang} 금지어: ${text}`);
            assert.ok(!FORBIDDEN[lang].test(text), `${lang} 금지어: ${text}`);
            for (const secret of [HOSPITAL_NAME, STOP_TITLE, STOP_ADDRESS]) assert.ok(!text.includes(secret));
          }
        }
      }
    }
  });

  test('notifications 이름공간의 모든 문구(4개 언어)에 금지어가 없다', () => {
    const offenders = everyNamespaceText().filter(({ lang, text }) => FORBIDDEN[lang].test(text));
    assert.deepEqual(
      offenders.map((o) => `${o.where}: ${o.text}`),
      [],
    );
  });

  test('본문 문구의 자리표시자는 {time} 하나뿐이다 — 다른 값을 넣을 자리가 없다', () => {
    for (const key of Object.values(NOTIFY_TEXT_KEY)) {
      for (const lang of LANGS) {
        const text = notificationsNs.safety[key]?.[lang];
        assert.ok(typeof text === 'string' && text.length > 0, `${key}.${lang}`);
        assert.deepEqual(
          [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
          ['time'],
          `${key}.${lang}`,
        );
      }
    }
    for (const lang of LANGS) assert.ok(!/\{\w+\}/.test(translate(NOTIFY_TITLE_KEY, lang)));
  });

  test('본문은 안전 문구(복귀 안내)다 — ja·zh 는 검수 전까지 영어로 나간다', () => {
    const [item] = planNotifications(dayPlan({ outings: [outing()] }), { nowMs: EARLY });
    const off = notificationText(item, 'ja', { ja: false, zh: false });
    assert.equal(off.lang, 'en');
    assert.equal(off.body, translate(item.key, 'en', { time: '18:00' }));
    const on = notificationText(item, 'ja', { ja: true, zh: false });
    assert.equal(on.lang, 'ja');
    assert.equal(notificationText(item, 'ko').body, '18:00까지 숙소로 돌아갈 시간이에요');
  });

  test('항목에 끼어든 다른 필드는 문구에 쓰이지 않는다', () => {
    const [item] = planNotifications(dayPlan({ outings: [outing()] }), { nowMs: EARLY });
    const tampered = { ...item, title: HOSPITAL_NAME, hospitalName: HOSPITAL_NAME, medication: '진통제 2정', time: '18:00' };
    const { title, body } = notificationText(tampered, 'ko');
    assert.ok(!title.includes(HOSPITAL_NAME) && !body.includes(HOSPITAL_NAME));
    assert.ok(!body.includes('진통제'));
  });

  test('형식이 틀린 시각·모르는 문구 키는 문구를 만들지 않는다', () => {
    const [item] = planNotifications(dayPlan({ outings: [outing()] }), { nowMs: EARLY });
    assert.equal(notificationText({ ...item, time: HOSPITAL_NAME }, 'ko'), null);
    assert.equal(notificationText({ ...item, key: 'today.header' }, 'ko'), null);
    assert.equal(notificationText(null, 'ko'), null);
  });
});
