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

export const TOUR_API_SERVICES = Object.freeze({
  korean: {
    label: "국문 관광정보",
    baseUrl: "https://apis.data.go.kr/B551011/KorService2",
  },
  english: {
    label: "영문 관광정보",
    baseUrl: "https://apis.data.go.kr/B551011/EngService2",
  },
  barrierFree: {
    label: "무장애 여행정보",
    baseUrl: "https://apis.data.go.kr/B551011/KorWithService2",
  },
});

export const TOUR_API_COMMON_PARAMS = Object.freeze({
  MobileOS: "ETC",
  MobileApp: "SafeHour",
  _type: "json",
});

export const TOUR_API_DAILY_LIMIT = 1_000;
export const TOUR_API_WARNING_AT = 800;

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
