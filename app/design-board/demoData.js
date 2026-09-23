// 시안 보드 고정 데모 데이터 (AX-304 · spec 7장 '고정 데모 데이터만 쓰고 사용자 데이터는 읽지 않는다')
//
// - 저장소·세션·서버를 부르지 않는다. 이 파일의 상수만 쓴다.
// - 사진은 네트워크 없이 그려지는 SVG data URI 다(외부 호출 0건). 실제 관광공사 사진이 아니다.
// - 사람이 읽는 문구는 designBoard 이름공간(src/i18n/messages/designBoard.js)에 있다.

/** 대비를 보여줄 글자·바탕 짝 — 토큰 이름만 적는다. 값은 화면이 globals.css 에서 읽어 계산한다 */
export const CONTRAST_GROUPS = [
  {
    key: 'designBoard.groupBase',
    pairs: [
      { fg: '--ink', bg: '--bg' },
      { fg: '--ink-soft', bg: '--bg' },
      { fg: '--ink', bg: '--surface-alt' },
      { fg: '--ink-soft', bg: '--surface-alt' },
      { fg: '--line-input', bg: '--bg', ui: true },
      { fg: '--line-input', bg: '--surface-alt', ui: true },
    ],
  },
  {
    key: 'designBoard.groupLayer',
    pairs: [
      { fg: '--ink', bg: '--layer-basement' },
      { fg: '--ink-soft', bg: '--layer-basement' },
      { fg: '--accent', bg: '--layer-basement' },
      { fg: '--line-input', bg: '--layer-basement', ui: true },
      { fg: '--on-dark', bg: '--selected' },
      { fg: '--ink-subtle', bg: '--bg', ui: true },
      { fg: '--line-contrast', bg: '--bg', ui: true },
    ],
  },
  {
    key: 'designBoard.groupAccent',
    pairs: [
      { fg: '--accent-ink', bg: '--accent' },
      { fg: '--accent', bg: '--bg' },
      { fg: '--accent-strong', bg: '--bg' },
      { fg: '--accent-strong', bg: '--accent-soft' },
      { fg: '--ink-soft', bg: '--accent-soft' },
    ],
  },
  {
    key: 'designBoard.groupSupport',
    pairs: [
      { fg: '--support-ink', bg: '--support-soft' },
      { fg: '--support-ink', bg: '--bg' },
      { fg: null, bg: '--support', decorative: true },
    ],
  },
  {
    key: 'designBoard.groupState',
    pairs: [
      { fg: '--state-together-ink', bg: '--state-together-bg', state: 'TOGETHER' },
      { fg: '--state-split-ink', bg: '--state-split-bg', state: 'SPLIT_NEARBY' },
      { fg: '--state-standby-ink', bg: '--state-standby-bg', state: 'STANDBY' },
      { fg: '--state-no-tourism-ink', bg: '--state-no-tourism-bg', state: 'NO_TOURISM' },
    ],
  },
  {
    key: 'designBoard.groupEmergency',
    pairs: [
      { fg: '--emergency-ink', bg: '--emergency' },
      { fg: '--on-dark', bg: '--ink' },
    ],
  },
  {
    key: 'designBoard.groupSource',
    pairs: [
      { fg: '--source-hospital', bg: '--source-hospital-bg' },
      { fg: '--source-hospital', bg: '--bg' },
      { fg: '--source-ai', bg: '--source-ai-bg' },
      { fg: '--on-dark', bg: '--badge-readonly-bg' },
      { fg: '--ink', bg: '--badge-demo-stripe-b' },
    ],
  },
];

export const TYPE_SCALE = [
  { token: '--text-display', weight: '--weight-heavy', tight: true },
  { token: '--text-title-1', weight: '--weight-heavy', tight: true },
  { token: '--text-title-2', weight: '--weight-bold' },
  { token: '--text-title-3', weight: '--weight-bold' },
  { token: '--text-body', weight: '--weight-regular' },
  { token: '--text-caption', weight: '--weight-bold' },
  { token: '--text-korean-card', weight: '--weight-heavy', korean: true },
];

export const SPACING = [
  '--space-0-5', '--space-1', '--space-1-5', '--space-2', '--space-3', '--space-4', '--space-5',
  '--space-6', '--space-8', '--space-10', '--space-12', '--space-14',
];
/** SEED 모서리 단계 — 기존 다섯 개(--radius-xs … --radius-pill)는 ②층에서 옮긴 뒤 지운다 */
export const RADII = ['--radius-6', '--radius-8', '--radius-10', '--radius-12', '--radius-16', '--radius-20', '--radius-24', '--radius-full'];
export const SHADOWS = ['--shadow-card', '--shadow-float', '--shadow-sheet'];

/** 날짜 칩 견본 — 고정 날짜 */
export const DEMO_DAYS = [
  { date: '2026-10-01', state: 'TOGETHER', isToday: true },
  { date: '2026-10-02', state: 'STANDBY' },
  { date: '2026-10-03', state: 'SPLIT_NEARBY' },
  { date: '2026-10-04', state: 'NO_TOURISM', hasAppointment: true },
  { date: '2026-10-05', state: 'TOGETHER', hasAppointment: true },
];

/** 상태 배너 견본 — 실제 사유 코드(src/domain/states.js) */
export const DEMO_STATES = [
  { state: 'TOGETHER', reasons: [] },
  { state: 'SPLIT_NEARBY', reasons: ['ESCORT_REQUIRED'] },
  { state: 'STANDBY', reasons: ['DAILY_CHECK_PENDING'] },
  { state: 'NO_TOURISM', reasons: ['OUTING_FORBIDDEN'] },
];

/** 네트워크 없이 그려지는 '사진' — 하늘·해·산·궁궐 지붕 */
const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb2ff"/><stop offset=".7" stop-color="#ffd9e6"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b8f71"/><stop offset="1" stop-color="#3f5d45"/></linearGradient></defs>
<rect width="640" height="400" fill="url(#s)"/>
<circle cx="500" cy="110" r="46" fill="#fff4d6"/>
<path d="M0 250 120 160l90 60 110-90 140 110 100-70 80 60v170H0Z" fill="#8fa8c8"/>
<path d="M0 290h640v110H0Z" fill="url(#g)"/>
<path d="M150 236c80 14 260 14 340 0l-22 30H172Z" fill="#23304f"/>
<path d="M186 214c44-30 224-30 268 0l-10 20H196Z" fill="#23304f"/>
<path d="M190 266h260v60H190Z" fill="#b3413a"/>
<path d="M220 266v60M270 266v60M320 266v60M370 266v60M420 266v60" stroke="#6b1f1b" stroke-width="8"/>
<path d="M160 326h320v14H160Z" fill="#e9e1d4"/>
</svg>`;

export const DEMO_PHOTO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PHOTO_SVG)}`;

/** 일부러 깨진 사진 주소 — 불러오기 실패 → 유형별 일러스트로 바뀌는지 보여준다(네트워크 없음) */
export const BROKEN_PHOTO = 'data:image/png;base64,AAAA';
