// 서버 알림 요청 함수 (docs/superpowers/plans/2026-11-15-server-push-patient-ui.md Task 3 · docs/contracts.md '서버 알림')
//
//   config()           GET    /api/push/config
//   register(input)    POST   /api/watch             { watchId, writeToken, expiresOn }
//   deadlines(input)   PUT    /api/watch/deadlines   { watchId, writeToken, expiresOn, days }
//   back(input)        POST   /api/watch/back        { watchId, writeToken, date, by, undo? }
//   removeAll()        DELETE /api/watch             { all: true }
// 지켜보기 하나 지우기(DELETE /api/watch { watchId, writeToken })는 기기 저장소의 서버 삭제 대기가 보낸다(lib/store).
// 요청 모양(형식, 한도, 본문 허용 목록)과 결과 종류는 src/guardian/watchRequests.js 가 정한다.
// 보내기와 결과 판정(WatchResult, 시간 한도)은 src/guardian/watchSend.js 하나다. 여기서는 다시 내보내기만 한다
// (계획 '다르게 정한 것' 22).
//
// 결과(WatchResult)는 { ok: true, status, data, kind: 'OK' } 또는 { ok: false, status, network, errorCode, kind } 다. 던지지 않는다.
//   - 요청 모양이 틀리면 보내지 않고 { ok: false, status: 0, network: false, errorCode: 'CLIENT_INVALID', kind: 'BAD' }

import { backRequest, configRequest, deadlinesRequest, registerRequest, removeAllRequest } from '../../src/guardian/watchRequests.js';
import { clientInvalidResult, sendWatchRequest } from '../../src/guardian/watchSend.js';

export { CLIENT_INVALID, WATCH_API_TIMEOUT_MS, sendWatchRequest } from '../../src/guardian/watchSend.js';

/**
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createWatchApi({ fetchImpl, timeoutMs } = {}) {
  /** 요청 모양을 만들고 보낸다. 모양이 틀리면 보내지 않는다 */
  function send(build) {
    let request;
    try {
      request = build();
    } catch {
      return Promise.resolve(clientInvalidResult());
    }
    return sendWatchRequest(request, { fetchImpl, timeoutMs });
  }

  return Object.freeze({
    config: () => send(() => configRequest()),
    register: (input) => send(() => registerRequest(input)),
    deadlines: (input) => send(() => deadlinesRequest(input)),
    back: (input) => send(() => backRequest(input)),
    removeAll: () => send(() => removeAllRequest()),
  });
}
