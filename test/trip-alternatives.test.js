// AX-307: 교체 후보 (docs/business-rules.md '사용자 편집'의 교체, docs/contracts.md '`POST /api/itinerary/alternatives`' 요청)
//
// docs/business-rules.md '사용자 편집'(테스트 이름의 규칙 33 은 옛 설계서 번호다): 교체 후보는 최대 5개이고, 각 후보를 넣은 외출이 모든 검증을 통과한다.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { alternativesFor, previewSwap } from '../src/engine/alternatives.js';
import { planTrip } from '../src/engine/tripPlan.js';
import { DEFAULTS } from '../src/stay/index.js';
import {
  AIRPORT_TRAVEL,
  SET,
  at,
  byLodging,
  contentIdsOf,
  mins,
  plus,
  requiredMin,
  tripPool,
  tripStay,
} from './trip-fixtures.js';

const DATE = '2026-10-07';
const NOW = at('2026-10-06', '08:00');
const WALK_LIMIT = 45;
const TRAVEL_LIMIT = 15;

const s = tripStay({ walkLimit: SET(WALK_LIMIT), travelLimit: SET(TRAVEL_LIMIT) }, { pace: 'NORMAL' });
// 그날 두 역할의 장소와 다른 날짜의 장소가 모두 빠지므로 후보가 넉넉해야 한다
const pool = tripPool('en', 120);
const base = planTrip({ stay: s, candidatesByLodging: byLodging(pool), airportTravel: AIRPORT_TRAVEL, lang: 'en', now: NOW });
const day = base.days[DATE];
const usedElsewhere = Object.entries(base.days)
  .filter(([date]) => date !== DATE)
  .flatMap(([, d]) => contentIdsOf(d));

const input = (outing, stop, extra = {}) => ({
  stay: s,
  date: DATE,
  day,
  outingId: outing.id,
  stopId: stop.id,
  candidatesByLodging: byLodging(pool),
  airportTravel: AIRPORT_TRAVEL,
  usedContentIds: usedElsewhere,
  now: NOW,
  ...extra,
});

/** 외출 하나가 docs/business-rules.md '하루 일정 생성'의 검증을 모두 통과하는가 */
function assertOutingValid(o, { recovery }) {
  const req = requiredMin(o, { recovery });
  assert.equal(mins(o.returnBy) - mins(o.departAt) - req, o.slackMin, `${o.id} slack`);
  assert.ok(o.slackMin >= 0, '복귀 계산식');
  assert.ok(mins(o.plannedReturnAt) <= mins(o.returnBy));
  const walk = o.stops.reduce((sum, x) => sum + x.walkBurdenMin + (x.legIn.mode === 'WALK' ? x.legIn.min : 0), 0);
  assert.ok(walk <= o.walkTotalMin && o.walkTotalMin <= WALK_LIMIT, '보행 누적');
  const back = o.travelTotalMin - o.stops.reduce((sum, x) => sum + x.legIn.min, 0);
  for (const leg of [...o.stops.map((x) => x.legIn.min), back]) assert.ok(leg <= TRAVEL_LIMIT, '이동 한도');
  for (const x of o.stops) assert.ok(x.stayMin >= DEFAULTS.minStopStayMin);
}

