// 기기 저장소, 키 이름과 공통 상수 (AX-312 · docs/security.md '기기 저장소와 계정 이름공간')
//
// 모든 키는 `safehour.v2.` 아래에 둔다.
//   - 계정 데이터:  safehour.v2.<accountKey>.<record>
//   - 기기 기록:    safehour.v2.device.<record>   (언어, 마지막 로그인 계정 키)
//   - 탭 임시 보관: safehour.v2.tab.<record>      (sessionStorage — 보호자 링크 암호문만)
//
// '이 기기에서 내 정보 지우기'는 `safehour.v2.` 아래 영구 저장 키를 **언어만 빼고 모두** 지운다.
// 새 저장 항목도 이 접두사 아래에 두면 자동으로 삭제 대상이 된다.
//
// 이 파일은 브라우저 API 를 쓰지 않는다 — node --test 에서 그대로 불러온다.

export const STORE_PREFIX = 'safehour.v2.';
export const SCHEMA_VERSION = 2;

/** 계정 이름공간 안의 항목 (docs/security.md '기기 저장소와 계정 이름공간'). 구독 주제 이름과 같다 */
export const RECORD = Object.freeze({
  /** Stay — 숙소·병원·일정·조건 기간(periods)·연동 지침(linkedPlans)·동의(consent)·보호자 공유(guardianShare) 포함 */
  stay: 'stay',
  /** TripPlan — days + edits */
  tripPlan: 'tripPlan',
  /** TodayEvents — { date, events } (KST 날짜가 바뀌면 지운다) */
  todayEvents: 'todayEvents',
  /** 계정별 설정 — { notifications, dailyCheck } (언어는 기기 기록) */
  prefs: 'prefs',
  /** 보호자 기기의 사본 — Record<id, GuardianCopy> */
  guardianCopies: 'guardianCopies',
  /** AI 소개 문장 캐시 — Record<입력 키, { intro, at }> */
  aiIntroCache: 'aiIntroCache',
  /** 알림 예약 — 배열 (모양은 알림 모듈이 정한다) */
  notificationSchedule: 'notificationSchedule',
  /** 이미 낸 마감 지남 알림 id 와 닫은 마감 지남 안내의 외출 id — { date, notified, dismissed } (KST 날짜가 바뀌면 지운다) */
  overdueSeen: 'overdueSeen',
});

export const ACCOUNT_RECORDS = Object.freeze(Object.values(RECORD));

/** 구독 주제 — 계정 항목 + 'status'(보기 전용 신호). '*' 는 모든 주제 */
export const TOPICS = Object.freeze([...ACCOUNT_RECORDS, 'status']);

const DEVICE_SEGMENT = 'device';
const TAB_SEGMENT = 'tab';

/** 기기 단위 기록 — 계정과 무관하다 */
export const DEVICE_KEY = Object.freeze({
  /** 사용자가 고른 언어. '내 정보 지우기' 뒤에도 남는다 (docs/security.md '기기 저장소와 계정 이름공간') */
  lang: `${STORE_PREFIX}${DEVICE_SEGMENT}.lang`,
  /** 이 기기에 마지막으로 로그인한 계정의 **불투명 키**, 보기 전용 읽기용 (docs/platform/IA_AND_FLOWS.md '보기 전용 상태') */
  lastAccountKey: `${STORE_PREFIX}${DEVICE_SEGMENT}.lastAccountKey`,
  /**
   * '내 정보 지우기' 뒤 로그아웃 요청이 서버에 닿지 않았다는 표시 — `{ since }` 만 담는다(계정 정보 없음).
   * 있는 동안에는 세션을 로그인으로 보지 않고, 온라인이 되면 로그아웃을 다시 보낸다 (lib/store/AGENTS.md).
   */
  logoutPending: `${STORE_PREFIX}${DEVICE_SEGMENT}.logoutPending`,
});

/** 탭 저장소(sessionStorage) 임시 보관 키, 보호자 링크 로그인 왕복 전용 (docs/security.md '기기 저장소와 계정 이름공간') */
export const TAB_KEY = Object.freeze({
  pendingGuardianLink: `${STORE_PREFIX}${TAB_SEGMENT}.pendingGuardianLink`,
});

/** 쓰기 실패 사유 */
export const STORE_ERROR = Object.freeze({
  /** 보기 전용 — 세션 없음·만료·오프라인 */
  READ_ONLY: 'READ_ONLY',
  NO_STAY: 'NO_STAY',
  NO_TRIP_PLAN: 'NO_TRIP_PLAN',
  /** 민감정보 동의 전에는 조건 기간·연동 지침을 저장하지 않는다 (docs/security.md '민감정보 동의') */
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  INVALID: 'INVALID',
  EXPIRED: 'EXPIRED',
  /** 저장 공간 부족·저장소 접근 차단 */
  STORAGE_FAILED: 'STORAGE_FAILED',
});

/** 보기 전용 이유 (docs/platform/IA_AND_FLOWS.md '보기 전용 상태') */
export const READ_ONLY_REASON = Object.freeze({
  NO_SESSION: 'NO_SESSION',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  OFFLINE: 'OFFLINE',
});

/**
 * 계정 키 형식. 서버는 base64url 43자를 준다(src/auth/session.js ACCOUNT_KEY_PATTERN).
 * 점(.)이 없어야 이름공간 경계를 넘을 수 없다. 16자 이상이라 'device'·'tab' 과 겹치지 않는다.
 */
const ACCOUNT_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function isAccountKey(value) {
  return typeof value === 'string' && ACCOUNT_KEY_RE.test(value);
}

/** safehour.v2.<accountKey>.<record> */
export function accountRecordKey(accountKey, record) {
  if (!isAccountKey(accountKey)) throw new TypeError('계정 키 형식이 올바르지 않습니다.');
  if (!ACCOUNT_RECORDS.includes(record)) throw new TypeError(`알 수 없는 저장 항목: ${String(record)}`);
  return `${STORE_PREFIX}${accountKey}.${record}`;
}

/**
 * 저장소 키를 해석한다.
 * @returns {{kind: 'account', accountKey: string, record: string} | {kind: 'device', record: string} | null}
 */
export function parseStoreKey(key) {
  if (typeof key !== 'string' || !key.startsWith(STORE_PREFIX)) return null;
  const rest = key.slice(STORE_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) return null;
  const head = rest.slice(0, dot);
  const record = rest.slice(dot + 1);
  if (head === DEVICE_SEGMENT) return { kind: 'device', record };
  if (isAccountKey(head) && ACCOUNT_RECORDS.includes(record)) return { kind: 'account', accountKey: head, record };
  return null;
}
