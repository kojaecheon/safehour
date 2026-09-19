'use client';

// 보호자 화면용 훅 (AX-320 · spec 4.11, 4.18)
//
//   useHydrated()               서버 렌더·하이드레이션 중 false, 그 뒤 true — 저장소 값을 그리기 전에 확인한다
//   useStoreRecord(topic, read) 기기 저장소 값을 구독한다(바뀌지 않으면 같은 참조)
//   useGuardianResendNeeded()   '보호자 링크 다시 보내기'를 안내할지 — 오늘 화면이 그대로 가져다 쓴다
//   useIncomingLink()           /g 가 열 암호문: 주소의 # 뒤, 없으면 로그인 왕복 임시 보관(탭 저장소)
//
// 암호문은 주소의 # 뒤와 탭 저장소에서만 읽는다. 서버 요청·로그에 싣지 않는다(규칙 38).

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getStore } from '@/lib/store/index.js';
import { parseGuardianLink } from '@/src/guardian/index.js';
import { createGuardianLockout } from './lockoutStorage.js';
import { isGuardianResendNeeded } from './share.js';

const noopSubscribe = () => () => {};

/** 클라이언트에서 그려도 되는가 — 하이드레이션 불일치를 만들지 않는다 */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * 기기 저장소 값 구독. 계정이 바뀌면(status) 다시 읽는다.
 * @param {'stay'|'tripPlan'|'guardianCopies'} topic
 * @param {(store: ReturnType<typeof getStore>) => any} read  바뀌지 않았으면 같은 참조를 돌려주는 읽기
 */
export function useStoreRecord(topic, read) {
  const subscribe = useCallback(
    (onChange) => {
      const store = getStore();
      const offTopic = store.subscribe(topic, onChange);
      const offStatus = store.subscribe('status', onChange);
      return () => {
        offTopic();
        offStatus();
      };
    },
    [topic],
  );
  return useSyncExternalStore(
    subscribe,
    () => read(getStore()),
    () => null,
  );
}

const readStay = (store) => store.readStay();
const readTripPlan = (store) => store.readTripPlan();

/**
 * '보호자 링크 다시 보내기'를 안내해야 하는가 (spec 4.11 — 환자 일정이 바뀌면 환자 화면에 안내).
 * 판단은 share.js 의 isGuardianResendNeeded 하나다(링크 만들기 화면과 같은 함수).
 *
 * @returns {{needed: boolean, checked: boolean, share: {lastSentAt: string, planFingerprint: string} | null}}
 *   checked: 지금 체류·일정으로 판단을 마쳤는가(마치기 전 needed 는 false)
 */
export function useGuardianResendNeeded() {
  const stay = useStoreRecord('stay', readStay);
  const tripPlan = useStoreRecord('tripPlan', readTripPlan);
  const share = stay?.guardianShare ?? null;
  const [result, setResult] = useState({ stay: undefined, tripPlan: undefined, needed: false });

  useEffect(() => {
    let cancelled = false;
    isGuardianResendNeeded({ stay, tripPlan, share }).then(
      (needed) => {
        if (!cancelled) setResult({ stay, tripPlan, needed });
      },
      () => {
        if (!cancelled) setResult({ stay, tripPlan, needed: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [stay, tripPlan, share]);

  const checked = result.stay === stay && result.tripPlan === tripPlan;
  return { needed: checked && result.needed, checked, share };
}

// ── /g 가 열 암호문 ──────────────────────────────────────────────

const incomingListeners = new Set();

/** 암호문 출처가 바뀌었음을 알린다(가져오기 뒤 주소 정리·임시 보관 삭제) */
export function notifyIncomingLink() {
  for (const listener of [...incomingListeners]) listener();
}

function subscribeIncoming(onChange) {
  incomingListeners.add(onChange);
  window.addEventListener('hashchange', onChange);
  return () => {
    incomingListeners.delete(onChange);
    window.removeEventListener('hashchange', onChange);
  };
}

/** 문자열 스냅샷 — '' 없음, 'invalid' 형식 오류, 'hash:<암호문>', 'pending:<암호문>' */
function readIncoming() {
  const hash = window.location.hash;
  if (hash && hash !== '#') {
    const fragment = parseGuardianLink(hash);
    return fragment ? `hash:${fragment}` : 'invalid';
  }
  const pending = getStore().takePendingGuardianLink();
  return pending ? `pending:${pending}` : '';
}

/**
 * @returns {{ready: boolean, fragment: string|null, source: 'hash'|'pending'|null, invalid: boolean}}
 */
export function useIncomingLink() {
  const raw = useSyncExternalStore(subscribeIncoming, readIncoming, () => null);
  if (raw === null) return { ready: false, fragment: null, source: null, invalid: false };
  if (raw === 'invalid') return { ready: true, fragment: null, source: null, invalid: true };
  if (raw === '') return { ready: true, fragment: null, source: null, invalid: false };
  const colon = raw.indexOf(':');
  return { ready: true, fragment: raw.slice(colon + 1), source: raw.slice(0, colon), invalid: false };
}

/** 주소에서 # 뒤(암호문)를 지운다 — 가져온 뒤 방문 기록·주소창에 암호문을 남기지 않는다 */
export function stripLinkFromAddress() {
  if (!window.location.hash) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

// ── PIN 잠금 기록기 (기기 단위, localStorage — safehour.v2. 아래) ─────────────

let sharedLockout = null;

function browserLocalStorage() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 이 탭에서 함께 쓰는 잠금 기록기 — 저장소를 쓸 수 없으면 이 화면의 메모리에 둔다 */
export function guardianLockout() {
  sharedLockout ??= createGuardianLockout(browserLocalStorage());
  return sharedLockout;
}
