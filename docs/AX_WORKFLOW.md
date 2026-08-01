# SafeHour AX 개발 워크플로우

기준일: 2026-08-01

## 목적

Notion의 [기획산출물 v1.0](https://www.notion.so/3adb4751d4488054a904ff95eeb8ab44)을 사람이 읽는 기획 문서에 머물게 하지 않고, 에이전트가 반복 실행할 수 있는 `요구사항 → 작업 계약 → 코드·테스트 → 증거 → 문서 동기화` 흐름으로 운영한다.

현재 D01–D09는 모두 `WORKING`이다. 구현 증거가 생겨도 사람이 승인하기 전에는 문서를 `APPROVED` 또는 `BASELINED`로 바꾸지 않는다.

## 정본과 우선순위

충돌 시 다음 순서를 사용한다.

1. 법령·OpenAPI 이용조건·병원이 발행한 최신 조건
2. D07 정책·금지조건과 D09 release hold
3. D04 API·데이터, D05 상태, D06 예외 계약
4. D01·D02 제품 목표와 시나리오
5. D03·D08 UX·컴포넌트 계약
6. 저장소 코드와 테스트 증거

코드가 문서보다 앞서 있으면 코드를 사실 증거로 기록하되, 그것만으로 문서 요구사항을 변경하지 않는다. 차이는 `DEVELOPMENT_READINESS.md`에 드리프트로 남긴다.

## 한 작업의 AX 루프

### 1. Discover

- 연결할 Dxx 기능, 시나리오, 정책, D09 AC·QA를 고른다.
- 실제 코드·테스트·증거를 확인한다.
- 사람 승인이나 외부 답변이 필요한 항목을 구현 작업과 분리한다.

### 2. Contract

아래 작업 계약을 PR, 이슈 또는 인계문에 먼저 작성한다.

```markdown
작업 ID: AX-###
목표:
연결: D04-F###, D09-AC###, D09-QA###
범위:
범위 밖:
안전 불변조건:
인수조건:
검증 명령:
필요한 사람 결정:
```

인수조건은 화면이나 API에서 관찰 가능한 결과로 작성한다. “안전하게”, “빠르게” 같은 표현만으로 완료를 선언하지 않는다.

### 3. Implement

- 1–2일 안에 검증 가능한 수직 조각으로 구현한다.
- 정상, 안전한 미추천, 실패·폴백을 같은 작업에서 다룬다.
- 외부 API를 직접 호출하기 전에 fixture 기반 계약 테스트를 만든다.
- 정책 차단을 UI만이 아니라 서버 입력 검증과 도메인 규칙에서 강제한다.

### 4. Verify

기본 기준선은 `npm run check`다. 변경 성격에 따라 다음 증거를 추가한다.

| 변경 | 추가 검증 |
| --- | --- |
| 안전 게이트·SLA·상태 | 관련 단위 테스트와 전체 회귀 |
| UI·접근성 | 360px, 키보드, 200% 확대, axe, 핵심 E2E |
| 외부 API | 오류·429·빈 결과 fixture, 필요 시 별도 실API 증거 |
| 개인정보·보안 | secret scan, 현재 GPS 요청 0건, 로그 redaction |
| 변화 이벤트 | before/after/delta와 `hasVisibleChange` 검증 |

실API 결과는 `artifacts/`와 `logs/`에 생성되며 Git에 올리지 않는다. 재현 가능한 요약만 `docs/`에 남긴다.

### 5. Evidence

완료 보고에는 연결 ID, 검증자·일시, 명령 결과, 증거 파일, 남은 위험을 포함한다. 테스트 개수나 구현 상태가 Notion과 달라지면 `DEVELOPMENT_READINESS.md`를 먼저 갱신한다.

### 6. Sync

- 기능·정책·상태 계약 변경: 관련 D01–D09에 영향 표시
- 구현 증거만 추가: Notion 계획/작업 상태와 증거 링크 갱신
- 사람 결정 필요: 승인 대기 상태와 질문을 유지
- AI는 문서 승인 상태와 release gate를 단독 변경하지 않음

## 게이트 운영

| 게이트 | 통과에 필요한 핵심 증거 | 현재 판단 |
| --- | --- | --- |
| G1 Product Ready | 사용자 검증, KPI, project key, 사람 승인 | 차단 |
| G2 Design Handoff Ready | Figma 정본, D03/D08 승인, 접근성 계약 | 차단 |
| G3 Dev Ready | API·보존·retry/cache·CI·기술 blocker 해소 | 부분 준비 |
| G4 Release Ready | E2E·실기기·보안/법무/의료 승인·배포/rollback | 차단 |

세부 증거와 차단 항목은 `DEVELOPMENT_READINESS.md`가 소유한다.

## 브랜치와 증거 규칙

- 브랜치: `feature/AX-###-name`, `fix/AX-###-name`, `docs/AX-###-name`
- PR: 작업 계약, 사용자 영향, 검증 결과, 미해결 위험을 한국어로 작성
- ADR: 외부 공급자, 보존정책, 상태 의미, 런타임 구조처럼 되돌리기 어려운 결정
- Release hold: 위험 추천·복귀 SLA·GPS·secret·의료 판단·병원 알선·저작권 위반은 waiver 없이 차단

## 사람 결정 큐

- project key `safehour`와 RACI 승인
- Figma file/node/version/owner와 디자인 토큰
- 기준점 검색·지도·Directions 공급자 및 위치정보 사전검토
- PlanningInput·판정 로그·분석 이벤트 보존기간과 동의 경계
- 의료·개인정보·위치정보·콘텐츠/법무 signoff 담당자
- 외부 API retry, timeout, cache, circuit breaker 수치
- 실제 복귀 SLA 버퍼의 현장 측정
