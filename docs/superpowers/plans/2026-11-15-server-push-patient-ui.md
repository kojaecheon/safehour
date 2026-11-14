# 서버 알림 환자 쪽 화면 (갈래 2 단계 A-2) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 환자 기기에 서버 알림을 붙인다. 보호자 링크 동의 화면의 선택 항목으로 지켜보기를 등록하고, 남은 체류 기간의 복귀 마감을 올리고, '돌아왔어요'와 되돌리기를 보내고, 기기와 서버의 지켜보기를 지우는 길을 만든다. 운영 스위치가 꺼진 채 병합하므로 운영 화면은 바뀌지 않는다(`GET /api/push/config`가 꺼짐을 알리면 새 항목이 모두 숨는다).

**Architecture:** 날짜별 환자 복귀 마감 계산은 `src/guardian/deadlines.js` 한 곳에 두고 보호자 스냅샷과 업로드가 함께 쓴다. 요청 모양(형식, 한도, 본문 허용 목록, 응답 분류)은 순수 모듈 `src/guardian/watchRequests.js`에 두어 기기 저장소의 삭제 대기와 `lib/trip/watchApi.js`가 함께 쓴다. 기기 상태는 계정 레코드 `guardianWatch`와 기기 키 `pendingServerDelete` 둘이다. 무엇을 보낼지는 순수 함수(`lib/trip/watchPlan.js`)가 정하고, 계기를 받아 요청을 하나씩 보내고 결과를 반영하는 것은 실행기(`lib/trip/watchSync.js`)가 맡는다. 화면은 훅(`lib/trip/useWatch.js`)만 쓴다.

**Tech Stack:** Next.js 16 App Router 화면(plain JS, React), 브라우저 `localStorage`, `fetch`, WebCrypto `getRandomValues`, `node --test`, Playwright. 새 패키지 없음.

**Spec:** `docs/superpowers/specs/2026-11-09-server-push-design.md`(3절 (b)·(d)·(e), 5.5, 8.1, 11.1, '구현에서 달라진 것'), `docs/contracts.md` '서버 알림'(지금 유효한 계약), `docs/decisions/0012-server-minimal-storage-guardian-push.md`, A-1 계획 `docs/superpowers/plans/2026-11-14-server-push-foundation.md`. 아래 '설계서와 다르게 정한 것'이 설계서 본문보다 우선한다.

## Global Constraints

- `package.json`, `package-lock.json`을 바꾸지 않는다. 새 패키지와 npm 스크립트를 더하지 않는다.
- 새로 쓰는 글(코드 주석, 문서, 화면 문구, 커밋 메시지)에 엠대시와 엔대시를 쓰지 않는다. 쉼표, 괄호, 콜론을 쓴다.
- 주석과 문서는 한국어로 쓴다. plain JS. 어느 언어 문구에도 '안전합니다'(같은 뜻의 번역 포함)를 쓰지 않는다.
- 화면 문구는 `src/i18n/messages/<기능>.js`에만, 네 언어 모두 둔다. 복귀·전달 상태 문장은 그 파일의 `safety` 블록에 둔다(일본어·중국어는 검수 스위치 전까지 영어+한국어로 보인다). 버튼 이름, 동의 목록, 설정 상태 줄은 `messages`에 둔다.
- 색·크기 값은 `app/globals.css`의 토큰만 쓴다. 기능 스타일 파일(`app/styles/*.css`)은 토큰을 참조만 한다.
- 안전 표시: 본문 16px 이상, 누르는 곳 44px 이상, 색만으로 뜻을 전하지 않는다(늘 문장이 함께 있다), WCAG AA. 상태가 바뀌는 줄은 `role="status"`.
- 위치를 묻거나 읽지 않는다. '돌아왔어요'는 버튼이 눌렸다는 신호일 뿐이고 일정을 바꾸지 않으며 판정을 새로 하지 않는다.
- 서버 코드는 Task 1의 `lib/server/watch/arm.js` 상수 한 줄 말고 바꾸지 않는다. 서버에 필드나 경로가 더 필요해 보이면 멈추고 보고한다.
- `watchId`, `writeToken`, 날짜, 시각을 `console`, 오류 메시지, URL 경로·쿼리에 싣지 않는다. 식별 값은 요청 본문으로만 보낸다.
- 잠금 화면 문구를 더하지 않는다(환자 기기 푸시는 범위 밖). 기기 알림 문구를 건드리게 되면 멈추고 보고한다.
- 시계, `fetch`, 타이머, 난수는 주입한다. 날짜·시각은 `src/stay/time.js` 도우미(`kstInstantMs`, `addDays`, `isDateString`, `isClockTime`)와 `kstClock(nowMs).date`(`src/engine/tripPlan.js`)로만 계산한다. 오프셋 없는 문자열을 `new Date()`로 읽지 않는다.
- 클라이언트 코드(`components/`, `app/`의 화면, `lib/store/`, `lib/trip/`, `src/guardian/`)는 `lib/server/`, `src/auth/`, `src/push/`를 불러오지 않는다. 테스트는 불러도 된다. `lib/store/`는 `lib/trip/`을 불러오지 않는다.
- `node --test`가 읽는 모듈은 상대 경로로 불러온다(`@/` 별칭 금지). 새 테스트 파일은 `test/` 바로 아래 `*.test.js`다.
- 단위 테스트는 외부 호출 0건이다. 화면 테스트는 `page.route`로 `/api/push/config`와 `/api/watch*`를 대신한다(화면 테스트 서버는 서버 알림 스위치가 꺼져 있다).
- 범위 밖(D15): 환자 기기 푸시(질문 21), 보호자 화면과 서비스 워커(A-3), 운영 켜기(A-4). "서버에 데이터베이스가 없고" 문장과 화면의 약속 문구는 그대로 둔다.
- 기존 시험이 새 결정과 부딪히면 의도적으로 고치고 이유를 커밋 메시지에 적는다. 조용히 지우거나 건너뛰지 않는다.
- 커밋 메시지 끝줄: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 각 작업의 마지막 확인: `npm run lint && npm test`.

## 설계서와 다르게 정한 것 (이 계획이 정본, Task 12에서 설계서에 옮긴다)

운영자 결정(D1~D16)에 따른 것:

1. **'올리지 못함' 표시는 레코드 안의 필드다.** 설계서의 `guardianWatch.pending` 키 대신 계정 레코드 `guardianWatch` 하나에 `uploadPending`, `lastUploaded`, `backQueue`, `state`를 함께 둔다(D3). 보기 전용 예외는 `backQueue` 쓰기 하나뿐이다.
2. **오늘 지난 마감은 고정이다.** 오늘(KST) 지금 이전 시각은 `lastUploaded[오늘]`에 이미 있는 것만 보내고 새로 더하지 않는다. 마지막으로 올린 지난 시각은 일정에서 빠졌어도 모두 남긴다(D1. 어제는 올리지 않고 서버에 마지막으로 올린 그대로 남는다). 경우 2 재계획이 마감을 지금으로 당겨도 서버의 원래 마감과 확인 표시가 사라지지 않고, 지난 시각을 새로 올려 곧바로 보호자 알림이 가는 일도 없다. 지금 이후 시각은 묶이지 않은 외출의 지금 마감과 묶인 외출(24)의 원래 마감만 남긴다(2026-11-15 두 번째 검토 반영. 한때 '묶인 외출이 있는 날은 올린 시각을 모두 남긴다'로 했으나, 늦게 켠 날 일정에서 빠진 마감이 남아 누를 버튼 없는 알림이 가고 하루 10개 상한이 살아 있는 마감을 밀어내는 문제가 있어 좁혔다).
3. **일찍 온 허용 30초는 기본값 파일에 둔다.** `DEFAULTS.notifications.serverPushEarlyToleranceSec: 30`이고 `arm.js`의 `EARLY_TOLERANCE_MS`는 거기서 만든다(D5). 클라이언트는 되돌리기 마감에 같은 값을 쓴다.
4. **법무 검토 전 배지를 두지 않는다.** 운영자 결정(2026-11-08)대로 `conditions.consentLegalReview` 안내 줄을 쓴다(D12). 설계서 5.5 제목과 `docs/security.md`의 배지 문장을 고친다.
5. **등록이 실패해도 링크는 만든다.** `watchId` 없이 만들고 이유별 한 줄을 보인다(D6).
6. **'보호자 다시 연결'은 따로 만들지 않는다.** 설정에서 끈 뒤 링크를 만들며 다시 켜면 새 `watchId`다(D11).

이 계획에서 더한 것:

