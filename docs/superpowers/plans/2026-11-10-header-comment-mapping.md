# 머리 주석 옛 참조 대응표 (2026-11-10)

- 근거: `docs/tracking/findings.md` 5번 '남은 것' ("전체 일괄은 대응표를 먼저 만든 뒤 별도 작업으로 한다")
- 기준 코드: `claude/launch-prep-3` (main 2f67b73 + 문서 커밋 6a478ec)
- 이 문서는 조사 결과만 담는다. 이 문서를 만들면서 소스 파일은 하나도 고치지 않았다.

## 1. 목적과 사용법

소스 주석에 남은 `spec N.N`, `spec N장`, `규칙 N`, `handoff N장 N번` 표기는 저장소에 없는 작업용 설계서를
가리킨다. 이 문서는 옛 참조마다 지금 문서의 어느 절로 옮기면 되는지를 정해 둔 표다. 일괄 정리(이하 '정리 작업')는
이 표를 보고 파일마다 판단 없이 바꾸는 것을 목표로 한다.

정리 작업에서 표를 쓰는 방법:

1. 주석의 옛 참조를 찾는다. 같은 괄호 안에 여러 개가 있으면(`spec 4.9 · 4.10 · 규칙 32`) 하나씩 표에서 찾는다.
2. 표의 '지금 문서'와 '절 제목'으로 바꾼다. 표기는 2026-11-07 변환(커밋 5080f9f)과 같게 쓴다.
   - 한 문서 한 절: `docs/business-rules.md '매일 확인'`
   - 한 문서 여러 절: `docs/business-rules.md '매일 확인'·'사용자 편집'`
   - 절 안의 특정 문장: `docs/business-rules.md '하루 일정 생성'의 마감 후보 표` 또는 `'알림과 카드': 숙소·병원 좌표는 어떤 지도 링크에도 넣지 않는다`
   - 문서 여러 개: 쉼표로 잇는다. `docs/business-rules.md '보호자', docs/security.md '보호자 링크'`
3. 같은 괄호 안에서 바꾼 결과가 겹치면 하나로 줄인다(예: `spec 4.6 · 규칙 32`가 둘 다 '매일 확인'이면 한 번만).
4. 옛 참조가 주석 문장의 근거로만 붙어 있고 문장 자체가 규칙을 다 말하면, 참조만 바꾸고 문장은 그대로 둔다.
5. '대응 없음' 행은 참조를 지우고, 5절의 규칙 문장을 주석에 그대로 남긴다(그 문장이 이미 주석에 있으면 참조만 지운다).
6. `AX-NNN` 작업 번호는 문서 참조가 아니다. 그대로 둔다(`AX-210 → AX-318` 같은 이력 표기도 그대로).
7. 고친 줄에 있는 엠대시·엔대시는 같은 줄 안에서 쉼표, 쌍점, 괄호로 바꾼다. 고치지 않는 줄은 건드리지 않는다.

'손대는 파일만 고친다' 규칙(findings 5, 운영자 결정 2026-11-07)은 정리 작업이 끝날 때까지 그대로 유효하다.
정리 작업 전에 다른 일로 파일을 고치게 되면, 그 파일의 옛 참조는 이 표로 바꾼다. 바꾼 파일은 6절의 묶음에서 빠진다.

확신 표기:

- **확실**: 2026-11-07 변환에 같은 쌍이 있거나, 지금 문서가 그 규칙을 같은 뜻의 문장으로 직접 적는다.
- **추정**: 주제는 맞지만 한 옛 절이 여러 문서로 갈라졌거나, 지금 문서가 규칙을 미루어 읽게만 적는다. 정리 작업에서 문장을 한 번 더 읽고 고른다.
- **대응 없음**: 지금 문서에 그 규칙이 없다. 5절의 문장을 주석에 남긴다.

## 2. 참조 표기 종류와 건수

조사 범위: `app`, `components`, `lib`, `src`, `e2e`, `test`, `scripts` 아래 `.js`·`.mjs`·`.cjs`·`.css` 파일과 `public/sw.js`.
`docs/`와 폴더별 `AGENTS.md`에는 이 표기가 없다(`docs/API_CONTRACT.md` 같은 지난 문서는 제외 대상).

센 방법: 괄호 안 목록(`spec 4.9 · 4.10`, `규칙 13·31·50·55`)은 하나씩 따로 세고, 범위(원문은 엔대시로 `spec 4.1`부터 `4.3`까지, `규칙 21`부터 `28`까지처럼 쓴다)는
범위 안 번호마다 하나로 센다. `ADR-0003 규칙 1`, `ADR-0004 규칙 9`는 저장소에 있는 결정 기록이라 세지 않았다.

| 표기 | 건수 | 파일 | 그중 머리 40줄 안 (건 / 파일) |
| --- | --- | --- | --- |
| `spec N.N`, `spec N장` (목록·범위 포함) | 844 | 267 | 575 / 247 |
| `규칙 N`, `규칙 N-N` (`spec 10장 규칙 N`, `spec 규칙 N` 포함) | 520 | 142 | 277 / 120 |
| `handoff N장`, `handoff N장 N번`, `handoff 3장 관문 10` | 9 | 8 | 8 / 7 |
| 합계 | 1,373 | **272** | 860 / **250** |
| (참고) `재계획 규칙 N` | 12 | 4 | 지금 문서의 번호와 같다. 4.3절 |
| (참고) `인계 N장`, `명세 N장` | 0 | 0 | 소스에는 없다. findings 5의 예시는 옛 표기다 |

폴더별 파일 수(파일 전체 기준): `components` 71, `test` 65, `src` 57, `app` 35, `lib` 22, `e2e` 17, `scripts` 4, `public` 1.

findings 5의 '259개'와 다른 이유: 이번에는 `spec 6장`처럼 장 표기, 쉼표 없는 목록 뒤쪽 번호, CSS 두 파일(`app/globals.css`,
`app/styles/ui.css`)까지 셌다. 머리 40줄만 보면 250개, 파일 전체를 보면 272개다. 참조 1,373건 가운데 513건이
머리 40줄 밖(JSDoc, 절 구분 주석, 테스트 이름)에 있으므로 **정리 작업은 머리 주석이 아니라 파일 전체의 주석을 대상으로 한다.**

주석이 아닌 곳에 있는 참조: `test/`·`e2e/`의 `describe(`, `test(`, `expect(` 문자열 안에 199줄(53개 파일)이 있다
(예: `test/notify-schedule.test.js`의 `describe('규칙 47 ...', ...)`). 테스트 이름이라 '주석만 바꾼다'의 범위 밖이다. 7절 참고.

참조별 건수는 4절 표의 '옛 참조' 칸에 `(건·파일)`로 적었고, 참조별 파일 목록은 부록에 있다.

## 3. 번호 출처

`spec N.N`과 `규칙 N`이 가리키던 설계서 원본은 **저장소에 없고 git 이력에도 없다.** 확인한 것:

- 지금 문서와 지난 문서(`docs/PRD.md`, `docs/PRODUCT_DEFINITION.md`, `docs/API_CONTRACT.md`, `docs/FUNCTION_SPEC_DRAFT.md`,
  `docs/IMPLEMENTATION_DIRECTION.md`, `docs/superpowers/specs/*`)에 `4.18`, `12.3` 같은 절 번호나 번호 붙은 규칙 목록이 없다.
- `git log --all --diff-filter=D`에 지워진 설계서·인계 문서가 없다. 표기는 2026-09-18 커밋(1e0264c AX-302, 40524bf AX-311, 60bf4b0 AX-312)에서
  처음 나온다. 저장소 밖 작업 문서였다.
- `docs/API_CONTRACT.md`는 `규칙 28`·`규칙 31`처럼 같은 번호를 인용만 한다. 목록 자체는 없다.

원본은 없지만 번호 구조는 거의 다 복원된다.

| 옛 장 | 내용 | 지금 남은 같은 구조 |
| --- | --- | --- |
| 3장 | 3.1 화면 목록, 3.2 기본 흐름 | `docs/platform/IA_AND_FLOWS.md` 1장 '화면 목록', 2장 '기본 흐름'. `/` 행 문구가 주석과 글자까지 같다 |
| 4.1~4.10 | 체류부터 사용자 편집까지 | `docs/platform/ITINERARY_RULES.md` 1~10장과 **장 번호가 하나씩 같다**(1 체류, 2 숙소, 3 병원, 4 조건 기간, 5 합성·분류, 6 매일 확인, 7 하루 일정, 8 장소 후보, 9 전체 일정·변화, 10 사용자 편집). `spec 4.9 변화 원천 4·6·7`의 번호도 ITINERARY_RULES 9.2 표의 행 번호와 같다 |
| 4.11~4.21 | 보호자, 카드, 알림, 지도, 긴급, AI 소개, 언어, 보기 전용, 로그인·동의·삭제, 병원 연동, 운영 | `docs/business-rules.md`의 절 순서가 4.1부터 4.21까지 순서와 같다(긴급·보기 전용·로그인은 IA_AND_FLOWS와 security.md로 갔다) |
| 5장 | 5.1 기기 모델, 5.2 일정 모델, 5.3 지침 계약 v2, 5.4 보호자 스냅샷 | 한 문서로 남지 않았다. 타입은 코드의 JSDoc `@typedef`(`src/stay/stay.js` Stay·Address, `src/stay/conditions.js`, `src/engine/dayPlan.js` Outing, `src/engine/dayDelta.js`, `src/guardian/snapshot.js`)에, 요청 모양은 `docs/contracts.md`에 있다 |
| 6장 | API | `docs/contracts.md` |
| 7장 | 디자인 시스템 | `docs/platform/DESIGN_SYSTEM.md`(배지 5종, 출처 영역 5종, 앱 셸, 시안 보드 절이 주석 내용과 같다) |
| 9장 | 9.1 유지하는 불변조건, 9.2 바뀌는 것 | `docs/platform/PRODUCT_DEFINITION_V3.md` 7장 '불변조건'의 7.1 '유지하는 것', 7.2 '바뀌는 것 (이번 결정)' |
| 10장 | 번호 붙은 규칙 목록(규칙 1~57, 13-1, 13-2) | **`규칙 N`의 번호 출처.** 주석의 `spec 10장 규칙 N` 표기가 근거다. 목록 자체는 없다. 번호별 뜻은 같은 번호를 쓰는 테스트 이름(`describe('규칙 N ...')`)으로 모두 확인했다 |
| 11장 | 조정 가능한 기본값 | `docs/platform/ITINERARY_RULES.md` 11장(장 번호까지 같다) |
| 12장 | 12.3 화면 테스트 시나리오 | 대응 없음(5절) |
| 13장 | 사람이 할 일 | `docs/platform/HUMAN_ACTIONS.md` |
| handoff 3장 | 작업 관문(2번 새 패키지 금지, 9번 임시값 완화 금지, 10번 기억으로 쓰지 않기) | `docs/standards.md` |
| handoff 4장 | 결정 사항('아니오'와 '모르겠음', 4개 언어 조회를 버림) | `docs/business-rules.md` '조건 기간', ADR-0007 |

