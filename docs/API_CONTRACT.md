# SafeHour 내부 API 계약 (AX-002)

- 연결: D04 API007–009, D06 §8 오류 코드, D09 AC001–AC003
- 계약 테스트: `test/api-contract.test.js` (계약 변경 시 반드시 함께 수정)
- 상태: v1 — 이 문서와 다르게 동작하면 구현 버그다.

## 공통 계약

- 모든 응답 본문은 `{ ok: boolean, ... }` 형태다. 실패 시 `{ ok: false, errorCode, message }`.
- 판정은 **stateless** 다. 서버는 세션·판정 결과를 저장하지 않으며, 클라이언트가
  `recalcPayload` 를 그대로 되돌려 보내는 방식으로 상태가 이어진다.
- 기준점은 서버에서 항상 `kind: "USER_SELECTED_FIXED"` 로 강제된다. 현재 GPS 류
  필드는 정규화 단계에서 폐기된다 (D07-BAN002).
- 허용 목록에 없는 `ctx` 키·필드는 무시되고 응답에 되돌아오지 않는다.
- 병원 안내문 원문(rawText)·이름·연락처·증상 원문은 어떤 요청·응답에도 실리지 않는다.

### HTTP 상태 코드

| 상태 | 의미 | errorCode |
| --- | --- | --- |
| 200 | 판정 성공 (NO_TOURISM 도 성공이다 — 정상 제품 결과) | — |
| 400 | 요청 본문·입력 무효 | `SAFEHOUR_BAD_REQUEST` `SAFEHOUR_CONDITION_INVALID` `SAFEHOUR_RECALCULATION_INVALID` |
| 500 | 판정 엔진 실패 (D06-E013) | `SAFEHOUR_RECALCULATION_FAILED` |
| 502 | 외부 API(TourAPI) 실패 (D06-E005) | `SAFEHOUR_EXTERNAL_API` |

클라이언트는 상태 코드가 아닌 `ok` 필드로 분기해도 된다(현행 구현). 상태 코드는
모니터링·게이트웨이 용도의 계약이다.

## POST /api/recommend

조건 입력 → TourAPI 후보 조회 → 기상 실황 반영 → 안전 판정.

### 요청

```json
{
  "origin": { "lat": 37.5105, "lng": 127.059, "label": "병원" },
  "returnBy": "2026-08-01T09:25:00.000Z",
  "condition": {
    "version": "web-xxxx",
    "issuedAt": "2026-08-01T05:00:00.000Z",
    "issuedBy": "medical_staff | coordinator",
    "fasting": false,
    "outingAllowed": true,
    "escortRequired": false,
    "avoidUv": true,
    "indoorOnly": false,
    "splitAllowed": false,
    "maxWalkMin": 20,
    "maxTravelMin": 30
  },
  "roles": { "hasCompanion": true, "patientResting": false, "companionSeparateAllowed": false }
}
```

검증 규칙 (모두 `lib/server/engine-io.js` 의 normalize 계열이 정본):

- `origin.lat/lng` 유한 수 필수이며 **대한민국 범위**(위도 33~39, 경도 124~132) 여야 한다.
  범위를 벗어나면 외부 API 장애가 아니라 입력 오류(400)로 응답한다. `label` 80자 절단.
- `condition.version` 필수(60자 절단), `issuedAt` 파싱 가능한 시각 필수.
- `maxWalkMin`/`maxTravelMin` 0–240 클램프. boolean 필드는 truthy 강제 변환.
- `escortRequired && splitAllowed` 동시 true 는 엔진이 `CONFLICTING_CONDITION` 으로
  NO_TOURISM 차단한다 (400 이 아니라 200 + 차단 판정 — 안전 게이트의 정상 동작).

### 응답 (200)

```json
{
  "ok": true,
  "displayLimit": 3,
  "decision": { "state": "TOGETHER", "reasons": [], "course": [], "excluded": [],
                 "decisions": [], "patientCourse": [], "companionCourse": [],
                 "returnBy": "...", "latestDepartureAt": "...", "returnNow": false },
  "origin": { "kind": "USER_SELECTED_FIXED", "lat": 0, "lng": 0, "label": "" },
  "returnBy": "ISO8601",
  "travelTimeSource": "fallback",
  "weather": { "outdoorUnsafe": false, "reasons": [], "unknown": true,
                "degraded": true, "observedAt": null },
  "diagnostics": { "candidateCount": 0, "totals": {}, "matching": {} },
  "recalcPayload": { "origin": {}, "returnBy": "", "condition": {}, "roles": {},
                      "candidates": [], "ctx": {} }
}
```

