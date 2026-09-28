# 디자인 시스템 — 밝은 여행앱

- 기준일: 2026-09-26 (SEED ②층 부품 반영)
- 작업 ID: AX-321 (디자인 시스템과 앱 셸 구현은 AX-304)
- 연결: spec 7장, `IA_AND_FLOWS.md`, `ITINERARY_RULES.md`, ADR-0007(언어), ADR-0009(보기 전용), ADR-0010(긴급·지도)
- 정본 코드: 토큰 `app/globals.css`(`:root`), 부품 모양 `app/styles/ui.css`, 부품 `components/ui/`(모음 `components/ui/index.js`),
  기능별 배치 `app/styles/<기능>.css`, 견본 `/design-board`(`app/design-board/`)

이 문서는 화면을 만들 때 쓰는 토큰과 부품, 그리고 **바꾸면 안 되는 안전 표시 원칙**을 정리한다.
값과 모양의 정본은 코드다. 이 문서와 코드가 다르면 코드를 기준으로 이 문서를 고친다. 문구의 정본은 문구 사전(`src/i18n/messages/`)이다.

---

## 1. 방향과 원칙

**방향**: 밝은 여행앱. 흰 바탕, 사진 중심 카드, 선명한 포인트 색 하나(한강 코발트)와 보조색(벚꽃 분홍), 둥근 모서리, 시스템 산세리프.
이전의 '클리닉 프리미엄'(아이보리 바탕·딥 그린·골드 규칙선·세리프)을 대체했다.

**유지하는 안전 표시 원칙** (spec 7장 — 디자인을 바꿔도 지킨다)

| 원칙 | 코드에서 지키는 방법 |
| --- | --- |
| 본문 16px 이상 | `--text-body: 16px`. 14px(`--text-caption`)는 배지·보조 캡션 전용이고 본문에 쓰지 않는다 |
| 터치 대상 44px 이상 | `--tap-min: 44px`. 버튼 52px(작은 버튼도 44px), 긴급 버튼 48px, 날짜 칩 60×92px, 답 선택 칸 48px 이상 |
| 상태는 색만으로 구분하지 않는다 | 상태·배지·출처·내비 현재 위치 모두 **색 + 문구 + 아이콘(또는 테두리 모양)** 세 겹 |
| `NO_TOURISM`은 오류 스타일이 아니다 | 쉬는 날의 회청색 + 달 아이콘. 오류 빨강·경고 삼각형 금지. '추천 장소 없음'·빈 상태도 오류 색을 쓰지 않는다 |
| WCAG 2.1 AA 대비 | 글자 4.5:1, 큰 글자·UI 경계 3:1 이상(2장 표). 병기 줄·보조 글자도 투명도로 흐리게 하지 않는다 |
| 출처 영역을 시각적으로 나눈다 | 병원 발행 / 본인 체크 / SafeHour 판정·추정 / 관광공사 원문 / AI 소개 — 6장 |
| 배지 5종 | 추정 / 기본값 적용 / 운영 확인 필요 / 병원 연동 데모 / 보기 전용 — 5장 |
| '안전합니다'라고 쓰지 않는다 | 조건 통과와 안전은 다르다(spec 9.1). 제목·설명(`app/layout.js` 메타데이터 포함)도 안전을 약속하지 않는다 |

## 2. 토큰

토큰은 `app/globals.css`의 `:root` **한곳에만** 정의한다. 부품(`app/styles/ui.css`)과 기능별 스타일은 `var(--…)`만 쓰고
hex 색·새 글자 크기를 만들지 않는다. 새 토큰이 필요하면 디자인 시스템 소유(AX-304)에 보고한다.

### 2.1 색

