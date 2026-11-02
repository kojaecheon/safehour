# SafeHour

성형외과·피부과 수술·시술을 받으러 온 외국인 환자와 동반 보호자 1명에게
입국부터 출국까지 날짜별 하루 일정(관광지·쇼핑·카페·맛집)을 만들어 주는 모바일 웹입니다.
일정은 병원이 발행한 조건이나 환자가 확인한 주의사항(본인 체크)을 어기지 않는 범위에서만 만들고, 복귀 마감을 함께 보여줍니다.
SafeHour는 증상이나 회복 단계를 해석해 의료 판단을 하지 않습니다.

> 이 브랜치는 **대중형 체류 동반 플랫폼 1차**(`docs/platform/`, ADR-0005–0011)입니다.
> 공모전 심사(최종 심사 2026-10-28, 시상 2026-11-05)가 끝날 때까지 main 병합·운영 배포를 하지 않습니다 —
> 현재 `safehour.vercel.app`은 공모전 제출본(단일 외출 흐름)입니다.

## 현재 구현 범위

대중형 플랫폼 1차 범위(spec 1.1)를 구현했습니다.

1. 로그인(Google·Kakao, 데모) → 체류 설정(입·출국, 날짜별 숙소, 병원·병원 일정, 동반 보호자, 관심사·이동 강도) — 위치는 도로명주소 검색
2. 민감정보 동의 → 조건 기간 입력(본인 체크, 정해진 항목의 예/아니오/모르겠음) 또는 병원 코드 연동(데모 병원 A/B/C)
3. 날짜별 조건 합성(항목별 엄격한 값)과 날짜 분류, 입국~출국 전체 하루 일정 자동 생성·확정
4. 매일 확인, 변화 감지 시 자동 재계획과 전후 비교, 즉시 복귀 시트, 데모 사건 6종
5. 일정 편집(교체 후보 최대 5곳·삭제·식사 칸 비우기·다시 만들기)
6. 관광공사 국문·무장애 + 선택 언어(영·일·중) 후보, 식이·열·물·휴무 필터, 장소 상세 보강
7. 보호자 일정(같은 기기)과 PIN 잠금 공유 링크, 한국어 안내 카드, 긴급 연락, 목적지 전용 지도 링크, 기기 알림
8. 한국어·영어·일본어·중국어(간체), 홈 화면 설치·보기 전용 오프라인 화면, AI 일정 소개 문장(기본 꺼짐)
9. 밝은 여행앱 디자인 시스템과 시안 보드(`/design-board`)

서버는 상태를 저장하지 않습니다 — 체류·조건·일정은 기기에만 저장하고(계정 이름공간), 출국 7일 후 첫 실행 때 지웁니다.
현재 위치(GPS)는 쓰지 않으며, 기준 좌표는 사용자가 고른 숙소·병원 고정 좌표뿐입니다.

## 실행

Node.js 20.9 이상이 필요하며 로컬·CI 권장 버전은 Node.js 22입니다. `.env.example`을 참고하여 `.env.local`에
환경변수를 저장한 뒤 실행합니다. 설치는 잠금 파일 그대로(`npm ci`) 합니다.

