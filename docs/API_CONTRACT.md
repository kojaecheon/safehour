# SafeHour 내부 API 계약 (AX-002 · AX-308 · AX-321)

- 연결: spec 6장(대중형 플랫폼), D04 API007–009, D06 §8 오류 코드, D09 AC001–AC003, ADR-0006·0007·0009·0011
- 계약 테스트: `test/api-contract.test.js`(일정 API), `test/itinerary-request.test.js`, `test/itinerary-service.test.js`,
  `test/ai-intro-route.test.js`, `test/address-search.test.js`, `test/place-api.test.js`, `test/plan-link-route.test.js`,
  `test/auth-session-route.test.js`, `test/route-guard.test.js`, `test/kill-switch.test.js`, `test/decision-log.test.js`
  (계약 변경 시 반드시 함께 수정)
- 상태: v2 (2026-09-20, AX-321에서 코드 기준으로 다시 씀) — 이 문서와 다르게 동작하면 구현 버그다.
- 정본 코드: `app/api/**/route.js`, `lib/server/*.js`(요청 정규화 `itinerary-request.js`, 일정 서비스 `itinerary-service.js`,
  로그인 가드 `route-guard.js`, 운영 스위치 `runtime-flags.js`, 판정 로그 `decision-log.js`, AI 소개 `ai-intro.js`)
- **퇴역**: `POST /api/recommend`, `POST /api/recalculate`, `POST /api/today`(단일 외출 흐름, ADR-0006 · AX-308에서 삭제).
  계약은 아래 일정 API로 바뀌었다. 예전 계약은 이 문서의 git 기록(AX-002 v1)에 남아 있다.

## 공통 계약

- 모든 응답 본문은 `{ ok: boolean, ... }` 형태다. 실패 시 `{ ok: false, errorCode, message, ...추가 필드 }`
  (`lib/server/route-guard.js` `errorResponse`). **모든 오류 응답은 `errorCode` 키를 쓴다** — 예전 `/api/plan/link`의
  `code: 'UNAUTHENTICATED'` 형태는 없어졌다. 추가 필드(`field`·`fields`·`issues`·`reason`)는 필드 경로와 코드만 담고,
  보낸 값은 되돌려 주지 않는다.
- **서버는 상태를 저장하지 않는다.** 계정·체류·조건·일정 저장소가 없다. 일정은 기기에 저장되고(ADR-0009),
  재계획이 필요하면 기기가 저장된 하루 일정을 `previous`로 다시 보낸다.
  - 예외로 남는 서버 쪽 기록: 판정 운영 로그(아래), 관광공사 호출 로그(`logs/tour-api/`, 좌표 매개변수는 `REDACTED`),
    관광공사 응답 캐시(`.cache/tour-api/`, 15분 재사용 — 요청 매개변수가 그대로 들어 있어 **숙소 좌표가 포함된다**).
    둘 다 `SAFEHOUR_DATA_ROOT`(기본 프로젝트 루트) 아래다.
- **로그인 세션이 필요하다.** 아래 표의 '세션' 열이 '필요'인 경로는 세션 쿠키(`safehour.session`, HMAC 서명·12시간)가 없거나
  위조·만료됐거나 `SAFEHOUR_SESSION_SECRET`이 없으면(32자 미만 포함) 본문을 읽기 전에
  `401 { ok: false, errorCode: "SAFEHOUR_AUTH_REQUIRED", message: "로그인이 필요합니다." }`를 돌려준다(`withSession`).
- **허용 목록 밖 필드는 버린다.** 체류는 `PlanStay` 허용 목록만 남기고(이름·주소·전화·병원 안내문·연결 코드는 버린다),
  모르는 최상위 키는 읽지 않는다.
- **좌표는 대한민국 범위만 받는다**(33 < 위도 < 39, 124 < 경도 < 132). 현재 위치류 필드는 허용 목록에 없어 버려진다.
  외부로 나가는 좌표는 사용자가 고른 숙소 좌표(관광공사 위치 기반 목록·기상청 단기예보)뿐이다.
