// 메모리 Storage (AX-312)
//
// 브라우저 영구 저장소를 쓸 수 없을 때(서버 렌더링, 저장소 접근 차단)의 대체물이다.
// 페이지를 닫으면 사라진다 — 저장소 상태의 `persistent: false` 로 화면에 알린다.

export function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key) {
      return map.has(String(key)) ? map.get(String(key)) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };
}
