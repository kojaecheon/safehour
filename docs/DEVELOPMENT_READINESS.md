# SafeHour 개발 준비 상태와 명세 추적표

기준일: 2026-08-03 (기준 커밋 `5df237f`)

## 판정 요약

엔진·TourAPI·모바일 웹·E2E·배포 준비는 실행 가능한 수준에 도달했다. 자동 테스트 156건과
E2E 25건이 CI에서 통과하고, 추천을 즉시 중단할 kill switch와 롤백 절차가 있다.

**그러나 Release Ready는 아니다.** D01–D09가 모두 사람 검토 전 `WORKING`이고,
전문 signoff·데이터 보존 정책·Figma 정본·실기기 검증·실제 배포 증거가 없다.
이것들은 코드로 해결할 수 없는 항목이며, 남은 차단 요인의 대부분을 차지한다.

## 실제 기준선

| 항목 | 실제 증거 | 상태 |
| --- | --- | --- |
| 런타임 | Node.js 20.9+, Next.js 16.2, React 19.2 | 준비 |
| 단위·통합 테스트 | `npm test` | **156/156 통과** (42 suites) |
| 테스트 커버리지 | `npm run test:coverage` | **line 93.92%, branch 85.56%, function 93.98%** |
| E2E | `npm run e2e` (Playwright, 360px) | **25/25 통과**, 외부 API 호출 0건 |
| 정적 검사 | `npm run lint` | 통과 |
| 프로덕션 빌드 | `npm run build` | 통과 |
| 운영 의존성 감사 | `npm run audit` | High 이상 0건 |
| Git | `kojaecheon/safehour` (비공개), PR 9건 병합 | 준비 |
| CI | lint → test → build → audit → **E2E** | 준비 — **branch protection 미설정** |
| 실API | TourAPI 증거 있음 / **기상은 활용신청 미완료(HTTP 403)** | 부분 |
| 배포 | 설정·문서·kill switch 준비 완료 / **실제 배포 없음** | 준비만 |
| 실기기·스크린리더 | 자동 검증만 존재 | 미준비 |

커버리지는 UI 컴포넌트를 제외한 서버·도메인 모듈 기준이다. 낮은 모듈은
`travelTime.js`(47.06% — 카카오 어댑터가 미사용 경로), `app/api/place/route.js`(69.33%)다.

## Notion과 코드의 드리프트

D01–D09는 아직 갱신되지 않았다. 아래는 문서가 실제와 다른 지점이다.

| Dxx 기록 | 실제 | 조치 |
| --- | --- | --- |
| D09: 자동 테스트 46개 | **156개** + E2E 25개 | D09 갱신 필요 |
| D04/D09: 모바일 웹 미구현 | `/`, `/plan`, `/result`, `/place/{id}` + API 4종 구현 | D04·D09 갱신 필요 |
| D04-F011: 기상 어댑터 미구현 | 어댑터·테스트 구현. **실계정 미확보(403)** | 활용신청 후 증거 갱신 |
| D03: SCR002–004 별도 URL | `/plan` 통합 + 앵커 | **ADR-0001 Accepted 로 확정.** D03 본문 갱신 필요 |
| D03: SCR007 `/result/change`, SCR008 `/return` | 결과 화면 내 모달 | **ADR-0001 로 확정.** D03 본문 갱신 필요 |
| D03: SCR006 상세 화면 없음 | `/place/{candidateId}` 구현 | D03·D09 갱신 필요 |
| D04/D09: Git·CI 미구현 | 원격 저장소·CI 존재 | 갱신 필요 |

Notion 갱신은 사람 승인 사항이므로 에이전트가 직접 수정하지 않는다.

## D09 인수조건 추적

| 인수조건 | 현재 증거 | 판정 |
| --- | --- | --- |
| AC001–AC006 | `scenarios.test.js`, `engine-io.test.js`, `api-contract.test.js` | 통과 |
| AC007 | 엔진 차단 테스트 + E2E 안전 게이트 2건 | 통과 |
| AC008 | 엔진 최대 5, 화면 최대 3 (E2E 카드 수 단언) | 통과 |
| AC009 | `slaCalculator` 테스트, 폴백 "추정" 배지 E2E 확인 | **현장 측정 필요** |
| AC010 | CLOSURE 회귀 + E2E 대체 확인 + `LIVE_SCENARIO_EVIDENCE.md` | 통과 |
| AC011 | WEATHER fixture·어댑터 테스트 8건 | **실API 증거 필요 (403)** |
| AC012 | TRAFFIC_SURGE/APPOINTMENT 누적 계약 테스트 | 실제 공급자 미검증 |
| AC013 | PATIENT_RECALL 엔진 + E2E(추천 무효화·복귀 시트 자동 표시) | 통과 |
| AC014–AC016 | mapper/detail/candidate 테스트 + `place-api.test.js` 10건 | 통과 |
| AC017 | **800/1,000 경계 테스트 완료**, 병렬 초과 회귀 포함 | 통과 |
| AC018 | E2E 360px + 320/430/768/1280px 가로 스크롤 없음, GPS 요청 0건 | **실기기 필요** |
| AC019 | axe 8화면 위반 0, 키보드 4건, 200% 확대, 44px 터치 | **스크린리더 필요** |
| AC020 | GPS 미사용(E2E 단언 + `Permissions-Policy`), 서버 키, 의료 경계 | **전문 리뷰 필요** |

## 기능 준비도

| 기능 | 상태 | 다음 증거 |
| --- | --- | --- |
| F001–F010 엔진·TourAPI | 구현·경계 회귀 완료 | 문서 동기화 |
| F011 기상 | 코드 구현, **활용신청 미완료** | 승인된 키로 실응답 |
| F012 실제 경로 | 차단 | 위치정보 답변(문의 2540)·공급자 ADR |
| F013 모바일 웹 | **구현 완료** (4화면 + E2E + 접근성) | 실기기·Figma 매핑 |
| EVT001–EVT007 계측 | 미구현 | **개인정보 동의·schema 승인 후** 구현 |
| 운영·rollback | 설정·문서·kill switch 완료 | **실제 배포와 리허설** |

## 출시 전 차단 항목

코드로 해결할 수 없는 것과 남은 구현을 분리한다.

### 사람 결정·외부 절차 (대부분)

- D01–D09 사람 검토·승인 (전부 `WORKING`)
- 의료·개인정보·보안·위치정보·법무·콘텐츠 signoff — **리드타임이 가장 길다**
- 데이터 보존기간·분석 동의·개인정보 처리 경계 미승인
- 위치정보 사전검토(문의 2540 답변 대기)와 지도 공급자 미결정
- Figma 정본·디자인 시스템·영문 안전 문구 검수
- 사용자 인터뷰, KPI 목표값, project key, RACI
- 기상청 활용신청 (즉시 가능)
- Vercel 프로젝트 연결·환경변수·배포 URL
- GitHub branch protection (`quality` 필수 지정)

### 남은 구현

- AX-011 모달 뒤로가기 (설계 재검토 필요)
- 실기기·스크린리더 검증 (사람 수행)
- 계측 이벤트 (동의 정책 승인 후)
- 운영 대시보드·알림 (AX-201)

이 항목은 코드 편의로 우회하지 않으며 `docs/AX_BACKLOG.md`에서 사람 결정 작업과
구현 작업을 분리해 추적한다.

## 관련 문서

- 작업 백로그: `docs/AX_BACKLOG.md`
- 내부 API 계약: `docs/API_CONTRACT.md`
- 배포·운영 절차: `docs/DEPLOYMENT.md`
- 라우트 결정: `docs/decisions/0001-route-contract.md`