- 병원 안내문 원문·이름·연락처·증상 원문은 일정 요청에 실리지 않는다. 병원 지침은 `/api/plan/link` 응답으로만 나가고 서버에 남지 않는다.
- JSON으로 파싱되지 않거나 객체가 아닌 본문(`null`·배열·문자열·숫자)은 400 `SAFEHOUR_BAD_REQUEST`다.
- `Content-Type`을 검사하지 않는다. 앱 코드에 본문 크기 제한·요청 수 제한은 없다(관광공사 호출 한도만 있다 — 아래).
- 모든 `/api/*` 응답에 `Cache-Control: no-store`와 보안 헤더(`Permissions-Policy`로 geolocation 차단, nosniff,
  `X-Frame-Options: DENY`)가 붙는다(`next.config.mjs`). 모든 라우트는 Node 런타임·동적 렌더링이다.

### 경로 목록

| 메서드·경로 | 세션 | 용도 |
| --- | --- | --- |
| `POST /api/itinerary/plan` | 필요 | 체류 전체(또는 날짜) 하루 일정 생성·재계획·표시 다시 쓰기 |
| `POST /api/itinerary/alternatives` | 필요 | 정거장 교체 후보(최대 5) |
| `POST /api/itinerary/intro` | 필요 | 하루 소개 문장(AI 또는 정해진 문장) |
| `POST /api/address/search` | 필요 | 도로명주소 검색 + 좌표 변환 |
| `POST /api/place` | 필요 | 장소 상세(관광공사 원문 보강) |
| `POST /api/plan/link` | 필요 | 병원 지침 연결(계약 v2, 지금은 데모 병원만) |
| `GET /api/auth/session` | — | 로그인 상태 + 계정 키 |
| `GET /api/auth/login` · `GET /api/auth/callback` · `POST /api/auth/logout` | — | 로그인(ADR-0004) |
| `GET /api/health` | — | 헬스·설정 여부·운영 스위치 |

### 오류 코드

| errorCode | HTTP | 경로 | 언제 |
| --- | --- | --- | --- |
| `SAFEHOUR_AUTH_REQUIRED` | 401 | 세션 필요 경로 전부 | 세션 없음·위조·만료, 세션 키 미설정 |
| `SAFEHOUR_BAD_REQUEST` | 400 | 모든 POST | 본문이 JSON 객체가 아님, 형식이 틀린 필드(`field`로 경로를 알린다). 주소 검색은 `reason` |
| `SAFEHOUR_STAY_INVALID` | 400 | plan, alternatives | 체류 검증 실패(`fields`, `issues: [{ field, code }]`) — 출국일이 입국일보다 빠름, 45박 초과, 숙소 겹침, `PROCEDURE` 없음, 국외 좌표(`OUT_OF_RANGE`) 등 |
| `SAFEHOUR_PLACE_INVALID` | 400 | place | 언어·`contentId`·식별자 형식, 조회할 수 있는 (식별자, 유형 코드) 쌍이 없음(`field`) |
| `SAFEHOUR_PLAN_CODE_REQUIRED` | 400 | plan/link | 연결 코드가 없거나 비어 있음 |
| `SAFEHOUR_PLAN_UNKNOWN_CODE` | 404 | plan/link | 모르는 연결 코드 |
| `SAFEHOUR_PLAN_INVALID` | 422 | plan/link | 지침이 v2 형식이 아님(v1 포함) — 지침 전체를 거부 |
| `SAFEHOUR_ADDRESS_UNAVAILABLE` | 503 | address/search | 도로명주소 키(`JUSO_API_KEY`·`JUSO_COORD_API_KEY`) 중 하나라도 없고 데모 로그인도 꺼짐 |
| `SAFEHOUR_EXTERNAL_API` | 502 | plan, alternatives, address/search, place | 관광공사 국문 목록 조회 실패(키 없음·호출 한도 포함) — 일정을 바꾸지 않는다. 주소 API 실패. 장소 상세의 예상 못 한 예외 |
| `SAFEHOUR_RECALCULATION_FAILED` | 500 | plan, alternatives | 엔진 실패, 변화가 필요한데 전후 비교가 빔(`SilentReplanError`, 규칙 31) |

