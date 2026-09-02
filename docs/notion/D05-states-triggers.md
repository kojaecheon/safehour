> **문서 상태: WORKING** · 도메인 상태는 사용자의 회복 정도가 아니라 병원 조건·일정·역할·데이터 신뢰를 조합한 서비스 판정 결과다.

## 문서 메타데이터

- Document Code: D05
- Document Key 후보: safehour:D05
- Candidate Version: v1.1
- Scale Tier: Large
- Schema Version: AX-DOC v4.8.0
- 담당자 R/A: 개발 리드 · [지정필요]
- 상위 입력: D04 WORKING
- 목표 게이트: G3 Dev Ready
- 개정: 2026-08-27 (병원 지침 연동 구조 전환 반영)

### 개정 요지 (2026-07-30 → 2026-08-27)

- 조건 입력 주체가 **사용자 수기 입력 → 병원 발행 회복 지침**으로 바뀌었다 (AX-221 로 수기 입력 화면 제거).
- 기존 안전 게이트 **앞에 연결 게이트**가 추가됐다. 사유 코드 5종을 §2.5 에 신설한다.
- 외출 중 만료·철회 3시점 감시(AX-220)를 자동화 트리거 `AUTO008` 로 추가한다.
- 복귀 마감이 **복귀 시각·복약 시각·다음 진료 중 가장 이른 것**으로 계산된다 (`AUTO009`).
- 4상태(NO_TOURISM · STANDBY · SPLIT_NEARBY · TOGETHER)와 보수적 우선순위는 **그대로 유효**하다.
- 코드 확인 결과 기존 문서와 달랐던 곳은 §2 · §3 에 표시했다 (특히 `SPLIT_NEARBY` 진입 조건).

---

## 1. 상태머신 개요

### D05-SM001 SafeHour 판정 상태머신

- 대상 entity: RecommendationDecision
- 입력 단위: PlanningInput revision + Event context
- 초기 상태: 고정 기본값 없음. 각 revision 을 처음부터 판정해 네 상태 중 하나를 산출
- 종료 상태: 현재 revision 에서는 모든 상태가 결과 상태이며, 새 입력·이벤트가 오면 재평가 가능
- 현재 코드 정본: `src/domain/states.js`, `src/engine/recommend.js`, `src/engine/safetyGate.js`, `src/recovery/plan.js`
- 판정 규칙 버전: `ENGINE_VERSION = '1.0.0'` (`src/engine/recommend.js`) — 게이트 순서·SLA 버퍼·순위 규칙이 바뀌면 올린다
- 사용자 노출: 상태 코드와 ko·en 설명 (`STATE_MESSAGE`, 전 화면 한국어·영어 — ADR-0003)
- 데이터 변경: 상태, 사유, 추천 코스, 제외 목록, 복귀 마감, 판정 운영 로그

### D05-SM001-GATE001 연결 게이트 (신설 · 판정 앞단)

병원 지침 연동 전환으로 **기존 안전 게이트 앞에 한 단계가 더 생겼다.**

```
[연결 게이트]  유효한 병원 회복 지침이 있는가?          ← 신설
     없음·형식 불량 → NO_TOURISM (NO_HOSPITAL_PLAN)
     만료           → NO_TOURISM (PLAN_EXPIRED)   · expired=true
     철회           → NO_TOURISM (PLAN_REVOKED)   · expired=true
     미확인 중요 변경 → STANDBY  (PLAN_UNCONFIRMED_UPDATE)
        ↓ 통과
[안전 게이트]  기존 로직 (조건·SLA·역할)
        ↓ 통과
[후보 판정]    기존 엔진
```

- 구현 정본: `gateDecisionPayload(payload, {now})` — `src/recovery/plan.js`. 계획 전체를 들고 있을 때는 `gateRecoveryPlan(plan)` 이 축약 후 같은 함수를 부른다. **게이트 구현은 하나뿐이다.**
- 입력은 **판정용 축약본**(`toDecisionPayload`)이다. 병원 안내문(채널 B)의 `text`·`lang` 은 떨어져 나가고, 남는 것은 "확인했는가" 뿐이다.
- 반환: `{pass, state, reasons, expired}`. `expired` 는 외출 중 즉시 복귀 전환(`AUTO008`)의 판단 근거다.
- 게이트가 실제로 걸려 있는 곳: `/plan` 화면, `/result` 화면, `POST /api/today`.
- **걸려 있지 않은 곳: `POST /api/recommend`, `POST /api/recalculate`** — D05-UNRESOLVED-005.

### D05-SM001-CH001 두 채널과 판정 입력

