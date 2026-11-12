// 서버 라우트 공통 가드와 오류 응답 (AX-302 · docs/contracts.md '공통')
//
// 일정·주소·장소·지침 연결 라우트는 로그인 세션이 없으면
// 401 { ok: false, errorCode: 'SAFEHOUR_AUTH_REQUIRED', message } 를 돌려준다.
// 모든 오류 응답은 `errorCode` 키를 쓴다(기존 `code: 'UNAUTHENTICATED'` 형태를 대체).
//
// 세션 검증은 기존 함수(`src/auth/session.js` 의 sessionSecret·readSessionToken)를 그대로 쓴다.
// 세션 모듈은 수정하지 않는다. `lib/server/auth-server.js` 의 currentSession 과 같은 판단이지만,
// 그 파일은 `@/` 별칭을 써서 `node --test` 에서 불러올 수 없으므로 상대 경로로 같은 조합을 만든다.
// 상대 경로 사용 — Next 외부(node --test)에서도 이 모듈을 그대로 테스트하기 위함.

import { SESSION_COOKIE, readSessionToken, sessionSecret } from '../../src/auth/session.js';
import { ERROR_CODE, ERROR_HTTP_STATUS } from '../../src/stay/errorCodes.js';

export { ERROR_CODE, ERROR_HTTP_STATUS };

export const AUTH_REQUIRED_MESSAGE = '로그인이 필요합니다.';

/** 요청 쿠키 헤더에서 이름 하나를 꺼낸다 */
function readCookie(request, name) {
  const raw = request?.headers?.get?.('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * 요청의 로그인 세션. 없거나 위조·만료·서명 키 미설정이면 null.
 * @param {Request} request
 * @param {{nowMs?: number, env?: Record<string, string|undefined>}} [opts]
 * @returns {{provider: string, subject: string, issuedAt: number, expiresAt: number} | null}
 */
export function sessionFromRequest(request, { nowMs = Date.now(), env = process.env } = {}) {
  const secret = sessionSecret(env);
  if (!secret) return null;
  return readSessionToken(readCookie(request, SESSION_COOKIE), secret, nowMs);
}

/**
 * 오류 응답 `{ ok: false, errorCode, message, ...extra }`.
 * 상태는 새 오류 코드면 ERROR_HTTP_STATUS 에서, 아니면 `init.status`(기본 400)로 정한다.
 * `extra` 는 ok·errorCode·message 를 덮어쓰지 못한다.
 * @param {string} errorCode  SAFEHOUR_* 코드
 * @param {string} message    사용자에게 보여도 되는 문장 (내부 정보·입력값을 넣지 않는다)
 * @param {object} [extra]    예: `{ fields }` (SAFEHOUR_STAY_INVALID 의 필드 목록)
 * @param {{status?: number}} [init]
 */
export function errorResponse(errorCode, message, extra = {}, { status } = {}) {
  const resolved = status ?? ERROR_HTTP_STATUS[errorCode] ?? 400;
  return Response.json({ ...extra, ok: false, errorCode, message }, { status: resolved });
}

/** 401 SAFEHOUR_AUTH_REQUIRED 응답 */
export function authRequiredResponse(message = AUTH_REQUIRED_MESSAGE) {
  return errorResponse(ERROR_CODE.AUTH_REQUIRED, message);
}

/**
 * 로그인 가드. 라우트 맨 앞에서 부른다.
 *
 * ```js
 * const guard = requireSession(request);
 * if (!guard.ok) return guard.response;
 * ```
 * @param {Request} request
 * @param {{nowMs?: number, env?: Record<string, string|undefined>}} [opts]
 * @returns {{ok: true, session: object} | {ok: false, response: Response}}
 */
export function requireSession(request, opts) {
  const session = sessionFromRequest(request, opts);
  if (!session) return { ok: false, response: authRequiredResponse() };
  return { ok: true, session };
}

/**
 * 라우트 처리기를 로그인 가드로 감싼다. 세션이 있을 때만 처리기를 부르고
 * 두 번째 인자에 `session` 을 더해 넘긴다.
 *
 * ```js
 * export const POST = withSession(async (request, { session }) => { ... });
 * ```
 * @param {(request: Request, context: object) => Promise<Response>|Response} handler
 * @param {{now?: () => number, env?: Record<string, string|undefined>}} [opts]  테스트용 주입
 */
export function withSession(handler, { now = Date.now, env } = {}) {
  return async (request, context = {}) => {
    const guard = requireSession(request, { nowMs: now(), env: env ?? process.env });
    if (!guard.ok) return guard.response;
    return handler(request, { ...context, session: guard.session });
  };
}