ITINERARY_RULES.md와 IA_AND_FLOWS.md는 둘 다 2026-09-18 기준일(AX-301)이고, 옛 설계서를 사람이 읽게 다시 쓴
문서로 보인다. 그래서 4.1~4.10, 9.x 변화 원천, 11장은 번호만으로도 대응이 정확하다. 다만 정리 작업의 기본 대상은
`docs/business-rules.md`다(CLAUDE.md의 '도메인 규칙 정본'). ITINERARY_RULES는 business-rules에 없는 표(데모 사건,
변화 원천 번호, 기본값 표)를 가리킬 때만 쓴다. 11-07 변환도 같은 방식이었다.

## 4. 대응표

문서 이름 줄임: BR = `docs/business-rules.md`, SEC = `docs/security.md`, CON = `docs/contracts.md`, STD = `docs/standards.md`,
EN = `docs/engineering-notes.md`, OPS = `docs/operations.md`, IA = `docs/platform/IA_AND_FLOWS.md`,
IR = `docs/platform/ITINERARY_RULES.md`, V3 = `docs/platform/PRODUCT_DEFINITION_V3.md`, DS = `docs/platform/DESIGN_SYSTEM.md`.
**주석에 쓸 때는 줄임말이 아니라 경로 전체를 쓴다.** 절 제목은 문서에 적힌 그대로다(번호는 빼고 쓴다: IR `### 9.3 데모 사건`은 `'데모 사건'`).
'5080f9f'는 2026-11-07 변환 커밋에서 같은 쌍을 확인했다는 뜻이다.

### 4.1 `spec N.N`, `spec N장`

| 옛 참조 (건·파일) | 지금 문서 | 절 제목 | 확신 | 근거 |
| --- | --- | --- | --- | --- |
| `spec 3.1` (22·21) | IA | '경로'. 화면 하나의 동작을 말하면 그 화면의 흐름 절('매일 쓰는 흐름', '일정 편집', '보호자' 등). 퇴역 화면(`/plan`, `/result`)은 '퇴역하는 화면' | 확실 | IA '경로' 표의 `/` 행이 주석 문구('언어 선택, 고지 3종, 로그인 유도')와 같다. 5080f9f에서 /today, /trip/[date]의 3.1이 IA 흐름 절로 바뀌었다 |
| `spec 3.2` (3·3) | IA | '처음 쓰는 사람' | 확실 | 주석 내용(시작, 로그인, 체류 설정 순서)이 2.1절 흐름과 같다 |
| `spec 4.1` (24·16) | BR | '체류'. 공항 이동 추정 값은 IR '공항 이동 추정 (`lib/server/airports.js` `AIRPORT_TRANSFER`)' | 확실 | 5080f9f: '4.1 자동 삭제', '4.1 활성 체류는 하나'가 BR '체류'. IR 1장 '체류'와 번호가 같다 |
| `spec 4.2` (16·12) | BR | '숙소와 병원' | 확실 | '날짜 D의 숙소', 출국일 전날 밤 숙소, `LODGING_REQUIRED`가 이 절에 있다. IR 2장 '숙소 구간' |
| `spec 4.3` (30·18) | BR | '숙소와 병원'. 경계일만 말하면 '체류' | 확실 | 예상 종료 240분·90분, 병원 목록·추천 금지, 병원 일정 블록이 이 절에 있다. IR 3장 |
| `spec 4.4` (38·19) | BR | '조건 기간'. '4.4 표'는 '조건 기간'의 항목 표 | 확실 | 5080f9f: '4.4 표'가 '조건 기간'의 항목 표. IR 4장 |
| `spec 4.5` (29·19) | BR | '날짜 분류'. 합성·출처·'모르겠음' 치환을 말하면 '날짜별 합성' | 확실 | 5080f9f: '4.5 NEEDS_INPUT 사유 표'가 '날짜 분류'. IR 5장이 합성과 분류를 함께 담고 BR은 두 절로 나눴다 |
| `spec 4.6` (24·16) | BR | '매일 확인' | 확실 | 5080f9f 여러 곳. IR 6장 |
| `spec 4.7` (40·22) | BR | '하루 일정 생성'. '4.7 표'는 '하루 일정 생성'의 마감 후보 표, '보호자 일정'은 같은 절의 보호자 단독 외출 | 확실 | 5080f9f. IR 7장 |
| `spec 4.8` (47·27) | BR | '장소 후보와 필터' | 확실 | 5080f9f('4.8 · 5.2 Stop.labels'). IR 8장 |
| `spec 4.9` (43·29) | BR | '전체 일정 확정과 변화 대응'. 꼬리말별: '즉시 복귀'·'returnNow 해제'는 IA '즉시 복귀', 'DemoEvent'·'데모 사건'은 IR '데모 사건', '변화 원천 N'은 IR '변화 원천'(표의 N번 행), '전후 비교'는 BR 같은 절 | 확실 | 5080f9f에 네 갈래 모두 있다. IR 9장, 9.2 표 번호가 주석의 '변화 원천 4·6·7'과 같다 |
| `spec 4.10` (19·15) | BR | '사용자 편집' | 확실 | 5080f9f. IR 10장 |
| `spec 4.11` (40·27) | BR | '보호자'. 탭 임시 보관은 SEC '기기 저장소와 계정 이름공간', PIN·암호·링크 길이는 SEC '보호자 링크' | 확실 | 5080f9f: '4.11'이 BR '보호자', '4.11 임시 보관'이 SEC '기기 저장소와 계정 이름공간' |
| `spec 4.12` (11·8) | BR | '알림과 카드'(한국어 안내 카드 문단) | 확실 | 카드가 고정 문구이고 로그인 만료·오프라인에도 보인다는 문장이 이 절에 있다 |
| `spec 4.13` (11·10) | BR | '알림과 카드'. 실행 방식(앱이 열려 있을 때만, 서버 없이)은 `lib/notify/AGENTS.md` | 확실 | 5080f9f 여러 곳. 옛 표기 `T16a`도 같은 쌍으로 바뀌었다 |
| `spec 4.14` (14·11) | BR | '알림과 카드'(지도 링크 문단). 출발지 매개변수 금지는 SEC '위치 정보'도 같다 | 확실 | 5080f9f('4.14 · 규칙 39') |
| `spec 4.15` (8·8) | IA | '고정 요소'. 번호 근거는 `docs/decisions/0010-map-links-emergency-notifications.md` | 확실 | IA '긴급 연락은 모든 화면에서 바닥에 붙어 있다'가 주석('긴급은 어느 화면에서든 닿아야 한다')과 같다 |
| `spec 4.16` (17·13) | BR | 'AI 소개 문장'. 모델 선택·평가 세트는 `docs/platform/AI_USE_CASE_INTRO.md` | 확실 | 5080f9f |
| `spec 4.17` (34·27) | BR | '언어'. ja·zh 검수 스위치는 `src/i18n/AGENTS.md` | 확실 | 5080f9f(`safetyPair`, 지원 언어, 검수 스위치) |
| `spec 4.18` (37·32) | IA | '보기 전용 상태'. 권한 표는 SEC '권한' | 확실 | 5080f9f 여러 곳. 서비스 워커·매니페스트의 4.18도 IA '보기 전용 상태'의 '앱 셸과 위 화면은 오프라인에서 동작한다'에 해당 |
| `spec 4.19` (35·30) | SEC | '기기 저장소와 계정 이름공간'(내 정보 지우기), '민감정보 동의'(동의·철회 저장), '인증'(로그인·세션·로그아웃). 화면 흐름은 IA '동의 철회와 데이터 삭제', 로그아웃 보류는 `lib/store/AGENTS.md` | 확실 | 5080f9f에 다섯 갈래 모두 있다 |
| `spec 4.20` (31·18) | BR | '병원 연동' | 확실 | 5080f9f |
| `spec 4.21` (8·7) | BR | '운영 안전장치'(추천 중단 스위치). 판정 운영 로그는 SEC '기록', 관광공사 호출 경고·차단 값은 OPS '환경변수' | 추정 | 한 옛 절이 세 문서로 갈라졌고 바꾼 이력이 없다. BR 절 순서의 마지막이라 순서는 맞다 |
| `spec 5.1` (55·33) | SEC | 저장 키·계정 항목은 '기기 저장소와 계정 이름공간', `consent.sensitive`는 '민감정보 동의', `LinkedPlan.acknowledged`는 BR '병원 연동'. 타입 이름(Stay, Address, ConditionItems, ConditionPeriod)은 코드의 `@typedef`(`src/stay/stay.js`, `src/stay/conditions.js`), 서버로 가는 모양은 CON '판정 요청에 실리는 체류 (`PlanStay`)' | 확실 (타입 이름 갈래는 추정) | 5080f9f: 키·동의·LinkedPlan 세 갈래. 타입 이름 갈래는 이력이 없고, 지금 정본이 코드 typedef라고 판단했다 |
| `spec 5.2` (33·22) | CON | `DayPlan`·`warnings`는 '`POST /api/itinerary/plan`'. 새 사유 코드는 IA '이번에 새로 쓰는 사유 코드', `Stop.labels`는 BR '장소 후보와 필터', `Outing.returnBy`·`plannedReturnAt`은 EN '복귀 마감과 예상 귀가 시각은 다른 값이다', `deadlineReason`·타임라인은 BR '하루 일정 생성', `DayDelta`는 BR '전체 일정 확정과 변화 대응'. 타입은 `src/engine/dayPlan.js`(Outing), `src/engine/dayDelta.js`(DayDelta) | 확실 | 5080f9f에 여섯 갈래 모두 있다 |
| `spec 5.3` (6·4) | CON | '`POST /api/plan/link`'. 허용 목록·전체 거부는 `src/recovery/AGENTS.md` '항상 지켜야 하는 것'과 SEC '병원 데이터', 결정은 ADR-0011 | 확실 | '계약 v2만 받는다, 형식이 어긋나면 전체 거부, 목록 밖 필드는 버린다'가 세 곳에 문장 그대로 있다 |
| `spec 5.4` (13·9) | BR | '보호자'(담는 것·담지 않는 것). 암호화·길이는 SEC '보호자 링크', 타입은 `src/guardian/snapshot.js` `GuardianSnapshot` | 확실 | 스냅샷 허용 항목이 BR '보호자'에 목록으로 있다 |
| `spec 6장` (60·44) | CON | 경로가 함께 적혀 있으면 그 경로 절('`POST /api/itinerary/plan`', '`POST /api/itinerary/alternatives`', '`POST /api/itinerary/intro`', '`POST /api/address/search`', '`POST /api/place`', '`POST /api/plan/link`', '`GET /api/auth/session`', '`GET /api/health`'). 경로가 없으면 '공통' | 확실 | 5080f9f 네 곳('6장 POST /api/place' 등) |
| `spec 7장` (24·20) | DS | 내용별: 토큰은 '토큰', 부품은 '부품 (`components/ui/`)', 상태 3겹 표시는 '판정 상태 표시', 배지는 '배지 5종 (`Badge`)', 출처 영역은 '출처 영역 5종 (`SourceArea` · `SourceTag`)', 앱 셸은 '앱 셸 (`AppShell`)', 시안 보드는 '시안 보드 (`/design-board`)'. '고정 데모 데이터만 쓰고 사용자 데이터는 읽지 않는다'는 STD '안전 규칙의 구조적 강제'. 44px·반응형은 STD '테스트' | 확실 | DS 절 구성이 주석 내용과 같다. 11-07에는 고정 데모 데이터 문장이 문서에 없어 문장을 남겼지만, 지금은 STD에 있다(5절) |
| `spec 7.2` (1·1) | BR | '전체 일정 확정과 변화 대응'의 재계획 규칙 2 | 추정 | `components/guardian/share.js` 한 곳. 주석 문장('지난 날짜의 일정은 바뀌지 않는다')이 재계획 규칙 2와 같다. 7장은 디자인 시스템이라 번호가 맞지 않아 오기로 본다 |
| `spec 9.1` (28·24) | V3 | '유지하는 것'. 문장별로 더 가까운 절이 있으면 그쪽: '안전합니다' 금지는 BR '이 제품이 하지 않는 판단', 병원 목록·추천 금지는 BR '숙소와 병원', 데모 배지는 BR '병원 연동', 현재 위치는 SEC '위치 정보', 키·검색어·URL 로그 금지는 SEC '비밀값'·'기록', 원문·추정 분리와 이미지 내려받기 금지는 BR '장소 후보와 필터' | 확실 | 5080f9f 두 곳('안전합니다', 데모). V3 7.1 목록이 주석에 인용된 9.1 문장들과 하나씩 맞는다 |
| `spec 9.2` (1·1) | V3 | '바뀌는 것 (이번 결정)'. 경계일 이후 빈 날짜 규칙은 BR '날짜 분류' | 확실 | `src/stay/coverage.js`의 "병원 조건이 없으면 추천하지 않는다 원칙의 의도된 변경"이 V3 7.2 표의 행과 같다 |
| `spec 10장` (13·13) | (규칙 표) | 4.2절 규칙 표를 따른다. `spec 10장`은 지우고 뒤의 `규칙 N`만 바꾼다 | 확실 | `spec 10장 규칙 N` 꼴이 10장이 규칙 목록임을 보여준다 |
| `spec 11장` (14·10) | IR | '조정 가능한 기본값'. 코드 위치를 말하면 '숫자 기본값의 코드 위치 (`src/stay/defaults.js`)', 단서는 '단서 목록 (`src/tour-api/cues.js`)'. 관광공사 경고·차단 값은 OPS '환경변수' | 확실 | 5080f9f 세 곳. 장 번호도 같다 |
| `spec 12.3` (14·14) | 없음 | 시나리오 번호는 대응 없음. '외부 호출 0건'은 STD '테스트', EN '화면 테스트가 외부를 부르지 않게 하는 방법' | 대응 없음 | 화면 테스트 시나리오 목록이 지금 문서에 없다(5절) |
| `spec 13장` (1·1) | `docs/platform/HUMAN_ACTIONS.md` | 표의 2번 행(관광공사 일본어·중국어 서비스 활용 신청) | 확실 | `src/tour-api/config.js`의 '운영자가 활용 신청을 해야 쓸 수 있다'와 같은 항목 |