- **채널 A (제한조건)** — 코드값·수치·시각. `planToCondition(plan)` 이 엔진 조건 객체로 옮긴다. **판정에 쓰인다.**
- **채널 B (병원 안내문)** — 병원이 쓴 문장. **판정에 절대 쓰지 않고 서버로도 보내지 않는다.** 채널 B 를 파싱해 판정에 쓰는 것은 금지한다.
- 판정 규칙: **판정에 쓰려면 병원이 채널 A 로 발행해야 한다.**
- `planToCondition` 이 실제로 옮기는 값: `outingAllowed` · `escortRequired` · `fasting`(`foodRestricted` 또는 `fastingUntil` 존재) · `indoorOnly` · `avoidUv` · `splitAllowed` · `maxWalkMin` · `maxTravelMin` · `version` · `issuedAt` · `issuedBy`.
- **옮기지 않는 값: `avoidHeat`(열 노출) · `noWater`(수중 활동).** `/plan` 화면에 배지로 뜨지만 게이트가 읽지 않는다 — D05-UNRESOLVED-008.

---

## 2. 판정 상태

### D05-SM001-ST001 NO_TOURISM

- 사용자 노출명: 지금은 관광을 권하지 않습니다.
- 의미: 병원 지침·조건, 위험신호, 호출, 필수 동행, 시간 등으로 관광 추천을 생성하지 않음
- 진입:
	- **연결 게이트 차단** — 지침 없음·형식 불량·만료·철회 (신설)
	- 병원 조건 없음·오래됨(24시간 초과)·상충
	- 외출 금지 (`outingAllowed=false`)
	- 위험신호 입력
	- 환자 또는 병원의 즉시 복귀 요청
	- 필수 동행 불충족 (`escortRequired=true` + 보호자 없음)
	- 복귀창이 이미 지남 (`windowMin <= 0`)
	- 운영 kill switch (`SERVICE_PAUSED`)
- 허용 행동: 병원 연락, 숙소 대기, 즉시 복귀, 지침 재연결·재확인
- 금지 행동: 관광 후보 선택, 조건 임의 완화
- terminal: `PATIENT_RECALL` 이 적용된 현재 이벤트 처리에서는 terminal
- Side effect: `course=[]`, 필요 시 `returnNow=true`

### D05-SM001-ST002 STANDBY

- 사용자 노출명: 대기가 필요합니다.
- 의미: 관광 금지까지는 아니지만 시간창·후보·데이터·확인이 부족해 출발하지 않음
- 진입:
	- **미확인 중요 변경** — 확인해야 풀린다 (신설, `PLAN_UNCONFIRMED_UPDATE`)
	- 최소 활동 성립시간 45분 미만 (`MIN_VIABLE_WINDOW`, `DEPARTURE_WINDOW_TOO_SHORT`)
	- 안전 게이트와 SLA 를 통과한 후보 0건 (`NO_CANDIDATE`)
	- 환자 휴식(또는 환자 코스 0건)인데 보호자 분리 조건을 충족하지 못함
- 허용 행동: 병원 인근 대기, 병원 안내 다시 보기, 데이터 재조회
- 금지 행동: 추천 후보가 없는 상태에서 임의 장소 제시
- Side effect: `course=[]`

### D05-SM001-ST003 SPLIT_NEARBY

- 사용자 노출명: 보호자만 근거리 활동이 가능합니다.
- 의미: 환자는 휴식하고 보호자는 호출·복귀 SLA 안의 활동 가능
- **진입 조건 (코드 확인 후 정정)** — `src/engine/recommend.js` 상태 결정부:
	- 선행: `patientResting=true` **또는** `patientCourse.length === 0`
	  ↳ 기존 D05 문서는 `patientResting=true` 만 적었다. **환자 코스가 0건이어도 이 분기로 들어온다.**
	- Guard (모두 충족해야 SPLIT_NEARBY, 하나라도 미충족이면 STANDBY):
		- `hasCompanion=true`
		- `companionSeparateAllowed=true`
		- `escortRequired=false`
		- `companionCourse.length >= 1`
- 허용 행동: 보호자 코스 선택, 원터치 복귀
- 금지 행동: 환자 공동 활동으로 오인하는 문구
- Side effect: `course=companionCourse`

### D05-SM001-ST004 TOGETHER

- 사용자 노출명: 함께 짧은 활동이 가능합니다.
- 의미: 환자 기준 보수적 버퍼와 동행 조건을 모두 충족
- Guard:
	- 연결 게이트 통과 + 병원 조건 게이트 통과
	- `patientResting=false` **그리고** `patientCourse.length >= 1`
	- 보호자가 있으면 `companionCourse.length >= 1`
	- `escortRequired=true` 인데 보호자 코스가 없으면 NO_TOURISM 으로 떨어진다
- **코드 사실**: 보호자가 아예 없고 `escortRequired=false` 인 환자 단독 판정도 이 상태로 산출된다. 상태명과 실제 포괄 범위가 어긋난다 — D05-UNRESOLVED-009.
- 허용 행동: 추천 3개 확인, 장소 상세, 코스 선택
- Side effect: `course=patientCourse`

