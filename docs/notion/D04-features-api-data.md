# 04. D04 기능 명세 · API·데이터

> **문서 상태: WORKING** · 실제 구현 완료와 계획을 구분한다. 모바일 웹 런타임은 구현 완료이며(9화면·내부 API 10종), 남은 미구현은 실제 경로 연동과 보호자 화면이다.

## 문서 메타데이터

- Document Code: D04
- Document Key 후보: safehour:D04
- Candidate Version: v1.1
- Scale Tier: Large
- Schema Version: AX-DOC v4.8.0
- 담당자 R/A: 개발 리드 · [지정필요]
- 상위 입력: D01·D02·D03 WORKING
- 목표 게이트: G3 Dev Ready
- 구현 위치: /Users/macddiwoo/Documents/Claude/Projects/Safehour
- 자동 테스트: 단위·통합 **301개 통과 · 72 suites** (`npm test`, 2026-08-27 실측) + **E2E 93건 · 6파일** (`npx playwright test --list`)
- 커버리지: line 96.62% · branch 85.69% · function 93.95% (`npm run test:coverage`, 2026-08-27 실측 · UI 컴포넌트 제외)
- 개정: 2026-08-27 (병원 지침 연동 구조 전환 반영)

### 이번 개정이 반영한 구조 전환

v1.0 초안(2026-07-30)은 **환자가 병원 안내문을 읽고 앱 폼에 조건을 옮겨 적는** 제품을 기술했다.
그 구조는 폐기됐다. 지금은 **병원이 회복 지침을 발행하고 환자는 코드 하나로 연결한다.**
수기 입력 화면은 제거됐다(AX-221) — 남겨두면 "환자가 한국어 안내문을 해석한다" 는 결함이
그대로 남기 때문이다.

정본: `docs/PRODUCT_DEFINITION.md` (제품 정의) · `docs/API_CONTRACT.md` (내부 API) ·
`docs/decisions/0001~0004` (라우트·계측·다국어·인증) · `docs/DEVELOPMENT_READINESS.md` (구현 현황).

| 초안(2026-07-30) | 현재 | 근거 |
| --- | --- | --- |
| 사용자가 조건을 입력 | 병원이 발행, 앱은 읽기 전용 | 정의 §1·§2, AX-221 |
| 조건 = 단일 개념 | **채널 A(제한조건, 판정용) / 채널 B(병원 안내문, 표시 전용)** 분리 | 정의 §2, `src/recovery/plan.js` |
| 안전 게이트 1단 | **연결 게이트 → 안전 게이트 → 후보 판정** 3단 | 정의 §7, AX-215 |
| 비로그인 MVP | **소셜 로그인**(Google·Kakao), 서버 회원·세션 테이블 없음 | ADR-0004 |
| 한국어 화면 | **전 화면 한국어·영어** | ADR-0003 |
| 화면 4종 | **화면 9종 + 내부 API 10종** | ADR-0001, `app/` |
| 복귀 마감 = returnBy | **복귀시각·복약시각·다음진료 중 가장 이른 것** | 정의 §2, `effectiveDeadline` |

---

## 1. 아키텍처 방향

```
병원 HIS·EMR (시술·약물 — 여기서 나가지 않는다)
   └ 병원 회복 지침 발행 (의료진 확인)
        ├ 채널 A 제한조건 ─┐
        └ 채널 B 안내문   ─┴→ SafeHour 연동 게이트웨이 (최소화·허용목록·버전·유효기간·철회)
                                 ├→ 환자 앱 (A + B, 단말 보관)
                                 └→ 보호자 축약 payload (동의 범위만) — 화면 미착수
환자 앱 ─채널 A 만─→ 연결 게이트 → 안전 게이트 → 복귀 SLA·역할 판정 → 추천 3개 또는 미추천
                                                       ↑ TourAPI 실시간 후보 · 기상 실황
```

- **판정 전 단계가 하나 늘었다.** 유효한 병원 지침이 없거나 만료·철회됐으면 관광지를
  **아예 표시하지 않는다.** 미확인 중요 변경은 차단이 아니라 STANDBY 강등이다 (정의 §7).
- **채널 B(병원 안내문 원문)는 단말을 떠나지 않는다.** 판정 요청에 실리는 것은
  `toDecisionPayload` 가 만든 축약본뿐이며, 안내문 본문이 섞여 오면 계약 위반으로 거부된다.
- 브라우저에 TourAPI 인증키를 노출하지 않는다.
- 현재 GPS는 수집하지 않는다. 기준점은 **병원 지침의 `anchor`** 에서 온다.
- 좌표는 관광공사·기상청 공공 API로 나간다. 조건·복귀시각·동행 정보는 함께 가지 않는다.
  지도·경로 사업자에게는 아무것도 나가지 않는다(미연동).
- 판정은 규칙 기반 결정론적 엔진이다. 제품 런타임 AI 모델을 사용하지 않는다.
- 판정은 stateless 다. 서버에 세션·판정 결과·회원 테이블이 없다. 로그인 신원은
  **서명 쿠키 안에만** 존재한다 (ADR-0004).
- API 원문과 SafeHour 자체 추정값을 별도 필드로 유지한다. 병원 안내문이 들어오면서
  출처는 **병원 원문 / SafeHour 판정 / 관광정보 3영역**이 된다.
- 휴무·날씨·교통·진료·호출 이벤트는 기존 결과를 직접 수정하지 않고 안전 게이트부터 다시 실행한다.

---

## 2. 기능 카탈로그

### D04-F001 고정 기준점 검증 — **개정**

- v1.0 제목: "고정 기준점 입력·검증". **사용자 입력 경로는 폐기**됐다.
- 가치: 현재 GPS 없이 병원 지침이 지정한 기준점 주변 후보를 조회한다.
- 연결: D01-PRB001, D02-S008 (D03-SCR002 는 폐기 — 번호 재사용하지 않는다)
- 입력: `plan.anchor` (lat, lng, label) — 병원이 발행한 값. 사용자가 고칠 수 없다.
- 규칙 (`lib/server/engine-io.js` normalizeOrigin 이 정본):
  - `origin.kind` 는 서버에서 항상 `USER_SELECTED_FIXED` 로 강제된다
  - 대한민국 범위 위도 33–39, 경도 124–132. 벗어나면 400 입력 오류
  - `label` 80자 절단
  - 현재 GPS·자동 위치 종류 필드는 정규화 단계에서 폐기 (D07-BAN002)
- 후보 조회 반경: 3,000m 고정 (`app/api/recommend/route.js`)
- 상태: **구현 완료** · 자동 테스트 통과
- 우선순위: P0

### D04-F002 조건·역할 입력 검증 — **부분 폐기**

- **폐기: 수기 조건 입력 폼** (AX-221). `/plan` 은 계획 **확인** 화면으로 교체됐다.
  ID 는 재사용하지 않는다.
- **유지: 조건 검증 계약.** 입력원이 사용자에서 병원 지침으로 바뀌었을 뿐, 서버의
  `normalizeCondition` 검증은 그대로 살아 있다.
  - `version` 필수(60자 절단), `issuedAt` 파싱 가능한 시각 필수
  - `maxWalkMin`·`maxTravelMin` 0–240 클램프, boolean 필드 truthy 강제 변환
  - `escortRequired && splitAllowed` 동시 true → 엔진이 `CONFLICTING_CONDITION` 으로 차단
    (400 이 아니라 200 + 차단 판정)
- **유지: 역할 선택.** 사용자가 화면에서 고르는 것은 **지금 상황**뿐이다 —
  동행 여부·환자 휴식·보호자 분리 활동. 병원이 분리를 허용했더라도 보호자가 없으면
  분리 활동은 성립하지 않는다.
- 금지: 증상 해석, 회복일차 기반 외출 허가
- 상태: 폼 폐기 · 검증 계약 구현 완료
- 우선순위: P0

### D04-F003 TourAPI 주변 후보 생성

- 가치: 기준 좌표 인근의 실제 관광 후보를 만든다.
- 외부 API: `KorService2/locationBasedList2` · `EngService2/locationBasedList2` ·
  `KorWithService2/locationBasedList2`
- 입력: mapX, mapY, radius, arrange=E, pageNo, numOfRows
- 출력: 국문·영문·무장애 목록과 totals·received 진단값
- 페이지네이션: MVP는 최대 100건 1페이지, 확장 시 totalCount 기반 순차 페이지
- 상태: **구현 완료** · 실API · 강남 3km 검증 완료
- 우선순위: P0

### D04-F004 다국어·무장애 후보 정규화

- 규칙 (v1.0 그대로 유효):
  - 국문 ID를 canonical 기준으로 유지
  - 영문 제목 우선, 미연결 시 국문 폴백과 `needsTranslation=true`
  - ID 일치 우선, 같은 canonical 콘텐츠 유형·좌표 20m 이내만 보조 매칭
  - 영문 콘텐츠 유형 75·76·77·78·79·80·82·85를 국문 기준으로 변환
  - 무장애 신호는 보행부담 휴리스틱을 최대 20%까지만 낮춤
  - 실내 여부 불명은 null
  - 숙박시설은 `tourismEligible=false`
- 출력: TourCandidate
- 상태: **구현 완료** · 자동 테스트·실데이터 검증 완료
- 우선순위: P0

### D04-F005 병원 조건 안전 게이트