- 코드 정의: `src/stay/errorCodes.js`(401·400·503 세 코드와 상태), `src/recovery/gateway.js`(지침 연결),
  나머지는 각 라우트·`lib/server/itinerary-service.js`의 상수다.
- 200은 정상 결과다. `NO_TOURISM`·`SERVICE_PAUSED`·교체 후보 0개도 200이다.
- 클라이언트는 상태 코드가 아닌 `ok`·`errorCode`로 분기해도 된다. 상태 코드는 모니터링·게이트웨이 용도의 계약이다.

## POST /api/itinerary/plan

체류 전체(또는 요청 날짜)의 하루 일정을 만든다. 같은 입력이면 같은 일정이다(규칙 28). 판정은 언어와 무관하다(규칙 27).

### 요청

```json
{
  "lang": "ko",
  "stay": { "PlanStay": "아래 허용 목록" },
  "dates": ["2026-10-05"],
  "previous": { "2026-10-05": { "DayPlan": "기기에 저장된 하루 일정" } },
  "edits": { "2026-10-05": { "pinned": ["contentId"], "deleted": ["contentId"], "clearedMeals": ["LUNCH"] } },
  "usedContentIds": ["contentId"],
  "events": [{ "type": "CLOSURE", "closedIds": ["contentId"] }],
  "relabelOnly": false
}
```

| 필드 | 규칙 (앞에서부터 검사, 첫 실패가 응답) |
| --- | --- |
| `lang` | 필수. `ko`·`en`·`ja`·`zh` 중 하나 — 관광 데이터 언어를 고르는 데만 쓴다(ADR-0007) |
| `stay` | 필수. `PlanStay` 허용 목록으로 줄인 뒤 체류 검증 + 대한민국 좌표 범위 → 실패하면 `SAFEHOUR_STAY_INVALID` |
| `dates` | 선택. 날짜(`YYYY-MM-DD`) 배열, 최대 46개. 없으면 체류 전체. 체류 밖 날짜는 조용히 뺀다 |
| `previous` | 선택. 날짜 → 저장된 `DayPlan`(최대 46개, 각 값의 `date`가 키와 같아야 한다). 있으면 최소 변경 재계획과 전후 비교(`delta`)를 한다 |
| `edits` | 선택. 날짜 → `{ pinned?, deleted? }`(각 contentId 최대 100개) · `clearedMeals?`(`LUNCH`·`DINNER`). 다른 키는 버린다 |
| `usedContentIds` | 선택. 요청하지 않은 날짜에 이미 배치된 contentId(최대 2,000개) — 체류 중 1회 규칙(규칙 29) |
| `events` | 선택. 오늘 데모 사건 전체(누적, 최대 50개) — 오늘에만 적용한다. `CLOSURE`(`closedIds` 1–20), `TRAFFIC_SURGE`(`extraMin` 5–120), `APPOINTMENT`(`deltaMin` ±240), `WEATHER`·`PATIENT_RECALL`·`RISK_SIGNAL`(매개변수 없음). 다른 키는 버린다 |
| `relabelOnly` | 값이 정확히 `true`일 때만 켜진다. `previous`의 정거장 **표시 필드만** `lang`으로 다시 채운다 — 게이트·시각·상태는 그대로이고 `delta`가 생기지 않는다(규칙 51) |
| `now` | spec 6장 표에는 있지만 **서버는 읽지 않는다.** 오늘·지금은 서버 시계(KST)로 정한다 |

**`PlanStay` 허용 목록** (`lib/server/itinerary-request.js` `normalizePlanStay`)

