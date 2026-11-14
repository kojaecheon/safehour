# 외부에 약속한 것

이 시스템의 소비자는 **이 앱의 브라우저 클라이언트 하나**다. 서버가 무상태 계산기라서 요청 본문이 곧
판정 입력의 거의 전부다. 본문 모양이 어긋나면 판정이 조용히 달라진다.

## 공통

- 모든 응답은 `{ ok: true, ... }` 또는 `{ ok: false, errorCode, message }` 형태다.
- 오류 식별자 키는 **항상 `errorCode`**다. 다른 이름을 쓰지 않는다.
- 서버는 상태를 저장하지 않는다. 같은 날 같은 요청을 다시 보내면 같은 응답이 온다 — 다만 '오늘'과
  '지금'은 서버 시계가 정하므로 날짜가 바뀌면 결과도 바뀐다.
- 예외는 서버 알림 경로(아래 '서버 알림')다. 스위치가 켜졌을 때만 ADR-0012의 네 레코드를 저장한다. 지금은 스위치가
  꺼진 채 들어와 있다.
- **허용 목록 밖 필드는 조용히 버린다.** 오류로 만들지 않는다 — 클라이언트가 실수로 더 보내도
  서버가 지워주는 것이 목적이기 때문이다.
- 좌표는 대한민국 범위 안만 받는다. 현재 위치류 필드는 버린다.
- **'오늘'과 '지금'은 서버 시계(한국 표준시)가 정한다.** 요청 본문에 `now`를 넣어도 서버는 읽지 않는다.
  클라이언트가 보낸 시각을 믿으면 '오늘'을 옮겨 매일 확인 게이트와 지난 날짜 보호를 우회할 수 있다.
  판정 엔진 자체는 현재 시각을 인자로 받는 결정적 함수이고, 그 값을 서버가 채워 넣는다.
- 로그인 세션이 필요한 경로는 판정·데이터 경로 여섯 개다: 일정, 교체 후보, 소개 문장, 주소 검색,
  장소 상세, 지침 연결. 세션이 없으면 **401**과 `errorCode: "SAFEHOUR_AUTH_REQUIRED"`다.
  `/api/health`와 `/api/auth/*`(로그인·콜백·로그아웃·세션 조회)는 가드가 없다 — 세션 조회는
  "로그인했는가"를 알려주는 것이 일이라 가드를 씌울 수 없다.
- 서버 알림 경로는 세션 말고 쓰기 토큰·`watchId`·`subId`·예약 서명으로도 권한을 본다. 경로별 권한은 '서버 알림'의 표를 따른다.

| 오류 코드 | 상태 | 뜻 |
| --- | --- | --- |
| `SAFEHOUR_AUTH_REQUIRED` | 401 | 세션이 없거나 만료됐다 |
| `SAFEHOUR_BAD_REQUEST` | 400 | 요청 본문이 계약에 맞지 않는다 |
| `SAFEHOUR_STAY_INVALID` | 400 | 체류 자체가 규칙을 어긴다 — 날짜 역순, 45박 초과, 수술·시술 일정 없음, 숙소 날짜 겹침, 대한민국 밖 좌표, 체류 필드 형식 오류 |
| `SAFEHOUR_ADDRESS_UNAVAILABLE` | 503 | 주소 검색 키가 없다 |
| `SAFEHOUR_EXTERNAL_API` | 502 | 외부 데이터 제공자 호출이 실패했다(키 없음·호출 한도 포함). 일정 경로에서는 일정을 만들지 않고 기존 일정도 바꾸지 않는다 |
| `SAFEHOUR_PLACE_INVALID` | 400 | 장소 상세 요청의 장소 식별자·유형 조합이 올바르지 않다 |
| `SAFEHOUR_RECALCULATION_FAILED` | 500 | 판정을 시작했으나 끝내지 못했다 |
| `SAFEHOUR_PLAN_CODE_REQUIRED` | 400 | 연결 코드가 없다 |
| `SAFEHOUR_PLAN_UNKNOWN_CODE` | 404 | 그런 연결 코드가 없다 |
| `SAFEHOUR_PLAN_INVALID` | 422 | 지침이 계약을 어겼다(형식 오류, 기간 날짜 역순 등) — 지침 전체를 거부한다 |
| `SAFEHOUR_SERVER_PUSH_OFF` | 503 | 서버 알림이 꺼져 있다(스위치 꺼짐, 차단 스위치 켜짐, 필요한 환경변수 없음) |
| `SAFEHOUR_SERVER_PUSH_UNAVAILABLE` | 503 | 서버 알림 저장소나 예약 업체의 일시 장애, 또는 다시 불러야 하는 예약 처리 |
| `SAFEHOUR_WATCH_NOT_FOUND` | 404 | 지켜보기를 찾지 못했다(모르는 id, 만료, 틀린 토큰, 남의 id, 틀린 `subId`를 구분하지 않는다) |
| `SAFEHOUR_RATE_LIMITED` | 429 | 서버 알림 경로의 횟수 제한, 재등록·동시 지켜보기 한도를 넘었다 |

## 판정 요청에 실리는 체류 (`PlanStay`)

일정·교체 후보 요청이 공통으로 쓰는 모양이다. **이 목록 밖 필드는 버려진다.**

```
PlanStay {
  arrival:      { date, time, airport: "ICN" | "GMP" }
  departure:    { date, time, airport: "ICN" | "GMP" }
  hasCompanion: boolean
  interests:    string[]        // SHOPPING KBEAUTY PALACE_HISTORY CAFE EXHIBITION FOOD NATURE FESTIVAL
  pace:         "RELAXED" | "NORMAL"
  lodgings:     Array<{ id, lat, lng, checkIn, checkOut }>
  hospitals:    Array<{ id, lat, lng }>
  appointments: Array<{ id, hospitalId, type: "PROCEDURE" | "VISIT", date, start, end? }>
  periods:      Array<{ id, source: "SELF" | "HOSPITAL", startDate, endDate,
                        noRestriction?, items, expiresAt?, revoked? }>
  consent:      { sensitive: boolean }
}
```