### 4.2 `규칙 N`, `규칙 N-N`

번호 뜻은 같은 번호를 쓰는 테스트 이름과 주석으로 확인했다. '뜻' 칸이 그 확인 결과다.

| 옛 참조 (건·파일) | 지금 문서 | 절 제목 | 확신 | 근거 (뜻) |
| --- | --- | --- | --- | --- |
| `규칙 1` (14·7) | BR | '체류' | 확실 | 출국일이 입국일보다 빠름, 45박 초과면 저장 거부. BR 거부 조건 목록 1·2번째 |
| `규칙 2` (11·7) | BR | '체류' | 확실 | 수술·시술(`PROCEDURE`) 일정 1개 이상. BR 거부 조건 3번째 |
| `규칙 3` (15·9) | BR | '체류'(숙소 구간 날짜 겹침). 숙소 없는 날짜를 말하면 '숙소와 병원'(`LODGING_REQUIRED`) | 확실 | `test/stay-validate.test.js` '규칙 3 숙소 구간', `test/stay-coverage.test.js` '규칙 3 숙소 없는 날짜' |
| `규칙 4` (3·2) | BR | '날짜 분류' | 확실 | 경계일 이후 빈 날짜는 입력 필요 |
| `규칙 5` (5·3) | BR | '날짜 분류' | 확실 | 경계일 이전 빈 날짜는 자유일(`FREE`) |
| `규칙 6` (10·5) | BR | '조건 기간' | 확실 | 외출 허용·복귀 시각은 필수이고 '모르겠음'을 고를 수 없다 |
| `규칙 7` (7·4) | BR | '조건 기간'(항목 표) | 확실 | '모르겠음'은 가장 엄격한 기본값(보행 15분 등), '아니오'는 제한 없음 |
| `규칙 8` (5·2) | BR | '날짜별 합성' | 확실 | 항목마다 가장 엄격한 값, 이긴 값의 출처를 남긴다 |
| `규칙 9` (5·3) | BR | '날짜 분류'(`REST_DAY` 행), '하루 일정 생성'(보호자 단독 외출) | 확실 | `REST_DAY`와 보호자 단독 외출 가능 여부 |
| `규칙 10` (6·3) | BR | '하루 일정 생성' | 확실 | 동행 필요인데 동반 보호자 없음이면 `ESCORT_REQUIRED` |
| `규칙 11` (15·7) | BR | '날짜별 합성' | 확실 | 한 병원 기간 안의 모순은 `CONFLICTING_CONDITION`으로 막는다 |
| `규칙 12` (23·13) | BR | '병원 연동'(기간을 잘라내지 않는다), '날짜별 합성'(유효기간이 활동 종료보다 늦은 병원 기간만), 만료 안내는 '날짜 분류' | 확실 | 만료·제한 지침도 그대로 저장하고 날짜마다 적용 여부를 정한다 |
| `규칙 13` (7·4) | IA | '즉시 복귀'(BR '전체 일정 확정과 변화 대응'의 즉시 복귀 문단도 같다) | 확실 | 5080f9f. 외출 중 지침 철회·만료, 환자 호출 |
| `규칙 13-1` (18·13) | BR | '숙소와 병원' | 확실 | 5080f9f. 복귀 장소가 병원이면 그 `hospitalId` 병원. 조건 입력 검증(병원 복귀인데 `hospitalId` 없음)도 같은 절로 둔다 |
| `규칙 13-2` (4·3) | BR | '숙소와 병원'(병원 일정 직전 마지막 외출). 블록 계산은 EN '병원 일정 직전 외출의 블록 계산' | 확실 | IR 72행이 이 규칙에 '규칙 13-2'를 직접 붙여 적는다 |
| `규칙 14` (6·5) | BR | '체류' | 확실 | 입국일 일정 시작 = 도착 + 입국 수속 90분 + 공항에서 숙소 이동 추정 |
| `규칙 15` (6·5) | BR | '체류' | 확실 | 출국일 일정 마감 = 출발 − 3시간 − 숙소에서 공항 이동 추정 − 30분 |
| `규칙 16` (5·3) | BR | '하루 일정 생성' | 확실 | '숙소에서 복용' 복약 시각은 고정 블록이고 마감(`MEDICATION`)을 만든다 |
| `규칙 17` (5·3) | BR | '하루 일정 생성'(마감 후보 표), '조건 기간'(복약 행) | 추정 | '숙소 밖 복용'은 마감을 만들지 않는다. BR은 마감 후보 표에서 미루어 읽히게만 적고, 직접 문장은 V3 '바뀌는 것 (이번 결정)' 표에 있다 |
| `규칙 18` (2·1) | BR | '하루 일정 생성' | 확실 | 짧은 창: 45분 미만 구간은 외출을 만들지 않는다(`DEPARTURE_WINDOW_TOO_SHORT`) |
| `규칙 19` (5·3) | BR | '하루 일정 생성' | 확실 | 체류는 정거장당 15분 미만으로 줄이지 않는다 |
| `규칙 20` (2·1) | BR | '하루 일정 생성' | 확실 | 보행 한도는 외출 1회 누적 |
| `규칙 21` (6·4) | BR | '장소 후보와 필터'(식이 표) | 확실 | 술: 주점 유형 제외 |
| `규칙 22` (7·4) | BR | '장소 후보와 필터'(식이 표) | 확실 | 매운 음식·날음식, 단서 없어도 제외, 카페·전통찻집은 '해당 없음' |
| `규칙 23` (4·3) | BR | '장소 후보와 필터'(식이 표) | 확실 | 뜨거운·딱딱한 음식은 제외하지 않고 주문 카드 연결 |
| `규칙 24` (3·2) | BR | '하루 일정 생성'(식사 칸 문단) | 확실 | 식사 칸이 비는 것은 정상 결과 |
| `규칙 25` (6·3) | BR | '장소 후보와 필터'(게이트 표) | 확실 | 열 노출·물 단서 제외 |
| `규칙 26` (5·4) | BR | '장소 후보와 필터'(게이트 표의 휴무 행) | 확실 | 일정 날짜 기준 휴무 |
| `규칙 27` (20·12) | BR | '전체 일정 확정과 변화 대응'(판정 결과가 언어에 따라 달라지면 결함), '장소 후보와 필터'(한국어 원문 이름과 분류 코드로만 판단) | 확실 | IR 481행이 같은 내용에 '규칙 27'을 붙인다 |
| `규칙 28` (3·2) | BR | '하루 일정 생성' | 확실 | 5080f9f. 같은 입력이면 같은 결과 |
| `규칙 29` (4·3) | BR | '하루 일정 생성' | 확실 | 5080f9f. 같은 장소는 체류 중 한 번만 자동 배치 |
| `규칙 30` (6·5) | BR | '전체 일정 확정과 변화 대응'(재계획 규칙 2~4) | 확실 | 5080f9f. 지난 날짜·고정·삭제 |
| `규칙 31` (8·5) | BR | '전체 일정 확정과 변화 대응' | 확실 | 5080f9f. 변화가 필요한데 전후 비교가 비면 실패 |
| `규칙 32` (19·14) | BR | '매일 확인'·'사용자 편집' | 확실 | 5080f9f. 매일 확인 전 길찾기·장소 이동·편집을 막는다 |
| `규칙 33` (9·6) | BR | '사용자 편집'(교체) | 확실 | 교체 후보 최대 5개, 외출 전체를 다시 검증 |
| `규칙 34` (6·4) | BR | '운영 안전장치' | 확실 | 추천 중단 스위치: 정거장 0개 + `NO_TOURISM` + `SERVICE_PAUSED` |
| `규칙 35` (5·3) | SEC | '기록' | 확실 | 판정 운영 로그에 개인정보 0건 |
| `규칙 36` (16·8) | BR | 'AI 소개 문장' | 확실 | 5080f9f('spec 4.16 · 규칙 36'). 스위치·키, 입력 허용 목록, 출력 검사 |
| `규칙 37` (18·12) | BR | '보호자'(담는 것·담지 않는 것). PIN 5회 잠금은 SEC '보호자 링크' | 확실 | 스냅샷 내용과 잠금 |
| `규칙 38` (12·9) | SEC | '보호자 링크'(암호문은 `#` 뒤에만). 탭 임시 보관은 '기기 저장소와 계정 이름공간' | 확실 | 암호문을 서버 요청·로그에 싣지 않는다 |
| `규칙 39` (15·10) | BR | '알림과 카드'(지도 링크 문단) | 확실 | 5080f9f. 숙소·병원 좌표는 어떤 지도 링크에도 넣지 않는다 |
| `규칙 40` (8·6) | IA | '보기 전용 상태'. 권한 표는 SEC '권한' | 확실 | 로그인 만료·오프라인에도 오늘·카드·긴급을 보기 전용으로 연다 |
| `규칙 41` (13·7) | SEC | '기기 저장소와 계정 이름공간'. 로그아웃 보류는 SEC '인증'의 5번과 `lib/store/AGENTS.md` | 확실 | 5080f9f. '이 기기에서 내 정보 지우기' |
| `규칙 42` (4·2) | BR | '체류' | 확실 | 5080f9f. 출국 7일 후 첫 실행 때 삭제 |
| `규칙 43` (8·5) | BR | '언어' | 확실 | 안전 문구 병기(선택 언어 + 한국어, ko는 한국어 + 영어) |
| `규칙 44` (9·5) | BR | '언어' | 확실 | 브라우저 언어로 정하는 순서 |
| `규칙 45` (5·2) | `src/adapters/AGENTS.md` | '테스트' | 확실 | 좌표 변환은 알려진 지점 3곳 이상에서 10m 이내. `docs/` 아래에는 없고 이 AGENTS.md에만 있다 |
| `규칙 46` (11·7) | SEC | '위치 정보'. 서버 쪽(현재 위치류 필드를 버린다)은 CON '공통' | 확실 | 현재 위치 수집 금지, 권한 요청 0건 |
| `규칙 47` (9·4) | BR | '알림과 카드'. 실행 쪽은 `lib/notify/AGENTS.md` | 확실 | 5080f9f. 알림 문구에 조건·병원·복약 정보 없음, 예약 항목 허용 목록 |
| `규칙 48` (10·6) | BR | '병원 연동'. 경로는 CON '`POST /api/plan/link`' | 확실 | v1 지침은 받지 않는다 |
| `규칙 49` (15·9) | BR | '전체 일정 확정과 변화 대응'(오늘 게이트 덧씌우기 문단) | 확실 | 5080f9f. 덧씌우기는 저장 일정을 바꾸지 않는다 |
| `규칙 50` (5·5) | IR | '데모 사건'(변화 원천 표의 6번 행도 같다) | 확실 | 5080f9f('규칙 50·55'). 데모 사건 6종은 오늘에만 효과 |
| `규칙 51` (9·6) | BR | '전체 일정 확정과 변화 대응'(언어 변경만 예외). 요청 필드는 CON '`POST /api/itinerary/plan`'의 `relabelOnly` | 확실 | 5080f9f |
| `규칙 52` (2·1) | BR | '하루 일정 생성' | 확실 | 식사 칸과 정거장 수(느긋하게 2·3곳, 보통 3·5곳) |
| `규칙 53` (2·1) | BR | '하루 일정 생성'(보호자 단독 외출) | 확실 | 보호자 외출은 환자가 숙소에 있는 구간에만 |
| `규칙 54` (13·7) | CON | '판정 요청에 실리는 체류 (`PlanStay`)' | 확실 | 일정 요청에는 PlanStay 허용 목록만, 동의 문구 버전·시각은 버린다 |
| `규칙 55` (13·7) | IR | '데모 사건'(누적 저장과 매번 다시 보냄). 멱등 부분은 없음 | 대응 없음 (일부) | 5080f9f는 '규칙 28·55'를 BR '하루 일정 생성'과 IR '데모 사건'으로 바꿨지만, '다시 보내도 효과가 두 번 더해지지 않는다'는 지금 문서에 없다(5절) |
| `규칙 56` (19·8) | BR | '병원 연동'(갱신 시각이 바뀌면 확인이 풀린다). 앱 열 때 미확인 중요 안내 대기는 '매일 확인' | 확실 | 5080f9f 두 갈래('규칙 56'이 '매일 확인', 'LinkedPlan.acknowledged'가 '병원 연동') |
| `규칙 57` (14·8) | CON | '`POST /api/plan/link`'(복귀 장소가 '병원'이면 연결 병원이 정해진 뒤 채운다). `src/recovery/AGENTS.md` '항상 지켜야 하는 것'도 같다 | 확실 | 원문 `returnTime.place = "HOSPITAL"`에 `hospitalId`가 없고 기기 변환이 채운다 |

