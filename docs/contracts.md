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

보호자 푸시와 '돌아왔어요' 확인을 위한 경로다. **스위치가 꺼진 채 코드에만 들어와 있다**(갈래 2 단계 A-1 서버, A-2 환자 화면,
A-3 보호자 화면과 서비스 워커). 환자 화면은 `GET /api/push/config`가 꺼짐을 알리면 새 항목을 모두 숨기고, 보호자 화면도 꺼짐이면서
이 기기에 구독이 없으면 새 항목을 숨기므로 운영 화면은 그대로다. 설계는 `docs/superpowers/specs/2026-11-09-server-push-design.md`,
구현 계획은 `docs/superpowers/plans/2026-11-14-server-push-foundation.md`(작업 8의 계약 표가 이 절의 출처다),
`docs/superpowers/plans/2026-11-15-server-push-patient-ui.md`(환자 쪽, 아래 'A-2 클라이언트가 지키는 것'),
`docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md`(보호자 쪽, 아래 'A-3 클라이언트가 지키는 것')다.

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

### A-2 클라이언트가 지키는 것

환자 기기가 위 경로를 부르는 규칙이다. 무엇을 보낼지는 `lib/trip/watchPlan.js`(순수 함수), 언제 보내고 결과를 어떻게 반영할지는
`lib/trip/watchSync.js`(실행기), 요청 모양과 응답 분류는 `src/guardian/watchRequests.js`와 `src/guardian/watchSend.js`가 정한다.
서버 삭제 대기만 기기 저장소(`lib/store/store.js`)가 직접 보낸다.

**요청 공통**

- 지켜보기 하나에 요청은 **한 번에 하나**다. 등록, 마감 올리기, '돌아왔어요', 되돌리기, 끄기, 서버 지우기를 한 줄로 세운다.
  비우는 중에 계기가 또 오면 끝난 뒤 한 번만 더 돈다. 서버의 날짜 기록 바꾸기와 다시 등록이 원자적이지 않기 때문이다
  (`docs/engineering-notes.md` '마감 올리기 둘이 겹치면 표시를 잃는다', '다시 등록과 출국일 변경이 겹치면 한쪽 변경이 사라진다').
- 응답을 받으면 레코드를 다시 읽고, `watchId`나 쓰기 토큰이 바뀌었으면(지워짐, 다시 등록) 결과를 쓰지 않는다.
- 결과 종류(`WATCH_KIND`): 2xx이면서 `data.ok === true`일 때만 `OK`. 그 밖은 `NOT_FOUND`(404), `LOGIN_REQUIRED`(401),
  `RATE_LIMITED`(429), `OFF`(503 `SAFEHOUR_SERVER_PUSH_OFF`), `BAD`(400), `UNAVAILABLE`(503 그 밖, 5xx, 모르는 상태),
  `NETWORK`(연결 실패, 시간 초과)다. 요청 함수는 던지지 않는다.
- `watchId`, 쓰기 토큰, 날짜, 시각은 요청 본문으로만 보낸다. `console`, 오류 메시지, URL에 싣지 않는다.

**설정 읽기** (`GET /api/push/config`)

- 실행기 하나가 5분 동안 결과를 기억한다. 보호자 링크 만들기 화면과 설정 화면은 스위치가 꺼져 있어도 늘 부른다.
  '돌아왔어요'는 이 기기에 지켜보기 레코드가 있을 때만 부른다.
- 새 항목은 서버가 꺼졌다고 **답했을 때만** 숨긴다. 읽는 중이거나 읽지 못했으면(오프라인 등) '돌아왔어요'를 숨기지 않는다.
  서버에는 마지막으로 올린 마감이 남아 있어 보호자 알림이 갈 수 있기 때문이다.

**등록** (`POST /api/watch`, 보호자 링크를 만들 때 서버 알림 항목을 켰을 때만)

- 레코드가 `ON`이면 요청하지 않고 있는 `watchId`를 쓴다(다시 등록은 지켜보기당 5회라 링크를 다시 보낼 때마다 쓰면 막힌다).
  `REPLACED`면 같은 `watchId`에 새 쓰기 토큰으로 다시 등록한다. 레코드가 없으면 WebCrypto로 새 id(22자)와 토큰(43자)을 만든다.
- 본문 `expiresOn`은 체류의 출국일이다. `OK`면 레코드를 `ON`, `uploadPending: true`로 쓰고 곧바로 마감을 올린다.
  같은 `watchId` 다시 등록이면 `confirmed`를 남기고, 새 id면 비운다.