이름·주소 글자, 전화번호, 병원 안내문, 연동 코드는 **보내지 않는다.** 좌표와 조건 값만으로 판정이
끝나도록 설계돼 있다.

## `POST /api/itinerary/plan`

하루 일정을 만든다. 이 제품의 판정 경로는 이것 하나다.

**입력**

```
{ lang, stay: PlanStay,
  dates?: string[],                    // 없으면 체류 전체
  previous?: Record<date, DayPlan>,    // 있으면 날짜별 전후 비교를 채운다
  edits?: { [date]: { pinned, deleted, clearedMeals } },
  usedContentIds?: string[],           // 요청하지 않은 날짜에 이미 배치된 장소 (중복 방지)
  events?: DemoEvent[],                // 오늘에만 적용
  relabelOnly?: boolean }              // true 면 previous 의 표시 필드만 lang 으로 다시 채운다
```

**출력**

```
{ ok: true, engineVersion,
  days: Record<date, DayPlan>,
  diagnostics: { candidateCount, travelTimeSource, weather } }
```

`relabelOnly`가 참이면 게이트·시각·상태를 건드리지 않고 이름·주소·번역 표시만 새 언어로 바꾼다.
전후 비교를 만들지 않는다. 언어를 바꿨다는 이유로 판정이 달라지면 안 되기 때문이다.

**하루 일정(`DayPlan`)이 담는 것**

| 필드 | 값 |
| --- | --- |
| `coverage` | `FREE` `DECLARED_FREE` `RESTRICTED` `REST_DAY` `NEEDS_INPUT` |
| `dayState` | `NO_TOURISM` `STANDBY` `SPLIT_NEARBY` `TOGETHER` |
| `reasons` | 사유 코드 배열. 상태와 항상 함께 온다 |
| `window` | `{ start, end }` 또는 `null` |
| `lodgingId`, `transportMode` | 기준 숙소와 `TAXI` / `TRANSIT` |
| `effective` | 항목별 `{ value, provenance: [{ periodId, source, defaulted }] }` |
| `blocks` | 병원 일정·복약 고정 블록 |
| `outings`, `guardianOutings` | 환자·보호자 외출 |
| `mealSlots` | 칸별 `FILLED` `NONE_AVAILABLE` `CLEARED` `NOT_APPLICABLE` |
| `excluded` | 빠진 후보와 그 사유 |
| `warnings` | `MEDICATION_TIMES_MISSING` `DEFAULTS_APPLIED` `TRAVEL_TIMES_ESTIMATED` |
| `returnNow` | 즉시 복귀 상태 |
| `delta` | 마지막 재계획의 전후 비교(없을 수 있음) |
| `intro` | `{ text, source: "AI" | "TEMPLATE" }` |

외출은 출발 시각, 안전 마감(`returnBy`)과 그 마감을 만든 이유, 예상 귀가 시각(`plannedReturnAt`),
누적 보행·이동, 정거장 목록을 담는다. 정거장 id는 `날짜:역할:장소id`로 결정된다.

**오류**: 세션 없음 401, 체류가 규칙 위반이면 `SAFEHOUR_STAY_INVALID`, 본문 형식 오류는
`SAFEHOUR_BAD_REQUEST`, 판정 도중 실패는 `SAFEHOUR_RECALCULATION_FAILED`.

**관광공사 조회가 실패하면 502다.** 키가 없거나 호출 한도에 걸린 경우를 포함하며, 이때는 일정을
만들지 않고 기존 일정도 바꾸지 않는다. 조회는 성공했는데 통과한 후보가 0개인 것은 **정상 결과**이고
200에 `NO_CANDIDATE` 사유로 담긴다. 이 둘을 구분한다 — "후보 없음"과 "조회 못 함"은 다르다.

502 본문에는 실패 분류 `upstream`이 **선택 필드**로 붙는다. 값은 아래 닫힌 목록 중 하나뿐이고, 분류를
모르면 필드가 없다. 클라이언트는 이 값으로 안내 문구만 고르고 판정에는 쓰지 않는다.

| `upstream` | 뜻 |
| --- | --- |
| `SELF_LIMIT` | 우리 operation별 일일 한도(`TOUR_API_DAILY_LIMIT`)에 걸려 호출하지 않았다 |
| `QUOTA` | 공공데이터포털이 호출 한도 초과로 거절했다(resultCode 22, HTTP 429) |
| `AUTH` | 인증키 문제(미등록·만료·IP·서비스 미신청, HTTP 401·403) 또는 키 미설정 |
| `UPSTREAM_ERROR` | HTTP 5xx 또는 그 밖의 오류 resultCode |
| `PARSE` | JSON이 아닌 응답이고 원인 코드를 찾지 못했다 |
| `NETWORK` | 요청이 닿지 않았다(연결 실패·시간 초과) |

```
{ "ok": false, "errorCode": "SAFEHOUR_EXTERNAL_API", "message": "...", "upstream": "QUOTA" }
```

추천 중단 스위치가 켜져 있으면 200에 `servicePaused: true`와 함께 모든 날짜가 정거장 0개로 온다.

## `POST /api/itinerary/alternatives`

정거장 하나를 바꿀 후보를 준다.

- 입력: `{ lang, stay, date, outingId, stopId, day, usedContentIds?, edits?, events? }`
- 오류: 401, 체류 규칙 위반은 `SAFEHOUR_STAY_INVALID`, 본문 형식 오류는 `SAFEHOUR_BAD_REQUEST`
  (`day.date`가 `date`와 다른 경우 포함), 관광공사 조회 실패는 502(일정과 같은 선택 필드 `upstream`), 판정 실패는 500
