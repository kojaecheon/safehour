// 선 아이콘 모음 (AX-304 · spec 7장)
//
// - 파일을 내려받지 않는다. 모든 아이콘은 인라인 SVG 경로다.
// - 아이콘은 **보조 신호**다. 상태·배지·출처는 늘 문구와 함께 쓴다(색·모양만으로 구분하지 않는다).
// - 장식이므로 aria-hidden 이다. 뜻은 옆의 문구가 전한다.
// - 선 색은 currentColor — 글자 색을 따라가므로 대비는 글자 대비와 같다.
// - 이름이 Fill 로 끝나면 채운 모양이다(하단 내비 현재 칸 — SEED 는 현재 칸을 채운 아이콘으로 보인다).

const PATHS = {
  // 셸
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3Z" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  phone: (
    <path d="M6.6 3.5h2.6l1.6 4.2-2.1 1.4a11.5 11.5 0 0 0 6.2 6.2l1.4-2.1 4.2 1.6v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />
  ),
  phoneFill: (
    <path
      fill="currentColor"
      d="M6.6 3.5h2.6l1.6 4.2-2.1 1.4a11.5 11.5 0 0 0 6.2 6.2l1.4-2.1 4.2 1.6v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"
    />
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  // 안내 상자(SEED Callout) 앞 아이콘 — 원 + i
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.01" />
    </>
  ),
  // 하단 내비
  navToday: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  navTrip: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="8.5" cy="14.5" r="1" />
      <circle cx="12" cy="14.5" r="1" />
    </>
  ),
  navConditions: (
    <>
      <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
      <circle cx="15" cy="6.5" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </>
  ),
  navMore: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
    </>
  ),
  navTodayFill: (
    <>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  navTripFill: (
    <>
      <path d="M8 3v3.5M16 3v3.5" />
      <path stroke="none" fill="currentColor" d="M6 4.5h12a3 3 0 0 1 3 3v2H3v-2a3 3 0 0 1 3-3Z" />
      <path stroke="none" fill="currentColor" d="M3 11h18v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" />
    </>
  ),
  navConditionsFill: (
    <>
      <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
      <circle cx="15" cy="6.5" r="2.5" fill="currentColor" />
      <circle cx="9" cy="12" r="2.5" fill="currentColor" />
      <circle cx="17" cy="17.5" r="2.5" fill="currentColor" />
    </>
  ),
  navMoreFill: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" fill="currentColor" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" fill="currentColor" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" fill="currentColor" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" fill="currentColor" />
    </>
  ),
  // 상태 — 모양이 서로 달라 색을 못 보는 사람도 구분할 수 있다
  stateTogether: (
    <>
      <circle cx="8.5" cy="7" r="2.6" />
      <circle cx="15.5" cy="7" r="2.6" />
      <path d="M3.5 19.5v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M13.5 13.5h1a4 4 0 0 1 4 4v2" />
    </>
  ),
  stateSplit: (
    <>
      <circle cx="16" cy="6.5" r="2.6" />
      <path d="M11.5 20v-3a4.5 4.5 0 0 1 9 0v3" />
      <path d="M3 13.5 7 10l4 3.5M4.5 12.3V19h5v-6.7" />
    </>
  ),
  stateStandby: (
    <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5.5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5.5-4 8.5s4 4 4 8.5" />
  ),
  stateNoTourism: <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7Z" />,
  // 배지
  estimate: <path d="M5 9.5c2-2 4-2 7 0s5 2 7 0M5 15c2-2 4-2 7 0s5 2 7 0" />,
  defaulted: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8 7.5 9.5 4.4-1.5 7.5-5.1 7.5-9.5V6L12 3Z" />
      <path d="M12 8v5M12 16v.5" />
    </>
  ),
  clockQuestion: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  demo: (
    <>
      <path d="M9.5 3.5h5M10.5 3.5v5.2L5 18a1.8 1.8 0 0 0 1.6 2.5h10.8A1.8 1.8 0 0 0 19 18l-5.5-9.3V3.5" />
      <path d="M7.4 14h9.2" />
    </>
  ),
  // 출처
  hospital: (
    <>
      <path d="M4.5 20.5V6.5l7.5-3 7.5 3v14" />
      <path d="M3 20.5h18M12 8.5v5M9.5 11h5M10 20.5v-3.5h4v3.5" />
    </>
  ),
  selfCheck: (
    <>
      <circle cx="9.5" cy="7.5" r="3" />
      <path d="M3.5 19.5v-1a5 5 0 0 1 5-5h2" />
      <path d="m14 17 2.2 2.2L21 14.5" />
    </>
  ),
  calculator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 7h7M8.5 11.5h.5M11.8 11.5h.5M15 11.5h.5M8.5 15h.5M11.8 15h.5M15 15v2.5M8.5 18h.5M11.8 18h.5" />
    </>
  ),
  quote: (
    <>
      <path d="M5 18.5V13c0-3.5 1.6-6 5-7.5M14 18.5V13c0-3.5 1.6-6 5-7.5" />
      <path d="M5 13h4.5v5.5H5zM14 13h4.5v5.5H14z" />
    </>
  ),
  ai: (
    <>
      <path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17.5h-1A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M8 14l2-5.5 2 5.5M8.7 12.2h2.6M15.5 8.5V14" />
    </>
  ),
  // 타임라인
  depart: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5v10h13v-10" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V3.5" />
      <path d="M5.5 4h11.5l-2.5 4 2.5 4H5.5" />
    </>
  ),
  meal: (
    <>
      <path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v5" />
      <path d="M16.5 21V3c-2 1-3.5 3.5-3.5 7s1.5 4 3.5 4" />
    </>
  ),
  pill: (
    <>
      <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)" />
      <path d="m9.7 9.3 5 5" />
    </>
  ),
  bed: (
    <>
      <path d="M3 19.5V6M3 15.5h18v4M3 11.5h18v4" />
      <path d="M21 11.5V10a2.5 2.5 0 0 0-2.5-2.5H11v4" />
      <circle cx="7" cy="9" r="1.8" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="m9 21 2.5-6.5 3 2.5v4.5M8 10.5l3-3h3l2.5 4 2.5 1M11.5 14.5 13 9" />
    </>
  ),
  car: (
    <>
      <path d="M4.5 16.5v-4l2-5a1.5 1.5 0 0 1 1.4-1h8.2a1.5 1.5 0 0 1 1.4 1l2 5v4" />
      <path d="M3.5 16.5h17v2.5h-3v-2.5M6.5 19v-2.5M3.5 12.5h17" />
      <circle cx="7.5" cy="14.5" r=".6" />
      <circle cx="16.5" cy="14.5" r=".6" />
    </>
  ),
  transit: (
    <>
      <rect x="5" y="3.5" width="14" height="14" rx="3" />
      <path d="M5 11h14M8.5 21l1.5-3.5M15.5 21 14 17.5" />
      <circle cx="9" cy="14.3" r=".6" />
      <circle cx="15" cy="14.3" r=".6" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5l-6-2Z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
};

/** 쓸 수 있는 아이콘 이름 — 시안 보드·테스트용 */
export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

/**
 * @param {{ name: keyof typeof PATHS, size?: number, className?: string, strokeWidth?: number }} props
 */
export default function Icon({ name, size = 20, className, strokeWidth = 2 }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

/** 4상태 → 아이콘 이름. 상태 표시는 늘 이 아이콘 + 상태 라벨 문구를 함께 쓴다 */
export const STATE_ICON = Object.freeze({
  TOGETHER: 'stateTogether',
  SPLIT_NEARBY: 'stateSplit',
  STANDBY: 'stateStandby',
  NO_TOURISM: 'stateNoTourism',
});
