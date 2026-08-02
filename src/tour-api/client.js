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

/**
 * 호출 슬롯을 예약한다. 읽기·한도검사·증가·쓰기가 모두 동기이므로
 * 중간에 다른 비동기 호출이 끼어들 수 없다. 한도에 도달했으면 null.
 *
 * 검사와 증가를 분리하면(검사 → await fetch → 증가) 병렬 호출이 모두
 * 같은 값을 읽어 한도를 넘겨 호출한다. 그래서 fetch 전에 예약한다.
 */
function reserveCallSlot(operationKey) {
  const counter = readCounter();
  const current = counter[operationKey] ?? 0;
  if (current >= TOUR_API_DAILY_LIMIT) return null;

  counter[operationKey] = current + 1;
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
  fetchImpl = fetch,
}) {
  const service = TOUR_API_SERVICES[serviceName];
  if (!service) throw new Error(`알 수 없는 TourAPI 서비스: ${serviceName}`);
  if (!TOUR_API_KEY) throw new Error("TOUR_API_KEY가 설정되지 않았습니다.");

  const operationKey = `${serviceName}.${operation}`;

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
  const dailyCount = reserveCallSlot(operationKey);
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