| 환경변수 | 필요 | 없을 때 |
| --- | --- | --- |
| `TOUR_API_KEY` | 일정 생성 | 일정 API가 502 `SAFEHOUR_EXTERNAL_API` |
| `SAFEHOUR_SESSION_SECRET`(32자 이상) | 로그인 전체 | 로그인 불가 → 모든 일정·주소·장소·지침 API가 401 |
| `SAFEHOUR_BASE_URL`, `GOOGLE_CLIENT_ID/SECRET`, `KAKAO_CLIENT_ID/SECRET` | 소셜 로그인(콜백 주소·공급자) | 해당 공급자 비활성(데모 로그인은 영향 없음) |
| `SAFEHOUR_ALLOW_DEMO_LOGIN=1` | 데모 로그인·데모 주소(시연·E2E 전용) | 꺼짐 — 운영에서 켜지 않는다 |
| `KMA_API_KEY` | 기상(선택) | 비우면 `TOUR_API_KEY`로 시도, 공백·`off`면 끔 → '확인 불가'(판정 미반영) |
| `JUSO_API_KEY`, `JUSO_COORD_API_KEY` | 도로명주소 검색 | 503 `SAFEHOUR_ADDRESS_UNAVAILABLE`(데모 로그인이면 데모 주소) |
| `SAFEHOUR_AI_INTRO=1` + `GEMINI_API_KEY`, `GEMINI_MODEL`(선택) | AI 소개 문장(승인 후) | 정해진 문장(TEMPLATE) |
| `NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA` / `_ZH` | 일·중 안전 문구 표시(빌드 때, 검수 후 `1`) | 일·중 사용자에게 안전 문구를 영어 + 한국어로 |
| `TOUR_API_WARNING_AT`, `TOUR_API_DAILY_LIMIT` | 관광공사 호출 경고·차단(선택) | 800 / 1,000 |
| `SAFEHOUR_KILL_RECOMMENDATION` | 추천 중단 스위치(운영 사고 때 `1`) | 꺼짐 |

```bash
npm ci
npm run dev
```

로컬 품질 기준선은 다음 한 명령으로 확인합니다.

```bash
npm run check
```

실데이터 검증은 API 키와 공공데이터포털 활용 신청이 준비된 환경에서만 실행합니다.

```bash
npm run test:tour-api
npm run analyze:gangnam
```

## 모바일 웹

Next.js 기반 모바일 웹이 일정 엔진 위에 올라가 있습니다.

```bash
npm ci
npm run dev
```

**흐름**: `/` 시작(언어·고지) → `/login` 로그인 → `/onboarding` 체류 설정 → `/conditions` 동의 → 본인 체크 기간 입력
또는 `/link` 병원 코드 연결 → 전체 일정 생성 → `/today` 오늘. 하단 내비 4개는 **오늘**(`/today`) · **일정**(`/trip`,
날짜별 `/trip/{YYYY-MM-DD}`, 장소 `/place/{id}`) · **조건**(`/conditions`, `/link`, `/guide`) · **더보기**(`/more` →
`/cards` 한국어 카드, `/guardian` 보호자 링크, `/settings`, `/privacy`)입니다. `/emergency` 긴급 연락 버튼은 모든 화면에
고정되고, `/g`는 보호자 링크 열기(PIN)입니다. `/design-board`는 내비에 없는 시안 보드입니다.
퇴역한 `/plan`·`/result`는 `/today`로 보냅니다(ADR-0006). 화면 목록과 상태는 `docs/platform/IA_AND_FLOWS.md`.

- **조건**: 병원 발행 **또는** 동의 후 본인 체크(정해진 항목만, 자유 서술 없음). 겹치는 기간은 항목별로 엄격한 값을 쓴다 —
  규칙은 `docs/platform/ITINERARY_RULES.md`, 결정은 ADR-0005·0011
- **내부 API**(계약: `docs/API_CONTRACT.md`): `POST /api/itinerary/plan`(일정 생성·재계획·표시 다시 쓰기),
  `POST /api/itinerary/alternatives`(교체 후보), `POST /api/itinerary/intro`(소개 문장), `POST /api/address/search`(도로명주소),
  `POST /api/place`(장소 상세), `POST /api/plan/link`(병원 지침 v2), `GET /api/auth/session`(로그인 상태·계정 키),
  `GET /api/health`, `/api/auth/*`(로그인). 로그인 세션이 없으면 401 `SAFEHOUR_AUTH_REQUIRED`