### 4.3 바꾸지 않는 번호 표기

| 표기 (건·파일) | 처리 | 이유 |
| --- | --- | --- |
| `재계획 규칙 2`, `재계획 규칙 1~5`(원문은 엔대시) (12·4) | 앞에 문서를 붙인다: `docs/business-rules.md '전체 일정 확정과 변화 대응'의 재계획 규칙 2`. 이미 같은 괄호에 그 문서가 있으면 그대로 둔다 | BR과 IR 9.4의 번호 목록(1~5)과 번호가 같다. 확실 |
| `ADR-0003 규칙 1`, `ADR-0004 규칙 9` (2·2) | 그대로 둔다 | 저장소에 있는 결정 기록의 번호다 |
| `AX-NNN` | 그대로 둔다 | 작업 번호다 |

### 4.4 `handoff N장`, `handoff N장 N번`

| 옛 참조 (건·파일) | 지금 문서 | 절 제목 | 확신 | 근거 |
| --- | --- | --- | --- | --- |
| `handoff 3장 2번`, `handoff 3장 2` (2·2) | STD | '의존성' | 확실 | `src/guardian/crypto.js`, `src/adapters/utmk.js`의 '새 라이브러리 없이 표준 기능으로'가 STD의 '좌표 변환, PIN 암호화 ... 모두 이 방식'과 같다 |
| `handoff 3장 9번` (1·1) | STD | '값이 사는 곳' | 확실 | `src/stay/defaults.js`의 '검토 전에 더 느슨하게 바꾸지 않는다'가 STD의 '사람 검토 전 임시값 ... 더 느슨하게 바꾸지 않는다'와 같다 |
| `handoff 3장 10`, `handoff 3장 관문 10` (3·3) | STD | '외부 API 형식' | 확실 | '기억으로 쓰지 않는다, 공식 문서로 확인'이 STD 문장 그대로다 |
| `handoff 4장` (3·3) | BR | '아니오'·'모르겠음'은 '조건 기간'(답 세 종류 표). '4개 언어를 모두 조회하지 않는다'는 `docs/decisions/0007-four-languages-server-lang.md` '대안과 버린 이유' | 확실 | BR '아니오와 모르겠음을 반드시 구분한다', ADR-0007 버린 대안 표의 '4개 언어를 모두 조회' 행 |

### 4.5 집계

| 표 | 행 | 확실 | 추정 | 대응 없음 |
| --- | --- | --- | --- | --- |
| 4.1 spec | 36 | 33 | 2 (`spec 4.21`, `spec 7.2`) | 1 (`spec 12.3`) |
| 4.2 규칙 | 59 | 57 | 1 (`규칙 17`) | 1 (`규칙 55`의 멱등 부분) |
| 4.3 재계획 규칙 | 1 | 1 | 0 | 0 |
| 4.4 handoff | 4 | 4 | 0 | 0 |
| 합계 | 100 | 95 | 3 | 2 |

`spec 5.1`의 타입 이름 갈래는 '확실' 행 안의 추정 갈래로 따로 표시했다(집계는 확실).

## 5. 대응 없음 목록

지금 문서가 말하지 않는 규칙이다. 참조는 지우고 아래 문장을 주석에 남긴다. 문장이 이미 주석에 있으면 참조만 지운다.

| 옛 참조 | 남길 규칙 문장 | 쓰이는 곳 |
| --- | --- | --- |
| `규칙 55` (멱등 부분) | 같은 사건 목록을 다시 보내도 효과가 두 번 더해지지 않는다. 오늘 사건은 받은 목록 전체를 처음부터 접어 한 번에 적용한다. | `src/engine/tripEvents.js`, `src/engine/tripPlan.js`, `lib/trip/requests.js`, `e2e/demo-events.spec.js`, `test/trip-replan.test.js`, `test/trip-sync-core.test.js`, `test/trip-sync-runtime.test.js`. 누적·재전송 부분은 IR '데모 사건'으로 바꾼다 |
| `spec 12.3` 시나리오 N | 참조를 지우고 시나리오 번호도 지운다. 각 e2e 파일의 머리 주석 첫 줄이 이미 그 시나리오를 설명한다(예: '데모 병원 연동 A/B/C'). '외부 호출 0건'은 STD '테스트'로 바꾼다 | `e2e/` 14개 파일 |

findings 5가 11-07에 '대응 없음'으로 남긴 세 가지의 지금 상태:

