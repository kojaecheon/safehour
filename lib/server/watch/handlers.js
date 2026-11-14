// 서버 알림 라우트 처리기 (ADR-0012 · 계획 작업 8 · 설계서 5.2 '경로별 권한')
//
// 라우트 파일(app/api/push/config, app/api/watch/*, app/api/cron/watch-arm)은 얇게 두고 처리 본체는 여기 있다.
//
// 처리 순서 (쓰기 경로: 등록, 마감, 돌아왔어요, 구독, 상태, 함께 있음)
//   ① cfg = watchConfig(env). enabled 가 아니면 503 SAFEHOUR_SERVER_PUSH_OFF
//   ② 세션이 필요한 경로면 세션 확인(401). 시험 장치가 꺼진 곳의 데모 세션은 없는 것으로 본다(아래 '데모 세션')
//   ③ 본문 읽기(16KB 에서 끊는다)와 허용 목록(400, field)
//   ④ 서비스 함수  ⑤ reason → 상태와 오류 코드  ⑥ 예상 못 한 예외(KvError 포함)는 503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE
//   ⑦ 기록 한 줄(log.js)
// 삭제 경로(DELETE /api/watch, DELETE /api/watch/subscribe)는 ①에서 enabled 대신 WatchCtx 를 만들 수 있는지만 본다.
// 스위치가 꺼져 있거나 차단 스위치가 켜져 있어도 지울 수 있어야 한다.
//
// 데모 세션: 데모 로그인은 누가 눌러도 같은 신원({ provider: 'demo', subject: 'demo-user' })이라 계정 키도 하나다.
// 그대로 받으면 남의 지켜보기를 다시 등록해 가로채거나 { all: true } 로 지울 수 있다. 그래서 시험 장치가 꺼진 곳(운영 배포,
// 데모 로그인 꺼짐)에서는 데모 세션을 세션이 없는 것으로 본다. 등록과 전체 삭제는 401, 마감 올리기는 계정 없이(쓰기 토큰만),
// 보호자 경로는 로그인을 요구하는 설정이면 401 이다.
//
// 스위치 판단의 정본은 watchConfig 다. ctx 를 주입했든 직접 만들었든 enabled 를 cfg.enabled 로 덮어쓴 사본을 넘긴다.
// 응답 본문은 계약 표의 키만 새로 만들어 담는다. 서비스 결과를 펼쳐 쓰지 않는다.
// 찾지 못한 경우는 이유와 무관하게 바이트까지 같은 404 하나다. 오류 응답과 기록에는 식별 값·날짜·시각·주소가 없다.
// 예약 처리 경로는 QStash 서명(원문 본문으로 검증) 또는 Authorization: Bearer <CRON_SECRET> 로만 연다.

import { deriveAccountKey, sessionSecret } from '../../../src/auth/session.js';
import { addDays } from '../../../src/stay/time.js';
import { BAD_REQUEST } from '../itinerary-request.js';
import { ERROR_CODE, authRequiredResponse, errorResponse, sessionFromRequest } from '../route-guard.js';
import { armIndexedDates } from './arm.js';
import { watchConfig } from './config.js';
import { createWatchCtx } from './context.js';
import { processDue } from './due.js';
import { muteToday, subscribeGuardian, unsubscribeGuardian, watchStatus } from './guardian.js';
import { idMatches } from './keys.js';
import { WATCH_OUTCOME, WATCH_ROUTE, logWatch } from './log.js';
import { deleteOwnedWatches, deleteWatch, markBack, putDeadlines, registerWatch } from './patient.js';
import { kstToday } from './records.js';
import {
  normalizeBack,
  normalizeDeadlines,
  normalizeDue,
  normalizeMute,
  normalizeRegister,
  normalizeRemove,
  normalizeStatus,
  normalizeSubscribe,
  normalizeUnsubscribe,
  readJsonBody,
} from './requests.js';
import { DUE_PATH, verifyQstashSignature } from './scheduler.js';

/** 오류 메시지는 고정 문장이다. 입력값과 내부 값을 넣지 않는다 */
const MESSAGE = Object.freeze({
  BAD_REQUEST: '요청 형식이 올바르지 않습니다.',
  NOT_FOUND: '서버 알림 정보를 찾을 수 없습니다.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.',
  OFF: '서버 알림이 꺼져 있습니다.',
  UNAVAILABLE: '서버 알림을 잠시 쓸 수 없습니다.',
});