describe('규칙 33 — 교체 후보', () => {
  const outing = day.outings.find((o) => o.stops.some((x) => !x.isMeal));
  const stop = outing.stops.find((x) => !x.isMeal);

  test('최대 5개이고, 각 후보를 넣은 외출이 복귀 계산·보행 누적·이동 한도를 모두 통과한다', () => {
    const alternatives = alternativesFor(input(outing, stop));
    assert.ok(alternatives.length >= 1 && alternatives.length <= 5, `${alternatives.length}개`);
    const index = outing.stops.findIndex((x) => x.id === stop.id);
    for (const { stop: alt, outingPreview } of alternatives) {
      assert.equal(outingPreview.id, outing.id);
      assert.equal(outingPreview.stops[index].contentId, alt.contentId, '같은 자리에 넣는다');
      assert.equal(alt.pinned, true, "교체한 장소는 '고정'");
      assert.equal(alt.id, `${DATE}:P:${alt.contentId}`);
      assert.equal(alt.isMeal, false);
      assertOutingValid(outingPreview, { recovery: true });
    }
    assert.equal(new Set(alternatives.map((a) => a.stop.contentId)).size, alternatives.length);
  });

  test('그날 이미 있는 장소(환자·보호자)와 다른 날짜에 배치된 장소는 후보가 아니다 — 고정한 장소는 예외', () => {
    const alternatives = alternativesFor(input(outing, stop));
    const inDay = [...day.outings, ...day.guardianOutings].flatMap((o) => o.stops.map((x) => x.contentId));
    for (const { stop: alt } of alternatives) {
      assert.ok(!inDay.includes(alt.contentId));
      assert.ok(!usedElsewhere.includes(alt.contentId));
    }
    // 다른 날짜에 배치된 일반 장소 중 이 자리에 맞는 것을 고정한다
    const pinnedEdits = (id) => ({ edits: { [DATE]: { pinned: [id], deleted: [], clearedMeals: [] } } });
    const favourite = usedElsewhere.find(
      (id) =>
        pool.find((c) => c.stop.contentId === id && c.signals.isFoodPlace !== true) &&
        previewSwap({ ...input(outing, stop, pinnedEdits(id)), contentId: id }).ok,
    );
    assert.ok(favourite, '맞는 고정 후보가 있다');
    const pinned = alternativesFor(input(outing, stop, pinnedEdits(favourite)));
    assert.equal(pinned[0]?.stop.contentId, favourite, '고정 장소는 다른 날짜에 있어도 먼저 나온다');
  });

  test('같은 입력이면 같은 후보가 같은 순서로 나온다', () => {
    assert.deepEqual(alternativesFor(input(outing, stop)), alternativesFor(input(outing, stop)));
  });

  test('식사 칸 식당의 교체 후보는 식사 칸 시간에 도착하는 식당뿐이다(카페 제외)', () => {
    const mealOuting = day.outings.find((o) => o.stops.some((x) => x.isMeal));
    assert.ok(mealOuting, '식사 칸 외출이 있다');
    const meal = mealOuting.stops.find((x) => x.isMeal);
    const slot = day.mealSlots.find((m) => m.stopId === meal.id).slot;
    const window = DEFAULTS.mealSlots[slot];
    const alternatives = alternativesFor(input(mealOuting, meal));
    assert.ok(alternatives.length >= 1);
    for (const { stop: alt, outingPreview } of alternatives) {
      assert.equal(alt.category, 'FOOD');
      assert.equal(alt.isMeal, true);
      assert.ok(mins(alt.arriveAt) >= mins(window.start) && mins(alt.arriveAt) <= mins(window.end) - 15);
      assertOutingValid(outingPreview, { recovery: true });
    }
  });

  test('지난 날짜와 이미 도착한 정거장은 교체할 수 없다', () => {
    assert.deepEqual(alternativesFor(input(outing, stop, { now: at('2026-10-08', '08:00') })), []);
    const started = at(DATE, plus(stop.arriveAt, 1));
    assert.deepEqual(alternativesFor(input(outing, stop, { now: started })), []);
  });

  test('없는 외출·정거장이면 RangeError', () => {
    assert.throws(() => alternativesFor({ ...input(outing, stop), outingId: 'nope' }), RangeError);
    assert.throws(() => alternativesFor({ ...input(outing, stop), stopId: 'nope' }), RangeError);
  });
});

describe('previewSwap — 고른 후보를 넣은 외출 전체를 다시 검증한다', () => {
  const outing = day.outings.find((o) => o.stops.some((x) => !x.isMeal));
  const stop = outing.stops.find((x) => !x.isMeal);

  test('통과하면 외출 미리보기를 돌려준다', () => {
    const [first] = alternativesFor(input(outing, stop));
    const result = previewSwap({ ...input(outing, stop), contentId: first.stop.contentId });
    assert.equal(result.ok, true);
    assert.deepEqual(result.outingPreview, first.outingPreview);
  });

  test('통과하지 못하면 넣지 않고 이유를 돌려준다', () => {
    const elsewhere = usedElsewhere[0];
    const result = previewSwap({ ...input(outing, stop), contentId: elsewhere });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.length > 0);
    const unknown = previewSwap({ ...input(outing, stop), contentId: 'no-such-place' });
    assert.equal(unknown.ok, false);
    assert.deepEqual(unknown.reasons, ['NO_CANDIDATE']);
  });
});
