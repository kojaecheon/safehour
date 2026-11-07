# 복귀 마감이 지난 외출: 즉시 복귀와 보호자 알림 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 환자 외출의 복귀 마감이 지나면 보호자 휴대폰에 알리고, 환자 휴대폰에는 즉시 복귀 시트를 띄운다(시간이 흘러 지난 경우는 일정 유지, 외출 중 재계획으로 이미 늦은 경우는 남은 일정 비움).

**Architecture:** 경우 2는 엔진 `tripPlan.planDate`가 새 원인 `OUTING_OVERDUE`로 기존 즉시 복귀 흐름을 탄다(원인 판정은 `returnNowCauses` 한곳). 알림은 기존 서버 없는 알림 실행기(`lib/notify`)에 두 종류를 더하고, 보호자 쪽은 최신 사본의 오늘 `patientReturn`을 입력으로 쓴다. 경우 1 시트는 저장 일정을 바꾸지 않는 표시 신호로 `lib/trip/runtime.js`가 시계에 맞춰 낸다.

**Tech Stack:** Next.js 16 (App Router), React 19, 순수 CSS, Node 내장 테스트(`node --test`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-06-overdue-return-design.md`

## Global Constraints

- 새 패키지 금지, `package.json`·`package-lock.json` 변경 금지.
- 서버 저장소·서버 푸시·예약 작업(크론) 금지. 위치 권한을 묻는 코드 금지.
- "환자가 돌아오지 않았다", "안전합니다"처럼 모르는 것을 단정하는 문구 금지.
- 잠금 화면에 보이는 문구(`notifications` 이름공간)는 `test/notify-schedule.test.js`의 `FORBIDDEN` 검사를 통과한다. 자리표시자는 `{time}` 하나.
- 알림 예약 항목은 `NOTIFY_ITEM_FIELDS`(id, kind, key, time, at, expiresAt)만 가진다. 사본 id·장소 이름·주소를 넣지 않는다.
- 보호자 스냅샷 필드를 더하지 않는다.
- 시각 비교는 KST 절대 시각(`kstInstantMs`, `kstClock`)으로 한다. 오프셋 없는 문자열을 직접 파싱하지 않는다.
- 새 기기 저장 값은 `safehour.v2.<accountKey>.` 아래에 둔다.
- 화면: 본문 16px 이상, 누르는 곳 44px 이상, 색 단독 구분 금지, WCAG AA, 색은 `app/globals.css` 토큰만.
- 문구는 i18n 사전에만 둔다. 4개 언어(ko·en·ja·zh). 값은 설계서 5절 표를 글자 그대로 쓴다.
- 새 글(코드 주석·문서·커밋 메시지)에 엠대시·엔대시를 쓰지 않는다.
- 커밋은 로컬만. 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 관문: `npm run lint`(오류 0), `npm test`, `npm run build`, `npm run e2e`.

## Review Focus

1. **KST가 아닌 시간대의 보호자 휴대폰** (해외 가족): "오늘"과 마감 비교가 기기 시간대가 아니라 KST로 정해져야 한다. UTC 2026-11-06T15:30Z(= KST 11-07 00:30)에서는 11-07 사본 날짜를 써야 한다. Task 2·4 테스트가 고정한다.
2. **보기 전용(로그인 만료) 기기**: 기기 기억 쓰기가 실패해도 같은 실행 안에서 같은 알림·시트가 두 번 나오지 않아야 한다. Task 3·5 테스트가 고정한다.
3. **사본·일정의 시각 값이 깨진 경우** (`by`가 null, "25:00", 빈 문자열): 그 항목만 건너뛰고 화면·실행기가 멈추지 않아야 한다. Task 2·4 테스트가 고정한다.
4. **보호자 기기에 자기 일정도 있는 경우**: 같은 시각에 환자 알림과 보호자 알림이 겹치면 하나만, 우선순위는 RETURN_PASSED > COMPANION_RETURN_PASSED > RETURN. Task 2 테스트가 고정한다.
5. **이미 즉시 복귀 중인 날**: 경우 1 시트는 뜨지 않고, 경우 2 원인이 다른 원인(환자 호출)과 겹쳐도 사유가 중복되지 않는다. Task 1·5 테스트가 고정한다.

---

### Task 1: 사유 코드 `OUTING_OVERDUE`와 엔진 경우 2

**Files:**
- Modify: `src/domain/states.js` (REASON, REASON_TEXT, 새 export)
- Modify: `src/engine/tripPlan.js` (`LIFTABLE_CAUSES`, `returnNowCauses`, `planDate`, 새 export)
- Modify: `lib/trip/local.js:39`, `lib/trip/runtime.js:64`, `app/today/page.js:35` (원인 목록을 새 export로 바꾼다)
- Create: `test/trip-overdue.test.js`
- Modify: `docs/business-rules.md` 즉시 복귀 절(경우 2 원인, 유지·해제)

**Interfaces:**
- Produces: `REASON.OUTING_OVERDUE = 'OUTING_OVERDUE'`; `RETURN_NOW_CAUSES`(동결 배열 `[PATIENT_RECALLED, PLAN_REVOKED, PLAN_EXPIRED, OUTING_OVERDUE]`, `src/domain/states.js`); `overdueOutingId({ prevDay, day, nowMin }) => string | null` (`src/engine/tripPlan.js`).

- [ ] **Step 1: 실패하는 테스트 작성** (`test/trip-overdue.test.js`)

  `test/trip-replan.test.js`의 `plan`·`replanToday` 방식과 `trip-fixtures.js`를 그대로 쓴다. 기준 체류는 그 파일 'APPOINTMENT' 테스트의 `withVisit`(오늘 15:00 병원 일정)이다. 병원으로 돌아가는 외출(`returnPlace === 'HOSPITAL'`)의 첫 정거장 도착 시각 + 1분을 `now`로 둔다(외출 중). 이 시각을 `T`라 한다.

  - `test('외출 중 병원 일정이 지금보다 앞당겨지면 즉시 복귀: OUTING_OVERDUE, 남은 정거장 비움')`: `deltaMin = -(mins('15:00') - mins(T) + 30)`인 APPOINTMENT 사건으로 `replanToday(..., { now: at(TODAY, T), events })`. 단언: `day.returnNow === true`, `day.reasons.includes(REASON.OUTING_OVERDUE)`, `day.dayState === STATE.NO_TOURISM`, 도착 시각이 `T` 이후인 환자·보호자 정거장이 0개, 그 외출은 남아 있고 `slackMin < 0`.
  - `test('시간이 그냥 흘러 마감이 지난 뒤의 재계획은 경우 2를 켜지 않는다')`: 사건 없이 `now`를 그 외출의 `returnBy` + 30분으로 두고 재계획. `returnNow === false`, `OUTING_OVERDUE` 없음.
  - `test('외출 중이어도 바뀐 것이 없으면 켜지 않는다')`: 사건 없이 `now = T`. `returnNow === false`.
  - `test('바뀐 일정이 그대로면 외출 시간이 지나도 유지한다')`: 첫 테스트 결과를 `previous`로, 같은 사건, `now`를 그 외출의 `occupancyEnd` + 60분으로 재계획. `returnNow === true`, `OUTING_OVERDUE` 유지.
  - `test('사건을 초기화하면 풀리고 지금 이후를 다시 짠다')`: 첫 테스트 결과를 `previous`로, `events: []`로 재계획. `returnNow === false`, `OUTING_OVERDUE` 없음, 도착 시각이 지금 이후인 환자 정거장이 다시 생긴다(남은 시간이 있을 때). 해제 확인 방식은 `trip-replan.test.js:299`의 'returnNow 는 환자 호출이 남아 있는 동안 유지되고, 사건 초기화로 풀린다' 테스트를 따른다.
  - `test('환자 호출과 겹쳐도 사유가 중복되지 않는다')`: 첫 테스트 사건에 `{ type: 'PATIENT_RECALL' }`을 더한다. `day.reasons`에서 `OUTING_OVERDUE`와 `PATIENT_RECALLED`가 각각 한 번씩.
  - `test('RETURN_NOW_CAUSES 와 사유 문구')`: `RETURN_NOW_CAUSES`가 위 4개, `REASON_TEXT[REASON.OUTING_OVERDUE]`의 ko·en·ja·zh가 설계서 5절 값과 같다.

- [ ] **Step 2: 실패 확인**

  Run: `node --test test/trip-overdue.test.js`
  Expected: FAIL (`REASON.OUTING_OVERDUE` 없음)

- [ ] **Step 3: 구현**

  - `states.js`: 사유와 4개 언어 문구(설계서 5절), `RETURN_NOW_CAUSES` export.
  - `tripPlan.js`:
    - `OUTING_OVERDUE`를 `LIFTABLE_CAUSES`에 더한다. `IMMEDIATE_RETURN_CAUSES`(applyImmediateReturn 전용)는 그대로 둔다.
    - `overdueOutingId({ prevDay, day, nowMin })`: `prevDay.outings` 중 `departAt <= nowMin`이고, (지금 외출 중: `nowMin < occupancyEnd(o)`) 또는 (`prevDay.returnNow === true`이고 `prevDay.reasons`에 `OUTING_OVERDUE`가 있고 `o.slackMin < 0`)인 외출을 고른다. 그중 `day.outings`에 같은 `id`가 있고 그 `slackMin < 0`인 첫 외출의 id를 돌려준다. 없으면 null.
    - `returnNowCauses`에 선택 인자 `probeDay`를 더한다. `probeDay`가 있고 `overdueOutingId({ prevDay, day: probeDay, nowMin })`가 있으면 `OUTING_OVERDUE`를 더한다. 원인 결정은 이 함수에만 둔다.
    - `planDate`: `causes`부터 첫 `buildDay`까지를 `probeDay`를 받는 내부 함수로 묶는다. 오늘이고 `prevDay`가 있으면 첫 결과를 `probeDay`로 다시 원인을 계산하고, 원인에 `OUTING_OVERDUE`가 새로 생기면 그 원인으로 한 번 더 계산해 그 결과를 쓴다. 해제(`lifted`) 흐름은 그 뒤 그대로다.
  - `local.js`·`runtime.js`·`today/page.js`: 각자의 `RETURN_CAUSES`를 지우고 `RETURN_NOW_CAUSES`를 쓴다.
  - `docs/business-rules.md` 즉시 복귀 절에 경우 2(켜짐 조건, 유지·해제)를 적는다.
  - 서버의 사유 허용 목록(`lib/server/itinerary-request.js`, `lib/server/decision-log.js`)은 `Object.values(REASON)`에서 오므로 따로 고치지 않는다. `docs/contracts.md`에는 사유 코드 목록이 없다(2026-11-06 확인).

- [ ] **Step 4: 통과 확인**

  Run: `node --test test/trip-overdue.test.js test/trip-replan.test.js test/trip-sync-core.test.js test/trip-view.test.js`
  Expected: PASS (기존 테스트 포함)

- [ ] **Step 5: 커밋**

  ```bash
  git add src/domain/states.js src/engine/tripPlan.js lib/trip/local.js lib/trip/runtime.js app/today/page.js test/trip-overdue.test.js docs/business-rules.md
  git commit -m "feat(engine): 외출 중 재계획으로 이미 늦으면 즉시 복귀(OUTING_OVERDUE)"
  ```

---

### Task 2: 알림 예약에 '마감 지남' 두 종류 추가

**Files:**
- Modify: `src/stay/defaults.js` (`DEFAULTS.notifications.returnPassedGraceMin: 60`)
- Modify: `lib/notify/schedule.js` (종류·문구 키·우선순위·`planNotifications` 옵션·머리 주석 표)
- Modify: `lib/notify/text.js` (새 문구 키를 받는다. `TEXT_KEYS`가 `NOTIFY_TEXT_KEY`에서 오면 변경 없음)
- Modify: `lib/notify/device.js` (열 화면을 항목 종류로 고른다)
- Modify: `src/i18n/messages/notifications.js` (safety 2개, messages 1개)
- Modify: `test/notify-schedule.test.js`, `test/notify-device.test.js`

**Interfaces:**
- Produces:
  - `NOTIFY_KIND.RETURN_PASSED = 'RETURN_PASSED'`, `NOTIFY_KIND.COMPANION_RETURN_PASSED = 'COMPANION_RETURN_PASSED'`
  - `NOTIFY_TEXT_KEY.RETURN_PASSED = 'notifications.returnPassed'`, `NOTIFY_TEXT_KEY.COMPANION_RETURN_PASSED = 'notifications.companionReturnPassed'`
  - `LATE_NOTIFY_KINDS`: 동결 배열 `[RETURN_PASSED, COMPANION_RETURN_PASSED]` (시각이 지나도 `expiresAt` 전이면 예약에 남는 종류)
  - `planNotifications(dayPlan, { nowMs, leads, companionDay = null })`: `companionDay`는 보호자 스냅샷의 날짜 하나 `{ date: string, patientReturn: Array<{ by: string|null }> }` 또는 null
  - `notificationOpenUrl(item) => '/g' | '/today'` (`lib/notify/device.js`, COMPANION 종류면 `/g`)
  - 문구 키 `notifications.openGuardianCopy`

- [ ] **Step 1: 실패하는 테스트 작성**

  `test/notify-schedule.test.js`에 `describe('복귀 마감이 지남 (설계서 4.1·4.2)')`:
  - `test('환자 외출마다 returnBy 시각에 RETURN_PASSED 하나, expiresAt 은 +60분')`: `outing()`(returnBy 18:00) 하루, `nowMs: EARLY`. `byKind(items, NOTIFY_KIND.RETURN_PASSED)`가 `[{ at: iso('18:00'), expiresAt: iso('19:00'), time: '18:00', key: NOTIFY_TEXT_KEY.RETURN_PASSED }]`.
  - `test('마감 뒤 60분 안이면 지난 시각이어도 남고, 60분이 지나면 없다')`: `nowMs: kst('18:59')`이면 RETURN_PASSED 1개, `kst('19:00')`이면 0개. 같은 `nowMs: kst('18:59')`에서 지난 RETURN(17:00·17:30)은 없다(기존 동작 그대로).
  - `test('보호자: companionDay 의 오늘 by 마다 COMPANION_RETURN_PASSED')`: `dayPlan`은 null, `companionDay: { date: DATE, patientReturn: [{ by: '15:30' }, { by: '19:00' }] }`. 항목 2개, `key`가 `NOTIFY_TEXT_KEY.COMPANION_RETURN_PASSED`, id에 사본 정보가 없다(`${DATE}:COMPANION_RETURN_PASSED:15:30:0` 꼴).
  - `test('깨진 by 는 건너뛴다')`: `patientReturn: [{ by: null }, { by: '25:00' }, { by: '' }, { by: '10:00' }]`에서 항목 1개.
  - `test('같은 시각이면 RETURN_PASSED > COMPANION_RETURN_PASSED > RETURN')`: 환자 외출 returnBy 18:00 + `companionDay` by '18:00' + 다른 외출 returnBy 18:30(30분 전 = 18:00). 18:00 항목은 하나이고 종류는 RETURN_PASSED. 환자 외출을 빼면 COMPANION_RETURN_PASSED.
  - `test('KST 기준 날짜')`: `companionDay.date`가 `DATE`가 아니면 그 날짜의 KST 시각으로 계산한다(`kst('00:30', '2026-09-21')` 등).
  - 기존 `'모든 언어 · 검수 스위치 켜짐/꺼짐에서 ... 금지어가 없고'` 테스트가 새 항목까지 돌도록 `fullPlan`에 `companionDay`를 넣은 변형을 더한다.
  - 기존 테스트 중 전체 목록을 비교하는 것은 `byKind(items, NOTIFY_KIND.RETURN)` 비교로 바꾸거나 RETURN_PASSED 기대값을 더한다. 단언의 뜻은 바꾸지 않는다.

  `test/notify-device.test.js`: `test('보호자 알림은 /g 로, 그 밖은 /today 로 연다')`: `deliverToDevice`가 만든 `options.data.url`.

- [ ] **Step 2: 실패 확인**

  Run: `node --test test/notify-schedule.test.js test/notify-device.test.js`
  Expected: FAIL (`NOTIFY_KIND.RETURN_PASSED` undefined)

- [ ] **Step 3: 구현**

  - 우선순위: RETURN_PASSED 0, COMPANION_RETURN_PASSED 1, RETURN 2, LEAVE 3, AT_LODGING 4, AWAY 5.
  - `planNotifications`: 날짜 검사를 `dayPlan` 부분과 `companionDay` 부분에 각각 둔다(둘 중 하나만 있어도 동작). 마감 지남 두 종류는 `at = 목표 시각`, `expiresAt = 목표 + leads.returnPassedGraceMin`. '지난 시각은 건너뛴다' 필터에서 `LATE_NOTIFY_KINDS`는 `nowMs < expiresMs`이면 남긴다.
  - 문구: 설계서 5절의 `notifications.returnPassed`, `notifications.companionReturnPassed`(safety), `notifications.openGuardianCopy`(messages).
  - `device.js`: `data.url`에 `notificationOpenUrl(item)`.
  - `schedule.js` 머리 주석 표에 두 줄을 더한다.

- [ ] **Step 4: 통과 확인**

  Run: `node --test test/notify-schedule.test.js test/notify-device.test.js test/notify-runtime.test.js`
  Expected: PASS

- [ ] **Step 5: 커밋**

  ```bash
  git add src/stay/defaults.js lib/notify/schedule.js lib/notify/text.js lib/notify/device.js src/i18n/messages/notifications.js test/notify-schedule.test.js test/notify-device.test.js
  git commit -m "feat(notify): 복귀 마감이 지난 시각의 환자·보호자 알림 예약"
  ```

---

### Task 3: 알림 실행기의 보호자 입력과 '이미 낸 알림' 기억

**Files:**
- Modify: `lib/store/keys.js` (`RECORD.overdueSeen`)
- Modify: `lib/store/store.js` (읽기·쓰기 3개, `purgeStayData` 삭제 대상, 구독 주제)
- Modify: `lib/notify/runtime.js` (보호자 사본 입력, 늦은 알림 기억)
- Modify: `components/pwa/NotificationBanner.js` (COMPANION 종류의 링크)
- Modify: `test/store.test.js`, `test/notify-runtime.test.js`
- Modify: `docs/security.md` (기기에 새로 기억하는 값과 삭제)

**Interfaces:**
- Consumes: Task 2의 `planNotifications(..., { companionDay })`, `LATE_NOTIFY_KINDS`, `NOTIFY_KIND`, `notificationOpenUrl`.
- Produces:
  - `RECORD.overdueSeen = 'overdueSeen'`. 저장 모양 `{ date: 'YYYY-MM-DD', notified: string[], dismissed: string[] }`, 각 배열 최대 50개, 값은 1~128자 문자열.
  - `store.readOverdueSeen(date) => { notified: readonly string[], dismissed: readonly string[] }` (저장된 `date`가 다르면 둘 다 빈 배열)
  - `store.markOverdueNotified(date, id) => { ok: boolean, code? }`
  - `store.markOverdueDismissed(date, outingId) => { ok: boolean, code? }` (Task 5가 쓴다)
  - 두 쓰기는 날짜가 바뀌었으면 이전 값을 버리고 새 날짜로 시작한다. 보기 전용이면 `STORE_ERROR.READ_ONLY`.

- [ ] **Step 1: 실패하는 테스트 작성**

  `test/store.test.js`:
  - `test('overdueSeen: 같은 날짜만 읽고, 날짜가 바뀌면 새로 시작한다')`
  - `test('overdueSeen: 보기 전용이면 READ_ONLY, 잘못된 값은 INVALID, 50개를 넘으면 오래된 것부터 버린다')`
  - `test('deleteStay 가 overdueSeen 을 지운다')`

  `test/notify-runtime.test.js` (기존 가짜 저장소·타이머 방식을 따른다):
  - `test('보호자 사본: 가장 최근에 가져온 사본의 오늘 마감만 예약한다')`: 사본 2개(예전 15:00, 최신 17:00). 예약에 17:00 COMPANION만 있다. 만료된 사본은 `readGuardianCopies`가 이미 빼므로 최신 사본이 없으면 예약 없음.
  - `test('마감 뒤 60분 안에 시작하면 한 번 내고 기억한다')`: `now = by + 20분`으로 `start()`. `deliver` 1회, `markOverdueNotified` 1회. 새 실행기를 같은 저장소로 다시 `start()`하면 `deliver` 0회.
  - `test('기억 쓰기가 실패해도 같은 실행 안에서는 한 번만 낸다')`: `markOverdueNotified`가 `{ ok: false }`. `tick()` 여러 번에도 `deliver` 1회.
  - `test('guardianCopies 가 바뀌면 다시 예약한다')`

- [ ] **Step 2: 실패 확인**

  Run: `node --test test/store.test.js test/notify-runtime.test.js`
  Expected: FAIL

- [ ] **Step 3: 구현**

  - `runtime.js`:
    - `rebuild()`에서 `companionDay`를 만든다: `store.readGuardianCopies?.()[0]?.snapshot?.days`에서 `date`가 오늘(KST)인 항목, 없으면 null.
    - `LATE_NOTIFY_KINDS` 항목 중 `store.readOverdueSeen?.(오늘).notified`에 있는 id는 뺀다.
    - `fireDue()`에서 낸 항목이 `LATE_NOTIFY_KINDS`면 `store.markOverdueNotified?.(오늘, id)`. 기존 메모리 `fired`는 그대로 둔다(쓰기 실패 대비).
    - `start()`의 구독 주제에 `'guardianCopies'`를 더한다.
  - `NotificationBanner.js`: 링크 주소는 `notificationOpenUrl(item)`, 글자는 COMPANION이면 `notifications.openGuardianCopy`, 아니면 기존 `notifications.openToday`.
  - `docs/security.md`: 기기 저장 목록에 `overdueSeen`(이미 낸 마감 지남 알림 id, 닫은 경우 1 시트의 외출 id, 날짜가 바뀌면 지움, '내 정보 지우기'와 체류 삭제 대상)을 적는다.

- [ ] **Step 4: 통과 확인**

  Run: `node --test test/store.test.js test/notify-runtime.test.js test/notify-schedule.test.js`
  Expected: PASS

- [ ] **Step 5: 커밋**

  ```bash
  git add lib/store/keys.js lib/store/store.js lib/notify/runtime.js components/pwa/NotificationBanner.js test/store.test.js test/notify-runtime.test.js docs/security.md
  git commit -m "feat(notify): 보호자 사본 마감 알림과 이미 낸 알림 기억"
  ```

---

### Task 4: 보호자 받은 일정 화면

**Files:**
- Create: `lib/notify/permission.js`
- Modify: `components/settings/SettingsScreen.js` (권한·켜기 흐름을 새 함수로 옮긴다. 동작 그대로)
- Create: `components/guardian/returnStatus.js`
- Modify: `components/guardian/GuardianCopyView.js` (스위치, 표시, 할 일, 긴급 버튼, 1분 갱신)
- Modify: `src/i18n/messages/guardian.js` (설계서 5절 guardian 키 5개)
- Modify: `app/styles/` 아래 보호자 화면 스타일 파일(지금 `guardian-` 클래스가 있는 파일)
- Create: `test/notify-permission.test.js`
- Modify: `test/guardian-screen.test.js`

**Interfaces:**
- Consumes: 기존 `store.readPrefs`, `store.writePrefs`.
- Produces:
  - `turnOnDeviceNotifications({ store, NotificationImpl = globalThis.Notification }) => Promise<'on'|'denied'|'unsupported'|'failed'>` (`lib/notify/permission.js`). 권한이 'default'면 이 안에서만 요청한다.
  - `patientReturnStatus({ date, by, nowMs }) => 'PASSED' | 'UPCOMING' | null` (`components/guardian/returnStatus.js`). `date`가 KST 오늘이 아니거나 `by`가 "HH:MM"이 아니면 null. `nowMs >= kstInstantMs(date, by)`이면 PASSED.

- [ ] **Step 1: 실패하는 테스트 작성**

  `test/notify-permission.test.js`:
  - `test('권한이 default 면 요청하고 granted 면 켠다')`, `test('denied 면 켜지 않는다')`, `test('Notification 이 없으면 unsupported')`, `test('저장 실패면 failed')`

  `test/guardian-screen.test.js`:
  - `test('patientReturnStatus: 오늘 지난 마감은 PASSED, 아직은 UPCOMING, 다른 날짜는 null')`
  - `test('patientReturnStatus: KST 기준 오늘')`: `nowMs = Date.parse('2026-11-06T15:30:00Z')`면 `date: '2026-11-07', by: '00:10'`이 PASSED, `date: '2026-11-06'`은 null.
  - `test('patientReturnStatus: 깨진 by 는 null')`: null, '', '25:00', '9:00'

- [ ] **Step 2: 실패 확인**

  Run: `node --test test/notify-permission.test.js test/guardian-screen.test.js`
  Expected: FAIL

- [ ] **Step 3: 구현**

  - `GuardianCopyView`:
    - 머리(`guardian-asof`) 아래에 '복귀 마감 알림 받기' 스위치와 `guardian.alertsNote` 안내. 스위치는 `prefs.notifications`를 보이고 켤 때 `turnOnDeviceNotifications`, 끌 때 `writePrefs({ notifications: false })`. 결과 메시지는 설정 화면이 쓰는 문구 키를 그대로 쓴다. 보기 전용이면 막는다.
    - `PatientReturns`의 각 항목에 `patientReturnStatus` 결과로 '마감 지남'(기호 + 글자, `--state-standby-*` 토큰) 또는 '예정'(회색) 표시. PASSED 항목 아래 `guardian.overdueHelp`, `tel:119` 버튼, `/emergency` 링크.
    - 지금 시각은 1분마다 갱신한다(화면을 연 채 마감이 지나면 1분 안에 바뀐다).
  - 시안(설계서 4.1, 운영자 승인 화면)과 같은 배치: 스위치 블록이 맨 위, 그 아래 날짜별 환자 복귀 마감.

- [ ] **Step 4: 통과 확인**

  Run: `node --test test/notify-permission.test.js test/guardian-screen.test.js && npm run lint`
  Expected: PASS, lint 오류 0

- [ ] **Step 5: 커밋**

  ```bash
  git add lib/notify/permission.js components/settings/SettingsScreen.js components/guardian/returnStatus.js components/guardian/GuardianCopyView.js src/i18n/messages/guardian.js app/styles test/notify-permission.test.js test/guardian-screen.test.js
  git commit -m "feat(guardian): 받은 일정 화면의 마감 지남 표시와 알림 스위치"
  ```

---

### Task 5: 환자 경우 1 시트와 즉시 복귀 시트의 복귀 장소

**Files:**
- Create: `src/engine/returnTarget.js` (`tripPlan.js`의 `returnHospitalOf`를 옮긴다. `tripPlan.js`는 여기서 가져온다)
- Modify: `src/engine/tripPlan.js`
- Modify: `components/trip/viewModel.js`
- Create: `lib/trip/overdue.js`
- Modify: `lib/trip/runtime.js` (신호·타이머·닫기)
- Modify: `lib/trip/useTrip.js`
- Modify: `components/trip/TripRuntime.js`
- Modify: `components/ReturnSheet.js`
- Modify: `src/i18n/messages/trip.js` (`return.passedTitle`, `return.passedBody`, `return.placePlanned`, `return.bodyPlace`)
- Create: `test/trip-overdue-sheet.test.js`
- Modify: `test/trip-sync-runtime.test.js`, `test/trip-view.test.js`

**Interfaces:**
- Consumes: Task 1의 `RETURN_NOW_CAUSES`, `REASON.OUTING_OVERDUE`; Task 3의 `store.readOverdueSeen`, `store.markOverdueDismissed`; Task 2의 `DEFAULTS.notifications.returnPassedGraceMin`.
- Produces:
  - `returnHospitalOf(outing, { stay, day }) => Hospital | null` (`src/engine/returnTarget.js`, 동작 그대로)
  - `returnTargetOf({ day, stay, outing }) => { kind: 'LODGING'|'HOSPITAL'|'PLANNED', name: string|null, address: string|null }` (`components/trip/viewModel.js`). 외출이 없거나 `returnPlace === 'LODGING'`이면 그날 숙소(`lodgingOf`), HOSPITAL이면 `returnHospitalOf`의 이름·도로명주소, 못 찾으면 PLANNED.
  - `overdueOutingOf(day) => Outing | null`: `slackMin < 0`인 첫 환자 외출 (`components/trip/viewModel.js`)
  - `selectOverdueReturn({ day, nowMs, dismissed, graceMin }) => { date, outingId, returnBy } | null` (`lib/trip/overdue.js`): `day.date`가 KST 오늘, `day.returnNow !== true`, `kstInstantMs(date, returnBy) <= nowMs < 그 + graceMin`, `dismissed`에 없는 환자 외출 중 `returnBy`가 가장 늦은 것.
  - `nextOverdueWakeMs({ day, nowMs, graceMin }) => number | null`: 지금 이후 가장 가까운 경계(어느 외출의 `returnBy` 또는 표시 중인 외출의 만료).
  - 실행기 상태 `overdueReturn: { date, outingId, returnBy } | null`, 메서드 `dismissOverdueReturn()`. `useTrip()`이 둘을 내보낸다.
  - `ReturnSheet` 새 props: `variant: 'CLEARED' | 'PASSED'`(기본 'CLEARED'), `outingId?: string`.

- [ ] **Step 1: 실패하는 테스트 작성**

  `test/trip-overdue-sheet.test.js`:
  - `selectOverdueReturn`: 마감 직후 고름, 60분이 지나면 null, `dismissed`에 있으면 null, `returnNow === true`면 null, 두 외출이 모두 창 안이면 늦은 쪽, 날짜가 오늘(KST)이 아니면 null, `returnBy`가 깨진 외출은 건너뜀.
  - `nextOverdueWakeMs`: 다음 마감 시각, 표시 중이면 만료 시각, 남은 것이 없으면 null.

  `test/trip-view.test.js`:
  - `returnTargetOf`: 숙소 외출은 숙소, 병원 외출은 `hospitalId`로 찾은 병원 이름·주소, 못 찾으면 `{ kind: 'PLANNED', name: null, address: null }`, 첫 병원으로 추측하지 않는다(병원 2곳, 맞는 id 없음 → PLANNED).
  - `overdueOutingOf`: `slackMin < 0`인 외출을 고른다.

  `test/trip-sync-runtime.test.js` (기존 가짜 시계·타이머 방식):
  - `test('마감이 지나면 overdueReturn 신호가 켜지고 저장 일정은 그대로다')`: 시계를 `returnBy - 1분`에서 타이머로 `returnBy + 1초`까지 진행. `getState().overdueReturn.outingId`가 그 외출, 저장 일정 객체가 같다.
  - `test('닫으면 기기에 기억하고 다시 시작해도 켜지지 않는다')`
  - `test('기억 쓰기가 실패해도 같은 실행 안에서는 다시 켜지지 않는다')`
  - `test('즉시 복귀 중이면 overdueReturn 은 null')`

- [ ] **Step 2: 실패 확인**

  Run: `node --test test/trip-overdue-sheet.test.js test/trip-view.test.js test/trip-sync-runtime.test.js`
  Expected: FAIL

- [ ] **Step 3: 구현**

  - 실행기: `refreshDerived()`에서 `overdueReturn`을 계산(`dismissed`는 저장된 값 + 이 실행의 메모리 값). 타이머 `overdueTimer`를 `min(nextOverdueWakeMs - now, 60_000)`로 건다(최소 1초). `stop()`에서 지운다. `dismissOverdueReturn()`은 `store.markOverdueDismissed` 후 메모리에도 더하고 `refreshDerived()`.
  - `TripRuntime`: 즉시 복귀 신호가 없고 `overdueReturn`이 있으면 `<ReturnSheet variant="PASSED" outingId=...>`. 시트를 열지 않는 경로(`NO_SHEET_PATHS`)는 그대로.
  - `ReturnSheet`:
    - PASSED: 제목·본문은 `return.passedTitle`·`return.passedBody` 안전 문구 두 줄, 원인 줄 없음, 장소는 그 외출의 `returnTargetOf`.
    - CLEARED이고 원인이 `OUTING_OVERDUE`: 장소는 `returnTargetOf({ outing: overdueOutingOf(day) })`, 장소가 LODGING이 아니면 본문 `return.bodyPlace`.
    - 그 밖의 원인: 지금 그대로(숙소).
    - 장소 제목 아이콘은 LODGING `bed`, HOSPITAL `hospital`, PLANNED `flag`. PLANNED면 이름 자리에 `return.placePlanned`. 한국어 복귀 카드 링크는 LODGING일 때만 보인다.

- [ ] **Step 4: 통과 확인**

  Run: `npm test && npm run lint`
  Expected: PASS, lint 오류 0

- [ ] **Step 5: 커밋**

  ```bash
  git add src/engine/returnTarget.js src/engine/tripPlan.js components/trip/viewModel.js lib/trip/overdue.js lib/trip/runtime.js lib/trip/useTrip.js components/trip/TripRuntime.js components/ReturnSheet.js src/i18n/messages/trip.js test/trip-overdue-sheet.test.js test/trip-view.test.js test/trip-sync-runtime.test.js
  git commit -m "feat(trip): 마감이 지나면 복귀 시트(일정 유지)와 복귀 장소 표시"
  ```

---

### Task 6: 화면 테스트와 문서 마감

**Files:**
- Create: `e2e/overdue-return.spec.js`
- Modify: `docs/tracking/status.md`, `docs/tracking/findings.md`, `docs/business-rules.md`(경우 1·보호자 알림)

**Interfaces:**
- Consumes: Task 1~5 전부.

- [ ] **Step 1: 화면 테스트 작성** (`e2e/overdue-return.spec.js`)

  설정은 기존 `e2e/helpers.js`(`startTrip`, `seedStay`, `readRecord`, `loginDemo`)와 `e2e/guardian.spec.js`·`e2e/demo-events.spec.js`의 흐름을 따른다. 시각이 필요한 곳은 Playwright `page.clock`으로 브라우저 시계를 고정한다(오늘 시각에 따라 건너뛰는 테스트를 새로 만들지 않는다, findings 3번).

  - `test('환자: 외출 마감이 지나면 "복귀 마감 시각이 지났어요" 시트가 뜨고, 확인 뒤 새로 고쳐도 다시 뜨지 않으며 일정은 그대로다')`: 시트 제목, 돌아갈 곳(숙소 이름), '확인했어요' 뒤 새로 고침에도 시트 없음, 저장 일정의 정거장 수가 같다.
  - `test('환자: 외출 중 병원 일정이 지금보다 앞당겨지면 남은 일정을 비우고 "지금 돌아가세요" 시트에 새 사유가 보인다')`: 데모 사건으로 만든다. 사유 문구(설계서 5절 ko).
  - `test('보호자: 받은 일정 화면에서 지난 마감에 "마감 지남"과 119 버튼, 아직인 마감에 "예정", 맨 위에 알림 스위치')`
  - 세 화면 모두 `expectNoAxeViolations`, 320px에서 `expectNoHorizontalScroll`.

- [ ] **Step 2: 화면 테스트 실행**

  Run: `npx playwright test e2e/overdue-return.spec.js`
  Expected: PASS (건너뜀 0)

- [ ] **Step 3: 문서**

  - `status.md`: 남은 것 1을 완료로 옮기고, 3번(서버 저장과 동기화)에 '보호자 서버 푸시와 환자 복귀 확인(설계서 9절)'을 적는다. 검증 수치(unit·e2e 개수, 날짜)를 고친다.
  - `findings.md`: 4번 표의 '복귀 마감이 지나면 즉시 복귀' 줄에 해결 날짜와 이 브랜치를 적는다.
  - `business-rules.md`: 즉시 복귀 절에 경우 1(시트만, 일정 유지, 외출마다 한 번, 60분)과 보호자 알림을 적는다.

- [ ] **Step 4: 전체 관문**

  Run: `npm run lint && npm test && npm run build && npm run e2e`
  Expected: lint 오류 0, unit 전부 통과, build 성공, e2e 전부 통과

- [ ] **Step 5: 커밋**

  ```bash
  git add e2e/overdue-return.spec.js docs/tracking/status.md docs/tracking/findings.md docs/business-rules.md
  git commit -m "test(e2e): 복귀 마감 지남 시트·즉시 복귀·보호자 표시와 문서 마감"
  ```
