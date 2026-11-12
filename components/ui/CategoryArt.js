// 장소 유형 일러스트 (AX-304 · docs/platform/ITINERARY_RULES.md '관심사와 이미지': 이미지가 없으면 유형별 일러스트)
//
// 사진이 없거나 불러오지 못한 장소에 쓴다. 파일을 내려받지 않는 인라인 SVG 다.
// 장식이므로 aria-hidden — 유형 이름은 카드의 유형 알약(글자)이 알린다.
// 색은 globals.css 의 --art-* 토큰(장식 전용)과 포인트·보조색만 쓴다.

const BG = {
  FOOD: 'var(--art-blossom)',
  CAFE: 'var(--art-latte)',
  SPOT: 'var(--art-sky)',
  CULTURE: 'var(--art-lilac)',
  FESTIVAL: 'var(--art-sand)',
  COURSE: 'var(--art-sage)',
  LEISURE: 'var(--art-sage)',
  SHOPPING: 'var(--art-blossom)',
  LODGING: 'var(--art-latte)',
  OTHER: 'var(--art-sky)',
};

const LINE = 'var(--art-line)';
const ACCENT = 'var(--accent)';
const SUPPORT = 'var(--support)';
const PAPER = 'var(--surface)';

const SCENES = {
  // 고궁 — 처마가 들린 기와지붕과 해
  SPOT: (
    <>
      <circle cx="238" cy="58" r="22" fill={SUPPORT} />
      <path d="M40 150h240" stroke={LINE} strokeWidth="4" strokeLinecap="round" />
      <path d="M78 96c30 6 134 6 164 0l-10 16H88Z" fill={ACCENT} />
      <path d="M92 84c22-18 114-18 136 0" stroke={LINE} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M98 112h124v38H98Z" fill={PAPER} stroke={LINE} strokeWidth="4" />
      <path d="M124 112v38M160 112v38M196 112v38" stroke={LINE} strokeWidth="4" />
    </>
  ),
  // 전시 — 벽에 걸린 액자 둘
  CULTURE: (
    <>
      <path d="M40 150h240" stroke={LINE} strokeWidth="4" strokeLinecap="round" />
      <rect x="70" y="52" width="92" height="72" rx="4" fill={PAPER} stroke={LINE} strokeWidth="4" />
      <path d="M80 114l24-28 18 18 12-12 18 22Z" fill={ACCENT} />
      <circle cx="140" cy="72" r="8" fill={SUPPORT} />
      <rect x="182" y="64" width="64" height="60" rx="4" fill={PAPER} stroke={LINE} strokeWidth="4" />
      <circle cx="214" cy="94" r="16" fill={SUPPORT} />
    </>
  ),
  // 식당 — 김이 나는 그릇과 젓가락
  FOOD: (
    <>
      <path d="M92 104h136c0 34-30 52-68 52s-68-18-68-52Z" fill={PAPER} stroke={LINE} strokeWidth="4" />
      <path d="M92 104h136" stroke={LINE} strokeWidth="4" />
      <path d="M130 88c-8-10 8-16 0-28M160 88c-8-10 8-16 0-28M190 88c-8-10 8-16 0-28" stroke={SUPPORT} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M216 48l30 60M232 44l24 62" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  // 카페 — 잔과 받침
  CAFE: (
    <>
      <path d="M104 88h96v38a30 30 0 0 1-30 30h-36a30 30 0 0 1-30-30Z" fill={PAPER} stroke={LINE} strokeWidth="4" />
      <path d="M200 98h12a16 16 0 0 1 0 32h-14" stroke={LINE} strokeWidth="4" fill="none" />
      <path d="M84 160h136" stroke={LINE} strokeWidth="4" strokeLinecap="round" />
      <path d="M134 74c-8-10 8-16 0-28M162 74c-8-10 8-16 0-28" stroke={SUPPORT} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M116 104h72" stroke={ACCENT} strokeWidth="6" strokeLinecap="round" />
    </>
  ),
  // 쇼핑 — 손잡이 달린 가방
  SHOPPING: (
    <>
      <path d="M100 76h120l-8 84H108Z" fill={PAPER} stroke={LINE} strokeWidth="4" strokeLinejoin="round" />
      <path d="M136 76v-8a24 24 0 0 1 48 0v8" stroke={LINE} strokeWidth="4" fill="none" />
      <path d="M112 108h96" stroke={ACCENT} strokeWidth="6" />
      <circle cx="160" cy="132" r="10" fill={SUPPORT} />
    </>
  ),
  // 축제·공연 — 줄에 매단 등
  FESTIVAL: (
    <>
      <path d="M40 50c80 30 160 30 240 0" stroke={LINE} strokeWidth="3" fill="none" />
      <path d="M92 64v10M160 72v10M228 64v10" stroke={LINE} strokeWidth="3" />
      <ellipse cx="92" cy="94" rx="18" ry="22" fill={SUPPORT} stroke={LINE} strokeWidth="3" />
      <ellipse cx="160" cy="102" rx="18" ry="22" fill={ACCENT} stroke={LINE} strokeWidth="3" />
      <ellipse cx="228" cy="94" rx="18" ry="22" fill={SUPPORT} stroke={LINE} strokeWidth="3" />
      <path d="M40 160h240" stroke={LINE} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // 여행 코스 — 구불구불한 점선 길과 핀
  COURSE: (
    <>
      <path d="M50 150c40 0 40-50 90-50s50-40 100-40" stroke={LINE} strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" fill="none" />
      <circle cx="50" cy="150" r="8" fill={ACCENT} />
      <path d="M240 36c-12 0-20 9-20 20 0 15 20 30 20 30s20-15 20-30c0-11-8-20-20-20Z" fill={SUPPORT} stroke={LINE} strokeWidth="3" />
      <circle cx="240" cy="56" r="6" fill={PAPER} />
    </>
  ),
  // 레포츠 — 산과 물결
  LEISURE: (
    <>
      <path d="M40 140 110 60l40 44 30-30 100 66Z" fill={PAPER} stroke={LINE} strokeWidth="4" strokeLinejoin="round" />
      <path d="M110 60l14 16-14 6-12-8Z" fill={ACCENT} />
      <path d="M40 160c20-10 40-10 60 0s40 10 60 0 40-10 60 0 40 10 60 0" stroke={ACCENT} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="244" cy="54" r="16" fill={SUPPORT} />
    </>
  ),
  // 숙소 — 지붕 있는 집
  LODGING: (
    <>
      <path d="M96 96 160 48l64 48" stroke={LINE} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M110 92h100v64H110Z" fill={PAPER} stroke={LINE} strokeWidth="4" />
      <path d="M146 156v-34h28v34" fill={ACCENT} />
      <circle cx="238" cy="60" r="14" fill={SUPPORT} />
      <path d="M60 156h200" stroke={LINE} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // 그 밖 — 지도 핀
  OTHER: (
    <>
      <path d="M160 40c-24 0-42 18-42 40 0 32 42 70 42 70s42-38 42-70c0-22-18-40-42-40Z" fill={PAPER} stroke={LINE} strokeWidth="4" />
      <circle cx="160" cy="80" r="14" fill={ACCENT} />
      <ellipse cx="160" cy="162" rx="44" ry="6" fill={SUPPORT} />
    </>
  ),
};

export const ART_CATEGORIES = Object.freeze(Object.keys(SCENES));

export default function CategoryArt({ category = 'OTHER' }) {
  const key = SCENES[category] ? category : 'OTHER';
  return (
    <svg
      className="ui-place-art"
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={{ background: BG[key] }}
    >
      {SCENES[key]}
    </svg>
  );
}