- 출력: `{ ok: true, alternatives: Array<{ stop, outingPreview }> }` — **최대 5개**
- 돌려주는 후보는 모두 게이트와 외출 재검증(복귀 계산·보행 누적·이동 한도)을 통과한 것뿐이다.
  통과하지 못한 후보를 "넣어보고 실패하면 되돌리기"용으로 주지 않는다.

## `POST /api/itinerary/intro`

- 입력: `{ lang, stops: Array<{ title, category, arriveAt }>, interests, pace }`
- 출력: `{ ok: true, text, source: "AI" | "TEMPLATE" }`
- **이 본문 밖의 정보는 받지 않는다.** 조건·병원·숙소·날짜 필드를 넣어도 버려지고 외부로 나가지 않는다.
- 오류: 401, 본문 형식 오류는 400 `SAFEHOUR_BAD_REQUEST`(어느 필드인지 함께 준다).
- 스위치나 키가 없으면 `source`는 항상 `TEMPLATE`이다.

## `POST /api/address/search`

- 입력: `{ keyword (2–60자), lang }`
- 출력: `{ ok: true, results: Address[] }` — **최대 10개**. 각 결과는 도로명주소·지번주소·건물명과
  위경도를 담고 출처가 `JUSO` 또는 `DEMO`다.
- 오류: 401, 검색어 형식 오류는 400, 키가 없으면 503 `SAFEHOUR_ADDRESS_UNAVAILABLE`,
  제공자 호출 실패는 502. 데모 로그인 모드에서는 키가 없어도 고정 데모 주소를 '데모 주소'로 돌려준다.
- 제공자가 주는 좌표는 UTM-K(GRS80)이고 **서버가 위경도로 변환해서** 돌려준다. 클라이언트는 변환된
  값만 본다.

## `POST /api/place`

장소 상세를 준다. 입력은 정거장과 같은 모양(`{ lang, contentId, sourceIds, contentTypeIds }`)이다.
언어별 원본 장소 id를 함께 받아 선택 언어 서비스를 부른다.

- 오류: 401, 식별자와 유형 코드가 짝으로 오지 않으면 400 `SAFEHOUR_PLACE_INVALID`,
  관광공사 조회 실패는 502.

## `POST /api/plan/link`

병원 코드로 지침을 받아온다. 입력은 `{ code }`이고 계약 v2만 받는다.
코드가 없으면 400, 모르는 코드면 404, 계약을 어긴 지침이면 422다. 형식이 어긋나면 지침 전체를 거부하고, 허용 목록 밖
필드는 버린다. 기간의 날짜가 역순이면 전체 거부다.

지침 원문의 복귀 장소가 '병원'이면 병원 id가 비어 있고 **발행 병원**을 뜻한다. 연결할 병원이 정해진
뒤에 채운다 — 정해지기 전에 변환하면 어느 병원인지 알 수 없는 복귀 지점이 생긴다.

## `GET /api/auth/session`

로그인 상태와 **불투명 계정 키**를 준다. 이 키가 기기 저장소의 이름공간이 된다. 원래 계정 식별자는
응답에 없다. 로그인하지 않은 채 불러도 200이고, 로그인하지 않았다는 사실과 로그인 수단 준비 상태
(`auth`)를 돌려준다.

## `GET /api/health`

로그인 없이 열린다. `{ ok, service, checkedAt, config, flags, tourApiUsage }`를 준다.

- `config`는 **키 값을 담지 않는다.** 키의 존재 여부(참/거짓)와, 기상 키를 어느 환경변수에서
  읽었는지 그 **변수 이름**만 알린다.
- `flags`는 운영 스위치 상태다: `{ recommendationKilled, serverPush, serverPushKilled }`. `serverPush`는 서버 알림
  스위치(`SAFEHOUR_SERVER_PUSH`가 정확히 `1`), `serverPushKilled`는 서버 알림 차단 스위치(`SAFEHOUR_KILL_SERVER_PUSH`)다.
- `config.serverPushReady`(불리언)는 서버 알림에 필요한 환경변수가 모두 형식에 맞는지, `config.serverPushMissing`(문자열
  배열)은 없거나 형식이 틀린 환경변수의 **이름**이다. 값은 담지 않는다. 저장소는 실제로 읽은 이름과 무관하게 정본 이름
  (`UPSTASH_REDIS_REST_URL`·`UPSTASH_REDIS_REST_TOKEN`)으로 알린다. 서버 알림이 실제로 동작하려면
  `flags.serverPush`가 참이고 `flags.serverPushKilled`가 거짓이고 `config.serverPushReady`가 참이어야 한다.
- `tourApiUsage`는 관광공사 자체 호출 카운터의 오늘(KST) 요약이다:
  `{ scope, date, dailyLimit, warningAt, counterReadable, operations: { "서비스.오퍼레이션": { used, limit, state } } }`.
  `scope`는 늘 `"instance"`다: 응답한 서버 인스턴스의 카운터이고 **제공처에 남은 한도가 아니다**.
  `state`는 `OK`·`WARNING`(경고 값 이상)·`BLOCKED`(차단 값 도달)다. 카운터 파일만 읽고 키·URL·매개변수는
  담지 않는다. 카운터가 손상됐으면 `counterReadable: false`이고, 관광 모듈을 못 불러오면 `null`이다.
  서버리스 배포에서는 카운터 파일이 실행 인스턴스마다 따로라 **응답한 인스턴스의 숫자**다(제공처 전체 호출 수가 아니다).
- 배포 직후와 스위치를 켠 직후에 실제로 반영됐는지 확인하는 경로다.

## 서버 알림 (ADR-0012)