```text
PlanStay {
  arrival, departure:  { date, time, airport }            // airport = ICN | GMP
  hasCompanion, interests(최대 16), pace,
  lodgings:     Array<{ id, lat, lng, checkIn, checkOut }>          // 최대 100
  hospitals:    Array<{ id, lat, lng }>                             // 최대 100
  appointments: Array<{ id, hospitalId, type, date, start, end? }>  // 최대 100
  periods:      Array<{ id, source, startDate, endDate, noRestriction?, items, expiresAt?, revoked? }>  // 최대 100
  consent:      { sensitive: boolean }
}
```

- 숙소·병원 좌표는 최상위 `lat`·`lng`로 보낸다(주소 객체는 버리므로 그 안의 좌표는 읽히지 않는다).
- `items`는 조건 항목 키(`outing`·`returnTime`·`walkLimit`·`travelLimit`·`avoidUv`·`avoidHeat`·`avoidWater`·`escortRequired`·
  `guardianMustStay`·`mealRestriction`·`medication`·`diet.{spicy,alcohol,hard,hot,raw}`)만 남기고, 답 객체는
  `kind`·`value`·`time`·`place`·`hospitalId`·`mode`·`until`·`atLodging`만 남긴다(문자열 120자, 배열 24개, 깊이 3단계까지).
- `consent.sensitive`는 `true`이거나 `{ version, agreedAt }`(버전 있음·시각 읽힘)일 때만 참이다.
- 버리는 것: 이름, 주소 객체, 전화, `linkedPlanId`, 병원 일정 `source`, 기간의 `planId`·`planVersion`·`hospitalId`,
  `schemaVersion`, 현재 위치류 필드, 그 밖의 모든 키(규칙 54).

### 응답 (200)

```json
{
  "ok": true,
  "engineVersion": "2.0.0",
  "days": { "2026-10-05": { "DayPlan": "spec 5.2" } },
  "diagnostics": {
    "candidateCount": 42,
    "travelTimeSource": "fallback",
    "weather": { "source": "kma-short-term", "byDate": { "2026-10-05": { "outdoorUnsafe": false } } }
  }
}
```

- `days`: 요청 날짜마다 `DayPlan`(spec 5.2 — `date`·`coverage`·`dayState`·`reasons`·`window`·`lodgingId`·`transportMode`·`effective`·
  `blocks`·`outings`·`guardianOutings`·`mealSlots`·`excluded`·`warnings`·`returnNow`·`delta?`). 외출에는 안전 마감 `returnBy`와
  예상 귀가 `plannedReturnAt`이 함께 있다.
- `diagnostics.candidateCount`: 후보 contentId 수. `travelTimeSource`: 평소 `"fallback"`(추정기), 추천 중단 중 `"none"`.
- `diagnostics.weather.source`: `"kma-short-term"` · `"unavailable"`(키 없음·꺼짐·실패) · `"none"`(오늘~모레 날짜가 없음, 또는 `relabelOnly`).
  `byDate`는 오늘~모레만, `outdoorUnsafe`는 `true`·`false`·`null`(확인 불가 — 판정에 반영하지 않는다).

### 오류

- 401 `SAFEHOUR_AUTH_REQUIRED` · 400 `SAFEHOUR_BAD_REQUEST`(`field`) · 400 `SAFEHOUR_STAY_INVALID`(`fields`, `issues`)
- 502 `SAFEHOUR_EXTERNAL_API` — 관광공사 국문 목록 조회 실패. 일정을 만들지 않는다(기존 일정을 바꾸지 않는다).
  기상 실패는 오류가 아니다(그 날짜들이 확인 불가가 된다).
- 500 `SAFEHOUR_RECALCULATION_FAILED` — 엔진 실패 또는 변화가 필요한데 전후 비교가 빈 경우(규칙 31)

## POST /api/itinerary/alternatives

정거장 하나를 바꿀 후보를 찾는다. 모든 후보는 게이트와 외출 재검증(복귀 계산·보행 누적·이동 한도)을 통과한 것이다(규칙 33).

