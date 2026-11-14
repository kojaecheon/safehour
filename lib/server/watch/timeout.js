// 시간 한도가 있는 바깥 호출 (Upstash, QStash)
//
// AbortSignal.timeout 을 쓰지 않는 까닭: 그 타이머는 이벤트 루프를 붙잡지 않는다(unref). 응답을 기다리는 동안 다른 할 일이
// 없으면 Node 22 의 테스트 실행기는 기다리던 약속을 끝나지 않은 채 취소한다(CI 는 Node 22다). 여기서는 붙잡는 타이머로 끊고,
// 호출이 끝나면(본문 읽기까지) 타이머를 지운다.

/**
 * run(signal) 을 부르고, timeoutMs 가 지나면 signal 을 끊는다. 본문 읽기까지 run 안에서 하면 그것도 한도 안에 든다.
 * @template T
 * @param {number} timeoutMs
 * @param {(signal: AbortSignal) => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function withTimeout(timeoutMs, run) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('시간 한도를 넘었습니다.', 'TimeoutError')), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
