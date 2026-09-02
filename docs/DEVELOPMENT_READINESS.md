# SafeHour 개발 준비 상태와 명세 추적표

기준일: 2026-08-19

## 판정 요약

엔진·TourAPI·모바일 웹·E2E·배포 준비는 실행 가능한 수준에 도달했다. 자동 테스트 322건과
E2E 93건이 CI에서 통과하고, 추천을 즉시 중단할 kill switch와 롤백 절차가 있다.
한국어·영어 화면(AX-209), 단말 데이터 삭제(AX-210), 개인정보·면책 고지(AX-211)에 더해
**병원 지침 연동 흐름**(소셜 로그인 → 지침 연결 → 오늘의 회복 → 병원 안내 → 외출 판정,
AX-216~221)까지 구현됐다.

**그러나 Release Ready는 아니다.** D01–D09가 모두 사람 검토 전 `WORKING`이고,
전문 signoff·데이터 보존 정책·Figma 정본·실기기 검증이 없다.
이것들은 코드로 해결할 수 없는 항목이며, 남은 차단 요인의 대부분을 차지한다.

**그리고 배포본이 코드보다 뒤처져 있다.** `safehour.vercel.app` 은 아직 수기 입력 방식의
옛 화면이며, 병원 연동 흐름이 배포되지 않았다. 공모전 1차심사의 서비스 구현성 30점은
심사위원이 이 URL 을 직접 눌러 판정하므로 **최우선 차단 항목**이다 —
실행 절차는 `docs/DEPLOY_CHECKLIST.md`.

## 실제 기준선

| 항목 | 실제 증거 | 상태 |
| --- | --- | --- |
| 런타임 | Node.js 20.9+, Next.js 16.2, React 19.2 | 준비 |
| 단위·통합 테스트 | `npm test` | **322/322 통과** (77 suites) |
| 테스트 커버리지 | `npm run test:coverage` | **line 96.62%, branch 85.70%, function 93.95%** |
| E2E | `npm run e2e` (Playwright, 360px) | **93/93 통과** (6 파일), 외부 API 호출 0건 |
| 정적 검사 | `npm run lint` | 통과 |
| 프로덕션 빌드 | `npm run build` | 통과 |
| 운영 의존성 감사 | `npm run audit` | High 이상 0건 |
| Git | `kojaecheon/safehour` (비공개), PR 9건 병합 | 준비 |
| CI | lint → test → build → audit → **E2E** | 준비 — branch protection 은 **플랜 제약으로 불가**, `npm run merge` 로 대체 |
| 실API | TourAPI·기상 모두 배포본에서 실응답 확인 (AX-007) | 준비 |
| 공공 API 호출 이력 | `npm run usage:weekly` → `docs/API_USAGE_SNAPSHOT.md`. 현재 **24콜/2일** | **축적 필요** — 소급 불가 |
| 배포 | https://safehour.vercel.app 가동 중 (`/api/health` 200) — **옛 화면** | **재배포 필요** |
| 소셜 로그인 자격증명 | 코드·테스트 완료. Google·Kakao 앱 등록 미완 | **운영자 실행 필요** |
| 실기기·스크린리더 | 자동 검증만 존재 | 미준비 |

커버리지는 UI 컴포넌트를 제외한 서버·도메인 모듈 기준이다. 낮은 모듈은
`travelTime.js`(47.06% — 카카오 어댑터가 미사용 경로), `lib/session.js`(60.66% — 브라우저
저장소 모듈이라 E2E 5건이 대신 덮는다)다.

## Notion과 코드의 드리프트

D01–D09는 아직 갱신되지 않았다. 아래는 문서가 실제와 다른 지점이다.

| Dxx 기록 | 실제 | 조치 |
| --- | --- | --- |
| D09: 자동 테스트 46개 | **295개** + E2E 93개 | D09 갱신 필요 |
| D04/D09: 모바일 웹 미구현 | 화면 9개 + 내부 API 10종 구현 | D04·D09 갱신 필요 |
| D01/D03: 조건을 사용자가 입력 | **병원이 발행한 제한조건을 읽기 전용으로 받는다** (`docs/PRODUCT_DEFINITION.md`) | D01·D03 갱신 필요 |
| D03: 로그인 없음 | **소셜 로그인 (Google·Kakao)** — ADR-0004 | D03 갱신 필요 |
| D04-F011: 기상 어댑터 미구현 | 어댑터·테스트 구현. **배포본 실응답 확인 완료** | D04 갱신 필요 |
| D01/D03: 화면 한국어 전용 | **한국어·영어 지원** (ADR-0003) | D01·D03 갱신 필요 |
| D03: 개인정보 고지 화면 없음 | `/privacy` 구현 | D03 갱신 필요 |
| D03-NAV004: 뒤로가기 시 입력 유지 | **대상 소멸 (AX-221)** — 조건이 사용자 입력이 아니라 병원 발행값이라 잃을 입력이 없다 | D03 갱신 필요 |
| D03: `/plan` 조건 입력 화면 | **계획 확인 화면으로 교체.** `/login` `/link` `/today` `/guide` 4화면 추가 | D03 갱신 필요 |
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
| AC011 | 어댑터 테스트 8건 + **배포본 실관측 응답**(`observedAt` 확인, `unknown=false`) | 통과 |
| AC012 | TRAFFIC_SURGE/APPOINTMENT 누적 계약 테스트 | 실제 공급자 미검증 |
| AC013 | PATIENT_RECALL 엔진 + E2E(추천 무효화·복귀 시트 자동 표시) | 통과 |
| AC014–AC016 | mapper/detail/candidate 테스트 + `place-api.test.js` 10건 | 통과 |
| AC017 | **800/1,000 경계 테스트 완료**, 병렬 초과 회귀 포함 | 통과 |
| AC018 | E2E 360px + 320/430/768/1280px 가로 스크롤 없음, GPS 요청 0건 | **실기기 필요** — 절차 `docs/DEVICE_TEST_CHECKLIST.md` |
| AC019 | axe 9화면 위반 0, 키보드 4건, 200% 확대, 44px 터치, 언어별 `lang` 갱신 | **스크린리더 필요** — 절차 `docs/DEVICE_TEST_CHECKLIST.md` 5절 |
| AC020 | GPS 미사용(E2E 단언 + `Permissions-Policy`), 서버 키, 의료 경계 | **전문 리뷰 필요** |