- 가치: 조건을 위반하는 후보를 추천 전에 제거한다. **연결 게이트(F017) 다음 단계**다.
- 조건 게이트(`gateHospitalCondition`)가 실제로 읽는 것: 조건 존재 여부, 발행시각 최신성
  (24시간), 상충(필수동행+분리허용), 위험신호, 외출 허용.
- 후보 게이트(`gateCandidate`)가 실제로 읽는 것: 관광 적합성, 금식, 실내 전용, 자외선,
  기상, 보행 한도, 혼잡, 휴무, 데이터 신뢰.
- **적용되지 않는 채널 A 조건**: `avoidHeat`(열 노출)·`noWater`(수중 활동)는 화면 배지로
  표시되지만 조건 객체로 옮겨지지 않아 게이트가 읽지 않는다. 금식 **종료 시각**
  (`fastingUntil`)도 boolean 으로만 접힌다. → 미해결 항목 참조.
- 금지: 인기·선호 점수로 차단 조건 상쇄
- 상태: **구현 완료** · 테스트 완료 (단 위 3개 조건 미적용)
- 우선순위: P0

### D04-F006 복귀 SLA 계산·체류 축소

- 입력: now, returnBy, outboundMin, inboundMin, stayMin, isPatient, extraBufferMin
- 버퍼 실측값 (`src/engine/slaCalculator.js` `BUFFER`) — **임상 승인 없음**:
  - 차량 호출·대기 5분 / 교통 변동 이동시간의 25% / 병원 도착 준비 10분 / 환자 가산 10분
- 처리: 편도 이동 한도 확인 → 환자 가산 버퍼 → 기본 체류 불가 시 최소 체류(15분)까지 축소 탐색
- 출력: requiredMin, slackMin, latestDepartureAt, stayMin, shrunk
- **복귀 마감 자체는 F020 이 정한다** — SLA 계산기는 주어진 마감 시각을 쓴다.
- 상태: **구현 완료** · 테스트 완료 · 버퍼 값은 현장 측정·의료 자문 [확인필요]
- 우선순위: P0

### D04-F007 환자·보호자 역할별 추천

- 상태 출력: NO_TOURISM, STANDBY, SPLIT_NEARBY, TOGETHER (`src/domain/states.js`)
- 추천 개수: 엔진 최대 5(`ENGINE_MAX_RESULTS`), 화면 노출 3(`DISPLAY_LIMIT`)
- 순위: 복귀 여유 → 실내 선호 → 보행 부담
- 상태: **구현 완료** — 결과 화면(`/result`)도 구현 완료 (v1.0 의 "웹 결과 화면 미구현" 해소)
- 우선순위: P0

### D04-F008 실시간 이벤트 재계산

- 지원 이벤트: WEATHER, TRAFFIC_SURGE, APPOINTMENT, CLOSURE, PATIENT_RECALL, RISK_SIGNAL
- 처리: 원래 입력에 이벤트 컨텍스트를 적용하고 **안전 게이트부터 재실행**
- 누적 계약: TRAFFIC_SURGE(`extraMin` 5–120)·APPOINTMENT(`deltaMin` ±240)는 payload `ctx` 의
  기존 값과 합산한 **총량**으로 판정하며, 응답 `nextRecalcPayload.ctx` 에 동일 총량을 저장한다.
- 출력: before, after, removed, added, shortened, newlyExcluded, hasVisibleChange
- 출시 차단: 결과 변경이 필요한데 `hasVisibleChange=false` (D07-BAN008)
- 후보 0건 계약: `candidates: []` 는 오류가 아니라 STANDBY 라는 정상 결과이며,
  그 상태에서도 환자 호출·위험신호 재판정이 가능해야 한다.
- 상태: **구현 완료** · 회귀 테스트·E2E·휴무 실데이터 대체 검증 완료
- 우선순위: P0

### D04-F009 상위 추천 상세정보 보강

- 외부 API: `KorService2·EngService2/detailCommon2` · `detailIntro2` · `detailImage2` ·
  `KorWithService2/detailWithTour2`
- 규칙:
  - `detailCommon2` 는 contentId만 필수, 제거된 legacy 플래그 차단
  - `detailIntro2` 는 contentId + contentTypeId
  - `detailImage2` 는 imageYN=Y, subImageYN 사용 금지
  - 운영시간 원문이 있어도 `openNow` 를 임의 파싱하지 않고 null 유지
  - 이미지 다운로드 금지, URL·저작권 구분코드 보존
- 화면: `/place/{candidateId}` (ADR-0001). 판정 차단 상태·`returnNow` 면 상세 대신 복귀 안내.
- 상태: **구현 완료** · 실API 검증 완료
- 우선순위: P0

### D04-F010 API 호출 감사·한도 보호

- 처리: 일별 JSONL 호출 로그 / 오퍼레이션별 카운터 / 800회 경고 · 1,000회 자체 차단 /
  15분 최소 캐시 / 인증키·serviceKey 로그 금지
- 실적: **로컬 누적 9콜 / 2일** (`logs/tour-api/` 실측 2026-08-27 — 08-18 3콜, 08-24 6콜).
  `docs/API_USAGE_SNAPSHOT.md` 의 30회(3일)는 08-17 기준이며 그 뒤 `logs/` 가 정리돼 사라졌다.
  **검증 기준은 로컬 로그가 아니라 공공데이터포털의 키별 집계다** — 배포본 호출도 같은 키면
  포털에 잡히고 로컬에만 남지 않는다. 소급이 불가능하므로 주 1회 `npm run usage:weekly` 실행이 필요하다. (`docs/API_USAGE_SNAPSHOT.md`,
  2026-08-17 생성). 정본은 공공데이터포털 마이페이지 키별 통계다.
- 상태: **구현 완료** · 800/1,000 경계 테스트·병렬 초과 회귀 포함
- 우선순위: P0

### D04-F011 기상청 초단기실황 연결 — **PLANNED → 완료**

- v1.0 상태 "PLANNED" 는 사실과 다르다. **어댑터 구현·테스트 완료이며 배포본에서
  실응답을 관측했다** (`observedAt` 확인, `unknown=false` — D09-AC011).
- 엔드포인트: `1360000/VilageFcstInfoService_2.0/getUltraSrtNcst` (초단기실황)
- 인증키: `KMA_API_KEY`, 없으면 `TOUR_API_KEY` 폴백 (공공데이터포털은 계정당 인증키가
  하나이고 서비스별 활용신청만 하면 같은 키로 호출된다)
- 판정 반영 규칙: `outdoorUnsafe` 가 **확인된 경우에만** 판정 입력에 들어간다.
  `unknown`·`degraded` 는 판정에 쓰지 않고 화면 표기용으로만 전달한다 (D06-E012).
- 실패 처리: API 오류·네트워크 예외·키 부재 모두 throw 없이 `unknown` 폴백
- 상태: **구현 완료** (v1.0 의 "미구현: API 인증·실응답 어댑터" 해소)
- 우선순위: P0

### D04-F012 실제 경로·이동시간 연결 — BLOCKED 유지

- 현재: 보수적 거리 기반 fallback estimator 만 동작한다. 응답 `travelTimeSource` 는
  항상 `"fallback"` 이고 화면에 "추정" 배지가 붙는다.
- 카카오 Directions 어댑터(`createKakaoEstimator`)가 코드에 있으나 **어디에서도 호출되지
  않는다** (미사용 경로 · 커버리지 47%).
- 차단 사유: 위치정보 사전검토 회신 대기(문의 2540)만이 아니다 — 공급자·폴백·비용이 미결이고,
  카카오모빌리티 경로 API는 별도 사용 승인이 필요하다. **회신이 와도 바로 붙지 않는다.**
- 상태: **BLOCKED** (변경 없음)
- 우선순위: P1

### D04-F013 모바일 반응형 웹 UI — **NOT_STARTED → 완료**

- v1.0 상태 "NOT_STARTED" 는 사실과 다르다.
- 화면 9종: `/` · `/login` · `/link` · `/today` · `/guide` · `/plan` · `/result` ·
  `/place/{candidateId}` · `/privacy`