보호자 푸시와 '돌아왔어요' 확인을 위한 경로다. **스위치가 꺼진 채 코드에만 들어와 있다**(갈래 2 단계 A-1, 화면 없음).
환자 화면은 A-2, 보호자 화면과 서비스 워커는 A-3에서 붙인다. 설계는 `docs/superpowers/specs/2026-11-09-server-push-design.md`,
구현 계획은 `docs/superpowers/plans/2026-11-14-server-push-foundation.md`(작업 8의 계약 표가 이 절의 출처다).

**공통**

- **켜짐**은 세 조건을 모두 만족할 때뿐이다: `SAFEHOUR_SERVER_PUSH`가 정확히 `1`, 차단 스위치 `SAFEHOUR_KILL_SERVER_PUSH`가
  꺼짐, 필요한 환경변수가 모두 형식에 맞음. 판단의 정본은 `lib/server/watch/config.js`의 `watchConfig()` 하나다.
- 꺼져 있으면 쓰기 경로는 503 `SAFEHOUR_SERVER_PUSH_OFF`다. 저장소 설정이나 소유 비밀(`SAFEHOUR_WATCH_OWNER_SECRET`)이 없을 때도
  준비가 안 된 것이라 같은 503이다. **삭제 경로 둘(`DELETE /api/watch`, `DELETE /api/watch/subscribe`)은 스위치·차단 스위치와
  무관하게 동작한다.** 켰다가 끈 뒤에도 지울 수 있어야 하기 때문이다. 삭제 경로는 저장소 설정이나 소유 비밀이 없을 때만
  503 `SAFEHOUR_SERVER_PUSH_OFF`다(소유 비밀이 없으면 저장 키를 만들 수 없어 지울 것을 찾지 못한다).
- 식별 값(`watchId`, `writeToken`, `subId`)은 **요청 본문으로만** 받는다. 경로·쿼리 문자열에 싣지 않는다(URL은 플랫폼 요청
  기록에 남는다). 그래서 상태 조회도 POST다.
- 본문은 UTF-8로 16,384바이트 이하인 JSON 객체여야 한다. 읽을 수 없거나, 넘거나, UTF-8이 아니거나, JSON이 아니거나, 객체가
  아니면 400에 `field: 'body'`다. 넘는 본문은 끝까지 읽지 않고 넘는 순간 멈춘다(`Content-Length`가 없거나 틀려도 같다). 필드 형식이 틀리면 400에 그 필드 이름이 `field`로 붙는다(값은 담지 않는다). 형식은 맞는데 서비스가 거절한
  경우(지난 출국일, 허용 목록 밖 endpoint 등)는 400에 `field`가 없다.
- 허용 목록 밖 필드는 조용히 버린다. 서버는 받은 객체를 그대로 넘기지 않고 정해진 키만 새로 담는다.
- **데모 세션**: 운영 배포(`VERCEL_ENV=production`)이거나 데모 로그인이 꺼진 곳에서는 데모 로그인 세션을 세션이 없는 것으로 본다.
  데모 로그인은 누가 눌러도 같은 신원이라 소유 확인이 무의미하기 때문이다. 등록과 `{ all: true }` 삭제는 401, 마감 올리기는 쓰기
  토큰만 보고, 보호자 경로는 로그인을 요구하는 설정이면 401이다. 미리보기·로컬처럼 데모 로그인이면서 운영 배포가 아닌 곳에서는
  데모 세션도 보통 세션과 같다. 운영에서 환자가 등록하려면 실제 소셜 로그인(구글·카카오)이 필요하다.
- 형식: `watchId` 22자, `writeToken` 43자, `subId` 22자(모두 base64url), 날짜 `YYYY-MM-DD`(KST), 시각 `HH:MM`,
  `lang`은 `ko`·`en`·`ja`·`zh`. `on`·`undo`·`all`은 불리언이고 `undo`는 없으면 `false`다.
- **찾지 못한 경우는 모두 같은 404다**: 모르는 id, 만료, 틀린 토큰, 남의 id 재등록, 틀린 `subId`. 응답 본문이 바이트까지 같아
  어느 경우인지 알 수 없다.
- 횟수 제한의 주체는 등록이면 세션 계정, 나머지는 지켜보기(`watchId`로 만든 저장 키)다. IP는 쓰지 않는다. 모르는 id도 아는
  id와 똑같이 세므로 429로 id가 있는지 알 수 없다.
- 마감 올리기와 돌아왔어요는 **쓰기 토큰을 먼저 확인하고** 센다. 토큰이 맞으면 보통 한도를, 틀리거나 모르는 id면 따로 둔 '실패'
  한도를 센다. 실패 한도를 넘으면 429, 아니면 404다. 링크로 `watchId`만 아는 사람이 틀린 토큰을 쏟아내도 환자의 진짜 요청은
  막히지 않는다. 그 밖의 경로는 다른 판정보다 먼저 센다.
- '오늘'은 서버 시계(KST)가 정한다. 본문에 시각이 실려 와도 읽지 않는다.
- 성공 응답은 아래 표의 키만 담고 `Cache-Control: no-store`를 붙인다.

