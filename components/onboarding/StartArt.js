// 시작 화면 일러스트 (AX-314) — 비행기 · 숙소 · 지도 핀을 잇는 여행 길
//
// 장식이다(aria-hidden). 파일을 내려받지 않는 인라인 SVG 이고, 색은 --art-* · 포인트 · 보조색 토큰만 쓴다.
// 병원·의료 기호는 넣지 않는다: 병원 광고·알선처럼 보이지 않게 한다(docs/business-rules.md '숙소와 병원').

const LINE = 'var(--art-line)';
const ACCENT = 'var(--accent)';
const SUPPORT = 'var(--support)';
const PAPER = 'var(--surface)';

export default function StartArt() {
  return (
    <svg
      className="onboarding-art"
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="320" height="180" fill="var(--art-sky)" />
      <circle cx="262" cy="44" r="20" fill={SUPPORT} />
      <path d="M0 150c60-18 120-18 180-4s100 10 140-6v40H0Z" fill="var(--art-sage)" />
      {/* 여행 길 — 점선 */}
      <path
        d="M52 132c34-6 50-40 92-44s62 30 100 18"
        stroke={LINE}
        strokeWidth="3"
        strokeDasharray="2 9"
        strokeLinecap="round"
        fill="none"
      />
      {/* 비행기 */}
      <g transform="translate(64 38) rotate(-14)">
        <path d="M0 14h70l14-8c4-2 8 2 6 6l-8 8H0Z" fill={PAPER} stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
        <path d="M30 14 44 0h10l-6 14M34 20l12 12h9l-4-12" fill={ACCENT} stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
      </g>
      {/* 숙소 */}
      <path d="M22 132 46 112l24 20" stroke={LINE} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 128h36v26H28Z" fill={PAPER} stroke={LINE} strokeWidth="3" />
      <path d="M41 154v-13h10v13" fill={ACCENT} />
      {/* 지도 핀 */}
      <path
        d="M246 70c-12 0-21 9-21 20 0 16 21 34 21 34s21-18 21-34c0-11-9-20-21-20Z"
        fill={SUPPORT}
        stroke={LINE}
        strokeWidth="3"
      />
      <circle cx="246" cy="90" r="7" fill={PAPER} />
    </svg>
  );
}