- 라우트 계약은 ADR-0001 로 확정 — SCR002–004 는 `/plan` 통합 (앵커는 `#role` 하나뿐이고 나머지는 `aria-labelledby` 대상이다) (`#location
  `#condition` `#role`), SCR007(변화 전후)·SCR008(즉시 복귀)은 `/result` 내 모달.
  `/result/change` · `/return` 라우트는 **폐기**.
- 검증: E2E 93건(360px 기준, 외부 API 호출 0건), axe 9화면 위반 0, 키보드 7건,
  200% 확대, 44px 터치 대상, 320/430/768/1280px 가로 스크롤 없음
- 상태: **구현 완료**. 남은 것은 실기기·스크린리더 확인(사람 수행)과 Figma 정본·영문 검수.
- 우선순위: P0

### D04-F014 병원 지침 연결 (코드 상환) — **신규**

- 가치: 사용자가 조건을 타이핑하지 않는다. 병원이 발행한 것을 코드 하나로 가져온다.
- 화면: `/link` · API: `POST /api/plan/link`
- 처리: 코드 → 어댑터 `redeem` → 게이트웨이 최소화(F015) → `validatePlan` → 계획 반환
- **로그인 필수.** 코드만으로 열어두면 코드가 유출됐을 때 누구나 그 계획을 본다.
- 실패 사유: `UNAUTHENTICATED`(401) · `CODE_REQUIRED`(400) · `UNKNOWN_CODE`(404) ·
  `INVALID_PLAN`(422)
- 어댑터: **데모 어댑터 하나뿐이다.** FHIR·병원 전용 API는 같은 자리에 어댑터로 붙는다.
  데모 코드 `DEMO` · `DEMO-A`(표준) · `DEMO-B`(제한) · `DEMO-C`(만료). 대소문자·공백 무시.
- 데모 계획에는 `demo: true` 가 박혀 있고 화면이 **"병원 연동 데모" 를 상시 표시**한다
  (공모전 요강의 허위 제출 조항 — 정의 §9-3).
- 계획 본문은 응답으로만 나가고 **서버에 남지 않는다.** 단말 `sessionStorage['safehour.plan']` 보관.
- QR: 화면 문구는 "QR 또는 코드" 라고 안내하지만 **실제로는 텍스트 코드 입력만 있다.**
  카메라 스캔은 없다.
- 상태: **구현 완료** (AX-214·AX-216)
- 우선순위: P0

### D04-F015 연동 게이트웨이 — 최소화·허용목록 — **신규**

- 가치: 병원이 진단명·시술기록·전체 약물목록을 보내도 게이트웨이에서 잘린다.
  새 필드를 통과시키려면 목록에 명시적으로 추가해야 한다 — 조용히 새지 않게.
- 허용목록 (`src/recovery/gateway.js` 실측):

| 대상 | 개수 | 키 |
| --- | --- | --- |
| 계획 최상위 | **12** | schemaVersion, planId, version, issuedAt, updatedAt, expiresAt, revoked, demo, issuer, anchor, constraints, instructions |
| issuer | **2** | name, role |
| anchor | **3** | lat, lng, label |
| constraints (채널 A) | **14** | outingAllowed, indoorOnly, maxWalkMin, maxTravelMin, avoidUv, avoidHeat, noWater, escortRequired, splitAllowed, foodRestricted, fastingUntil, returnBy, medicationTimes, nextVisitAt |
| instructions (채널 B) | **6** | id, category, lang, text, updatedAt, acknowledged |

- 검증 실패 시 **계획을 주지 않는다** — 깨진 계획으로 판정하면 안전 사고다.
- 형식만 검증한다. **값의 의학적 타당성은 검증하지 않는다** — 그것은 병원의 몫이다.
- 상태: **구현 완료** (AX-214)
- 우선순위: P0

### D04-F016 채널 A/B 분리와 판정용 축약본 — **신규**

- 가치: "재해석하지 않는다" 와 "보유하지 않는다" 를 **구조로** 분리한다.

| | 채널 A — 제한조건 | 채널 B — 병원 안내문 |
| --- | --- | --- |
| 형태 | 코드값·수치·시각 | 병원이 쓴 문장 원문 |
| 판정에 쓰이나 | 쓰인다 | **절대 쓰이지 않는다** |
| 서버로 가나 | 간다 (비식별, 계산 후 폐기) | **가지 않는다.** 단말 표시 전용 |
| 민감정보 등급 | 낮음 (행동 제약) | **높음** (약물·시술 정황) |

- `toDecisionPayload(plan)` 이 **서버로 나가는 유일한 형태**를 만든다. 안내문의
  `text`·`lang` 을 떼어내고 `{id, category, acknowledged}` 만 남긴다.
- `validateDecisionPayload` 는 `instructions` 배열이 섞여 오면 `instructions:forbidden`
  으로 **거부**한다. 조용히 통과시키지 않는다.
- 채널 B 표시 규칙: 편집·요약·재배열하지 않는다. **번역하지 않는다** — 원문 언어를
  `lang` 으로 표기해 스크린리더가 잘못 읽지 않게 한다. 카드마다 "병원에서 제공한 안내"
  배지 + 발행·수정 시각 + 확인 상태.
- 상태: **구현 완료** (AX-213)
- 우선순위: P0

### D04-F017 연결 게이트 — **신규**

- 가치: 기존 안전 게이트 **앞에** 한 단계. 유효한 병원 지침이 없으면 관광지를 표시하지 않는다.
- 함수: `gateDecisionPayload(payload, {now})` — **게이트 구현은 여기 하나뿐이다.**
  클라이언트가 계획 전체를 들고 있을 때는 `gateRecoveryPlan` 이 변환해서 부른다.
- 판단 순서와 결과:

| 조건 | 결과 | 사유 코드 |
| --- | --- | --- |
| 계획 없음 / 형식 무효 | NO_TOURISM · 차단 | `NO_HOSPITAL_PLAN` |
| `revoked=true` | NO_TOURISM · 차단 · `expired=true` | `PLAN_REVOKED` |
| `expiresAt <= now` | NO_TOURISM · 차단 · `expired=true` | `PLAN_EXPIRED` |
| 미확인 **중요** 안내 존재 | **STANDBY 강등** (차단 아님 — 읽으면 풀린다) | `PLAN_UNCONFIRMED_UPDATE` |

- 중요 분류 4종: `activity` · `escort` · `visit` · `emergency`.
  나머지(`medication` · `food` · `lifestyle`)는 확인하지 않아도 외출을 막지 않는다 —
  모든 변경을 막으면 "확인" 이 형식적 클릭이 되고 정작 중요한 변경을 놓친다 (정의 §7 개선 2).
- 사유 코드 5종 추가: `NO_HOSPITAL_PLAN` `PLAN_EXPIRED` `PLAN_REVOKED`
  `PLAN_UNCONFIRMED_UPDATE` `MEDICATION_WINDOW` (기존 REASON 체계에 추가).
- **적용 범위**: 화면(`/plan` `/result`)과 `POST /api/today` 에는 걸려 있으나
  **`POST /api/recommend` 에는 걸려 있지 않다.** → 미해결 항목 참조.
- 상태: **구현 완료** (AX-215) · 서버 강제는 미완
- 우선순위: P0

### D04-F018 오늘의 회복 상태 — **신규**

- 가치: 홈에서 오늘 외출 가능·대기·불가를 보여준다.
- 화면: `/today` (새 홈) · API: `POST /api/today`
- **판정을 새로 만들지 않는다.** 연결 게이트(F017) → 기존 `gateHospitalCondition` 순으로
  같은 함수를 호출한다. 홈과 결과 화면이 다른 답을 내면 이 제품에서 가장 위험한 결함이다
  (정의 §9-5).
- 후보 조회를 하지 않으므로 **공공 API 호출이 0건**이다. 홈을 여러 번 열어도 호출량이 늘지 않는다.
- "가능" 은 게이트를 통과했다는 뜻이지 추천이 있다는 뜻이 아니다.
- 액션은 사라지지 않고 성격이 바뀐다 — 가능 → `안전 외출 확인` / 대기 → `병원 안내 다시 보기`
  / 불가 → `병원 연락`·`즉시 복귀` (정의 §5.2).
- 로그인 필수 (401 `UNAUTHENTICATED`).
- 상태: **구현 완료** (AX-217)
- 우선순위: P0

### D04-F019 병원 안내문 열람·확인 — **신규**

- 화면: `/guide` (읽기 전용) · 서버 API 없음 — 채널 B는 단말을 떠나지 않는다.
- 카드 분류 7종: `activity` `medication` `food` `lifestyle` `escort` `emergency` `visit`
- 확인(acknowledge)은 단말 `sessionStorage` 에 기록된다. 중요 안내를 확인해야
  연결 게이트의 STANDBY 강등이 풀린다.
- 개별 확인·전체 확인 두 경로 모두 있다.
- 상태: **구현 완료** (AX-218)
- 우선순위: P0

### D04-F020 복귀 마감 통합 — 가장 이른 마감 — **신규**

- 가치: 복귀 마감은 **복귀시각·복약시각·다음 진료 중 가장 이른 것**이다.
  어느 것이 마감을 정했는지도 함께 돌려준다 — 화면이 이유를 설명해야 하기 때문이다.
- 함수: `effectiveDeadline(plan, now)` → `{at, source}`, source ∈ `returnBy` | `medication` | `visit`
- **복약은 시각만 받는다.** 약물명은 서버 근처에 갈 이유가 없다 — SLA 계산에는
  "15:00 까지 돌아와야 한다" 는 시각만 있으면 된다.
- 시간대: 병원이 발행한 `HH:MM` 은 **한국 벽시계 시각**이다. 실행 환경의 시간대로
  해석하면 서버(UTC)와 외국인 단말(현지 시간대)에서 마감이 몇 시간씩 밀린다.
  그래서 KST 고정 오프셋으로 해석한다 (`nextClockOccurrence`).
- 검증: E2E "시차 19시간 단말에서도 같은 복귀 마감을 보여준다".
- 상태: **구현 완료**. 단 사유 코드 `MEDICATION_WINDOW` 는 어디서도 내보내지 않는다
  → 미해결 항목 참조.
- 우선순위: P0

### D04-F021 외출 중 지침 무효화 — **신규**

- 가치: 이미 나가 있는 사람에게 "만료됐습니다" 만 띄우는 것은 위험하다.
- 감시 3시점 (`lib/usePlanExpiry.js`): ① 화면 진입 ② 만료 시각 타이머(경계 +1초 여유)
  ③ 탭 복귀(`visibilitychange` — 타이머는 절전 중 밀린다)
- 처리: 만료·철회 감지 시 `invalidateForReturn` 이 `PATIENT_RECALL` 과 **같은 모양**으로
  추천을 비우고 `returnNow=true` 로 만든다. 새 판정을 만드는 것이 아니라 안전한 방향으로
  무효화만 한다. 복귀 시트 자동 표시 + 시연 패널 차단.
- 미확인 변경(STANDBY 강등)은 외출을 **중단시키지 않는다** — 만료·철회만 복귀로 전환한다.
- 상태: **구현 완료** (AX-220) · E2E 회귀 포함
- 우선순위: P0

### D04-F022 소셜 로그인 — **신규**

- 근거: ADR-0004. **서버 데이터베이스를 만들지 않는다.** 신원은 서명 쿠키 안에만 존재한다.
- 공급자: Google(환자 주 경로) · Kakao(한국인 보호자·코디네이터 경로). 화면 순서 Google 위.
- 규칙:
  - 최소 범위 — Google `openid` 만, Kakao 선택 동의 항목 0개
  - 식별자 하나만 보관 (`provider` + `sub`). 이메일·이름·프로필 미수집
  - 액세스·리프레시 토큰 저장 안 함 — 교환 직후 식별자만 꺼내고 버린다
  - HMAC-SHA256 서명 쿠키 · httpOnly · SameSite=Lax · 운영 Secure · **12시간**
  - PKCE(S256) + state 두 공급자 모두 적용
  - `redirect_uri` 는 `SAFEHOUR_BASE_URL` 로 조립 (호스트 헤더 주입 방지)
  - `returnTo` 는 같은 출처의 절대 경로만 (열린 리다이렉트 방어)
  - 로그아웃은 **POST 전용** (`<img src>` 한 줄로 남을 로그아웃시킬 수 없게)
  - "내 정보 지우기" 가 로그아웃까지 수행한다 (세션 쿠키는 httpOnly 라 클라이언트가 못 지운다)
  - `SAFEHOUR_SESSION_SECRET` 이 없으면 **로그인 기능 자체가 비활성**
- 쿠키: `safehour.session`(12시간), `safehour.oauth`(10분, 인가 왕복 중에만)
- 데모 로그인: `SAFEHOUR_ALLOW_DEMO_LOGIN=1` 일 때만 동작. 심사위원이 로그인을 통과
  못 하면 서비스를 볼 수 없다(구현성 30점).
- **로그인은 본인 확인이 아니다.** 보장하는 것은 "같은 계정이 다시 왔다" 뿐이고,
  "이 사람이 그 환자다" 는 병원 발급 코드가 확인한다. 화면과 고지에 명시했다.
- 검증: `test/auth.test.js` 42건 (서명 위조·만료·키 불일치 거부, state 타이밍 안전 비교,
  열린 리다이렉트 6종 차단, 최소 scope 고정, 토큰 교환 결과에 이메일·토큰 미노출, 쿠키 속성)
- 상태: **코드 구현 완료** (AX-219). **Google·Kakao OAuth 앱 등록은 운영자 실행 필요.**
- 우선순위: P0

### D04-F023 다국어 (한국어·영어) — **신규**

- 근거: ADR-0003 선택지 C — 클라이언트 언어 컨텍스트 + 사전.
- 언어 결정 순서: `sessionStorage['safehour.lang']` → `navigator.language` → `ko`.
  한국어 태그(`ko*`)만 `ko` 로 좁히고 **나머지는 전부 `en`** 으로 본다.
- **언어는 서버로 전송하지 않는다.** 요청 본문·헤더·쿼리 어디에도 넣지 않는다.
  판정은 언어와 무관하다.
- 안전 문구의 정본은 도메인 계층이다 — `STATE_MESSAGE`·`REASON_TEXT` 가 ko/en 을 모두 갖고
  화면은 조회만 한다. 화면 사전이 안전 문구를 다시 정의하지 않는다.
- 상태 배너와 즉시 복귀 시트는 **두 언어를 함께** 보여준다 (환자·보호자 언어가 다른 경우).
- 원문에는 원문 언어를 `lang` 으로 붙인다. `document.documentElement.lang` 을 실제로 갱신한다.
- **원문은 번역하지 않는다** — TourAPI overview·운영시간, 병원 안내문 모두 (D07-POL004).
- 규모: 화면 사전 키 284개 (`src/i18n/dictionary.js` 실측)
- 검증: `test/i18n.test.js` (번역 누락·자리표시자 불일치·미사용 키·한국어 복사본을 실패로 고정),
  `e2e/i18n.spec.js`
- 상태: **구현 완료** (AX-209). **영문 문구 검수는 미완 — 확인된 오역 있음** (미해결 항목).
- 우선순위: P0

### D04-F024 보호자 축약 발행 — **신규 · 부분 구현**

- 가치: 보호자에게는 게이트웨이가 **동의 범위대로 축약된 payload 를 따로 발행**한다.
  환자 앱이 받은 뒤 필터링해 보여주는 방식이면 데이터는 이미 넘어간 것이라 정보 분리가
  성립하지 않는다. 이것은 아키텍처 요구사항이다.
- `companionView(plan, consent)` 가 내보내는 것: escortRequired, splitAllowed, maxWalkMin,
  maxTravelMin, returnBy, outingAllowed + 발행자·유효기간·철회·기준점
- 내보내지 않는 것: **채널 B 전부**, `medicationTimes`, 진단·시술·전체 약물목록
- 동의 옵션: `shareSchedule` → `nextVisitAt` 추가 / `shareInstructions` → `emergency` 카드만 추가
- **상태: 함수만 있고 부르는 곳도 볼 화면도 없다.** `/share` 라우트 없음, 보호자 기기
  화면 없음, 동의 범위 설정 UI 없음.
- 우선순위: P1

### D04-F025 판정 결과 운영 로그 — **신규**

- 근거: ADR-0002 선택지 B. D02-EVT001–EVT007 사용자 행동 계측은 **범위 밖**이며,
  대신 서비스 운영·감사 증적에 필요한 판정 로그를 만든다.
- 남기는 것: `evt` `route` `outcome`(DECIDED·PAUSED·FAILED) `engine` `state` `reasons`
  `courseCount` `excludedCount` `excludedReasons` `candidateCount`
  `conditionAge`(FRESH·RECENT·AGING·STALE·FUTURE·UNKNOWN 구간) `trigger`
  `stateBefore` `visibleChange` `removedCount` `addedCount` `shortenedCount` `errorCode` `ms`
- **남기지 않는 것**: 좌표, 병원 조건 원문, 조건 발행시각 원값, 장소 이름·주소,
  세션 식별자, 인증키, 외부 URL, 외부 오류 원문. → 로그로부터 요청을 복원할 수 없다.
- 설계: allowlist. 사유 코드는 닫힌 enum(REASON)을 통과한 값만 남는다.
- 기록 위치는 **stdout 한 줄**이다. 파일·DB를 만들지 않는 것은 의도다 — 저장소를 두는 순간
  보존 정책(AX-104)이 선행 조건이 되고, 서버리스에서는 인스턴스마다 흩어져 집계되지 않는다.
- 상태: **구현 완료** (AX-008)
- 우선순위: P1

### D04-F026 추천 kill switch — **신규**

- `SAFEHOUR_KILL_RECOMMENDATION` 환경변수. 켜지면 판정도 외부 호출도 하지 않고
  모든 요청을 `NO_TOURISM` + `SERVICE_PAUSED` 로 응답한다. 재계산도 같은 이유로 차단된다.
- 원칙: kill switch 는 **더 안전한 쪽으로만** 움직인다. 추천을 켜는 스위치는 없다.
  스위치 상태는 응답(`servicePaused`)과 `/api/health` 에 드러난다 — 조용히 막지 않는다.
- 오류 화면이 아니라 정상적인 미추천 결과로 표시된다.
- 상태: **구현 완료** (D06-E014)
- 우선순위: P0

---

## 3. 외부 API 계약

### D04-API001 TourAPI 공통 클라이언트

- Base URL: 서비스별 `apis.data.go.kr/B551011/{Service2}`
- Auth: 서버 환경변수 `TOUR_API_KEY`
- 공통 params: `MobileOS=ETC`, `MobileApp=SafeHour`, `_type=json`
- Timeout: 15초
- Retry: 현재 없음 · [G3 전 정책 확정]
- Cache TTL: 15분 기본
- Rate limit: operation별 1,000건/일, 800 경고
- Success: HTTP 2xx + `response.header.resultCode=0000`
- Provider error: top-level resultCode도 오류로 파싱
- Logging: endpoint와 비민감 parameters, status, resultCode, elapsed, dailyCount
- Secret: URL 전체와 serviceKey 기록 금지

### D04-API002 locationBasedList2

- Required: mapX, mapY, radius / Optional: arrange, numOfRows, pageNo
- Validation: 고정 기준점, 반경 20km 이하 (제품 호출은 3,000m 고정)
- Empty: 정상 빈 결과 / Pagination: totalCount와 pageNo
- Idempotency: 동일 파라미터 GET은 캐시 키 SHA-256으로 식별

### D04-API003 detailCommon2

- Required: contentId / Optional: numOfRows, pageNo
- Denylist: defaultYN, firstImageYN, areacodeYN, catcodeYN, addrinfoYN, mapinfoYN, overviewYN
- 오류: HTTP 200 + `INVALID_REQUEST_PARAMETER_ERROR` 도 실패 처리

### D04-API004 detailIntro2

- Required: contentId, contentTypeId
- 출력: 콘텐츠 유형별 운영·휴무 원문 / Null: 필드 부재는 오류가 아니라 unknown

### D04-API005 detailImage2

- Required: contentId / Optional: imageYN=Y / Denylist: subImageYN
- 출력: originimgurl, smallimageurl, imgname, cpyrhtDivCd, serialnum

### D04-API006 detailWithTour2

- Required: contentId
- 출력: route, exit, elevator, wheelchair, restroom, parking 등
- 사용: 접근성 근거와 제한적 보행부담 보정

### D04-API020 기상청 초단기실황 — **신규**

- Base URL: `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst`
- Auth: `KMA_API_KEY`, 없으면 `TOUR_API_KEY` 폴백
- 좌표 변환: 위경도 → 기상청 격자(nx, ny)
- 발표시각: 매시 45분 이후에는 해당 정시, 이전에는 직전 정시, 자정 직후에는 전날 23시 발표분
- 판정 규칙: 강수형태 코드 존재 또는 강수확률 60% 이상 → `outdoorUnsafe`
- 실패: throw 하지 않고 `unknown: true`, `degraded: true` 폴백 — 기상은 판정에서 빠진다
- Secret: 인증키는 URL 쿼리에만 실리고 **로그에 남기지 않는다** (테스트로 고정)

### 내부 API — **확정** (v1.0 의 "후보" 표기 해소)

정본은 `docs/API_CONTRACT.md` 이고 계약 테스트는 `test/api-contract.test.js` 다.
이 문서와 다르게 동작하면 구현 버그다.

**공통 계약**

- 모든 응답 본문은 `{ ok: boolean, ... }`. 실패 시 `{ ok: false, errorCode, message }`.
  (인증·지침 계열 API 는 `errorCode` 대신 `code` 를 쓴다 — 아래 각 항목 참조)
- 판정은 stateless. 서버는 세션·판정 결과를 다시 조회할 수 있는 형태로 저장하지 않으며,
  클라이언트가 `recalcPayload` 를 그대로 되돌려 보내는 방식으로 상태가 이어진다.
- 기준점은 서버에서 항상 `kind: "USER_SELECTED_FIXED"` 로 강제된다.
- 허용 목록에 없는 `ctx` 키·필드는 무시되고 응답에 되돌아오지 않는다.
- **병원 안내문 원문(rawText)·이름·연락처·증상 원문은 어떤 요청·응답에도 실리지 않는다.**
- JSON 으로 파싱되지만 객체가 아닌 본문(`null`·문자열·숫자)은 400 이다.

| 상태 | 의미 | errorCode |
| --- | --- | --- |
| 200 | 판정 성공 (NO_TOURISM 도 성공 — 정상 제품 결과) | — |
| 400 | 요청 본문·입력 무효 | `SAFEHOUR_BAD_REQUEST` `SAFEHOUR_CONDITION_INVALID` `SAFEHOUR_RECALCULATION_INVALID` `SAFEHOUR_PLACE_INVALID` |
| 401 | 로그인 필요 | `UNAUTHENTICATED` |
| 500 | 판정 엔진 실패 (D06-E013) | `SAFEHOUR_RECALCULATION_FAILED` |
| 502 | 외부 API 실패 (D06-E005) | `SAFEHOUR_EXTERNAL_API` |

#### D04-API007 POST /api/recommend — **확정**

- 입력: `origin` · `returnBy` · `condition` · `roles`
- 출력: `ok` `displayLimit`(3) `decision` `origin` `returnBy` `travelTimeSource`
  `weather` `diagnostics` `recalcPayload`
- 처리: 정규화 → kill switch 확인 → 기상 실황(병렬) → TourAPI 후보 조회(캐시 우선, 3km)
  → 기상 반영 → 판정 → 운영 로그
- 외부 API 실패: 임의 후보를 만들지 않는다. 502 + `failSafeState: "STANDBY"`
- **Idempotency**: 동일 입력 재전송은 동일 판정. 단 판정 기준 시각은 서버 수신 시각이므로
  시간 경과에 따른 차이는 허용된다. (v1.0 의 "session_id + input_revision 후보" 는 폐기 —
  서버가 세션을 갖지 않으므로 성립하지 않는다)
- **Concurrency**: 서버는 상태를 저장하지 않으므로 경쟁 조건이 없다. 클라이언트가
  마지막 응답의 payload 만 유지한다.
- Timeout budget: [확인필요] — 코드에 명시적 예산 없음. 외부 클라이언트 15초 타임아웃만 존재.
- **연결 게이트 미적용** → 미해결 항목 참조.

#### D04-API008 POST /api/recalculate — **확정**

- 입력: `recalcPayload`(직전 응답 그대로) + `event`
- 출력: `recalc.event`(적용된 총량) `before` `after` `delta` `result` + `nextRecalcPayload`
- 누적 계약: F008 참조. `recalcPayload` 는 **불투명 토큰**으로 취급한다.
- 금지: 이전 결과를 직접 수정하고 재판정을 건너뛰는 처리 (D07-BAN008)
- 접근 통제: payload 위조는 위조자 본인 화면에만 영향을 주는 self-affecting 구조다.
  병원 발행 조건(서명) 도입 시 HMAC 무결성 검증을 추가한다. → 미해결 항목.

#### D04-API009 POST /api/place — **확정 · 메서드 정정**

- v1.0 은 `GET /api/place/{candidateId}` 로 적었다. **실제 구현은 `POST /api/place`** 이고,
  `/place/{candidateId}` 는 API 가 아니라 **화면 라우트**다.
- 입력: `candidate.sourceIds.korean|english` (숫자 1–12자리) + `sourceMetadata.contentTypeIds`.
  클라이언트가 보낸 나머지 필드는 신뢰하지 않는다.
- 출력: `{ ok: true, details }` — 상세 원문·표시용 정규화·저작권
- 실패해도 추천 결과는 그대로다. 실패를 숨기지 않고 502 로 알린다 (D06-E010).
- 조회 대상은 공공 관광 데이터라 위조해도 조회 대상만 바뀐다. 세션 추천 집합 제한은 없다.
- 호출량: `/place` 진입마다 국문·영문 각 3콜 최대 6콜. 시연 리허설 전 캐시 워밍 필요.

#### D04-API010 POST /api/plan/link — **신규**

- 입력: `{ code: string }` · 출력: `{ ok: true, plan }`
- **로그인 필수** (401 `UNAUTHENTICATED`)
- 실패 코드: `BAD_REQUEST`(400) `CODE_REQUIRED`(400) `UNKNOWN_CODE`(404) `INVALID_PLAN`(422)
- 계획 본문은 응답으로만 나가고 서버에 남지 않는다.

#### D04-API011 POST /api/today — **신규**

- 입력: `{ payload }` — **판정용 축약본만** 받는다. 안내문이 섞여 오면 검증에서 거부된다.
- 출력: `{ ok, state, reasons, outingAllowed, expired }`
- 처리: 연결 게이트 → `gateHospitalCondition`. **후보 조회 없음 = 공공 API 호출 0건.**
- **로그인 필수** (401)

#### D04-API012 GET /api/auth/login — **신규**

- 쿼리: `provider=google|kakao|demo`, `returnTo=/path`
- 처리: state·PKCE verifier 생성 → 서명 쿠키(`safehour.oauth`, 10분) → 공급자로 303
- `demo` 는 `SAFEHOUR_ALLOW_DEMO_LOGIN` 이 켜졌을 때만 동작
- 실패는 오류 **코드**로만 리다이렉트한다: `not_configured` `provider_not_configured`
  `unknown_provider` `demo_disabled`

#### D04-API013 GET /api/auth/callback — **신규**

- 쿼리: `code`, `state`
- 처리: state 를 쿠키와 타이밍 안전 비교 → 코드 교환 → 식별자만 꺼내 세션 쿠키 발급 → 303
- 실패 코드: `cancelled` `expired` `state_mismatch` `missing_code` `exchange_failed`
  `not_configured`
- **공급자 응답 본문을 화면·로그에 흘리지 않는다.**

#### D04-API014 GET /api/auth/session — **신규**

- 출력: `{ ok, authenticated, provider, expiresAt, auth }`
- **식별자(subject)는 돌려주지 않는다.** 화면이 알아야 하는 것은 "로그인했는가" 와
  "어느 공급자로" 까지다.

#### D04-API015 POST /api/auth/logout — **신규**

- **POST 전용.** GET 을 열어두지 않는다.
- 세션은 서명 쿠키뿐이므로 지우면 끝난다 (서버에 세션 테이블이 없다).

#### D04-API016 GET /api/health — **신규**

- 출력: `ok` `service` `checkedAt` `config`(키 **존재 여부만** boolean) `flags`
- 용도: 배포 확인과 kill switch 반영 확인 (D09-RG007)
- **비밀정보는 담지 않는다** (D07-POL009)

---

## 4. 데이터 객체

### D04-DB001 PlanningInput — **개정**

- 필드: origin, returnBy, condition, roles, candidates, ctx
- **변경**: `sessionId` · `inputRevision` 은 **폐기**한다. 서버가 세션을 갖지 않으므로
  성립하지 않는다. 상태는 클라이언트의 `recalcPayload` 왕복으로 이어진다.
- `origin` 은 병원 지침 `anchor` 에서 온다. `returnBy` 는 `effectiveDeadline` 의 결과다.
- 분류: 위치 앵커·건강 관련 최소 정보(행동 제약 코드값) 포함
- 저장: **서버 저장 없음.** 단말은 `sessionStorage['safehour.result']`
- 금지: 이름, 연락처, 상세 진단명, 병원 안내문 원문

### D04-DB002 HospitalCondition — **개정**

- 이제 이 객체는 **사용자 입력물이 아니라 `planToCondition(plan)` 의 산출물**이다.
- 필드: version(`{planId}#{version}`), issuedAt, issuedBy(역할), fasting, outingAllowed,
  escortRequired, avoidUv, indoorOnly, splitAllowed, maxWalkMin, maxTravelMin
- 매핑 규칙: **매핑만 한다.** 값을 완화하거나 보충하지 않는다.
  `fasting = foodRestricted || Boolean(fastingUntil)`
- **채널 A 에는 있으나 이 객체로 넘어오지 않는 것**: `avoidHeat` `noWater`
  `fastingUntil`(시각) `medicationTimes` `nextVisitAt` `returnBy`.
  뒤의 셋은 F020 이 마감 시각으로 흡수하지만, 앞의 셋은 **아무 데도 가지 않는다.**
- Null 정책: 판단에 필요한 boolean 을 모르면 임의 false 금지
- 보존: 서버 저장 없음. 단말 보존기간은 D07에서 확정 [확인필요]

### D04-DB003 TourCandidate

- 필드: id, sourceIds, title, titleLanguage, needsTranslation, tourismEligible, lat, lng,
  indoor, hasFood, uvExposed, walkMin, stayMin, congestion, openNow, dataFresh, source,
  attribution, sourceMetadata, customTags
- 원칙: sourceMetadata·original 과 customTags 분리 / Null: unknown 을 명시적으로 유지

### D04-DB004 RecommendationDecision — **개정**

- 필드: state, reasons, course, excluded, decisions, patientCourse, companionCourse,
  returnBy, latestDepartureAt, **returnNow**
- 감사: `decisions` 에 step, result, detail, at
- **`engineVersion` 필드는 여전히 응답에 없다.** 엔진 버전(`ENGINE_VERSION = '1.0.0'`)은
  운영 로그의 `engine` 필드로만 나간다. → 미해결 항목.

### D04-DB005 ChangeDelta

- 필드: stateChanged, removed, added, shortened, newlyExcluded, hasVisibleChange
- 불변성: before 스냅샷과 after 스냅샷을 별도 보존

### D04-DB006 ApiCallAudit

- 필드: timestamp, kstDate, serviceName, operation, safeParameters, endpoint, httpStatus,
  resultCode, ok, elapsedMs, dailyCount, warning, error
- 금지: API key, 사용자 현재 GPS, 원문 건강정보

### D04-DB007 RecoveryPlan (회복 지침) — **신규 · 단말 전용**

- 공통 메타: `schemaVersion`(=1) `planId` `version` `issuedAt` `updatedAt` `expiresAt`
  `revoked` `demo` `issuer{name, role}` `anchor{lat, lng, label}`
- **채널 A** `constraints` 14종: outingAllowed, indoorOnly, maxWalkMin, maxTravelMin,
  avoidUv, avoidHeat, noWater, escortRequired, splitAllowed, foodRestricted,
  fastingUntil(`HH:MM`), returnBy(ISO), medicationTimes(`HH:MM[]`), nextVisitAt(ISO)
- **채널 B** `instructions[]`: id, category(7종), lang, text, updatedAt, acknowledged
- 보관: 단말 `sessionStorage['safehour.plan']` 만. **서버·네트워크로 전체가 나가지 않는다.**
- 민감도: 이 저장소가 가장 높다 (안내문 문장에 약물·시술 정황이 담긴다)

### D04-DB008 DecisionPayload (판정용 축약본) — **신규**

- `toDecisionPayload(plan)` 의 산출물. **서버로 나가는 유일한 계획 형태.**
- 필드: schemaVersion, planId, version, issuedAt, expiresAt, revoked, issuer{role},
  anchor, constraints, acknowledgements[{id, category, acknowledged}]
- **`instructions` 가 있으면 계약 위반**으로 거부된다 (`instructions:forbidden`)
- `issuer.name` 도 떨어져 나간다 — 판정에 필요한 것은 역할뿐이다

### D04-DB009 CompanionView (보호자 축약) — **신규**

- `companionView(plan, consent)` 의 산출물. 게이트웨이가 **따로 발행**한다.
- 담기는 것: escortRequired, splitAllowed, maxWalkMin, maxTravelMin, returnBy,
  outingAllowed + 발행자·유효기간·철회·기준점
- 담기지 않는 것: 채널 B 전부(기본), medicationTimes, 진단·시술·전체 약물목록
- 동의 옵션: `shareSchedule` → nextVisitAt / `shareInstructions` → `emergency` 카드만
- 상태: 함수만 존재. 소비처 없음.

### D04-DB010 SessionCookie — **신규**

- `safehour.session` — HMAC-SHA256 서명, httpOnly, SameSite=Lax, 운영 Secure, 12시간
- 담기는 필드는 **5개로 제한**되며 테스트로 고정돼 있다
- `safehour.oauth` — 10분, 인가 왕복 중에만 (state, codeVerifier, provider, returnTo)
- **서버에 회원 테이블·세션 테이블이 없다.** 쿠키의 크기·수명이 곧 보안 경계다.

### D04-DB011 DecisionLogEntry (판정 운영 로그) — **신규**

- F025 참조. stdout 한 줄, allowlist 조립, 닫힌 enum 사유 코드만.

### D04-DB012 단말 저장소 목록 — **신규**

| 키 | 담기는 것 | 삭제 대상 |
| --- | --- | --- |
| `safehour.plan` | 회복 지침 전체 (채널 A + B) | O |
| `safehour.result` | 판정 결과·재계산 payload (후보·좌표·복귀시각) | O |
| `safehour.planDraft` | (구) 조건 입력 draft — **AX-221 이후 기록하는 곳이 없다** | O |
| `safehour.lang` | 표시 언어 | X (지운 뒤에도 읽을 수 있어야 한다) |
| `safehour.cleared` | 삭제 안내 1회 표시 플래그 | — |

- **서버는 아무것도 저장하지 않는다.** 그러므로 "내 정보를 지운다" 는 곧 이 탭의
  `sessionStorage` 를 비우는 것이고, 그 목록이 `lib/session.js` 하나에 있다.
- 삭제 후에는 전체 새로고침으로 React 메모리 사본까지 버린다. 세션 쿠키는 httpOnly 라
  로그아웃까지 함께 수행한다.

---

## 5. 비즈니스 규칙

### D04-BR001 병원 조건 최우선

유효한 병원 조건이 없거나 오래됐거나 상충하면 추천하지 않는다.

### D04-BR002 외출 금지·위험신호

`outingAllowed=false` 또는 위험신호 입력은 NO_TOURISM이다.

### D04-BR003 필수 동행

`escortRequired=true` 인데 보호자가 없거나 분리 모드면 분리 추천을 금지한다.

### D04-BR004 금식

`fasting=true` 이면 `hasFood=true` 후보를 제외한다. 금식 시간은 앱이 정하지 않는다.

### D04-BR005 실내·자외선·기상

조건이 요구하는데 indoor 또는 uvExposed를 확인할 수 없으면 보수적으로 제외한다.

### D04-BR006 이동·보행

`maxWalkMin`·`maxTravelMin` 과 복귀 마감 SLA를 모두 통과해야 한다.

### D04-BR007 추천 개수

전체 API 후보가 아니라 판정된 상위 3개만 기본 노출한다 (엔진 산출 최대 5).

### D04-BR008 관광 활동 적합성

숙박시설 등 관광 활동이 아닌 후보는 가까워도 추천하지 않는다.

### D04-BR009 영문 폴백

영문 연결 실패는 국문 원문과 `needsTranslation` 상태로 표시하며 유사 제목만으로 자동 연결하지 않는다.

### D04-BR010 이벤트 재계산

이벤트가 오면 안전 게이트부터 재실행하며 변경 전후 delta를 생성한다.

### D04-BR011 환자 호출

`PATIENT_RECALL` 은 모든 추천을 무효화하고 `returnNow=true` 다. 후보 0건 상태에서도 동작해야 한다.

### D04-BR012 불확실성 보존

확인되지 않은 `openNow`, `indoor`, `congestion` 을 긍정 기본값으로 채우지 않는다.

### D04-BR013 연결 게이트 우선 — **신규**

유효한 병원 지침이 없거나 만료·철회됐으면 **관광지를 아예 표시하지 않는다.**
안전 게이트보다 앞선다. (현재 서버 강제는 `/api/today` 까지 — 미해결 항목)

### D04-BR014 채널 B 판정 금지 — **신규**

**판정에 쓰려면 병원이 채널 A 로 발행해야 한다.** 병원 안내문 문장을 파싱해 판정에 쓰는
것은 금지한다 — 그것이 곧 재해석이다. 안내문은 편집·요약·재배열·번역하지 않는다.

### D04-BR015 가장 이른 마감 — **신규**

복귀 마감은 복귀시각·복약시각·다음 진료 중 **가장 이른 것**이다.
`HH:MM` 은 실행 환경과 무관하게 **KST 벽시계**로 해석한다.

### D04-BR016 미확인 중요 변경은 강등이지 차단이 아니다 — **신규**

중요 분류(activity·escort·visit·emergency)의 미확인 안내는 STANDBY 강등이며,
읽으면 풀린다. 모든 변경을 막으면 "확인" 이 형식적 클릭이 된다.
**외출 중**에는 미확인 변경으로 복귀시키지 않는다 — 만료·철회만 복귀로 전환한다.

### D04-BR017 게이트웨이 허용목록 — **신규**

병원이 무엇을 더 보내든 허용목록(12·2·3·14·6) 밖은 통과하지 못한다.
새 필드를 통과시키려면 목록에 **명시적으로** 추가해야 한다. 검증 실패 시 계획을 주지 않는다.

### D04-BR018 병원 조건은 읽기 전용 — **신규**

사용자는 병원 조건을 고칠 수 없다. 고칠 수 있으면 "병원이 정한 조건" 이라는 말이 거짓이 된다.
사용자가 고르는 것은 **지금 상황**(동행·휴식·분리)뿐이다.

### D04-BR019 로그인은 본인 확인이 아니다 — **신규**

소셜 로그인이 보장하는 것은 "같은 계정이 다시 왔다" 뿐이다.
"이 사람이 그 환자다" 는 **병원이 발급한 코드**가 확인한다. 둘은 다른 층위다.

### D04-BR020 언어는 판정에 닿지 않는다 — **신규**

언어는 서버로 전송하지 않으며 판정 결과를 바꾸지 않는다. 안전 문구의 정본은 도메인 계층이다.

---

## 6. NFR

- 성능: 목록 판정 로직 200ms 이내 목표, 외부 API 포함 결과 5초 p95 후보.
  홈(`/today`)은 외부 호출 0건이라 이 예산 밖이다.
- 가용성: 외부 API 장애 시 안전한 미추천(502 + `failSafeState: STANDBY`) 또는 명시적 폴백.
  기상은 실패해도 판정을 막지 않고 `unknown` 으로 빠진다.
- 용량: 개발계정 operation별 1,000회/일. 로컬 누적 9콜(2일) · 실제 증적은 포털의 키별 집계.
- 비용: OpenAPI 무료 범위, 지도 API 비용 [확인필요]
- 보안: secret 서버 전용, 로그 redaction, TLS, 최소 데이터, 서명 쿠키(HMAC-SHA256),
  PKCE+state, 열린 리다이렉트 차단
- 개인정보: 현재 GPS 미수집, 이메일·이름·프로필 미수집, 채널 B 서버 미전송,
  건강 상세정보 최소화
- 접근성: WCAG AA 목표. axe 9화면 위반 0, 키보드 7건, 200% 확대, 44px 터치 대상 검증 완료.
  **스크린리더 실기기 확인은 미완.**
- 국제화: 전 화면 ko·en, 원문 보존(번역 안 함), `lang` 속성 갱신.
  **영문 검수 미완 — 확인된 오역 있음.**
- 관측: 호출 성공률·지연·판정 상태·재계산 변화율. 판정 운영 로그(F025)가 stdout 한 줄.
  사용자 행동 계측(EVT001–007)은 ADR-0002 로 **범위 밖**.
- RTO 후보: 장애 감지 후 4시간 내 안전 기능 복구
- RPO 후보: 설정·로그 24시간, 개인 세션 데이터 최소 보존
- [확인필요]: 실제 SLA·RTO·RPO는 운영 책임자 승인 필요
- [확인필요]: 안전 임계값 4종(조건 유효 24시간 · 최소 활동 창 45분 · 환자 가산 10분 ·
  교통 변동 25%)은 **임상 승인을 받은 적이 없다**

---

## 7. Feature Flag·Rollout

**실제로 존재하는 스위치는 환경변수 4종이다.** v1.0 이 나열한 `ff_*` 5종은 코드에 없다 —
계획 단계의 이름이었고 그대로 구현되지 않았다. 폐기한다.

| 스위치 | 동작 |
| --- | --- |
| `SAFEHOUR_KILL_RECOMMENDATION` | 추천 전면 중단. 판정·외부 호출 없이 NO_TOURISM + `SERVICE_PAUSED`. **더 안전한 쪽으로만 움직인다** |
| `SAFEHOUR_ALLOW_DEMO_LOGIN` | 자격증명 없이 로그인 흐름 통과 (심사 시연용). 운영에서 켜면 인증이 무의미해진다 |
| `KMA_API_KEY` 부재 | 기상 어댑터가 `TOUR_API_KEY` 폴백 → 그것도 없으면 호출 없이 `unknown` |
| `SAFEHOUR_SESSION_SECRET` 부재 | **로그인 기능 자체가 비활성.** 서명 없는 세션은 위조 가능하므로 켜지 않는 편이 안전하다 |

- Rollout: 내부 시나리오 → 제한 사용자 테스트 → 시연 URL → 운영계정 신청
- Kill switch 상태는 `/api/health` 의 `flags` 와 응답의 `servicePaused` 에 드러난다.
  조용히 막지 않는다.
- 배포 환경변수 총 9개: `TOUR_API_KEY` `KMA_API_KEY` `SAFEHOUR_SESSION_SECRET`
  `SAFEHOUR_BASE_URL` `GOOGLE_CLIENT_ID/SECRET` `KAKAO_CLIENT_ID/SECRET`
  `SAFEHOUR_ALLOW_DEMO_LOGIN`

---

## 8. AI 사용 계약

### 제품 Lane A

- 런타임 AI: **사용하지 않음**
- 이유: 의료 인접 안전 판정과 재현 가능한 심사 시연에는 결정론적 규칙이 적합
- 향후 번역 AI: 별도 기능·정책·eval 승인 전 사용 금지.
  **병원 안내문(채널 B)은 자동번역 대상이 아니다** — 검증 없는 번역을 안전 지시로 내보내지 않는다.

### 문서 생성 Lane B

- D01–D09 초안 작성·개정에 코딩 에이전트 사용
- 필수 검증: source fidelity, 근거 없는 사실, 필수 필드, ID·참조, 문서 간 모순
- 사람 승인 전 WORKING 유지. **담당자·승인자·KPI 목표를 에이전트가 확정하지 않는다.**

---

## 9. 개발 산출물·증거

**엔진·도메인**

- `src/domain/states.js` — 4상태 · 사유 코드 **27종**(연결 게이트 5종 포함, 실측)
- `src/engine/recommend.js` (`ENGINE_VERSION = '1.0.0'`) · `safetyGate.js` · `slaCalculator.js`

**회복 지침 (신규)**

- `src/recovery/plan.js` — 채널 A/B 분리, `validatePlan`, `toDecisionPayload`,
  `gateDecisionPayload`, `planToCondition`, `effectiveDeadline`, `invalidateForReturn`
- `src/recovery/gateway.js` — `minimizePlan`, `companionView`, `demoAdapter`, `redeemPlan`
- `src/recovery/fixtures.js` — 비식별 데모 계획 3종 (`demo: true`)

**인증·다국어 (신규)**

- `src/auth/config.js` · `oauth.js` · `session.js` · `cookies.js`
- `src/i18n/dictionary.js`(284키) · `index.js` · `legal.js`

**외부 어댑터**

- `src/tour-api/client.js` · `candidate-service.js` · `mapper.js` · `detail-service.js` · `config.js`
- `src/adapters/weather.js` (기상청 초단기실황) · `travelTime.js` (fallback 사용 · 카카오 미사용)

**서버·클라이언트**

- `app/` — 화면 9종 + `app/api/` 내부 API 10종
- `lib/server/engine-io.js` · `decision-log.js` · `runtime-flags.js` · `auth-server.js`
- `lib/session.js`(단말 저장 키 단일 정의) · `recovery-store.js` · `usePlanExpiry.js` ·
  `useModalSheet.js` · `format.js`

**검증**

- `npm test` — **301 pass · 0 fail · 72 suites** (2026-08-27)
- `npm run test:coverage` — line 96.62% · branch 85.69% · function 93.95%
- `npx playwright test` — **E2E 93건 · 6파일** (360px, 외부 API 호출 0건)
- `npm run lint` · `npm run build` · `npm run audit`(High 이상 0건) 통과
- CI: lint → test → build → audit → E2E. branch protection 은 플랜 제약으로 불가,
  `npm run merge` 로 대체
- `docs/API_USAGE_SNAPSHOT.md` — 08-17 기준 30회 (현재 로컬 로그는 9콜/2일)
- `docs/GANGNAM_DATA_ANALYSIS.md` · `docs/LIVE_SCENARIO_EVIDENCE.md`
- API key 외부 노출 스캔: 0건

---

## 10. G3 차단 항목

**해소된 것** (v1.0 목록 대비)

- ~~모바일 웹 프레임워크·배포 구조 확정~~ → Next.js 16.2 / React 19.2 / Vercel, 가동 중
- ~~기상청 실API 인증·응답 검증~~ → 배포본 실응답 관측 완료
- ~~Git 저장소·CI·배포·rollback 구성~~ → 원격 저장소·CI·kill switch·롤백 절차 존재
- ~~내부 API schema 확정~~ → `docs/API_CONTRACT.md` + 계약 테스트

**남은 차단 항목**

- D01–D09 사람 검토·승인 (전부 `WORKING`)
- 의료·개인정보·보안·위치정보·법무·콘텐츠 signoff **0건** · 담당자 [지정필요]
- **안전 임계값 4종의 임상 판단** — 체크리스트 §1 에 이 질문이 없었다 (1.7 로 추가됨)
- **영문 안전 문구 검수** — `SPLIT_NEARBY` 오역 확인됨 (1순위)
- 데이터 보존기간·분석 동의·개인정보 처리 경계 미승인 (AX-104)
- **민감정보 별도 동의 설계** — 안내문을 화면에 띄우는 것만으로 건강정보 처리다.
  "안 받으니 동의 불필요" 전략은 더 못 쓴다
- 위치정보 사전검토(문의 2540) 회신 대기 + 지도 공급자 미결정
- 실제 SLA 버퍼 현장 측정
- 실기기·스크린리더 검증 (`docs/DEVICE_TEST_CHECKLIST.md`)
- Figma 정본·여백 토큰
- **연동할 병원 파트너 0곳** — 채널 A 제한조건 목록의 의료진 확인이 여기 달려 있다
- Google·Kakao OAuth 앱 등록 (운영자 실행)
- KPI 목표값·project key·RACI [지정필요]

---

## 11. 미해결 항목

**지금 열려 있는 것을 그대로 적는다.** 이 절은 사람 검토 전에 지우지 않는다.

### 11.1 코드에 남은 결함 — 동결 전 판단 필요

| # | 항목 | 내용 |
| --- | --- | --- |
| U-01 | **유효기간 72시간 vs 조건 최신성 24시간 충돌** | 계획은 72시간 유효한 것으로 발행·표시되는데 안전 게이트의 최신성 한도는 24시간이다. 30시간 전 발행 계획으로 판정하면 `NO_TOURISM` + `STALE_HOSPITAL_CONDITION`. **사용자에게는 "유효기간 내" 로 보이는데 아무것도 추천되지 않는다.** 데모 계획은 방금 발행된 것으로 동작해 평소 시연에서는 드러나지 않는다. 고칠 방향 셋(유효기간을 24h 로 / 최신성을 유효기간에 위임 / 두 기준 분리 표시) 중 **어느 쪽이든 의료 자문이 정할 값이다** [확인필요] |
| U-02 | **연결 게이트가 `/api/recommend` 에 없다** | 화면과 `/api/today` 에는 있으나 추천을 생성하는 판정 API 에는 없다. 화면을 따라가는 사용자는 만료된 지침으로 추천을 받지 못하지만 **API 를 직접 부르면 받는다.** 지금은 화면이 유일한 진입점이라 실제 위험은 아니지만, "지침이 없으면 관광지를 표시하지 않는다" 가 제품의 안전 주장인 이상 **강제는 서버에 있어야 한다** |
| U-03 | **채널 A 조건 2종이 표시만 되고 판정에 안 쓰인다** | `avoidHeat`(열 노출 회피)·`noWater`(수중 활동 금지)가 `/plan` 배지로 뜨지만 `planToCondition` 이 옮기지 않아 게이트가 읽지 않는다. **병원이 "사우나·찜질 금지" 를 발행해도 찜질방이 후보에서 빠지지 않는다.** 적용되지 않는 조건을 적용되는 것처럼 보여주는 것은 아예 안 보여주는 것보다 나쁘다 — 판정에 반영하거나 표시 전용임을 화면에서 구분해야 한다 |
| U-04 | **금식 종료 시각이 boolean 으로 접힌다** | `fastingUntil`(`HH:MM`)이 `fasting = foodRestricted \|\| Boolean(fastingUntil)` 로만 쓰인다. "13:00 이후 식음 가능" 이 표현되지 않는다 |
| U-05 | **`MEDICATION_WINDOW` 사유 코드가 쓰이지 않는다** | 복약 때문에 마감이 앞당겨졌다는 사유 코드가 정의돼 있으나 **어디서도 내보내지 않는다.** 화면은 "복약 시각이 더 이릅니다" 별도 문구로 보여주므로 사용자가 정보를 잃지는 않지만, **판정 기록에는 그 사유가 남지 않는다** |
| U-06 | **`engineVersion` 이 응답에 없다** | v1.0 이 "웹 연결 전 추가" 라고 적었으나 아직 없다. 운영 로그의 `engine` 필드로만 나간다 |
| U-07 | **`safehour.planDraft` 가 유령 키로 남았다** | AX-221 로 수기 입력이 사라져 기록하는 곳이 없는데 삭제 대상 목록과 테스트에는 남아 있다. 정리 대상 |
| U-08 | **`/api/recommend` timeout budget 미정** | v1.0 의 "8초 후보 [검증필요]" 는 여전히 검증되지 않았고 코드에 명시적 예산이 없다. 외부 클라이언트 15초 타임아웃만 존재 [확인필요] |
| U-09 | **TourAPI retry 정책 미정** | v1.0 의 "[G3 전 정책 확정]" 그대로. 현재 재시도 없음 |

### 11.2 만들다 만 것

| # | 항목 | 어디까지 |
| --- | --- | --- |
| U-10 | **보호자 화면** | `companionView` 축약 함수만 있고 **부르는 곳도 볼 화면도 없다.** `/share` 라우트 없음, 동의 범위 설정 UI 없음 |
| U-11 | **지침 변경 → 재판정 배선** | 만료·철회는 감시(F021)하지만 **병원의 지침 변경 신호는 미연결.** 병원 업데이트 5종을 기존 재판정 파이프라인에 태우는 배선이 없다 |
| U-12 | **QR 스캔** | 화면 문구는 "QR 또는 코드" 라고 안내하지만 실제로는 **텍스트 코드 입력만** 있다. 카메라 스캔 없음 |
| U-13 | **계획 서명·위조 검증** | **없다.** 계획이 판정 근거이므로 안전 요건인데 미결. `recalcPayload` 도 self-affecting 구조에 기대고 있다 — 병원 발행 조건 도입 시 HMAC 무결성 검증 추가 필요 |
| U-14 | **병원 발행 도구** | 데모 fixture 만 있고 병원이 실제로 계획을 발행·수정·철회하는 도구가 없다 |
| U-15 | **지도·경로 연동** | **의도적 미연동.** F012 참조 |

### 11.3 사람·기관을 기다리는 것

| # | 항목 | 상태 |
| --- | --- | --- |
| U-16 | 연동할 **병원 파트너** | **0곳.** 채널 A 제한조건 목록 검증과 파일럿이 여기 달려 있다 |
| U-17 | 채널 A 목록의 의료진 확인 | 병원이 실제로 발행할 수 있는 범위인지 미검증 |
| U-18 | 안전 임계값 4종의 임상 승인 | 조건 유효 24h · 최소 활동 창 45분 · 환자 가산 10분 · 교통 변동 25% — **아무도 승인한 적 없다** |
| U-19 | 민감정보 별도 동의 설계 | 문구·시점·철회 방법 미정 |
| U-20 | 감사 기록 보관 주체 | **병원 보관**으로 확정할지 미결. SafeHour 서버가 보관하면 "서버 무저장" 이 조용히 깨진다 |
| U-21 | 위치정보 사전검토 회신 (문의 2540) | 대기 중 |
| U-22 | 의료·개인정보·위치정보·법무·콘텐츠 승인 | **0건** · 담당자 [지정필요] |
| U-23 | 영문 안전 문구 검수 | 미완. `SPLIT_NEARBY` 오역 확인됨 |
| U-24 | 데이터 보존기간 (AX-104) | 미확정 [확인필요] |
| U-25 | KPI 목표값 · project key · RACI | [지정필요] |

### 11.4 검증이 남은 것

| # | 항목 | 어떻게 닫는가 |
| --- | --- | --- |
| U-26 | **실제 환자·보호자 인터뷰 0건** | 사용성 테스트. 페르소나의 근거가 여기 달려 있다 |
| U-27 | 실기기·스크린리더 확인 | `docs/DEVICE_TEST_CHECKLIST.md` (15분 절차) |
| U-28 | 이동 버퍼 현장 측정 (D09-AC009) | 실제 출발–복귀 왕복 측정 |
| U-29 | 실제 경로 공급자 검증 (D09-AC012) | 누적 계약 테스트는 있으나 실제 공급자 미검증 |
| U-30 | Figma 정본 | 색·글꼴·모서리는 코드로 확정, 여백 토큰과 원본 파일이 남음 |
| U-31 | 배포본 갱신 확인 | 코드가 배포본보다 앞서 있던 이력이 있다. 배포 검증(`npm run verify:deploy`)이 이제 로그인 **수단** 존재까지 확인한다 |

---

**사람 검토 체크:** 구현·계획 구분, 폐기 ID 표기(F001 개정·F002 부분 폐기·`ff_*` 5종 폐기·
API009 메서드 정정), 채널 A/B 경계, 게이트웨이 허용목록, 내부 API 10종 계약,
데이터 분류·보존, NFR, 위치정보, 외부 의존성, 미해결 항목 31건, G3 blocker
