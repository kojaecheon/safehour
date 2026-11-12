// 더보기(/more) 메뉴 묶음 (AX-318 · docs/platform/IA_AND_FLOWS.md '경로', usability 2026-11-08 D1)
//
// 묶음마다 머리 문구 키와 항목(경로, 아이콘 이름, 이름·설명 문구 키)을 돌려주는 순수 함수다. 화면은 그리기만 한다.
// 이 기기에 보호자 사본(받은 일정)이 있으면 도구 맨 위에 '받은 일정(보호자)'를 둔다. 보호자가 /g 를 떠난 뒤에도
// 링크와 PIN 없이 받은 일정으로 돌아올 수 있게 한다. 사본이 없으면 예전 메뉴 그대로다.

const RECEIVED_ITEM = Object.freeze({ href: '/g', icon: 'navTrip', label: 'settings.moreReceived', desc: 'settings.moreReceivedDesc' });

const TOOL_ITEMS = Object.freeze([
  Object.freeze({ href: '/cards', icon: 'quote', label: 'cards.header', desc: 'settings.moreCardsDesc' }),
  Object.freeze({ href: '/guardian', icon: 'stateTogether', label: 'settings.moreGuardian', desc: 'settings.moreGuardianDesc' }),
  Object.freeze({ href: '/conditions', icon: 'navConditions', label: 'common.navConditions', desc: 'settings.moreConditionsDesc' }),
  Object.freeze({ href: '/onboarding?edit=1', icon: 'navTrip', label: 'settings.moreStay', desc: 'settings.moreStayDesc' }),
  Object.freeze({ href: '/settings', icon: 'globe', label: 'settings.header', desc: 'settings.moreSettingsDesc' }),
]);

const INFO_GROUP = Object.freeze({
  id: 'more-info',
  label: 'settings.moreGroupInfo',
  items: Object.freeze([
    Object.freeze({ href: '/help', icon: 'info', label: 'help.header', desc: 'help.moreDesc' }),
    Object.freeze({ href: '/privacy', icon: 'lock', label: 'privacy.link', desc: 'settings.morePrivacyDesc' }),
  ]),
});

const WITHOUT_RECEIVED = Object.freeze([Object.freeze({ id: 'more-tools', label: 'settings.moreGroupTools', items: TOOL_ITEMS }), INFO_GROUP]);
const WITH_RECEIVED = Object.freeze([
  Object.freeze({ id: 'more-tools', label: 'settings.moreGroupTools', items: Object.freeze([RECEIVED_ITEM, ...TOOL_ITEMS]) }),
  INFO_GROUP,
]);

/**
 * @param {{ hasGuardianCopies?: boolean }} [options] 이 기기에 만료 전 보호자 사본이 있는가
 * @returns {ReadonlyArray<{ id: string, label: string, items: ReadonlyArray<{ href: string, icon: string, label: string, desc: string }> }>}
 */
export function moreMenuGroups({ hasGuardianCopies = false } = {}) {
  return hasGuardianCopies ? WITH_RECEIVED : WITHOUT_RECEIVED;
}