const NO_STORE = { 'Cache-Control': 'no-store' };

// ── 결과 묶음: { response, outcome, errorCode?, counts? } ──

function success(payload, { outcome = WATCH_OUTCOME.OK, counts } = {}) {
  return { response: Response.json({ ok: true, ...payload }, { headers: NO_STORE }), outcome, counts };
}

function failure(errorCode, message, outcome, extra = {}) {
  return { response: errorResponse(errorCode, message, extra), outcome, errorCode };
}

const badRequest = (field) =>
  failure(BAD_REQUEST, MESSAGE.BAD_REQUEST, WATCH_OUTCOME.REJECTED, typeof field === 'string' ? { field } : {});
const authRequired = () => ({
  response: authRequiredResponse(),
  outcome: WATCH_OUTCOME.REJECTED,
  errorCode: ERROR_CODE.AUTH_REQUIRED,
});
const notFound = () => failure(ERROR_CODE.WATCH_NOT_FOUND, MESSAGE.NOT_FOUND, WATCH_OUTCOME.NOT_FOUND);
const rateLimited = () => failure(ERROR_CODE.RATE_LIMITED, MESSAGE.RATE_LIMITED, WATCH_OUTCOME.LIMITED);
const off = () => failure(ERROR_CODE.SERVER_PUSH_OFF, MESSAGE.OFF, WATCH_OUTCOME.OFF);
const unavailable = (outcome = WATCH_OUTCOME.FAILED) =>
  failure(ERROR_CODE.SERVER_PUSH_UNAVAILABLE, MESSAGE.UNAVAILABLE, outcome);

/** 서비스 함수의 reason → 결과 묶음. 모르는 reason 은 예상 못 한 실패로 본다 */
function fromReason(reason) {
  if (reason === 'NOT_FOUND') return notFound();
  if (reason === 'RATE_LIMITED') return rateLimited();
  if (reason === 'BAD_REQUEST') return badRequest();
  return unavailable();
}

/** 예약 업체 실패로 걸지 못한 마감 수. 서비스가 값을 주지 않으면 0 */
function armFailedOf(result) {
  return Number.isInteger(result?.armFailed) && result.armFailed >= 0 ? result.armFailed : 0;
}

/** Authorization 헤더가 'Bearer <CRON_SECRET>' 과 같은가. 비밀이 없으면 늘 거짓 */
function bearerMatches(request, cronSecret) {
  if (typeof cronSecret !== 'string' || cronSecret === '') return false;
  return idMatches(request.headers.get('authorization') ?? '', `Bearer ${cronSecret}`);
}

/**
 * @param {{ env?: Record<string, string|undefined>, now?: () => number, fetchImpl?: typeof fetch, ctx?: object }} [deps]
 *   테스트 주입용. 운영에서는 process.env, Date.now, createWatchCtx 를 쓴다.
 */