### 2.5 연결 게이트 사유 코드 (신설 · D05-RC001–RC005)

`src/domain/states.js` 의 `REASON` 에 5종이 추가됐다. 기존 사유 코드 체계는 그대로 유지된다.

| ID | 코드 | 발생 조건 | 결과 상태 | 발생부 구현 |
| --- | --- | --- | --- | --- |
| D05-RC001 | `NO_HOSPITAL_PLAN` | 연결된 계획 없음 · `validateDecisionPayload` 실패 | NO_TOURISM | 있음 — `gateDecisionPayload` |
| D05-RC002 | `PLAN_EXPIRED` | `expiresAt <= now` (경계는 만료 쪽으로 판정) | NO_TOURISM · `expired=true` | 있음 — `gateDecisionPayload` |
| D05-RC003 | `PLAN_REVOKED` | `revoked=true` | NO_TOURISM · `expired=true` | 있음 — `gateDecisionPayload` |
| D05-RC004 | `PLAN_UNCONFIRMED_UPDATE` | 중요 분류 안내 중 `acknowledged !== true` 가 1건 이상 | **STANDBY 강등** | 있음 — `gateDecisionPayload` |
| D05-RC005 | `MEDICATION_WINDOW` | 복약 시각이 외출 창을 자름 | (미정) | **없음 — 정의만 존재** |

**중요 분류 (`CRITICAL_CATEGORIES`)**: `activity` · `escort` · `visit` · `emergency`.
나머지 3종(`medication` · `food` · `lifestyle`)은 확인하지 않아도 외출을 막지 않는다 —
모든 변경을 막으면 "확인" 이 형식적 클릭이 되고 정작 중요한 변경을 놓친다.

> **D05-RC005 `MEDICATION_WINDOW` 는 정의만 있고 발생부가 없다.**
> `src/domain/states.js` 에 코드값과 ko·en 문구까지 있지만, 저장소 전체에서 이 값을
> `reasons` 에 넣는 곳이 없다. 복약 시각이 마감을 앞당기는 **동작 자체는 구현돼 있으나**
> (`effectiveDeadline` → `AUTO009`), 그 사실이 사유 코드로 사용자에게 설명되지 않는다.
> 화면은 `today.deadlineMedication` 문구로만 이유를 알린다. — D05-UNRESOLVED-004

### 2.6 상태·사유 코드 노출 규칙

- 사유 코드는 닫힌 enum 이다. 자유 문자열을 사유로 만들지 않는다.
- 판정 운영 로그에는 `REASON` 을 통과한 값만 나간다 (ADR-0002 선택지 B, `lib/server/decision-log.js`).
- 사유 코드 문구는 ko·en 모두 `REASON_TEXT` 에 있어야 한다. **병원 안내문(채널 B)은 번역 대상이 아니다.**

---

## 3. 상태 전이

### D05-SM001-TR001 ANY → NO_TOURISM

- Actor: 시스템 판정 엔진
- Trigger: 조건 없음·stale·상충, `outingAllowed=false`, `RISK_SIGNAL`, `PATIENT_RECALL`
- Guard: 해당 reason code 확인
- Approval: 자동. 단 병원 조건 자체는 병원 발행값이다
- Side effect: 추천 제거, 사유·판정 로그 기록
- Idempotency: 같은 inputRevision + eventId 는 동일 결과
- 실패: D06-E001·E002
- 검증: D09-QA001–QA004

### D05-SM001-TR002 NO_TOURISM·STANDBY → TOGETHER

- Trigger: 최신 병원 지침·시간창·동행·후보가 모두 충족된 새 input revision
- Guard: 이전 차단조건을 사용자가 임의 해제한 것이 아니라 **병원이 발행한 새 지침**일 것
- 금지: 단순 재시도로 병원 차단 우회
- Side effect: 추천·복귀 마감 생성
- Approval: 병원 발행·확인 주체 필요
- 개정: 수기 입력 화면이 제거되어 "사용자가 조건을 다시 입력해 통과한다" 는 경로는 **사라졌다**

### D05-SM001-TR003 TOGETHER → SPLIT_NEARBY

- Trigger: `patientResting=true` 로 새 입력 또는 역할 변경, **또는 환자 코스가 0건이 됨**
- Guard: 분리 허용, 필수동행 아님, 보호자 후보 존재
- Side effect: 환자 코스를 숨기고 보호자 코스로 교체
- 검증: D09-QA005

### D05-SM001-TR004 SPLIT_NEARBY → TOGETHER

- Trigger: 환자 공동 활동 모드 재선택
- Guard: 환자 기준 SLA 와 병원 조건을 다시 통과
- 금지: 기존 보호자 코스를 환자에게 그대로 승계

### D05-SM001-TR005 TOGETHER·SPLIT_NEARBY → STANDBY

