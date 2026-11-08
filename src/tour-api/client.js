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
import { TOUR_API_UPSTREAM, tourApiUpstreamClass } from "./upstream.js";

export { TOUR_API_UPSTREAM, tourApiUpstreamClass };

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1_000;

// 공공데이터포털 공통 오류 코드(활용 가이드 '에러 코드')
//   20 SERVICE_ACCESS_DENIED, 21 TEMPORARILY_DISABLE_THE_SERVICEKEY, 22 LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS,
//   30 SERVICE_KEY_IS_NOT_REGISTERED, 31 DEADLINE_HAS_EXPIRED, 32 UNREGISTERED_IP, 33 UNSIGNED_CALL,
//   12 NO_OPENAPI_SERVICE(활용 신청 전 서비스 포함)
const QUOTA_RESULT_CODES = new Set([22]);
const AUTH_RESULT_CODES = new Set([12, 20, 21, 30, 31, 32, 33]);
const QUOTA_MESSAGE_RE = /LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS|rate limit exceeded/i;
const AUTH_MESSAGE_RE =
  /SERVICE_KEY_IS_NOT_REGISTERED|DEADLINE_HAS_EXPIRED|UNREGISTERED_IP|SERVICE_ACCESS_DENIED|TEMPORARILY_DISABLE_THE_SERVICEKEY|UNSIGNED_CALL|NO_OPENAPI_SERVICE/i;

function numericResultCode(resultCode) {
  if (resultCode === undefined || resultCode === null) return null;
  const text = String(resultCode).trim();
  return /^\d{1,4}$/.test(text) ? Number(text) : null;
}

/**
 * 응답 하나를 분류한다. 순수 함수라 테스트가 가짜 응답으로 바로 검사한다.
 * 성공(HTTP 2xx + resultCode 0000)이면 null.
 *
 * @param {object} args
 * @param {number} [args.httpStatus]
 * @param {string|number|null} [args.resultCode]  JSON 헤더 또는 XML 의 returnReasonCode
 * @param {string|null} [args.resultMsg]
 * @param {boolean} [args.parsed]  본문을 JSON 으로 읽었는지
 * @param {string} [args.bodyText]  JSON 이 아닐 때 원인 코드를 찾기 위한 본문(저장·기록하지 않는다)
 */
export function classifyTourApiResponse({ httpStatus = 0, resultCode = null, resultMsg = null, parsed = true, bodyText = "" } = {}) {
  let code = numericResultCode(resultCode);
  let message = typeof resultMsg === "string" ? resultMsg : "";

  // 게이트웨이 오류는 JSON 이 아니라 XML 로 온다(<returnReasonCode>30</returnReasonCode>).
  if (!parsed && typeof bodyText === "string" && bodyText) {
    const reason = /<returnReasonCode>\s*(\d{1,4})\s*<\/returnReasonCode>/i.exec(bodyText);
    if (reason) code = Number(reason[1]);
    message = bodyText.slice(0, 2_000);
  }

  const ok = httpStatus >= 200 && httpStatus < 300 && parsed && code === 0;
  if (ok) return null;

  if (httpStatus === 429 || (code !== null && QUOTA_RESULT_CODES.has(code)) || QUOTA_MESSAGE_RE.test(message)) {
    return TOUR_API_UPSTREAM.QUOTA;
  }
  if (httpStatus === 401 || httpStatus === 403 || (code !== null && AUTH_RESULT_CODES.has(code)) || AUTH_MESSAGE_RE.test(message)) {
    return TOUR_API_UPSTREAM.AUTH;
  }
  if (httpStatus >= 500) return TOUR_API_UPSTREAM.UPSTREAM_ERROR;
  if (!parsed) return TOUR_API_UPSTREAM.PARSE;
  return TOUR_API_UPSTREAM.UPSTREAM_ERROR;
}

/** 메시지는 그대로 두고 분류만 더한 오류 */
function upstreamError(message, upstream) {
  const error = new Error(message);
  error.upstream = upstream;
  return error;
}

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

