// 운영·휴무 원문에서 **닫힘 근거만** 읽는다 (D07-POL004, SIGNOFF 5.3).
//
// 원칙: "지금 영업 중" 은 절대 단정하지 않는다.
// TourAPI 의 운영시간은 자유 텍스트다. 실데이터를 보면 이렇다.
//
//   "10:30~22:00<br>※ 일부 영업시간이 다른 매장이 있음<br>※ 행사로 인해 영업시간이 변경되는 경우가 있음"
//   "N/A (Open all year around)"
//
// 이런 문장에서 영업 여부를 추정하면 회복기 환자를 닫힌 곳으로 보낼 수 있고,
// 그것은 "확인되지 않은 정보를 사실처럼 표시하지 않는다" 위반이다.
//
// 반대로 **닫혀 있다는 근거가 명백한 경우**는 다르다. 그때 후보에서 빼는 것은
// 안전한 방향이고, 판정하지 않으면 헛걸음을 그대로 방치하는 것이다.
// 그래서 다음 둘만 읽는다.
//
//   1. 행사 기간 (eventstartdate·eventenddate) — `YYYYMMDD` 구조화 필드라 해석 여지가 없다
//   2. 정기 휴무 요일 ("매주 월요일 휴무") — 오늘 요일과 정확히 맞을 때만
//
// 어느 쪽도 확실하지 않으면 `closed: false` 를 돌려준다. 이것은 "열려 있다" 가
// **아니라** "닫혔다는 근거가 없다" 는 뜻이다. 호출부는 이때 openNow 를 null 로 둔다.

const KST_OFFSET_MS = 9 * 3600_000;

/** 휴무 여부를 읽을 자유 텍스트 필드 */
const CLOSURE_TEXT_FIELDS = Object.freeze([
  "restdate",
  "restdateculture",
  "restdateleports",
  "restdatefood",
  "restdateshopping",
]);

/** 이 말이 있으면 정기 휴무가 없다는 뜻이다 — 요일 탐색을 하지 않는다 */
const ALWAYS_OPEN = /연중\s*무휴|무휴|없음|해당\s*없음|N\s*\/\s*A|open\s+all\s+year|no\s+closing\s+day/i;

/** 휴무를 뜻하는 말. 이 말이 없으면 요일이 보여도 휴무로 읽지 않는다 */
const CLOSURE_WORD = /휴무|휴관|휴점|정기휴|쉬는\s*날|closed/i;

/** 주기가 불규칙하면 오늘 닫혔는지 알 수 없다 — 손대지 않는다 */
const IRREGULAR = /격주|부정기|수시|비정기|사정에\s*따라|공휴일/;

const WEEKDAYS = Object.freeze(["일", "월", "화", "수", "목", "금", "토"]);
const WEEKDAY_CLASS = "[일월화수목금토]";

/** HTML 조각과 공백을 걷어낸 평문 */
function plainText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** now 의 KST 기준 요일 인덱스 (0=일) 와 YYYYMMDD */
function kstParts(now) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    weekday: kst.getUTCDay(),
    yyyymmdd: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
  };
}

function isYyyymmdd(value) {
  return /^\d{8}$/.test(String(value ?? "").trim());
}

/**
 * 행사 기간 밖인가. `eventstartdate`·`eventenddate` 는 구조화된 날짜라
 * 해석 여지가 없다 — 끝난 축제를 추천하는 것이 가장 흔한 헛걸음이다.
 */
function readEventWindow(schedule, today) {
  const start = String(schedule.eventstartdate ?? "").trim();
  const end = String(schedule.eventenddate ?? "").trim();

  if (isYyyymmdd(end) && today > end) {
    return { closed: true, reason: "EVENT_ENDED", evidence: { field: "eventenddate", text: end } };
  }
  if (isYyyymmdd(start) && today < start) {
    return {
      closed: true,
      reason: "EVENT_NOT_STARTED",
      evidence: { field: "eventstartdate", text: start },
    };
  }
  return null;
}

/**
 * "매주 월요일 휴무" 같은 정기 휴무. 오늘 요일과 맞을 때만 닫힘으로 읽는다.
 * `연중무휴` 가 있으면 아예 보지 않는다.
 */
function readWeeklyClosure(schedule, weekday) {
  const label = WEEKDAYS[weekday];

  // 요일 글자는 다른 뜻으로도 쓰인다 — "월 2회 휴무" 는 매달 두 번이지 월요일이 아니다.
  // 그래서 두 경우만 요일로 인정한다.
  //   1. "월요일" 처럼 `요일` 이 붙은 형태
  //   2. "월·화", "토~일" 처럼 요일 글자가 구분자로 이어진 나열 안에 있는 형태
  const explicit = new RegExp(`${label}\\s*요일`);
  const run = new RegExp(
    `${WEEKDAY_CLASS}\\s*(?:[,·・/~∼-]|및|and)\\s*${WEEKDAY_CLASS}`,
    "g",
  );

  for (const field of CLOSURE_TEXT_FIELDS) {
    const text = plainText(schedule[field]);
    if (!text) continue;
    if (ALWAYS_OPEN.test(text)) continue;
    if (IRREGULAR.test(text)) continue;
    if (!CLOSURE_WORD.test(text)) continue;

    const inRun = (text.match(run) ?? []).some((chunk) => chunk.includes(label));
    if (!explicit.test(text) && !inRun) continue;

    return { closed: true, reason: "WEEKLY_CLOSURE", evidence: { field, text } };
  }
  return null;
}

/**
 * 운영·휴무 필드에서 닫힘 근거를 읽는다.
 *
 * @param {object} schedule  detailIntro2 의 운영·휴무 필드 모음
 * @param {Date}   now
 * @returns {{closed: boolean, reason: string, evidence?: {field: string, text: string}}}
 *   `closed: false` 는 "열려 있다" 가 아니라 **"닫혔다는 근거가 없다"** 는 뜻이다.
 */
export function readClosure(schedule, now = new Date()) {
  if (!schedule || typeof schedule !== "object" || Object.keys(schedule).length === 0) {
    return { closed: false, reason: "SCHEDULE_NOT_PROVIDED" };
  }

  const { weekday, yyyymmdd } = kstParts(now);

  const event = readEventWindow(schedule, yyyymmdd);
  if (event) return event;

  const weekly = readWeeklyClosure(schedule, weekday);
  if (weekly) return weekly;

  const hasAlwaysOpen = CLOSURE_TEXT_FIELDS.some((f) => ALWAYS_OPEN.test(plainText(schedule[f])));
  return { closed: false, reason: hasAlwaysOpen ? "ALWAYS_OPEN" : "NO_CLOSURE_EVIDENCE" };
}

/**
 * 닫힘 근거를 후보의 `openNow` 로 옮긴다.
 * **true 는 절대 돌려주지 않는다** — 근거가 없으면 null 이다.
 */
export function openNowFromSchedule(schedule, now = new Date()) {
  return readClosure(schedule, now).closed ? false : null;
}
