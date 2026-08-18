# SafeHour AX 우선순위 백로그

작업은 기본 1–2일 크기다. `HUMAN` 항목은 에이전트가 임의 결정하지 않는다.

## P0 · 개발 기준선과 심사 핵심 흐름

| ID | 작업 | 연결 | 완료 조건 | 상태 |
| --- | --- | --- | --- | --- |
| AX-001 | 저장소·CI·lint·audit 기준선 구성 | D04 G3, D09-RG003 | `npm run check`, CI 파일, Git main | 완료 |
| AX-002 | 내부 API schema·오류 계약 고정 | F001–F002, API007–009, AC001–003 | 유효/무효 payload 계약 테스트, 일관된 오류코드 | 완료 — `docs/API_CONTRACT.md`, `test/api-contract.test.js` |
| AX-003 | D03 라우트·화면 계약 결정 | SCR002–SCR006, F013 | 합쳐진 `/plan` 승인 또는 단계 라우트 분리 ADR | 완료 — ADR-0001 Accepted (2026-08-03) |
| AX-010 | 라우트 결정 보완 조건 구현 | ADR-0001, D03-NAV004 | 입력 유지(draft), `/place` 차단 가드, 변화 요약 잔존, `/plan` 앵커 | 완료 — 4/5건 (모달 뒤로가기는 AX-011 로 분리) |
| AX-011 | 모달 뒤로가기 처리 | ADR-0001 보완 조건 3 | 안드로이드 뒤로가기가 시트만 닫고 페이지를 떠나지 않음 | 완료 — E2E 3건으로 고정 |
| AX-004 | 핵심 흐름 E2E 구축 | AC018, QA033–040 | 입력→결과→휴무 대체→즉시 복귀, 360px, GPS 요청 0 | 완료 — Playwright 6건, CI 통합, 외부 호출 0건 |
| AX-005 | 장소 상세 SCR006 구현 | SCR006, F009, AC016 | 원문/추정/저작권 분리, 누락 상태 표시 | 완료 — `/place/[candidateId]`, 계약 테스트 10건 |
| AX-006 | API 한도·부분 실패 경계 테스트 | AC017, QA032 | 800 경고, 1,000 차단, 상세 일부 실패 회귀 | 완료 — 경계 테스트 34건, 결함 5건 수정 |
| AX-009 | 안전 핵심 모듈 커버리지 보강 | D09 QA, D04-F003·F010 | client·candidate-service 오류/캐시 경계, 전체 line 80% 목표 재평가 | 대부분 완료 (AX-006 에서 client 98%, candidate-service 100%, 전체 95.71%) — mapper 잔여 |
| AX-007 | 기상 실API 증거 갱신 | F011, AC011 | 승인된 키로 실응답, 실패·stale 증거 | 완료 — 배포본에서 실관측 응답 확인 (`TOUR_API_KEY` 로 호출) |
| AX-008 | 개인정보 안전 계측 설계 | EVT001–EVT007, POL008, D07 4절 | schema·동의·보존 승인, PII 0 fixture | 완료 — ADR-0002 Accepted(선택지 B). 판정 운영 로그 구현, PII 0 테스트 17건. 보존기간은 AX-104 |

## P1 · 디자인·운영·배포

| ID | 작업 | 연결 | 완료 조건 | 상태 |
| --- | --- | --- | --- | --- |
| AX-101 | Figma 정본과 코드 매핑 | D03, D08 | 8개 화면·컴포넌트 node/version/owner | HUMAN |
| AX-102 | 접근성·반응형 검증 | AC019, QA033–036 | axe, 키보드, 200%, 스크린리더, 실기기 | 자동 검증 완료 (axe 8화면·키보드 4·반응형 7) — **스크린리더·실기기는 사람 검증 필요**. 절차는 `docs/DEVICE_TEST_CHECKLIST.md` (15분, 미수행) |
| AX-103 | 지도·Directions ADR | F012, POL002 | 위치정보 검토, 공급자·폴백·비용 결정 | HUMAN |
| AX-104 | 보존·동의 ADR | DB001–006, POL008 | 데이터별 보존·파기·동의 승인 | HUMAN |
| AX-105 | 배포·feature flag·rollback | RG007–008 | preview/production, kill switch, canary, rollback 리허설 | 준비 완료 — `docs/DEPLOYMENT.md`, kill switch, `/api/health`. **Vercel 프로젝트 연결·환경변수·리허설은 운영자 실행 필요** |
| AX-106 | 전문 signoff 패키지 | D07, AC020 | 의료·개인정보·위치·법무·콘텐츠 승인 증거 | HUMAN |

## P2 · 공모전 제출 완성도

| ID | 작업 | 연결 | 완료 조건 | 상태 |
| --- | --- | --- | --- | --- |
| AX-201 | 계측 dashboard와 운영 alert | D02 이벤트, RG007 | 퍼널·변화율·API 성공률·누락 경고 | **범위 축소** — ADR-0002 로 별도 대시보드를 만들지 않는다. 플랫폼 로그에서 `"evt":"decision"` 조회 (`docs/DEPLOYMENT.md` 1.3) |
| AX-202 | 운영계정·API 활용표 | RG004, RG008 | 배포 URL, 호출 증적, 화면 대응표 | 완료 — `docs/API_USAGE_TABLE.md` |
| AX-203 | 제출 리허설과 증거 동결 | HOLD008 | 9/18 동결, 9/20 패키지, 9/21 리허설 | 대기 |
