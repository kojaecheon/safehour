// 보호자 링크 보낸 기록과 '다시 보내기' 판단 (AX-320 · spec 4.11, 5.1 guardianShare)
//
// 순수 모듈이다(React·브라우저 저장소 없음). 링크를 만드는 화면(/guardian)과
// 오늘 화면(변화 감지)이 **같은 함수**로 판단해야 '다시 보내기' 안내가 어긋나지 않는다.
//
// 일정 지문(planFingerprint)의 내용
//   - 보호자 스냅샷에서 만든 시각(createdAt)·만료 시각(expiresAt)을 뺀 것: { v, lang, days, emergency }.
//     만든 시각은 부를 때마다 바뀌고, 만료 시각은 출국일에서 나오며 출국일 변화는 days 에 이미 드러난다.
//   - 날짜는 **링크를 보낸 날(KST)부터 7일**(출국일에서 멈춤)이다. 보낼 때 스냅샷이 그 범위를 담기 때문이다.
//     다시 판단할 때도 보낸 시각(lastSentAt)을 기준으로 스냅샷을 다시 만들어 같은 날짜 범위를 비교한다.
//     그래서 날이 바뀌었다는 이유만으로 '다시 보내기'가 뜨지 않는다(지난 날짜의 일정은 바뀌지 않는다 — spec 7.2).
//   - 스냅샷에 담기지 않는 값(병원 정보, 조건 세부, 마감 이유 등)이 바뀌어도 지문은 그대로다.

import { GUARDIAN_LANGS, buildGuardianSnapshot } from '../../src/guardian/index.js';
import { parseInstantMs } from '../../src/stay/index.js';
import { FINGERPRINT_PATTERN, planFingerprint } from '../../lib/store/fingerprint.js';

const DEFAULT_SHARE_LANG = 'ko';

/**
 * 스냅샷 언어 — 일정(TripPlan)의 언어. 정거장 이름·주소가 그 언어로 들어 있기 때문이다.
 * 만들 때와 다시 판단할 때 같은 값을 써야 하므로 화면 언어에 기대지 않는다.
 * @param {{lang?: string} | null | undefined} tripPlan
 * @returns {'ko'|'en'|'ja'|'zh'}
 */
export function shareLang(tripPlan) {
  return GUARDIAN_LANGS.includes(tripPlan?.lang) ? tripPlan.lang : DEFAULT_SHARE_LANG;
}

/**
 * 지문에 넣을 내용 — 만든 시각·만료 시각을 뺀다.
 * @param {import('../../src/guardian/snapshot.js').GuardianSnapshot} snapshot
 * @param {{fromDate?: string}} [options]  이 날짜(YYYY-MM-DD) 이후만 담는다
 */
export function fingerprintContent(snapshot, { fromDate } = {}) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.days)) {
    throw new TypeError('fingerprintContent: 보호자 스냅샷이 필요합니다');
  }
  const days = typeof fromDate === 'string' ? snapshot.days.filter((d) => d?.date >= fromDate) : snapshot.days;
  return { v: snapshot.v, lang: snapshot.lang, days, emergency: snapshot.emergency };
}

/**
 * 보호자 스냅샷을 만든다 — 링크 만들기와 다시 보내기 판단이 같은 인자로 부른다.
 * @param {{stay: object, tripPlan: object, now?: Date|number|string}} args
 */
export function buildShareSnapshot({ stay, tripPlan, now }) {
  return buildGuardianSnapshot({ stay, tripPlan, now, lang: shareLang(tripPlan) });
}

/**
 * `since`(보낸 시각)의 날짜부터 본 현재 일정의 지문.
 * @returns {Promise<string>}
 */
export async function computeShareFingerprint({ stay, tripPlan, since }) {
  return planFingerprint(fingerprintContent(buildShareSnapshot({ stay, tripPlan, now: since })));
}

/**
 * 링크를 만든 순간의 guardianShare 기록 { lastSentAt, planFingerprint }.
 * @param {import('../../src/guardian/snapshot.js').GuardianSnapshot} snapshot  방금 암호화한 스냅샷
 */
export async function shareRecordFor(snapshot) {
  return { lastSentAt: snapshot.createdAt, planFingerprint: await planFingerprint(fingerprintContent(snapshot)) };
}

/**
 * '보호자 링크 다시 보내기'를 안내해야 하는가.
 *   - 보낸 적이 없음 → false
 *   - 체류·일정이 없거나 스냅샷을 만들 수 없음 → false (링크를 만들 수도 없다)
 *   - 기록이 깨짐(시각·지문 형식이 틀림) → true (무엇을 보냈는지 알 수 없다)
 *   - 보낸 날부터의 보호자 몫 내용이 지금과 다름 → true
 * 지금 시각에 기대지 않는다 — 같은 데이터면 언제 불러도 같은 답이다.
 *
 * @param {{stay: object|null, tripPlan: object|null, share: {lastSentAt: string, planFingerprint: string}|null}} args
 * @returns {Promise<boolean>}
 */
export async function isGuardianResendNeeded({ stay, tripPlan, share }) {
  if (!share) return false;
  if (!stay || !tripPlan) return false;
  const sentMs = typeof share.lastSentAt === 'string' ? parseInstantMs(share.lastSentAt) : null;
  if (sentMs === null || !FINGERPRINT_PATTERN.test(share.planFingerprint ?? '')) return true;
  let current;
  try {
    current = await computeShareFingerprint({ stay, tripPlan, since: sentMs });
  } catch {
    return false;
  }
  return current !== share.planFingerprint;
}