- 실패해도 링크는 만든다(`watchId` 없이). 401은 'Google 또는 카카오로 로그인해야 켤 수 있어요', 429는 잠시 뒤 다시, 꺼짐과
  그 밖은 지금 쓸 수 없다는 줄을 보인다. 서버 알림 항목의 체크를 끈 채 링크를 만들면 있는 지켜보기를 지운다.
- 링크를 만드는 동안(등록·끄기·암호화를 기다리는 동안) 계정이 바뀌면 공유 기록을 쓰지 않고 링크도 보이지 않는다(일반 실패 줄).
  스냅샷은 양식을 그린 계정의 것이다.
- 등록·끄기·서버 지우기는 앞선 요청 뒤에 줄 선다. 링크 만들기와 설정의 끄기·서버 지우기는 누른 때의 계정 키를 넘기고, 줄 선 일이
  시작될 때 저장소의 지금 계정이 다르면 요청·레코드 쓰기·삭제 대기 없이 지금 쓸 수 없음(`UNAVAILABLE`)으로 끝난다. 누른 화면에
  계정이 없었으면(`null`) 그것도 다른 계정으로 본다. 같은 탭의 세션 변경과, 저장소가 받은 다른 탭의 계정 바뀜·내 정보 지우기를 덮는다
  (마지막 계정 키를 storage 이벤트, 다시 보일 때, 세션 응답을 반영하기 전, 실행기가 일을 시작할 때 대조해 세션을 버리고 보기 전용이 된
  뒤 바로 다시 묻는다). 덮지 못하는 것: 다른 탭의 쿠키가 바뀐 때부터 그 탭이 마지막 계정 키를 쓰기까지(로그인 뒤 그 탭의 첫 세션
  응답까지)의 틈에 나간 요청, 기기 저장소를 쓸 수 없는 브라우저, 마지막 계정 키를 쓰지 못한 탭, storage 이벤트를 받지 못한 탭에서
  사건 없는 대조 두 번 사이에 마지막 계정 키가 A에서 B로, 다시 A로 돌아온 경우(바뀜을 알리는 사건을 받으면 지금 값과 상관없이 세션을
  버리므로 덮인다). 서버 쪽 확인은 스위치 전 할 일이다
  (`docs/engineering-notes.md` '줄 선 등록·끄기·서버 지우기가 시작될 때 계정이 바뀌어 있을 수 있다').

**마감 올리기** (`PUT /api/watch/deadlines`)

- 계기: 일정(`tripPlan`)·체류 레코드 변경(다른 탭의 변경 포함), 앱 열기, 화면 복귀(`visibilitychange`·`pageshow`), KST 자정 +
  1초, 온라인 복귀, 쓰기 가능 복귀, 등록 직후, `armFailed` 재시도, '돌아왔어요'·되돌리기 누름.
- 날짜: 오늘부터 `min(출국일, 오늘 + 45일)`까지의 체류 날짜와 같은 범위에서 마지막으로 올린 날짜. 더는 체류 날짜가 아닌 올린
  날짜는 빈 목록으로 보내 서버 기록을 지운다. **어제는 올리지 않는다**(서버가 버린다). 기기는 `lastUploaded`에 어제를 남겨 자정
  뒤 '돌아왔어요' 대상을 찾는 데만 쓴다.
- 마감 계산은 보호자 사본과 같은 함수(`src/guardian/deadlines.js`)다. 마감이 지금으로 당겨진 외출(`isClampedOverdueOuting`)의
  마감은 빠진다.
- **오늘 지난 마감은 고정이다**(운영자 결정 D1). 오늘 목록은 세 가지의 합이다: 오늘 마지막으로 올린 시각 중 지금 이전 것(일정에서
  빠졌어도 남긴다. 올린 적 없는 지난 시각은 새로 더하지 않는다), 묶이지 않은 외출의 지금 이후 마감, 묶인 외출의 원래 마감.
  그 밖의 지나지 않은 올린 시각은 남기지 않는다. 묶인 외출과 원래 마감의 규칙은 `docs/business-rules.md` '서버 알림의 돌아왔어요'.
- 하루 10개를 넘으면 지금 마감, 원래 마감, 최근 지난 시각 순으로 남긴다. 날짜는 46개 이하다.
- 체류 날짜나 일정의 날짜 목록을 읽지 못하면 올리지 않는다(빈 목록이 서버 기록을 지우기 때문이다). 출국일이 오늘보다 앞이면
  오늘 이후로 올린 날짜가 남아 있을 때만 `expiresOn`을 오늘로 줄여 오늘의 고정된 지난 시각만 보낸다.