| 경로 | 권한 | 요청 본문 | 성공 응답 |
| --- | --- | --- | --- |
| `GET /api/push/config` | 없음 | 없음 | `{ ok: true, enabled, vapidPublicKey: string \| null, guardianLoginRequired }`. 꺼져 있으면 `enabled: false`, `vapidPublicKey: null` |
| `POST /api/watch` | 환자 세션(운영은 데모 제외) | `{ watchId, writeToken, expiresOn }` | `{ ok: true, expiresOn }` |
| `DELETE /api/watch` | `writeToken` 또는 세션 | `{ watchId, writeToken }` 또는 `{ all: true }`(세션 필요, 운영은 데모 제외) | `{ ok: true }` 또는 `{ ok: true, deleted }` |
| `PUT /api/watch/deadlines` | `writeToken`(세션이 있으면 소유자 일치도) | `{ watchId, writeToken, expiresOn, days: [{ date, deadlines: ["HH:MM"] }] }` | `{ ok: true, expiresOn, armFailed }` |
| `POST /api/watch/back` | `writeToken`(세션 불필요) | `{ watchId, writeToken, date, by, undo? }` | `{ ok: true, recorded }` |
| `POST /api/watch/subscribe` | `watchId`(+ 보호자 세션, 설정에 따라) | `{ watchId, subscription: { endpoint, keys: { p256dh, auth } }, lang }` | `{ ok: true, subId }` |
| `DELETE /api/watch/subscribe` | `watchId` + `subId` | `{ watchId, subId }` | `{ ok: true }` |
| `POST /api/watch/status` | `watchId`(+ 보호자 세션, 설정에 따라) | `{ watchId, subId? }` | `{ ok: true, date, confirmed, muted, subscriptionActive }` |
| `POST /api/watch/mute` | `watchId` + `subId`(+ 보호자 세션, 설정에 따라) | `{ watchId, subId, on }` | `{ ok: true, muted }` |
| `POST /api/watch/due` | `Upstash-Signature` 또는 `Authorization: Bearer <CRON_SECRET>` | `{ k, d, t }` | `{ ok: true }`. 다시 불러야 하면 503 |
| `GET /api/cron/watch-arm` | `Authorization: Bearer <CRON_SECRET>` | 없음 | `{ ok: true, armed, failed }` 또는 꺼져 있으면 `{ ok: true, skipped: 'OFF' }` |

'보호자 세션, 설정에 따라': `SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN`이 정확히 `1`이 아니면(기본) 구독·상태 조회·오늘 함께 있음에 로그인
세션을 요구한다(운영 배포에서는 데모 세션이 통하지 않는다). 구독 해지는 언제나 세션 없이 된다. 아이폰 홈 화면 앱의 로그인 왕복을 실기기로 확인한 뒤 정한다(결정 22).
`1`이면 세션 없이 되는 대신 세 경로의 횟수 제한이 더 엄격해진다(아래 표의 '로그인 없는 보호자 설정' 줄, 결정 22).

**오류** (모두 `{ ok: false, errorCode, message }`, 메시지는 고정 문장이다)

| 상태 | errorCode | 언제 | message |
| --- | --- | --- | --- |
| 400 | `SAFEHOUR_BAD_REQUEST` | 본문이 UTF-8 JSON 객체가 아님, 16KB 초과, 필드 형식(`field` 포함), 지난 출국일, 허용 목록 밖 endpoint | 요청 형식이 올바르지 않습니다. |
| 401 | `SAFEHOUR_AUTH_REQUIRED` | 세션이 필요한 경로(운영 배포의 데모 세션 포함), 예약 경로의 인증 실패 | 로그인이 필요합니다. |
| 404 | `SAFEHOUR_WATCH_NOT_FOUND` | 모르는 id, 만료, 틀린 토큰, 남의 id, 틀린 `subId` | 서버 알림 정보를 찾을 수 없습니다. |
| 429 | `SAFEHOUR_RATE_LIMITED` | 횟수 제한, 재등록·동시 지켜보기 한도 | 요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요. |
| 503 | `SAFEHOUR_SERVER_PUSH_OFF` | 쓰기 경로인데 꺼져 있음, 삭제 경로인데 저장소 설정이 없음 | 서버 알림이 꺼져 있습니다. |
| 503 | `SAFEHOUR_SERVER_PUSH_UNAVAILABLE` | 저장소 장애 등 예상 못 한 실패, 다시 불러야 하는 예약 처리 | 서버 알림을 잠시 쓸 수 없습니다. |

503 응답과 기록에는 저장소 주소·토큰·명령·푸시 서비스 응답 원문이 들어가지 않는다.

**횟수 제한** (`lib/server/watch/limits.js`의 `WATCH_LIMITS`)

| 항목 | 한도 | 주체 |
| --- | --- | --- |
| 지켜보기 등록 | 시간당 10 | 세션 계정 |
| 마감 올리기(토큰이 맞을 때) | 시간당 60 | 지켜보기 |
| 마감 올리기 실패(틀린 토큰·모르는 id·남의 계정) | 시간당 30 | 지켜보기 |
| 돌아왔어요(토큰이 맞을 때) | 하루 50 | 지켜보기 |
| 돌아왔어요 실패(틀린 토큰·모르는 id) | 시간당 30 | 지켜보기 |
| 예약 걸기(`arm`, 예약 업체 발행) | 하루 120, 예약 업체가 받은 발행만 센다. 넘으면 그 업로드의 남은 마감은 `armFailed`로 센다 | 지켜보기 |
| 예약 걸기 실패(`armFail`, 예약 업체가 받지 않은 발행) | 하루 40, 넘으면 그 호출의 남은 마감은 시도하지 않고 `armFailed`로 센다. 다음 호출은 다시 시도하고 `arm` 한도는 쓰지 않는다 | 지켜보기 |
| 구독 | 시간당 10 | 지켜보기 |
| 상태 조회 | 시간당 120 | 지켜보기 |
| 오늘 함께 있음 | 시간당 30 | 지켜보기 |
| 구독(`subscribeOpen`, 로그인 없는 보호자 설정) | 하루 3 | 지켜보기 |
| 상태 조회(`statusOpen`, 로그인 없는 보호자 설정) | 시간당 30 | 지켜보기 |
| 오늘 함께 있음(`muteOpen`, 로그인 없는 보호자 설정) | 시간당 10 | 지켜보기 |
| 보호자에게 보내는 푸시(마감 지남·복귀 확인) | 하루 20, 보낸 것만 센다 | 지켜보기 |
| 계정당 살아 있는 지켜보기 | 3 | 세션 계정 |
| 지켜보기당 다시 등록 | 5회 | 지켜보기 |
| 마감 올리기 한 번의 날짜 수 · 날짜당 마감 수 | 46 · 10(넘으면 400) | 요청 |

