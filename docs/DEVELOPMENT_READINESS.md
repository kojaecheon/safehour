# SafeHour 개발 준비 상태와 명세 추적표

기준일: 2026-08-01

## 판정 요약

엔진·TourAPI·기본 모바일 웹은 실행 가능한 프로토타입이다. 저장소 기준 자동 테스트와 프로덕션 빌드는 통과한다. 그러나 D01–D09가 모두 사람 검토 전 `WORKING`이고, 디자인·보존정책·E2E·전문 signoff·배포 증거가 없어 Release Ready는 아니다.

## 실제 기준선

| 항목 | 실제 증거 | 상태 |
| --- | --- | --- |
| 런타임 | Node.js 20.9+, Next.js 16.2, React 19.2 | 준비 |
| 단위·통합 테스트 | `npm test` | 74/74 통과 |
| 테스트 커버리지 | `npm run test:coverage` | line 73.20%, branch 75.47%, function 70.37% |
| 정적 검사 | `npm run lint` | CI 기준선 |
| 프로덕션 빌드 | `npm run build` | 통과 |
| 운영 의존성 감사 | `npm run audit` | High 이상 0건 목표 |
| Git | 로컬 `main` 저장소 | 준비 |
| CI | lint → test → build → audit | 준비 |
| 실API | TourAPI 증거 있음, 기상 실계정 재검증 필요 | 부분 |
| E2E·실기기·접근성 | 자동화·증거 없음 | 미준비 |

## Notion과 코드의 드리프트

- D04/D09는 모바일 웹을 미구현으로 기록하지만 현재 `/`, `/plan`, `/result`, 추천·재계산 API와 주요 컴포넌트가 존재한다.
- D09는 46개 테스트를 기록하지만 현재 기준선은 74개다.
- D04-F011은 기상 실API 어댑터 미구현으로 기록돼 있으나 현재 호출 어댑터와 fixture 테스트가 있다. 실제 활용신청 계정·실응답 증거는 별도 확인이 필요하다.
- D03의 SCR002–SCR004는 별도 URL 계약이지만 현재 `/plan` 한 화면으로 합쳐져 있다. SCR006 `/place/{candidate_id}` 상세 화면은 아직 없다.
- Git·CI 미구현 기록은 이 준비 작업으로 해소됐으나 원격 저장소와 branch protection은 아직 없다.

## D09 인수조건 추적

| 인수조건 | 현재 증거 | 판정 |
| --- | --- | --- |
| AC001–AC006 | `test/scenarios.test.js`, `test/engine-io.test.js` | 프로토타입 통과 |
| AC007 | 엔진 차단 테스트, 결과 화면 상태 배너 | UI E2E 필요 |
| AC008 | 엔진 최대 5, 화면 최대 3 | 통과 |
| AC009 | `slaCalculator` 테스트, 폴백 표시 | 현장 측정 필요 |
| AC010 | CLOSURE 회귀 + `LIVE_SCENARIO_EVIDENCE.md` | 통과 |
| AC011 | WEATHER fixture와 기상 어댑터 테스트 | 실API 증거 필요 |
| AC012 | TRAFFIC_SURGE/APPOINTMENT fixture | 실제 공급자 미검증 |
| AC013 | PATIENT_RECALL 엔진·복귀 시트 | E2E 필요 |
| AC014–AC016 | mapper/detail/candidate 테스트와 실API 문서 | 프로토타입 통과 |
| AC017 | provider parser·counter 구현 | 800/1,000 경계 테스트 필요 |
| AC018 | 모바일 우선 CSS와 핵심 화면 | 360px E2E·실기기 필요 |
| AC019 | label, focus, aria 일부 구현 | axe·스크린리더·대비 검증 필요 |
| AC020 | GPS 미사용·서버 키·의료 경계 구현 | 네트워크·콘텐츠·전문 리뷰 필요 |

현재 커버리지는 UI를 포함하지 않고 테스트에서 불러온 서버·도메인 모듈 기준이다. 특히 TourAPI client와 candidate service의 오류·한도·캐시 경로가 낮으므로 80%를 완료 기준으로 강제하기 전에 AX-006에서 안전 경계 테스트를 우선 보강한다.

## 기능 준비도

| 기능 | 상태 | 다음 증거 |
| --- | --- | --- |
| F001–F010 엔진·TourAPI | 구현 | 경계 회귀와 문서 동기화 |
| F011 기상 | 코드 구현, 운영 검증 미완료 | 활용신청 계정 실응답 |
| F012 실제 경로 | 차단 | 위치정보 답변·공급자 ADR |
| F013 모바일 웹 | 부분 구현 | SCR006, E2E, 접근성, 디자인 QA |
| EVT001–EVT007 계측 | 미구현 | 개인정보 동의·schema 승인 후 구현 |
| 운영·rollback | 미구현 | 배포 대상·feature flag·runbook |

## 출시 전 차단 항목

- 사용자 인터뷰, KPI, project key, RACI 미승인
- Figma 정본·디자인 시스템·영문 안전 문구 검수 없음
- 데이터 보존기간·분석 동의·개인정보 처리 경계 미승인
- 위치정보 사전검토와 지도·Directions 공급자 미결정
- 의료·개인정보·보안·위치정보·법무·콘텐츠 signoff 없음
- 핵심 흐름 E2E, 실기기, axe, 네트워크/secret 검증 없음
- 원격 Git, 배포 URL, 운영계정, canary·rollback 증거 없음

이 항목은 코드 편의로 우회하지 않으며 `docs/AX_BACKLOG.md`의 사람 결정 작업과 구현 작업을 분리해 추적한다.