- 서버가 이미 같은 상태를 받았고(`uploadPending: false`, 같은 출국일, 보낼 날짜마다 같은 목록) 바뀐 것이 없으면 보내지 않는다.
- **보기 전용에서는 올리지 않는다.** 오프라인이거나 레코드가 `ON`이 아니어도 올리지 않는다.
- `OK`면 `expiresOn`, `lastUploaded`를 쓰고 `uploadPending`은 `armFailed > 0`일 때만 참이다. `armFailed > 0`이면 60초 뒤 같은
  전체를 다시 올린다. 같은 상태로는 세 번까지다(실행기 메모리). 그 뒤 `confirmed`에서 서버 목록에 더는 없는 시각의 항목을 뺀다
  (서버가 빠진 시각의 확인 표시를 지웠다).
- `OFF`·`UNAVAILABLE`·`RATE_LIMITED`·`NETWORK`·`BAD`면 `uploadPending: true`만 남기고 화면에 보이지 않는다. `BAD`로 막힌 상태는
  이 실행 동안 다시 보내지 않는다.

**'돌아왔어요'와 되돌리기** (`POST /api/watch/back`)

- 누르면 먼저 대기열(`backQueue`)에 넣고(보기 전용에서도 된다) 비운다. 보내는 순서는 마감 올리기 다음 대기열이고, 대기열은
  오래된 것부터 하나씩 보낸다. 올리기는 지난 마감을 지우지 않으므로 먼저 보내도 확인 대상이 사라지지 않고, 아직 서버에 없던
  마감을 확인하는 경우를 살린다.
- 본문은 `{ watchId, writeToken, date, by, undo }`다. `date`는 외출이 속한 날(시계의 오늘이 아니다), `by`는 그 외출이 확인할 마감
  (`backTargetOf`)이다. 대기열 항목이 기기에만 들고 있는 누른 시각(`atMs`)과 누른 외출의 출발 시각(`departAt`)은 싣지 않는다.
- '전달했어요'는 서버가 `recorded: true`로 답한 뒤에만 보인다. 그때 레코드의 `confirmed`에 `{ date, by, atMs, departAt }`를
  넣고, 되돌리기가 기록되면 뺀다. `recorded: false`는 실패 줄이다. 누름의 단계(대기, 보내는 중, 전달, 실패)는 실행기 메모리에만
  두고, 새로 고치면 대기열에서 대기 단계를 다시 만든다.
- 되돌리기 마감은 `마감 + serverPushGraceMin(10분) − serverPushEarlyToleranceSec(30초)`이다(23:55 마감은 다음 날 00:04:30).
  아직 보내지 않은 확인의 되돌리기는 요청 없이 대기열에서 뺀다.
- 대기열 보내기가 503(`UNAVAILABLE`)이나 429로 막히면 60초 뒤 다시 비운다(연속 세 번까지, 받아들여지거나 새로 누르면 횟수를
  되돌린다). 연결 없음은 온라인 복귀가 다시 부른다.
- 매 비우기에서 대기열을 보내기 전에 같은 마감의 나중 외출을 덮는 확인을 정리한다(보기 전용에서도 한다). 아직 보내지 않은
  확인은 요청 없이 대기열에서 뺀다. 보낸 확인(`confirmed`)은 되돌리기 마감 전일 때만 `undo: true`를 대기열에 넣는다. 덮는다고
  보는 조건은 `docs/business-rules.md` '서버 알림의 돌아왔어요'에 있다.
- 대기열은 20개, `confirmed`는 20개 상한이고 어제보다 앞 날짜는 버린다.

**404 (갈아 끼움)**

- 올리기든 '돌아왔어요'든 404면 레코드를 `state: 'REPLACED'`로 바꾸고 올리기를 멈추며 대기열의 남은 것을 모두 실패로 두고 비운다.
  화면은 버튼을 숨기고 설정에 '다른 기기에서 서버 알림을 다시 설정했어요'를 보인다. 404는 갈아 끼움, 만료, 다른 기기의 '서버에
  남은 내 정보 지우기'를 구분하지 못하지만 문구는 하나다(D9). 보기 전용이라 쓰지 못하면 메모리에 표시해 두고 다음 쓰기 가능한
  비우기에서 요청 없이 쓴다.

**지우기** (`DELETE /api/watch`)