창은 고정 창이다. 시간당은 매시 정각(UTC 기준)에, 하루는 UTC 자정(09:00 KST)에 새로 센다. 푸시 한도는 보내기 전에는 읽기만 하고
푸시 서비스가 받았을 때만 센다. 예약 걸기 한도(`arm`)도 같다. 동시에 보내거나 걸면 한도를 조금 넘을 수 있다. 기기 바뀜 알림은
세지 않는다. 로그인 없는 보호자 설정의 세 항목은 기본 항목과 따로 센다. 설정을 바꾸면 그 설정의 계수기로 센다. 서비스 전체에 걸친
상한은 코드에 두지 않는다. Upstash·QStash의 월 예산 상한(결정 20)과 Vercel 방화벽 규칙이 맡는다.

### `GET /api/push/config`

화면이 서버 알림 항목을 보일지 정하고 구독에 쓸 VAPID 공개키를 받는다. 공개키를 `NEXT_PUBLIC_`으로 번들에 굽지 않는 것은
키를 바꾸거나 끌 때 다시 빌드하지 않기 위해서다. 개인키는 어떤 응답에도 없다.

### `POST /api/watch`

지켜보기를 만들거나 다시 등록한다. 환자 세션이 필요하고(없으면 401, 운영 배포의 데모 세션도 401), 서버는 세션 계정에서 소유자
해시(`ownerHash`)를 계산한다.

- 새 `watchId`: 레코드를 만든다. 그 계정의 살아 있는 지켜보기가 이미 3개면 429다.
- 이미 있는 `watchId`: 저장된 소유자가 이 계정이면 쓰기 토큰과 출국일을 바꾸고 다시 등록 횟수를 하나 늘린다. 이전 쓰기 토큰은
  더는 통하지 않는다. 다시 등록이 이미 5회면 429다. **소유자가 다르면 모르는 id와 같은 404이고 레코드는 바뀌지 않는다**
  (링크와 PIN으로 `watchId`를 얻은 사람이 지켜보기를 가로채지 못하게).
- `expiresOn`(출국일, KST 날짜)이 오늘보다 앞이면 400이다. 서버는 `min(expiresOn, 오늘 + 46일)`로 깎아 저장하고 그 값을
  응답의 `expiresOn`으로 돌려준다. 다시 등록으로 출국일이 줄면 새 출국일 뒤의 날짜 기록을 지운다.
- 지켜보기와 구독은 출국일 끝 + 7일에, 날짜 기록은 그 날짜 끝 + 1일에 저장소에서 사라진다(TTL).

### `DELETE /api/watch`

- `{ watchId, writeToken }`: 그 지켜보기의 지켜보기·구독·날짜 기록·색인 항목을 지우고 걸어 둔 예약을 취소한다. `{ ok: true }`.
  토큰이 틀리면 404이고 아무것도 지우지 않는다.
- `{ all: true }`: 세션이 필요하다(운영 배포의 데모 세션은 401). 그 계정이 소유한 지켜보기를 모두 지운다(기기를 잃은 경우의 길).
  `{ ok: true, deleted }`.
- 날짜 기록은 저장된 출국일과 무관하게 어제(KST)부터 오늘 + 46일까지를 훑어 지운다. 출국일을 줄이기 전에 올린 날짜 기록까지 덮는다.
- 예약 취소가 실패해도 성공이다. 남은 예약은 도착해도 지켜보기가 없어 아무것도 보내지 않는다.

### `PUT /api/watch/deadlines`

남은 체류 기간의 날짜별 복귀 마감 시각을 올린다. 출국일 연장도 이 경로가 맡는다(따로 연장 경로가 없다).

- 권한: `writeToken`. 세션이 함께 오면 그 계정이 소유자여야 한다(다르면 404). 세션이 없어도 된다. 운영 배포의 데모 세션은
  세션이 없는 것으로 보고 쓰기 토큰만 본다.
- `expiresOn`은 늘 함께 보낸다. 서버는 등록과 같은 상한을 다시 씌우고, 바뀌었으면 지켜보기와 구독의 만료를 갱신한다.
  출국일이 줄었으면 새 출국일 뒤의 날짜 기록을 지운다.
- `days`: 길이 46 이하, 날짜가 겹치면 400, 날짜당 `deadlines` 10개 이하. 시각은 중복을 없애고 정렬한다. 오늘보다 앞이거나
  상한을 씌운 출국일보다 뒤인 날짜는 조용히 버린다.
- 날짜마다 목록을 **통째로 바꾼다.** 같은 목록이면 아무것도 쓰지 않는다(확인·예약·보냄 표시가 그대로다). 빈 목록이면 그 날짜
  기록을 지운다. 바뀐 목록이면 빠진 시각의 확인·예약·보냄 표시를 지우고 그 예약을 취소한다. 오늘 함께 있음 표시는 남는다.
- 예약은 오늘과 내일 것만 건다. 그 뒤 날짜는 저장만 하고 하루 1회 예약이 하루씩 당겨 건다. 오늘 함께 있음이 켜진 날은 걸지
  않는다(끄면 다시 건다). 출국일은 바뀌지 않아도 지켜보기와 구독의 만료를 늘 다시 맞춘다.
- `armFailed`: 이번 업로드에서 걸지 못한 마감 수다. 예약 업체 실패와, 하루 발행 한도(`arm`)나 이번 호출의 실패 한도(`armFail`)에 닿아 시도하지 않은 마감을 함께 센다. 늘 들어 있는 음이 아닌 정수이고, 0이어도 0보다 커도 응답은 200이다.
  0보다 크면 클라이언트는 잠시 뒤 같은 전체를 다시 올린다(A-2에서 쓴다). 기록에는 `counts.failed`로 남는다.