- 요청: `{ lang, stay, date, outingId, stopId, day, usedContentIds?, edits?, events? }`
  - `lang`·`stay`·`usedContentIds`·`edits`·`events`는 plan과 같은 규칙이다. `now`는 읽지 않는다.
  - `date`: `YYYY-MM-DD`, 체류 날짜여야 한다. `day`: 그 날짜의 저장된 `DayPlan`(`day.date` = `date`).
  - `outingId`·`stopId`: `/^[A-Za-z0-9:._-]{1,120}$/`. 외출은 `day.outings`·`day.guardianOutings`에서 찾고, 정거장은 그 외출 안에 있어야 한다.
- 응답 200: `{ ok: true, alternatives: Array<{ stop, outingPreview }> }` — 최대 5개(`src/engine/alternatives.js`). 바꿀 수 없으면 빈 배열이다.
- 오류: 401, 400 `SAFEHOUR_BAD_REQUEST`(`field`: `date`·`outingId`·`stopId` 등), 400 `SAFEHOUR_STAY_INVALID`, 502 `SAFEHOUR_EXTERNAL_API`,
  500 `SAFEHOUR_RECALCULATION_FAILED`.

## POST /api/itinerary/intro

하루 소개 문장(spec 4.16, ADR-0008, `docs/platform/AI_USE_CASE_INTRO.md`). **판정에 쓰지 않는다.**

- 요청: `{ lang, stops: Array<{ title, category, arriveAt }>, interests?, pace? }` — 이 밖의 필드(조건·병원·숙소·날짜)는 읽지 않고
  외부로 보내지 않는다(규칙 36).
  - `lang` 필수(4개 언어), `stops`는 배열이어야 한다(아니면 400 `field: "stops"`).
  - 정거장은 최대 5개. 제목이 없거나 80자(코드 포인트)를 넘거나 유형이 `LODGING`인 것은 버린다. 유형이 목록 밖이면 `null`,
    `arriveAt`이 `HH:MM`이 아니면 `null`. `interests`는 허용 태그만, `pace`는 `RELAXED`·`NORMAL`만.
- 응답 200: `{ ok: true, text, source: "AI" | "TEMPLATE" }`. 정해진 문장으로 바뀐 이유는 응답에 넣지 않는다.
- **AI를 부르는 조건**: `SAFEHOUR_AI_INTRO`가 정확히 `"1"`이고 `GEMINI_API_KEY`가 있을 때만. 기본은 꺼짐(`TEMPLATE`).
  모델은 `GEMINI_MODEL`(기본 `gemini-3.5-flash-lite`). 키는 `x-goog-api-key` 헤더로만 보내고, 3초 제한·재시도 없음·`store: false`.
- 다음이면 200 `TEMPLATE`으로 바꾼다: 쓸 정거장 없음, 스위치·키 없음, 모델 이름 형식 오류, 시간 초과, 네트워크·HTTP 오류,
  응답 형식 오류·차단·미완성, 출력 검사 실패(빈 문장, 200자 초과, 언어와 다른 문자, 안전·의료·영업 중·보장·순위·가격 금지 표현 — `lib/server/ai-intro-checks.js`).
- 오류: 401, 400 `SAFEHOUR_BAD_REQUEST`(`field`: `body`·`lang`·`stops`).

## POST /api/address/search

도로명주소 검색 + 좌표 변환(spec 6장, ADR-0009 · `src/adapters/juso.js`). 병원 목록을 보여주지 않으려고 사용자가 입력한 검색어로만 찾는다.

- 요청: `{ keyword }` — NFC 정규화·공백 정리 후 2–60자. `%=<>[]`, SQL 예약어 낱말, 제어 문자가 있으면 거부한다.
  `lang`은 spec 6장 표에 있지만 **서버는 읽지 않는다**(결과는 늘 한국어 도로명주소다).