- 설정의 '서버 알림 끄기'(확인 시트 뒤), 내 정보 지우기, 출국 7일 후 자동 삭제, 체류 삭제, 민감정보 동의 철회는 식별 값을 읽어 두고
  레코드를 지운 뒤 서버 삭제 대기(`safehour.v2.device.pendingServerDelete`, 최대 10개)에 넣는다. 기기 저장소가 지켜보기마다
  `{ watchId, writeToken }` DELETE를 동시에 보낸다(10초 한도). 200·404·400이면 대기에서 빼고, 그 밖은 남겨 온라인 복귀와 앱
  열기 때 다시 보낸다. 보기 전용에서도 보낸다. 등록 응답 사이에 계정이 바뀌었거나 기기 기록 쓰기가 실패해(세션 만료 등) 버린
  새 지켜보기도 같은 대기에 넣는다(`store.queueServerDelete`, 다시 등록한 id는 넣지 않는다).
- 설정의 '서버에 남은 내 정보 지우기'는 `{ all: true }`(쓰기 가능할 때만, 세션 필요)다. 성공하면 기다리는 동안 레코드가 바뀌지
  않았을 때만 이 기기의 레코드도 지운다.

### A-3 클라이언트가 지키는 것

보호자 기기가 위 경로를 부르는 규칙이다. 무엇을 할지는 순수 함수 `lib/notify/pushSupport.js`(지원 판별)와
`lib/notify/guardianPushPlan.js`(다시 맞추기, 상태 조회 시각)가 정하고, 브라우저 Push API·서비스 워커·요청·타이머는 실행기
`lib/notify/guardianPush.js`(`createGuardianPush`) 하나가 다룬다. 요청 모양과 응답 읽기는 `src/guardian/pushRequests.js`, 보내기와
결과 종류(`WATCH_KIND`)는 A-2와 같은 `src/guardian/watchSend.js`다. 화면은 훅 `lib/notify/useGuardianPush.js`와 표시 규칙
`components/guardian/guardianPushView.js`만 쓴다. 구독 해지 대기는 기기 저장소가 직접 보낸다. 아래 시간값은 실행기 상수이고 안전
판정 숫자가 아니라 `src/stay/defaults.js`에 두지 않는다.

**요청 공통**

- 켜기, 끄기, 다시 켜기, 다시 받기, 오늘 함께 있음, 다시 맞추기, 상태 조회는 실행기의 줄 하나에 서서 한 번에 하나씩 돈다. 같은 기기의
  탭 사이에서도 한 번에 하나다(Web Locks `safehour-guardian-push`, 잠금을 얻은 뒤 `store.recheckAccount()`로 기기의 마지막 계정 키를
  다시 대조하고 기록을 다시 읽어 정한다, 60초까지만 붙잡는다, 없으면 탭 안에서만). 같은
  지켜보기의 켜기·끄기·다시 받기·함께 있음이 도는 중(권한 창을 기다리는 동안 포함)에 또 부르면 도는 동작의 약속을 돌려준다. 켜기가
  도는 동안 누른 끄기도 켜기의 결과를 받는다. 그동안 `getState(watchId).busy`가 참이고 화면은 스위치와 버튼을 잠근다.
- 구독, 상태 조회, 함께 있음, 다시 맞추기는 로그인해 쓰기 가능할 때만 한다. 설정 읽기와 해지만 세션 없이 나간다.
  `guardianLoginRequired`는 읽어 두지만 A-3 동작은 이 값과 무관하다(사본 가져오기와 계정 레코드 쓰기가 이미 로그인을 요구한다).
- 동작을 시작할 때 저장소의 계정 키를 잡아 두고, 기다림마다 그 뒤와 요청을 보내기 직전에 계정과 쓰기 가능을 다시 본다. 계정이
  바뀌었으면 `UNAVAILABLE`, 같은 계정이 보기 전용이 됐으면 `READ_ONLY`로 끝낸다. 앞 계정에서 서버가 받아들인 구독은 지금 계정
  기록에 넣지 않고 해지 대기로 넘긴다. 계정 키는 어느 요청에도 싣지 않는다.
- 기다린 뒤의 기록 쓰기는 모두 `store.updateGuardianPush(updater)`(동기로 읽고 고치고 쓴다)다. 구독을 빼거나 `subId`를 바꾸면 옛
  `subId`는 저장소가 해지 대기에 넣는다. 404로 뺄 때만 `gone`에 넣어 대기를 건너뛴다.