- Trigger: 후보 소진, 시간창 45분 미만, 데이터 신뢰 부족, **미확인 중요 변경 발생**
- Side effect: 코스 제거, 대기·재확인 행동
- 검증: D09-QA006

### D05-SM001-TR006 TOGETHER·SPLIT_NEARBY → NO_TOURISM

- Trigger: `PATIENT_RECALL`, `RISK_SIGNAL`, `outingAllowed=false`
- 우선순위: 모든 다른 전이보다 높음
- Side effect: `returnNow=true` 가능, 관광 CTA 비활성화
- Audit: 즉시 경고 수준 이벤트

### D05-SM001-TR007 ANY → 재판정 결과

- Trigger: `WEATHER`, `TRAFFIC_SURGE`, `APPOINTMENT`, `CLOSURE`
- 처리: 기존 상태를 직접 수정하지 않고 D04-F005 부터 재실행 (`applyEvent`)
- Transaction:
	1. before snapshot 고정
	2. event context 적용
	3. 후보 gate·SLA·순위 재실행
	4. after snapshot 생성
	5. ChangeDelta 원자적 기록
- Side effect: `removed`, `added`, `shortened`, `stateChanged`, `newlyExcluded`, `hasVisibleChange`
- 실패·보상: 재판정 실패 시 기존 코스를 최신으로 표시하지 않고 D06 fallback 적용
- 검증: D09-AC008–AC010
- **개정**: 서버가 받는 이벤트는 `CLOSURE` · `WEATHER` · `TRAFFIC_SURGE` · `APPOINTMENT` · `PATIENT_RECALL` · `RISK_SIGNAL` **6종**이다 (`EVENT_TYPES`, `lib/server/engine-io.js`). 엔진에는 `CONDITION_UPDATE` 분기가 있으나 **호출부가 없다** — D05-UNRESOLVED-006

### D05-SM001-TR008 ANY → 연결 게이트 결과 (신설)

- Actor: 연결 게이트 (`gateDecisionPayload`)
- Trigger: 화면 진입 또는 판정 요청 시 회복 지침 상태 평가
- Guard·결과:
	- 없음·형식 불량 → NO_TOURISM (`NO_HOSPITAL_PLAN`)
	- 만료 → NO_TOURISM (`PLAN_EXPIRED`), `expired=true`
	- 철회 → NO_TOURISM (`PLAN_REVOKED`), `expired=true`
	- 미확인 중요 변경 → **STANDBY** (`PLAN_UNCONFIRMED_UPDATE`) — 차단이 아니라 강등이며, 사용자가 `/guide` 에서 확인하면 풀린다
- 우선순위: 기존 안전 게이트보다 **앞**. 통과하지 못하면 후보 조회 자체를 하지 않는다
- Side effect: 관광지 미표시. `/plan` 은 판정하지 않고 차단 화면, `/today` 는 `outingAllowed=false`
- 금지: 사용자가 지침 없이 조건을 입력해 우회하는 경로 (AX-221 로 수기 입력 화면 제거)
- 검증: [확인필요] — D09 인수조건 번호 미부여

### D05-SM001-TR009 TOGETHER·SPLIT_NEARBY → NO_TOURISM (외출 중 지침 무효) (신설)

- Actor: 클라이언트 감시 훅 `usePlanExpiry` (`lib/usePlanExpiry.js`) — AX-220
- Trigger: 외출 중 계획 **만료 또는 철회** 감지 (`gate.expired === true`)
- Guard: 미확인 중요 변경(STANDBY 강등)은 **이 전이를 발생시키지 않는다.** 외출을 중단시키는 것은 만료·철회뿐이다
- 처리: 새 판정을 만들지 않고 `invalidateForReturn(decision, reasons)` 로 **안전한 방향으로 무효화만 한다** — `PATIENT_RECALL` 과 같은 모양
- Side effect: `state=NO_TOURISM`, `course=[] · patientCourse=[] · companionCourse=[]`, `returnNow=true`, 복귀 시트 자동 표시(이미 닫았어도 다시 뜬다), 변화 이벤트 시연 패널 차단
- Idempotency: 한 번만 발동 (`fired` 플래그). 사유는 중복 제거
- 검증: 단위 6건 + E2E **7건** (AX-220 — 무효화 5건 + 진입 경로 회귀 2건)

---

## 4. 상태 우선순위

보수적 순서:

NO_TOURISM → STANDBY → SPLIT_NEARBY → TOGETHER

- 충돌하는 판정이 동시에 나오면 더 보수적인 상태를 채택한다 (`mostConservative`, `isMoreConservative`).
- 인기·취향·사용자 선호는 상태를 완화할 수 없다.
- 환자 호출과 위험신호는 최우선이다.
- **연결 게이트는 안전 게이트보다 앞이다.** 지침이 없거나 만료면 뒤 단계를 실행하지 않는다.
- NO_TOURISM 은 시스템 실패가 아니라 유효한 제품 결과다.

