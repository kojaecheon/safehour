# 외부에 약속한 것

이 시스템의 소비자는 **이 앱의 브라우저 클라이언트 하나**다. 서버가 무상태 계산기라서 요청 본문이 곧
판정 입력의 거의 전부다. 본문 모양이 어긋나면 판정이 조용히 달라진다.

## 공통

- 모든 응답은 `{ ok: true, ... }` 또는 `{ ok: false, errorCode, message }` 형태다.
- 오류 식별자 키는 **항상 `errorCode`**다. 다른 이름을 쓰지 않는다.
- 서버는 상태를 저장하지 않는다. 같은 날 같은 요청을 다시 보내면 같은 응답이 온다 — 다만 '오늘'과
  '지금'은 서버 시계가 정하므로 날짜가 바뀌면 결과도 바뀐다.
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
- `flags`는 운영 스위치 상태다(추천 중단 등).
- `tourApiUsage`는 관광공사 자체 호출 카운터의 오늘(KST) 요약이다:
  `{ scope, date, dailyLimit, warningAt, counterReadable, operations: { "서비스.오퍼레이션": { used, limit, state } } }`.
  `scope`는 늘 `"instance"`다: 응답한 서버 인스턴스의 카운터이고 **제공처에 남은 한도가 아니다**.
  `state`는 `OK`·`WARNING`(경고 값 이상)·`BLOCKED`(차단 값 도달)다. 카운터 파일만 읽고 키·URL·매개변수는
  담지 않는다. 카운터가 손상됐으면 `counterReadable: false`이고, 관광 모듈을 못 불러오면 `null`이다.
  서버리스 배포에서는 카운터 파일이 실행 인스턴스마다 따로라 **응답한 인스턴스의 숫자**다(제공처 전체 호출 수가 아니다).
- 배포 직후와 스위치를 켠 직후에 실제로 반영됐는지 확인하는 경로다.

## 더 이상 없는 경로

`POST /api/recommend`, `POST /api/recalculate`, `POST /api/today`는 단일 외출 흐름의 경로였고
지금은 없다. 판정 경로가 두 벌이 되면 결과가 어긋나기 때문에 되살리지 않는다.
예전 운영 문서가 이 경로로 스위치 동작을 확인하라고 적어 두었다면 그건 지난 내용이다.
