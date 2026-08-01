// SafeHour 심사 시연 런북 — 콘솔 버전
// 실행: npm run demo
//
// 발표 핵심: "알림만 띄우는 게 아니라 코스가 실제로 바뀐다"

import { recommend, applyEvent } from '../src/engine/recommend.js';
import { STATE_MESSAGE, REASON_TEXT } from '../src/domain/states.js';
import { createFallbackEstimator } from '../src/adapters/travelTime.js';
import { makeCondition, makePlan, makeCandidates, ROLES } from '../test/fixtures.js';

const C = { r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', red: '\x1b[31m', c: '\x1b[36m', m: '\x1b[35m' };
const hhmm = (d) => d.toTimeString().slice(0, 5);
const travelTime = createFallbackEstimator();

function input(o = {}) {
  return {
    condition: makeCondition(), plan: makePlan({ returnBy: new Date('2026-07-28T14:30:00+09:00') }),
    roles: ROLES.withCompanion, candidates: makeCandidates(), travelTime, ctx: {}, ...o,
  };
}

function printResult(r, label) {
  const msg = STATE_MESSAGE[r.state];
  console.log(`${C.b}${label}${C.r}`);
  console.log(`  상태  ${C.m}${r.state}${C.r} — ${msg.ko}`);
  console.log(`  안내  ${msg.action.ko}`);
  if (r.latestDepartureAt) console.log(`  ${C.y}출발 마감  ${hhmm(r.latestDepartureAt)}${C.r}`);
  if (r.reasons.length) {
    console.log(`  사유  ${r.reasons.map((x) => REASON_TEXT[x]?.ko ?? x).join(' / ')}`);
  }
  if (r.course.length) {
    console.log(`  코스  ${r.course.length}건`);
    for (const c of r.course.slice(0, 3)) {
      const who = c.patient?.ok ? '환자+보호자' : '보호자';
      const stay = c.patient?.ok ? c.patient.stayMin : c.companion.stayMin;
      const shrunk = (c.patient?.shrunk || c.companion?.shrunk) ? `${C.y}(축소)${C.r}` : '';
      console.log(`        · ${c.title} — 편도 ${c.travel.outboundMin}분 / 체류 ${stay}분 ${shrunk} [${who}] 여유 ${c.sla.slackMin}분`);
    }
  } else {
    console.log(`  코스  ${C.red}없음${C.r}`);
  }
  if (r.excluded.length) {
    console.log(`  ${C.d}제외 ${r.excluded.length}건${C.r}`);
    for (const e of r.excluded.slice(0, 4)) {
      console.log(`        ${C.d}× ${e.title} — ${e.reasons.map((x) => REASON_TEXT[x]?.ko ?? x).join(', ')}${C.r}`);
    }
  }
  console.log();
}

function printDelta(d, title) {
  console.log(`${C.c}${'─'.repeat(64)}${C.r}`);
  console.log(`${C.b}${C.c}▶ ${title}${C.r}`);
  console.log(`${C.d}  이벤트: ${JSON.stringify(d.event)}${C.r}\n`);
  console.log(`  ${d.before.state}  →  ${d.after.state}  ${d.delta.stateChanged ? C.y + '(상태 변경)' + C.r : C.d + '(상태 유지)' + C.r}`);
  if (d.delta.removed.length) console.log(`  ${C.red}제거${C.r}  ${d.delta.removed.join(', ')}`);
  if (d.delta.shortened.length) {
    for (const s of d.delta.shortened) console.log(`  ${C.y}축소${C.r}  ${s.id}: 체류 ${s.beforeStayMin}분 → ${s.afterStayMin}분`);
  }
  if (d.delta.added.length) console.log(`  ${C.g}대체${C.r}  ${d.delta.added.join(', ')}`);
  for (const e of d.delta.newlyExcluded) {
    console.log(`  ${C.d}사유  ${e.title}: ${e.reasons.map((x) => REASON_TEXT[x]?.ko ?? x).join(', ')}${C.r}`);
  }
  const verdict = d.delta.hasVisibleChange ? `${C.g}✔ 실제 변화 발생${C.r}` : `${C.red}✘ 변화 없음 (과제1 증명 실패)${C.r}`;
  console.log(`  판정  ${verdict}\n`);
}

console.log(`\n${C.b}════ SafeHour 판정 엔진 시연 ════${C.r}`);
console.log(`${C.d}기준: 강남 기준점 · 13:00 현재 · 14:30 병원 복귀${C.r}\n`);

// 초기 상태
printResult(recommend(input()), '① 초기 추천');

// 시연 순서 (사업계획서 17.1 런북)
printDelta(applyEvent(input(), { type: 'APPOINTMENT', deltaMin: -30 }),
  '② 병원 호출 30분 앞당겨짐');

printDelta(applyEvent(input({ condition: makeCondition({ avoidUv: false }) }),
  { type: 'WEATHER', weather: { outdoorUnsafe: true, reasons: ['강수확률 80%'] } }),
  '③ 폭우 예보 — 실외 후보 제거');

printDelta(applyEvent(input(), { type: 'TRAFFIC_SURGE', extraMin: 40 }),
  '④ 교통 급증 — 복귀 SLA 재계산');

printDelta(applyEvent(input({ roles: ROLES.companionOnly }), { type: 'PATIENT_RECALL' }),
  '⑤ 환자 호출 — 즉시 복귀');

printResult(recommend(input({ condition: makeCondition({ outingAllowed: false }) })),
  '⑥ 병원이 외출 금지 — 관광 불가도 정상 결과');

console.log(`${C.b}핵심 메시지${C.r}`);
console.log(`  일반 관광서비스는 인기 있는 장소를 알려줍니다.`);
console.log(`  ${C.b}SafeHour는 지금 이 환자가 병원 일정에 맞춰 돌아올 수 있는지를 먼저 계산합니다.${C.r}\n`);