| 11-07에 남긴 문장 | 지금 상태 | 정리 작업에서 할 일 |
| --- | --- | --- |
| `/design-board`는 고정 데모 데이터만 쓰고 사용자 데이터를 읽지 않는다 | **이제 대응 있음.** STD '안전 규칙의 구조적 강제'에 '시안 보드는 고정 데모 데이터만 쓰고 기기 저장소를 읽지 않는다'가 있다(`test/design-board-boundary.test.js`가 강제) | `spec 7장 '고정 데모 데이터만 ...'`은 STD '안전 규칙의 구조적 강제'로 바꾼다. 11-07에 문장만 남긴 `lib/trip/runtime.js` 쪽은 그대로 둬도 된다 |
| 알림 예약 항목은 허용 목록 필드만 가진다 | 11-07에 BR '알림과 카드'에 적었다. STD '안전 규칙의 구조적 강제'의 알림 항목에도 있다 | `규칙 47`은 4.2절대로 바꾼다 |
| 같은 데모 사건을 다시 보내도 결과가 같다 | 아직 대응 없음(위 `규칙 55`) | 위 문장을 남긴다. 문서에 적을지는 별도 결정(7절) |

## 6. 파일별 작업 묶음 제안

272개 파일을 폴더 기준으로 9개 묶음으로 나눈다. 묶음 하나가 PR 하나이고, PR마다 주석만 바뀐다. 묶음마다
작성과 검토를 나눈다(작성자와 다른 검토자가 표와 대조).

권하는 순서는 판정 규칙이 몰린 곳부터다. 근거를 찾는 사람이 가장 손해를 보는 곳이 판정 핵심이기 때문이다.

| 순서 | 묶음 | 파일 | 주로 쓰는 문서 | 검토 포인트 |
| --- | --- | --- | --- | --- |
| 1 | 판정 핵심: `src/stay`, `src/engine`, `src/recovery` | 25 | BR, IR, CON, `src/recovery/AGENTS.md` | `규칙 N` 밀도가 가장 높다. JSDoc 안 참조와 `@typedef` 옆 `spec 5.x`가 많다. `src/stay/defaults.js`의 `handoff 3장 9번` |
| 2 | 경계 모듈: `src/tour-api`, `src/adapters`, `src/guardian`, `src/auth`, `src/i18n` | 32 | BR, SEC, STD, ADR-0007 | `handoff 3장` 6건 중 5건과 `handoff 4장` 1건이 여기 있다(나머지 `handoff 3장 9번`은 묶음 1의 `src/stay/defaults.js`, `handoff 4장` 2건은 묶음 5·6). `src/i18n/messages/*.js`의 문구 값은 건드리지 않는다(주석만) |
| 3 | `lib` 전체, `public/sw.js`, `scripts` | 27 | BR, SEC, CON, `lib/*/AGENTS.md` | `public/sw.js`는 7절 '서비스 워커' 참고 |
| 4 | `app` 전체(화면 경로, 라우트 핸들러, 시안 보드, CSS 2개) | 35 | IA, CON, SEC, DS | `app/globals.css`의 `:root` 안 주석(7절) |
| 5 | 공용 부품: `components/ui`, `components/pwa`, `components/settings`, `components` 바로 아래 파일 | 31 | DS, BR | `spec 7장`이 몰려 있다 |
| 6 | 기능 부품: `components/onboarding`, `conditions`, `guardian`, `trip`, `cards` | 40 | BR, SEC, IA | 가장 큰 묶음이다. 나누려면 `onboarding`+`conditions`(23)와 나머지(17)로 |
| 7 | 판정 쪽 단위 테스트(`test/stay-*`, `day-plan-*`, `trip-*`, `tour-api-*`, `schedule`, `utmk`, `weather` 등) | 33 | BR, IR | 테스트 이름 문자열은 7절 결정을 따른다 |
| 8 | 나머지 단위 테스트(`test/` 그 밖) | 32 | SEC, CON, BR | 같다 |
| 9 | 화면 테스트(`e2e`) | 17 | IA, STD | `spec 12.3 시나리오 N`(대응 없음) 14개 파일 |

묶음마다 공통 검증:

- `git diff`의 바뀐 줄이 모두 주석 줄(`//`, ` *`, `/*`, `{/* */}`)인지 본다. 코드 줄이 섞이면 되돌린다.
- `npm run lint`, `npm test`. 묶음 4·5·6은 `npm run build`도. 주석만 바꿨어도 JSX 주석(`{/* */}`)을 깨뜨리면 빌드가 깨진다.
- 바꾼 줄에 엠대시·엔대시가 남지 않았는지: `git diff -U0 | grep '^+' | grep -P '\x{2013}|\x{2014}'`가 비어야 한다.
- 남은 옛 참조가 없는지: 묶음 범위에서 `spec [0-9]`, `규칙 [0-9]`(앞에 `ADR-`·`재계획`이 없는 것), `handoff`를 다시 찾는다.

묶음별 파일 목록:

##### 묶음 1: 판정 핵심 (src/stay, src/engine, src/recovery): 25개 파일

`src/engine/alternatives.js`, `src/engine/dayContext.js`, `src/engine/dayDelta.js`, `src/engine/dayPlan.js`, `src/engine/dayRepair.js`, `src/engine/dayTimeline.js`, `src/engine/displayOrder.js`, `src/engine/outingBuilder.js`, `src/engine/safetyGate.js`, `src/engine/slaCalculator.js`, `src/engine/stopCandidate.js`, `src/engine/tripEvents.js`, `src/recovery/fixtures.js`, `src/recovery/gateway.js`, `src/recovery/instructions.js`, `src/recovery/link.js`, `src/recovery/plan.js`, `src/stay/compose.js`, `src/stay/conditions.js`, `src/stay/coverage.js`, `src/stay/dayFrame.js`, `src/stay/defaults.js`, `src/stay/errorCodes.js`, `src/stay/stay.js`, `src/stay/todayGate.js`

##### 묶음 2: 경계 모듈 (src/tour-api, src/adapters, src/guardian, src/auth, src/i18n): 32개 파일

`src/adapters/demoAddresses.js`, `src/adapters/juso.js`, `src/adapters/travelTime.js`, `src/adapters/utmk.js`, `src/adapters/weather.js`, `src/auth/session.js`, `src/guardian/crypto.js`, `src/guardian/errors.js`, `src/guardian/index.js`, `src/guardian/link.js`, `src/guardian/lockout.js`, `src/guardian/snapshot.js`, `src/guardian/unlock.js`, `src/i18n/index.js`, `src/i18n/legal.js`, `src/i18n/messages/aiIntro.js`, `src/i18n/messages/cards.js`, `src/i18n/messages/common.js`, `src/i18n/messages/conditions.js`, `src/i18n/messages/index.js`, `src/i18n/messages/onboarding.js`, `src/i18n/messages/place.js`, `src/i18n/messages/today.js`, `src/tour-api/candidate-service.js`, `src/tour-api/config.js`, `src/tour-api/content-types.js`, `src/tour-api/cues.js`, `src/tour-api/dedupe.js`, `src/tour-api/detail-service.js`, `src/tour-api/mapper.js`, `src/tour-api/schedule.js`, `src/tour-api/signals.js`

##### 묶음 3: lib 전체, public/sw.js, scripts: 27개 파일

`lib/maps.js`, `lib/notify/client.js`, `lib/notify/index.js`, `lib/notify/text.js`, `lib/server/ai-intro-checks.js`, `lib/server/ai-intro.js`, `lib/server/airports.js`, `lib/server/decision-log.js`, `lib/server/itinerary-request.js`, `lib/server/itinerary-service.js`, `lib/server/route-guard.js`, `lib/server/runtime-flags.js`, `lib/store/fingerprint.js`, `lib/store/index.js`, `lib/store/pendingGuardianLink.js`, `lib/trip/affected.js`, `lib/trip/api.js`, `lib/trip/display.js`, `lib/trip/edits.js`, `lib/trip/index.js`, `lib/trip/planStay.js`, `lib/trip/requests.js`, `public/sw.js`, `scripts/ai-intro-eval.mjs`, `scripts/generate-pwa-icons.mjs`, `scripts/seed-e2e-cache.mjs`, `scripts/verify-deployment.mjs`

##### 묶음 4: app 전체 (화면 경로, 라우트 핸들러, 시안 보드, CSS 2개): 35개 파일

`app/api/address/search/route.js`, `app/api/auth/session/route.js`, `app/api/itinerary/alternatives/route.js`, `app/api/itinerary/intro/route.js`, `app/api/itinerary/plan/route.js`, `app/api/place/route.js`, `app/api/plan/link/route.js`, `app/cards/page.js`, `app/conditions/page.js`, `app/design-board/DesignBoard.js`, `app/design-board/ScreenPreviews.js`, `app/design-board/demoData.js`, `app/design-board/page.js`, `app/design-board/screenData.js`, `app/emergency/contacts.js`, `app/emergency/page.js`, `app/g/page.js`, `app/globals.css`, `app/guardian/page.js`, `app/guide/page.js`, `app/layout.js`, `app/link/page.js`, `app/login/page.js`, `app/manifest.js`, `app/more/page.js`, `app/onboarding/page.js`, `app/page.js`, `app/place/[candidateId]/page.js`, `app/plan/page.js`, `app/privacy/page.js`, `app/result/page.js`, `app/settings/page.js`, `app/styles/ui.css`, `app/trip/[date]/page.js`, `app/trip/page.js`

##### 묶음 5: 공용 부품 (components/ui, components/pwa, components/settings, components 바로 아래 파일): 31개 파일

`components/CourseCard.js`, `components/DeltaSheet.js`, `components/EventPanel.js`, `components/FooterLinks.js`, `components/LanguageProvider.js`, `components/StateBanner.js`, `components/pwa/PwaRuntime.js`, `components/pwa/index.js`, `components/pwa/registerServiceWorker.js`, `components/pwa/sessionUpkeep.js`, `components/settings/PairText.js`, `components/settings/moreMenu.js`, `components/ui/AnswerInput.js`, `components/ui/AppShell.js`, `components/ui/Badge.js`, `components/ui/BottomNav.js`, `components/ui/Button.js`, `components/ui/CategoryArt.js`, `components/ui/DateChip.js`, `components/ui/DayTimeline.js`, `components/ui/EmergencyButton.js`, `components/ui/EmptyState.js`, `components/ui/Icon.js`, `components/ui/KoreanCard.js`, `components/ui/MealSlot.js`, `components/ui/PeriodEditor.js`, `components/ui/PlaceCard.js`, `components/ui/ReadOnlyBanner.js`, `components/ui/SourceArea.js`, `components/ui/index.js`, `components/ui/useStoreStatus.js`

##### 묶음 6: 기능 부품 (components/onboarding, conditions, guardian, trip, cards): 40개 파일