| 무리 | 토큰 | 값 | 쓰임 |
| --- | --- | --- | --- |
| 바탕 | `--bg` · `--surface` · `--surface-alt` | `#ffffff` · `#ffffff` · `#f3f4f5` | 페이지 · 카드 면 · 채운 보조 버튼·선택 칸(SEED bg.neutral-weak) |
| 층 (SEED) | `--layer-basement` · `--layer-default` · `--layer-floating` | `#f3f4f5` · `#ffffff` · `#ffffff` | 구역이 여럿인 화면의 바탕 · 흰 블록 · 시트·대화상자 |
| 눌림·선택 (SEED) | `--pressed` · `--pressed-weak` · `--pressed-transparent` · `--selected` · `--selected-pressed` · `--overlay` | `#f7f8f9` · `#eeeff1` · `rgba(0,0,0,.027)` · `#2a3038` · `#555d6d` · `rgba(0,0,0,.455)` | 흰 면 눌림 · 회색 채움 눌림 · 바탕 없는 요소 눌림 · '선택됨' 채움 · '선택됨' 눌림 · 시트·대화상자 뒤 |
| 글자 | `--ink` · `--ink-soft` · `--ink-subtle` | `#1a1c20` · `#555d6d` · `#868b94` | 본문 · 보조 글자 · **아이콘·화살표·비활성 전용(글자 금지)** |
| 경계 | `--line` · `--line-section` · `--line-strong` · `--line-input` · `--line-contrast` | `rgba(0,0,0,.047)` · `rgba(0,0,0,.063)` · `#dcdee3` · `#868b94` · `#1a1c20` | 반복 구분선 · 구역 경계 · 카드 테두리 · **입력·선택지 경계(정보 전달)** · 초점·고른 칸 |
| 포인트 | `--accent` · `--accent-strong` · `--accent-soft` · `--accent-ink` | `#0a5cff` · `#0046d1` · `#eaf1ff` · `#ffffff` | 주 버튼·선택·타임라인 선 · 누름·링크 글자 · 선택 칸 바탕 · 포인트 면 위 글자 |
| 짙은 면 위 글자 | `--on-dark` | `#ffffff` | `--ink`·보기 전용 배지 위 |
| 보조색 | `--support` · `--support-soft` · `--support-ink` | `#ff7aa2` · `#ffe9f0` · `#a3134a` | 장식 전용(글자 금지) · 분홍 바탕 · 분홍 계열 글자 |
| 긴급 | `--emergency` · `--emergency-strong` · `--emergency-ink` | `#c8102e` · `#a50d26` · `#ffffff` | 긴급 연락 버튼 전용 — 판정 상태에 쓰지 않는다 |
| 상태 `TOGETHER` | `--state-together-bg` / `-ink` / `-line` | `#e6f6ec` / `#11693a` / `#a9dcbc` | 동행 가능 |
| 상태 `SPLIT_NEARBY` | `--state-split-bg` / `-ink` / `-line` | `#f1ecfe` / `#5b2db0` / `#cdbcf5` | 보호자 근거리 |
| 상태 `STANDBY` | `--state-standby-bg` / `-ink` / `-line` | `#fff4d9` / `#7a4a00` / `#f0d48a` | 대기 |
| 상태 `NO_TOURISM` | `--state-no-tourism-bg` / `-ink` / `-line` | `#eef1f6` / `#334055` / `#cdd5e1` | 관광 미추천(쉬는 날 — 오류 아님) |
| 출처 | `--source-hospital` · `--source-hospital-bg` · `--source-self` · `--source-estimate` · `--source-tourism` · `--source-ai` · `--source-ai-bg` | `#0e6f78` · `#eef7f8` · (`--accent-strong`) · (`--ink-soft`) · (`--ink`) · (`--support-ink`) · (`--support-soft`) | 6장 출처 영역 |
| 배지 | `--badge-demo-stripe-a` · `-b` · `--badge-readonly-bg` | `#fff3cc` · `#ffe7a3` · `#334055` | 데모 띠 무늬 · 보기 전용 짙은 면 |
| 일러스트 | `--art-sky` · `--art-blossom` · `--art-latte` · `--art-sage` · `--art-lilac` · `--art-sand` · `--art-line` | 장식 전용 | 사진이 없을 때 유형별 일러스트(`CategoryArt`) |

**대비** (WCAG 2.1 상대 휘도, 2026-09-24 위 값으로 계산 — `/design-board`가 브라우저에서 같은 값을 다시 계산해 보여준다)

| 글자 / 바탕 | 대비 | 기준 |
| --- | --- | --- |
| `--ink` / `--bg` · `--layer-basement`(=`--surface-alt`) | 17.06 · 15.49:1 | 본문 4.5 |
| `--ink-soft` / `--bg` · `--layer-basement` · `--accent-soft` | 6.62 · 6.01 · 5.84:1 | 본문 4.5 |
| `--line-input` / `--bg` · `--layer-basement` (UI 경계) | 3.42 · 3.11:1 | UI 3.0 |
| `--ink-subtle` / `--bg` (아이콘·화살표) | 3.42:1 | UI 3.0 — 글자에는 쓰지 않는다 |
| `--on-dark` / `--selected` | 13.31:1 | 본문 4.5 |
| `--accent` / `--layer-basement` | 4.78:1 | 본문 4.5 |
| `--ink` / `--pressed` · `--pressed-weak` (눌린 면 위 글자) | 16.05 · 14.83:1 | 본문 4.5 |
| `--ink-soft` / `--pressed` | 6.22:1 | 본문 4.5 |
| `--line-input` / `--pressed` (눌린 칩 테두리) | 3.22:1 | UI 3.0 |
| `--line-contrast` / `--surface-alt` (고른 칩 테두리) | 15.49:1 | UI 3.0 |
| `--ink-subtle` / `--surface-alt` (비활성 버튼 글자 — WCAG 예외지만 읽히도록 3:1) | 3.11:1 | UI 3.0 |
| `--selected` / `--bg` (고른 면·켠 스위치) | 13.31:1 | UI 3.0 |
| `--on-dark` / `--ink-subtle` (끈 스위치의 알맹이) | 3.42:1 | UI 3.0 |
| `--emergency` / `--bg` (긴급 칸 글자·입력 오류 도움말) | 5.88:1 | 본문 4.5 |
| `--accent-ink` / `--accent` (주 버튼) | 5.27:1 | 본문 4.5 |
| `--accent` / `--bg` · `--accent-strong` / `--bg` | 5.27 · 7.51:1 | 본문 4.5 |
| `--accent-strong` / `--accent-soft` | 6.62:1 | 본문 4.5 |
| `--support-ink` / `--support-soft` · `--bg` | 6.61 · 7.64:1 | 본문 4.5 |
| 상태 글자 / 상태 바탕 — 동행 · 근거리 · 대기 · 미추천 | 6.04 · 7.42 · 6.84 · 9.25:1 | 본문 4.5 |
| `--ink` / 상태 바탕 — 동행 · 근거리 · 대기 · 미추천 | 15.24 · 14.76 · 15.59 · 15.07:1 | 본문 4.5 |
| 상태 글자 / `--bg` — 동행 · 근거리 · 대기 · 미추천 | 6.76 · 8.58 · 7.48 · 10.47:1 | 본문 4.5 |
| `--emergency-ink` / `--emergency` | 5.88:1 | 본문 4.5 |
| `--on-dark` / `--ink` · `--badge-readonly-bg` | 17.06 · 10.47:1 | 본문 4.5 |
| `--source-hospital` / `--source-hospital-bg` · `--bg` | 5.41 · 5.89:1 | 본문 4.5 |
| `--ink` / `--badge-demo-stripe-a` · `-b` | 15.39 · 13.98:1 | 본문 4.5 |