- 로그인은 **Google·Kakao**이며 서버 DB가 없습니다 — PKCE + 서명 쿠키 세션(`docs/decisions/0004-authentication.md`)
- 서버는 무상태 계산기입니다 — 기기가 저장된 일정을 `previous`로 보내 재계획하고, 결과를 기기에 저장합니다(ADR-0009)
- **병원 안내문 원문은 판정에 쓰지 않고 번역·요약하지 않습니다.** 일정 요청에도 실리지 않습니다
- 현재 GPS는 사용하지 않습니다. 지도 링크는 목적지 이름·좌표만 넘깁니다(ADR-0010)
- **한국어·영어·일본어·중국어(간체)**를 지원합니다. 일·중 안전 문구는 검수 전까지 영어 + 한국어로 보입니다(ADR-0007)
- 이 기기의 데이터는 **"이 기기에서 내 정보 지우기"**(설정)로 즉시 지울 수 있고, 출국 7일 후 첫 실행 때 자동으로 지워집니다
## E2E

대중형 흐름(spec 12.3)을 360px 기준으로 검증합니다. 외부 API에 의존하지 않습니다 —
`scripts/seed-e2e-cache.mjs`가 데모 숙소 기준점 3곳(기준점마다 3km 안 71곳)의 TourAPI 캐시를 미리 심어
실제 호출 경로가 캐시에 적중하므로, 일정 엔진·정규화·API 라우트는 실제 코드가 그대로 실행됩니다.

**외부 호출 0건은 두 겹으로 강제합니다.** 서버는 `e2e/network-guard.cjs`(NODE_OPTIONS 로 선적재)가
루프백 밖 연결을 거부하고 기록하며, 브라우저는 `e2e/fixtures.js`가 127.0.0.1 밖 요청과 현재 위치 요청을
막고 기록합니다. 기록이 한 줄이라도 생기면 그 테스트가 실패합니다.

```bash
npm run build
npm run e2e
```

62건 / 13개 파일입니다(2026-09-21 기준). 체류는 실행 시점의 한국 날짜를 기준으로 만들어지므로,
`오늘`의 활동 시간(09:00–21:00)이 이미 지난 시각에 돌리면 '다음 장소 휴무' 데모 사건 1건은
걸 수 없어 건너뜁니다(테스트가 이유를 남깁니다).

| 시나리오 (spec 12.3, 360px, 가짜 데이터, 외부 호출 0건) | 파일 | 건수 |
| --- | --- | --- |
| 1. 로그인(데모) → 체류 설정 → 동의 → 본인 체크 → 전체 일정 → 오늘 | `e2e/core-flow.spec.js` | 2 |
| 2. 매일 확인 전 제한과 확인 후 해제 | `e2e/core-flow.spec.js` | 2 |
| 3. 데모 사건 → 자동 대체와 전후 비교 | `e2e/demo-events.spec.js` | 3 |
| 4. 교체·삭제·다시 만들기 | `e2e/editing.spec.js` | 5 |
| 5. 데모 병원 연동 A/B/C | `e2e/hospital-link.spec.js` | 4 |
| 6. 보호자 링크 만들기와 PIN으로 열기 | `e2e/guardian.spec.js` | 2 |
| 7. 로그인 만료·오프라인에서 긴급·카드·오늘 보기 | `e2e/offline.spec.js` | 2 |
| 8. `ja`·`zh` 안전 문구 대체와 언어 바꾸기 | `e2e/i18n.spec.js` | 6 |
| 9. 현재 위치 요청 0건과 가로 스크롤 없음(320·360·1280px) | `e2e/responsive.spec.js` · `e2e/network.spec.js` | 2 · 1 |
| 10. 새 화면 axe AA 위반 0건, 키보드, 200% 확대, 44px 터치 | `e2e/accessibility.spec.js` | 12 |
| 11. `/design-board` 렌더링 | `e2e/design-board.spec.js` | 2 |
| 지도 링크는 목적지만(규칙 39) | `e2e/editing.spec.js` | 1 |
| 개인정보 고지와 '내 정보 지우기'(규칙 41) | `e2e/privacy.spec.js` | 3 |
| 로그인 화면과 세션 API(계정 키·쿠키) | `e2e/login.spec.js` | 8 |
| 외부 호출 0건 장치·API 로그인 가드·퇴역 경로(규칙 54) | `e2e/network.spec.js` | 7 |