---

## 5. 자동화 트리거

### D05-SM001-AUTO001 휴무 이벤트 재판정

- 감지: 추천 후보 ID 가 `closedIds` 에 포함
- 입력: eventId, closedIds, detectedAt, source
- 출력: 해당 후보 `CLOSED` 제외, 대체 후보
- 중복 방지: eventId
- Fallback: 대체 없음 → STANDBY
- 현재: 시연 패널에서 **화면 활성 탭의 1순위 장소**를 대상으로 주입한다. 이와 별개로 **후보 생성 단계에서 닫힘이 명백한 곳은 이미 제외된다** (`src/tour-api/schedule.js` — 끝난 행사, 오늘과 맞는 정기 휴무 요일). 그 밖의 실시간 휴무 감지 출처는 [확인필요]
- Kill switch: closure source 신뢰 실패 시 자동 휴무 차단 비활성화

### D05-SM001-AUTO002 기상 악화 재판정

- 감지: 강수·실외 부적합 임계 초과
- 입력: weather summary, reasons, forecastTime
- 출력: 실외 후보 제외 또는 상태 강등 (`WEATHER_BLOCKED`)
- **개정 — 현재**: 기상 어댑터가 구현됐고 **배포본에서 실응답이 확인됐다** (AX-007, `observedAt` 확인). 기존 문서의 "실API 미연결" 은 낡았다
- 타임아웃: 4초 (`src/adapters/weather.js`)
- Fallback: 날씨 불명(`unknown`·`degraded`)은 판정 입력에 넣지 않는다 — 실내 전용 조건을 완화하지도, 강화하지도 않는다 (D06-E012)
- Owner: 개발·운영 · [지정필요]

### D05-SM001-AUTO003 교통 급증 재판정

- 감지: 이동시간 증가 또는 시연 `extraMin`
- 출력: 체류 축소(`shrinkToFit`), 먼 후보 제거, 상태 강등
- 현재: **이벤트 주입 테스트만 구현**. 실제 경로·이동시간 공급자 미연결 (F012 차단 — 위치정보 사전검토 회신 대기 + 공급자·폴백·비용 미결)
- 실제 공급자: [확인필요]

### D05-SM001-AUTO004 진료시간 변경 재판정

- 감지: appointment `deltaMin`
- 출력: `returnBy` 변경, SLA 재계산 (`APPOINTMENT_DELAYED`)
- Guard: 변경 출처와 시각
- 금지: 사용자가 병원 진료시간을 확인 없이 임의 연장
- Manual override: 더 이른 시간으로 보수적 조정은 가능, 늦추기는 병원 확인 필요
- 현재: 시연 패널 기본값 `-60분`(앞당김). 실제 병원 발행 경로는 미연결

### D05-SM001-AUTO005 환자 호출 즉시 중단

- 감지: 보호자 또는 병원이 `PATIENT_RECALL` 입력
- 출력: NO_TOURISM, `course=[]`, `returnNow=true`
- Retry: 필요 없음
- Alert: 화면 `aria-live` assertive 후보
- Kill switch: 없음. 안전기능이므로 비활성화 금지

### D05-SM001-AUTO006 위험신호 입력 차단

- 감지: 사용자가 병원 연락이 필요하다고 표시
- 출력: NO_TOURISM (`RISK_SIGNAL`)
- 금지: 증상 텍스트를 모델로 분류해 자동 진단
- Audit: 상세 증상 원문 없이 입력 사실과 시각만 기록

### D05-SM001-AUTO007 관광데이터 재조회

- 감지: 캐시 만료·사용자 재시도·운영정보 stale
- 입력: 동일 고정 기준점 (병원 지침의 `anchor`. **현재 GPS 를 쓰지 않는다**)
- 출력: 새 후보와 detail
- 중복 방지: cache key
- 캐시 TTL: 15분 (`src/tour-api/client.js`)
- Fallback: API 오류 시 기존 결과를 최신으로 위장하지 않는다. 후보를 확보하지 못하면 502 + `failSafeState: 'STANDBY'`

### D05-SM001-AUTO008 외출 중 지침 만료·철회 감시 (신설 · AX-220)

기존 문서에 없던 트리거다. **이미 나가 있는 사람에게 "만료됐습니다" 만 띄우는 것은 위험하다.**

- 구현: `lib/usePlanExpiry.js` (클라이언트 훅) + `app/result/page.js`
- **감시 3시점**:
	1. **화면 진입** — 백그라운드에 있는 동안 만료됐을 수 있다. `/result` 진입 시 저장된 판정을 그대로 믿지 않고 게이트를 다시 통과시킨다
	2. **만료 시각 타이머** — 화면을 보고 있는 도중 넘어가는 경우. 경계에서 1초 여유를 둬 시계 오차로 헛도는 것을 막는다. `setTimeout` 최대 지연(2^31-1 ms)을 넘으면 걸지 않는다
	3. **탭 복귀 (`visibilitychange`)** — 타이머는 절전 중에 밀린다. `visibilityState === 'visible'` 로 좁히지 **않는다** — 좁히면 항상 hidden 으로 보고하는 임베드·자동화 환경에서 영영 재검사하지 않는다
