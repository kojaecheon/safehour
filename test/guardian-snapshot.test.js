// 보호자 스냅샷 — 허용 목록 조립과 만료 (AX-313 · spec 4.11, 5.4, 규칙 37)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMERGENCY_NUMBERS,
  GUARDIAN_ERROR,
  GUARDIAN_SNAPSHOT_VERSION,
  HOSPITAL_RETURN_LABEL,
  buildGuardianSnapshot,
  isSnapshotExpired,
  normalizeGuardianSnapshot,
} from '../src/guardian/index.js';
import { deepFreeze } from './stay-fixtures.js';
import {
  ALLOWED_SNAPSHOT_KEYS,
  FORBIDDEN_MARK,
  GUARDIAN_STOP_KEYS,
  HOSPITAL_LAT,
  HOSPITAL_LNG,
  collectKeys,
  guardianOuting,
  makeDayPlan,
  makeGuardianStay,
  makeTripPlan,
} from './guardian-fixtures.js';

const NOW = '2026-10-01T09:30:00+09:00';

function build(overrides = {}) {
  return buildGuardianSnapshot({
    stay: makeGuardianStay(),
    tripPlan: makeTripPlan(),
    now: NOW,
    lang: 'en',
    ...overrides,
  });
}

function day(snapshot, date) {
  return snapshot.days.find((d) => d.date === date);
}