- `watchId`, `subId`, 구독 `endpoint`와 그 해시, `p256dh`·`auth`, 계정 키, 날짜·시각은 요청 본문으로만 보낸다. `console`, 오류
  메시지, URL 경로·쿼리, 알림 `data`에 싣지 않는다. 실행기는 던지지 않는다.
- 구독과 함께 있음의 실패는 화면 결과(`PUSH_RESULT`)로 옮긴다: 404는 `GONE`(함께 있음은 아래 '404'), 401은 `LOGIN_REQUIRED`,
  429는 `RATE_LIMITED`, 503 `SAFEHOUR_SERVER_PUSH_OFF`는 `OFF`(설정 기억을 버린다), 400은 `FAILED`, 연결 실패는 `NETWORK`, 그 밖은
  `UNAVAILABLE`이다. 브라우저 구독 호출이 던지거나 10초(`BROWSER_PUSH_TIMEOUT_MS`)를 넘겨도 `FAILED`다.
- 브라우저 푸시 호출(`getRegistration`, `getSubscription`, `subscribe`, `unsubscribe`)은 하나에 10초까지 주입 타이머로 기다리고
  (`AbortSignal.timeout`을 쓰지 않는다), 넘기면 그 호출이 실패한 것으로 본다. 준비 확인의 등록 읽기가 넘기면 `SW_NOT_READY`, 다시
  맞추기가 브라우저 구독을 읽지 못하면 판단하지 않는다. 끄기는 `unsubscribe`가 넘겨도 서버 해지를 그대로 보낸다.

**설정 읽기** (`GET /api/push/config`)

- 항목을 그릴 때 읽는다(보이는 사본에 그 `watchId`가 있을 때만, `prepare`). 사본에 `watchId`가 없으면 설정을 포함해 서버 알림 요청이
  0건이다. 실행기가 10분(`CONFIG_TTL_MS`) 동안 기억하고, 겹쳐 부르면 한 번만 보낸다.
- 못 읽으면(오프라인 등) 구독 기록과 다시 켜기 표시를 바꾸지 않고, 화면은 마지막으로 읽은 설정으로 그린다. 켜기만 막는다(`NETWORK`
  또는 `UNAVAILABLE`). `enabled`가 참인데 공개키가 없거나 형식이 틀리면 못 읽은 것으로 본다.
- 꺼짐(`enabled: false`)이면 구독, 상태 조회, 함께 있음을 보내지 않는다. 이 기기에 그 지켜보기의 구독이 있으면 화면은 쉬고 있다는
  줄(`PAUSED`)과 끄기만 보이고, 해지는 스위치와 무관하게 서버가 받는다.

**서비스 워커 준비 확인**

- 구독 전에 활성 워커에 `postMessage({ type: 'SAFEHOUR_SW_INFO' }, [port])`를 보내고, 그 포트로 오는
  `{ type: 'SAFEHOUR_SW_INFO', version, push: true }` 답을 2초(`SW_INFO_TIMEOUT_MS`) 기다린다. 워커(`public/sw.js`)는 다른 `type`이나
  포트 없는 메시지에 답하지 않는다.
- 답이 없으면 `registration.update()`를 부르고, 새 워커가 깔리면 컨트롤러 교체를 5초(`SW_UPDATE_TIMEOUT_MS`)까지 기다린 뒤 한 번 더
  묻는다. 그래도 `push: true`가 아니면 `SW_NOT_READY`이고 구독하지 않는다(화면은 '새로 고침' 버튼).
- 항목을 그릴 때 설정이 켜져 있고 지원되는 기기면 한 번 미리 확인해 둔다. 참으로 확인된 뒤에는 다시 묻지 않는다.

**켜기와 다시 받기** (`turnOn`, `takeOver`)

- 켜기는 누름 안에서 첫 기다림 전에 권한 요청을 시작하고 기기 알림 스위치(`prefs.notifications`)도 함께 켠다
  (`turnOnDeviceNotifications`). 권한 답은 줄 밖에서 기다린다: 열린 권한 창이 끄기, 다시 맞추기, 상태 조회를 막지 않는다. 다시 받기는
  권한을 묻지 않고 이미 `granted`여야 한다.
- 줄에 서면 설정, 준비 확인, 브라우저 구독 고르기, `POST /api/watch/subscribe`, 기록 순서다. 브라우저 구독은 기기에 하나이고 이
  기기의 모든 지켜보기가 함께 쓴다. 켜기는 있는 구독을 이 계정 기록에 같은 주소 해시와 같은 키의 구독이 있거나, 다른 계정이 구독을
  쓰고 그 구독의 키가 설정과 같거나 읽을 수 없을 때만 다시 쓴다. 아니면 지우고 새로 만든다(`userVisibleOnly: true`, 설정의 공개키).