- 응답 200: `{ ok: true, results }` — 최대 10개.
  - 실제 결과 `{ roadAddress, jibunAddress?, buildingName?, lat, lng, source: "JUSO" }`. 행정안전부 좌표 API의 UTM-K(GRS80) 좌표를
    서버에서 WGS84로 바꾼다(`src/adapters/utmk.js`, 알려진 지점 10m 이내). 좌표가 없거나 국외인 결과는 뺀다.
  - 데모 결과 `{ roadAddress, buildingName, lat, lng, source: "DEMO" }` — 이름·주소가 모두 '데모'로 시작한다(`src/adapters/demoAddresses.js`).
- 키: `JUSO_API_KEY`(검색)와 `JUSO_COORD_API_KEY`(좌표) **둘 다** 있어야 실제 검색을 한다. 키는 요청 본문(POST 폼)으로만 보낸다.
  - 하나라도 없고 데모 로그인(`SAFEHOUR_ALLOW_DEMO_LOGIN=1`)이 켜져 있으면 데모 주소를, 꺼져 있으면 503 `SAFEHOUR_ADDRESS_UNAVAILABLE`을 돌려준다.
- 오류: 401 · 400 `SAFEHOUR_BAD_REQUEST`(`reason`: `BODY`·`KEYWORD_LENGTH`·`KEYWORD_CHARS`·`KEYWORD_REJECTED`) ·
  503 `SAFEHOUR_ADDRESS_UNAVAILABLE` · 502 `SAFEHOUR_EXTERNAL_API`(그 밖의 주소 API 오류, 8초 시간 초과, 네트워크).

## POST /api/place

장소 상세 보강(D04-F009). 일정 판정에 영향을 주지 않는다. 운영 시간 원문을 영업 여부로 해석하지 않는다.

- 요청(`Stop`과 같은 형식): `{ lang, contentId, sourceIds: { ko?, en?, ja?, zh? }, contentTypeIds: { canonical?, ko?, en?, ja?, zh? } }`
  - 예전 `{ candidate: { sourceIds.korean/english, sourceMetadata } }` 형식은 받지 않는다.
  - `contentId`는 숫자 1–12자리여야 하지만 조회에는 쓰지 않는다. 조회는 언어별 (`sourceIds`, `contentTypeIds`) 쌍으로 한다.
    `contentTypeIds.canonical`과 `sourceIds.barrierFree`는 읽지 않는다.
  - 언어: 국문 + 선택 언어 서비스. 선택 언어(ja·zh)가 없거나 실패하면 영문, 그래도 없으면 국문이다.
- 응답 200: `{ ok: true, details }` — `overview`, `overviewLanguage`, `address`, `homepage`, `telephone`, `operatingSchedule`(원문),
  `openNow`(늘 `null`), `openNowReason`(`UNVERIFIED_SCHEDULE_TEXT`·`SCHEDULE_NOT_PROVIDED`), `images[]`(URL·저작권 구분 — 내려받지 않는다),
  `sources[]`, `errors[]`(부분 실패를 숨기지 않는다, D06-E010), `original`.
  - 관광공사 개별 호출 실패(키 없음·한도 포함)는 200 + `details.errors`로 돌아온다.
- 오류: 401 · 400 `SAFEHOUR_BAD_REQUEST`(`field: "body"`) · 400 `SAFEHOUR_PLACE_INVALID`(`field`) · 502 `SAFEHOUR_EXTERNAL_API`(예상 못 한 예외).

## POST /api/plan/link

병원 지침 연결 — 계약 v2(spec 5.3, ADR-0011). 지금은 데모 어댑터뿐이다.

- 요청: `{ code }` — 앞뒤 공백·모든 공백을 지우고 대문자로 맞춘다. 데모 코드: `DEMO`·`DEMO-A`(표준 지침), `DEMO-B`(외출 불가 → 실내만),
  `DEMO-C`(1시간 전 만료). 모두 `demo: true`이고 날짜는 한국 날짜 기준 오늘에 맞춰 만든다.