- 판단 주체: 훅이 아니라 `gateRecoveryPlan` 하나가 정본이다. 진입 경로와 감시 경로가 같은 게이트를 쓰므로 판정이 갈리지 않는다
- 발동 조건: `gate.expired === true` (만료·철회). **미확인 중요 변경은 발동시키지 않는다**
- 출력: `invalidateForReturn` → NO_TOURISM · 코스 전부 비움 · `returnNow=true` · 복귀 시트 자동 재표시 · 시연 이벤트 패널 차단
- 중복 방지: `fired` 플래그로 1회만
- 저장 실패 내성: `sessionStorage` 쓰기가 실패해도 화면에는 무효화가 이미 적용된다
- Kill switch: 없음. 안전기능이다
- 한계: **클라이언트에서만 감시한다.** 서버 판정 API 는 연결 게이트를 통과시키지 않는다 — D05-UNRESOLVED-005

### D05-SM001-AUTO009 복귀 마감 재계산 — 가장 이른 마감 (신설)

- 구현: `effectiveDeadline(plan, now)` — `src/recovery/plan.js`
- 후보 3종: **복귀 시각(`returnBy`) · 복약 시각(`medicationTimes`) · 다음 진료(`nextVisitAt`)**
- 규칙: **셋 중 가장 이른 것이 마감이다.** 미래 시각이 하나라도 있으면 미래만 후보로 삼고, 전부 과거면 전체 중 가장 이른 것을 반환한다
- 반환에 `source`(`returnBy` · `medication` · `visit`)를 함께 담는다 — 화면이 "왜 이 시각이 마감인지" 설명해야 하기 때문이다
- 복약 시각 해석: 병원이 발행한 `HH:MM` 은 **한국 벽시계 시각**이다. 실행 환경 시간대로 해석하면 서버(UTC)와 외국인 이용자 단말(현지 시간대)에서 마감이 몇 시간씩 밀린다. `nextClockOccurrence` 가 KST 고정 오프셋으로 다음 발생 시각을 계산한다
- 소비처: `/today` (마감·다음 복약 표시), `/plan` (판정 요청의 `returnBy` 로 전달)
- **약물명은 받지 않는다.** SLA 계산에는 시각만 있으면 된다
- 사유 코드: **없음.** `MEDICATION_WINDOW` 가 발행되지 않는다 — D05-UNRESOLVED-004

### D05-SM001-AUTO010 추천 전면 중단 kill switch

- 감지: 환경변수 `SAFEHOUR_KILL_RECOMMENDATION` 이 `1`·`true`·`on`
- 출력: 판정도 외부 호출도 하지 않고 즉시 NO_TOURISM + `SERVICE_PAUSED`. 재계산도 같은 이유로 차단하며 후보를 실어 보내지 않는다
- 표시: 응답에 `servicePaused: true` 를 담아 사용자가 이유를 안다. **조용히 막지 않는다**
- 방향: 스위치는 더 안전한 쪽으로만 움직인다. 추천을 켜는 스위치는 없다
- 화면: 오류 화면이 아니라 정상적인 미추천 결과로 표시한다 (§7)

---

## 6. 자동화 공통 계약

- Idempotency: eventId 또는 inputRevision. `AUTO008` 은 `fired` 플래그
- 동시성: 더 최신 revision 만 사용자 화면에 반영
- Timeout: **TourAPI 15초** (`AbortSignal.timeout`), **기상 4초**. 내부 전체 budget [확인필요]
- Retry: **현재 재시도 로직 없음.** 지수 백오프·jitter·최대 횟수 [G3 전 확정]
- 보상: 실패한 재계산 결과는 적용하지 않고 안전한 상태·오류 안내
- 감사: before, after, trigger, `ENGINE_VERSION`, reasonCodes, outcome(`DECIDED`·`PAUSED`·`FAILED`), 후보 수, 조건 신선도 **구간**(`FRESH`·`RECENT`·`AGING`·`STALE`·`FUTURE`·`UNKNOWN`)
- 비밀정보 미기록 (ADR-0002): 좌표, 병원 조건 원문, 조건 발행시각 원값, 장소 이름·주소, session 식별자, 인증키, 외부 URL, 외부 오류 원문. 사유 코드는 닫힌 enum 을 통과한 값만 남는다
- 기록 위치: **stdout 한 줄.** 파일·DB 를 만들지 않는 것은 의도다 — 저장소를 두면 보존 정책(AX-104)이 선행 조건이 되고 서버리스에서는 인스턴스마다 흩어진다
- Manual override:
	- 더 보수적인 상태로 강등 가능
	- 차단조건 완화는 병원 최신 지침 없이는 불가
	- **사용자가 병원 조건을 화면에서 고칠 수 없다** (`/plan` 읽기 전용, AX-221)
