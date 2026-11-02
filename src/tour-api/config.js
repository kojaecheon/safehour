import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(CURRENT_DIR, "../..");

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const envPath = path.join(PROJECT_ROOT, fileName);
    if (!fs.existsSync(envPath)) continue;

    for (const sourceLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = sourceLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator < 0) continue;

      const name = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^(['"])(.*)\1$/, "$2");

      if (!process.env[name]) process.env[name] = value;
    }
  }
}

loadLocalEnv();

export const TOUR_API_KEY = process.env.TOUR_API_KEY?.trim() ?? "";

// 서비스 주소는 공공데이터포털 공지(…Service1 → …Service2, 10종)와 각 서비스 명세의 host 로 확인했다.
//   https://www.data.go.kr/bbs/ntc/selectNotice.do?originId=NOTICE_0000000004082
//   일문 https://www.data.go.kr/data/15101760/openapi.do  host "apis.data.go.kr/B551011/JpnService2"
//   중문 간체 https://www.data.go.kr/data/15101764/openapi.do  host "apis.data.go.kr/B551011/ChsService2"
//   두 서비스 모두 locationBasedList2·detailCommon2·detailIntro2·detailImage2 를 제공한다(2026-09-18 확인).
// 일문·중문은 운영자가 활용 신청을 해야 쓸 수 있다(spec 13장). 신청 전에는 공급자 오류로 실패하고
// 영문으로 대체된다(candidate-service.js).
export const TOUR_API_SERVICES = Object.freeze({
  korean: {
    label: "국문 관광정보",
    baseUrl: "https://apis.data.go.kr/B551011/KorService2",
  },
  english: {
    label: "영문 관광정보",
    baseUrl: "https://apis.data.go.kr/B551011/EngService2",
  },
  japanese: {
    label: "일문 관광정보",
    baseUrl: "https://apis.data.go.kr/B551011/JpnService2",
  },
  chineseSimplified: {
    label: "중문 간체 관광정보",
    baseUrl: "https://apis.data.go.kr/B551011/ChsService2",
  },
  barrierFree: {
    label: "무장애 여행정보",
    baseUrl: "https://apis.data.go.kr/B551011/KorWithService2",
  },
});

/** 관광 데이터 언어 (spec 4.17) — `ko` 는 국문만 쓰므로 더할 서비스가 없다 */
export const TOUR_LANGS = Object.freeze(["ko", "en", "ja", "zh"]);

/** 선택 언어 → 더해서 조회할 서비스 */
export const TOUR_LANG_SERVICE = Object.freeze({
  en: "english",
  ja: "japanese",
  zh: "chineseSimplified",
});

/**
 * 요청 언어를 관광 데이터 언어로 정한다. 지원하지 않는 값은 `en` 이다(spec 4.17 '그 외→en').
 * 값이 없으면 null — 호출부가 기존(언어 미지정) 동작을 고를 수 있게 구분한다.
 */
export function resolveTourLang(lang) {
  if (lang === undefined || lang === null || lang === "") return null;
  const value = String(lang).trim().toLowerCase();
  return TOUR_LANGS.includes(value) ? value : "en";
}

export const TOUR_API_COMMON_PARAMS = Object.freeze({
  MobileOS: "ETC",
  MobileApp: "SafeHour",
  _type: "json",
});

/** operation별 일일 호출 경고·차단 기본값 (D07-POL005) */
export const TOUR_API_DEFAULT_DAILY_LIMIT = 1_000;
export const TOUR_API_DEFAULT_WARNING_AT = 800;

function readPositiveInteger(env, name, issues) {
  const raw = env?.[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text) || Number(text) <= 0 || !Number.isSafeInteger(Number(text))) {
    issues.push(`${name}_INVALID`);
    return null;
  }
  return Number(text);
}

/**
 * 호출 경고·차단 값을 환경변수에서 읽는다 (spec 4.21).
 *
 *   TOUR_API_DAILY_LIMIT  operation별 일일 차단 값 (기본 1,000)
 *   TOUR_API_WARNING_AT   operation별 일일 경고 값 (기본 800)
 *
 * 잘못된 값은 기본값으로 돌아간다 — 오타 하나로 차단이 사라지면 안 된다.
 * 경고 값이 차단 값보다 크면 차단 값으로 맞춘다.
 */
export function resolveCallThresholds(env = process.env) {
  const issues = [];
  const dailyLimit =
    readPositiveInteger(env, "TOUR_API_DAILY_LIMIT", issues) ?? TOUR_API_DEFAULT_DAILY_LIMIT;
  let warningAt =
    readPositiveInteger(env, "TOUR_API_WARNING_AT", issues) ?? TOUR_API_DEFAULT_WARNING_AT;
  if (warningAt > dailyLimit) {
    warningAt = dailyLimit;
    issues.push("TOUR_API_WARNING_AT_ABOVE_LIMIT");
  }
  return { dailyLimit, warningAt, issues };
}

const CALL_THRESHOLDS = resolveCallThresholds();
if (CALL_THRESHOLDS.issues.length > 0) {
  console.warn(`[tour-api] 호출 한도 환경변수 조정: ${CALL_THRESHOLDS.issues.join(", ")}`);
}

export const TOUR_API_DAILY_LIMIT = CALL_THRESHOLDS.dailyLimit;
export const TOUR_API_WARNING_AT = CALL_THRESHOLDS.warningAt;

// 호출 로그·카운터·캐시가 쓰이는 루트. 테스트는 SAFEHOUR_DATA_ROOT 로
// 임시 디렉터리를 지정해 실제 운영 카운터를 건드리지 않고 경계를 검증한다.
const DATA_ROOT = process.env.SAFEHOUR_DATA_ROOT
  ? path.resolve(process.env.SAFEHOUR_DATA_ROOT)
  : PROJECT_ROOT;

export const TOUR_API_PATHS = Object.freeze({
  logs: path.join(DATA_ROOT, "logs", "tour-api"),
  cache: path.join(DATA_ROOT, ".cache", "tour-api"),
});

for (const directory of Object.values(TOUR_API_PATHS)) {
  fs.mkdirSync(directory, { recursive: true });
}
