import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  TOUR_API_COMMON_PARAMS,
  TOUR_API_DAILY_LIMIT,
  TOUR_API_KEY,
  TOUR_API_PATHS,
  TOUR_API_SERVICES,
  TOUR_API_WARNING_AT,
} from "./config.js";

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1_000;

function kstDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function callLogPath(day = kstDate()) {
  return path.join(TOUR_API_PATHS.logs, `calls-${day}.jsonl`);
}

function counterPath(day = kstDate()) {
  return path.join(TOUR_API_PATHS.logs, `counter-${day}.json`);
}

/** 카운터를 신뢰할 수 없을 때 던진다 — 조용히 0 으로 되돌리지 않는다 */
export class CounterIntegrityError extends Error {}

/**
 * 파일 없음(=새 날, 정상적으로 0회)과 손상(=카운트를 잃어버림)을 구분한다.
 * 손상을 {} 로 삼키면 한도 차단이 통째로 사라지고, 복구하려 덮어쓰는 순간
 * 살아 있던 다른 operation 카운트까지 영구 소실된다.
 */
function readCounter(day) {
  let raw;
  try {
    raw = fs.readFileSync(counterPath(day), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new CounterIntegrityError(
      `호출 카운터를 읽을 수 없어 한도를 확인할 수 없습니다: ${error.code}`,
    );
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("객체가 아님");
    }
    return parsed;
  } catch {
    throw new CounterIntegrityError(
      "호출 카운터 파일이 손상돼 한도를 확인할 수 없습니다.",
    );
  }
}

/**
 * 호출 슬롯을 예약한다. 읽기·한도검사·증가·쓰기가 모두 동기이므로
 * 중간에 다른 비동기 호출이 끼어들 수 없다. 한도에 도달했으면 null.
 *
 * 검사와 증가를 분리하면(검사 → await fetch → 증가) 병렬 호출이 모두
 * 같은 값을 읽어 한도를 넘겨 호출한다. 그래서 fetch 전에 예약한다.
 */