## 배포와 운영

Vercel 배포 절차, 환경변수, **추천 전면 중단 kill switch**, 롤백 기준은
`docs/DEPLOYMENT.md`에 있습니다.

위험한 추천이 발견되면 코드 배포를 기다리지 않고 환경변수
`SAFEHOUR_KILL_RECOMMENDATION=1`로 즉시 전체를 미추천으로 전환할 수 있습니다.
일정 API는 모든 날짜를 정거장 없이 `NO_TOURISM` + `SERVICE_PAUSED`로 돌려주고(`servicePaused: true`),
사용자에게는 오류가 아니라 정상 미추천 결과로 표시됩니다. 긴급 연락·한국어 카드는 계속 동작합니다.
배포본 수동 점검은 `npm run verify:deploy -- https://<배포주소>`입니다(데모 로그인이 켜진 배포본에서만 일정 API 스모크를 합니다).

## TourAPI 연결 검증

검증 대상:

- 국문 관광정보 `KorService2/areaBasedList2`
- 영문 관광정보 `EngService2/areaBasedList2`
- 무장애 여행정보 `KorWithService2/areaBasedList2`
- 무장애 상세정보 `KorWithService2/detailWithTour2`
- 국문·영문 상세 `detailCommon2`, `detailIntro2`, `detailImage2`

응답 원본과 검증 요약은 `artifacts/api-smoke/`에 저장됩니다. 이 디렉터리는 Git에서 제외됩니다.

API 인증키는 호출 로그에 기록하지 않습니다. 일별·오퍼레이션별 호출 수는
`logs/tour-api/`에 남고 800회부터 경고하며, 자체 한도 1,000회에서 추가 호출을 차단합니다.

## 문서

- [AX 개발 워크플로우](docs/AX_WORKFLOW.md)
- [개발 준비 상태와 명세 추적표](docs/DEVELOPMENT_READINESS.md)
- [우선순위 백로그](docs/AX_BACKLOG.md)
- [내부 API 계약](docs/API_CONTRACT.md)
- [배포·운영 절차](docs/DEPLOYMENT.md)
- [결정 기록 (ADR)](docs/decisions/) — 라우트·계측·다국어·인증(0001–0004), 대중형 플랫폼(0005–0011)
- 대중형 플랫폼 기획: [제품 정의 v3](docs/platform/PRODUCT_DEFINITION_V3.md) · [화면·흐름](docs/platform/IA_AND_FLOWS.md) ·
  [일정 규칙과 기본값](docs/platform/ITINERARY_RULES.md) · [디자인 시스템](docs/platform/DESIGN_SYSTEM.md) ·
  [AI 사용 문서](docs/platform/AI_USE_CASE_INTRO.md) · [사람이 해야 할 일](docs/platform/HUMAN_ACTIONS.md)
- [기능정의서 — 환자·보호자 플랫폼](docs/PRODUCT_DEFINITION.md)
- [공모전 제출 준비](docs/COMPETITION_SUBMISSION.md)
- [해시태그와 기능 매핑](docs/HASHTAG_MAP.md)
- [전문 승인 체크리스트](docs/SIGNOFF_CHECKLIST.md)
- [공공 API 활용표와 화면 대응](docs/API_USAGE_TABLE.md)
- [구현 방향과 다음 단계](docs/IMPLEMENTATION_DIRECTION.md)
- [TourAPI 연결 검증](docs/TOUR_API_VALIDATION.md)
- [강남 고정좌표 데이터 분석](docs/GANGNAM_DATA_ANALYSIS.md)
- [실데이터 판정·재계산 증빙](docs/LIVE_SCENARIO_EVIDENCE.md) (공모전 당시 기록. 만든 스크립트와 단일 외출 엔진은 2026-11-03 지웠다)
