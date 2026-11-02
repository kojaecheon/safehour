// aiIntro 이름공간 — AI 일정 소개 문장의 언어별 대체 템플릿 (AX-303 · AX-309 · spec 4.16)
//
// 언어 기반 작업이 미리 만든 빈 이름공간이다. 해당 화면 작업이 이 파일만 채운다.
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다. 새 키는 `aiIntro.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요
//
// ── 대체 템플릿 (AX-309) ──
//   AI 가 꺼져 있거나, 실패하거나, 시간이 초과되거나, 출력 검사에서 떨어지면 서버
//   (`lib/server/ai-intro.js`)가 이 문장에 그날 정거장 이름을 채워 `source: "TEMPLATE"` 으로 돌려준다.
//   - 화면 t() 로 부르는 문구가 아니라 서버가 채우는 문장이라 messages·safety 가 아닌 `templates` 에 둔다.
//     (화면 사전 UI_TEXT 에 들어가지 않는다. 4개 언어·자리표시자·문자 체계 검사는 test/ai-intro.test.js 가 한다.)
//   - 정거장 수에 따라 고른다: none(0곳) · one(1곳) · two(2곳) · many(3곳 이상, 앞 두 곳 + 전체 수)
//   - 자리표시자: {place1} {place2} = 정거장 이름(요청 순서), {count} = 정거장 수
//   - 판정·안전·영업 여부·가격을 말하지 않는다. AI 출력 검사와 같은 금지 표현 규칙을 통과해야 한다.
//   - 한국어는 이름 받침에 따라 조사가 바뀌지 않도록 '에'로 잇는다(예: '경복궁를' 같은 오류 방지).

/** 일반 화면 문구 — 'aiIntro.키': { ko, en, ja, zh } */
export const messages = {};

/** 안전 문구 — 상태 메시지·사유·고지·복귀 안내 문장 */
export const safety = {};

/** 대체 템플릿 — 경우 → { ko, en, ja, zh } */
export const templates = Object.freeze({
  none: Object.freeze({
    ko: '오늘은 정해진 방문지가 없어요.',
    en: 'No stops are planned for today.',
    ja: '今日は立ち寄り先の予定がありません。',
    zh: '今天没有安排要去的地方。',
  }),
  one: Object.freeze({
    ko: '오늘은 {place1}에 들르는 일정이에요.',
    en: "Today's plan includes a visit to {place1}.",
    ja: '今日は{place1}に立ち寄る予定です。',
    zh: '今天会去{place1}看看。',
  }),
  two: Object.freeze({
    ko: '오늘은 {place1}, {place2}에 들르는 일정이에요.',
    en: "Today's plan includes visits to {place1} and {place2}.",
    ja: '今日は{place1}と{place2}に立ち寄る予定です。',
    zh: '今天的行程会去{place1}和{place2}。',
  }),
  many: Object.freeze({
    ko: '오늘은 {place1}, {place2} 등 {count}곳에 들르는 일정이에요.',
    en: "Today's plan includes {place1}, {place2} and more, {count} stops in all.",
    ja: '今日は{place1}、{place2}など{count}か所に立ち寄る予定です。',
    zh: '今天的行程会去{place1}、{place2}等{count}个地方。',
  }),
});
