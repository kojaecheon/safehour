// 보호자 링크 오류 (AX-313 · docs/security.md '보호자 링크')
//
// 화면은 `code` 로 문구를 고른다. 사용자 문구는 i18n 사전이 소유한다.
// 메시지에는 PIN·암호문·스냅샷 내용을 넣지 않는다.

export const GUARDIAN_ERROR = Object.freeze({
  /** PIN 이 정확히 6자리 숫자가 아님 — 오류 횟수에 세지 않는다 */
  INVALID_PIN: 'GUARDIAN_INVALID_PIN',
  /** PIN 이 틀림(또는 암호문 변조 — 인증 암호화는 둘을 구별하지 못한다) — 오류 횟수에 센다 */
  WRONG_PIN: 'GUARDIAN_WRONG_PIN',
  /** 연속 오류로 이 기기에서 이 링크가 잠김 */
  LOCKED: 'GUARDIAN_LOCKED',
  /** 링크·암호문 형식이 틀림 — 오류 횟수에 세지 않는다 */
  INVALID_LINK: 'GUARDIAN_INVALID_LINK',
  /** 풀었지만 스냅샷 모양이 아님, 또는 스냅샷이 아닌 값을 암호화하려 함 */
  INVALID_SNAPSHOT: 'GUARDIAN_INVALID_SNAPSHOT',
  /** 풀었지만 평문 형식 표지를 모르거나, 이 환경에 압축 해제 기능(DecompressionStream 'deflate-raw')이 없음 */
  UNSUPPORTED_FORMAT: 'GUARDIAN_UNSUPPORTED_FORMAT',
  /** 만료 시각(출국일 23:59 KST)이 지남 — 보여 주지 않는다 */
  EXPIRED: 'GUARDIAN_EXPIRED',
  /** 표준 브라우저 암호 기능(crypto.subtle)을 쓸 수 없음 — 보안 컨텍스트(https·localhost)가 아님 등 */
  CRYPTO_UNAVAILABLE: 'GUARDIAN_CRYPTO_UNAVAILABLE',
});

export class GuardianError extends Error {
  /**
   * @param {string} code  GUARDIAN_ERROR 값
   * @param {string} message
   * @param {{remainingAttempts?: number, lockedUntil?: number|null}} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GuardianError';
    this.code = code;
    if (details.remainingAttempts !== undefined) this.remainingAttempts = details.remainingAttempts;
    if (details.lockedUntil !== undefined) this.lockedUntil = details.lockedUntil;
  }
}
