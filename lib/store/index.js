// 기기 저장소, 공개 진입점 (AX-312 · docs/platform/IA_AND_FLOWS.md '보기 전용 상태', docs/security.md '기기 저장소와 계정 이름공간')
//
// 화면은 getStore() 로 브라우저 기본 인스턴스를 받는다.
//   - localStorage(영구) + sessionStorage(보호자 링크 임시 보관·기존 키 삭제)를 쓴다.
//   - 만들 때 온라인 상태·다른 탭 변경을 연결하고, **앱 열기 정리(onAppOpen)** 를 한 번 실행한다
//     어느 화면이 먼저 열려도 출국 7일 후 삭제(docs/business-rules.md '체류')가 먼저 일어난다.
//   - 세션은 화면(셸)이 `await getStore().refreshSession()` 으로 반영한다. 그 전까지는 보기 전용이다.
// 서버 렌더링 중에는 비어 있는 잠긴 인스턴스를 돌려준다(요청 사이에 데이터가 섞이지 않는다).
//
// 테스트와 다른 모듈은 createStore 에 저장소를 주입해 쓴다.

import { createMemoryStorage } from './memoryStorage.js';
import { createStore } from './store.js';

export {
  ACCOUNT_RECORDS,
  DEVICE_KEY,
  READ_ONLY_REASON,
  RECORD,
  SCHEMA_VERSION,
  STORE_ERROR,
  STORE_PREFIX,
  TAB_KEY,
  TOPICS,
  accountRecordKey,
  isAccountKey,
  parseStoreKey,
} from './keys.js';
export {
  AI_INTRO_CACHE_MAX,
  SUPPORTED_LANGS,
  createStore,
  instructionAckKey,
  isInstructionAcknowledged,
  todayKst,
} from './store.js';
export { FINGERPRINT_PATTERN, canonicalJson, planFingerprint } from './fingerprint.js';
export {
  PENDING_GUARDIAN_LINK_KEY,
  PENDING_GUARDIAN_LINK_TTL_MS,
  clearPendingGuardianLink,
  holdPendingGuardianLink,
  normalizeGuardianFragment,
  takePendingGuardianLink,
} from './pendingGuardianLink.js';
export { createMemoryStorage } from './memoryStorage.js';

/** 저장소를 실제로 쓸 수 있는지 확인한다 — 사생활 보호 모드·차단 설정에서는 접근이 예외를 던진다 */
function usableStorage(getStorage) {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const probe = '__safehour_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

let browserStore = null;
let serverStore = null;

/** 브라우저 기본 인스턴스. 서버에서는 비어 있는 잠긴 인스턴스 */
export function getStore() {
  if (typeof window === 'undefined') {
    serverStore ??= createStore({ storage: createMemoryStorage(), locked: true });
    return serverStore;
  }
  if (!browserStore) {
    const win = window;
    browserStore = createStore({
      storage: usableStorage(() => win.localStorage) ?? undefined,
      tabStorage: usableStorage(() => win.sessionStorage),
      online: win.navigator?.onLine !== false,
      timers: { setTimeout: win.setTimeout.bind(win), clearTimeout: win.clearTimeout.bind(win) },
    });
    browserStore.attachWindow(win);
    browserStore.onAppOpen();
  }
  return browserStore;
}

/** '이 기기에서 내 정보 지우기': 기본 인스턴스로 실행한다 (docs/security.md '기기 저장소와 계정 이름공간') */
export function deleteAllMyData() {
  return getStore().deleteAllMyData();
}