- `decision.state` ∈ `NO_TOURISM | STANDBY | SPLIT_NEARBY | TOGETHER` (D05-SM001).
- 엔진은 최대 5개(`maxResults`) 산출, 화면은 `displayLimit`(3)개 노출.
- `weather.unknown=true` 면 기상은 판정에 반영되지 않았다는 뜻이다 (D06-E012).
- `recalcPayload` 는 다음 재계산 요청에 그대로 되돌려 보내는 불투명 토큰으로 취급하라.

## POST /api/recalculate

실시간 이벤트 주입 → 1단계부터 재판정 → 전후 델타 반환.
알림만 표시하고 코스를 유지하는 동작은 금지된다 (D07-BAN008).

### 요청

```json
{
  "recalcPayload": { "...": "직전 응답의 recalcPayload 또는 nextRecalcPayload 그대로" },
  "event": { "type": "CLOSURE", "closedIds": ["contentid"] }
}
```

이벤트 유형과 파라미터:

| type | 파라미터 | 비고 |
| --- | --- | --- |
| `CLOSURE` | `closedIds: string[]` (1–20개) | 해당 후보 `openNow=false` |
| `WEATHER` | 없음 | `outdoorUnsafe` 강제 |
| `TRAFFIC_SURGE` | `extraMin` (5–120 클램프) | **누적** — payload ctx 와 합산 후 상한 120 |
| `APPOINTMENT` | `deltaMin` (±240 클램프) | **누적** — 합산 후 ±240 |
| `PATIENT_RECALL` | 없음 | 모든 추천 무효화 + `returnNow=true` |
| `RISK_SIGNAL` | 없음 | 해석 없이 입력 사실만으로 차단 |

누적 계약: 수치 이벤트는 payload `ctx` 의 기존 값과 합산한 **총량**으로 판정하며,
응답의 `nextRecalcPayload.ctx` 에는 판정에 쓴 것과 **동일한 총량**이 저장된다
(`recalc.event` 에서 실제 적용된 총량을 확인할 수 있다).

**후보 0건 계약**: `candidates: []` 는 오류가 아니다. 후보 0건은 STANDBY 라는 정상
결과이며, 그 상태에서도 환자 호출·위험신호 재판정이 가능해야 한다 (D04-BR011).
배열이 아닌 값만 400 으로 거부한다.

### 응답 (200)

```json
{
  "ok": true,
  "displayLimit": 3,
  "recalc": {
    "event": { "type": "...", "적용된 총량 파라미터": 0 },
    "before": { "state": "", "courseIds": [] },
    "after": { "state": "", "courseIds": [], "reasons": [] },
    "delta": { "stateChanged": false, "removed": [], "added": [], "shortened": [],
                "newlyExcluded": [], "hasVisibleChange": false },
    "result": { "decision 과 동일 구조": {} }
  },
  "nextRecalcPayload": { "다음 이벤트 요청에 그대로 사용": {} }
}
```

- 결과 변경이 필요한 이벤트에서 `delta.hasVisibleChange=false` 면 실패로 다룬다 (D07-BAN008 감시 지표).

## 멱등성·동시성 (D04 API007–009 확정)

- **멱등성**: 동일 `recalcPayload` + 동일 `event` 재전송은 동일한 판정을 낳는다.
  단, 판정 기준 시각(`plan.now`)은 서버 수신 시각이므로 시간 경과에 따른 차이는 허용된다.
- **동시성**: 서버는 상태를 저장하지 않으므로 경쟁 조건이 없다. 클라이언트는
  가장 마지막 응답의 `nextRecalcPayload` 만 유지한다 (구 revision 응답 폐기).
- **접근 통제**: 비로그인 MVP — payload 위조는 위조자 본인 화면에만 영향을 주는
  self-affecting 구조다. 병원 발행 조건(서명) 도입 시 HMAC 무결성 검증을 추가한다.