- `--support`(`#ff7aa2`)는 흰 바탕 대비가 낮아 **글자에 쓰지 않는다**(장식 전용). 분홍 계열 글자는 `--support-ink`다.
- `--line`·`--line-strong`은 장식선이다. 정보를 전하는 경계(입력칸·선택지)는 `--line-input`을 쓴다.

### 2.2 글자

| 토큰 | 값 | 쓰임 |
| --- | --- | --- |
| `--text-display` | 26px / 35px | 큰 제목 (SEED screenTitle) |
| `--text-title-1` · `-2` · `-3` | 24 · 20 · 18px | h1 · h2 · h3(상단 바 제목은 18px) |
| `--text-body` | 16px | 본문 — **최소 크기** |
| `--text-button` | 16px / 22px | 작은 버튼(44px) (SEED 14px — 하한으로 올림) |
| `--text-button-large` | 18px / 24px | 큰 CTA(52px 버튼)·긴급 버튼 |
| `--text-title-sheet` | 22px / 30px | 시트 제목 (SEED t8) |
| `--text-caption` | 14px | 배지·보조 캡션 전용(본문 금지) |
| `--text-korean-card` | 30px | 한국어 안내 카드 본문(멀리서도 읽힌다) |
| `--leading-tight` · `-snug` · `-body` | 1.33 · 1.375 · 1.5 | 줄 간격 비율 (SEED 짝 24/32 · 16/22 · 16/24) |
| `--lh-display` … `--lh-caption` | 35 · 32 · 27 · 24 · 22 · 24(긴 글) · 19px | 높이가 정확해야 하는 부품의 줄 높이 |
| `--weight-regular` · `-medium` · `-bold` · `-heavy` | 400 · 500 · 700 · 700 | 굵기 (SEED 는 400·500·700 뿐) |
| `--tracking-tight` | normal | 자간 없음 (SEED) |

- **글꼴은 기기에 있는 시스템 글꼴 목록만** 쓴다(`--font-ko`·`--font-en`·`--font-ja`·`--font-zh`·`--font-mono`). 빌드·실행 중 글꼴을 내려받지 않는다.
- 한·일·중 한자 자형이 섞이지 않게 `:lang()`마다 글꼴 목록을 따로 둔다. 문서 언어(`<html lang>`)는 언어 선택에 따라 바뀐다.
- 한국어는 어절 단위로 줄을 바꾼다(`word-break: keep-all`). 일·중에는 쓰지 않는다. 긴 낱말은 `overflow-wrap`이 끊어 가로 스크롤을 막는다.
- 시각 표시는 숫자 폭을 고르게 한다(`.num`).

### 2.3 간격·모서리·그림자·배치·움직임