export function createWatchHandlers({ env, now, fetchImpl = globalThis.fetch, ctx: injectedCtx } = {}) {
  const envOf = () => env ?? process.env;
  const clock = now ?? injectedCtx?.now ?? Date.now;

  /** 서비스에 넘길 WatchCtx. 만들 수 없으면 null */
  function ctxFor(cfg) {
    const base = injectedCtx ?? createWatchCtx(cfg, { now: clock, fetchImpl });
    return base ? { ...base, enabled: cfg.enabled === true } : null;
  }

  /** 요청의 세션. 시험 장치가 꺼진 곳의 데모 세션은 없는 것으로 본다(맨 위 설명) */
  function sessionOf(request, cfg, source) {
    const session = sessionFromRequest(request, { nowMs: clock(), env: source });
    if (!session) return null;
    if (session.provider === 'demo' && cfg.testHooks !== true) return null;
    return session;
  }

  /** 시간을 재고, 예상 못 한 예외를 503 으로 바꾸고, 기록 한 줄을 남긴다 */
  function handler(route, body) {
    return async (request) => {
      const startedAt = performance.now();
      let result;
      try {
        result = await body(request);
      } catch {
        // KvError 와 그 밖의 예외. 메시지와 속성은 읽지 않는다(주소·명령이 섞일 수 있다)
        result = unavailable();
      }
      logWatch({
        route,
        outcome: result.outcome,
        errorCode: result.errorCode,
        elapsedMs: performance.now() - startedAt,
        counts: result.counts,
      });
      return result.response;
    };
  }

  /**
   * 쓰기 경로 공통 앞단. session: 'required' | 'optional' | 'guardian' | 'none'.
   * guardian 은 cfg.guardianLoginRequired 일 때만 세션을 요구한다.
   */
  function writeRoute(route, { session: sessionRule, normalize }, act) {
    return handler(route, async (request) => {
      const source = envOf();
      const cfg = watchConfig(source);
      if (!cfg.enabled) return off();
      const ctx = ctxFor(cfg);
      if (!ctx) return off();
      const required = sessionRule === 'required' || (sessionRule === 'guardian' && cfg.guardianLoginRequired);
      const session = required || sessionRule === 'optional' ? sessionOf(request, cfg, source) : null;
      if (required && !session) return authRequired();
      const read = await readJsonBody(request);
      if (!read.ok) return badRequest('body');
      const input = normalize(read.body);
      if (!input.ok) return badRequest(input.field);
      const accountKey = session ? deriveAccountKey(session, sessionSecret(source)) : null;
      return act(ctx, input.value, { accountKey });
    });
  }

  /** 삭제 경로 공통 앞단. 스위치 대신 WatchCtx 를 만들 수 있는지만 본다 */
  function deleteRoute(route, normalize, act) {
    return handler(route, async (request) => {
      const source = envOf();
      const cfg = watchConfig(source);
      const ctx = ctxFor(cfg);
      if (!ctx) return off();
      const read = await readJsonBody(request);
      if (!read.ok) return badRequest('body');
      const input = normalize(read.body);
      if (!input.ok) return badRequest(input.field);
      return act(ctx, input.value, { request, source, cfg });
    });
  }

  const pushConfig = handler(WATCH_ROUTE.PUSH_CONFIG, async () => {
    const cfg = watchConfig(envOf());
    const enabled = cfg.enabled === true && cfg.vapid !== null;
    return success({
      enabled,
      vapidPublicKey: enabled ? cfg.vapid.publicKey : null,
      guardianLoginRequired: cfg.guardianLoginRequired,
    });
  });

  const register = writeRoute(
    WATCH_ROUTE.REGISTER,
    { session: 'required', normalize: normalizeRegister },
    async (ctx, value, { accountKey }) => {
      const r = await registerWatch(ctx, { accountKey, ...value });
      return r.ok ? success({ expiresOn: r.expiresOn }) : fromReason(r.reason);
    },
  );

  const remove = deleteRoute(WATCH_ROUTE.REMOVE, normalizeRemove, async (ctx, value, { request, source, cfg }) => {
    if (value.all) {
      const session = sessionOf(request, cfg, source);
      if (!session) return authRequired();
      const r = await deleteOwnedWatches(ctx, { accountKey: deriveAccountKey(session, sessionSecret(source)) });
      if (!r.ok) return fromReason(r.reason);
      const deleted = Number.isInteger(r.deleted) && r.deleted >= 0 ? r.deleted : 0;
      return success({ deleted }, { counts: { deleted } });
    }
    const r = await deleteWatch(ctx, { watchId: value.watchId, writeToken: value.writeToken });
    return r.ok ? success({}) : fromReason(r.reason);
  });

  const deadlines = writeRoute(
    WATCH_ROUTE.DEADLINES,
    { session: 'optional', normalize: normalizeDeadlines },
    async (ctx, value, { accountKey }) => {
      const r = await putDeadlines(ctx, { ...value, accountKey });
      if (!r.ok) return fromReason(r.reason);
      const armFailed = armFailedOf(r);
      return success({ expiresOn: r.expiresOn, armFailed }, { counts: { failed: armFailed } });
    },
  );

  const back = writeRoute(WATCH_ROUTE.BACK, { session: 'none', normalize: normalizeBack }, async (ctx, value) => {
    const r = await markBack(ctx, value);
    return r.ok ? success({ recorded: r.recorded === true }) : fromReason(r.reason);
  });

  const subscribe = writeRoute(
    WATCH_ROUTE.SUBSCRIBE,
    { session: 'guardian', normalize: normalizeSubscribe },
    async (ctx, value) => {
      const r = await subscribeGuardian(ctx, value);
      return r.ok ? success({ subId: r.subId }) : fromReason(r.reason);
    },
  );

  const unsubscribe = deleteRoute(WATCH_ROUTE.UNSUBSCRIBE, normalizeUnsubscribe, async (ctx, value) => {
    const r = await unsubscribeGuardian(ctx, value);
    return r.ok ? success({}) : fromReason(r.reason);
  });

  const status = writeRoute(
    WATCH_ROUTE.STATUS,
    { session: 'guardian', normalize: normalizeStatus },
    async (ctx, value) => {
      const r = await watchStatus(ctx, value);
      if (!r.ok) return fromReason(r.reason);
      return success({
        date: r.date,
        confirmed: Array.isArray(r.confirmed) ? [...r.confirmed] : [],
        muted: r.muted === true,
        subscriptionActive: r.subscriptionActive === true,
      });
    },
  );

  const mute = writeRoute(WATCH_ROUTE.MUTE, { session: 'guardian', normalize: normalizeMute }, async (ctx, value) => {
    const r = await muteToday(ctx, value);
    return r.ok ? success({ muted: r.muted === true }) : fromReason(r.reason);
  });

  // 예약 처리: 인증을 먼저 본다. 서명은 원문 본문으로 검증하므로 본문을 먼저 읽는다. 본문은 상한(16KB)을 넘는 순간
  // 읽기를 멈추므로, 인증 없는 큰 본문도 끝까지 읽지 않고 401 로 끝난다.
  // 다시 불러야 하는 결과(retry: RETRY, SKIP_EARLY 등 어느 outcome 이든)와 저장소 장애는 503 이라 QStash 가 다시 부른다.
  const due = handler(WATCH_ROUTE.DUE, async (request) => {
    const cfg = watchConfig(envOf());
    const read = await readJsonBody(request);
    const signed =
      cfg.qstash !== null &&
      read.ok &&
      verifyQstashSignature({
        signature: request.headers.get('upstash-signature'),
        rawBody: read.raw,
        currentKey: cfg.qstash.currentSigningKey,
        nextKey: cfg.qstash.nextSigningKey,
        nowMs: clock(),
        path: DUE_PATH,
      });
    if (!signed && !bearerMatches(request, cfg.cronSecret)) return authRequired();
    if (!read.ok) return badRequest('body');
    const ctx = ctxFor(cfg);
    // 저장소가 없으면 할 일이 없다. 다시 부르지 않게 200 으로 끝낸다
    if (!ctx) return success({}, { outcome: WATCH_OUTCOME.OFF });
    const input = normalizeDue(read.body);
    if (!input.ok) return badRequest(input.field);
    const r = await processDue(ctx, input.value);
    const counts = typeof r?.statusClass === 'string' ? { push: r.statusClass } : undefined;
    if (r?.retry === true) return { ...unavailable(r.outcome), counts };
    return success({}, { outcome: r?.outcome, counts });
  });

  // 하루 1회 예약: 꺼져 있으면 인증 없이 건너뛴다. 어제를 넣는 것은 어제 늦은 밤 마감의 예약이 실패했을 때
  // 늦은 한도 안이면 다시 걸기 위해서다.
  const cronArm = handler(WATCH_ROUTE.CRON, async (request) => {
    const cfg = watchConfig(envOf());
    if (!cfg.enabled) return success({ skipped: 'OFF' }, { outcome: WATCH_OUTCOME.OFF });
    if (!bearerMatches(request, cfg.cronSecret)) return authRequired();
    const ctx = ctxFor(cfg);
    if (!ctx) return off();
    const today = kstToday(clock());
    const r = await armIndexedDates(ctx, [addDays(today, -1), today, addDays(today, 1)]);
    return success({ armed: r.armed, failed: r.failed }, { counts: { watches: r.watches, armed: r.armed, failed: r.failed } });
  });

  return { pushConfig, register, remove, deadlines, back, subscribe, unsubscribe, status, mute, due, cronArm };
}