7. **일정 저장 지점이 아니라 `tripPlan` 레코드 구독에 붙인다.** 설계서는 "저장 지점 한 곳"이라 했지만 `writeTripPlan`을 부르는 곳이 여섯이다. 구독은 다른 탭의 변경도 받는다.
8. **어제 날짜는 올리지 않는다.** 서버가 오늘 이전 날짜를 버리고, 서버의 어제 기록은 마지막으로 올린 그대로 남는다. 기기는 `lastUploaded`에 어제를 남겨 경우 2의 `by`를 찾는 데만 쓴다.
9. **보기 전용에서는 마감을 올리지 않는다.** 근거는 Task 7 '정한 값'. '돌아왔어요' 보내기와 서버 삭제 대기는 보기 전용에서도 동작한다.
10. **보내는 순서는 올리기 다음 '돌아왔어요'다.** 올리기는 지난 마감을 지우지 않으므로 먼저 보내도 확인 대상이 사라지지 않고, 아직 서버에 없던 마감을 확인하는 경우를 살린다.
11. **시트에서 '돌아왔어요'를 눌러도 시트를 닫지 않는다.** 설계서 3(d)는 닫힌다고 했다. 닫으면 지난 마감의 되돌리기에 닿을 곳이 없다(D10이 시트 안 되돌리기를 요구한다). 닫기는 지금의 '확인했어요'가 한다.
12. **켜진(ON) 지켜보기로 링크를 다시 만들 때는 등록을 다시 보내지 않는다.** 다시 등록은 지켜보기당 5회 한도라 링크를 다시 보낼 때마다 쓰면 막힌다. REPLACED에서 켜면 같은 `watchId`에 새 토큰으로 다시 등록한다.
13. **동의 철회의 지우기는 `store.withdrawSensitiveConsent` 안에서 한다.** 철회가 일어나는 곳이 그 함수 하나라 실행기가 안 떠 있어도 빠지지 않는다(D11이 가리킨 `runtime.js`의 `diff.consentWithdrawn`보다 앞선 같은 사건).
14. **'당겨진 외출' 판정을 함수 하나로 모은다.** `src/domain/states.js`의 `isClampedOverdueOuting`을 `lib/notify/schedule.js`와 마감 계산이 함께 쓴다. 같은 판정의 두 번째 경로를 만들지 않는다.
15. **보호자 스냅샷은 당겨진 외출도 지금처럼 담는다.** 공용 함수를 쓰되 스냅샷 출력은 바꾸지 않는다. 업로드만 당겨진 마감을 뺀다.
16. **'전달했어요' 상태는 메모리에만 둔다.** D3 레코드 모양을 지키기 위해서다. 새로 고치면 버튼이 다시 보이고(다시 눌러도 같은 결과), 되돌리기는 누른 실행 안에서만 된다. 대기 중인 것은 `backQueue`로 다시 그린다.
17. **서버 삭제 대기는 기기 저장소가 직접 보낸다.** 로그아웃 보류와 같은 방식이다. 지켜보기마다 하나씩 동시에 보내고 10초 제한, 10개 상한(넘으면 오래된 것부터 버리고 서버 TTL에 맡긴다), 400도 버린다.
18. **설정의 '서버 알림' 절은 스위치가 켜져 있거나 이 기기에 지켜보기 레코드가 있을 때만 보인다.**
19. **동의 문구의 빈칸은 설계서 11.1 확인 결과로 채운다.** 예약 업체 기록 보관 3일, 저장 위치 일본 도쿄, 예약 메시지는 유럽 또는 미국. 콘솔 최종 확인은 `docs/tracking/status.md`의 A-4 '진행을 막는 것'에 적는다.
20. **동의 항목의 처음 체크 상태는 지켜보기가 ON일 때만 켜짐이다.** 체크를 끈 채 링크를 만들면 있는 지켜보기를 지운다(보호자 사본과 서버 상태가 어긋나지 않게). 항목이 숨어 있을 때는 지켜보기를 건드리지 않는다.
21. **경우 1의 `by`는 `trip.overdueReturn.returnBy`다.** 외출의 지금 `returnBy`보다 재계획에 강하다(Task 6).
22. **요청 보내기와 결과 판정은 `src/guardian/watchSend.js` 하나다**(Task 3 검토 반영, 2026-11-15). `sendWatchRequest`와 결과 규칙(2xx이면서 `data.ok === true`일 때만 `OK`)을 그 파일에 두고 `lib/trip/watchApi.js`는 다시 내보내기만 한다. `lib/store/`는 `lib/trip/`을 불러올 수 없어, Task 5의 서버 삭제 대기도 같은 함수를 쓰려면 이 자리여야 한다. 시간 제한은 `fetchImpl`이 신호를 무시해도 타이머와 경주해 `NETWORK`로 끝난다.
23. **'당겨진 외출' 판정은 오늘 카드(`components/trip/viewModel.js`의 `todayFocus`)도 `isClampedOverdueOuting`을 쓴다**(Task 3 검토 반영). Task 9의 '돌아왔어요' 대상과 카드가 같은 판정을 본다.
24. **묶인 외출**(`isHeldOuting`, `lib/trip/watchPlan.js`, 2026-11-15 두 번째 검토 반영). 묶인 외출은 당겨진 외출(`isClampedOverdueOuting`이거나 `isPulledDeadlineOuting`이거나, 출발 뒤 `returnBy`가 출발 시각보다 늦지 않은 외출)이거나, 이미 출발했고 지난 `returnBy`를 그 날짜에 올린 적 없는 외출이다. 오늘 업로드 목록은 `lastUploaded[오늘]`의 지난 시각, 묶이지 않은 외출의 지금 이후 `returnBy`, 묶인 외출의 원래 마감 셋의 합이고, 그 밖의 지나지 않은 올린 시각은 남기지 않는다. 원래 마감은 `lastUploaded[그날]` 중 출발보다 늦고 그날 다음 환자 외출의 출발보다 이르며 묶이지 않은 다른 외출의 지금 `returnBy`가 아닌 가장 이른 시각(없으면 `null`)이고, '돌아왔어요' 대상(`backTargetOf`)도 같은 함수로 찾는다. 하루 10개를 넘으면 지금 마감, 원래 마감, 최근 지난 시각 순으로 남긴다. `isPulledDeadlineOuting`은 엔진의 `pulledDeadline`을 `src/domain/states.js`로 옮긴 것이라 엔진과 서버 알림이 같은 판정을 쓴다.
25. **마감이 같은 외출이 여럿이면 '돌아왔어요'는 그날 가장 늦게 출발하는 외출에만 있다. 이미 보낸 확인은 나중 외출이 생기면 스스로 되돌린다**(2026-11-15 세 번째 검토 반영). 서버는 확인을 `(date, by)`로만 기억하고 그 시각이 목록에 남는 동안 지킨다. 그래서 앞 외출(B)에서 누른 확인이 같은 마감의 나중 외출(C)을 덮어, C에서 돌아오지 않아도 보호자 알림이 가지 않았다(엔진 표본 120일 중 95일에 같은 마감을 가진 외출이 둘 이상이다, 흔히 21:00).
    - `backTargetOf`: 대상 `(date, by)`를 구한 뒤, 같은 날 이 외출보다 늦게 출발하는 다른 환자 외출의 대상(출발 전이어도 출발 검사 없이 같은 규칙으로 구한 것)이 같은 `by`면 `null`.
    - 레코드에 `confirmed: Array<{ date, by, atMs, departAt }>`를 더한다(기기 레코드의 필드, 새 저장 키가 아니다). `atMs`는 누른 시각, `departAt`은 누른 외출의 출발 시각이다(대기열 항목이 들고 간다. 요청 본문에는 싣지 않는다). 마지막 검토 반영. 확인이 `recorded: true`로 끝나면 넣고, 되돌리기가 끝나면 뺀다. 어제보다 앞 날짜는 버리고 20개 상한. 같은 `watchId` 다시 등록(REPLACED)에서는 남긴다(서버가 그 날짜 기록을 지키므로). 새 `watchId`면 비운다.
    - 실행기는 매 실행에서 `confirmed` 항목과 보내지 않은 확인마다, 그 날짜에 대상이 같은 `by`이고 누른 외출보다 늦게 출발하는(`departAt`이 없으면 누른 분에서 2분 뺀 때보다 늦게 출발하는) 환자 외출이 있으면 되돌린다. 보내지 않은 확인은 요청 없이 거두고(마감과 상관없다), 보낸 확인은 되돌리기 마감 전일 때만 `undo: true`를 대기열에 넣는다. `confirmed`에서 빼고 그 대상의 메모리 단계를 비운다(C의 버튼이 B의 '전달했어요'를 물려받지 않게). 보기 전용에서도 한다. 업로드가 끝나면 목록에서 빠진 시각의 `confirmed` 항목을 지운다. 누른 시각으로 비교하던 처음 규칙은 누른 직후 1분 안에 생긴 나중 외출(엔진이 출발을 지금 분으로 내린다)을 놓쳐 바꿨다(마지막 검토 반영).
26. **원래 마감을 찾지 못한 묶인 외출은 앞 외출과 같은 마감을 쓴다**(2026-11-15 세 번째 검토 반영). `originalDeadlineOf`가 `null`이면, 같은 범위(출발보다 늦고 다음 외출 출발보다 이름)의 올린 시각 중 이 외출보다 먼저 출발한 묶이지 않은 외출의 지금 `returnBy`와 같은 가장 이른 시각을 쓴다. 이미 서버에 있는 시각이라 업로드는 바뀌지 않고, 25에 따라 앞 외출의 버튼은 사라진다. 제외 규칙(다른 외출의 지금 마감은 원래 마감이 아니다)을 없애거나 시간으로 자르면 업로드가 되풀이되거나 고아 시각이 생긴다(검토 시뮬레이터).


알고 남기는 틈 (Task 12에서 `docs/engineering-notes.md`에 적는다):

- **다음 외출이 없는 날, 지난 마감을 올린 적 없는 외출은 일정에서 빠진 나중 외출의 마감을 원래 마감으로 본다.** 올린 기록만으로는 풀린 당김의 원래 마감과 구별할 수 없어 남긴다(놓치는 쪽보다 낫다). 그 외출의 '돌아왔어요'가 그 시각을 확인한다.
- **올린 적 없는 지난 마감에는 '돌아왔어요' 버튼이 없다**(24). 마감 뒤에 처음 등록했거나 오프라인이라 마감 전에 올리지 못한 외출이다. 서버에도 그 마감이 없어 보호자 알림이 가지 않는다.
- **자정 뒤 어제 외출을 처음 누르는 화면이 없다.** 마감 지남 시트와 오늘 카드는 오늘 날짜만 본다(지난 날 화면에서 다시 연 시트에도 버튼을 두지 않는다, 화면 검토 반영). 자정 전에 누른 것(대기 포함)은 어제 날짜로 보낸다.
- **404는 갈아 끼움, 만료, '서버에 남은 내 정보 지우기'를 구분하지 못한다.** 문구는 D9대로 하나다.
- **D1의 결과로, 지난 뒤 늘어난 마감은 예전 시각에도 알림이 갈 수 있다.**
- **같은 마감의 앞 외출이 있고 나중 외출이 당김으로 빠진 날에는 빠진 외출의 마감이 묶인 외출의 원래 마감이 된다.** 그 외출의 '돌아왔어요'는 빠진 시각을 확인하고, 앞 외출의 마감은 확인되지 않아 알림이 갈 수 있다(놓치는 쪽이 아니다). 고치려면 올린 기록에 외출 단위 식별이 필요하다.
- **외출 중 지난 마감이 늘어나 올라간 뒤 그 외출이 묶이면, 가장 이른 후보를 고르는 규칙이 지난 시각을 원래 마감으로 고르고 늘어난 마감을 뺀다.** 드문 경우다. 지금 이후 후보를 먼저 고르면 흔한 '늦은 뒤 묶임'이 깨진다.
- **하루 10개가 지금 마감과 원래 마감으로 차면, 묶이지 않은 외출의 지난 마감이 빠져도 버튼은 그 시각을 가리킨다.** 서버는 `recorded: false`로 답하고 화면은 실패 줄을 보인다.

## 공용 모양

**`guardianWatch` 계정 레코드** (`safehour.v2.<계정 키>.guardianWatch`, `lib/store/guardianWatch.js`가 정규화)

```js
{
  watchId: string,       // 22자 base64url
  writeToken: string,    // 43자 base64url
  expiresOn: string,     // 서버가 마지막으로 받아들인 업로드의 출국일(보낸 값 그대로, 서버 상한 전)
  lastUploaded: { [date: string]: string[] }, // 마지막으로 서버가 받아들인 날짜별 마감(빈 목록 포함) + 어제 것
  uploadPending: boolean, // 서버가 최신 전체를 다 걸었는지 모른다: 같아도 다시 보낸다
  backQueue: Array<{ date: string, by: string, undo: boolean, atMs: number, departAt: string|null }>, // 최대 20, 오래된 것이 앞. atMs·departAt 은 기기에만(다르게 정한 것 25)
  confirmed: Array<{ date: string, by: string, atMs: number, departAt: string|null }>, // 서버가 recorded: true 로 받은 확인, 최대 20(다르게 정한 것 25)
  state: 'ON' | 'REPLACED',
}
```

- 쓰기: `writeGuardianWatch`는 쓰기 가능할 때만. `writeBackQueue`는 계정 키가 있고 레코드가 있으면 보기 전용에서도 되며 `backQueue`만 바꾼다.
- `writeGuardianWatch`는 같은 `watchId`의 레코드가 저장돼 있으면 저장된 `backQueue`를 그대로 둔다. 받은 `backQueue`는 새로 만들 때(레코드가 없거나 `watchId`가 다를 때)만 쓴다. 대기열은 `writeBackQueue`로만 바꾼다(Task 5 검토 반영 2026-11-15: 앞서 읽은 레코드로 올리기 결과를 쓰는 동안 눌린 '돌아왔어요'를 덮지 않는다).
- 형식이 틀린 레코드는 읽을 때 `null`이다.
- 저장소 쓰기 실패는 `{ ok: false, code }`다(저장소의 기존 `fail()` 약속, Task 5에서 정함. `errorCode`가 아니다). `writeBackQueue`는 레코드가 없으면 `NO_GUARDIAN_WATCH`, 목록이 아니면 `INVALID`, 잠김·계정 키 없음·로그아웃 보류면 `READ_ONLY`.
- `writeGuardianWatch(null)`은 서버 삭제 대기를 만들지 않는다. 끄기는 반드시 `retireGuardianWatch()`로 한다(Task 5에서 정함).
- `buildUploadState`는 체류 날짜나 일정의 날짜 목록(`tripPlan.days`)을 읽지 못하면 `null`이다. 빈 `days`(서버 기록을 지운다)를 올리지 않기 위해서다(Task 6에서 정함). 출국일이 오늘보다 앞이고 오늘 이후로 올린 날짜가 없어도 `null`이다(할 일 없음). 실행기는 `null`이면 올리지 않는다.

**`pendingServerDelete` 기기 키** (`safehour.v2.device.pendingServerDelete`): `Array<{ watchId, writeToken }>`, 최대 10, `watchId`로 겹치지 않는다. '이 기기에서 내 정보 지우기'가 남기는 세 번째 키다(언어, 로그아웃 보류 다음).

**요청 결과 종류** (`WATCH_KIND`): `OK`, `NOT_FOUND`(404), `LOGIN_REQUIRED`(401), `RATE_LIMITED`(429), `OFF`(503 `SAFEHOUR_SERVER_PUSH_OFF`), `BAD`(400), `UNAVAILABLE`(503 그 밖, 5xx, 모르는 상태), `NETWORK`(연결 실패, 시간 초과).

**`WatchResult`** (`lib/trip/watchApi.js`, 던지지 않는다): `{ ok: true, status, data, kind: 'OK' }` 또는 `{ ok: false, status, network, errorCode, kind }`.

**'돌아왔어요' 단계** (`backStatus`가 돌려준다, 없으면 `null` = 아직 누르지 않음): `QUEUED`(대기, 보내는 중 아님), `UNDO_QUEUED`(되돌리기 대기), `SENDING`, `SENT`(서버가 `recorded: true`), `FAILED`, `UNDO_FAILED`.

**시각 규칙**

- 오늘 `today = kstClock(nowMs).date`, 어제 `addDays(today, -1)`.
- 보낼 시각 `fireAtMs = kstInstantMs(date, by) + serverPushGraceMin * 60_000`(10분).
- 되돌리기 마감 `undoUntilMs = fireAtMs - serverPushEarlyToleranceSec * 1000`(30초). 23:55 마감은 다음 날 00:04:30.
- 외출 시작: `kstInstantMs(day.date, outing.departAt) <= nowMs`.

**올리는 계기**: `tripPlan`·`stay` 레코드 변경, 앱 열기(`useTrip` 효과), 화면 복귀(`visibilitychange`·`pageshow`), KST 자정 + 1초 타이머, 온라인 복귀, 쓰기 가능 복귀, 등록 직후, `armFailed` 재시도 타이머, '돌아왔어요'·되돌리기 누름.