## 기능 준비도

| 기능 | 상태 | 다음 증거 |
| --- | --- | --- |
| F001–F010 엔진·TourAPI | 구현·경계 회귀 완료 | 문서 동기화 |
| F011 기상 | 구현·실응답 확인 완료 | 문서 동기화 |
| F012 실제 경로 | 차단 | 위치정보 답변(문의 2540)·공급자 ADR |
| F013 모바일 웹 | **구현 완료** (9화면 + E2E + 접근성 + 한국어·영어) | 실기기·Figma 매핑·영문 검수 |
| 병원 지침 연동 (AX-213~218·221) | **구현 완료** — 채널 A/B 분리, 게이트웨이, 연결·홈·안내·계획 확인 4화면 | 제한조건 목록 의료진 확인 (HUMAN) |
| 소셜 로그인 (AX-219) | **구현 완료** — PKCE+state, 서명 쿠키(서버 DB 없음), 최소 scope | **OAuth 앱 등록 (운영자)** |
| EVT001–EVT007 계측 | **범위 밖** (ADR-0002 선택지 B) | 판정 운영 로그로 대체 완료. 실사용자 트래픽 발생 시 재검토 |
| 운영·rollback | 설정·문서·kill switch 완료, 배포 가동 중 | rollback 리허설 |
| 다국어 (AX-209) | **구현 완료** — 전 화면 ko/en, 안전 문구 병기 | **영문 검수 (HUMAN)** |
| 개인정보 통제 (AX-210·211) | **구현 완료** — 삭제 수단, `/privacy` 고지 | 책임자·문의처 지정 (HUMAN) |

## 출시 전 차단 항목

코드로 해결할 수 없는 것과 남은 구현을 분리한다.

### 사람 결정·외부 절차 (대부분)

- D01–D09 사람 검토·승인 (전부 `WORKING`)
- 의료·개인정보·보안·위치정보·법무·콘텐츠 signoff — **리드타임이 가장 길다**
- **영문 문구 검수** (AX-209 로 전 화면 영문이 생겼다 — 안전 문구의 의미 동등성)
- `/privacy` 의 개인정보 보호책임자·문의처·분쟁관할 지정
- 데이터 보존기간·분석 동의·개인정보 처리 경계 미승인
- 위치정보 사전검토(문의 2540 답변 대기)와 지도 공급자 미결정
- Figma 정본·디자인 시스템·영문 안전 문구 검수
- 사용자 인터뷰, KPI 목표값, project key, RACI
- Vercel 프로젝트 연결·환경변수·배포 URL
- GitHub Pro 업그레이드 또는 저장소 공개 여부 결정 (branch protection 사용 조건)

### 공모전 차단 항목 (마감 2026-09-21 16:00)

- **배포본 갱신** — Vercel 환경변수 9개 + Google·Kakao OAuth 앱 등록. `docs/DEPLOY_CHECKLIST.md`
- **인증키 확정과 호출 이력 축적** — `npm run usage:weekly` 주 1회. 소급 불가
- 배포 후 서비스 이미지 재캡처 (`npm run capture:images -- <배포 URL>`)
- 기능설명서 인증키 항목 기입 — `docs/FUNCTION_SPEC_DRAFT.md` 의 마지막 🔴

### 남은 구현

- 실기기·스크린리더 검증 (사람 수행) — `docs/DEVICE_TEST_CHECKLIST.md`
- 데이터 보존기간 확정 (AX-104)
- 보호자 기기 화면 `/share` — 게이트웨이 축약 발행은 완료, 화면·동의 범위 설정은 미착수
  (`docs/PRODUCT_DEFINITION.md` 3단계 로드맵)

이 항목은 코드 편의로 우회하지 않으며 `docs/AX_BACKLOG.md`에서 사람 결정 작업과
구현 작업을 분리해 추적한다.

## 관련 문서

- 작업 백로그: `docs/AX_BACKLOG.md`
- 제품 정의(병원 연동 경계): `docs/PRODUCT_DEFINITION.md`
- 내부 API 계약: `docs/API_CONTRACT.md`
- 배포·운영 절차: `docs/DEPLOYMENT.md` · 실행 체크리스트: `docs/DEPLOY_CHECKLIST.md`
- 공모전 제출: `docs/COMPETITION_SUBMISSION.md`
- 라우트 결정: `docs/decisions/0001-route-contract.md` · 인증: `docs/decisions/0004-authentication.md`