- Kill switch:
	- 추천 전체를 NO_TOURISM 으로 전환하는 전역 스위치 (`AUTO010`)
	- 날씨·경로 등 외부 자동화별 스위치
	- 환자 호출 차단과 외출 중 만료 감시는 비활성화 불가

---

## 7. 화면 표시 상태와 구분

- D05 상태: 제품 도메인 판정
- D03 UXS loading·empty·error·offline: 화면 렌더링·통신 상태
- API 오류 때문에 추천을 생성할 수 없으면 화면은 error 일 수 있고 도메인 결과는 STANDBY 또는 미결정이다.
- **NO_TOURISM 을 error 컴포넌트로 표시하지 않는다.**
- **연결 게이트 차단도 오류가 아니다.** "연결된 병원 지침이 없습니다" 는 정상 결과 화면이며, 액션은 사라지지 않고 성격이 바뀐다 — 가능 → `안전 외출 확인` · 대기 → `병원 안내 다시 보기` · 불가 → `병원 연락` / `즉시 복귀`.
- 상태를 계산하는 엔진은 하나다. `/today` 는 후보 조회 없이 **같은 게이트 함수**를 부른다 (공공 API 호출 0건). 홈과 결과 화면이 다른 답을 내는 것이 이 제품에서 가장 위험한 결함이다.
- 상태·사유 문구는 ko·en 모두 존재해야 한다. **병원 안내문(채널 B)은 번역하지 않는다** — 원문 언어를 `lang` 으로 표기한다.

---

## 8. 미해결 항목

### D05-UNRESOLVED-001 이벤트 신뢰 출처

- 질문: 휴무·교통·진료변경 이벤트의 신뢰 가능한 source 와 우선순위는 무엇인가?
- Blocking Level: development_blocker
- 현재: 시연 패널 주입만 존재. 실제 감지 출처 없음

### D05-UNRESOLVED-002 Retry·timeout 정책

- 질문: 외부 API 별 timeout, retry, circuit breaker 수치는 무엇인가?
- Blocking Level: development_blocker
- 현재값: TourAPI 15초, 기상 4초, **retry 없음**, circuit breaker 없음

### D05-UNRESOLVED-003 수동 override 권한

- 질문: 병원 코디네이터가 어떤 상태·조건을 변경할 수 있고 어떤 증거를 남겨야 하는가?
- Blocking Level: release_blocker
- 관련: 감사 기록 보관 주체(병원 보관 여부) 미결

### D05-UNRESOLVED-004 `MEDICATION_WINDOW` 발생부 부재 (신설)

- 사실: `REASON.MEDICATION_WINDOW` 와 ko·en 문구는 `src/domain/states.js` 에 있으나, 저장소 어디에서도 이 코드를 `reasons` 에 넣지 않는다. 복약 시각이 마감을 앞당기는 동작(`effectiveDeadline`)은 구현돼 있다
- 질문: 복약 시각이 마감을 정했을 때 사유 코드로 알릴 것인가, 화면 문구(`today.deadlineMedication`)로 충분한가? 알린다면 어느 상태에 붙는가(정보성인가 강등 사유인가)?
- Blocking Level: development_blocker

### D05-UNRESOLVED-005 연결 게이트가 판정 API 에 없다 (신설)

- 사실: 연결 게이트는 `/plan`·`/result` 화면과 `POST /api/today` 에만 있다. **추천을 생성하는 `POST /api/recommend` 와 `POST /api/recalculate` 에는 없다.** 화면을 따라가는 사용자는 만료된 지침으로 추천을 받지 못하지만, API 를 직접 부르면 받는다
- 질문: 판정 API 가 계획 축약본을 함께 받아 서버에서 게이트를 강제할 것인가?
- 판단: "지침이 없으면 관광지를 표시하지 않는다" 가 제품의 안전 주장인 이상, 강제는 서버에 있어야 한다
- Blocking Level: release_blocker

### D05-UNRESOLVED-006 지침 변경 → 재판정 배선 미연결 (신설)

- 사실: 엔진에 `CONDITION_UPDATE` 분기가 있으나 이를 호출하는 곳이 없고, 서버가 받는 `EVENT_TYPES` 6종에도 들어 있지 않다. **만료·철회는 감시하지만 "병원이 지침을 바꿨다" 는 신호는 어디에도 연결돼 있지 않다**
- 질문: 병원 업데이트 5종(안내 변경·진료시간 변경·동행 조건 변경·복귀시간 단축·환자 호출)을 어떤 채널로 받고, 어떤 트리거 ID 로 재판정에 태울 것인가?
- Blocking Level: development_blocker