- 다시 받기는 고르지 않는다: 있는 구독을 지우고 새로 만든 뒤 `POST`한다(다시 켜기와 같다). `MOVED`는 이 휴대폰의 주소 만료(서버가
  410 뒤 구독을 지움)일 수 있어 같은 주소로 다시 보내면 다음 푸시에서 또 `MOVED`다. 있는 구독을 읽지 못하면 없는 것으로 보고 새로
  구독한다. 새 구독이 받아들여지면 이 계정의 다시 `POST` 시도 기록을 비우고, 이 계정에 다른 구독이 있으면 다시 맞추기를 건다(그 구독들은
  지운 옛 주소를 가리킨다). 같은 브라우저 구독을 쓰던 다른 계정의 구독은 그 계정으로 다시 맞출 때 새 주소로 다시 보낸다(실행기는 다른
  계정의 기록을 다시 맞추지 않는다).
- 본문은 `{ watchId, subscription: { endpoint, keys: { p256dh, auth } }, lang }`이고 `lang`은 지금 화면 언어다. 성공하면 기록에
  `{ watchId, subId, lang, endpointHash, vapidKey }`를 넣고(`endpointHash`는 `endpoint`의 SHA-256, 채움 없는 base64url 43자) 그
  지켜보기의 오늘 상태를 활성으로 둔다. `endpoint` 원문과 두 키는 기록에 두지 않는다.
- 켜지 못하면(결과가 `ON`이 아니면) 방금 만든 브라우저 구독은 이 기기의 다른 구독이 쓰지 않을 때만 지운다. 서버가 받아들였는데 기기
  기록 쓰기가 실패하면 그 `subId`를 해지 대기로 넘긴다.
- 사본에 없는 `watchId`면 `UNAVAILABLE`, `gone`에 있으면 `GONE`이고 요청이 없다.

**저절로 구독하지 않는다**

- `pushManager.subscribe`는 켜기, 다시 받기, 다시 켜기 안에서만 부른다(Safari는 구독이 사용자 동작 가까이에 있어야 한다).
- 다시 켜기 필요(`renewNeeded`, 계정 단위): 설정의 VAPID 공개키가 남은 구독 어느 하나의 키와 다르거나, 브라우저 구독의 키를 읽을 수
  있고 설정과 다르거나, 구독 기록이 있는데 브라우저 구독이 없을 때다. 화면은 '다시 켜기' 버튼을 보인다. 누르면(`renew`) 옛 브라우저
  구독을 먼저 `unsubscribe()`한 뒤 새로 구독하고, 이 계정의 구독(사본이 살아 있고 `gone`도 아니고 다른 기기가 가져가지도 않은 것)을
  모두 다시 `POST`한다. 다시 보낼 구독이 없으면 브라우저를 건드리지 않고 `UNAVAILABLE`이다.
- 다른 기기가 가져감(`moved`): 상태 조회의 `subscriptionActive`가 거짓이면 그 지켜보기는 `MOVED`다. 화면은 '이 휴대폰에서 다시 받기'
  버튼을 보인다. 다시 맞추기와 다시 켜기는 이 구독을 다시 `POST`하지 않는다(다시 보내면 서버가 다른 휴대폰의 구독을 바꾸고, 두 기기가
  서로에게 '기기가 바뀌었어요'를 주고받는다). 다시 받기로만 푼다. 이 휴대폰은 `MOVED`를 상태 조회로만 알므로 다시 맞추기는 다시
  `POST` 전에 상태를 먼저 묻는다(아래 '다시 맞추기').

**다시 맞추기** (`reconcile`)

- 계기: 실행기 시작(앱 열기), 화면 복귀(보이게 된 `visibilitychange`), 온라인 복귀, 저장소 주제 `guardianCopies`·`guardianPush`·
  `prefs`·`status`의 변경. 실행기 자신의 기록 쓰기로 온 변경은 계기가 아니다. 도는 중에 또 불리면 끝난 뒤 다시 돈다(한 번에 세
  번까지). 쓰기 가능할 때만 돈다(보기 전용에서는 저장소가 해지 대기만 다시 보낸다).