`components/cards/TodayCards.js`, `components/cards/cardModel.js`, `components/cards/useDeviceData.js`, `components/conditions/ConsentPanel.js`, `components/conditions/ConsentWithdraw.js`, `components/conditions/CoverageTag.js`, `components/conditions/DayConditions.js`, `components/conditions/PeriodCard.js`, `components/conditions/PeriodEditorForm.js`, `components/conditions/SafetyText.js`, `components/conditions/consent.js`, `components/conditions/linkPlan.js`, `components/conditions/periodFormModel.js`, `components/conditions/summary.js`, `components/conditions/values.js`, `components/guardian/GuardianCreate.js`, `components/guardian/GuardianOpen.js`, `components/guardian/SafetyNote.js`, `components/guardian/errorView.js`, `components/guardian/hooks.js`, `components/guardian/index.js`, `components/guardian/lockoutStorage.js`, `components/guardian/share.js`, `components/onboarding/AddressSearch.js`, `components/onboarding/CompanionStep.js`, `components/onboarding/ErrorSummary.js`, `components/onboarding/Fields.js`, `components/onboarding/HospitalStep.js`, `components/onboarding/LodgingStep.js`, `components/onboarding/OnboardingForm.js`, `components/onboarding/PreferencesStep.js`, `components/onboarding/StartArt.js`, `components/onboarding/TravelStep.js`, `components/onboarding/draft.js`, `components/trip/DailyCheckCard.js`, `components/trip/DayFacts.js`, `components/trip/IntroArea.js`, `components/trip/MapLinks.js`, `components/trip/RegenerateSheet.js`, `components/trip/SwapSheet.js`

##### 묶음 7: 판정 쪽 단위 테스트 (test/stay-*, day-plan-*, trip-*, tour-api-* 등): 33개 파일

`test/address-search.test.js`, `test/day-plan-candidates.test.js`, `test/day-plan-core.test.js`, `test/day-plan-fixtures.js`, `test/engine-foundation.test.js`, `test/itinerary-fixtures.js`, `test/maps.test.js`, `test/place-api.test.js`, `test/schedule.test.js`, `test/stay-compose.test.js`, `test/stay-conditions.test.js`, `test/stay-contract.test.js`, `test/stay-coverage.test.js`, `test/stay-dayframe.test.js`, `test/stay-fixtures.js`, `test/stay-validate.test.js`, `test/today-gate.test.js`, `test/tour-api-detail.test.js`, `test/tour-api-intro.test.js`, `test/tour-api-languages.test.js`, `test/tour-api-signals.test.js`, `test/tour-api-thresholds.test.js`, `test/trip-alternatives.test.js`, `test/trip-fixtures.js`, `test/trip-lift.test.js`, `test/trip-minimal-change.test.js`, `test/trip-plan.test.js`, `test/trip-replan.test.js`, `test/trip-sync-core.test.js`, `test/trip-sync-runtime.test.js`, `test/trip-view.test.js`, `test/utmk.test.js`, `test/weather.test.js`

##### 묶음 8: 나머지 단위 테스트 (test/ 그 밖): 32개 파일

`test/ai-intro-route.test.js`, `test/ai-intro.test.js`, `test/api-contract.test.js`, `test/auth-session-route.test.js`, `test/auth.test.js`, `test/cards-model.test.js`, `test/client-server-seam.test.js`, `test/conditions-form.test.js`, `test/conditions-link.test.js`, `test/conditions-summary.test.js`, `test/decision-log.test.js`, `test/emergency-contacts.test.js`, `test/guardian-crypto.test.js`, `test/guardian-fixtures.js`, `test/guardian-lockout.test.js`, `test/guardian-screen.test.js`, `test/guardian-snapshot.test.js`, `test/i18n-languages.test.js`, `test/i18n.test.js`, `test/itinerary-request.test.js`, `test/itinerary-service.test.js`, `test/kill-switch.test.js`, `test/notify-device.test.js`, `test/notify-runtime.test.js`, `test/notify-schedule.test.js`, `test/onboarding-draft.test.js`, `test/plan-link-route.test.js`, `test/pwa-manifest.test.js`, `test/pwa-sw.test.js`, `test/recovery.test.js`, `test/route-guard.test.js`, `test/store.test.js`

##### 묶음 9: 화면 테스트 (e2e): 17개 파일

`e2e/accessibility.spec.js`, `e2e/core-flow.spec.js`, `e2e/demo-events.spec.js`, `e2e/design-board.spec.js`, `e2e/editing.spec.js`, `e2e/fixtures.js`, `e2e/guardian.spec.js`, `e2e/helpers.js`, `e2e/hospital-link.spec.js`, `e2e/i18n.spec.js`, `e2e/login.spec.js`, `e2e/network-guard.cjs`, `e2e/network.spec.js`, `e2e/offline.spec.js`, `e2e/privacy.spec.js`, `e2e/responsive.spec.js`, `e2e/screen-design-board.spec.js`



## 7. 주의

- **테스트 이름 안의 참조(199줄, 53개 파일)**: `describe('규칙 36: ...')`, `expect(..., '... (규칙 33)')`처럼 문자열 안에 있다.
  바꿔도 동작은 같지만 '주석만 바꾼다'의 범위 밖이고, 테스트 출력에서 규칙 번호가 식별자 구실을 한다.
  **운영자 결정이 필요하다**: (가) 그대로 둔다(권함, 번호 뜻은 이 문서 4.2절이 남긴다), (나) 같은 묶음에서 커밋을 따로 나눠 규칙 이름으로 바꾼다.
- **서비스 워커**: `public/sw.js` 머리 주석에 '이 파일을 고치면 판을 올린다(`SW_VERSION`)'는 규칙이 있다. 주석만 바꿔도 파일 바이트가 바뀌어
  브라우저가 새 워커를 설치한다. `sw.js`의 참조 2건(`spec 4.18`, `spec 4.13`)은 다음에 sw.js를 고칠 때 함께 바꾸고 정리 작업에서는 빼기를 권한다.
  넣는다면 `SW_VERSION`을 올려야 하므로 주석만 바꾸는 PR이 아니게 된다.
- **`app/globals.css`**: `test/design-tokens.test.js`가 첫 `:root { ... }` 블록을 중괄호 깊이로 찾는다. 14행·93행 주석이 `:root` 안에 있다.
  새 주석에 `{`, `}`를 쓰지 않는다.
- **`test/i18n.test.js`**: `app`, `components`, `src/i18n`, `lib/notify`의 소스(주석 포함)에서 작은따옴표 안의 `소문자.이름` 꼴을 문구 키로 모은다.
  새 주석에 `'trip.foo'` 같은 키 모양 문자열을 작은따옴표로 쓰지 않는다. 문서 경로는 따옴표 없이 쓰고(`docs/business-rules.md`), 절 제목만 따옴표에 넣는다(한글이라 걸리지 않는다).
- **`test/design-board-copies.test.js`**: 시안 보드 복사본과 원본에 남아야 하는 문자열(클래스 이름, 문구 키)을 대조한다. 주석 문자열은 대상이 아니지만, 원본 부품의 JSX 주석을 고칠 때 바로 옆 마크업을 건드리지 않는다.
- **주석 문장을 읽고 소스를 확인하는 다른 테스트는 없다.** `test/ai-intro.test.js`(console 호출), `test/pwa-sw.test.js`(`READ_ONLY_ROUTES`에서 `ASSET_CACHE_MAX`까지 잘라 읽음), `test/notify-device.test.js`(`NOTIFICATION_PATHS`)는 코드 모양만 본다.
- **`AX-NNN`은 그대로 둔다.** `AX-210 → AX-318` 같은 이력 화살표도 그대로다.
- **새로 쓰는 주석에는 엠대시(U+2014)와 엔대시(U+2013)를 쓰지 않는다.** 고치는 줄에 이미 있는 대시도 같은 줄 안에서 쉼표, 쌍점, 괄호로 바꾼다(11-07 변환과 같다). 범위는 `~`로 쓴다.
- **주석 문장을 고쳐 규칙을 바꾸지 않는다.** 표는 참조만 바꾼다. 주석 문장과 지금 문서가 다르면 그 자리에서 고치지 말고 findings에 적거나 보고한다(CLAUDE.md '문제를 만났을 때').
- **범위 밖의 비슷한 표기**(이번 표에 넣지 않음):
  - `설계서 N.N`, `설계서 6.2 N번`: `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`와 `2026-11-06-overdue-return-design.md`를 가리킨다. 문서가 저장소에 있어 끊긴 참조가 아니다. 다만 경로 없이 '설계서'라고만 쓴 곳이 많다(앞쪽은 SEED 설계서, '마감 지남 설계서'는 뒤쪽).
  - `T15b`, `T16a`, `T17` 같은 인계 작업 번호(약 20개 파일, 주로 `app/styles/*.css` 머리 주석): handoff 문서의 작업 번호다. `AX-NNN`과 짝으로 붙어 있어 지워도 정보가 줄지 않는다. 11-07 변환은 `T16a`를 `lib/notify/AGENTS.md`로 바꿨다. 정리 작업에 넣을지 결정이 필요하다.
  - `D04-BR012`, `D07-POL005` 같은 공모전 문서 식별자(18개 파일): `docs/notion/` 제출 산출물의 번호라 끊기지 않았다. 그대로 둔다.
- **지난 문서의 같은 참조**: `docs/API_CONTRACT.md`(규칙 14건, spec 4건), `docs/platform/*.md`, `docs/superpowers/plans/*.md`에도 `spec N.N`·`규칙 N`이 있다. 이 문서들은 지난 문서이거나 작업 기록이라 정리 작업 대상이 아니다.
- **문서에 적을지 정할 것(선택)**: `규칙 55`의 멱등 문장을 BR '전체 일정 확정과 변화 대응'이나 IR '데모 사건'에 적으면 마지막 '대응 없음'이 사라진다. 문서 변경이라 운영자 확인 뒤에 한다.

## 부록: 참조별 파일 목록

파일 전체 기준이다. 8개가 넘으면 앞의 8개만 적었다. 전체 목록은 2절 방법으로 다시 뽑을 수 있다.