/**
 * 호출 파라미터에서 좌표를 지운다.
 *
 * 위치기반 조회는 mapX/mapY 로 사용자가 선택한 기준점을 넘긴다. 그대로 로그에
 * 쌓으면 "언제 어느 좌표를 조회했는지"가 시계열로 남아 D07-POL002 가 금지한
 * 위치 이력이 된다. 심사 증빙(API 활용표)에 필요한 것은 operation·횟수·성공
 * 여부이지 좌표가 아니므로, 값만 가리고 키는 남겨 가려졌다는 사실을 보인다.
 */
const LOCATION_PARAM_KEYS = new Set(["mapX", "mapY"]);

function redactParameters(parameters) {
  if (!parameters || typeof parameters !== "object") return parameters;
  const safe = {};
  for (const [key, value] of Object.entries(parameters)) {
    safe[key] = LOCATION_PARAM_KEYS.has(key) ? "REDACTED" : value;
  }
  return safe;
}

function appendCallLog(entry) {
  // 로그 쓰기 실패가 추천을 막지 않는다 — 관측 때문에 사용자가 안전 판정을
  // 못 받는 일은 없어야 한다. 한도 카운터는 별도 파일이라 여기서 실패해도
  // 차단 로직은 그대로 동작한다.
  try {
    fs.appendFileSync(
      callLogPath(entry.kstDate),
      `${JSON.stringify({ ...entry, parameters: redactParameters(entry.parameters) })}\n`,
      "utf8",
    );
  } catch (error) {
    console.error("[tour-api] call log write failed:", error.message);
  }
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
  if (!TOUR_API_KEY) {
    throw upstreamError("TOUR_API_KEY가 설정되지 않았습니다.", TOUR_API_UPSTREAM.AUTH);
  }

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
    throw upstreamError(
      `TourAPI 일일 한도 초과: ${operationKey} (${TOUR_API_DAILY_LIMIT}/${TOUR_API_DAILY_LIMIT})`,
      TOUR_API_UPSTREAM.SELF_LIMIT,
    );
  }

  const requestUrl = buildRequestUrl(service, operation, parameters);
  const startedAt = Date.now();
  let httpStatus = 0;
  let payload;
  let errorMessage = null;
  let upstream = null;

  try {
    let response;
    let responseText;
    try {
      response = await fetchImpl(requestUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "SafeHour/0.1 TourAPI client",
        },
        signal: AbortSignal.timeout(15_000),
      });
      httpStatus = response.status;
      responseText = await response.text();
    } catch (error) {
      // 연결 실패·시간 초과. 원문(error.message)에는 URL 이 섞일 수 있어 이름만 남긴다.
      throw upstreamError(
        `TourAPI 요청이 닿지 않았습니다: ${error?.name ?? "Error"}`,
        TOUR_API_UPSTREAM.NETWORK,
      );
    }

    try {
      payload = JSON.parse(responseText);
    } catch {
      throw upstreamError(
        `TourAPI가 JSON이 아닌 응답을 반환했습니다. HTTP ${httpStatus}`,
        classifyTourApiResponse({ httpStatus, parsed: false, bodyText: responseText }),
      );
    }

    const header = tourApiResponseHeader(payload);
    if (!response.ok || header.resultCode !== "0000") {
      throw upstreamError(
        `TourAPI 오류 ${header.resultCode ?? httpStatus}: ${
          header.resultMsg ?? "알 수 없는 오류"
        }`,
        classifyTourApiResponse({
          httpStatus,
          resultCode: header.resultCode ?? null,
          resultMsg: header.resultMsg ?? null,
        }) ?? TOUR_API_UPSTREAM.UPSTREAM_ERROR,
      );
    }
  } catch (error) {
    errorMessage = error.message;
    upstream = tourApiUpstreamClass(error.upstream) ?? TOUR_API_UPSTREAM.UPSTREAM_ERROR;
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
    upstream,
  });

  if (errorMessage) throw upstreamError(errorMessage, upstream);

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
    // 파일명은 요청 해시라 좌표를 되돌릴 수 없다. 본문에도 기준점 좌표를 남기지 않는다
    // (서버는 체류 정보를 저장하지 않는다 — spec §4.19).
    const stored = { ...result, parameters: redactParameters(parameters) };
    fs.writeFileSync(cacheFile, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  }

  return result;
}