| 무리 | 토큰과 값 |
| --- | --- |
| 간격(4px 단위) | `--space-0-5` 2 · `-1` 4 · `-1-5` 6 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 · `-14` 56px |
| 의미 간격 (SEED) | `--gap-component` 12 · `--gap-text` 6 · `--gap-nav-to-title` 20 · `--gap-screen-bottom` 56 · `--gap-section` 8px |
| 모서리 (SEED) | `--radius-6` 배지 · `-8` 작은 버튼·아이콘 버튼 · `-10` 안내 상자·목록 행 눌림 · `-12` 큰 버튼·입력·선택 상자·날짜 칩 · `-16` 누르는 카드 · `-20` 대화상자 · `-24` 시트 · `-full` 칩·스위치·전환. 옛 `--radius-xs`·`-sm`·`--radius`·`-lg`·`-pill`은 ②층에서 옮기고 지웠다 |
| 그림자 | `--shadow-card` SEED s1 — 회색 바탕(`main.page.is-basement`) 안에서는 `none` · `--shadow-float` SEED s3(떠 있는 메뉴) · `--shadow-sheet` 없음(하단 바는 1px 윗선) |
| 배치 | `--shell-max` 480px(앱 셸 최대 폭) · `--gutter` 16px(좌우 여백) · `--tap-min` 44px · `--nav-height` 64px · `--nav-offset`(하단 내비가 있을 때 고정 요소가 올라서는 높이, 앱 셸이 켠다) |
| 움직임 | `--ease-out`(시트 애니메이션 등 기존 전환) · `--ease-color`(색 전환) · `--ease-press`(눌림 축소) · `--duration-fast` 150ms · `--duration` 200ms · `--press-scale-wide` 0.976 · `--press-scale-tight` 0.955(눌리면 2px 만큼 줄어든다 — 넓은 큰 버튼·목록 행 / 44px 칸). 눌림은 면 색만 바꾸고(`--pressed*`), 호버는 `(hover: hover) and (pointer: fine)`에서만 눌림과 같은 색. 축소는 `prefers-reduced-motion: no-preference`일 때만 |
| 포커스 | 모든 요소 `:focus-visible`은 `--focus-width`(2px) 코발트 윤곽선, 바깥 2px 띄움(상단 바 버튼·목록 행은 안쪽 −2px). 카드형 라디오·토글·답 칩은 안쪽 입력이 키보드 초점을 받을 때만(`:has(input:focus-visible)`) 칸 전체에 링. 글자 입력칸은 윤곽선 대신 2px `--line-contrast` 테두리. 버튼(`.btn` 전부)·즉시 복귀·긴급·고른 날짜 칩의 링은 `--ink`. SEED 연한 파랑(#5e98fe, 2.9:1)은 하한 미달이라 코발트 유지. 오류 표시된 입력칸은 빨간 테두리에 더해 코발트 윤곽선으로 초점을 보인다 |

**호환 별칭**: 예전 화면이 쓰던 `--brand`·`--brand-hover`·`--brand-ink`·`--font-display`·`--font-body`는 새 토큰을 가리키는 별칭으로 남겼다. 새 코드는 쓰지 않는다.

## 3. 부품 (`components/ui/`)

화면은 `@/components/ui/index.js`에서 부품을 가져다 쓴다. 부품 모양을 바꿔야 하면 디자인 시스템 소유(AX-304)에 보고하고,
화면 배치는 자기 기능 스타일 파일에서 한다. 전체 견본은 `/design-board` 4절(부품)이다.

| 부품 | 주요 props | 지키는 것 |
| --- | --- | --- |
| `Button` | `variant`(`primary`·`secondary`·`quiet`·`critical`), `size`(`normal`·`small`), `block`, `href`, `icon`, `disabled`, `loading`, `type` | SEED Action Button. 큰 CTA 52px·모서리 12·18/24, 작은 44px·모서리 8·16/22. 보조 = 회색 채움, 조용한 = 바탕 없는 글자, critical = 긴급 빨강(되돌릴 수 없는 확인). 채운 강조 버튼은 화면당 하나. `loading`은 눌린 색 + 회전 표시(`aria-busy`). `href`면 링크, 비활성 링크는 `aria-disabled` 버튼. 비활성은 투명도가 아니라 회색 면 + `--ink-subtle` 글자 |
| `Badge` | `kind`(5장), `label?` | 14/19·모서리 6·높이 28 안팎. 아이콘 + 면·테두리 모양 + 문구. `label`로 문구만 바꿀 수 있고 뜻이 다른 배지를 만들지 않는다 |
| `StateBanner` | `state`, `reasons`, `live?` | SEED Callout 모양(모서리 10·안쪽 14·아이콘 20·라벨 16, 1px 상태 선). 상태 라벨 + 아이콘 + 안전 문구 두 언어 병기 + 사유 목록. `live`면 갱신을 `aria-live="polite"`로 알린다 |
| `DateChip` | `date`, `state?`, `isToday?`, `selected?`, `hasAppointment?`, `href?`·`onClick?` | 60×92px·모서리 12. 고른 날 `--selected` 채움 + 흰 글자, '오늘'은 코발트 2px 테두리 + '오늘' 글자, 나머지 회색 면. 요일·날짜·상태 아이콘·병원 표시. 스크린리더에는 전체 날짜·오늘·상태·병원 일정을 한 문장으로 읽힌다 |
| `DayTimeline` | `entries`, `label`, `person`(`patient`·`guardian`) | 지하철 노선도. 항목 `kind`: `depart`·`stop`·`meal`·`return`·`appointment`·`medication`·`rest`. 종류 이름은 늘 글자로 보이고, 이동 시간(`leg`)에는 늘 '추정' 배지 |
| `PlaceCard` | `title`, `titleLang?`, `category`, `imageUrl?`, `time?`, `meta?`, `badges?`, `credit?`, `href?`, `variant`(`feature`·`compact`), `headingLevel` | 사진은 URL 참조만(내려받기·서버 가공 금지, `next/image` 안 씀). 사진이 없거나 실패하면 `CategoryArt`. 사진 위 글자는 흰 알약 위. 모서리 16·그림자 없음·1px `--line-strong` 테두리 |
| `CategoryArt` | `category` | 유형별 인라인 SVG 일러스트(장식, `aria-hidden`) |
| `MealSlot` | `slot`(`LUNCH`·`DINNER`), `status`(`FILLED`·`NONE_AVAILABLE`·`CLEARED`·`NOT_APPLICABLE`), `time?`, `reasons?` | '추천 장소 없음'은 정상 결과 — 점선 칸 + 중립 회색 + 사유 문구 |
| `AnswerInput` | `legend`, `value`(`YES`·`NO`·`UNKNOWN`·`null`), `onChange`, `disallowUnknown?`, `hint?`, `disabled?`, `showMeaning?` | 예/아니오/모르겠음 — 44px 알약 칩(테두리 `--line-input` 3:1). 고르면 진한 테두리 + 회색 면 + 체크 + 굵게. `fieldset`+`legend`+표준 라디오. 고른 뒤 '아니오'(제한 없음)와 '모르겠음'(가장 엄격한 기본값)의 뜻을 한 줄로 보인다. 필수 항목은 '모르겠음' 없음 |
| `PeriodEditor` | `title`, `source`(`SELF`·`HOSPITAL`), `startDate`·`endDate`, `onStartChange`·`onEndChange`, `minDate`·`maxDate`, `disabled?`, `headExtra?`, `actions?` | 틀만. 본인 체크는 파선, 병원 발행은 실선 띠. 병원 기간 날짜는 고칠 수 없다. 자유 서술 칸이 없다 |
| `Sheet` | `title`, `onClose`, `showClose?`, `children`, `footer` | SEED Bottom Sheet — 위 모서리 24, 제목 22/30, 뒤 `--overlay`, 손잡이는 닫을 수 있는 시트에만. 열리면 포커스 이동·배경 잠금·Tab 가두기, 닫히면 이전 포커스로. Escape·닫기·확인·뒤로 가기 모두 `requestClose` 한 경로로 닫힌다(`lib/useModalSheet.js`). `showClose=false`는 즉시 복귀처럼 확인을 꼭 받는 안전 지시용(손잡이·닫기 없음) |
| `SourceArea` · `SourceTag` | `source`(6장), `title?`, `note?`, `lang?` | 출처 영역 / 항목 옆 작은 출처 표시 |
| `KoreanCard` | `title`, `korean`(줄 배열), `explanation?`, `explanationLang?` | 큰 한국어 본문(`lang="ko"`) + 사용자 언어 설명. 고정 문구만(AI 금지). 네트워크를 쓰지 않는다 |
| `EmptyState` | `icon`, `title`, `body?`, `action?`, `headingLevel?` | 무엇이 없는지 + 다음에 할 일. 오류 색·경고 아이콘 없음 |
| `AlertDialog` | `title`, `titleLang?`, `description?`, `cancelLabel`, `confirmLabel`, `critical?`, `busy?`, `onConfirm({ requestClose })`, `onClose` | SEED Alert Dialog — 272px·모서리 20, 버튼 둘(취소·확인), 되돌릴 수 없으면 `critical`. 바깥을 눌러도 닫히지 않는다. `role="alertdialog"`, 포커스 가두기·복원·뒤로 가기는 `lib/useModalSheet.js` |
| `ListItem` · `ListGroup` · `ListHeader` | `title`, `titleLang?`, `description?`, `leading?`, `trailing?`(`'chevron'`·노드), `href?`·`onClick?` / `label?` / `as?`, `id?` | SEED List Item — 위아래 12·좌우 16, 제목 16/22·설명 14/19 `--ink-soft`(한 줄 46·두 줄 67px). 누르면 좌우 6px 안으로 들어온 모서리 10 면. 반복 행 사이 1px 선 16px 들여씀. 행 안에서 따로 누를 것은 3개까지 |
| 클래스 `.ui-switch` · `.ui-block` · `main.page.is-basement` · `.hint.is-error` | — | 스위치(바로 적용되는 켬/끔, `role="switch"`, `.toggle-row` 라벨 안 — 끔 트랙 `--ink-subtle`), 흰 블록(화면 폭·8px 틈), 회색 바탕 층(그 안에서 카드 그림자 끔), 입력 오류 도움말(긴급 빨강, 입력은 `aria-invalid`) |
| 클래스 `.medical-callout` · `.has-icon` | — | 일반 안내 상자(SEED Callout · neutral): 회색 면·모서리 10·16/22, 왼쪽 띠 없음, `role="note"`. `.has-icon`이면 앞에 20px 먹색 아이콘 칸(`.medical-callout-icon` — 첫 줄 가운데, 글자와 8px)을 두고 글자는 `<p>`에 넣는다. 기본 아이콘은 `info`(원 + i) |
| 입력 오류 표시 | — | 입력칸은 공통 규칙(`aria-invalid` → 2px 긴급 빨강, 체크·라디오 제외). 라디오 묶음은 선택지 칸 테두리가 빨강(`.radio-option:has(input[aria-invalid])`). 오류 문장은 20px `alert` 아이콘(원 + 느낌표) + 16/22 굵은 `--emergency`, 왼쪽 띠 없음 — 체류 설정(`.onboarding-field-error`)이 먼저 쓴다 |
| `TopBar` | `title`, `titleLang?`, `backHref?`·`onBack?`, `backLabel?`, `as?`, `actions?` | SEED Top Navigation — 높이 56·선 없음, 제목(기본 h1) 18/24 굵게·좁으면 말줄임, 뒤로 가기 44×44·모서리 8, 언어 선택(8장) |
| `Icon` | `name`, `size?`, `strokeWidth?` | 인라인 SVG 선 아이콘(`ICON_NAMES`). 이름이 `Fill`로 끝나면 채운 모양(하단 내비 현재 칸). 상태 아이콘은 `STATE_ICON` |
| `BottomNav` · `EmergencyButton` · `ReadOnlyBanner` · `AppShell` | 7장 | 앱 셸 |
| `useStoreStatus` · `shouldShowReadOnly` | — | 기기 저장소의 보기 전용 신호. 쓰기 동작은 `readOnly`면 막는다 |

기능 화면의 부품(예: `CourseCard`, `DailyCheckCard`, `MapLinks`, `DeltaSheet`, `ReturnSheet`, `PeriodEditorForm`, `GuardianCopyView`)은
위 부품을 조합한 것이며 각 파일 머리 주석에 규칙이 있다.

## 4. 판정 상태 표시

| 상태 | 라벨(ko) | 아이콘 | 색 |
| --- | --- | --- | --- |
| `TOGETHER` | 동행 가능 | 함께 걷는 두 사람(`stateTogether`) | 초록 |
| `SPLIT_NEARBY` | 보호자 근거리 | 한 사람과 집(`stateSplit`) | 보라 |
| `STANDBY` | 대기 | 모래시계(`stateStandby`) | 호박색 |
| `NO_TOURISM` | 관광 미추천 | 달(`stateNoTourism`) | 회청색 — 오류 아님 |

- 상태·사유 문구는 **안전 문구**다. 주 언어 + 병기 언어 두 줄로 보인다: `ko` → 한국어 + 영어, `en` → 영어 + 한국어,
  `ja`·`zh` → 검수 스위치(`NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA`/`_ZH`)가 켜지기 전까지 영어 + 한국어(ADR-0007).
  병기 언어는 `safetyPair()` 한 곳만 정하고, 화면은 `useLang().pair()`로 그린다. 병기 줄도 대비를 낮추지 않는다.
- 사유 코드는 늘 문구로 함께 보인다. 오늘은 매일 확인 전·확인하지 않은 병원 안내가 있으면 `STANDBY`를 덧씌운 표시값이다(저장 일정은 그대로).
- 복귀 마감은 마감 이유·예상 귀가(`plannedReturnAt`, '추정')와 함께, 두 언어로 보인다.

## 5. 배지 5종 (`Badge`)

배지마다 아이콘·테두리 모양·문구가 다르다. 색만으로 구분하지 않는다.

| `kind` | 문구(ko / en) | 모양 | 붙이는 곳 |
| --- | --- | --- | --- |
| `estimate` | 추정 / Estimate | 테두리 없는 회색 면, 물결(≈) 아이콘 | SafeHour가 추정한 값 — 이동·체류·보행 시간, 식이 판단, 예상 귀가 |
| `defaulted` | 기본값 적용 / Default applied | 분홍 면(테두리 없음), 방패 아이콘 | '모르겠음'에 가장 엄격한 기본값을 넣은 항목 |
| `hoursUnconfirmed` | 운영 확인 필요 / Check opening hours | 점선 테두리(`--line-input`), 흰 면, 물음표 시계 | 운영 여부를 단정할 수 없는 장소(열려 있다고 쓰지 않는다) |
| `demo` | 병원 연동 데모 / Hospital link demo | 노랑 띠 무늬, 대기색 테두리, 플라스크 아이콘 | 데모 병원 지침 — 데모를 실제 연동처럼 보이지 않게 늘 붙인다 |
| `readOnly` | 보기 전용 / View only | 짙은 면 + 흰 글자, 자물쇠 | 로그인 만료·오프라인 |

맨 `.badge`(배지 5종이 아닌 곳)는 옅은 1px `--line-strong` 테두리를 지킨다 — 5종은 종류마다 테두리를 스스로 정한다.

조건 화면의 '동의 문구 법무 검토 전'은 배지 5종과 뜻이 달라 조건 화면 전용 모양(`LegalReviewBadge`)을 쓴다.

## 6. 출처 영역 5종 (`SourceArea` · `SourceTag`)

한 영역 안에 두 출처를 섞지 않는다(spec 9.1 '원문과 추정값을 같은 필드에 섞지 않는다').

| `source` | 머리글(ko) | 모양 | 담는 것 |
| --- | --- | --- | --- |
| `hospital` | 병원 발행 | 청록 실선 + 왼쪽 굵은 띠, 청록 면 | 병원이 발행한 조건과 병원 안내문 **원문**(번역·요약하지 않는다) |
| `self` | 본인 체크 | 코발트 파선 테두리 | 환자가 고른 조건 값 |
| `estimate` | SafeHour 판정·추정 | 회색 점선 테두리, 회색 면 | 판정 결과, 도착·머무름·이동·보행 추정, 실내 여부 |
| `tourism` | 관광공사 원문 | 왼쪽 두 줄 띠 + 따옴표 아이콘 | 관광공사 개요·운영 시간·주소 원문(원문 언어를 `lang`으로 표시, 해석하지 않는다) |
| `ai` | AI 소개 | 분홍 면, 말풍선 모서리 | AI 소개 문장 — 판정 근거가 아님을 모양으로도 드러낸다. 정해진 문장(템플릿)은 AI 영역에 넣지 않고 '정해진 문장'으로 밝힌다 |

- 조건 항목 옆에는 `SourceTag`(`hospital`·`self`)로 출처를 붙이고, '모르겠음' 기본값이면 `Badge kind="defaulted"`를 함께 붙인다.

## 7. 앱 셸 (`AppShell`)

```
[보기 전용 배너 자리]   ReadOnlyBanner — 저장소 상태로 자동
[긴급 연락 버튼]        EmergencyButton — 모든 화면, DOM 에서는 본문 앞
[화면 본문]             각 화면의 TopBar + main.page
[하단 내비 5개]         BottomNav — 로그인 전 흐름(/, /login, /onboarding)과 /g 에서는 숨기고,
                        그 화면에는 하단 긴급 바(.ui-emergency-bar)가 대신 선다. 시작 화면은 자기 하단 바에 긴급을 넣는다
```

- **하단 내비** — 오늘(`/today`) · 일정(`/trip`) · 조건(`/conditions`) · 더보기(`/more`).
  하위 화면도 해당 탭을 현재로 본다(`/trip/…`·`/place/…` → 일정, `/link`·`/guide` → 조건, `/cards`·`/guardian`·`/settings`·`/privacy` → 더보기).
  현재 탭은 `aria-current="page"` + 채운 아이콘 + `--ink` 글자 + 굵기(SEED Bottom Navigation — 알약 바탕·윗줄 없음). 긴급 칸은 긴급 빨강 아이콘 + 글자. `/design-board`는 내비에 없다.
- **긴급 연락 버튼** — 모든 화면에 고정한다. 로그인 전·로그인 만료·오프라인·추천 중단 중에도 보인다. `/emergency`로 가는 링크이며
  긴급 빨강 채움 + 전화 아이콘 + '긴급 연락', 큰 CTA 모양(52px·모서리 12). 판정 상태 색과 겹치지 않는다. 하단 내비·고정 복귀 버튼이 있으면 그 위로 비켜 선다.
  좁은 한 줄(시작 화면 하단 바)에서는 `EmergencyButton short`로 하단 내비와 같은 짧은 글자('긴급'·'SOS')를 보이고, 읽히는 이름은 '긴급 연락'으로 둔다(짧은 글자가 들어 있지 않은 언어는 '짧은, 긴' 이름).
- **보기 전용 배너** — 저장소가 보기 전용(로그인 안 함·만료·오프라인)이면 맨 위에 '보기 전용 — 로그인이 필요합니다'와 이유를 보인다.
  자리(`role="status"`)는 늘 DOM에 있어 쓰는 중에 오프라인이 되면 읽어 준다. 오프라인이면 누를 수 없는 로그인 링크를 두지 않는다.
  세션 확인 전 첫 그림에서는 그리지 않는다(깜빡임 방지, 오프라인은 바로 보인다). `/`·`/login`·`/design-board`에는 두지 않는다.
- 보기 전용에서도 긴급 연락·한국어 카드·오늘 일정·복귀 마감은 보이고, 쓰기 동작(확인·편집·연동·공유)은 막고 이유를 보인다(ADR-0009).
- 시안 보드는 `preview` props로 셸 부품을 고정해 그린다(`BottomNav preview`는 `nav` 대신 `div`라 랜드마크가 겹치지 않는다).

## 8. 언어 선택 (`LanguageToggle`)

- 모든 상단 바 오른쪽에 늘 붙는다. 지구본 + 현재 언어 이름을 적은 글자 버튼(테두리 없음·16px·높이 44)이고, 누르면 4개 언어 목록이 펼쳐진다
  (360px에서 제목 자리를 빼앗지 않으려고).
- 언어 이름은 늘 자기 언어로 적는다: 한국어 / English / 日本語 / 中文 — 번역하면 못 찾는다.
- 펼침 버튼의 접근 가능한 이름은 영어 + 현재 언어('Language — 한국어 선택됨' 꼴)다. 목록은 드러내기(disclosure) 방식:
  `aria-expanded`, Escape·바깥 누르기로 닫히고 펼침 버튼으로 포커스가 돌아온다. 언어 버튼은 44px 이상, 선택된 언어는 체크 아이콘 + 굵기 + 회색 면 + `aria-pressed`.
- 첫 언어는 기기에 저장한 선택 → 브라우저 언어(`ja-JP`→`ja`, `zh-CN`·`zh-TW`→`zh`, 그 밖→`en`, `ko-KR`→`ko`) 순이다.
  고른 언어는 기기 설정(`prefs`)에 저장되고 `<html lang>`이 바뀐다.

## 9. 화면 스타일 파일 추가하기

1. 기능별 스타일은 `app/styles/<기능>.css` 한 파일에 둔다. 지금 있는 파일: `ui`(부품, AX-304 소유), `onboarding`, `conditions`, `today`,
   `trip`, `place`, `cards`, `emergency`, `guardian`, `settings`, `privacy`, `designBoard`.
2. 등록은 `app/layout.js` 한곳에서만 한다(`import './styles/<기능>.css'`). **새 파일이 필요하면 만들지 말고 먼저 보고한다** —
   레이아웃과 등록 순서는 디자인 시스템 소유다.
3. 파일 머리에 규칙 주석을 둔다(기존 파일과 같게): 토큰 변수만, 부품 모양을 덮어쓰지 않고 화면 배치만, 클래스는 `<기능>-`으로 시작,
   본문 16px 이상·터치 44px 이상·상태를 색만으로 구분하지 않기·320–1280px 가로 스크롤 없음.
4. 화면 뿌리 요소에 `page <기능>-page` 클래스를 준다(`main.page`가 좌우 여백과 하단 내비·긴급 바 자리를 만든다).
5. 문구는 자기 이름공간 파일(`src/i18n/messages/<기능>.js`)에 4개 언어로 둔다. ja·zh는 '검수 전 번역'이다.
6. 검증: `npm run lint`, `npm test`(문구 사전 무결성 포함), `npm run build`, 360px·1280px 가로 스크롤 없음, axe WCAG 2.1 A/AA 위반 0.

## 10. 시안 보드 (`/design-board`)

내비에 노출하지 않는 내부 페이지다(검색 제외). **고정 데모 데이터만 쓰고 이 기기의 사용자 데이터를 읽지 않는다**(spec 7장) —
앱 셸도 이 경로에서는 보기 전용 배너·세션 확인을 하지 않는다.

| 절 | 내용 | 코드 |
| --- | --- | --- |
| 1. 색 | 토큰 짝마다 견본과 대비 — `app/globals.css`의 값을 브라우저에서 읽어 **그 자리에서 계산**한다(토큰이 바뀌면 수치도 바뀐다) | `DesignBoard.js`, `demoData.js`(`CONTRAST_GROUPS`) |
| 2. 글자 | 크기·굵기 견본, 숫자 표시, 4개 언어 글꼴 | `TYPE_SCALE` |
| 3. 간격·모서리·그림자 | 토큰 견본 | `SPACING`·`RADII`·`SHADOWS` |
| 4. 부품 | 버튼·배지·상태 배너·날짜 칩·타임라인(환자·보호자)·장소 카드·일러스트·식사 칸·예/아니오/모르겠음·기간 편집기·시트·빈 상태·한국어 카드·출처 영역·셸 | `DesignBoard.js` |
| 5. 화면 시안 | 오늘 · 전체 일정 · 하루 일정 · 조건 입력 · 장소 상세 · 한국어 카드 · 긴급 연락 · 보호자 열기 — 축소 시안 8개 | `ScreenPreviews.js`, `screenData.js` |

**화면 시안이 만들어지는 방식**

- 실제 화면 부품과 실제 표시 모델을 쓴다: `StateBanner`·`CourseCard`·`DailyCheckCard`·`MapLinks`·`AppliedConditions`·`ExcludedList`·
  `PeriodEditorForm`·`ConsentPanel`·`CoverageTag`·`GuardianCopyView`·`KoreanCard` 등과 `components/trip/viewModel.js`
  (`timelineEntries`·`tripDateRows`·`todayFocus`·`deltaSummary`), `components/cards/cardModel.js`(`buildTodayCards`),
  `app/emergency/contacts.js`, `src/guardian`(`buildGuardianSnapshot`), `src/stay`(`classifyStay`·`overlayTodayGate`).
- 화면 페이지 자체는 기기 저장소를 읽으므로 부르지 않는다. 페이지가 부품을 늘어놓는 배치만 같은 클래스·같은 문구 키로 옮겨 적었다 —
  **화면 배치가 바뀌면 `ScreenPreviews.js`도 같이 고친다.**
- 데이터는 `screenData.js`의 고정 데모 체류다: 10월 2일 입국 · 3일 수술·시술 · 5일 진료 · 8일 출국, 본인 체크 기간 3개(하나는 '모르겠음'
  항목 포함), '지금'은 10월 5일 09:10(매일 확인 전). 날짜 분류와 합성 값은 도메인 함수로 채우고, 하루 일정(정거장·시각)은 손으로 적은
  예시값이다(판정 엔진을 돌리지 않는다). 이름·주소는 모두 '데모'이고, 정거장에는 사진을 넣지 않는다(데모 그림에 관광공사 출처가 붙지 않게).
- 시안은 그림이다. 화면 틀 전체가 `inert`라 누르거나 포커스할 수 없고(전화 걸기·길찾기 링크 포함), 무엇을 보여 주는지는 그림 아래
  설명(`figcaption`)이 알린다. 틀은 360×760으로 그리고 `transform`으로 줄인다(좁은 화면 0.78, 700px 이상 0.7). 넘치는 아래쪽은 잘린다.
- 언어를 바꾸면 시안도 그 언어로 다시 그려진다(장소 이름은 관광공사 원문 자리라 선택 언어 문구로 채운다).

**시안을 더하거나 고칠 때**

1. 데이터는 `screenData.js`에만 더한다. 사용자 저장소·세션·서버를 부르는 부품(`useTrip`·`useStay`·`getStore` 읽기, `fetch`)은 시안에 넣지 않는다.
2. 새 문구는 `designBoard` 이름공간(`src/i18n/messages/designBoard.js`)에 4개 언어로 더한다. 쓰지 않는 키가 남으면 `npm test`가 실패한다.
3. 틀 안에는 `main` 랜드마크를 두지 않는다(`div.page … designBoard-phone-page`). id는 보드 안에서 겹치지 않게 한다.
4. 검증: 360px·1280px에서 axe WCAG 2.1 A/AA 위반 0, 가로 스크롤 없음, 외부 호출 0건. E2E 시나리오 11(`/design-board` 렌더링)은 AX-322가 고정한다.