- `handoff 3장 2번`: `src/adapters/utmk.js`, `src/guardian/crypto.js`
- `handoff 3장 9번`: `src/stay/defaults.js`
- `handoff 3장 10번`: `src/adapters/juso.js`, `src/adapters/utmk.js`, `src/tour-api/content-types.js`
- `handoff 4장`: `components/conditions/periodFormModel.js`, `components/ui/AnswerInput.js`, `src/tour-api/candidate-service.js`
- `spec 3.1`: `app/cards/page.js`, `app/conditions/page.js`, `app/design-board/page.js`, `app/emergency/page.js`, `app/more/page.js`, `app/onboarding/page.js`, `app/page.js`, `app/place/[candidateId]/page.js` 외 13개
- `spec 3.2`: `app/login/page.js`, `app/page.js`, `components/onboarding/OnboardingForm.js`
- `spec 4.1`: `components/onboarding/CompanionStep.js`, `components/onboarding/OnboardingForm.js`, `components/onboarding/PreferencesStep.js`, `components/onboarding/TravelStep.js`, `components/onboarding/draft.js`, `lib/server/airports.js`, `lib/server/itinerary-request.js`, `src/i18n/legal.js` 외 8개
- `spec 4.2`: `app/api/address/search/route.js`, `components/cards/cardModel.js`, `components/onboarding/AddressSearch.js`, `components/onboarding/LodgingStep.js`, `components/onboarding/OnboardingForm.js`, `components/onboarding/draft.js`, `lib/server/itinerary-request.js`, `src/adapters/juso.js` 외 4개
- `spec 4.3`: `app/api/address/search/route.js`, `components/onboarding/AddressSearch.js`, `components/onboarding/HospitalStep.js`, `components/onboarding/OnboardingForm.js`, `components/onboarding/draft.js`, `lib/server/itinerary-request.js`, `src/adapters/demoAddresses.js`, `src/adapters/juso.js` 외 10개
- `spec 4.4`: `app/conditions/page.js`, `components/conditions/PeriodCard.js`, `components/conditions/PeriodEditorForm.js`, `components/conditions/periodFormModel.js`, `components/conditions/summary.js`, `components/ui/AnswerInput.js`, `components/ui/PeriodEditor.js`, `lib/server/itinerary-request.js` 외 11개
- `spec 4.5`: `app/conditions/page.js`, `app/styles/ui.css`, `app/trip/[date]/page.js`, `app/trip/page.js`, `components/conditions/CoverageTag.js`, `components/conditions/DayConditions.js`, `components/conditions/PeriodCard.js`, `components/conditions/summary.js` 외 11개
- `spec 4.6`: `app/trip/[date]/page.js`, `components/cards/TodayCards.js`, `components/trip/DailyCheckCard.js`, `lib/trip/display.js`, `lib/trip/index.js`, `src/i18n/messages/today.js`, `src/recovery/link.js`, `src/recovery/plan.js` 외 8개
- `spec 4.7`: `app/trip/[date]/page.js`, `components/trip/DayFacts.js`, `components/ui/DayTimeline.js`, `components/ui/MealSlot.js`, `e2e/hospital-link.spec.js`, `src/adapters/travelTime.js`, `src/engine/dayContext.js`, `src/engine/dayPlan.js` 외 14개
- `spec 4.8`: `app/api/place/route.js`, `app/place/[candidateId]/page.js`, `app/trip/[date]/page.js`, `components/CourseCard.js`, `components/trip/DayFacts.js`, `components/ui/CategoryArt.js`, `components/ui/PlaceCard.js`, `lib/server/itinerary-service.js` 외 19개
- `spec 4.9`: `app/api/itinerary/plan/route.js`, `app/trip/[date]/page.js`, `app/trip/page.js`, `components/DeltaSheet.js`, `components/EventPanel.js`, `e2e/core-flow.spec.js`, `lib/server/itinerary-request.js`, `lib/server/itinerary-service.js` 외 21개
- `spec 4.10`: `app/api/itinerary/alternatives/route.js`, `app/trip/[date]/page.js`, `app/trip/page.js`, `components/trip/RegenerateSheet.js`, `components/trip/SwapSheet.js`, `lib/trip/edits.js`, `lib/trip/index.js`, `src/engine/alternatives.js` 외 7개
- `spec 4.11`: `app/g/page.js`, `app/guardian/page.js`, `app/trip/[date]/page.js`, `components/guardian/GuardianCreate.js`, `components/guardian/GuardianOpen.js`, `components/guardian/errorView.js`, `components/guardian/hooks.js`, `components/guardian/index.js` 외 19개
- `spec 4.12`: `app/cards/page.js`, `app/place/[candidateId]/page.js`, `components/cards/TodayCards.js`, `components/cards/cardModel.js`, `components/ui/KoreanCard.js`, `src/i18n/messages/cards.js`, `src/i18n/messages/common.js`, `test/cards-model.test.js`
- `spec 4.13`: `app/settings/page.js`, `components/pwa/PwaRuntime.js`, `components/pwa/index.js`, `lib/notify/client.js`, `lib/notify/index.js`, `lib/notify/text.js`, `public/sw.js`, `test/notify-device.test.js` 외 2개
- `spec 4.14`: `app/place/[candidateId]/page.js`, `components/cards/TodayCards.js`, `components/cards/cardModel.js`, `components/trip/MapLinks.js`, `e2e/editing.spec.js`, `lib/maps.js`, `src/i18n/legal.js`, `src/i18n/messages/place.js` 외 3개
- `spec 4.15`: `app/emergency/contacts.js`, `app/emergency/page.js`, `components/onboarding/draft.js`, `components/ui/AppShell.js`, `components/ui/BottomNav.js`, `components/ui/EmergencyButton.js`, `src/guardian/snapshot.js`, `test/emergency-contacts.test.js`
- `spec 4.16`: `app/api/itinerary/intro/route.js`, `components/trip/IntroArea.js`, `lib/server/ai-intro-checks.js`, `lib/server/ai-intro.js`, `lib/server/runtime-flags.js`, `scripts/ai-intro-eval.mjs`, `src/i18n/legal.js`, `src/i18n/messages/aiIntro.js` 외 5개
- `spec 4.17`: `app/page.js`, `app/privacy/page.js`, `app/settings/page.js`, `components/LanguageProvider.js`, `components/StateBanner.js`, `components/conditions/SafetyText.js`, `components/guardian/SafetyNote.js`, `components/onboarding/Fields.js` 외 19개
- `spec 4.18`: `app/cards/page.js`, `app/emergency/page.js`, `app/login/page.js`, `app/manifest.js`, `app/privacy/page.js`, `app/trip/[date]/page.js`, `components/cards/TodayCards.js`, `components/cards/cardModel.js` 외 24개
- `spec 4.19`: `app/api/auth/session/route.js`, `app/conditions/page.js`, `app/link/page.js`, `app/login/page.js`, `app/privacy/page.js`, `app/settings/page.js`, `components/FooterLinks.js`, `components/LanguageProvider.js` 외 22개
- `spec 4.20`: `app/api/plan/link/route.js`, `app/guide/page.js`, `app/link/page.js`, `components/conditions/linkPlan.js`, `lib/trip/api.js`, `lib/trip/index.js`, `src/i18n/messages/conditions.js`, `src/recovery/fixtures.js` 외 10개
- `spec 4.21`: `app/emergency/page.js`, `lib/server/decision-log.js`, `lib/server/itinerary-service.js`, `src/tour-api/config.js`, `test/decision-log.test.js`, `test/kill-switch.test.js`, `test/tour-api-thresholds.test.js`
- `spec 5.1`: `app/api/address/search/route.js`, `app/design-board/screenData.js`, `app/guide/page.js`, `app/link/page.js`, `components/cards/cardModel.js`, `components/cards/useDeviceData.js`, `components/conditions/linkPlan.js`, `components/conditions/periodFormModel.js` 외 25개
- `spec 5.2`: `app/design-board/screenData.js`, `components/CourseCard.js`, `components/cards/cardModel.js`, `components/ui/DayTimeline.js`, `lib/server/itinerary-request.js`, `src/engine/dayDelta.js`, `src/engine/dayPlan.js`, `src/engine/displayOrder.js` 외 14개
- `spec 5.3`: `src/recovery/gateway.js`, `src/recovery/link.js`, `src/recovery/plan.js`, `test/recovery.test.js`
- `spec 5.4`: `components/guardian/GuardianCreate.js`, `src/guardian/crypto.js`, `src/guardian/index.js`, `src/guardian/link.js`, `src/guardian/snapshot.js`, `src/recovery/gateway.js`, `test/guardian-crypto.test.js`, `test/guardian-fixtures.js` 외 1개
- `spec 6장`: `app/api/address/search/route.js`, `app/api/itinerary/alternatives/route.js`, `app/api/itinerary/intro/route.js`, `app/api/itinerary/plan/route.js`, `app/api/place/route.js`, `app/api/plan/link/route.js`, `app/link/page.js`, `app/place/[candidateId]/page.js` 외 36개
- `spec 7장`: `app/design-board/DesignBoard.js`, `app/design-board/ScreenPreviews.js`, `app/design-board/demoData.js`, `app/design-board/page.js`, `app/design-board/screenData.js`, `app/globals.css`, `app/styles/ui.css`, `components/StateBanner.js` 외 12개
- `spec 7.2`: `components/guardian/share.js`
- `spec 9.1`: `app/api/address/search/route.js`, `app/layout.js`, `app/link/page.js`, `app/page.js`, `app/place/[candidateId]/page.js`, `components/EventPanel.js`, `components/onboarding/AddressSearch.js`, `components/onboarding/StartArt.js` 외 16개
- `spec 9.2`: `src/stay/coverage.js`
- `spec 10장`: `components/onboarding/draft.js`, `test/day-plan-candidates.test.js`, `test/day-plan-core.test.js`, `test/onboarding-draft.test.js`, `test/stay-compose.test.js`, `test/stay-conditions.test.js`, `test/stay-coverage.test.js`, `test/stay-validate.test.js` 외 5개
- `spec 11장`: `lib/server/ai-intro-checks.js`, `lib/server/ai-intro.js`, `lib/server/itinerary-service.js`, `src/guardian/lockout.js`, `src/tour-api/cues.js`, `test/guardian-lockout.test.js`, `test/notify-schedule.test.js`, `test/stay-contract.test.js` 외 2개
- `spec 12.3`: `e2e/accessibility.spec.js`, `e2e/core-flow.spec.js`, `e2e/demo-events.spec.js`, `e2e/design-board.spec.js`, `e2e/editing.spec.js`, `e2e/fixtures.js`, `e2e/guardian.spec.js`, `e2e/hospital-link.spec.js` 외 6개
- `spec 13장`: `src/tour-api/config.js`
- `규칙 1`: `components/onboarding/ErrorSummary.js`, `components/onboarding/TravelStep.js`, `components/onboarding/draft.js`, `src/i18n/messages/onboarding.js`, `src/stay/stay.js`, `test/onboarding-draft.test.js`, `test/stay-validate.test.js`
- `규칙 2`: `components/onboarding/ErrorSummary.js`, `components/onboarding/HospitalStep.js`, `components/onboarding/draft.js`, `src/i18n/messages/onboarding.js`, `src/stay/stay.js`, `test/onboarding-draft.test.js`, `test/stay-validate.test.js`
- `규칙 3`: `components/onboarding/ErrorSummary.js`, `components/onboarding/LodgingStep.js`, `components/onboarding/draft.js`, `src/i18n/messages/onboarding.js`, `src/stay/coverage.js`, `src/stay/stay.js`, `test/onboarding-draft.test.js`, `test/stay-coverage.test.js` 외 1개
- `규칙 4`: `src/stay/coverage.js`, `test/stay-coverage.test.js`
- `규칙 5`: `src/stay/coverage.js`, `test/day-plan-core.test.js`, `test/stay-coverage.test.js`
- `규칙 6`: `components/conditions/periodFormModel.js`, `e2e/core-flow.spec.js`, `src/stay/conditions.js`, `test/conditions-form.test.js`, `test/stay-conditions.test.js`
- `규칙 7`: `e2e/core-flow.spec.js`, `test/conditions-form.test.js`, `test/conditions-summary.test.js`, `test/stay-compose.test.js`
- `규칙 8`: `test/conditions-summary.test.js`, `test/stay-compose.test.js`
- `규칙 9`: `src/stay/coverage.js`, `test/day-plan-core.test.js`, `test/stay-coverage.test.js`
- `규칙 10`: `src/stay/coverage.js`, `test/day-plan-core.test.js`, `test/stay-coverage.test.js`
- `규칙 11`: `src/i18n/messages/conditions.js`, `src/recovery/link.js`, `src/stay/conditions.js`, `src/stay/coverage.js`, `test/recovery.test.js`, `test/stay-conditions.test.js`, `test/stay-coverage.test.js`
- `규칙 12`: `app/link/page.js`, `components/conditions/linkPlan.js`, `e2e/hospital-link.spec.js`, `src/i18n/messages/conditions.js`, `src/recovery/fixtures.js`, `src/recovery/link.js`, `src/stay/conditions.js`, `src/stay/coverage.js` 외 5개
- `규칙 13`: `e2e/demo-events.spec.js`, `test/trip-replan.test.js`, `test/trip-sync-core.test.js`, `test/trip-sync-runtime.test.js`
- `규칙 13-1`: `components/conditions/periodFormModel.js`, `src/engine/dayContext.js`, `src/engine/dayTimeline.js`, `src/stay/conditions.js`, `src/stay/dayFrame.js`, `src/stay/errorCodes.js`, `test/conditions-form.test.js`, `test/day-plan-core.test.js` 외 5개
- `규칙 13-2`: `e2e/core-flow.spec.js`, `src/engine/dayPlan.js`, `test/day-plan-core.test.js`
- `규칙 14`: `app/design-board/screenData.js`, `lib/server/airports.js`, `src/stay/dayFrame.js`, `test/day-plan-core.test.js`, `test/stay-dayframe.test.js`
- `규칙 15`: `app/design-board/screenData.js`, `lib/server/airports.js`, `src/stay/dayFrame.js`, `test/day-plan-core.test.js`, `test/stay-dayframe.test.js`
- `규칙 16`: `src/stay/dayFrame.js`, `test/day-plan-core.test.js`, `test/stay-compose.test.js`
- `규칙 17`: `src/stay/dayFrame.js`, `test/day-plan-core.test.js`, `test/stay-compose.test.js`
- `규칙 18`: `test/day-plan-core.test.js`
- `규칙 19`: `src/engine/dayPlan.js`, `src/engine/outingBuilder.js`, `test/day-plan-core.test.js`
- `규칙 20`: `test/day-plan-core.test.js`
- `규칙 21`: `e2e/core-flow.spec.js`, `src/engine/safetyGate.js`, `test/day-plan-candidates.test.js`, `test/tour-api-signals.test.js`
- `규칙 22`: `e2e/core-flow.spec.js`, `src/engine/safetyGate.js`, `test/day-plan-candidates.test.js`, `test/tour-api-signals.test.js`
- `규칙 23`: `src/engine/safetyGate.js`, `test/day-plan-candidates.test.js`, `test/tour-api-signals.test.js`
- `규칙 24`: `test/day-plan-candidates.test.js`, `test/tour-api-signals.test.js`
- `규칙 25`: `e2e/core-flow.spec.js`, `test/day-plan-candidates.test.js`, `test/tour-api-signals.test.js`
- `규칙 26`: `src/tour-api/schedule.js`, `test/day-plan-candidates.test.js`, `test/schedule.test.js`, `test/tour-api-signals.test.js`
- `규칙 27`: `e2e/i18n.spec.js`, `src/engine/dayPlan.js`, `src/engine/stopCandidate.js`, `src/tour-api/candidate-service.js`, `src/tour-api/cues.js`, `src/tour-api/dedupe.js`, `src/tour-api/signals.js`, `test/day-plan-candidates.test.js` 외 4개
- `규칙 28`: `test/day-plan-candidates.test.js`, `test/trip-plan.test.js`
- `규칙 29`: `lib/trip/requests.js`, `test/trip-plan.test.js`, `test/trip-sync-core.test.js`
- `규칙 30`: `e2e/core-flow.spec.js`, `e2e/editing.spec.js`, `test/trip-plan.test.js`, `test/trip-replan.test.js`, `test/trip-sync-core.test.js`
- `규칙 31`: `components/DeltaSheet.js`, `e2e/demo-events.spec.js`, `src/engine/dayDelta.js`, `test/trip-lift.test.js`, `test/trip-replan.test.js`
- `규칙 32`: `app/design-board/DesignBoard.js`, `app/design-board/ScreenPreviews.js`, `app/place/[candidateId]/page.js`, `components/trip/DailyCheckCard.js`, `components/trip/MapLinks.js`, `e2e/core-flow.spec.js`, `e2e/helpers.js`, `e2e/screen-design-board.spec.js` 외 6개
- `규칙 33`: `app/api/itinerary/alternatives/route.js`, `components/trip/SwapSheet.js`, `e2e/editing.spec.js`, `src/engine/alternatives.js`, `test/itinerary-service.test.js`, `test/trip-alternatives.test.js`
- `규칙 34`: `app/cards/page.js`, `app/emergency/page.js`, `lib/server/itinerary-service.js`, `test/kill-switch.test.js`
- `규칙 35`: `lib/server/decision-log.js`, `lib/server/itinerary-service.js`, `test/decision-log.test.js`
- `규칙 36`: `app/api/itinerary/intro/route.js`, `components/trip/IntroArea.js`, `lib/server/ai-intro-checks.js`, `lib/server/ai-intro.js`, `test/ai-intro-route.test.js`, `test/ai-intro.test.js`, `test/client-server-seam.test.js`, `test/trip-view.test.js`
- `규칙 37`: `components/guardian/GuardianCreate.js`, `components/guardian/GuardianOpen.js`, `components/guardian/lockoutStorage.js`, `e2e/guardian.spec.js`, `src/guardian/lockout.js`, `src/guardian/snapshot.js`, `src/guardian/unlock.js`, `src/i18n/legal.js` 외 4개
- `규칙 38`: `app/g/page.js`, `components/guardian/GuardianCreate.js`, `components/guardian/GuardianOpen.js`, `components/guardian/hooks.js`, `e2e/guardian.spec.js`, `src/guardian/link.js`, `src/i18n/legal.js`, `test/guardian-crypto.test.js` 외 1개
- `규칙 39`: `app/place/[candidateId]/page.js`, `components/cards/TodayCards.js`, `components/cards/cardModel.js`, `components/trip/MapLinks.js`, `e2e/editing.spec.js`, `lib/maps.js`, `src/i18n/legal.js`, `test/cards-model.test.js` 외 2개
- `규칙 40`: `app/cards/page.js`, `app/emergency/page.js`, `components/cards/TodayCards.js`, `e2e/offline.spec.js`, `test/emergency-contacts.test.js`, `test/store.test.js`
- `규칙 41`: `app/settings/page.js`, `components/FooterLinks.js`, `components/guardian/lockoutStorage.js`, `e2e/privacy.spec.js`, `lib/store/index.js`, `test/guardian-screen.test.js`, `test/store.test.js`
- `규칙 42`: `lib/store/index.js`, `test/store.test.js`
- `규칙 43`: `app/privacy/page.js`, `components/settings/PairText.js`, `e2e/i18n.spec.js`, `src/i18n/index.js`, `test/i18n-languages.test.js`
- `규칙 44`: `components/LanguageProvider.js`, `e2e/i18n.spec.js`, `src/i18n/index.js`, `test/i18n-languages.test.js`, `test/i18n.test.js`
- `규칙 45`: `src/adapters/utmk.js`, `test/utmk.test.js`
- `규칙 46`: `components/onboarding/AddressSearch.js`, `e2e/fixtures.js`, `e2e/network.spec.js`, `lib/server/itinerary-request.js`, `test/api-contract.test.js`, `test/itinerary-request.test.js`, `test/itinerary-service.test.js`
- `규칙 47`: `lib/notify/index.js`, `lib/notify/text.js`, `test/notify-device.test.js`, `test/notify-schedule.test.js`
- `규칙 48`: `app/api/plan/link/route.js`, `e2e/hospital-link.spec.js`, `src/recovery/gateway.js`, `src/recovery/plan.js`, `test/plan-link-route.test.js`, `test/recovery.test.js`
- `규칙 49`: `components/trip/DailyCheckCard.js`, `e2e/core-flow.spec.js`, `e2e/helpers.js`, `e2e/hospital-link.spec.js`, `lib/trip/display.js`, `src/stay/todayGate.js`, `test/today-gate.test.js`, `test/trip-sync-core.test.js` 외 1개
- `규칙 50`: `components/EventPanel.js`, `e2e/demo-events.spec.js`, `src/engine/tripEvents.js`, `test/trip-replan.test.js`, `test/trip-sync-runtime.test.js`
- `규칙 51`: `e2e/i18n.spec.js`, `lib/trip/requests.js`, `test/itinerary-service.test.js`, `test/trip-plan.test.js`, `test/trip-sync-core.test.js`, `test/trip-sync-runtime.test.js`
- `규칙 52`: `test/day-plan-candidates.test.js`
- `규칙 53`: `test/day-plan-core.test.js`
- `규칙 54`: `e2e/core-flow.spec.js`, `e2e/network.spec.js`, `lib/server/itinerary-request.js`, `lib/trip/planStay.js`, `test/itinerary-request.test.js`, `test/itinerary-service.test.js`, `test/trip-sync-core.test.js`
- `규칙 55`: `components/EventPanel.js`, `e2e/demo-events.spec.js`, `lib/trip/requests.js`, `src/engine/tripEvents.js`, `test/trip-replan.test.js`, `test/trip-sync-core.test.js`, `test/trip-sync-runtime.test.js`
- `규칙 56`: `app/guide/page.js`, `components/conditions/linkPlan.js`, `e2e/hospital-link.spec.js`, `lib/trip/display.js`, `src/recovery/instructions.js`, `src/recovery/link.js`, `test/conditions-link.test.js`, `test/recovery.test.js`
- `규칙 57`: `app/link/page.js`, `components/conditions/linkPlan.js`, `e2e/hospital-link.spec.js`, `src/recovery/gateway.js`, `src/recovery/link.js`, `src/recovery/plan.js`, `test/conditions-link.test.js`, `test/recovery.test.js`
