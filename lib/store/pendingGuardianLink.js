// 보호자 링크 로그인 왕복 임시 보관 (AX-312 · spec 4.11, 4.19)
//
// 로그인하지 않은 채 `/g#<암호문>` 을 열면 로그인 왕복 동안 `#` 뒤 암호문을 잃는다
// (조각은 서버로 가지 않으므로 returnTo 로도 되살릴 수 없다). 그래서 **탭 저장소(sessionStorage)** 에
// 잠시 둔다. 탭 저장소 사용 중단의 유일한 예외다.
//   - 담는 것: 암호문(base64url)과 보관 시각. 그 외에는 아무것도 담지 않는다(PIN·평문 불가).
//   - 가져오기가 끝나면 clear 로 지운다. 1시간이 지나면 읽을 때 지운다.
//   - take 는 지우지 않는다 — PIN 입력 중 새로고침해도 이어서 가져올 수 있어야 한다.
//
// 저장소와 시각은 인자로 받는다 — 테스트와 화면이 같은 함수를 쓴다.

import { STORE_ERROR, TAB_KEY } from './keys.js';

export const PENDING_GUARDIAN_LINK_KEY = TAB_KEY.pendingGuardianLink;

/** 1시간 (spec 4.11) */
export const PENDING_GUARDIAN_LINK_TTL_MS = 60 * 60 * 1000;

const FRAGMENT_RE = /^[A-Za-z0-9_-]+$/;
/** 링크 조각 상한 — 체류 45박 스냅샷도 충분히 들어간다 */
const MAX_FRAGMENT_LENGTH = 1_000_000;

/** `#` 를 떼고 base64url 암호문만 남긴다. 형식이 아니면 null */
export function normalizeGuardianFragment(value) {
  if (typeof value !== 'string') return null;
  const fragment = value.startsWith('#') ? value.slice(1) : value;
  if (fragment.length === 0 || fragment.length > MAX_FRAGMENT_LENGTH) return null;
  return FRAGMENT_RE.test(fragment) ? fragment : null;
}

function remove(tabStorage) {
  try {
    tabStorage?.removeItem(PENDING_GUARDIAN_LINK_KEY);
  } catch {
    // 저장소 접근이 막혀 있으면 지울 것도 없다
  }
}

/**
 * 암호문을 보관한다.
 * @returns {{ok: true} | {ok: false, code: string}}
 */
export function holdPendingGuardianLink(tabStorage, fragment, nowMs) {
  const clean = normalizeGuardianFragment(fragment);
  if (!clean || !Number.isFinite(nowMs)) return { ok: false, code: STORE_ERROR.INVALID };
  if (!tabStorage) return { ok: false, code: STORE_ERROR.STORAGE_FAILED };
  try {
    tabStorage.setItem(PENDING_GUARDIAN_LINK_KEY, JSON.stringify({ fragment: clean, savedAt: nowMs }));
    return { ok: true };
  } catch {
    return { ok: false, code: STORE_ERROR.STORAGE_FAILED };
  }
}

/**
 * 보관한 암호문을 읽는다(지우지 않는다). 없거나 1시간이 지났거나 형식이 깨졌으면 null 이고, 기록을 지운다.
 * @returns {string | null}
 */
export function takePendingGuardianLink(tabStorage, nowMs) {
  let raw = null;
  try {
    raw = tabStorage?.getItem(PENDING_GUARDIAN_LINK_KEY) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;

  let record = null;
  try {
    record = JSON.parse(raw);
  } catch {
    record = null;
  }
  const fragment = normalizeGuardianFragment(record?.fragment);
  const savedAt = record?.savedAt;
  const age = nowMs - savedAt;
  if (!fragment || !Number.isFinite(savedAt) || !(age >= 0) || age >= PENDING_GUARDIAN_LINK_TTL_MS) {
    remove(tabStorage);
    return null;
  }
  return fragment;
}

/** 가져오기가 끝나면 지운다 */
export function clearPendingGuardianLink(tabStorage) {
  remove(tabStorage);
}