- 먼저 끌 것을 정한다(설정과 브라우저 구독을 몰라도 된다): 살아 있는 사본 어디에도 없는 `watchId`의 구독, 그리고 기기 알림 스위치가
  꺼졌거나 알림 권한이 `granted`가 아니면 모든 구독. 권한이 사라져 끈 것이면 그 지켜보기 결과를 `PERMISSION_LOST`로 보인다. 끄기는
  아래 '끄기와 해지 대기'와 같다.
- 그다음 설정과 브라우저 구독을 읽는다. 설정이나 브라우저 구독을 읽지 못하면 더 정하지 않는다. 설정이 꺼짐이면 다시 켜기 표시를
  내린다.
- 키가 같은데 브라우저 구독의 주소 해시가 기록과 다르거나 화면 언어가 기록과 다르면 같은 브라우저 구독으로 다시 `POST`한다(사용자
  동작이 필요 없다. 같은 주소면 서버가 기기 바뀜 알림을 보내지 않는다). 다시 `POST`는 실행기 하나에서 (계정, 지켜보기)마다 한 번만
  시도한다(429·503에서 되풀이하지 않는다). `gone`과 `MOVED` 구독은 다시 보내지 않는다.
- 다시 `POST`할 지켜보기마다 같은 일 안에서 먼저 상태를 묻는다(`POST /api/watch/status`, 2분 간격을 보지 않는다). 그다음 기록을 다시
  읽어 계획을 다시 세우고, 아직 다시 보낼 것일 때만 보낸다. `subscriptionActive`가 거짓이면 `MOVED`라 보내지 않고, 404면 `GONE`이다.
  조회가 실패하면(연결 실패, 5xx, 429, 401, 503 꺼짐) 그 지켜보기는 이번에 보내지 않고 시도로 세지도 않는다: 다음 다시 맞추기가 다시
  묻는다. 다른 휴대폰이 다시 받기로 가져간 것을 모른 채 다시 보내 되찾지 않게 한다.

**404**

- 구독이든 상태 조회든 404면 그 지켜보기가 없어졌다(환자가 끔, 만료). 그 `watchId`를 `gone`에 넣고 구독과 상태를 기록에서 빼며 해지는
  보내지 않는다(서버가 지켜보기와 함께 지웠다). 화면은 `GONE` 줄을 보이고 켜기를 숨긴다.
- 함께 있음의 404는 틀린 `subId`(다른 기기가 가져감)와 지켜보기 없음이 같은 404다. 상태를 곧바로 다시 물어 404면 `GONE`, 아니면
  `FAILED`다(다시 물은 상태의 `subscriptionActive`로 `MOVED`가 보인다).
- 환자의 다시 등록(같은 `watchId`, 새 쓰기 토큰)은 서버가 구독을 건드리지 않으므로 보호자 쪽은 그대로다. 환자가 새 `watchId`로 다시
  켜면 새 링크와 새 사본이라 새 항목이다.

**끄기와 해지 대기** (`turnOff`, `DELETE /api/watch/subscribe`)

- 끄기는 쓰기 가능할 때만 누를 수 있고 서버 알림 스위치와 무관하다. `store.retireGuardianPushSub(watchId)`가 기록에서 빼고
  `{ watchId, subId }`를 서버 삭제 대기에 넣으면 저장소가 해지를 보낸다. 200·404·400이면 대기에서 빠지고, 연결 실패·429·503이면 남아
  온라인 복귀와 앱 열기 때 다시 보낸다. 남았으면 `OFF_PENDING`(그 전까지 알림이 올 수 있다는 줄), 빠졌으면 `OFF_DONE`이다.
- 대기 상한(10)에 밀려 해지가 버려졌으면(`queued: false`) 같은 동기 구간에서 해지를 한 번 직접 보낸다. 200·404면 `OFF_DONE`, 그 밖은
  `OFF_UNSENT`이고 다시 보낼 곳이 없다(서버 구독은 지켜보기 만료까지 남는다). 다시 맞추기가 끄는 구독도 같다. 권한을 잃어 끈 것이면
  `OFF_UNSENT` 대신 `PERMISSION_LOST`를 남긴다(권한 없이는 남은 서버 구독이 알림을 띄우지 못한다).
- 기록하지 못한 구독(기다리는 사이 계정이 바뀜, 기록 쓰기 실패)도 해지 대기에 넣고, 대기에 남지 못했으면 한 번 직접 보낸다. 이 직접
  해지의 결과는 보지 않는다: 닿지 않으면 서버 구독이 지켜보기 만료까지 남고, 화면은 그 동작의 결과(`UNAVAILABLE`, `READ_ONLY`,
  `FAILED`)만 보인다(`docs/engineering-notes.md` '기록하지 못한 구독의 직접 해지가 닿지 않으면 서버 구독이 남는다').