## Review Focus

테스트가 없으면 놓치기 쉬운 다섯 가지다. 각 줄 끝의 작업이 그 테스트를 갖는다.

1. **KST 자정.** 23:55 마감을 23:58에 오프라인으로 누르고 00:05에 연결되면 본문의 `date`는 어제(외출이 속한 날)다. 00:05의 올리기는 어제를 보내지 않지만 `lastUploaded`에 어제를 남긴다. 서버는 그 확인을 받아들인다. 되돌리기 마감은 00:04:30이다. (Task 3, 6, 7)
2. **오프라인 뒤 온라인 순서.** 누른 것은 먼저 `backQueue`에 들어간다. 연결되면 올리기(필요할 때) 다음에 대기열을 오래된 순으로 보낸다. 지켜보기 하나에 요청은 한 번에 하나다. `recorded: true` 전에는 '전달했어요'가 없다. 새로 고쳐도 대기열이 남는다. (Task 5, 7, 11)
3. **404 갈아 끼움.** 올리기든 '돌아왔어요'든 404면 `state: 'REPLACED'`로 바꾸고 올리기를 멈추며 버튼을 숨기고 설정에 "다른 기기에서 서버 알림을 다시 설정했어요"를 보인다. 대기열의 확인은 `FAILED`다. 링크를 만들며 다시 켜면 같은 `watchId`에 새 토큰으로 등록한다. 예전 토큰은 서버에서 404다. (Task 3, 7, 10, 11)
4. **보기 전용에서 누르기.** 세션 만료·세션 없음에서도 누를 수 있고, 저장소에는 `backQueue`만 쓴다. 올리기와 등록은 하지 않는다. 오프라인 보기 전용은 대기에 남는다. (Task 5, 7, 11)
5. **경우 2.** `OUTING_OVERDUE` 날의 당겨진 외출은 새로 올리지 않지만 이미 올린 원래 마감은 지났든 아니든 지우지 않는다(D1 보강). '돌아왔어요'의 `by`는 그 원래 마감이고, 찾지 못하면 버튼이 없다. 다른 즉시 복귀 원인(환자 호출, 지침 철회·만료)의 날은 실제 마감을 올린다. (Task 2, 6, 9, 11)

## 파일 구조

```
src/stay/defaults.js                   serverPushEarlyToleranceSec (Task 1)
lib/server/watch/arm.js                EARLY_TOLERANCE_MS 를 기본값에서 만든다 (Task 1)
src/domain/states.js                   isClampedOverdueOuting (Task 2)
lib/notify/schedule.js                 위 함수를 쓴다, 동작은 같다 (Task 2)
src/guardian/
  deadlines.js                         patientReturnsOf, patientDeadlineDays (새, Task 2)
  snapshot.js                          buildDay 가 deadlines.js 를 쓴다 (Task 2), watchId (Task 4)
  watchRequests.js                     형식·한도·경로·요청 모양·응답 분류·새 id (새, Task 3)
components/guardian/share.js           지문과 다시 보내기 판단에 watchId (Task 4)
lib/trip/
  watchApi.js                          /api/push/config, /api/watch* 부르기 (새, Task 3)
  watchPlan.js                         올릴 상태, 누를 대상, 되돌리기 마감, 대기열 규칙 (새·순수, Task 6)
  watchSync.js                         계기, 직렬 요청, 결과 반영 (새, Task 7)
  useWatch.js                          화면 훅 (새, Task 7)
  client.js, useTrip.js, runtime.js    연결 (Task 7)
lib/store/
  keys.js                              RECORD.guardianWatch, DEVICE_KEY.pendingServerDelete (Task 5)
  guardianWatch.js                     레코드·대기열·삭제 대기 정규화 (새, Task 5)
  store.js, index.js                   읽기·쓰기·보기 전용 예외·삭제 대기·지우기 경로 (Task 5)
components/guardian/
  serverPush.js                        항목 표시·처음 체크·결과 문구 고르기 (새, Task 8)
  GuardianCreate.js, hooks.js          동의 화면 항목, 등록, 다시 보내기 판단 (Task 8)
components/trip/
  returnedView.js                      단계에서 버튼·문구 고르기 (새, Task 9)
  ReturnedConfirm.js                   '돌아왔어요' 부품 (새, Task 9)
  TripRuntime.js                       경우 1 시트에 passedBy (Task 9)
components/ReturnSheet.js              시트에 부품 (Task 9)
app/today/page.js                      외출 카드에 부품 (Task 9)
components/settings/
  serverPushView.js                    절 표시 규칙 (새, Task 10)
  ServerPushSection.js                 '서버 알림' 절 (새, Task 10)
  SettingsScreen.js                    절 넣기 (Task 10)
src/i18n/messages/guardian.js · trip.js · settings.js   문구 (Task 8, 9, 10)
app/styles/guardian.css · trip.css · today.css · settings.css   토큰만 (Task 8, 9, 10)
e2e/helpers.js, e2e/server-push.spec.js                 (Task 11)
test/watch-fixtures.js                 watchRouteEnv() (Task 3)
```

---

### Task 1: 일찍 온 허용 폭을 기본값으로 (D5)

**Files:**
- Modify: `src/stay/defaults.js`, `lib/server/watch/arm.js`
- Test: `test/stay-contract.test.js`, `test/watch-config.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `DEFAULTS.notifications.serverPushEarlyToleranceSec === 30`. `EARLY_TOLERANCE_MS`(`arm.js`)는 이름과 값(30000)이 그대로이고 `DEFAULTS.notifications.serverPushEarlyToleranceSec * 1000`으로 만든다.

정한 값:
- 주석: "서버 알림 예약이 보낼 시각보다 이만큼 일찍 와도 받아들이는 폭. '돌아왔어요' 되돌리기 마감(보낼 시각에서 이 값을 뺀 때)에도 쓴다. 안전 판정 숫자가 아니다."
- `due.js`, `patient.js`, `test/watch-patient.test.js`, `test/watch-outbound.test.js`는 `EARLY_TOLERANCE_MS`를 그대로 불러 쓰므로 고치지 않는다.

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/stay-contract.test.js: DEFAULTS.notifications 의 deepEqual 에 serverPushEarlyToleranceSec: 30 을 더한다
// test/watch-config.test.js
test('EARLY_TOLERANCE_MS 는 기본값 파일에서 나온다', () => {
  assert.equal(DEFAULTS.notifications.serverPushEarlyToleranceSec, 30);
  assert.equal(EARLY_TOLERANCE_MS, DEFAULTS.notifications.serverPushEarlyToleranceSec * 1000);
});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `refactor(watch): 일찍 온 예약 허용 폭을 기본값 파일로 옮김(serverPushEarlyToleranceSec)`

---

### Task 2: 마감 계산 공용 함수 (D2, D8)

**Files:**
- Create: `src/guardian/deadlines.js`
- Modify: `src/domain/states.js`, `lib/notify/schedule.js`, `src/guardian/snapshot.js`(`buildDay`만), `src/guardian/index.js`
- Test: `test/guardian-deadlines.test.js`(새). 기존 `test/notify-schedule.test.js`, `test/guardian-snapshot.test.js`는 고치지 않고 그대로 통과해야 한다.

**Interfaces:**
- Consumes: `isOverdueClampedDay(day)`(`src/domain/states.js`), `stayDates`, `isClockTime`(`src/stay/index.js`)
- Produces:
  - `isClampedOverdueOuting(day, outing) → boolean` (`src/domain/states.js`)
  - `patientReturnsOf(dayPlan) → Array<{ by: string, returnPlace: string|null, clamped: boolean }>`
  - `patientDeadlineDays({ stay, tripPlan, fromDate }) → Array<{ date: string, deadlines: string[] }>`

정한 값:
- `isClampedOverdueOuting(day, outing)` = `isOverdueClampedDay(day) && typeof outing?.slackMin === 'number' && outing.slackMin < 0`. `lib/notify/schedule.js:177`의 식을 이 함수로 바꾼다(동작 같음).
- `patientReturnsOf(dayPlan)`: `dayPlan.outings`(환자 외출, 보호자 외출은 `guardianOutings`라 섞이지 않는다)를 **저장 순서 그대로**, `isClockTime(returnBy)`인 것만. `returnPlace`는 문자열이면 그대로, 아니면 `null`.
- `snapshot.js`의 `buildDay`: `patientReturn: patientReturnsOf(dayPlan).map((r) => ({ by: r.by, ...returnPlaceOf(r.returnPlace, lodging) }))`. 당겨진 외출도 담는다(다르게 정한 것 15). 출력은 바뀌지 않는다(`copyPatientReturns`가 이미 시각이 아닌 값을 버렸다).
- `patientDeadlineDays`: `stayDates(stay)`(던지면 `[]`) 중 `date >= fromDate`인 날짜마다 하나. 그날 `tripPlan.days[date]`의 `patientReturnsOf` 중 `clamped`가 아닌 `by`를 중복 없이 정렬한다. 일정이 없는 날은 빈 목록.

- [ ] **Step 1: 테스트를 쓴다** (외출·하루 모양은 `test/guardian-fixtures.js`의 `makeGuardianStay`, `makeDayPlan`, `patientOuting`, `makeTripPlan`을 쓴다)

```js
describe('isClampedOverdueOuting', () => {
  test('OUTING_OVERDUE 즉시 복귀 날의 여유 음수 외출만 참이다', () => {
    // returnNow: true, reasons: ['OUTING_OVERDUE'], slackMin: -20 이면 true. slackMin: 5 면 false
  });
  test('PATIENT_RECALLED·PLAN_REVOKED·PLAN_EXPIRED 날의 여유 음수 외출은 거짓이다', () => {});
  test('slackMin 이 숫자가 아니면 거짓이다', () => {});
});
describe('patientReturnsOf', () => {
  test('저장 순서 그대로, 시각이 아닌 returnBy 는 뺀다', () => {});
  test('당겨진 외출은 clamped: true 다', () => {});
});
describe('patientDeadlineDays', () => {
  test('fromDate 부터 출국일까지 날짜마다 하나, 외출이 없거나 일정이 없는 날은 빈 목록', () => {});
  test('fromDate 가 입국일보다 앞이면 입국일부터다', () => {});
  test('당겨진 외출의 마감은 빼고, 다른 즉시 복귀 원인의 날은 실제 마감을 담는다', () => {});
  test('시각은 중복 없이 정렬한다', () => {});
  test('체류가 깨졌으면 빈 목록이다', () => {});
  test('당겨진 외출이 없는 날은 보호자 스냅샷의 patientReturn[].by 와 같다', () => {
    // buildGuardianSnapshot 결과의 days[i].patientReturn.map(r => r.by) 를 정렬한 것과 같다
  });
});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`** (`test/notify-schedule.test.js`의 당겨진 외출 시험과 스냅샷 시험이 고치지 않고 통과하는지 본다)
- [ ] **Step 3: 커밋한다.** `feat(guardian): 날짜별 환자 복귀 마감 공용 계산과 당겨진 외출 판정 하나로 모음`

---

### Task 3: 요청 모양, 요청 함수, 클라이언트·서버 이음매 (D16)

**Files:**
- Create: `src/guardian/watchRequests.js`, `lib/trip/watchApi.js`
- Modify: `test/watch-fixtures.js`(`watchRouteEnv()`를 더한다)
- Test: `test/guardian-watch-requests.test.js`(새), `test/watch-client-seam.test.js`(새)

**Interfaces:**
- Consumes: `toBase64Url(bytes)`(`src/guardian/crypto.js`), `ERROR_CODE`(`src/stay/errorCodes.js`), `isDateString`, `isClockTime`
- Produces (`src/guardian/watchRequests.js`):
  - `WATCH_ID_RE = /^[A-Za-z0-9_-]{22}$/`, `WRITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/`, `WATCH_UPLOAD_MAX_DAYS = 46`, `WATCH_UPLOAD_MAX_PER_DAY = 10`
  - `WATCH_PATHS = { config: '/api/push/config', watch: '/api/watch', deadlines: '/api/watch/deadlines', back: '/api/watch/back' }`
  - `WATCH_KIND` (공용 모양의 여덟 값)
  - `newWatchIds({ randomBytes } = {}) → { watchId, writeToken }` (16바이트, 32바이트. 기본 `randomBytes(n) = globalThis.crypto.getRandomValues(new Uint8Array(n))`)
  - `configRequest()`, `registerRequest({ watchId, writeToken, expiresOn })`, `deadlinesRequest({ watchId, writeToken, expiresOn, days })`, `backRequest({ watchId, writeToken, date, by, undo })`, `removeRequest({ watchId, writeToken })`, `removeAllRequest()`: 모두 `{ method, path, body }`(`GET`은 `body: null`). 형식이 틀리면 `TypeError`.
  - `classifyWatchResponse({ status, network, errorCode }) → WATCH_KIND 값`
- Produces (`lib/trip/watchApi.js`):
  - `sendWatchRequest(request, { fetchImpl, timeoutMs = 15_000 }) → Promise<WatchResult>`
  - `createWatchApi({ fetchImpl, timeoutMs } = {}) → { config(), register(input), deadlines(input), back(input), removeAll() }`. 모두 `Promise<WatchResult>`이고 던지지 않는다(요청 모양의 `TypeError`도 `{ ok: false, status: 0, network: false, errorCode: 'CLIENT_INVALID', kind: 'BAD' }`).
- Produces (`test/watch-fixtures.js`): `watchRouteEnv() → Record<string,string>` (`test/watch-routes.test.js`의 `ENV`와 같은 값: 켜는 스위치 `'1'`, 데모 로그인, 메모리 저장소, VAPID 한 쌍, 저장 키, `SECRET`, `CRON_SECRET`)

정한 값:
- 본문은 허용 목록 필드만 싣는다. `backRequest`는 `undo === true`일 때만 `undo: true`를 싣는다. `deadlinesRequest`는 `days` 길이 46 이하, 날짜 중복 없음, 날짜당 시각 10개 이하이고 시각을 정렬·중복 제거해 싣는다(넘으면 `TypeError`, 깎는 것은 Task 6이 한다).
- `classifyWatchResponse`: `network`이면 `NETWORK`. 2xx는 `OK`. 404 `NOT_FOUND`, 401 `LOGIN_REQUIRED`, 429 `RATE_LIMITED`, 400 `BAD`, 503이면서 `errorCode === ERROR_CODE.SERVER_PUSH_OFF`면 `OFF`. 나머지는 `UNAVAILABLE`.
- `sendWatchRequest`는 `lib/trip/api.js`의 `post`와 같은 방식이다: `credentials: 'same-origin'`, `cache: 'no-store'`, `Content-Type: application/json`(본문이 있을 때), `AbortController` 시간 제한, 응답이 2xx이고 `data.ok === true`일 때만 `ok: true`.
- 서버 상수와 같은지 시험이 묶는다(클라이언트는 `lib/server`를 불러올 수 없어 값을 따로 둔다).

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/guardian-watch-requests.test.js
import { WATCH_ID_RE as SERVER_WATCH_ID_RE, WRITE_TOKEN_RE as SERVER_WRITE_TOKEN_RE } from '../lib/server/watch/keys.js';
import { WATCH_LIMITS } from '../lib/server/watch/limits.js';
test('형식과 한도가 서버와 같다', () => {
  assert.equal(WATCH_ID_RE.source, SERVER_WATCH_ID_RE.source);
  assert.equal(WRITE_TOKEN_RE.source, SERVER_WRITE_TOKEN_RE.source);
  assert.equal(WATCH_UPLOAD_MAX_DAYS, WATCH_LIMITS.maxDays);
  assert.equal(WATCH_UPLOAD_MAX_PER_DAY, WATCH_LIMITS.maxDeadlinesPerDay);
});
test('newWatchIds 는 22자·43자 base64url 이고 주입한 난수를 쓴다', () => {});
test('요청 모양은 허용 목록 필드만 싣는다', () => {
  // registerRequest({ ...ids, expiresOn: '2026-11-25', extra: 1 }).body 의 키는 watchId, writeToken, expiresOn 뿐
});
test('backRequest 는 undo 가 true 일 때만 undo 를 싣는다', () => {});
test('형식이 틀리면 TypeError: watchId 21자, 시각 24:00, 날짜 2026-2-1, days 47개, 하루 11개, 날짜 중복', () => {});
test('deadlinesRequest 는 시각을 정렬하고 중복을 없앤다', () => {});
test('응답 분류: 200, 404, 401, 429, 400, 503 OFF, 503 UNAVAILABLE, 500, 네트워크', () => {});

// test/watch-client-seam.test.js
// 진짜 요청 모양 + 진짜 sendWatchRequest 를 진짜 처리기 createWatchHandlers({ env: watchRouteEnv(), now: ctx.now, ctx: testCtx() }) 에 잇는다.
// fetchImpl 어댑터: (path, init) => 처리기[메서드·경로](new Request(BASE + path, { ...init, headers: { ...init.headers, cookie } }))
// 처리기 이름은 register(POST /api/watch), remove(DELETE /api/watch), deadlines, back, pushConfig 다. 서버 검증을 느슨하게 하지 않는다.
test('config 는 켜짐을 읽는다', async () => {});
test('등록, 마감 올리기, 돌아왔어요, 되돌리기가 서버에서 통과한다', async () => {
  // register OK, deadlines OK 이고 data.armFailed 는 숫자, back data.recorded === true, undo data.recorded === true
});
test('46일, 하루 10개의 경계값 업로드가 200 이다', async () => {});
test('세션 없이 등록하면 kind 가 LOGIN_REQUIRED 다', async () => {});
test('같은 watchId 를 새 토큰으로 다시 등록하면 예전 토큰의 올리기·돌아왔어요는 NOT_FOUND 다', async () => {});
test('자정: 어제 23:55 를 올린 뒤 00:05 에 어제 날짜로 돌아왔어요를 보내면 recorded: true 다', async () => {
  // ctx.clock 으로 23:50 KST 에 올리고 00:05 로 옮긴다 (test/watch-routes.test.js 와 같은 방식)
});
test('토큰 삭제와 { all: true } 삭제가 서버에서 통과하고, 지운 뒤 올리기는 NOT_FOUND 다', async () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(watch): 서버 알림 요청 모양과 클라이언트 요청 함수, 실제 처리기와 이은 시험`

