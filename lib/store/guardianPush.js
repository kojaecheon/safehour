// 보호자 기기의 서버 알림 구독 기록 모양: 계정 레코드 guardianPush
// (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md '공용 모양', 다르게 정한 것 6·7, Task 2)
//
//   guardianPush (safehour.v2.<계정 키>.guardianPush)
//     { subs, status, gone }
//     subs:   Array<{ watchId, subId, lang, endpointHash, vapidKey }>  최대 10, watchId 가 겹치지 않는다(나중 것)
//             endpointHash 는 구독 endpoint 의 SHA-256(채움 없는 base64url 43자), vapidKey 는 구독 때 쓴 VAPID 공개키(공개 값)
//     status: Array<{ watchId, date, confirmed, muted, active, atMs }>  최대 10, watchId 가 겹치지 않는다(나중 것)
//             date 는 서버가 준 오늘(KST), confirmed 는 HH:MM 최대 10, active 는 subscriptionActive(subId 없이 조회했으면 null),
//             atMs 는 조회를 받은 기기 시각
//     gone:   string[]  404 를 받은 watchId, 최대 10, 겹치지 않는다(나중 것)
//
// - 허용 목록 필드만 새로 만들어 담는다. 구독 endpoint 원문, p256dh, auth 와 모르는 필드는 들어와도 버린다(주소는 해시만 둔다)
// - 레코드가 객체가 아니면 null 이다. 세 목록은 목록이 아니면 빈 목록이고, 틀린 항목만 버리며 상한을 넘으면 오래된 것(앞)부터 버린다
// - status 항목은 confirmed 에 HH:MM 이 아닌 값이 하나라도 있거나 10개를 넘으면 통째로 버린다(일부만 살리지 않는다:
//   응답 읽기 src/guardian/pushRequests.js readStatusData 와 같은 판정)
//
// 순수 함수다. 저장소·네트워크·브라우저 API 를 쓰지 않는다.

import { LANGS } from '../../src/i18n/index.js';
import { SUB_ID_RE } from '../../src/guardian/pushRequests.js';
import { WATCH_ID_RE, WATCH_UPLOAD_MAX_PER_DAY } from '../../src/guardian/watchRequests.js';
import { isClockTime, isDateString } from '../../src/stay/time.js';

/** subs, status, gone 각각의 상한 */
export const GUARDIAN_PUSH_MAX = 10;

/** endpoint 의 SHA-256(32바이트)을 채움 없는 base64url 로 적은 43자 */
const ENDPOINT_HASH_RE = /^[A-Za-z0-9_-]{43}$/;
/**
 * VAPID 공개키: P-256 비압축 점 65바이트(첫 바이트 0x04)를 채움 없는 base64url 로 적은 87자.
 * 첫 글자는 0x04 의 앞 6비트라 'B' 이고, 마지막 글자는 남는 2비트가 0 인 글자다(설정 읽기 readConfigData 가 돌려주는 모양과 같다).
 */
const VAPID_KEY_RE = /^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$/;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWatchId = (value) => typeof value === 'string' && WATCH_ID_RE.test(value);

function isSub(item) {
  return (
    isPlainObject(item) &&
    isWatchId(item.watchId) &&
    typeof item.subId === 'string' &&
    SUB_ID_RE.test(item.subId) &&
    LANGS.includes(item.lang) &&
    typeof item.endpointHash === 'string' &&
    ENDPOINT_HASH_RE.test(item.endpointHash) &&
    typeof item.vapidKey === 'string' &&
    VAPID_KEY_RE.test(item.vapidKey)
  );
}

function isStatus(item) {
  return (
    isPlainObject(item) &&
    isWatchId(item.watchId) &&
    isDateString(item.date) &&
    Array.isArray(item.confirmed) &&
    item.confirmed.length <= WATCH_UPLOAD_MAX_PER_DAY &&
    item.confirmed.every((time) => isClockTime(time)) &&
    typeof item.muted === 'boolean' &&
    (item.active === null || typeof item.active === 'boolean') &&
    Number.isSafeInteger(item.atMs) &&
    item.atMs >= 0
  );
}

/** 맞는 항목만 허용 목록 모양으로 새로 만들고, 같은 키는 나중 것 하나, 상한을 넘으면 오래된 것(앞)부터 버린다 */
function latestUnique(value, isValid, keyOf, pick) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const newestFirst = [];
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const item = value[i];
    if (!isValid(item)) continue;
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    newestFirst.push(pick(item));
  }
  return newestFirst.reverse().slice(-GUARDIAN_PUSH_MAX);
}

/**
 * 기록 원문의 subs 에서 해지 항목 { watchId, subId } 만 뽑는다. watchId·subId 형식만 보고 다른 필드(언어, 해시, 키)는 보지 않는다:
 * 지우기 경로는 기록의 다른 필드가 깨졌어도 식별 값이 맞으면 서버 삭제 대기에 넣는다(A-2 지켜보기와 같은 규칙, 정한 값 13).
 * 겹침과 상한은 서버 삭제 대기 쪽(normalizePendingDelete)이 맡는다.
 * @param {unknown} value
 * @returns {Array<{ watchId: string, subId: string }>}
 */
export function guardianPushSubIds(value) {
  if (!isPlainObject(value) || !Array.isArray(value.subs)) return [];
  return value.subs
    .filter((item) => isPlainObject(item) && isWatchId(item.watchId) && typeof item.subId === 'string' && SUB_ID_RE.test(item.subId))
    .map((item) => ({ watchId: item.watchId, subId: item.subId }));
}

/**
 * guardianPush 레코드. 객체가 아니면 null.
 * @param {unknown} value
 * @returns {{ subs: Array<{ watchId: string, subId: string, lang: string, endpointHash: string, vapidKey: string }>,
 *   status: Array<{ watchId: string, date: string, confirmed: string[], muted: boolean, active: boolean|null, atMs: number }>,
 *   gone: string[] } | null}
 */
export function normalizeGuardianPush(value) {
  if (!isPlainObject(value)) return null;
  return {
    subs: latestUnique(
      value.subs,
      isSub,
      (item) => item.watchId,
      ({ watchId, subId, lang, endpointHash, vapidKey }) => ({ watchId, subId, lang, endpointHash, vapidKey }),
    ),
    status: latestUnique(
      value.status,
      isStatus,
      (item) => item.watchId,
      ({ watchId, date, confirmed, muted, active, atMs }) => ({ watchId, date, confirmed: [...confirmed], muted, active, atMs }),
    ),
    gone: latestUnique(value.gone, isWatchId, (watchId) => watchId, (watchId) => watchId),
  };
}
