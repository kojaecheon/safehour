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

function callLogPath() {
  return path.join(TOUR_API_PATHS.logs, `calls-${kstDate()}.jsonl`);
}

function counterPath() {
  return path.join(TOUR_API_PATHS.logs, `counter-${kstDate()}.json`);
}

function readCounter() {
  try {
    return JSON.parse(fs.readFileSync(counterPath(), "utf8"));
  } catch {
    return {};
  }
}

function bumpCounter(operationKey) {
  const counter = readCounter();
  counter[operationKey] = (counter[operationKey] ?? 0) + 1;
  fs.writeFileSync(counterPath(), `${JSON.stringify(counter, null, 2)}\n`, "utf8");
  return counter[operationKey];
}

function appendCallLog(entry) {
  fs.appendFileSync(callLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
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

function createCacheKey(serviceName, operation, parameters) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ serviceName, operation, parameters }))
    .digest("hex");
}

function readFreshCache(cacheFile, ttlMs) {
  try {
    const stat = fs.statSync(cacheFile);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
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
  const byOperation = readCounter();
  return {
    date: kstDate(),
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
}) {
  const service = TOUR_API_SERVICES[serviceName];
  if (!service) throw new Error(`알 수 없는 TourAPI 서비스: ${serviceName}`);
  if (!TOUR_API_KEY) throw new Error("TOUR_API_KEY가 설정되지 않았습니다.");

  const operationKey = `${serviceName}.${operation}`;
  const currentCount = readCounter()[operationKey] ?? 0;
  if (currentCount >= TOUR_API_DAILY_LIMIT) {
    throw new Error(
      `TourAPI 일일 한도 초과: ${operationKey} (${currentCount}/${TOUR_API_DAILY_LIMIT})`,
    );
  }

  const cacheFile = path.join(
    TOUR_API_PATHS.cache,
    `${createCacheKey(serviceName, operation, parameters)}.json`,
  );

  if (useCache) {
    const cached = readFreshCache(cacheFile, cacheTtlMs);
    if (cached) {
      return {
        ...cached,
        meta: { ...cached.meta, fromCache: true },
      };
    }
  }

  const requestUrl = buildRequestUrl(service, operation, parameters);
  const startedAt = Date.now();
  let httpStatus = 0;
  let payload;
  let errorMessage = null;

  try {
    const response = await fetch(requestUrl, {
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

  const dailyCount = bumpCounter(operationKey);
  const elapsedMs = Date.now() - startedAt;

  appendCallLog({
    timestamp: new Date().toISOString(),
    kstDate: kstDate(),
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