- 이 기기 모든 계정에 구독이 남지 않으면 브라우저 구독도 지운다. 쓰고 있는 브라우저 구독의 `unsubscribe()`는 이 경우, 다시 켜기 직전,
  '이 기기에서 내 정보 지우기' 전(`forgetBrowser`, 3초 `FORGET_TIMEOUT_MS`, 실패해도 지우기는 계속한다)에 부른다. 그 밖에는 켜기가 쓸
  수 없는 남은 구독을 갈아 끼울 때, 다시 받기, 끝나지 못한 켜기가 방금 만든 구독을 거둘 때(다른 구독이 쓰지 않을 때만)뿐이다. 내 정보
  지우기는 모든 계정의 구독을 해지 대기로 옮긴다.

**상태 조회** (`POST /api/watch/status`)

- 조건: 쓰기 가능, 설정 켜짐, 사본에 그 `watchId`가 있고 `gone`이 아닐 때. 구독이 없어도 묻는다. 구독이 있으면 `subId`를 함께 보내고,
  같은 `subId`로 물은 결과만 `subscriptionActive`를 기록한다(아니면 `active: null`).
- 계기: 실행기 시작, 화면 복귀, 온라인 복귀, 계정이 바뀌거나 쓰기 가능이 된 때(이 넷은 가장 최근 사본), `/g`에 보이는 사본(항목을
  그릴 때 한 번, 화면이 보이는 동안 5분 `STATUS_POLL_MS`마다), 가장 최근 사본의 오늘 남은 마감마다 마감 60초 전(`STATUS_BEFORE_MS`)과
  마감 + `serverPushGraceMin` + 1분(지금 11분). 마감 타이머는 가장 이른 시각 하나만 걸고, 남은 것이 없으면 한국 시간 자정 + 1초에
  다시 건다.
- 앞 조회(실패한 시도 포함)와 2분(`STATUS_MIN_GAP_MS`) 미만이면 건너뛴다. 마감 타이머와 함께 있음 뒤의 조회는 간격을 보지 않는다.
- 결과는 `guardianPush.status`에 둔다(`date`, `confirmed`, `muted`, `active`, 받은 기기 시각 `atMs`). 로그인 한도(시간당 120회) 안에서
  넉넉하다.

**오늘 함께 있음** (`POST /api/watch/mute`)

- 그 지켜보기의 구독이 있고 쓰기 가능하고 설정이 켜졌을 때만 보낸다. 본문은 `{ watchId, subId, on }`이다. 성공하면 오늘(KST) 상태의
  `muted`를 고치고, 오늘 상태가 없으면 상태를 곧바로 다시 묻는다. 결과는 `MUTE_ON`·`MUTE_OFF`다.
- 화면의 켜짐은 오늘 상태 조회의 `muted`만 따른다(상태의 날짜가 오늘이 아니면 꺼짐으로 그린다).

**서비스 워커의 `push`** (`public/sw.js`)

- 본문을 JSON으로 읽어 `title`(1~80자)과 `body`(1~300자)가 문자열이면 그대로 보인다(서버가 구독 언어로 만든 문장이다). 아니면 대체
  문구 하나(제목 'SafeHour', 본문은 `notifications.serverPushFallback`의 한국어 줄과 영어 줄)를 보인다. 어떤 경우에도
  `event.waitUntil(showNotification(...))`을 부른다(조용한 푸시 0).
- `tag`는 `/^sh-watch-(\d{4}-\d{2}-\d{2}-\d{2}:\d{2}|device)$/`에 맞을 때만 싣고, 그때만 `renotify: true`를 싣는다.
- 알림 `data`에는 `url` 하나만 둔다. 본문 `url`이 `NOTIFICATION_PATHS`(`/today`, `/g`) 안이면 그것, 아니면 `/g`다.
  `pushsubscriptionchange` 처리기와 서비스 워커 IndexedDB는 두지 않는다(주소가 바뀌면 앱을 열 때 다시 맞추기가 고친다).

## 더 이상 없는 경로

`POST /api/recommend`, `POST /api/recalculate`, `POST /api/today`는 단일 외출 흐름의 경로였고
지금은 없다. 판정 경로가 두 벌이 되면 결과가 어긋나기 때문에 되살리지 않는다.
예전 운영 문서가 이 경로로 스위치 동작을 확인하라고 적어 두었다면 그건 지난 내용이다.