- 응답 200: `{ ok: true, plan }` — 게이트웨이가 허용 목록으로 줄인 v2 지침:
  `schemaVersion`(2)·`planId`·`version`·`issuedAt`·`updatedAt`·`expiresAt`·`revoked`·`demo`, `issuer { name, role }`,
  `hospital { name, phone?, address { roadAddress, lat, lng } }`, `periods[] { startDate, endDate, items }`,
  `appointments[] { type, date, start, end }`, `instructions[] { id, category, lang, text, updatedAt, acknowledged }`.
  - 원문 `returnTime.place = "HOSPITAL"`에는 `hospitalId`가 없다(발행 병원을 뜻한다). 연결 병원 id로 채우는 일은 기기 쪽 변환이 한다(규칙 57).
  - 병원 안내문(`instructions`)은 표시 전용이다. 번역·요약하지 않고 판정에 쓰지 않는다.
- 오류(`field` 없음): 401 · 400 `SAFEHOUR_BAD_REQUEST`(본문을 못 읽음) · 400 `SAFEHOUR_PLAN_CODE_REQUIRED` ·
  404 `SAFEHOUR_PLAN_UNKNOWN_CODE` · 422 `SAFEHOUR_PLAN_INVALID`(v1 포함 — 검증 오류 목록은 돌려주지 않는다, 규칙 48).

## GET /api/auth/session

- 응답 200: `{ ok: true, authenticated, provider, expiresAt, accountKey, auth }` (`no-store`)
  - 로그인 안 함: `authenticated: false`, `provider`·`expiresAt`·`accountKey`는 `null`.
  - `accountKey`: 불투명한 계정 키(base64url 43자) — 공급자 식별자와 세션 키로 만든 HMAC-SHA256이다. 되돌릴 수 없고,
    기기 저장소의 계정 이름공간(`safehour.v2.<accountKey>.*`)에만 쓴다(ADR-0009). 공급자 식별자(`subject`)는 돌려주지 않는다.
    `SAFEHOUR_SESSION_SECRET`을 바꾸면 같은 사람도 다른 계정 키를 받는다.
  - `auth`: `{ ready, sessionSecretConfigured, callbackConfigured, demoLogin, providers: [{ id: "google"|"kakao", configured }] }`.
- 로그인 경로(ADR-0004): `GET /api/auth/login?provider=google|kakao|demo&returnTo=/경로`(303, 데모는 `SAFEHOUR_ALLOW_DEMO_LOGIN=1`일 때만),
  `GET /api/auth/callback`(303), `POST /api/auth/logout`(200 `{ ok: true, authenticated: false }`, 세션 쿠키 삭제).

## GET /api/health

- 응답 200: `{ ok: true, service: "safehour", checkedAt, config, flags }`. 세션이 필요 없다. 키 값은 넣지 않는다.
  - `config`: `{ tourApiKeyConfigured, weatherApiKeyConfigured, weatherKeySource: "KMA_API_KEY" | "TOUR_API_KEY" }`
  - `flags`: `{ recommendationKilled }` — 추천 중단 스위치 상태

## 추천 중단 스위치 (`servicePaused`)

- 환경변수 `SAFEHOUR_KILL_RECOMMENDATION`이 `1`·`true`·`on`(대소문자·앞뒤 공백 무시)이면 켜진다. 요청마다 읽는다(`lib/server/runtime-flags.js`).
- 영향 경로: `/api/itinerary/plan`, `/api/itinerary/alternatives`. 요청 검증(401·400)은 그대로 하고, 외부 호출·판정 전에 멈춘다.
- plan: `200 { ok: true, engineVersion, days, diagnostics: { candidateCount: 0, travelTimeSource: "none", weather: { source: "none", byDate: {} } }, servicePaused: true }`
  - 요청 날짜마다 정거장 0개, `dayState: "NO_TOURISM"`, `reasons: ["SERVICE_PAUSED"]`, `window: null`, 식사 칸 둘 다 `NOT_APPLICABLE` + `SERVICE_PAUSED`(규칙 34).
  - `relabelOnly`도 무시한다. 오늘 환자 호출 데모 사건이나 이전 `returnNow`가 있으면 `returnNow`는 유지된다.