function reserveCallSlot(operationKey, day) {
  const counter = readCounter(day);
  const current = counter[operationKey] ?? 0;
  if (current >= TOUR_API_DAILY_LIMIT) return null;

  counter[operationKey] = current + 1;

  // 임시 파일에 쓰고 rename 으로 교체한다. truncate 후 write 는 원자적이지 않아
  // 프로세스 종료·다중 프로세스에서 부분 파일이 남고, 그 파일이 곧 카운트 소실이다.
  const target = counterPath(day);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(counter, null, 2)}\n`, "utf8");
  fs.renameSync(temp, target);

  return counter[operationKey];
}

function appendCallLog(entry) {
  fs.appendFileSync(callLogPath(entry.kstDate), `${JSON.stringify(entry)}\n`, "utf8");
}

function encodeServiceKey(serviceKey) {
  return /%[0-9A-F]{2}/i.test(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey);
}

function buildRequestUrl(service, operation, parameters) {
  const query = new URLSearchParams({
    ...TOUR_API_COMMON_PARAMS,
    ...parameters,
  });

  return `${service.baseUrl}/${operation}?serviceKey=${encodeServiceKey(
    TOUR_API_KEY,
  )}&${query}`;
}

/**
 * 캐시 파일명을 만드는 키. E2E 가 외부 호출 없이 돌도록 fixture 를 같은 규칙으로
 * 심기 위해 공개한다 (scripts/seed-e2e-cache.mjs).
 */
export function tourApiCacheKey(serviceName, operation, parameters) {
  return createCacheKey(serviceName, operation, parameters);
}

/** 캐시 파일 경로 — 시드 스크립트가 같은 위치에 쓰도록 공개한다 */
export function tourApiCachePath(serviceName, operation, parameters) {
  return path.join(
    TOUR_API_PATHS.cache,
    `${createCacheKey(serviceName, operation, parameters)}.json`,
  );
}

function createCacheKey(serviceName, operation, parameters) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ serviceName, operation, parameters }))
    .digest("hex");
}

function readFreshCache(cacheFile, ttlMs) {
  try {
    const stat = fs.statSync(cacheFile);
    // 경계는 만료 쪽으로 판정한다 — ttl 0 은 "캐시를 쓰지 않는다"는 뜻이어야 하고,
    // stale 데이터를 신선한 사실로 바꾸지 않는 보수적 방향이다.
    // mtimeMs 는 소수점 밀리초라 방금 쓴 파일도 Date.now() 보다 미세하게 클 수 있다.
    // 음수 age 는 "방금 씀"으로 보고 0 으로 클램프한다.
    const ageMs = Math.max(0, Date.now() - stat.mtimeMs);
    if (ageMs >= ttlMs) return null;
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {
    return null;
  }
}

export function tourApiResponseHeader(payload) {
  if (payload?.response?.header) return payload.response.header;
  if (payload?.resultCode) {
    return {
      resultCode: String(payload.resultCode),
      resultMsg: payload.resultMsg ?? null,
    };
  }
  return {};
}

export function extractTourItems(result) {
  const item = result?.payload?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export function tourTotalCount(result) {
  return Number(result?.payload?.response?.body?.totalCount ?? 0);
}

export function tourApiCounterSummary() {
  const day = kstDate();
  const byOperation = readCounter(day);
  return {
    date: day,
    byOperation,
    total: Object.values(byOperation).reduce((sum, count) => sum + count, 0),
  };
}

/**
 * 인증키를 로그나 반환값에 포함하지 않는 TourAPI 호출 함수.
 */
export async function callTourApi({
  serviceName,
  operation,
  parameters = {},
  useCache = true,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  fetchImpl = fetch,
}) {
  const service = TOUR_API_SERVICES[serviceName];
  if (!service) throw new Error(`알 수 없는 TourAPI 서비스: ${serviceName}`);
  if (!TOUR_API_KEY) throw new Error("TOUR_API_KEY가 설정되지 않았습니다.");

  const operationKey = `${serviceName}.${operation}`;
  // 호출당 KST 날짜를 한 번만 정한다. 읽기·쓰기·로그가 각자 시계를 읽으면
  // 자정 경계에서 어제 카운터를 오늘 파일에 써 새 날이 어제 누적치로 시작한다.
  const day = kstDate();

  const cacheFile = path.join(
    TOUR_API_PATHS.cache,
    `${createCacheKey(serviceName, operation, parameters)}.json`,
  );

  // 캐시 적중은 외부 호출이 아니므로 한도 검사·카운터 증가 대상이 아니다.
  if (useCache) {
    const cached = readFreshCache(cacheFile, cacheTtlMs);
    if (cached) {
      return {
        ...cached,
        meta: { ...cached.meta, fromCache: true },
      };
    }
  }

  // 한도 예약(reserve): 검사와 증가를 한 번의 읽기-쓰기로 묶는다.
  // 상위에서 Promise.all 로 동시 호출해도 각 호출이 서로 다른 번호를 받아야
  // operation별 1,000회 차단(D07-POL005)이 초과 호출을 허용하지 않는다.
  const dailyCount = reserveCallSlot(operationKey, day);
  if (dailyCount === null) {
    throw new Error(
      `TourAPI 일일 한도 초과: ${operationKey} (${TOUR_API_DAILY_LIMIT}/${TOUR_API_DAILY_LIMIT})`,
    );
  }

  const requestUrl = buildRequestUrl(service, operation, parameters);
  const startedAt = Date.now();
  let httpStatus = 0;
  let payload;
  let errorMessage = null;

  try {
    const response = await fetchImpl(requestUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SafeHour/0.1 TourAPI client",
      },
      signal: AbortSignal.timeout(15_000),
    });

    httpStatus = response.status;
    const responseText = await response.text();

    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(
        `TourAPI가 JSON이 아닌 응답을 반환했습니다. HTTP ${httpStatus}`,
      );
    }

    const header = tourApiResponseHeader(payload);
    if (!response.ok || header.resultCode !== "0000") {
      throw new Error(
        `TourAPI 오류 ${header.resultCode ?? httpStatus}: ${
          header.resultMsg ?? "알 수 없는 오류"
        }`,
      );
    }
  } catch (error) {
    errorMessage = error.message;
  }

  const elapsedMs = Date.now() - startedAt;

  appendCallLog({
    timestamp: new Date().toISOString(),
    kstDate: day,
    serviceName,
    serviceLabel: service.label,
    operation,
    parameters,
    endpoint: `${service.baseUrl}/${operation}`,
    httpStatus,
    resultCode: payload ? tourApiResponseHeader(payload).resultCode ?? null : null,
    ok: errorMessage === null,
    elapsedMs,
    dailyCount,
    warning: dailyCount >= TOUR_API_WARNING_AT ? "DAILY_LIMIT_NEAR" : null,
    error: errorMessage,
  });

  if (errorMessage) throw new Error(errorMessage);

  const result = {
    serviceName,
    operation,
    parameters,
    payload,
    meta: {
      fetchedAt: new Date().toISOString(),
      elapsedMs,
      fromCache: false,
    },
  };

  if (useCache) {
    fs.writeFileSync(cacheFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  return result;
}