- 서버는 읽기와 쓰기를 두 번에 나눠 한다(원자적이지 않다). **클라이언트는 지켜보기 하나에 업로드를 한 번에 하나만 보내고, 늘
  가장 최근 상태 전체를 보낸다.**

### `POST /api/watch/back`

'돌아왔어요'와 되돌리기. 세션이 아니라 환자 기기에만 있는 `writeToken`으로 권한을 본다. 그래서 로그인이 만료된 보기 전용
상태에서도 누를 수 있다(보기 전용 규칙의 예외, 결정 8).

- `date`가 오늘이나 어제(KST)가 아니거나, `by`가 그 날짜의 마감 목록에 없으면 `{ ok: true, recorded: false }`다. 어제를 받는 것은
  자정 넘어(00:05) 어제 늦은 마감(23:55)을 확인할 수 있게 하기 위해서다.
- 확인은 멱등이다. 두 번 눌러도 같은 결과다. 그 마감의 마감 지남 푸시가 **이미 나갔으면** 보호자에게 복귀 확인 푸시를 한 번
  보낸다(결정 9). 보내지 않은 마감은 조용히 둔다.
- `undo: true`: 보낼 시각(마감 + 10분) − 30초 전까지만 되돌린다. 그 뒤에는 `recorded: false`이고 확인이 그대로 남는다.
- 서버가 아는 것은 '확인 버튼이 눌렸는가'뿐이다. 위치를 받지 않고 실제로 돌아왔는지 판단하지 않는다.

### `POST /api/watch/subscribe` · `DELETE /api/watch/subscribe`

보호자 기기의 푸시 구독을 저장하거나 지운다. 지켜보기 하나에 구독은 하나이고, 새 구독이 이전 것을 갈아 끼운다(결정 14).

- `subscription.endpoint`: 문자열 2,048자 이하, `https:`, 사용자 정보와 443 밖의 포트가 없고, 호스트가 푸시 서비스 허용
  목록(`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`)에 맞아야 한다.
  아니면 400이고 저장하지 않는다. `keys.p256dh`는 base64url로 65바이트(첫 바이트 `0x04`), `keys.auth`는 16바이트다.
- 이전 구독이 있고 endpoint가 다르면 이전 기기에 "알림 받는 기기가 바뀌었어요"를 한 번 보낸다. 닿지 않아도 새 구독은 성공이다.
- 구독은 봉인(AES-256-GCM)해 저장하고 지켜보기와 같은 때 사라진다. 응답의 `subId`는 보호자 기기가 해지·상태 조회·함께 있음에 쓴다.
- 구독하면 어제·오늘의 걸리지 않은 마감을 다시 건다(늦은 한도 안이면 지금 나간다). 걸지 못해도 응답은 같다.
- 해지는 `subId`가 지금 구독의 것일 때만 지운다. 다르면 404이고 남는다. 스위치와 무관하게 동작한다.

### `POST /api/watch/status`

오늘(KST) 날짜 기록의 확인된 마감 시각(`confirmed`, 정렬)과 오늘 함께 있음 여부(`muted`)만 돌려준다. 어제 기록은 섞지 않는다.
`date`는 서버가 본 오늘이다. `subscriptionActive`는 받은 `subId`가 지금 구독의 것일 때만 참이다(다른 기기가 구독을 가져갔거나
푸시 서비스가 구독 만료를 알려 지웠으면 거짓).

### `POST /api/watch/mute`

보호자의 '오늘 함께 있음'(결정 24). `subId`가 지금 구독의 것이어야 한다. `on: true`면 오늘 날짜 기록에 표시를 두고, 그날의
예약 처리는 보내지 않는다. `on: false`면 표시를 지우고 오늘의 걸리지 않은 마감을 다시 건다(표시는 오늘 기록에만 있으므로 어제 것은 건드리지 않는다). 날짜가 바뀌면 새 날짜 기록이라
저절로 풀린다. 마감을 다시 올려도 표시는 남는다.

### `POST /api/watch/due`

예약 업체(QStash)가 마감 + 10분에 부르는 예약 처리 경로다. 브라우저가 부르지 않는다.

- 인증: 원본 본문으로 `Upstash-Signature`(HS256 JWT, 지금 서명 키 또는 다음 서명 키)를 검증하거나,
  `Authorization: Bearer <CRON_SECRET>`가 맞아야 한다. 둘 다 아니면 401이다. 미리보기 시험과 화면 테스트는 Bearer로 부른다.
  서명의 `sub`는 경로(`/api/watch/due`)만 맞춰 보고 호스트는 보지 않는다(배포마다 호스트가 다르다).
- 인증을 본문보다 먼저 본다. 본문을 읽을 수 없거나 JSON 객체가 아니면 서명도 검증할 수 없으므로, Bearer가 없으면 401이고
  Bearer가 맞으면 400(`field: 'body'`)이다.
- 본문 `{ k, d, t }`: `k`는 저장 키(43자, `watchId`가 아니다), `d`는 날짜, `t`는 마감 시각이다.
- 인증 뒤 저장소 설정이 없으면 200 `{ ok: true }`(할 일이 없다).
- 아래 판정표를 위에서부터 보아 처음 맞는 줄이 결과다. `retry`가 참이면 503 `SAFEHOUR_SERVER_PUSH_UNAVAILABLE`을 돌려줘 예약
  업체가 다시 부르게 한다(기본 3회). 저장소 장애도 503이다. 그 밖은 모두 200 `{ ok: true }`다.