- alternatives: `200 { ok: true, alternatives: [], servicePaused: true, days }`.
- 오류 화면이 아니라 정상 미추천 결과로 보인다. 긴급 연락·한국어 카드·조건 화면은 계속 동작한다(서버를 부르지 않는다).
- `/api/health`의 `flags.recommendationKilled`로 상태를 확인한다.

## 판정 운영 로그 (ADR-0002 → ADR-0006 확장)

일정 생성·교체 후보 요청 한 번에 stdout JSON 한 줄(`lib/server/decision-log.js`). 로그 실패가 요청을 막지 않는다.

| 필드 | 내용 |
| --- | --- |
| `evt` | `"decision"` |
| `route` | `"itinerary.plan"` · `"itinerary.alternatives"` |
| `outcome` | `"DECIDED"` · `"PAUSED"`(추천 중단) · `"FAILED"`(502·500) |
| `engine` | 엔진 버전 |
| `lang` | `ko`·`en`·`ja`·`zh`, 그 밖은 `"unknown"` |
| `dateCount` | 요청 날짜 수 |
| `dayStates` | 상태별 날짜 수 `{ NO_TOURISM, STANDBY, SPLIT_NEARBY, TOGETHER }` |
| `reasons` | 사유 코드 집합(정렬, 알려진 `REASON`만) |
| `provenance` | 합성 값 출처 종류별 개수 `{ SELF, HOSPITAL, DEFAULTED }` |
| `errorCode` | 실패 때만, `SAFEHOUR_*` 형식만 |
| `ms` | 처리 시간 |

- **남기지 않는 것**: 좌표, 날짜, 장소 이름, 주소, 조건 값, 계정 키, 병원 정보, 숙소·체류 id, 외부 오류 원문, URL, 키(규칙 35).
- 400·401 응답과 교체 후보의 `RangeError` → 400 경로는 로그를 남기지 않는다. 교체 후보 로그의 `dayStates`는 요청한 하루 기준이다.
- 그 밖의 서버 로그는 분류 코드만 남긴다(예: `[itinerary.plan] candidate load failed: SAFEHOUR_EXTERNAL_API`,
  `[address] search failed: HTTP_500`, `[ai-intro] template fallback: TIMEOUT` — AI가 꺼져 있으면 아무것도 남기지 않는다).

## 관광공사 호출 한도

- `service.operation`별 한국 날짜 하루 호출 수를 센다. `TOUR_API_WARNING_AT`(기본 800)부터 경고, `TOUR_API_DAILY_LIMIT`(기본 1,000)에서 차단한다
  (`src/tour-api/config.js`, 잘못된 값은 기본값, 경고 값이 차단 값보다 크면 차단 값으로 맞춘다). 차단되면 plan·alternatives는 502다.

## 멱등성·동시성 (D04 API007–009)

- **결정성**: 같은 요청(같은 `previous`·`edits`·`events`)이면 같은 하루 일정이다(규칙 28). 같은 사건 목록을 다시 보내도
  효과가 두 번 더해지지 않는다 — 오늘 사건은 받은 목록 전체를 처음부터 접어 한 번에 적용한다(규칙 55). 판정 기준 시각은
  서버 수신 시각이라 시간이 지나 달라지는 차이(지난 정거장·오늘 창)는 허용된다.
- **동시성**: 서버가 상태를 저장하지 않으므로 서버 쪽 경쟁 조건이 없다. 기기(`lib/trip/runtime.js`)는 일정 API 작업을 한 줄 대기열로
  차례대로 보내고, 요청의 `previous`는 늘 가장 최근 저장 일정이다. 요청 도중 계정이 바뀌거나 체류가 지워졌으면 응답을 저장하지 않는다.
- **접근 통제**: 세션이 필요하다. 요청 본문은 사용자 자신의 기기 데이터라 위조해도 그 사용자 화면에만 영향을 준다.