describe('스냅샷 모양 (spec 5.4)', () => {
  test('머리 필드: v, 만든 시각, 만료 시각(출국일 23:59 KST), 언어, 긴급 번호', () => {
    const s = build();
    assert.equal(s.v, 1);
    assert.equal(GUARDIAN_SNAPSHOT_VERSION, 1);
    assert.equal(s.createdAt, '2026-10-01T09:30:00+09:00');
    assert.equal(s.expiresAt, '2026-10-08T23:59:00+09:00');
    assert.equal(s.lang, 'en');
    assert.deepEqual(s.emergency, ['119', '1330']);
    assert.deepEqual(EMERGENCY_NUMBERS, ['119', '1330']);
    assert.deepEqual(Object.keys(s).sort(), ['createdAt', 'days', 'emergency', 'expiresAt', 'lang', 'v']);
  });

  test('now 는 Date·밀리초·ISO 문자열을 모두 받고, 시간대 없는 문자열은 KST 로 읽는다', () => {
    const ms = Date.parse('2026-10-01T00:30:00Z');
    assert.equal(build({ now: ms }).createdAt, '2026-10-01T09:30:00+09:00');
    assert.equal(build({ now: new Date(ms) }).createdAt, '2026-10-01T09:30:00+09:00');
    assert.equal(build({ now: '2026-10-01T09:30:00' }).createdAt, '2026-10-01T09:30:00+09:00');
    assert.throws(() => build({ now: 'not-a-date' }), TypeError);
  });

  test('언어를 넘기지 않으면 일정 언어를 쓰고, 지원하지 않는 언어는 거부한다', () => {
    assert.equal(build({ lang: undefined }).lang, 'ko');
    for (const lang of ['ko', 'en', 'ja', 'zh']) assert.equal(build({ lang }).lang, lang);
    assert.throws(() => build({ lang: 'fr' }), TypeError);
  });

  test('입국일에 만들면 체류 날짜(입국일~출국일)를 날짜 순으로 모두 담는다', () => {
    const s = build();
    assert.deepEqual(
      s.days.map((d) => d.date),
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'],
    );
    assert.equal(day(s, '2026-09-20'), undefined, '체류 밖 날짜는 담지 않는다');
    for (const d of s.days) {
      assert.deepEqual(Object.keys(d).sort(), ['date', 'escortRequired', 'guardianOutings', 'guardianSoloAllowed', 'patientReturn']);
    }
  });

  test('만든 날(KST)부터 출국일까지만 담는다 — 지난 날은 담지 않는다', () => {
    const dates = (now) => build({ now }).days.map((d) => d.date);
    assert.deepEqual(dates('2026-10-04T08:00:00+09:00'), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
    assert.deepEqual(dates('2026-10-04T23:59:00+09:00'), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
    // UTC 로는 10-03 이지만 KST 로는 10-04 00:30 이다
    assert.deepEqual(dates('2026-10-03T15:30:00Z'), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
    assert.deepEqual(dates('2026-10-08T12:00:00+09:00'), ['2026-10-08']);
  });

  test('입국 전에 만들면 모든 체류 날짜, 출국일이 지나서 만들면 날짜가 없다', () => {
    assert.equal(build({ now: '2026-09-25T10:00:00+09:00' }).days.length, 8);
    assert.deepEqual(build({ now: '2026-10-09T10:00:00+09:00' }).days, []);
  });

  test('체류·일정이 없거나 형식이 틀리면 TypeError', () => {
    assert.throws(() => buildGuardianSnapshot({ tripPlan: makeTripPlan(), now: NOW }), TypeError);
    assert.throws(() => buildGuardianSnapshot({ stay: makeGuardianStay(), now: NOW }), TypeError);
    assert.throws(
      () => build({ stay: makeGuardianStay({ departure: { date: '2026-13-40', time: '18:00', airport: 'ICN' } }) }),
      TypeError,
    );
  });

  test('입력을 바꾸지 않고, 같은 입력이면 같은 결과다', () => {
    const stay = deepFreeze(makeGuardianStay());
    const tripPlan = deepFreeze(makeTripPlan());
    const a = buildGuardianSnapshot({ stay, tripPlan, now: NOW, lang: 'ja' });
    const b = buildGuardianSnapshot({ stay, tripPlan, now: NOW, lang: 'ja' });
    assert.deepEqual(a, b);
  });

  test('결과는 입력과 객체를 공유하지 않는다', () => {
    const tripPlan = makeTripPlan();
    const s = build({ tripPlan });
    const stop = day(s, '2026-10-04').guardianOutings[0].stops[0];
    stop.ko.title = 'changed';
    assert.equal(tripPlan.days['2026-10-04'].guardianOutings[0].stops[0].ko.title, '가상 장소 g1');
  });
});

describe('규칙 37 — 금지 정보는 구조적으로 들어갈 수 없다', () => {
  test('입력에 금지 정보가 가득해도 결과 JSON 에 하나도 없다', () => {
    const json = JSON.stringify(build());
    assert.equal(json.includes(FORBIDDEN_MARK), false, `금지 표지가 새어 나갔다: ${json.match(/FORBIDDEN_[A-Z_0-9]+/g)}`);
    assert.equal(json.includes(String(HOSPITAL_LAT)), false, '병원 좌표');
    assert.equal(json.includes(String(HOSPITAL_LNG)), false, '병원 좌표');
  });

  test('허용 목록 밖의 키가 하나도 없다', () => {
    const keys = collectKeys(build());
    const extra = [...keys].filter((k) => !ALLOWED_SNAPSHOT_KEYS.has(k));
    assert.deepEqual(extra, []);
  });

  test('식이·복약·보행·자외선·열·물·병원·안내문·병원 일정 필드가 없다', () => {
    const keys = collectKeys(build());
    for (const forbidden of [
      'diet',
      'medication',
      'walkLimit',
      'travelLimit',
      'avoidUv',
      'avoidHeat',
      'avoidWater',
      'mealRestriction',
      'mealSlots',
      'effective',
      'provenance',
      'blocks',
      'hospital',
      'hospitals',
      'hospitalId',
      'hospitalName',
      'hospitalAddress',
      'phone',
      'instructions',
      'appointments',
      'appointmentId',
      'periods',
      'linkedPlans',
      'deadlineReason',
      'reasons',
      'warnings',
      'excluded',
      'intro',
      'delta',
      'image',
      'candidateId',
      'contentId',
      'sourceIds',
      'contentTypeIds',
      'pinned',
    ]) {
      assert.equal(keys.has(forbidden), false, `금지 필드 ${forbidden}`);
    }
  });

  test('보호자 외출에 마감 이유가 없고, 마감 이유 값도 어디에도 없다', () => {
    const s = build();
    const outings = s.days.flatMap((d) => d.guardianOutings);
    assert.ok(outings.length > 0);
    for (const o of outings) assert.equal('deadlineReason' in o, false);
    const json = JSON.stringify(s);
    for (const code of ['RETURN_TIME', 'MEDICATION', 'APPOINTMENT', 'DAY_END', 'DEPARTURE', 'PATIENT_SCHEDULE']) {
      assert.equal(json.includes(`"${code}"`), false, `마감 이유 ${code}`);
    }
  });

  test('보호자 외출 정거장은 필요한 필드만 가진다 — 라벨(식이 신호 포함)·보행·실내·식사 표시가 없다', () => {
    const stops = build().days.flatMap((d) => d.guardianOutings.flatMap((o) => o.stops));
    assert.ok(stops.length > 0);
    for (const stop of stops) assert.deepEqual(Object.keys(stop).sort(), GUARDIAN_STOP_KEYS);
    const json = JSON.stringify(build());
    for (const code of ['DIET_ESTIMATED', 'ORDER_CARD', 'labels', 'walkBurdenMin', 'isMeal', 'indoor', 'legIn']) {
      assert.equal(json.includes(code), false, code);
    }
  });

  test('환자 외출의 정거장은 담지 않는다 — 환자 쪽은 복귀 마감과 장소뿐이다', () => {
    const d = day(build(), '2026-10-04');
    assert.equal(JSON.stringify(d).includes('가상 장소 p1'), false);
  });

  test('보호자 외출 id 는 입력 id 를 옮기지 않고 날짜·순번으로 새로 만든다', () => {
    const [o] = day(build(), '2026-10-04').guardianOutings;
    assert.equal(o.id, '2026-10-04:G:1');
  });
});

describe('환자 복귀 (spec 4.11)', () => {
  test('숙소 복귀는 그날 숙소 이름·도로명주소, 병원 복귀는 일반 라벨 "병원" + 주소 없음', () => {
    const d = day(build(), '2026-10-04');
    assert.deepEqual(d.patientReturn, [
      { by: '12:30', placeName: '가상 숙소 하나', placeAddress: '숙소로 1' },
      { by: '17:20', placeName: '병원', placeAddress: null },
    ]);
    assert.equal(HOSPITAL_RETURN_LABEL, '병원');
  });

  test('일정 언어와 상관없이 병원 라벨은 같다(화면이 번역한다)', () => {
    for (const lang of ['ko', 'en', 'ja', 'zh']) {
      const d = day(build({ lang }), '2026-10-04');
      assert.equal(d.patientReturn[1].placeName, HOSPITAL_RETURN_LABEL);
      assert.equal(d.patientReturn[1].placeAddress, null);
    }
  });

  test('숙소 복귀 장소는 일정의 lodgingId, 없으면 그날 숙소로 찾는다', () => {
    const s = build();
    assert.equal(day(s, '2026-10-06').patientReturn[0].placeName, '가상 숙소 둘');
    const tripPlan = makeTripPlan();
    delete tripPlan.days['2026-10-06'].lodgingId;
    assert.equal(day(build({ tripPlan }), '2026-10-06').patientReturn[0].placeName, '가상 숙소 둘');
  });

  test('모르는 복귀 장소 값은 병원 라벨로 다룬다 — 주소를 추측해 담지 않는다', () => {
    const tripPlan = makeTripPlan();
    tripPlan.days['2026-10-04'].outings[0].returnPlace = 'SOMEWHERE';
    assert.deepEqual(day(build({ tripPlan }), '2026-10-04').patientReturn[0], {
      by: '12:30',
      placeName: '병원',
      placeAddress: null,
    });
  });

  test('복귀 시각 형식이 틀린 외출은 복귀 항목을 만들지 않는다', () => {
    const tripPlan = makeTripPlan();
    tripPlan.days['2026-10-04'].outings[0].returnBy = '25:00';
    assert.equal(day(build({ tripPlan }), '2026-10-04').patientReturn.length, 1);
  });

  test('환자 외출이 없는 날은 복귀 항목이 비어 있다', () => {
    assert.deepEqual(day(build(), '2026-10-05').patientReturn, []);
  });
});

describe('동행 필요 · 보호자 단독 외출 가능 (spec 4.7 보호자 일정 조건)', () => {
  test('조건이 모두 "아니오"이고 동반 보호자가 있으면 동행 불필요 · 단독 외출 가능', () => {
    const d = day(build(), '2026-10-04');
    assert.equal(d.escortRequired, false);
    assert.equal(d.guardianSoloAllowed, true);
  });

  test('동행 필요 = 예이면 단독 외출 불가', () => {
    const d = day(build(), '2026-10-05');
    assert.equal(d.escortRequired, true);
    assert.equal(d.guardianSoloAllowed, false);
  });

  test('곁을 지켜야 함 = 예이면 단독 외출 불가', () => {
    const d = day(build(), '2026-10-06');
    assert.equal(d.escortRequired, false);
    assert.equal(d.guardianSoloAllowed, false);
  });

  test('동반 보호자가 없으면 단독 외출 불가', () => {
    const d = day(build({ stay: makeGuardianStay({ hasCompanion: false }) }), '2026-10-04');
    assert.equal(d.guardianSoloAllowed, false);
  });

  test('FREE 날(적용 기간 없음)은 제한이 없다', () => {
    const d = day(build(), '2026-10-01');
    assert.equal(d.escortRequired, false);
    assert.equal(d.guardianSoloAllowed, true);
    assert.deepEqual(d.patientReturn, [{ by: '16:00', placeName: '가상 숙소 하나', placeAddress: '숙소로 1' }]);
  });

  test('조건을 모르는 날(NEEDS_INPUT, 일정 없음)은 가장 엄격한 값이다 — 모르는 것을 허용으로 바꾸지 않는다', () => {
    const s = build();
    for (const date of ['2026-10-02', '2026-10-03', '2026-10-07', '2026-10-08']) {
      const d = day(s, date);
      assert.equal(d.escortRequired, true, date);
      assert.equal(d.guardianSoloAllowed, false, date);
      assert.deepEqual(d.patientReturn, [], date);
      assert.deepEqual(d.guardianOutings, [], date);
    }
  });

  test('항목 값이 "모르겠음"으로 남아 있어도 엄격한 값이다', () => {
    const tripPlan = makeTripPlan();
    tripPlan.days['2026-10-04'].effective.escortRequired.value = { kind: 'UNKNOWN' };
    const d = day(build({ tripPlan }), '2026-10-04');
    assert.equal(d.escortRequired, true);
    assert.equal(d.guardianSoloAllowed, false);
  });
});

describe('보호자 외출 (Outing − deadlineReason)', () => {
  test('허용 필드만 옮기고 정거장은 이미지·내부 id 를 뺀다', () => {
    const [o] = day(build(), '2026-10-04').guardianOutings;
    assert.deepEqual(o, {
      id: '2026-10-04:G:1',
      departAt: '13:20',
      returnBy: '15:30',
      returnPlace: 'LODGING',
      latestDepartureAt: '13:30',
      slackMin: 12,
      walkTotalMin: 8,
      travelTotalMin: 20,
      stops: [
        {
          title: '가상 장소 g1',
          address: '가상 관광로 g1',
          ko: { title: '가상 장소 g1', address: '가상 관광로 g1' },
          lat: 37.501,
          lng: 127.031,
          arriveAt: '13:40',
          leaveAt: '14:40',
          category: 'CAFE',
        },
        {
          title: '가상 장소 g2',
          address: '가상 관광로 g2',
          ko: { title: '가상 장소 g2', address: '가상 관광로 g2' },
          lat: 37.501,
          lng: 127.031,
          arriveAt: '14:50',
          leaveAt: '15:05',
          category: 'RESTAURANT',
        },
      ],
    });
  });

  test('한국어 원문이 없는 정거장에는 ko 가 없다', () => {
    const tripPlan = makeTripPlan();
    tripPlan.days['2026-10-04'].guardianOutings[0].stops[0].ko = null;
    tripPlan.days['2026-10-04'].guardianOutings[0].stops[1].ko = { title: 42 };
    const [a, b] = day(build({ tripPlan }), '2026-10-04').guardianOutings[0].stops;
    assert.equal('ko' in a, false);
    assert.equal('ko' in b, false);
  });

  test('형식이 틀린 값은 옮기지 않는다(문자열 자리에 객체, 숫자 자리에 문자열)', () => {
    const tripPlan = makeTripPlan();
    const stop = tripPlan.days['2026-10-04'].guardianOutings[0].stops[0];
    stop.title = { hospital: 'FORBIDDEN_HOSPITAL_NAME' };
    stop.lat = 'FORBIDDEN_LAT';
    stop.category = ['FORBIDDEN_CATEGORY'];
    stop.arriveAt = '9:99';
    const s = build({ tripPlan });
    const out = day(s, '2026-10-04').guardianOutings[0].stops[0];
    assert.equal(out.title, null);
    assert.equal(out.lat, null);
    assert.equal(out.category, null);
    assert.equal(out.arriveAt, null);
    assert.equal(JSON.stringify(s).includes(FORBIDDEN_MARK), false);
  });

  test('단독 외출이 불가한 날에 보호자 외출이 들어와도 담지 않는다 — 스냅샷이 스스로 모순되지 않게', () => {
    const tripPlan = makeTripPlan();
    tripPlan.days['2026-10-05'].guardianOutings = [guardianOuting('2026-10-05')];
    tripPlan.days['2026-10-06'].guardianOutings = [guardianOuting('2026-10-06')];
    const s = build({ tripPlan });
    assert.deepEqual(day(s, '2026-10-05').guardianOutings, []);
    assert.deepEqual(day(s, '2026-10-06').guardianOutings, []);
  });

  test('여러 보호자 외출은 순서대로 순번 id 를 받는다', () => {
    const tripPlan = makeTripPlan();
    tripPlan.days['2026-10-06'] = makeDayPlan('2026-10-06', {
      lodgingId: 'L2',
      guardianOutings: [guardianOuting('2026-10-06'), guardianOuting('2026-10-06', { departAt: '16:00', returnBy: '17:00' })],
    });
    const d = day(build({ tripPlan }), '2026-10-06');
    assert.deepEqual(
      d.guardianOutings.map((o) => [o.id, o.departAt]),
      [
        ['2026-10-06:G:1', '13:20'],
        ['2026-10-06:G:2', '16:00'],
      ],
    );
  });
});

describe('스냅샷 정규화 (암호화 전·복호화 후 허용 목록 재적용)', () => {
  test('만든 스냅샷은 정규화해도 그대로다', () => {
    const s = build();
    assert.deepEqual(normalizeGuardianSnapshot(s), s);
  });

  test('손으로 만든 스냅샷에 섞인 필드는 버리고, 병원 라벨이면 주소를 비운다', () => {
    const s = build();
    s.hospital = { name: 'FORBIDDEN_HOSPITAL_NAME' };
    s.emergency = ['112', 'FORBIDDEN_NUMBER'];
    s.days[3].diet = { spicy: true };
    s.days[3].patientReturn[1].placeAddress = 'FORBIDDEN_HOSPITAL_ADDRESS';
    s.days[3].guardianOutings[0].deadlineReason = 'MEDICATION';
    s.days[3].guardianOutings[0].stops[0].image = { url: 'FORBIDDEN_IMAGE' };
    const n = normalizeGuardianSnapshot(s);
    const json = JSON.stringify(n);
    assert.equal(json.includes(FORBIDDEN_MARK), false);
    assert.deepEqual(n.emergency, ['119', '1330']);
    assert.equal(n.days[3].patientReturn[1].placeAddress, null);
    assert.equal(json.includes('"MEDICATION"'), false);
    assert.deepEqual([...collectKeys(n)].filter((k) => !ALLOWED_SNAPSHOT_KEYS.has(k)), []);
  });

  test('만든 날(KST)보다 이른 날짜는 정규화에서도 버린다', () => {
    const s = build();
    s.createdAt = '2026-10-04T08:00:00+09:00';
    assert.deepEqual(
      normalizeGuardianSnapshot(s).days.map((d) => d.date),
      ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'],
    );
  });

  test('동행 필요·단독 외출 값이 불리언이 아니면 엄격한 쪽으로 읽는다', () => {
    const s = build();
    s.days[3].escortRequired = 'no';
    s.days[3].guardianSoloAllowed = 'yes';
    const n = normalizeGuardianSnapshot(s);
    assert.equal(n.days[3].escortRequired, true);
    assert.equal(n.days[3].guardianSoloAllowed, false);
  });

  test('버전·시각·언어·날짜 형식이 틀리면 INVALID_SNAPSHOT', () => {
    const bad = [
      { ...build(), v: 2 },
      { ...build(), expiresAt: 'soon' },
      { ...build(), createdAt: undefined },
      { ...build(), lang: 'fr' },
      { ...build(), days: 'x' },
      { ...build(), days: [{ date: '2026-02-30' }] },
      null,
      'string',
    ];
    for (const value of bad) {
      assert.throws(
        () => normalizeGuardianSnapshot(value),
        (err) => err.code === GUARDIAN_ERROR.INVALID_SNAPSHOT,
      );
    }
  });
});

describe('만료 (규칙 37)', () => {
  test('출국일 23:59 KST 부터 만료다', () => {
    const s = build();
    assert.equal(isSnapshotExpired(s, '2026-10-08T23:58:59+09:00'), false);
    assert.equal(isSnapshotExpired(s, '2026-10-08T23:59:00+09:00'), true);
    assert.equal(isSnapshotExpired(s, '2026-10-09T08:00:00+09:00'), true);
    assert.equal(isSnapshotExpired(s, Date.parse('2026-10-08T14:58:00Z')), false);
    assert.equal(isSnapshotExpired(s, new Date('2026-10-08T15:00:00Z')), true);
  });

  test('만료 시각을 읽을 수 없으면 만료로 본다(보여 주지 않는 쪽)', () => {
    assert.equal(isSnapshotExpired({ expiresAt: 'soon' }, NOW), true);
    assert.equal(isSnapshotExpired({}, NOW), true);
    assert.equal(isSnapshotExpired(null, NOW), true);
  });

  test('now 형식이 틀리면 TypeError', () => {
    assert.throws(() => isSnapshotExpired(build(), 'yesterday'), TypeError);
  });
});