| 조건 | outcome | retry |
| --- | --- | --- |
| 꺼져 있음(스위치·차단 스위치·준비) | `SKIP_OFF` | 거짓 |
| 지켜보기 없음 | `SKIP_NO_WATCH` | 거짓 |
| 날짜가 저장된 출국일 뒤 | `SKIP_CHANGED` | 거짓 |
| 날짜 기록이 없음(지울 것이 없다) | `SKIP_CHANGED` | 거짓 |
| 시각이 마감 목록에 없음(그 시각의 예약 표시를 지우고 같은 배치에서 날짜 기록을 다시 읽는다) | `SKIP_CHANGED` | 다시 읽은 목록에 시각이 돌아와 있으면 참 |
| 지금 < 보낼 시각 − 30초 | `SKIP_EARLY` | **참** |
| 확인됨 | `SKIP_CONFIRMED` | 거짓 |
| 오늘 함께 있음(예약 표시를 지운다) | `SKIP_MUTED` | 지우는 배치에서 다시 읽으니 표시가 풀려 있으면 참 |
| 지금 ≥ 늦은 한도(마감 + 60분) | `SKIP_LATE` | 거짓 |
| 구독 없음(예약 표시를 지운다) | `SKIP_NO_SUB` | 지우는 배치에서 다시 읽으니 구독이 생겼으면 참 |
| 보낼 권리를 얻지 못함(이미 보냈거나 보내는 중) | `SKIP_DUP` | 거짓 |
| 권리를 얻은 같은 배치에서 다시 읽으니 확인됨·함께 있음·목록에서 빠짐 | 권리를 돌려놓고 해당 `SKIP_`(함께 있음·빠짐이면 예약 표시도 지운다) | 위와 같은 규칙 |
| 푸시 서비스가 받음 | `SENT` | 거짓 |
| 하루 푸시 한도(예약 표시는 남겨 업로드마다 다시 걸지 않는다) | `SKIP_CAP` | 거짓 |
| 구독 만료(404·410), 보낸 그 구독을 지운다(예약 표시도 지운다) | `SUB_GONE` | 지우는 배치에서 다시 읽으니 새 구독이 있으면 참 |
| 404·410인데 그 사이 다른 구독이 생김(지우지 않고 예약 표시를 남긴다) | `RETRY` | **참** |
| 보내는 사이 구독이 사라짐(예약 표시를 지운다) | `SKIP_NO_SUB` | 위 '구독 없음'과 같은 규칙 |
| 푸시 서비스 5xx·429·시간 초과 | `RETRY` | **참** |
| 푸시 서비스 거절(그 밖의 4xx·3xx, 예약 표시는 남긴다) | `SEND_REJECTED` | 거짓 |

- 일찍 온 예약을 확인·함께 있음보다 먼저 본다. 마감 30초 전보다 일찍 온 예약이 '확인됨'으로 끝나 버리면, 그 뒤 되돌리기를
  했을 때 그 마감이 다시 걸리지 않기 때문이다.
- 예약 표시를 지우는 판정은 지우는 것과 이유를 다시 읽는 것을 한 배치에서 한다. 구독·함께 있음 끄기·마감 올리기는 먼저 쓰고
  나중에 예약을 다시 걸기 때문에, 둘 중 한쪽은 늘 다른 쪽을 본다.
- 보낼 권리는 날짜 기록의 `p:<시각>` 필드를 `HSETNX`로 얻는 것이다. 얻을 때 '보내는 중', 푸시 서비스가 받으면 '보냄'으로 바꾼다.
  보내지 못한 결과(구독 없음, 한도, 구독 만료, 거절, 다시 시도)는 모두 표시를 지운다.
- 보낸 뒤에는 '보냄'을 쓰는 같은 배치에서 확인 여부를 다시 읽는다. 그 사이 '돌아왔어요'가 들어왔으면 복귀 확인 푸시를 예약 처리가
  보낸다(한 번만). 보낸 뒤의 저장소 실패는 던지지 않고 `SENT`로 끝낸다(이미 나갔다).
- 판정은 '확인이 있었는가'만 본다. 문구는 "복귀 확인이 없어요"라고 쓰고 돌아오지 않았다고 단정하지 않는다.

### `GET /api/cron/watch-arm`

하루 1회 예약(Vercel Cron, `vercel.json`의 `10 15 * * *` = 00:10 KST, 운영 배포에서만 돈다)이 부른다.

- 꺼져 있으면 인증 없이 200 `{ ok: true, skipped: 'OFF' }`다.
- 켜져 있으면 `Authorization: Bearer <CRON_SECRET>`가 맞아야 한다(아니면 401). 어제·오늘·내일 날짜 색인의 지켜보기마다 걸리지
  않은 마감을 건다. 어제를 넣는 것은 어제 늦은 밤 마감의 예약이 실패했을 때 늦은 한도 안이면 다시 걸기 위해서다.
- 지켜보기 레코드가 사라진 항목, 날짜가 저장된 출국일 뒤인 항목, 날짜 기록이 사라진 항목은 걸지 않고 색인에서 뺀다(지켜보기
  레코드는 지켜보기마다 한 번만 읽는다).
- `armed`는 이번에 건 수, `failed`는 예약 업체 실패나 하루 한도로 걸지 못한 수다.
- 마감을 하나씩 걸고, 시작에서 45초가 지나면 멈춘다(라우트의 `maxDuration`은 60초). 남은 마감은 시도하지도 `failed`로 세지도
  않는다. 응답 모양은 같고, 다음 업로드나 다음 날의 하루 1회 예약이 건다. 실행 한 번이 거는 양은 `docs/operations.md`
  '서버 알림 켜기'에 있다.

## 더 이상 없는 경로

`POST /api/recommend`, `POST /api/recalculate`, `POST /api/today`는 단일 외출 흐름의 경로였고
지금은 없다. 판정 경로가 두 벌이 되면 결과가 어긋나기 때문에 되살리지 않는다.
예전 운영 문서가 이 경로로 스위치 동작을 확인하라고 적어 두었다면 그건 지난 내용이다.