---

### Task 4: 보호자 스냅샷의 `watchId`와 다시 보내기 판단 (D7)

**Files:**
- Modify: `src/guardian/snapshot.js`, `components/guardian/share.js`
- Test: `test/guardian-snapshot.test.js`, `test/guardian-size.test.js`, `test/guardian-screen.test.js`

**Interfaces:**
- Consumes: `WATCH_ID_RE`(Task 3)
- Produces:
  - `buildGuardianSnapshot({ stay, tripPlan, now, lang, watchId = null })`: `WATCH_ID_RE`에 맞으면 맨 끝 키로 `watchId`를 더한다. 맞지 않으면 없는 것과 같다.
  - `normalizeGuardianSnapshot(snapshot)`: 형식에 맞는 `watchId`만 남긴다.
  - `buildShareSnapshot({ stay, tripPlan, now, watchId = null })`, `computeShareFingerprint({ stay, tripPlan, since, watchId = null })`, `isGuardianResendNeeded({ stay, tripPlan, share, watchId = null })`
  - `fingerprintContent(snapshot, { fromDate })`: 스냅샷에 `watchId`가 있을 때만 결과에 `watchId`를 담는다.

정한 값:
- `watchId`가 없는 지문은 지금과 바이트까지 같다. 이미 보낸 링크의 기록이 다시 보내기로 바뀌지 않는다.
- 지켜보기를 켜거나 끄거나 바꾸면 지문이 달라져 다시 보내기 안내가 뜬다(보호자 사본의 `watchId`가 기기 상태와 맞아야 A-3 구독이 맞는 곳에 붙는다).
- 링크 길이: `watchId` 22자가 암호문 안에 들어가 약 48자 늘어난다(난수라 압축되지 않는다, 검토 반영으로 실측값으로 고침). 8000자 상한 시험을 `watchId`를 넣은 경우로도 돌린다.

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/guardian-snapshot.test.js
test('watchId 를 주면 최상위 키가 v, createdAt, expiresAt, lang, days, emergency, watchId 다', () => {});
test('watchId 가 없거나 형식이 틀리면(21자, 공백, 숫자) 키 집합은 지금과 같다', () => {});
test('정규화는 맞는 watchId 를 남기고 틀린 watchId 와 다른 새 필드를 버린다', () => {});
// test/guardian-size.test.js
test('watchId 를 담아도 링크가 8000자 아래다', async () => {});
// test/guardian-screen.test.js
test('watchId 가 없으면 지문 내용에 watchId 키가 없다(기존 기록이 그대로 맞는다)', async () => {});
test('watchId 가 생기거나 바뀌거나 사라지면 다시 보내기가 필요하다', async () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(guardian): 보호자 스냅샷에 watchId, 다시 보내기 판단이 지켜보기 상태를 함께 본다`

---

### Task 5: 기기 저장소 (D3, D4, D11 저장소 쪽)

**Files:**
- Create: `lib/store/guardianWatch.js`
- Modify: `lib/store/keys.js`, `lib/store/store.js`, `lib/store/index.js`
- Test: `test/store-guardian-watch.test.js`(새). `RECORD`·`DEVICE_KEY` 목록을 고정한 기존 시험이 있으면 의도적으로 고친다.

**Interfaces:**
- Consumes: `WATCH_ID_RE`, `WRITE_TOKEN_RE`, `removeRequest`(Task 3), `sendWatchRequest`(`src/guardian/watchSend.js`, 다르게 정한 것 22), `isDateString`, `isClockTime`
- Produces:
  - `RECORD.guardianWatch = 'guardianWatch'`, `DEVICE_KEY.pendingServerDelete = 'safehour.v2.device.pendingServerDelete'`
  - `lib/store/guardianWatch.js`: `BACK_QUEUE_MAX = 20`, `PENDING_DELETE_MAX = 10`, `normalizeGuardianWatch(value) → record|null`, `normalizeBackQueue(value) → Array`, `normalizePendingDelete(value) → Array`
  - 저장소 메서드: `readGuardianWatch() → record|null`, `writeGuardianWatch(record|null) → { ok: true } | { ok: false, errorCode }`, `writeBackQueue(queue) → { ok: true } | { ok: false, errorCode }`, `retireGuardianWatch() → { ok: true } | { ok: false, errorCode }`, `readPendingServerDelete() → Array`, `retryPendingServerDelete() → Promise<{ remaining: number }>`

정한 값:
- `readGuardianWatch`는 다른 읽기처럼 `getStatus().accountKey`의 레코드를 읽는다(보기 전용에서도 읽힌다).
- `writeGuardianWatch`는 `writableAccount()`가 있을 때만. `null`이면 레코드를 지운다. 정규화에 실패하면 쓰지 않는다. 바뀌면 `guardianWatch` 주제를 알린다.
- `writeBackQueue(queue)`: **보기 전용 예외는 이것 하나다.** `getStatus().accountKey`가 있고(로그아웃 보류 중이면 없다) 그 계정에 레코드가 있을 때만. 저장된 레코드의 다른 필드는 저장된 값 그대로 두고 `backQueue`만 정규화한 값으로 바꾼다. 잠긴 인스턴스는 실패.
- 안쪽 함수 `retireWatchOf(accountKey)`: 레코드가 있으면 `{ watchId, writeToken }`을 삭제 대기에 넣고(같은 `watchId`는 하나, 10개를 넘으면 오래된 것부터 버림) 레코드를 지우고 알린다. 쓰기 가능 여부를 보지 않는다(자동 삭제는 로그인 없이 돈다). 대기를 저장소에 쓰지 못하면 목록을 메모리에 남겨(`logoutPendingInMemory`와 같은 방식) 이 인스턴스가 계속 보낸다. `readPendingServerDelete()`는 저장소와 메모리를 합친 것이다(Task 5 검토 반영).
- `retireGuardianWatch()`: 쓰기 가능할 때만 `retireWatchOf(writableAccount())` 다음 `void retryPendingServerDelete()`.
- 지우기 경로 연결:
  - `purgeStayData(accountKey)`(출국 7일 뒤 자동 삭제, `deleteStay`)가 `retireWatchOf(accountKey)`를 부른다.
  - `withdrawSensitiveConsent()`가 체류를 고친 뒤 성공하면 `retireWatchOf(accountKey)`를 부른다(다르게 정한 것 13).
  - `deleteAllMyData()`: 먼저 지금 대기와 `listAccountKeys()`의 모든 계정 레코드의 식별 값을 모으고, 키를 지운 뒤 대기를 쓴다(저장 공간이 꽉 찬 기기에서도 자리가 있다. 그래도 쓰지 못하면 메모리). `kept`에 `DEVICE_KEY.pendingServerDelete`를 더한다. 로그아웃 시도 다음에 `await retryPendingServerDelete()`를 한다(화면은 그 뒤 새로 고침으로 이동한다).
  - `setOnline(true)`와 `onAppOpen()` 끝에서 대기가 있으면 `void retryPendingServerDelete()`.
- `retryPendingServerDelete()`: 대기 항목마다 `sendWatchRequest(removeRequest(항목), { fetchImpl: 저장소의 fetchImpl, timeoutMs: 10_000 })`을 **동시에** 보낸다(지켜보기마다 하나). 결과가 `OK`, `NOT_FOUND`, `BAD`면 대기에서 빼고, `NETWORK`, `RATE_LIMITED`, `OFF`, `UNAVAILABLE`이면 남긴다. 이미 도는 중이면 같은 약속을 돌려준다(`logoutInFlight`와 같은 방식). 한 차례가 끝났을 때 대기(저장소와 메모리)에 그 차례에서 보내지 않은 항목이 있으면 그 항목만 한 번 더 보내고, 그 뒤에 약속을 푼다. `retireGuardianWatch()` 뒤에 이 약속을 기다린 쪽(Task 7 `retire()`)은 자기 항목의 시도를 본다. 한 번 보낸 항목은 실패해도 같은 호출에서 다시 보내지 않는다(Task 5 검토 반영).
- 메모리 상태(`memos`)를 쓰는 곳이 있으면 `guardianWatch`도 같은 규칙을 따른다.

- [ ] **Step 1: 테스트를 쓴다** (`createStore({ storage: createMemoryStorage(), now, fetchImpl })`, 세션은 `test/trip-sync-fixtures.js`처럼 `setSession`. 가짜 `fetchImpl`은 받은 method·경로·본문을 쌓는다)

```js
test('guardianWatch 는 계정 이름공간 레코드이고 형식이 틀리면 읽을 때 null 이다', () => {});
test('writeGuardianWatch 는 쓰기 가능할 때만 되고 null 이면 지운다', () => {});
test('보기 전용(오프라인, 세션 만료, 세션 없음)에서도 writeBackQueue 는 되고 다른 필드는 그대로다', () => {
  // writeBackQueue 에 lastUploaded 를 바꾼 레코드를 흉내 내 넘겨도 저장된 lastUploaded 가 남는다
});
test('writeBackQueue 는 레코드나 계정 키가 없으면(로그아웃 보류 포함) 실패한다', () => {});
test('backQueue 는 20개, 삭제 대기는 10개를 넘지 않는다', () => {});
test('retireGuardianWatch: 레코드를 지우고 대기에 넣고 DELETE 를 보낸다. 본문은 watchId, writeToken 뿐이다', async () => {});
test('삭제 결과: 200·404·400 은 대기에서 빼고, 네트워크·429·503 은 남긴다', async () => {});
test('같은 대기 비우기가 겹쳐 불려도 지켜보기마다 요청은 하나다', async () => {});
test('온라인 복귀와 앱 열기가 대기를 다시 보낸다', async () => {});
test('내 정보 지우기: 모든 계정의 지켜보기를 대기로 옮기고 언어, 로그아웃 보류, 서버 삭제 대기 셋만 남긴다', async () => {});
test('내 정보 지우기 중 오프라인이면 대기가 남고 다음 온라인에 보낸다', async () => {});
test('출국 7일 뒤 자동 삭제와 deleteStay 가 지켜보기를 대기로 옮긴다(로그인 없이도)', async () => {});
test('민감정보 동의 철회가 지켜보기를 대기로 옮긴다', async () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(store): 서버 알림 레코드와 돌아왔어요 대기열(보기 전용 예외), 서버 삭제 대기`

---

### Task 6: 올릴 상태와 누를 대상 (순수 함수, D1, D2, D5, D10)

**Files:**
- Create: `lib/trip/watchPlan.js`
- Test: `test/watch-plan.test.js`(새)

**Interfaces:**
- Consumes: `patientDeadlineDays`, `isClampedOverdueOuting`(Task 2), `WATCH_UPLOAD_MAX_DAYS`, `WATCH_UPLOAD_MAX_PER_DAY`(Task 3), `DEFAULTS.notifications.serverPushGraceMin`·`serverPushEarlyToleranceSec`(Task 1), `kstClock`, `kstInstantMs`, `addDays`
- Produces:
  - `buildUploadState({ stay, tripPlan, lastUploaded, nowMs }) → { expiresOn, days: Array<{ date, deadlines }>, nextLastUploaded, key } | null`
  - `isSameUpload(record, state) → boolean`
  - `isHeldOuting({ day, outing, lastUploaded, nowMs }) → boolean` (다르게 정한 것 24)
  - `backTargetOf({ day, outing, lastUploaded, nowMs, passedBy = null }) → { date, by } | null`
  - `undoUntilMs({ date, by }) → number`
  - `applyBackAction(queue, { date, by, undo }) → queue`, `pruneBackQueue(queue, nowMs) → queue`

정한 값:
- `buildUploadState`(Task 6 검토 반영 2026-11-15): `today`, `yesterday`를 구한다. 출국일이 날짜가 아니거나, 체류 날짜(`stayDates`)를 읽지 못하거나, `tripPlan.days`가 객체가 아니면 `null`. 오늘의 고정된 지난 시각 = `lastUploaded[today]` 중 `kstInstantMs(today, t) <= nowMs`(D1).
  - 출국일이 오늘보다 앞이면(일찍 귀국): `lastUploaded`에 오늘 이후 날짜가 있으면 `expiresOn = today`, `days = [{ date: today, deadlines: 오늘의 고정된 지난 시각 }]`(서버가 오늘 뒤 날짜 기록을 지운다). 없으면 `null`.
  - 그 밖: `expiresOn = stay.departure.date`, 상한 `cap = min(출국일, today + 45일)`. 보낼 날짜 = `[today, cap]` 안의 체류 날짜와 `[today, cap]` 안의 `lastUploaded` 날짜를 합친 것. 체류 날짜는 `patientDeadlineDays({ stay, tripPlan, fromDate: today })`의 마감이다. 더는 체류 날짜가 아닌 날짜는 `[]`(서버가 그 날짜 기록을 지운다, 입국이 늦춰진 경우)이고, 오늘만은 고정된 지난 시각을 보낸다. 오늘이 체류 날짜면 오늘 목록은 다르게 정한 것 24의 세 가지 합이다(그 밖의 지나지 않은 올린 시각은 남기지 않는다). 내일 이후는 지난 시각이 없다.
  - 날짜당 10개를 넘으면 지금 마감(이른 10개), 원래 마감, 최근 지난 시각 순으로 남긴다(다르게 정한 것 24). `nextLastUploaded = { ...보낸 날짜별 목록(체류 날짜가 아닌데 []로 보낸 날짜는 뺀다), [yesterday]: lastUploaded[yesterday] ?? 없음 }`(그 밖 날짜는 버린다). 서버가 지금 가진 것과 같다. `key = JSON.stringify({ expiresOn, days })`.
- `isSameUpload(record, state)`: `record.uploadPending`이 거짓이고, `record.expiresOn === state.expiresOn`이고, 보낼 날짜마다 `lastUploaded[date]`가 같은 배열일 때만 참. 자정이 지나 보낼 날짜가 하루 줄어든 것만으로는 다르지 않다(서버에 할 일이 없다). 지우려고 `[]`로 보내는 날짜는 `lastUploaded`도 비어 있을 때만 같고, 보낸 뒤에는 `nextLastUploaded`에서 빠지므로 같은 상태를 다시 올리지 않는다.
- `backTargetOf`:
  - `day`가 없으면 `null`.
  - `passedBy`가 시각이면 외출 없이도 `{ date: day.date, by: passedBy }`(경우 1 시트). `trip.overdueReturn.returnBy`는 시트가 뜬 순간의 지난 마감이라 재계획으로 외출 id가 다시 매겨지거나 외출 마감이 바뀌어도 남고, D1로 서버에서도 지워지지 않는다. 그래서 외출의 지금 `returnBy`보다 이 값을 쓴다.
  - `outing`이 없거나, 출발 시각이 시각이 아니거나 아직 출발 전이면 `null`.
  - 묶인 외출(`isHeldOuting`, 다르게 정한 것 24)이 아니면 `{ date: day.date, by: outing.returnBy }`(시각이 아니면 `null`).
  - 묶인 외출(경우 2의 당겨진 외출, 당김이 풀린 외출, 올린 적 없는 지난 마감)이면 `lastUploaded[day.date]` 중 `outing.departAt < t`이고(출발과 같은 시각은 바로 앞 외출의 마감일 수 있어 뺀다) 그날 다음 환자 외출의 출발보다 이르며 같은 날 다른 외출(묶이지 않은)의 지금 `returnBy`와 같지 않은 **가장 이른** 시각(원래 마감은 지났을 수도, 아직 미래일 수도 있다). 없으면 다르게 정한 것 26의 대체 시각, 그것도 없으면 `null`.
  - 같은 날 더 늦게 출발하는 환자 외출의 대상이 같은 `by`면 `null`(다르게 정한 것 25).
  - `date`는 늘 외출이 속한 `day.date`다. 시계의 오늘이 아니다.
- `undoUntilMs({ date, by }) = kstInstantMs(date, by) + serverPushGraceMin * 60_000 - serverPushEarlyToleranceSec * 1000`.
- `applyBackAction`: 같은 `(date, by)`는 마지막 동작 하나만 남긴다. 대기 중인 확인(`undo: false`)을 되돌리면 둘 다 사라진다(요청 없음). 새 항목은 뒤에 붙는다.
- `pruneBackQueue`: 어제보다 앞 날짜를 버리고, 20개를 넘으면 오래된 것부터 버린다.

- [ ] **Step 1: 테스트를 쓴다**

```js
// 오늘 2026-11-20, 체류 2026-11-18 ~ 2026-11-24 (test/guardian-fixtures.js 의 체류·외출 도우미)
const at = (iso) => Date.parse(iso);
const NOW = at('2026-11-20T15:00:00+09:00');

test('오늘부터 출국일까지 날짜마다 목록, expiresOn 은 출국일이다', () => {});
test('지난 마감은 일정에서 빠져도 남기고 지나지 않은 마감은 뺀다 (D1)', () => {
  // 오늘 일정 외출 16:00 출발 18:00 마감, lastUploaded 오늘 ['14:30', '17:00']
  // deadlines === ['14:30', '18:00']
});
test('경우 2: 당겨진 외출의 마감은 올리지 않고, 이미 올린 원래 마감은 남긴다 (D2)', () => {
  // 오늘 day: returnNow true, reasons ['OUTING_OVERDUE'], 외출 13:00 출발 returnBy '14:45' slackMin -20
  // lastUploaded 오늘 ['14:30'] 이면 deadlines === ['14:30'] ('14:45' 없음)
});
test('환자 호출 날의 여유 음수 외출은 실제 마감을 올린다', () => {});
test('자정: 00:05 에는 어제를 보내지 않고 nextLastUploaded 에 어제 23:55 를 남긴다', () => {
  // nowMs = at('2026-11-21T00:05:00+09:00'), lastUploaded { '2026-11-20': ['23:55'] }
  // state.days 에 '2026-11-20' 없음, state.nextLastUploaded['2026-11-20'] 은 ['23:55']
});
test('그제 이전 날짜는 nextLastUploaded 에서 버린다', () => {});
test('하루 10개를 넘으면 지난 시각부터 이른 순으로 뺀다', () => {});
test('46일을 넘는 남은 체류는 앞의 46일만 보낸다', () => {});
test('출국일이 오늘보다 앞이면 null', () => {});
test('isSameUpload: 같으면 참, uploadPending 이나 expiresOn 이나 목록 하나가 다르면 거짓, 자정에 하루 빠진 것은 같다', () => {});
test('backTargetOf: 출발 전 null, 경우 1 은 passedBy(외출을 못 찾아도), 평소는 returnBy, 날짜는 외출의 날', () => {});
test('backTargetOf 경우 2: 출발 이후 가장 이른 올린 시각(미래여도), 다른 외출의 지금 마감은 뺀다, 없으면 null', () => {});
test('경우 2: 원래 마감이 아직 미래여도 당겨진 날에는 올린 시각을 모두 남긴다 (D1 보강)', () => {});
test('undoUntilMs: 23:55 마감은 다음 날 00:04:30', () => {
  assert.equal(undoUntilMs({ date: '2026-11-20', by: '23:55' }), at('2026-11-21T00:04:30+09:00'));
});
test('applyBackAction: 같은 (date, by) 는 마지막 동작만, 대기 중 확인을 되돌리면 둘 다 사라진다', () => {});
test('pruneBackQueue: 어제보다 앞 날짜를 버리고 20개를 넘지 않는다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(trip): 서버 알림 올릴 상태, 돌아왔어요 대상, 되돌리기 마감, 대기열 규칙`

---

### Task 7: 동기화 실행기, 화면 훅, 연결 (D6 등록, D9, D10, D11 실행 쪽)

**Files:**
- Create: `lib/trip/watchSync.js`, `lib/trip/useWatch.js`
- Modify: `lib/trip/client.js`, `lib/trip/useTrip.js`, `lib/trip/runtime.js`
- Test: `test/watch-sync.test.js`(새), `test/trip-sync-runtime.test.js`

**Interfaces:**
- Consumes: Task 3의 `createWatchApi`, `newWatchIds`, `WATCH_KIND`. Task 5의 저장소 메서드. Task 6의 순수 함수. Task 4의 `isGuardianResendNeeded({ ..., watchId })`.
- Produces:
  - `createWatchSync({ store, api, now = Date.now, timers = null, randomBytes } ) → watchSync`
    - `start()`, `stop()`
    - `kick(reason: string) → Promise<void>`
    - `config() → Promise<{ enabled: boolean }>` (한 번 읽고 5분 기억, 실패는 `{ enabled: false }`)
    - `ensureRegistered({ stay }) → Promise<{ ok: true, watchId } | { ok: false, reason: 'LOGIN_REQUIRED'|'RATE_LIMITED'|'OFF'|'UNAVAILABLE' }>`
    - `retire() → Promise<{ ok: true, pending: boolean } | { ok: false, reason: 'LOGIN_REQUIRED'|'UNAVAILABLE' }>` (작업 7 검토 반영)
    - `removeAll() → Promise<{ ok: true, deleted: number } | { ok: false, reason: 'LOGIN_REQUIRED'|'RATE_LIMITED'|'UNAVAILABLE' }>`
    - `pressBack({ date, by, departAt }) → void`(`departAt`은 누른 외출의 출발, 시트의 지난 마감 경로는 `null`), `undoBack({ date, by }) → void`
    - `backStatus({ date, by }) → { phase, undoUntilMs } | null`
    - `subscribe(listener) → () => void`
  - `getWatchSync()`(`lib/trip/client.js`, 서버 렌더링 중 `null`)
  - `lib/trip/useWatch.js`: `useServerPushConfig() → { loaded: boolean, enabled: boolean }`, `useGuardianWatch() → { state: 'ON'|'REPLACED'|'NONE', watchId: string|null }`, `useReturnedConfirm({ day, outing, passedBy = null, nowMs }) → { visible, phase, undoUntilMs, press, undo }`

정한 값:
- **요청은 지켜보기 하나에 한 번에 하나다.** 등록, 올리기, '돌아왔어요', 되돌리기, `retire`, `removeAll`을 한 약속 사슬로 줄 세운다. `kick`이 도는 중에 또 오면 끝난 뒤 한 번만 더 돈다(늘 최신 전체를 보낸다). 서버 삭제 대기(Task 5)는 저장소가 따로 보낸다. 응답을 받은 뒤 레코드를 다시 읽어 `watchId`나 `writeToken`이 달라졌으면(지워졌거나 다시 등록됨) 결과를 쓰지 않는다.
- **한 번의 비우기(`flush`)**:
  1. 레코드가 없거나 `state !== 'ON'`이거나 오프라인이면 끝.
  2. 쓰기 가능하면 `buildUploadState`. `null`이 아니고 `isSameUpload`가 거짓이고 이번 실행에서 `BAD`로 막힌 `key`가 아니면 올린다.
     - `OK`: `{ expiresOn, lastUploaded: nextLastUploaded, uploadPending: armFailed > 0 }`을 쓴다. `armFailed > 0`이면 60초 뒤 `kick('arm-retry')`, 같은 `key`로는 세 번까지(메모리).
     - `NOT_FOUND`: `state: 'REPLACED'`를 쓰고 대기열의 확인을 모두 `FAILED`로 만들고 비운 뒤 끝.
     - `NETWORK`: `uploadPending: true`를 쓰고 끝(다음 계기에 다시).
     - `OFF`, `UNAVAILABLE`, `RATE_LIMITED`: `uploadPending: true`를 쓰고 3으로 간다. 화면에는 아무것도 보이지 않는다(D9).
     - `BAD`: `uploadPending: true`, 이 `key`를 이번 실행에서 막고 3으로 간다.
  3. `pruneBackQueue` 뒤 대기열을 앞에서부터 하나씩 보낸다(보기 전용이어도 보낸다). 보내는 동안 `SENDING`.
     - `OK`이고 `recorded: true`: 대기에서 뺀다. 확인이면 `SENT`(`undoUntilMs`), 되돌리기면 `null`.
     - `OK`이고 `recorded: false`: 빼고 확인이면 `FAILED`, 되돌리기면 `UNDO_FAILED`.
     - `NOT_FOUND`: 남은 대기를 모두 빼고 `FAILED`. 쓰기 가능하면 `state: 'REPLACED'`를 쓰고, 아니면 메모리에 표시해 다음 쓰기 가능한 비우기에서 쓴다.
     - `BAD`: 빼고 `FAILED`.
     - `NETWORK`, `OFF`, `UNAVAILABLE`, `RATE_LIMITED`: 남기고 단계를 `QUEUED`·`UNDO_QUEUED`로 되돌리고 끝.
  4. 대기 쓰기는 `writeBackQueue`, 그 밖 필드는 `writeGuardianWatch`로만 한다.
- **보기 전용에서 올리지 않는 근거**(다르게 정한 것 9): 오프라인이면 닿지 않는다. 세션 만료·세션 없음이면 일정 실행기가 재계획하지 않아 일정이 바뀌지 않으므로 서버는 이미 마지막 상태를 갖고 있다(자정에도 서버에 할 일이 없다: 다음 날 목록은 전날 함께 올렸고 예약은 서버의 하루 1회 작업이 당겨 건다). 올려도 `lastUploaded`·`uploadPending`을 쓸 수 없어 계기마다 같은 업로드를 반복해 시간당 60회 한도를 쓴다. 남는 손해는 실패했던 업로드와 `armFailed` 재시도가 쓰기 가능해질 때까지 늦는 것뿐이고, 쓰기 가능 복귀가 계기다.
- **누르기**: `pressBack`·`undoBack`은 먼저 `applyBackAction`으로 대기열을 쓰고(보기 전용 예외) 메모리 단계를 `QUEUED`·`UNDO_QUEUED`로 둔 뒤 `kick('back')`. 대기 중인 확인을 되돌리면 요청 없이 `null`이다. `SENT` 뒤의 되돌리기만 `undo: true`를 보낸다. 새로 고친 뒤 단계는 대기열에서 다시 만든다(확인은 `QUEUED`, 되돌리기는 `UNDO_QUEUED`).
- **등록**(`ensureRegistered`, 쓰기 가능할 때만, 출국일이 오늘보다 앞이면 `UNAVAILABLE`):
  - 레코드 `ON`: 요청 없이 `{ ok: true, watchId }`.
  - 레코드 `REPLACED`: 같은 `watchId`, `newWatchIds()`의 새 `writeToken`으로 `register`. 
  - 레코드 없음: `newWatchIds()`로 새로 만든다.
  - 본문 `expiresOn = stay.departure.date`. 성공하면 `{ watchId, writeToken, expiresOn: <보낸 값>, lastUploaded: <REPLACED 였으면 그대로, 아니면 {}>, uploadPending: true, backQueue: [], state: 'ON' }`을 쓰고 `kick('register')`.
  - 실패 이유: `LOGIN_REQUIRED`, `RATE_LIMITED`, `OFF`는 그대로, 나머지는 `UNAVAILABLE`. REPLACED 재등록이 `NOT_FOUND`면 레코드를 지우고 `UNAVAILABLE`(다음에 새 id). 실패하면 레코드를 쓰지 않는다.
- `retire()`: 사슬에서 `store.retireGuardianWatch()` 다음 `await store.retryPendingServerDelete()`, 메모리 단계를 비운다. 작업 7 검토 반영: 쓰기 가능하지 않으면 아무것도 바꾸지 않고 `{ ok: false, reason: blockedReason(status) }`, 저장소 쓰기가 실패하면 `{ ok: false, reason }`(쓰기 가능이면 `UNAVAILABLE`), 이 둘은 메모리 단계를 비우지 않는다. 성공하면 `{ ok: true, pending }`이고 `pending`은 지운 레코드의 `watchId`가 삭제를 시도한 뒤에도 삭제 대기에 남았는지다(남았으면 서버에서 지워지기 전까지 보호자 알림이 갈 수 있다). 레코드가 없으면 `{ ok: true, pending: false }`.
- `removeAll()`: 쓰기 가능할 때만. `OK`면 `writeGuardianWatch(null)` 다음 `{ ok: true, deleted }`. 실패 이유는 `LOGIN_REQUIRED`, `RATE_LIMITED`, 나머지 `UNAVAILABLE`.
- 계기: `start()`가 저장소 `tripPlan`, `stay`를 구독해 `kick('plan')`, `status`를 구독해 오프라인에서 온라인으로, 보기 전용에서 쓰기 가능으로 바뀔 때 `kick('online')`·`kick('writable')`. `guardianWatch` 변경은 화면 구독자에게만 알린다(비우기를 부르지 않는다, 되먹임 없음). KST 자정 + 1초 타이머가 `kick('midnight')` 후 다음 자정을 다시 건다.
- `useTrip.js`: 효과에서 `getWatchSync()?.start()`와 `kick('open')`, `attachLifecycle`의 화면 복귀에서 `kick('resume')`.
- `runtime.js`: `recomputeGuardian`이 `store.readGuardianWatch()`의 `state === 'ON'`인 `watchId`(아니면 `null`)를 `isGuardianResendNeeded`에 넘긴다. 캐시 비교에 `watchId`를 더하고 `start()`에서 `guardianWatch`를 구독해 다시 계산한다.
- `useReturnedConfirm`: `visible = state === 'ON' && backTargetOf({ day, outing, lastUploaded, nowMs, passedBy }) !== null`. `press`·`undo`는 그 대상으로 `pressBack`·`undoBack`.

- [ ] **Step 1: 테스트를 쓴다** (`createStore`에 메모리 저장소, 가짜 `api`(호출을 쌓고 응답을 고른다), 손으로 돌리는 `timers`, 옮길 수 있는 시계)

```js
test('등록: 레코드가 없으면 새 id 로 등록하고 ON, uploadPending: true 를 쓴 뒤 올린다', async () => {});
test('등록: ON 이면 요청 없이 같은 watchId 를 돌려준다', async () => {});
test('등록: REPLACED 면 같은 watchId 에 새 토큰으로 다시 등록한다', async () => {});
test('등록 실패 이유: 401 LOGIN_REQUIRED, 429 RATE_LIMITED, 503 OFF, 그 밖·네트워크 UNAVAILABLE, 레코드를 쓰지 않는다', async () => {});
test('일정이 바뀌면 올리고, 같으면 올리지 않는다', async () => {});
test('요청은 하나씩: 올리는 중에 일정이 또 바뀌면 끝난 뒤 최신 전체를 한 번 더 올린다', async () => {
  // api.deadlines 가 풀리기 전 두 번 kick, 동시에 열린 요청 수의 최대가 1, 두 번째 본문이 최신
});
test('armFailed > 0 이면 60초 뒤 같은 전체를 다시 올리고, 같은 상태로는 세 번까지', async () => {});
test('404 면 REPLACED 를 쓰고 더 올리지 않으며 대기열의 확인은 FAILED 다', async () => {});
test('503 OFF 는 uploadPending 을 남기고 화면 단계를 바꾸지 않는다, 네트워크는 다음 계기에 다시 보낸다', async () => {});
test('보기 전용이면 올리지 않고, 쓰기 가능으로 돌아오면 올린다', async () => {});
test('오프라인에서 누르면 QUEUED 이고 대기열에 남으며, 온라인이 되면 올리기 다음에 보낸다', async () => {
  // api 호출 순서 ['deadlines', 'back'], 끝나면 SENT
});
test('recorded: true 전에는 SENT 가 아니다, recorded: false·400·404 는 FAILED', async () => {});
test('보기 전용(세션 만료)에서도 누를 수 있고 저장소에는 backQueue 만 바뀐다', async () => {});
test('자정: 23:58 에 오프라인으로 누른 23:55 확인을 00:05 에 어제 날짜로 보낸다', async () => {});
test('되돌리기: 대기 중이면 요청 없이 사라지고, SENT 뒤면 undo: true 를 보낸다, recorded: false 는 UNDO_FAILED', async () => {});
test('새로 고친 뒤(새 실행기) 대기열에서 QUEUED·UNDO_QUEUED 를 다시 만든다', async () => {});
test('응답 사이에 레코드가 지워지거나 다시 등록되면 결과를 쓰지 않는다', async () => {});
test('자정 타이머와 온라인·쓰기 가능 복귀가 kick 을 부른다', async () => {});
test('retire 는 진행 중 요청이 끝난 뒤 저장소 retireGuardianWatch 를 부른다', async () => {});
test('removeAll: OK 면 레코드를 지우고 deleted 를 돌려준다, 401 은 LOGIN_REQUIRED', async () => {});
// test/trip-sync-runtime.test.js
test('보호자 다시 보내기 판단이 켜진 지켜보기의 watchId 를 함께 본다', async () => {
  // watchId 없이 보낸 기록 + ON 레코드면 guardianResendNeeded true, watchId 를 담아 보낸 기록이면 false
});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(trip): 서버 알림 동기화 실행기(직렬 요청, 계기, 대기열, 등록·끄기·지우기)와 화면 훅`

---

### Task 8: 보호자 링크 동의 화면의 서버 알림 항목 (D6, D12, D14)

**Files:**
- Create: `components/guardian/serverPush.js`
- Modify: `components/guardian/GuardianCreate.js`, `components/guardian/hooks.js`, `src/i18n/messages/guardian.js`, `app/styles/guardian.css`
- Test: `test/guardian-server-push.test.js`(새)

**Interfaces:**
- Consumes: `useServerPushConfig`, `useGuardianWatch`, `getWatchSync()`의 `ensureRegistered`·`retire`·`kick`(Task 7), `buildShareSnapshot({ ..., watchId })`, `isGuardianResendNeeded({ ..., watchId })`(Task 4)
- Produces (`components/guardian/serverPush.js`, 순수):
  - `serverPushOptionVisible({ enabled, departureDate, today }) → boolean`
  - `serverPushInitialChecked(state) → boolean`
  - `serverPushResultKeys(result) → string[]` (`result`는 `null` | `{ ok: true }` | `{ ok: false, reason }`)
  - `SERVER_PUSH_CONSENT_KEYS` (동의 목록 키 배열)

정한 값:
- 항목 위치: `ShareForm`의 기존 공유 동의 체크 아래, 같은 `.toggle-row` 모양의 체크 하나(`guardian.serverPushCheck`). 그 아래 동의 목록(설계서 5.5)과 `t('conditions.consentLegalReview')` 안내 줄. 배지는 두지 않는다(D12).
- 보이는 조건: `config.enabled === true`이고 출국일이 오늘 이후(같은 날 포함). 처음 체크 상태: `state === 'ON'`일 때만 켜짐(다르게 정한 것 20).
- 보내기(`onSubmit`) 순서: 항목이 보일 때, 체크가 켜져 있으면 `ensureRegistered({ stay })`, 체크가 꺼져 있고 레코드가 있으면(`ON`·`REPLACED`) `retire()`. 그다음 지금처럼 `buildShareSnapshot({ stay, tripPlan, now, watchId })`부터 진행한다. `watchId`는 등록에 성공했으면 그 값, 항목이 숨어 있고 레코드가 `ON`이면 그 레코드의 값, 나머지는 `null`이다. 항목이 숨어 있으면(스위치를 잠시 끈 경우 등) 지켜보기를 건드리지 않는다. 링크를 저장한 뒤 `kick('register')`. 등록 실패는 링크 만들기를 막지 않는다. `retire()`가 `ok: false`면 링크는 그대로 만들되(`watchId: null`) 결과 줄에 끄지 못했다는 줄을 보이고, 꺼졌다고 쓰지 않는다. `pending: true`면 서버에서 지워지기 전까지 알림이 갈 수 있다는 줄을 보인다(작업 7 검토 반영).
- 결과 줄(`LinkResult`, `role="status"`): 성공 `guardian.serverPushOn`. 실패면 `guardian.serverPushNotOn` 다음 이유 줄: `LOGIN_REQUIRED`는 `guardian.serverPushLogin`("서버 알림은 Google 또는 카카오로 로그인해야 켤 수 있어요."), `RATE_LIMITED`는 `guardian.serverPushLimit`, `OFF`는 `guardian.serverPushOffNow`, `UNAVAILABLE`은 `guardian.serverPushUnavailable`. 체크하지 않았으면 줄이 없다.
- `hooks.js`의 `useGuardianResendNeeded`가 `useGuardianWatch()`의 ON `watchId`를 `isGuardianResendNeeded`에 넘긴다.
- 문구(`messages`, 네 언어). 한국어 원문은 설계서 5.5를 따르고 8.1 '초안에서 고친 것'의 문장을 쓴다. 빈칸은 다르게 정한 것 19:
  - `guardian.serverPushTitle` 서버 알림 (선택)
  - `guardian.serverPushCheck` 서버 알림 사용: 앱이 닫혀 있어도 보호자에게 알림을 보내요
  - `guardian.serverPushIntro`, `guardian.serverPushStored`, `guardian.serverPushNotStored`, `guardian.serverPushDeadlineKind`, `guardian.serverPushRetention`(출국 7일 뒤 자동 삭제, 설정에서 언제든 지우기, 예약 업체 기록은 3일 안에 지워짐), `guardian.serverPushOffline`, `guardian.serverPushAlertRule`, `guardian.serverPushLocation`(일본 도쿄, 예약 메시지는 유럽 또는 미국)
  - 결과 줄 키는 위 다섯.
- 영어 문구에 'check-in'을 쓰지 않는다(설계서 '구현에서 달라진 것' 18).

- [ ] **Step 1: 테스트를 쓴다**

```js
test('항목은 스위치가 켜져 있고 출국일이 오늘 이후일 때만 보인다', () => {
  assert.equal(serverPushOptionVisible({ enabled: true, departureDate: '2026-11-20', today: '2026-11-20' }), true);
  assert.equal(serverPushOptionVisible({ enabled: true, departureDate: '2026-11-19', today: '2026-11-20' }), false);
  assert.equal(serverPushOptionVisible({ enabled: false, departureDate: '2026-11-25', today: '2026-11-20' }), false);
});
test('처음 체크 상태는 ON 일 때만 켜짐이다', () => {});
test('결과 줄: 성공, 이유별 실패, 체크하지 않음', () => {
  // { ok: false, reason: 'LOGIN_REQUIRED' } 이면 ['guardian.serverPushNotOn', 'guardian.serverPushLogin']
});
test('새 문구 키는 네 언어가 모두 있고 "안전합니다"와 check-in 이 없다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(guardian): 보호자 링크 동의 화면에 서버 알림 선택 항목(기본 꺼짐), 등록 실패에도 링크 생성`

---

### Task 9: '돌아왔어요'와 되돌리기 (D10, D14)

**Files:**
- Create: `components/trip/returnedView.js`, `components/trip/ReturnedConfirm.js`
- Modify: `components/ReturnSheet.js`, `components/trip/TripRuntime.js`, `app/today/page.js`, `src/i18n/messages/trip.js`, `app/styles/trip.css`, `app/styles/today.css`
- Test: `test/returned-view.test.js`(새)

**Interfaces:**
- Consumes: `useReturnedConfirm`(Task 7), `overdueOutingOf`(`components/trip/viewModel.js`), `useKstClock`, `useLang().pair`
- Produces:
  - `returnedView({ phase, nowMs, undoUntilMs }) → { button: boolean, busy: boolean, lineKey: string|null, undo: boolean }`
  - `<ReturnedConfirm day outing passedBy? />` (지켜보기가 ON이 아니거나 대상이 없으면 아무것도 그리지 않는다)
  - `ReturnSheet`의 새 선택 속성 `passedBy`

정한 값:
- `returnedView` 표:

| 단계 | 버튼 | 줄 | 되돌리기 |
| --- | --- | --- | --- |
| `null` | 보임 | `return.backHint` | 없음 |
| `SENDING` | 숨김(`busy`) | `return.backSending` | 없음 |
| `QUEUED` | 숨김 | `return.backQueued` | 보임 |
| `UNDO_QUEUED` | 숨김 | `return.backUndoQueued` | 없음 |
| `SENT` | 숨김 | `return.backSent` | `nowMs < undoUntilMs`일 때 |
| `FAILED` | 보임 | `return.backFailed` | 없음 |
| `UNDO_FAILED` | 숨김 | `return.backUndoFailed` | 없음 |

- '전달했어요'(`return.backSent`)는 `SENT`에서만 나온다.
- 놓는 곳:
  - 경우 1 시트(`variant="PASSED"`): `TripRuntime`이 `passedBy={passed.returnBy}`를 넘기고, 시트는 `outingId`의 외출과 함께 `<ReturnedConfirm day outing passedBy />`를 본문 문장 아래, 장소 절 위에 둔다.
  - 경우 2 시트(`variant` CLEARED, `cause === 'OUTING_OVERDUE'`): `outing = overdueOutingOf(day)`. 다른 원인의 시트에는 두지 않는다.
  - 오늘 화면: `focus.phase === 'OUT'`인 외출 카드(`today-focus`)의 `<Deadline>` 아래.
- 눌러도 시트를 닫지 않고 일정을 바꾸지 않는다(다르게 정한 것 11). 시트의 '확인했어요'가 닫는다.
- `ReturnedConfirm`은 `useKstClock`의 분으로 `nowMs`를 만들고, `SENT`면 `undoUntilMs`에 한 번 다시 그리는 타이머를 건다(되돌리기가 마감을 넘겨 남지 않게).
- 줄은 `pair()`로 주 언어와 병기 언어 두 줄, 감싸는 요소는 `role="status"`. 버튼은 `btn btn-secondary`, 되돌리기는 `btn btn-tertiary`(있는 변형 중 고른다), 둘 다 44px 이상.
- 문구(`trip.js`):
  - `messages`: `return.back` 돌아왔어요 / I'm back, `return.backUndo` 되돌리기 / Undo
  - `safety`: `return.backHint` 돌아왔다면 눌러 주세요. 마감이 지나도 누르지 않으면 보호자에게 서버 알림이 가요. `return.backSending` 보내는 중이에요. `return.backQueued` 연결되면 보호자에게 전달돼요. `return.backUndoQueued` 연결되면 되돌려요. 늦으면 되돌리지 못할 수 있어요. `return.backSent` 보호자에게 전달했어요. `return.backFailed` 전달하지 못했어요. 보호자에게 직접 연락해 주세요. `return.backUndoFailed` 되돌리지 못했어요. 필요하면 보호자에게 직접 연락해 주세요. (영어는 같은 뜻으로, 'guardian'을 쓴다. 일본어·중국어도 넣는다)

- [ ] **Step 1: 테스트를 쓴다**

```js
test('단계마다 버튼·줄·되돌리기가 표와 같다', () => {});
test('되돌리기는 SENT 에서 되돌리기 마감 전까지만 보인다', () => {
  // nowMs === undoUntilMs - 1 이면 undo true, nowMs === undoUntilMs 면 false
});
test('"전달했어요"는 SENT 에서만 나온다', () => {});
test('새 문구 키는 네 언어가 모두 있고 "안전합니다"가 없다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(trip): 마감 지남 시트·외출 중 재계획 시트·오늘 외출 카드에 돌아왔어요와 되돌리기`

---

### Task 10: 설정의 '서버 알림' 절 (D11, D13, D14)

**Files:**
- Create: `components/settings/serverPushView.js`, `components/settings/ServerPushSection.js`
- Modify: `components/settings/SettingsScreen.js`, `src/i18n/messages/settings.js`, `app/styles/settings.css`
- Test: `test/settings-server-push.test.js`(새)

**Interfaces:**
- Consumes: `useServerPushConfig`, `useGuardianWatch`, `getWatchSync()`의 `retire`·`removeAll`(Task 7), `useStoreStatus`, `shouldShowReadOnly`
- Produces:
  - `serverPushSectionView({ enabled, state, readOnly, online }) → { visible, stateKey, canTurnOff, canRemoveAll }`
  - `<ServerPushSection />`

정한 값:
- 보이는 조건: `enabled || state !== 'NONE'`(다르게 정한 것 18). 놓는 곳: 데이터 절(`ClearSessionButton`) 바로 위.
- 상태 줄: `ON`은 `settings.serverPushOn`(서버 알림이 켜져 있어요), `REPLACED`는 `settings.serverPushReplaced`("다른 기기에서 서버 알림을 다시 설정했어요"), `NONE`은 `settings.serverPushOff`(서버 알림이 꺼져 있어요. 보호자 링크를 만들 때 켤 수 있어요).
- '서버 알림 끄기'(`settings.serverPushTurnOff`): `ON`·`REPLACED`이고 쓰기 가능할 때. `retire()` 결과가 `{ ok: true, pending: false }`일 때만 `settings.serverPushTurnedOff`(서버 알림을 껐어요. 보호자에게 링크를 다시 보내면 반영돼요). `pending: true`면 `settings.serverPushTurnOffPending`(이 기기에서는 껐어요. 서버에 남은 정보는 연결되면 지워요. 그 전까지는 보호자에게 알림이 갈 수 있어요). `ok: false`면 `settings.serverPushTurnOffFailed`(서버 알림을 끄지 못했어요. 연결과 로그인을 확인한 뒤 다시 해 주세요)(작업 7 검토 반영).
- '서버에 남은 내 정보 지우기'(`settings.serverPushRemoveAll`): 쓰기 가능하고 온라인일 때. 확인 시트(기존 `Sheet`, 문구 `settings.serverPushRemoveConfirm`) 뒤 `removeAll()`. 결과: 성공 `settings.serverPushRemoved`({count}건), `LOGIN_REQUIRED`는 `settings.serverPushRemoveLogin`(Google 또는 카카오로 로그인해야 지울 수 있어요), 그 밖 `settings.serverPushRemoveFailed`. 결과 줄은 `role="status"`.
- 보기 전용이면 두 버튼을 막고 기존 `settings.offlineNote`·`settings.readOnlyNote` 줄 규칙을 그대로 쓴다.
- 문구는 `messages`(네 언어).

- [ ] **Step 1: 테스트를 쓴다**

```js
test('절은 스위치가 켜져 있거나 레코드가 있을 때만 보인다', () => {});
test('상태 줄 키는 ON, REPLACED, NONE 마다 다르다', () => {});
test('끄기는 ON·REPLACED 이고 쓰기 가능할 때, 서버 지우기는 쓰기 가능하고 온라인일 때만', () => {});
test('새 문구 키는 네 언어가 모두 있다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(settings): 서버 알림 상태, 끄기, 서버에 남은 내 정보 지우기`

---

### Task 11: 화면 테스트 (D16)

**Files:**
- Modify: `e2e/helpers.js`
- Create: `e2e/server-push.spec.js`

**Interfaces:**
- Consumes: Task 7~10의 화면, 기존 도우미 `startTrip`, `loginDemo`, `seedStay`, `readRecord`, `accountKeyOf`, `setClock`, `advanceClock`, `createGuardianLink`, `expectNoAxeViolations`, `expectNoHorizontalScroll`, `expectTouchTargets`, `evidenceShot`
- Produces (`e2e/helpers.js`):
  - `stubServerPush(page, { enabled = true, register = 200, deadlines = { status: 200, armFailed: 0 }, back = { status: 200, recorded: true }, remove = 200 } = {}) → { calls: Array<{ method, path, body }> }`
  - `seedGuardianWatch(page, record)` (계정 이름공간에 레코드를 쓴다)
  - `WATCH_FIXTURE = { watchId, writeToken }` (형식에 맞는 고정 값)

정한 값:
- 응답 모양은 `docs/contracts.md` 그대로다(`{ ok: true, expiresOn }`, `{ ok: true, expiresOn, armFailed }`, `{ ok: true, recorded }`, `{ ok: true }`, `{ ok: true, deleted }`, 실패는 `{ ok: false, errorCode }`).
- 경우 2 준비는 `e2e/overdue-return.spec.js`의 두 번째 시험(외출 중 병원 일정이 앞당겨짐)을 따른다. 보기 전용은 `context.clearCookies()`(`e2e/screen-guardian.spec.js`와 같다). 오프라인은 `context.setOffline()`.
- 모든 시험에서 화면에 '안전합니다'가 없다.

- [ ] **Step 1: 시험을 쓴다**

```js
test('스위치가 꺼져 있으면 동의 화면에 서버 알림 항목이 없고 /api/watch 요청이 0건이다', async ({ page }) => {});
test('켜져 있으면 항목은 기본 꺼짐, 켜고 만들면 등록 본문(22자·43자·출국일) 다음 마감 올리기가 가고 레코드가 ON 이다', async ({ page }) => {});
test('등록이 401 이면 링크는 만들어지고 Google·카카오 로그인 줄이 보이며 레코드가 없다', async ({ page }) => {});
test('경우 1 시트: 돌아왔어요를 누르면 본문 { date: 오늘, by: 마감 }, "보호자에게 전달했어요"와 되돌리기, 시트는 열린 채, 되돌리기는 undo: true', async ({ page }) => {});
test('오프라인에서 누르면 "연결되면 보호자에게 전달돼요"이고 요청 0건, 대기열 1건, 온라인이 되면 보내고 "전달했어요"', async ({ page, context }) => {});
test('보기 전용(쿠키 없음)에서도 누를 수 있고 돌아왔어요 요청은 가지만 마감 올리기는 0건이다', async ({ page, context }) => {});
test('경우 2 시트: by 는 이미 올린 원래 마감이다', async ({ page }) => {});
test('오늘 외출 카드: 외출 중이고 ON 이면 버튼이 있고, 출발 전이거나 지켜보기가 없으면 없다', async ({ page }) => {});
test('마감 올리기가 404 면 설정에 "다른 기기에서 서버 알림을 다시 설정했어요"가 보이고 버튼이 사라진다', async ({ page }) => {});
test('설정: 끄기는 토큰 DELETE, 서버에 남은 내 정보 지우기는 { all: true } DELETE', async ({ page }) => {});
test('내 정보 지우기를 오프라인에서 하면 서버 삭제 대기가 남고, 연결되면 DELETE 가 나가고 대기가 사라진다', async ({ page, context }) => {});
test('새 부품: 접근성 위반 0, 320px 가로 스크롤 없음, 누르는 곳 44px 이상', async ({ page }) => {});
```

- [ ] **Step 2: 빌드한 뒤 이 파일만 돌린다.** `npm run build && E2E_PORT=<빈 포트> npm run e2e -- e2e/server-push.spec.js` (다른 세션의 서버를 끄지 않는다. 빈 포트를 매번 찾는다)
- [ ] **Step 3: `npm run lint && npm test`**
- [ ] **Step 4: 커밋한다.** `test(e2e): 서버 알림 환자 쪽 화면(동의, 돌아왔어요, 오프라인, 보기 전용, 경우 2, 갈아 끼움, 지우기)`

---

### Task 12: 문서

**Files:**
- Modify: `docs/security.md`, `docs/contracts.md`, `docs/business-rules.md`, `docs/architecture.md`, `docs/engineering-notes.md`, `docs/tracking/status.md`, `lib/store/AGENTS.md`, `lib/trip/AGENTS.md`, `src/guardian/AGENTS.md`, `components/AGENTS.md`, `docs/superpowers/specs/2026-11-09-server-push-design.md`

내용:
- `docs/security.md`: '기기 저장소와 계정 이름공간'에 `guardianWatch`(무엇을 담나: id, 토큰, 날짜별 마감 시각, 대기열. 장소·조건 없음), 보기 전용 예외는 `backQueue` 쓰기 하나(이유: '돌아왔어요'는 일정 편집이 아니라 확인 신호, 결정 8), 기기 기록 목록에 `pendingServerDelete`, "언어만 빼고 전부" 문장을 "언어, 로그아웃 미전송 표시, 서버 삭제 대기만 남기고 전부"로. '민감정보 동의'의 배지 문장(약 167행)을 안내 줄로(운영자 결정 2026-11-08), 철회하면 지켜보기도 지운다. '보호자 링크'에 `watchId` 필드와 링크 약 48자 증가.
- `docs/security.md` 149행(기기 기록 목록)에 `pendingServerDelete`(서버 삭제 대기)를 더하고, 167행의 '언어만 빼고 전부'를 지운다(언어, 로그아웃 미전송 표시, 서버 삭제 대기만 남는다). Task 5 검토 반영(2026-11-15)에서 확인한 두 줄이다.
- `docs/contracts.md` '서버 알림': 'A-2 클라이언트가 지키는 것' 절(올리는 범위와 D1, 어제는 올리지 않음, 하나씩, 계기, 보기 전용, `armFailed` 재시도, 404, 대기열 순서, 서버 삭제 대기). 보호자 스냅샷 필드 표가 있으면 `watchId`.
- `docs/business-rules.md` '보호자': 서버 알림 선택 항목, '돌아왔어요'는 판정이 아니고 일정을 바꾸지 않는다, 외출 시작 뒤에만, 되돌리기 마감.
- `docs/architecture.md`: 클라이언트 쪽 부품(`watchSync`, `guardianWatch`, 삭제 대기)과 서버로 넘어가는 값(id, 토큰, 날짜, 시각만).
- `docs/engineering-notes.md`: '알고 남기는 틈' 전부를 증상, 원인, 대응 형식으로. 보기 전용에서 올리지 않는 이유.
- `docs/tracking/status.md`: 만든 것(A-2). 남은 것(A-3 보호자 화면과 서비스 워커, 환자 기기 푸시, A-4). 진행을 막는 것에 "동의 문구의 보관 기간·저장 위치를 콘솔에서 최종 확인"을 더한다.
- `lib/store/AGENTS.md`, `lib/trip/AGENTS.md`, `src/guardian/AGENTS.md`(약 52행, `watchId`와 `deadlines.js`), `components/AGENTS.md`(`ReturnedConfirm` 표시 규칙).
- 설계서: '구현에서 달라진 것 (A-2)' 절을 더해 이 계획의 '설계서와 다르게 정한 것' 스물여섯 가지와 '알고 남기는 틈'을 옮긴다. 5.5 제목의 "(법무 검토 전 배지 표시)"를 고친다.
- `CLAUDE.md`, `AGENTS.md`의 "서버에 데이터베이스가 없고" 문장과 화면 약속 문구는 고치지 않는다(D15).

- [ ] **Step 1: 문서를 고친다.** 새 글에 엠대시·엔대시가 없는지 `git diff -U0 | grep '^+' | perl -CSD -ne 'print if /[\x{2013}\x{2014}]/'`로 확인한다(결과가 없어야 한다).
- [ ] **Step 2: `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `docs: 서버 알림 환자 쪽(A-2) 보안·계약·업무 규칙·구조 문서`

---

## 자체 점검

| 결정 | 맡는 작업 |
| --- | --- |
| D1 지난 마감 유지 | Task 6 `buildUploadState`, Task 7 |
| D2 당겨진 외출 제외, 다른 원인은 실제 마감 | Task 2, Task 6 |
| D3 `guardianWatch` 레코드, `backQueue` 예외 | Task 5, Task 12 |
| D4 `pendingServerDelete` | Task 5, Task 12 |
| D5 허용 30초 | Task 1, Task 6 `undoUntilMs` |
| D6 선택 항목, 실패에도 링크, 같은 `watchId` 재사용, 다시 등록은 토큰 교체 | Task 7 `ensureRegistered`, Task 8 |
| D7 스냅샷 `watchId`, 지문, 8000자 | Task 4 |
| D8 공용 계산 | Task 2 |
| D9 업로드 규칙 전부 | Task 7 |
| D10 세 곳, 외출 시작 뒤, 되돌리기, 대기 문구, `by` | Task 6 `backTargetOf`, Task 7, Task 9 |
| D11 지우기 경로 다섯 | Task 5, Task 7, Task 10 |
| D12 배지 없음 | Task 8, Task 12 |
| D13 설정 절 | Task 10 |
| D14 네 언어, `safety`, '안전합니다' 없음 | Task 8, 9, 10 |
| D15 범위 밖 | Global Constraints, Task 12 |
| D16 단위·이음매·화면 시험 | Task 3, 5, 6, 7, 11 |

- Review Focus 다섯 줄은 모두 Task 3, 5, 6, 7, 9, 10, 11의 시험 이름에 있다.
- 이름 맞춤: `isClampedOverdueOuting`, `patientDeadlineDays`, `buildUploadState`, `backTargetOf`, `undoUntilMs`, `applyBackAction`, `writeBackQueue`, `retireGuardianWatch`, `retryPendingServerDelete`, `ensureRegistered`, `useReturnedConfirm`은 작업 사이에 같은 이름과 인자로 쓴다.

## 실행 순서

| 묶음 | 작업 | 함께 돌릴 수 있는가 |
| --- | --- | --- |
| 1 | Task 1, Task 2, Task 3 | 셋 다 서로 다른 파일이라 함께 돈다 |
| 2 | Task 4, Task 5, Task 6 | 묶음 1이 합쳐진 뒤. 셋은 파일이 겹치지 않아 함께 돈다(Task 4는 Task 2·3, Task 5는 Task 3, Task 6은 Task 1·2·3을 쓴다) |
| 3 | Task 7 | 묶음 2가 합쳐진 뒤 |
| 4 | Task 8, Task 9, Task 10 | 묶음 3이 합쳐진 뒤. 화면, 문구 이름공간, 스타일 파일이 서로 달라 함께 돈다 |
| 5 | Task 11, Task 12 | 묶음 4가 합쳐진 뒤 함께 돈다 |

끝난 뒤: 전체 가지 독립 검토(개인정보, 보기 전용 예외, 지우기 경로, 자정, 경우 2 중심), 전체 관문(`npm run lint && npm test && npm run build && E2E_PORT=<빈 포트> npm run e2e`), PR, CI, 병합(운영 스위치는 꺼진 채라 운영 화면은 그대로), `npm run verify:deploy -- https://safehour.vercel.app --skip-plan`.