### D05-UNRESOLVED-007 조건 최신성 24시간 vs 계획 유효기간 72시간 충돌 (신설)

- 사실: 데모 계획은 **72시간** 유효로 발행되고 화면도 그렇게 표시한다. 그런데 안전 게이트의 조건 최신성 한도는 **24시간**(`CONDITION_MAX_AGE_HOURS`)이고, 계획 발행 시각이 그대로 조건 발행 시각으로 넘어간다
- 증상: 30시간 전 발행된 계획(유효기간 내)으로 판정하면 `NO_TOURISM` · `STALE_HOSPITAL_CONDITION`. **사용자에게는 "유효기간 내" 로 보이는데 아무것도 추천되지 않는다**
- 선택지: (a) 유효기간을 24시간에 맞춘다 (b) 최신성 한도를 계획 유효기간에 위임한다 (c) 두 기준을 분리하고 화면에 각각 표시한다
- 결정 주체: **의료 자문** — 조건이 며칠까지 유효한가는 의학적 판단이다. [확인필요]
- Blocking Level: release_blocker

### D05-UNRESOLVED-008 열 노출·수중 활동이 판정에 쓰이지 않는다 (신설)

- 사실: `avoidHeat`·`noWater` 는 병원이 발행하고 게이트웨이를 통과해 `/plan` 화면에 배지로 뜬다. 그러나 `planToCondition` 이 조건 객체로 옮기지 않아 안전 게이트가 읽지 않는다
- 게이트가 실제로 읽는 것: 외출 허용, 필수 동행, 금식, 실내 전용, 자외선 회피, 보행 한도, 이동 한도, 분리 허용, 조건 발행시각·버전
- 질문: 두 조건을 후보 게이트 사유 코드로 승격할 것인가(사우나·찜질·수영 시설 제외), 표시 전용으로 남길 것인가?
- Blocking Level: development_blocker

### D05-UNRESOLVED-009 TOGETHER 가 환자 단독 판정도 포괄한다 (신설)

- 사실: 보호자가 없고 `escortRequired=false` 이며 환자 코스가 있으면 상태는 `TOGETHER` 다. 사용자 노출명은 "함께 짧은 활동이 가능합니다" 이므로 실제 포괄 범위와 어긋난다
- 질문: 상태를 나눌 것인가(예: SOLO_OK 신설 — 4상태 구조 변경), 노출 문구만 조건부로 바꿀 것인가?
- 판단 주의: **4상태 구조 변경은 D01·D03·D09 를 함께 흔든다.** 문구 조정이 우선 검토 대상이다
- Blocking Level: release_blocker

### D05-UNRESOLVED-010 계획 서명·위조 검증 부재 (신설)

- 사실: 회복 지침이 판정의 근거인데 **서명·위조 검증이 없다.** 게이트는 형식(`validateDecisionPayload`)과 만료·철회만 본다
- 영향: 위조된 계획으로 판정하면 안전 사고다. 연결 게이트의 신뢰 전제가 성립하지 않는다
- Blocking Level: release_blocker
- 결정 주체: 사람 (`docs/PRODUCT_DEFINITION.md` §12 사람 결정 큐)

### D05-UNRESOLVED-011 신설 전이·트리거의 D09 검증 번호 미부여 (신설)

- 사실: `TR008`·`TR009`·`AUTO008`·`AUTO009`·`AUTO010` 에 대응하는 D09 인수조건·QA 번호가 없다. AX-220 의 단위 6건 + E2E 7건은 존재하지만 D09 추적표에 매핑되지 않았다
- 조치: D09 개정 시 번호 부여 — [확인필요]
- Blocking Level: development_blocker

### 참고 — 이번 개정에서 폐기된 것은 없다

- `ST001`–`ST004`, `TR001`–`TR007`, `AUTO001`–`AUTO007` 은 모두 유효하며 내용만 갱신했다.
- 번호를 재사용하지 않았고, 신설분은 `TR008`·`TR009`·`AUTO008`–`AUTO010`·`RC001`–`RC005`·`GATE001`·`CH001` 로 이어 붙였다.
- 다만 **D03-NAV004(뒤로가기 시 입력 유지)는 AX-221 로 대상이 소멸했다** — 조건이 사용자 입력이 아니라 병원 발행값이라 잃을 입력이 없다. D05 에는 해당 ID 가 없으므로 여기서 폐기 표시할 대상은 없다.

---

**사람 검토 체크:** 상태 의미, 초기·종료 처리, 전이 guard, actor·approval, 자동화 출처, idempotency, 보상·override·kill switch, 연결 게이트 사유 코드 5종, 외출 중 만료 감시 3시점, 가장 이른 마감 규칙, D09 검증 번호 부여
