# 서버 알림 보호자 쪽 화면과 서비스 워커 (갈래 2 단계 A-3) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보호자 기기에서 서버 알림을 받게 한다. `/g`의 받은 일정 화면에 '앱이 닫혀 있어도 받기' 항목을 두어 구독하고 끄고, 서비스 워커가 `push`를 받아 잠금 화면 알림을 내고, 아이폰은 홈 화면 설치 안내와 링크 붙여넣기로 같은 흐름에 닿게 하고, 상태 조회로 '복귀 확인' 표시와 '오늘 함께 있음'을 보인다. 갈래 1의 기기 알림과 한 마감에 두 번 울리지 않게 맞춘다. 운영 스위치가 꺼진 채 병합하므로 운영 화면은 바뀌지 않는다(`GET /api/push/config`가 꺼짐을 알리고 이 기기에 구독이 없으면 새 항목이 모두 숨는다).

**Architecture:** 요청 모양(형식, 본문 허용 목록, 응답 읽기)은 순수 모듈 `src/guardian/pushRequests.js`에 두고 A-2의 `sendWatchRequest`로 보낸다. 기기 상태는 계정 레코드 `guardianPush` 하나와 A-2의 기기 키 `pendingServerDelete`(구독 해지 항목을 더해 두 종류)다. 무엇을 할지는 순수 함수(`lib/notify/pushSupport.js`, `lib/notify/guardianPushPlan.js`)가 정하고, 브라우저 Push API·서비스 워커·요청·타이머를 다루는 것은 실행기(`lib/notify/guardianPush.js`) 하나가 맡는다. 화면은 훅(`lib/notify/useGuardianPush.js`)과 표시 규칙(`components/guardian/guardianPushView.js`)만 쓴다. 서비스 워커는 `push`와 준비 확인 메시지 두 가지를 더한다. 서버 코드는 바꾸지 않는다.

**Tech Stack:** Next.js 16 App Router 화면(plain JS, React), Service Worker Push API(`pushManager.subscribe`, `push`·`message` 이벤트), Notifications API(`getNotifications`, `tag`, `renotify`), WebCrypto `subtle.digest`, `MessageChannel`, 브라우저 `localStorage`, `node --test`(서비스 워커는 `vm`에서 실제로 돌린다), Playwright(Chromium, CDP). 새 패키지 없음.

**Spec:** `docs/superpowers/specs/2026-11-09-server-push-design.md`(3절 (a)·(c)·(d)·(e), 5.3, 5.5, 7.4, 8.1 질문 22·24, 11.1, '구현에서 달라진 것 (A-1)'·'(A-2)'), `docs/contracts.md` '서버 알림'(지금 유효한 계약), `docs/decisions/0012-server-minimal-storage-guardian-push.md`(결정 14, 15, 19, 22, 24), A-2 계획 `docs/superpowers/plans/2026-11-15-server-push-patient-ui.md`. 아래 '설계서와 다르게 정한 것과 정한 값'이 설계서 본문보다 우선한다.

## Global Constraints

- `package.json`, `package-lock.json`을 바꾸지 않는다. 새 패키지와 npm 스크립트를 더하지 않는다. 새 패키지 없이 안 된다고 판단되면 멈추고 보고한다.
- 새로 쓰는 글(코드 주석, 문서, 화면 문구, 커밋 메시지)에 엠대시와 엔대시를 쓰지 않는다. 쉼표, 괄호, 콜론을 쓴다.
- 주석과 문서는 한국어로 쓴다. plain JS. 어느 언어 문구에도 '안전합니다'(같은 뜻의 번역 포함)를 쓰지 않는다.
- 화면 문구는 `src/i18n/messages/<기능>.js`에만 네 언어(ko, en, ja, zh) 모두 둔다. ja·zh는 검수 전 번역이고 주석에 그렇게 적는다. 도착 비보장, 위치, 복귀 확인, 끄기 대기처럼 복귀·전달 상태를 전하는 문장은 그 파일의 `safety` 블록에 둔다(일본어·중국어 화면에서는 검수 스위치 전까지 영어+한국어로 보인다). 버튼 이름, 안내 단계, 결과 줄은 `messages`에 둔다.
- 색·크기 값은 `app/globals.css`의 토큰만 쓴다. 기능 스타일 파일(`app/styles/guardian.css`)은 토큰을 참조만 한다.
- 안전 표시: 본문 16px 이상, 누르는 곳 44px 이상, 색만으로 뜻을 전하지 않는다(늘 문장이나 아이콘+글자가 함께 있다), WCAG AA. 상태가 바뀌는 줄은 `role="status"`, 실패 줄은 `role="alert"`.
- 위치를 묻거나 읽지 않는다. 위치 권한을 부르는 코드 경로가 생기면 멈추고 보고한다. '복귀 확인'은 버튼이 눌렸다는 신호일 뿐이고 판정이 아니다.
- `watchId`, `subId`, 구독 `endpoint`, `p256dh`, `auth`, 날짜, 시각을 `console`, 오류 메시지, URL 경로·쿼리, 알림 `data`에 싣지 않는다. 식별 값은 요청 본문으로만 보낸다. 기기 레코드에는 `endpoint` 원문과 두 키를 두지 않고 `endpoint`의 SHA-256 해시만 둔다.
- 서버에 새 저장소·필드·경로를 더하지 않는다(네 레코드 그대로). 서버 코드(`lib/server/`, `src/push/`, `app/api/`)는 바꾸지 않는다. 서버 쪽 변경이 필요해 보이면 멈추고 보고한다.
- 운영 스위치(`SAFEHOUR_SERVER_PUSH`)는 꺼진 채 둔다. 미리보기·운영 환경변수를 건드리지 않는다.
- `public/sw.js`를 고치면 `SW_VERSION`을 올린다. `sw.js`의 `NOTIFICATION_PATHS`는 `lib/notify/device.js`와 같아야 한다(기존 테스트가 묶는다).
- 시계, `fetch`, 타이머, `navigator`, `Notification`, `crypto.subtle`은 주입한다. 날짜·시각은 `src/stay/time.js` 도우미(`kstInstantMs`, `isDateString`, `isClockTime`)와 `kstClock(nowMs).date`로만 계산한다. 오프셋 없는 문자열을 `new Date()`로 읽지 않는다.
- 단위 테스트는 시간대와 무관해야 하고(`TZ=America/New_York npm test`로 확인) Node 18에서 멈추지 않아야 한다(타이머는 `unref` 하거나 테스트가 직접 돌린다. `/opt/homebrew/opt/node@18/bin/node --test`로 확인). 외부 호출 0건.
- 클라이언트 코드(`components/`, `app/`의 화면, `lib/store/`, `lib/notify/`, `src/guardian/`)는 `lib/server/`, `src/auth/`, `src/push/`를 불러오지 않는다. 테스트는 불러도 된다. `lib/store/`는 `lib/notify/`·`lib/trip/`을 불러오지 않는다. `lib/notify/`는 `components/`를 불러오지 않는다.
- `node --test`가 읽는 모듈은 상대 경로로 불러온다(`@/` 별칭 금지). 새 테스트 파일은 `test/` 바로 아래 `*.test.js`다.
- 화면 테스트는 `npm run build` 뒤 빈 `E2E_PORT`에서 돈다(`next start`는 있는 `.next`를 쓴다). 다른 세션의 서버를 끄지 않는다. `/api/push/config`, `/api/watch*`는 `page.route`로, Push API는 초기화 스크립트로 대신한다.
- 범위 밖: 환자 기기 푸시(질문 21), 운영 켜기와 실기기 확인(A-4), 로그인 없는 보호자의 사본 보관(질문 22 후속). "서버에 데이터베이스가 없고" 문장과 화면의 약속 문구는 그대로 둔다.
- 기존 시험이 새 결정과 부딪히면 의도적으로 고치고 이유를 커밋 메시지에 적는다. 조용히 지우거나 건너뛰지 않는다.
- 각 작업은 독립 검토(code-reviewer, 그 작업의 diff만)를 통과해야 다음 작업으로 넘어간다. 중요 지적이 남으면 고치고 다시 검토한다.
- 커밋 메시지 끝: 빈 줄 하나 다음 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 각 작업의 마지막 확인: `npm run lint && npm test`.

## 설계서와 다르게 정한 것과 정한 값 (이 계획이 정본, Task 9에서 설계서에 옮긴다)

[다르게]는 설계서 본문과 다른 것, [정한 값]은 설계서가 열어 둔 것을 정한 것이다.

구독 항목과 흐름

1. [다르게] 항목이 보이는 조건: 기기 알림 스위치('복귀 마감 알림 받기') 바로 아래에 두되, 그 스위치가 켜졌는지와 무관하게 `config.enabled`가 참이고 보고 있는 사본에 `watchId`가 있고 그 `watchId`가 `gone`에 없으면 보인다. 이 기기에 그 `watchId`의 구독이 있으면 `config.enabled`가 거짓이어도 보인다(끄기만 된다, 12번). 이유: 아이폰 Safari 탭에는 `Notification`이 없어 기기 알림 스위치를 켤 수 없다. 설계서처럼 기기 스위치가 켜졌을 때만 보이면 아이폰 설치 안내가 영영 보이지 않는다.
2. [다르게] '앱이 닫혀 있어도 받기'를 켜면 기기 알림 스위치도 켠다: 누르면 먼저 `turnOnDeviceNotifications`(권한 요청 포함)를 부르고 그다음 구독한다. 권한 묻기는 한 번이다. 반대로 기기 알림 스위치를 끄면(받은 일정 화면이든 설정 화면이든 `prefs.notifications`가 거짓이 되면) 이 계정의 서버 구독을 모두 끈다(8번 다시 맞추기). 기기 스위치를 켜도 서버 구독을 저절로 켜지 않는다. 이유: 서버 항목은 기기 알림의 상위 기능이고, 부모를 끄면 자식도 꺼지는 쪽이 사용자가 예상하는 모양이다.
3. [다르게] 설정 읽기 시점: `GET /api/push/config`는 항목이 그려질 때(사본에 `watchId`가 있을 때만) 읽고 10분 동안 기억한다. 누르면 권한 요청, `pushManager.subscribe`, `POST /api/watch/subscribe` 순서다. 설계서는 권한 다음에 설정을 읽었다. 이유: 항목을 보일지 정하는 데 설정이 필요하고, Safari는 구독 호출이 사용자 동작과 가까워야 한다. 설정을 못 읽으면(오프라인) 이미 보이던 상태를 바꾸지 않고 켜기만 막는다.
4. [정한 값] 서비스 워커 준비 확인: 켜기 전에 활성 워커에 `MessageChannel`로 `{ type: 'SAFEHOUR_SW_INFO' }`를 보내 `{ push: true }` 답을 받아야 구독한다. 답이 2초 안에 없으면 `registration.update()` 뒤 컨트롤러 교체를 5초까지 기다리고 한 번 더 묻는다. 그래도 없으면 `SW_NOT_READY`이고 '새로 고침' 버튼을 보인다. 항목이 그려질 때 한 번 미리 확인해 누를 때는 기다리지 않게 한다. 이유: `push` 처리기가 없는 옛 워커가 구독을 받으면 푸시가 조용히 사라지고, 아이폰은 조용한 푸시가 쌓이면 권한을 거둔다.
5. [정한 값] 구독 흐름 상태(화면 상태 `PUSH_ITEM_STATE`): `HIDDEN`, `IOS_NEEDS_INSTALL`, `IOS_TOO_OLD`, `UNSUPPORTED`, `DENIED`, `SW_NOT_READY`, `AVAILABLE`(켤 수 있음), `WORKING`(권한, 구독, 저장을 한 상태로 묶고 스위치를 잠근다), `ON`, `PAUSED`(설정 꺼짐, 구독 있음), `RENEW_NEEDED`, `MOVED`, `GONE`. 켜기 결과(`PUSH_RESULT`)는 `ON`, `DENIED`, `UNSUPPORTED`, `SW_NOT_READY`, `FAILED`(구독 호출이 던짐), `LOGIN_REQUIRED`, `RATE_LIMITED`, `OFF`, `GONE`(404), `UNAVAILABLE`, `NETWORK`, `READ_ONLY` 하나씩이고 결과 줄 문구가 하나씩 있다. 실패하면 서버에 보낸 것이 없도록 순서를 지킨다: 저장(`POST`)이 실패하면 방금 만든 브라우저 구독은 이 기기의 다른 구독이 쓰지 않을 때만 `unsubscribe()`한다.
6. [다르게] 기기 기록의 모양: 설계서는 `subId`만 `guardianPush`에 둔다고 했다. 이 계획은 계정 레코드 `guardianPush` 하나에 `subs`(지켜보기별 `subId`, 보낸 언어, 구독 때의 `endpoint` 해시, VAPID 공개키), `status`(지켜보기별 마지막 상태 조회), `gone`(404를 받은 `watchId`)을 함께 둔다(공용 모양). `endpoint` 원문과 `p256dh`·`auth`는 두지 않는다. 이유: 주소가 바뀌었는지, 키가 바뀌었는지, 지난 상태가 얼마나 오래됐는지 알아야 다시 맞추기와 겹침 막기를 할 수 있다.
7. [정한 값] 브라우저 구독은 기기에 하나다: 한 `PushSubscription`이 이 기기의 모든 지켜보기를 받는다. 브라우저 `unsubscribe()`는 (a) '이 기기에서 내 정보 지우기', (b) 끄기로 이 기기의 마지막 구독(모든 계정 합쳐)이 없어질 때, (c) 다시 켜기(`RENEW_NEEDED`)에서 새로 구독하기 직전에만 부른다.
8. [정한 값] 다시 맞추기: 앱 열기, 화면 복귀(`visibilitychange`), 온라인 복귀, 저장소 주제 `guardianCopies`·`guardianPush`·`prefs`·`status` 변경 때 돈다. 켜기·끄기·다시 켜기·다시 받기와 같은 줄 하나에서 한 번에 하나씩 돈다. 언어가 바뀐 것은 다음 다시 맞추기가 반영한다. 쓰기 가능할 때만 돈다(보기 전용에서는 서버 삭제 대기 재전송만 저장소가 한다).
   - 살아 있는 사본 어디에도 없는 `watchId`의 구독: 끈다(서버 삭제 대기 경로).
   - 기기 알림 스위치가 꺼졌거나 권한이 `granted`가 아님: 모두 끈다. 권한이 사라진 경우 '알림 권한이 꺼져 서버 알림도 껐어요' 줄을 한 번 보인다.
   - 브라우저 구독의 `endpoint` 해시가 구독 기록과 다름(VAPID 키는 같음): 그 지켜보기를 같은 브라우저 구독으로 다시 `POST`한다. 사용자 동작이 필요 없다.
   - 언어가 바뀜: 다시 `POST`한다(같은 `endpoint`라 서버가 이전 기기 알림을 보내지 않는다).
   - 설정의 VAPID 공개키가 구독 기록의 키와 다르거나, 구독 기록이 있는데 브라우저 구독이 없음: `RENEW_NEEDED`. 저절로 구독하지 않고 '다시 켜기' 버튼을 보인다(결정 19, Safari는 구독에 사용자 동작이 필요하다).
   - 다시 `POST`는 앱 실행 한 번에 지켜보기당 한 번만 시도한다(429·503에서 되풀이하지 않는다).
9. [정한 값] `subscriptionActive`가 거짓: `MOVED` 줄("다른 기기가 알림을 가져갔거나 이 휴대폰의 알림 주소가 만료됐어요")과 '이 휴대폰에서 다시 받기' 버튼을 보인다. 저절로 다시 구독하지 않는다. 이유: 원인(다른 기기, 주소 만료, 만료 맞추기 틈)을 구분할 수 없고, 두 기기가 저절로 다시 구독하면 서로에게 '기기가 바뀌었어요' 알림을 주고받는다. engineering-notes의 "다시 구독하게 한다"는 이 버튼으로 지킨다.
10. [정한 값] 404(구독, 상태 조회, 함께 있음 어느 것이든): 지켜보기가 없어졌다(환자가 끔, 만료). 그 `watchId`를 `gone`에 넣고 구독 기록에서 빼며 해지 요청은 보내지 않는다(서버가 지켜보기와 함께 지웠다). `GONE` 줄을 보이고 켜기는 숨긴다. 환자의 다시 등록(갈아 끼움, 같은 `watchId`에 새 토큰)은 서버가 구독을 그대로 두므로(`lib/server/watch/patient.js registerWatch`가 구독 키를 건드리지 않는다) 보호자 쪽은 아무것도 바뀌지 않는다. 환자가 다시 켜서 새 `watchId`가 생기면 새 링크와 새 사본이므로 새 항목이다.
11. [정한 값] 끄기: 구독을 기록에서 빼고 `{ watchId, subId }`를 서버 삭제 대기에 넣은 뒤 저장소의 `retryPendingServerDelete()`가 `DELETE /api/watch/subscribe`를 보낸다. 200·404·400이면 대기에서 빠지고, 연결 실패·429·503이면 남아 다음 온라인·앱 열기에 다시 보낸다. 남았으면 '이 휴대폰에서는 껐어요. 연결되면 서버에서도 지워요. 그 전까지 알림이 올 수 있어요.'를 보인다. 해지는 로그인이 필요 없지만, 화면의 끄기는 기기 알림 스위치처럼 쓰기 가능할 때만 누를 수 있다.
12. [정한 값] 서버 알림 스위치가 꺼진 배포: 이 기기에 구독이 없으면 항목이 없고 서버 알림 요청은 설정 읽기 하나뿐이다. 구독이 있으면 `PAUSED` 줄("서버 알림이 지금 쉬고 있어요. 앱이 열려 있을 때 알림은 그대로 받아요.")과 끄기만 보인다. 구독, 상태 조회, 함께 있음 요청은 보내지 않는다(해지는 스위치와 무관하게 서버가 받는다). 사본에 `watchId`가 없으면 설정도 읽지 않는다(서버 알림 요청 0건).
13. [정한 값] 서버 삭제 대기 두 종류: `pendingServerDelete` 항목은 `{ watchId, writeToken }`(A-2) 또는 `{ watchId, subId }`(A-3)이다. 지켜보기 삭제는 `watchId`로, 구독 해지는 (`watchId`, `subId`)로 겹침을 없애고 합쳐 10개다. 10개를 넘으면 가장 오래된 구독 해지부터, 그다음 가장 오래된 지켜보기 삭제를 버린다(서버에 남은 마감이 더 무겁다). '이 기기에서 내 정보 지우기'는 모든 계정의 구독을 대기로 옮긴다. 남기는 키는 여전히 세 개(언어, 로그아웃 보류, 서버 삭제 대기)다. 구독은 자기 체류가 아니라 사본의 수명을 따른다(Task 2 검토로 고침): 앱을 열 때 모든 계정에서, 로그인 없이, 사본 정리(`pruneGuardianCopies`) 뒤 살아 있는 사본 어디에도 없는 `watchId`의 구독을 대기로 옮기고 그 `watchId`의 `status`·`gone` 항목도 지운다. 사본은 환자 출국일 23:59(한국 시간)에 만료되므로 필요한 구독을 잃지 않고, 보호자만 쓰는 기기에서도 돈다. 자기 체류의 자동 삭제는 구독을 건드리지 않는다. 지우기 경로는 구독 레코드의 다른 필드가 깨졌어도 `watchId`와 `subId`가 맞으면 대기에 넣는다(A-2 규칙과 같다). `guardianPush`는 레코드 통째로 쓰지 않고 `updateGuardianPush(updater)`(동기로 읽고 고치고 쓴다)로 고친다. Task 5는 기다림 뒤에 쓸 때 이것을 쓰고, 기다리는 사이 계정이 바뀌었으면 방금 만든 구독을 `queueServerDelete({ watchId, subId })`로 넘긴다. 지우기 버튼(`ClearSessionButton`)은 저장소를 지우기 전에 브라우저 구독 `unsubscribe()`를 3초까지 시도한다(실패해도 지우기는 계속한다).

상태 조회와 표시

14. [정한 값] 상태 조회 조건: `config.enabled`가 참, 쓰기 가능(로그인), 사본에 `watchId`가 있고 `gone`에 없을 때. 구독 여부와 무관하게 조회한다(구독이 있으면 `subId`를 함께 보낸다). 계기: 앱 열기, 화면 복귀(앞 조회와 2분 미만이면 건너뜀), 오늘 남은 마감마다 마감 60초 전과 마감 + `serverPushGraceMin` + 1분, `/g`가 보이는 동안 5분마다. 대상: 가장 최근 사본(기기 알림이 쓰는 것)과 `/g`에 보이는 사본. 결과는 `guardianPush.status`에 둔다. 한도(로그인 시간당 120회) 안에서 넉넉하다.
15. [정한 값] '복귀 확인' 표시: 조회의 `date`가 그 줄의 날짜와 같고 `confirmed`에 그 마감이 있으면, 그 줄에 '복귀 확인' 꼬리표(아이콘+글자)를 붙이고 '마감 지남' 꼬리표·안내·줄 안의 전화 버튼 대신 "환자가 '돌아왔어요'를 눌렀어요. 앱은 위치를 모르기 때문에 실제로 돌아왔는지는 알 수 없어요."를 보인다. 마감 전(`UPCOMING`) 줄도 같다. 화면 아래 긴급 절(119, 1330)은 늘 그대로다. 절 아래에 '{시각}에 서버에서 확인한 내용이에요.'를 보인다. 확인이 없는 마감은 지금처럼 '마감 지남'이다.
16. [정한 값] '오늘 함께 있음': `ON` 상태이고 쓰기 가능하고 `config.enabled`가 참일 때만 항목 안에 스위치로 보인다. `POST /api/watch/mute` 결과와 상태 조회의 `muted`로 그린다. 안내: '켜면 오늘(한국 시간) 서버 알림을 보내지 않아요. 자정이 지나면 저절로 풀려요. 앱이 열려 있을 때 마감 시각 알림은 그대로 와요.'와 '자정 직전 마감의 알림은 자정 뒤에 올 수 있어요.'(engineering-notes의 00:01 대 23:55 경우를 화면에 적는다).

기기 알림과 겹침 막기

17. [정한 값] 갈래 1 기기 알림은 결정 15대로 그대로 둔다. 바꾸는 것은 표시 합치기 하나(R4)다: `COMPANION_RETURN_PASSED`의 `tag`를 서버와 같은 `sh-watch-<날짜>-<HH:MM>`로 바꾸고, 서비스 워커로 낼 때 같은 `tag` 알림이 이미 알림 칸에 떠 있으면 내지 않는다(보던 알림을 덮어 다시 울리지 않게). 확인된 마감의 기기 알림 건너뛰기(검토안 R1)와 활성 구독일 때 늦은 알림 창 줄이기(검토안 R3)는 하지 않는다. 둘 다 기기 알림을 줄이는 변경이라 운영자 결정 15를 바꾸는 일이고, 서버 푸시가 실패했을 때의 받침을 없앤다. 그 결과 보호자가 서버 푸시를 눌러 앱을 열면 같은 마감의 기기 늦은 알림이 한 번 더 울릴 수 있다(같은 `tag`라 알림 칸에는 한 줄). 이 겹침을 줄일지는 A-4 실기기 확인 때 운영자에게 묻는다(status.md).
18. [정한 값] 한 기기에 환자가 둘 이상: 항목은 보고 있는 사본마다 하나다. 다른 사본의 구독은 그 사본이 살아 있는 동안 남는다. 기기 알림은 지금처럼 가장 최근 사본만 쓴다. 두 환자의 같은 시각 마감 서버 푸시는 `tag`가 같아 알림 칸에 한 줄로 합쳐진다(받아들인 한계, 서버 쪽만). 기기 늦은 알림은 다른 환자 사본에 같은 시각 마감이 있으면 예약 id `tag`로 따로 낸다(Task 4 검토로 고침, 알고 남기는 틈).

서비스 워커

19. [정한 값] `push` 처리: 본문을 JSON으로 읽어 `title`(1~80자), `body`(1~300자) 문자열이면 그대로 보인다(서버가 구독 언어로 만든 문장이다). 아니면 대체 문구 하나를 보인다(제목 'SafeHour', 본문은 한국어 줄과 영어 줄, `notifications.serverPushFallback`과 테스트로 묶는다). 어떤 경우에도 `event.waitUntil(showNotification(...))`을 부른다(조용한 푸시 0). `console`을 쓰지 않는다.
20. [정한 값] `tag`와 `renotify`: `tag`가 `/^sh-watch-(\d{4}-\d{2}-\d{2}-\d{2}:\d{2}|device)$/`에 맞을 때만 싣고, 그때만 `renotify: true`를 싣는다(`tag` 없이 `renotify`를 주면 브라우저가 `TypeError`를 던진다). A-1 본문에 종류 필드가 없어 지남과 확인을 나눌 수 없으므로 모두 다시 울린다. 확인 알림이 같은 `tag`의 지남 알림을 갈아 끼운다.
21. [정한 값] 누르면 여는 화면: 본문 `url`이 `NOTIFICATION_PATHS` 안이면 그것, 아니면 `/g`. 알림 `data`에는 `url` 하나만 둔다. `watchId`·날짜를 URL에 싣지 않는다. 누름 처리는 지금 그대로다(같은 출처 창을 앞으로, 경로가 다르면 이동, 없으면 새 창).
22. [정한 값] `pushsubscriptionchange` 처리기와 서비스 워커 IndexedDB를 두지 않는다. 주소 바뀜은 앱을 열 때 다시 맞추기가 고친다(알고 남기는 틈).
23. [정한 값] `SW_VERSION`을 `'2026-11-16.1'`로 올리고, 머리 주석의 옛 참조 두 건(`spec 4.18`, `spec 4.13`)을 `docs/platform/IA_AND_FLOWS.md '보기 전용 상태'`와 `docs/business-rules.md '알림과 카드'`로 바꾼다(2026-11-10 정한 것). 머리 주석 '하지 않는 일'에 "알림 예약은 하지 않는다. 서버가 보낸 푸시만 보인다"를 적는다.

아이폰과 링크 붙여넣기

24. [정한 값] 지원 판별은 사용자 에이전트 문자열을 읽지 않는다. 권한이 `denied`면 `DENIED`. 서비스 워커, `PushManager`, `Notification`이 모두 있으면 `READY`(macOS Safari 포함). 하나라도 없고 `typeof navigator.standalone === 'boolean'`(iOS·iPadOS Safari 계열)이면 설치 안 됨은 `IOS_NEEDS_INSTALL`, 설치됨은 `IOS_TOO_OLD`. 그 밖은 `UNSUPPORTED`(인앱 브라우저 포함, 문구가 Safari로 열라고 안내한다).
25. [정한 값] 아이폰 안내 다섯 단계: 공유 버튼, '홈 화면에 추가', 홈 화면의 SafeHour를 열고 로그인, '받은 일정 보기'에서 링크 붙여넣기와 PIN, '앱이 닫혀 있어도 받기' 켜기. 홈 화면 앱은 `/today`에서 시작하므로(매니페스트) 오늘 화면의 '받은 일정 보기'와 더보기의 받은 일정으로 `/g`에 온다. "홈 화면 앱은 Safari와 저장 공간이 따로라서 받은 일정을 한 번 더 열어야 해요."를 함께 보인다. 원래 링크는 기기에 남기지 않으므로 보호자가 메신저에서 다시 복사한다.
26. [정한 값] 링크 붙여넣기: `/g`에 '받은 링크 붙여넣기' 절을 둔다. 사본이 없으면 펼쳐져 있고, 있으면 접혀 있다. 받는 글은 링크 전체, 메신저 문장 속의 첫 http(s) 링크, `#암호문`, `#` 없는 암호문이다(`fragmentFromPasted`). 맞으면 기존 임시 보관(`holdPendingGuardianLink`, 탭 저장소, 1시간)에 넣고 `notifyIncomingLink()`로 기존 로그인·PIN 흐름을 탄다. 붙여 넣은 글은 서버로 보내지 않고 주소창에도 싣지 않으며, 받아들이면 입력란을 비운다. 입력란은 `autocomplete="off"`, `spellcheck={false}`다.
27. [정한 값] 로그인 없는 보호자(결정 22): 클라이언트는 `config.guardianLoginRequired`를 읽어 두지만 A-3에서 동작은 같다. 사본 가져오기와 계정 레코드 쓰기가 로그인을 요구하므로(docs/security.md) 보기 전용 보호자는 구독·상태 조회를 하지 않는다. 아이폰 홈 화면 앱에서 로그인 왕복이 돌아오지 않으면 로그인 없는 사본 보관이 필요하고, 그것은 실기기 확인 뒤 별도 작업이다(status.md '진행을 막는 것'에 적는다).
28. [정한 값] 보호자 동의 문구: 설계서 5.5 보호자 문구를 그대로 항목 안에 늘 보이고 `conditions.consentLegalReview` 안내 줄을 함께 둔다(A-2 D12와 같다, 배지 없음). 켜기 스위치를 누르는 것이 동의다. 문구 확정은 '운영자에게 물을 것' 1번.

## 알고 남기는 틈 (Task 9에서 engineering-notes와 설계서로 옮긴다)

- 마감과 마감 + 10분 사이에 앱을 열면 기기 늦은 알림(마감 도래)과 10분 뒤 서버 푸시(확인 없음)가 둘 다 온다. 뜻이 달라 받아들인다. 같은 `tag`라 알림 칸에는 한 줄이다.
- 앱을 열지 않는 동안 브라우저가 구독 주소를 바꾸면 다음에 열 때까지 서버 푸시가 닿지 않는다(`pushsubscriptionchange` 없음).
- 한 기기에서 다른 계정으로 바꿔 로그인해도 앞 계정의 구독은 이 기기로 계속 온다(문구에 이름이 없다). 그 계정이 끄거나 '내 정보 지우기'를 해야 멈춘다.
- 두 탭이 동시에 다시 `POST`하면 기록의 `subId`가 서버와 어긋나 `MOVED`가 잘못 보일 수 있다. '다시 받기' 버튼이 고친다.
- 상태 조회는 최대 5분 묵을 수 있다. 확인 뒤 되돌리기가 그 사이에 있으면 화면에 '복귀 확인'이 잠시 남는다. 기기 알림은 확인과 무관하게 그대로 울린다(결정 15).
- 보호자가 서버 푸시를 눌러 앱을 열면 같은 마감의 기기 늦은 알림이 한 번 더 울릴 수 있다(결정 15, 같은 `tag`라 알림 칸에는 한 줄). A-4 실기기 확인 때 운영자에게 묻는다.
- 아이폰 홈 화면 앱의 소셜 로그인 왕복이 돌아오지 않으면 홈 화면 앱에서 사본을 열 수 없다(질문 22, 실기기 확인 전).
- 대체 문구는 한국어와 영어 두 줄뿐이다(서비스 워커는 사전을 읽지 않는다). 정상 본문은 구독 언어로 온다.
- 앱이 열린 채 사본이 만료되면(23:59) 그 구독은 다음 앱 열기나 다시 맞추기(쓰기 가능할 때)까지 대기로 옮겨지지 않는다. 사본 읽기는 화면 그리기 길이라 거기서 지우기를 돌리지 않는다. 그 사이 서버 지켜보기도 만료돼 푸시는 오지 않는다.
- 앱이 열린 채 사본이 만료되면(23:59) 그 구독은 다음 앱 열기나 다시 맞추기(쓰기 가능할 때)까지 대기로 옮겨지지 않는다. 사본 읽기는 화면 그리기 길이라 거기서 지우기를 돌리지 않는다. 그 사이 서버 지켜보기도 만료돼 푸시는 오지 않는다.
- 보호자 마감 지남의 `tag`는 날짜와 시각뿐이라 환자를 가리지 못한다. 기기 늦은 알림은 예약을 만든 사본과 다른 `watchId`를 가진 사본에 같은 날짜·시각 마감이 있으면 서버 푸시와 같은 `tag` 대신 예약 id `tag`로 내고 같은 `tag` 건너뛰기를 하지 않는다(`mayShareWatchTag`, `sharedWatchTag`, Task 4 검토로 더함). `watchId`가 없는 사본은 푸시를 보낼 수 없어 세지 않는다. 남는 틈: 서버 쪽에서만 생기는 것으로, 서버 `tag`에 환자가 없어 구독한 두 환자의 같은 분 마감 푸시는 알림 칸에서 서로 갈아 끼운다(status.md 스위치 전 할 일). 기기 알림이 공유 `tag`로 나가 다른 환자의 푸시 때문에 건너뛰거나 갈아 끼워질 수 있는 때는 셋이다: 앞 계정의 구독(이 계정에서 사본을 읽을 수 없다)이 같은 시각 푸시를 보낼 때, 다른 환자 사본이 23:59에 지워진 뒤 늦게 깬 23:5x 타이머가 돌 때, 다른 환자가 링크를 보낸 뒤 일정을 바꿔 서버 마감만 같은 시각이 됐을 때(판단 근거가 사본에 담긴 마감이다). 앱 안 배너는 그대로 뜬다.

## 운영자에게 물을 것

1. 보호자 동의 문구(설계서 5.5 보호자 쪽, 법무 대상). 추천 기본값: 설계서 문장 그대로 쓰고 `conditions.consentLegalReview` 줄을 함께 보인다. 운영 스위치를 켜기 전 법무 검토 목록(status.md)에 이미 들어 있으므로 이 작업을 막지 않는다. 답이 오기 전에는 기본값으로 진행한다.

## 공용 모양

**`guardianPush` 계정 레코드** (`safehour.v2.<계정 키>.guardianPush`, `lib/store/guardianPush.js`가 정규화)

```js
{
  subs: Array<{
    watchId: string,      // 22자 base64url
    subId: string,        // 22자 base64url (서버 SUB_ID_RE 와 같은 형식)
    lang: 'ko'|'en'|'ja'|'zh', // 구독 때 보낸 언어
    endpointHash: string, // 구독 endpoint 의 SHA-256, 채움 없는 base64url 43자
    vapidKey: string,     // 구독 때 쓴 VAPID 공개키(공개 값)
  }>,                     // 최대 10, watchId 로 겹치지 않음(나중 것)
  status: Array<{
    watchId: string,
    date: string,         // 서버가 준 오늘(KST)
    confirmed: string[],  // HH:MM, 최대 10
    muted: boolean,
    active: boolean|null, // subscriptionActive. subId 없이 조회했으면 null
    atMs: number,         // 조회를 받은 기기 시각
  }>,                     // 최대 10, watchId 로 겹치지 않음
  gone: string[],         // 404 를 받은 watchId, 최대 10
}
```

- 쓰기: `writeGuardianPush`는 쓰기 가능할 때만. 형식이 틀린 항목은 버리고, 모르는 필드는 남기지 않는다(`endpoint`, `p256dh`, `auth`가 들어와도 버린다).
- 끄기: `retireGuardianPushSub(watchId)`가 기록에서 빼고 `{ watchId, subId }`를 대기에 넣고 `retryPendingServerDelete()`를 건다.

**`pendingServerDelete` 기기 키**: `Array<{ watchId, writeToken } | { watchId, subId }>`, 합쳐 최대 10, (종류, `watchId`)로 겹치지 않는다. `writeToken` 항목은 `DELETE /api/watch`, `subId` 항목은 `DELETE /api/watch/subscribe`로 보낸다. 끝난 것으로 보는 결과는 A-2와 같다(`OK`, `NOT_FOUND`, `BAD`).

**요청 결과 종류**: A-2 `WATCH_KIND` 그대로(`OK`, `NOT_FOUND`, `LOGIN_REQUIRED`, `RATE_LIMITED`, `OFF`, `BAD`, `UNAVAILABLE`, `NETWORK`). 보내기는 A-2 `sendWatchRequest`.

**실행기 상태** (`getState(watchId)`가 돌려주는 얼린 객체, 화면 훅이 `useSyncExternalStore`로 읽는다)

```js
{
  support: 'READY'|'IOS_NEEDS_INSTALL'|'IOS_TOO_OLD'|'UNSUPPORTED'|'DENIED',
  config: { enabled: boolean, vapidPublicKey: string|null, guardianLoginRequired: boolean } | null, // null = 못 읽음
  swReady: boolean|null,  // null = 아직 확인 전
  sub: { subId, lang } | null,
  status: { date, confirmed, muted, active, atMs } | null,
  gone: boolean,
  renewNeeded: boolean,
  moved: boolean,         // status.active === false 이고 sub 있음
  busy: boolean,
  lastResult: string|null, // PUSH_RESULT 또는 'OFF_DONE'|'OFF_PENDING'|'MUTE_ON'|'MUTE_OFF'|'PERMISSION_LOST'
}
```

**서비스 워커 메시지**: 페이지가 `registration.active.postMessage({ type: 'SAFEHOUR_SW_INFO' }, [port])`를 보내면 워커는 그 포트로 `{ type: 'SAFEHOUR_SW_INFO', version: SW_VERSION, push: true }`를 답한다. 다른 `type`이나 포트 없는 메시지는 무시한다.

**푸시 본문** (A-1 `lib/server/watch/text.js` 그대로): `{ title, body, url: '/g', tag }`. `tag`는 지남·확인이 `sh-watch-<날짜>-<HH:MM>`, 기기 바뀜이 `sh-watch-device`.

**시각 규칙**

- 오늘 `today = kstClock(nowMs).date`. 마감 시각 `kstInstantMs(date, by)`.
- 상태 조회 타이머: 오늘 남은 마감마다 `kstInstantMs(today, by) - 60_000`와 `kstInstantMs(today, by) + (serverPushGraceMin + 1) * 60_000`.
- 실행기 상수(구현 시간값, 안전 판정 숫자가 아니라 `defaults.js`에 두지 않는다): `CONFIG_TTL_MS = 10 * 60_000`, `STATUS_POLL_MS = 5 * 60_000`, `STATUS_MIN_GAP_MS = 2 * 60_000`, `STATUS_BEFORE_MS = 60_000`, `SW_INFO_TIMEOUT_MS = 2_000`, `SW_UPDATE_TIMEOUT_MS = 5_000`, `FORGET_TIMEOUT_MS = 3_000`.

## Review Focus

작업별 테스트만으로는 놓치기 쉬운 다섯 가지다. 각 줄 끝의 작업이 그 고정 테스트를 갖는다.

1. 한 마감에 알림 두 번. 18:00 마감, 서버 푸시가 18:10에 와서 알림 칸에 떠 있다. 이때 앱을 열어 기기 늦은 알림이 같은 마감으로 나오면 같은 `tag`라 새로 울리지 않아야 한다(R4). 보호자가 서버 푸시를 눌러(알림이 닫힘) 18:15에 앱이 열리면 기기 늦은 알림은 결정 15대로 나온다(같은 `tag`, 한 줄). 고정 테스트: '같은 tag 알림이 떠 있으면 기기 알림을 내지 않는다', 'watchNotificationTag 는 서버 pushPayload 의 tag 와 같다', '서버 푸시를 누른 뒤 18:15에 앱을 열면 늦은 기기 알림을 낸다(결정 15)'. (Task 4)
2. 아이폰 홈 화면 판별. Safari 탭(`standalone` 거짓, `PushManager` 없음)은 설치 안내, iOS 16.3 홈 화면 앱(`standalone` 참, `PushManager` 없음)은 업데이트 안내, macOS Safari(API 모두 있음)는 바로 켜기, 인앱 브라우저는 Safari로 열라는 안내다. 사용자 에이전트를 읽지 않는다. 고정 테스트: 'macOS Safari 처럼 standalone 속성이 있어도 API 가 모두 있으면 READY 다', 아이폰 흉내 화면 시험 둘. (Task 5, Task 8)
3. 키 교체와 주소 바뀜. VAPID 키가 바뀌면 저절로 구독하지 않고 '다시 켜기'를 보이며, 누르면 옛 브라우저 구독을 먼저 `unsubscribe()`한 뒤 새로 구독하고 모든 지켜보기를 다시 `POST`한다(옛 주소가 살아 있으면 같은 기기에 '기기가 바뀌었어요'가 뜬다). 주소만 바뀌면 사용자 동작 없이 다시 `POST`한다. 고정 테스트: 'renew 는 unsubscribe 를 subscribe 보다 먼저 부르고 모든 구독을 다시 POST 한다', 'VAPID 키가 다르면 subscribe 를 부르지 않고 renewNeeded 다', 'endpoint 해시가 다르면 같은 브라우저 구독으로 다시 POST 한다'. (Task 5, Task 8)
4. 서비스 워커 갱신 중 구독과 수신. `push` 처리기가 없는 옛 워커가 활성인 채 구독하면 푸시가 조용히 사라진다. 처리기는 본문이 깨져도 늘 알림 하나를 낸다. `tag`가 없으면 `renotify`를 싣지 않는다. 고정 테스트: '준비 확인 답이 없으면 update 뒤 다시 묻고 그래도 없으면 SW_NOT_READY 이며 subscribe 를 부르지 않는다', '본문이 없거나 JSON 이 아니거나 비었으면 대체 문구로 하나를 낸다', 'tag 가 형식 밖이면 tag 와 renotify 를 싣지 않는다', 빌드한 워커가 `SAFEHOUR_SW_INFO`에 답하는 화면 시험. (Task 3, Task 5, Task 8)
5. 스위치 꺼짐과 `watchId` 없음. 서버 스위치가 꺼진 배포에서 구독이 없으면 항목이 없고, 구독이 있으면 `PAUSED`와 끄기만 있으며 끄기는 해지 요청을 보낸다. 사본에 `watchId`가 없으면 설정 읽기를 포함해 서버 알림 요청이 0건이다. 설정을 못 읽으면 있는 상태를 지우지 않는다. 고정 테스트: '사본에 watchId 가 없으면 config 도 부르지 않는다', 'config 를 못 읽으면 구독 기록을 바꾸지 않는다', 'config 꺼짐이고 구독이 있으면 PAUSED 이고 끄기만 있다', 화면 시험 둘. (Task 5, Task 7, Task 8)

## 파일 구조

```
src/guardian/
  pushRequests.js                 구독·해지·상태·함께 있음 요청 모양과 응답 읽기 (새, Task 1)
  link.js                         fragmentFromPasted (Task 6)
lib/store/
  keys.js                         RECORD.guardianPush, pendingServerDelete 주석 (Task 2)
  guardianPush.js                 레코드 정규화 (새, Task 2)
  guardianWatch.js                normalizePendingDelete 두 종류 (Task 2)
  store.js, index.js              읽기·쓰기·끄기·삭제 대기·내 정보 지우기·자동 삭제 (Task 2)
public/sw.js                      push, message(SAFEHOUR_SW_INFO), 판 올림, 주석 참조 (Task 3)
lib/notify/
  device.js                       watchNotificationTag, notificationTagOf, 같은 tag 건너뛰기 (Task 4)
  pushSupport.js                  지원 판별 (새·순수, Task 5)
  guardianPushPlan.js             다시 맞추기, 상태 조회 시각, 겹침 입력 (새·순수, Task 5)
  guardianPush.js                 실행기 (새, Task 5)
  useGuardianPush.js              화면 훅 (새, Task 5)
  client.js                       getGuardianPush (Task 5)
components/pwa/NotificationBanner.js   실행기 시작 (Task 5)
components/ClearSessionButton.js       브라우저 구독 지우기 (Task 5)
components/guardian/
  PasteLink.js                    붙여넣기 절 (새, Task 6)
  guardianPushView.js             항목 표시 규칙 (새·순수, Task 7)
  GuardianPushItemView.js         표시 부품, 저장소를 읽지 않음 (새, Task 7)
  GuardianPushItem.js             연결 부품 (새, Task 7)
  returnStatus.js                 confirmedFor (Task 7)
  GuardianCopyView.js             serverStatus 표시 (Task 7)
  GuardianOpen.js                 붙여넣기 절 (Task 6), 항목과 상태 (Task 7)
src/i18n/messages/notifications.js · guardian.js   문구 (Task 3, 6, 7)
app/styles/guardian.css           토큰만 (Task 6, 7)
e2e/helpers.js, e2e/guardian-push.spec.js           (Task 8)
```

---

### Task 1: 보호자 구독 요청 모양과 클라이언트·서버 이음매

**Files:**
- Create: `src/guardian/pushRequests.js`, `test/guardian-push-requests.test.js`
- Modify: `src/guardian/index.js`(다시 내보내기), `test/watch-client-seam.test.js`(보호자 경로 묶음 추가)

**Interfaces:**
- Consumes: `WATCH_ID_RE`, `WATCH_KIND`, `classifyWatchResponse`(`src/guardian/watchRequests.js`), `sendWatchRequest`(`src/guardian/watchSend.js`), `LANGS`(`src/i18n/index.js`), `isDateString`, `isClockTime`(`src/stay/time.js`)
- Produces:
  - `PUSH_PATHS = { subscribe: '/api/watch/subscribe', status: '/api/watch/status', mute: '/api/watch/mute' }`
  - `SUB_ID_RE = /^[A-Za-z0-9_-]{22}$/`, `MAX_ENDPOINT_CHARS = 2048`
  - `subscribeRequest({ watchId, subscription, lang }): { method: 'POST', path, body: { watchId, subscription: { endpoint, keys: { p256dh, auth } }, lang } }`. `subscription`은 `PushSubscription.toJSON()` 모양을 받는다.
  - `unsubscribeRequest({ watchId, subId }): { method: 'DELETE', path, body: { watchId, subId } }`
  - `statusRequest({ watchId, subId = null }): { method: 'POST', path, body: { watchId } 또는 { watchId, subId } }`
  - `muteRequest({ watchId, subId, on }): { method: 'POST', path, body: { watchId, subId, on } }`
  - `readSubscribeData(data): { subId } | null`, `readStatusData(data): { date, confirmed, muted, subscriptionActive } | null`, `readMuteData(data): { muted } | null`, `readConfigData(data): { enabled, vapidPublicKey, guardianLoginRequired } | null`
  - 모두 형식이 틀리면 `TypeError`를 던지고 메시지에는 함수 이름과 필드 이름만 담는다(값 없음, A-2와 같다).

정한 값:
- `endpoint`는 `https:`이고 1~2048자. `p256dh`는 채움 없는 base64url로 65바이트이고 첫 바이트 `0x04`, `auth`는 16바이트. 서버 `normalizeSubscribe`와 같은 규칙을 클라이언트에도 둔다(허용 목록 양쪽).
- `expirationTime`과 그 밖의 필드는 본문에 싣지 않는다.
- `readStatusData`는 `date`가 날짜 형식, `confirmed`가 `HH:MM` 문자열 배열(최대 10), `muted`·`subscriptionActive`가 불리언일 때만 값이다.

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/guardian-push-requests.test.js
test('subscribeRequest 는 toJSON 모양에서 endpoint 와 두 키만 싣고 expirationTime 을 버린다', () => {});
test('subscribeRequest 는 http endpoint, 2048자 초과, 65바이트가 아닌 p256dh, 16바이트가 아닌 auth, 모르는 lang 을 던지고 메시지에 값이 없다', () => {});
test('unsubscribeRequest 는 DELETE /api/watch/subscribe 이고 본문 키가 watchId, subId 둘뿐이다', () => {});
test('statusRequest 는 subId 가 없으면 본문에 subId 키가 없다', () => {});
test('muteRequest 의 on 은 불리언만 받는다', () => {});
test('readStatusData 는 날짜 형식이 틀리거나 confirmed 에 HH:MM 이 아닌 값이 있으면 null', () => {});
test('readSubscribeData 는 22자 base64url subId 만 받는다', () => {});
test('PUSH_PATHS 세 경로는 docs/contracts.md 와 같다', () => {});

// test/watch-client-seam.test.js (보호자 묶음, 진짜 요청 모양을 진짜 처리기에)
test('보호자 구독: 진짜 subscribeRequest 본문이 처리기를 통과해 { ok, subId } 이고 subId 가 SUB_ID_RE 에 맞는다', async () => {});
test('같은 기기 다시 구독은 새 subId 이고, 예전 subId 의 해지는 NOT_FOUND 다', async () => {});
test('상태 조회: 지금 subId 면 subscriptionActive 참, 다른 subId 면 거짓', async () => {});
test('함께 있음을 켠 뒤 상태 조회의 muted 가 참이다', async () => {});
test('서버 스위치가 꺼진 처리기에서도 해지는 OK 다', async () => {});
test('세션 없는 구독은 LOGIN_REQUIRED 다(guardianLoginRequired 기본값)', async () => {});
test('환자 다시 등록(같은 watchId, 새 토큰) 뒤에도 보호자 subscriptionActive 가 참이다', async () => {});
test('환자가 지켜보기를 끄면 보호자 상태 조회는 NOT_FOUND 다', async () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인.** `node --test test/guardian-push-requests.test.js test/watch-client-seam.test.js` 다음 `/opt/homebrew/opt/node@18/bin/node --test test/watch-client-seam.test.js`(멈추지 않는지), `npm run lint && npm test`
- [ ] **Step 3: 독립 검토.** 허용 목록이 서버와 같은지, 오류 메시지에 값이 없는지 본다.
- [ ] **Step 4: 커밋한다.**

```
feat(guardian): 보호자 구독·해지·상태·함께 있음 요청 모양과 이음매 시험

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 2: 기기 저장소 `guardianPush`와 서버 삭제 대기 두 종류

**Files:**
- Create: `lib/store/guardianPush.js`, `test/store-guardian-push.test.js`
- Modify: `lib/store/keys.js`, `lib/store/guardianWatch.js`(`normalizePendingDelete`), `lib/store/store.js`, `lib/store/index.js`
- Test: 기존 `test/store-guardian-watch.test.js`, `test/store.test.js`는 고치지 않고 통과해야 한다(A-2 대기 항목만 있는 저장소 호환).

**Interfaces:**
- Consumes: Task 1의 `unsubscribeRequest`, `SUB_ID_RE`
- Produces:
  - `RECORD.guardianPush = 'guardianPush'`(주제 목록에도 들어간다)
  - `normalizeGuardianPush(value): record | null`, `GUARDIAN_PUSH_MAX = 10`
  - 저장소: `readGuardianPush(): record | null`, `writeGuardianPush(record): { ok: true } | { ok: false, code }`, `updateGuardianPush(updater: (record | null) => record | null): { ok: true, record } | { ok: false, code }`, `retireGuardianPushSub(watchId): { ok: true } | { ok: false, code }`, `guardianPushElsewhere(): boolean`(지금 계정 말고 다른 계정 이름공간에 구독이 있는가, 값은 돌려주지 않는다)
  - `normalizePendingDelete`가 `{ watchId, subId }` 항목도 남긴다

정한 값:
- 쓰기 실패 코드는 저장소의 기존 `fail()` 약속(`READ_ONLY`, `INVALID`, `STORAGE_FAILED`)을 쓴다.
- `pendingKeyOf`는 종류를 포함한다(`w:<watchId>:<writeToken>`, `s:<watchId>:<subId>`).
- `deleteAllMyData`는 모든 계정의 `writeToken` 항목과 `subId` 항목을 모아 대기에 쓴다. 남기는 키 세 개는 그대로다.
- 구독은 사본의 수명을 따른다(13번, Task 2 검토로 고침): 앱 열기 때 모든 계정에서 로그인 없이, 사본 하나를 지울 때 그 계정에서, 살아 있는 사본에 없는 `watchId`의 구독을 대기로 옮긴다. 자기 체류의 자동 삭제와 `deleteStay`는 구독을 건드리지 않는다.

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/store-guardian-push.test.js
test('normalizeGuardianPush 는 틀린 항목을 버리고 같은 watchId 는 나중 것 하나, 10개 상한이다', () => {});
test('normalizeGuardianPush 는 endpoint 원문, p256dh, auth 같은 모르는 필드를 남기지 않는다', () => {});
test('writeGuardianPush 는 보기 전용에서 READ_ONLY 다', () => {});
test('retireGuardianPushSub 는 기록에서 빼고 { watchId, subId } 를 대기에 넣어 DELETE /api/watch/subscribe 를 보낸다', async () => {});
test('해지가 200·404·400 이면 대기에서 빠지고 연결 실패·429·503 이면 남는다', async () => {});
test('normalizePendingDelete 는 두 종류를 함께 두고 (종류, watchId) 로 겹침을 없애며 합쳐 10개다', () => {});
test('A-2 대기 항목만 있는 저장소는 그대로 읽히고 그대로 보낸다', async () => {});
test('deleteAllMyData 는 모든 계정의 구독을 대기로 옮기고 남는 키는 언어, 로그아웃 보류, 서버 삭제 대기 셋뿐이다', async () => {});
test('계정 자동 삭제는 그 계정의 구독을 대기로 옮긴다', () => {});
test('guardianPushElsewhere 는 다른 계정 이름공간의 구독만 본다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 독립 검토.** 지우기 경로(끄기, 내 정보 지우기, 자동 삭제)가 모두 대기를 거치는지, 레코드에 주소 원문이 남지 않는지 본다.
- [ ] **Step 4: 커밋한다.**

```
feat(store): 보호자 구독 기록 guardianPush 와 서버 삭제 대기의 구독 해지 항목

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 3: 서비스 워커의 `push` 처리와 준비 확인

**Files:**
- Modify: `public/sw.js`, `src/i18n/messages/notifications.js`
- Test: `test/pwa-sw.test.js`

**Interfaces:**
- Consumes: A-1 푸시 본문(공용 모양)
- Produces:
  - 워커 도우미(시험이 `vm`으로 직접 부른다): `pushTargetPath(data): '/today'|'/g'`(허용 목록 밖은 `/g`), `pushNotification(data): { title, options: { body, icon, data: { url }, tag?, renotify? } }`
  - `message` 처리: `SAFEHOUR_SW_INFO` 답(공용 모양)
  - `SW_VERSION = '2026-11-16.1'`
  - 문구 키 `notifications.serverPushFallback`

새 문구(`messages`, ja·zh는 검수 전 번역):

| 키 | ko | en |
| --- | --- | --- |
| `notifications.serverPushFallback` | SafeHour 알림이 왔어요. 앱을 열어 확인해 주세요. | You have a SafeHour alert. Open the app to check. |

정한 값:
- 워커의 대체 본문 상수는 `ko + '\n' + en`이고 시험이 위 키의 두 언어와 같은지 본다. 대체 제목은 `'SafeHour'`.
- `title` 1~80자, `body` 1~300자(워커 안 상수). 넘으면 대체 문구.
- `icon`은 기기 알림과 같은 `/icons/icon-192.png`.
- 머리 주석: 옛 참조 두 건을 바꾸고(23번), '하지 않는 일'에 예약 없음과 서버 푸시만 보인다는 줄, '이 파일을 고치면 판을 올린다'는 그대로.

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/pwa-sw.test.js (기존 가짜 서비스 워커 환경에 push·message 이벤트 발송을 더한다)
test('push: 올바른 본문이면 title·body 그대로, data.url 은 /g, tag 와 renotify 참, icon 이 있다', async () => {});
test('push: url 이 허용 목록 밖이면 /g 를 연다', async () => {});
test('push: tag 가 형식 밖이면 tag 와 renotify 를 싣지 않는다', async () => {});
test('push: 본문이 없거나 JSON 이 아니거나 title·body 가 비었거나 너무 길면 대체 문구로 하나를 낸다', async () => {});
test('push: event.waitUntil 이 showNotification 약속을 받는다(조용한 푸시 0)', async () => {});
test('push: console 을 부르지 않는다', async () => {});
test('대체 본문은 notifications.serverPushFallback 의 ko 줄과 en 줄이다', () => {});
test('message: SAFEHOUR_SW_INFO 에 포트로 { version, push: true } 를 답하고 다른 type 과 포트 없는 메시지는 무시한다', async () => {});
test('SW_VERSION 은 2026-11-16.1 이고 캐시 이름에 새 판이 붙으며 옛 판은 켜질 때 지운다', async () => {});
test('머리 주석에 spec 4.18, spec 4.13 이 없다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`.** 기존 누름·캐시 시험은 고치지 않고 통과해야 한다.
- [ ] **Step 3: 독립 검토.** 어떤 입력에도 알림이 하나 나는지, `data`에 `url` 말고 아무것도 없는지 본다.
- [ ] **Step 4: 커밋한다.**

```
feat(sw): 서버 푸시를 받아 잠금 화면 알림을 내고 준비 확인에 답함(판 2026-11-16.1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 4: 기기 알림과 서버 푸시가 알림 칸에서 한 줄이 되게

**Files:**
- Modify: `lib/notify/device.js`
- Test: `test/notify-device.test.js`, `test/notify-runtime.test.js`

**Interfaces:**
- Consumes: 없음(서버 `lib/server/watch/text.js`는 테스트에서만 불러 `tag`를 비교한다)
- Produces:
  - `watchNotificationTag(date, time): 'sh-watch-<date>-<HH:MM>'`, `notificationTagOf(item): string`
  - `deliverToDevice`가 서비스 워커 경로에서 같은 `tag` 알림이 떠 있으면 내지 않는다

정한 값:
- `notificationTagOf`의 날짜는 `kstClock(Date.parse(item.at)).date`다(`at`은 ISO 절대 시각). `COMPANION_RETURN_PASSED`만 바꾸고 다른 종류는 `item.id` 그대로다. `NOTIFY_ITEM_FIELDS`는 바꾸지 않는다.
- 예약(`planNotifications`)과 늦은 알림 창은 바꾸지 않는다(결정 15, 다르게 정한 것 17).
- `getNotifications`가 없거나 던지면 지금처럼 낸다.

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/notify-device.test.js
test('notificationTagOf: 보호자 마감 지남은 sh-watch-<날짜>-<HH:MM>, 23:55 마감은 그날 날짜, 다른 종류는 item.id', () => {});
test('watchNotificationTag 는 서버 pushPayload 의 tag 와 같다', () => {}); // lib/server/watch/text.js 를 불러 같은 날짜·시각으로 비교
test('같은 tag 알림이 떠 있으면 기기 알림을 내지 않는다(서비스 워커 경로)', async () => {});
test('getNotifications 가 던지면 지금처럼 낸다', async () => {});
// test/notify-runtime.test.js (시계는 고정 epoch, 시간대 무관)
test('서버 푸시를 누른 뒤 18:15에 앱을 열면 늦은 기기 알림을 낸다(결정 15)', () => {});
test('예약 결과는 guardianPush 기록과 무관하게 지금과 같다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인.** `node --test test/notify-*.test.js`, `TZ=America/New_York node --test test/notify-*.test.js`, `npm run lint && npm test`
- [ ] **Step 3: 독립 검토.** 기기 알림이 줄어드는 길이 같은 `tag`가 이미 떠 있을 때 하나뿐인지 본다.
- [ ] **Step 4: 커밋한다.**

```
feat(notify): 보호자 마감 지남 기기 알림의 tag 를 서버 푸시와 맞추고, 같은 tag 가 떠 있으면 다시 내지 않음(R4)

기기 알림 예약은 결정 15대로 그대로 둔다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 5: 보호자 구독 실행기

**Files:**
- Create: `lib/notify/pushSupport.js`, `lib/notify/guardianPush.js`, `lib/notify/useGuardianPush.js`, `test/notify-push-support.test.js`, `test/notify-guardian-push-plan.test.js`, `test/notify-guardian-push.test.js`
- Create: `lib/notify/guardianPushPlan.js`. Modify: `lib/notify/client.js`, `lib/notify/index.js`, `components/pwa/NotificationBanner.js`, `components/ClearSessionButton.js`

**Interfaces:**
- Consumes: Task 1 요청 모양과 `readConfigData`, `configRequest`(A-2), `sendWatchRequest`. Task 2 저장소 함수. Task 3 워커 메시지. `turnOnDeviceNotifications`(`lib/notify/permission.js`). `DEFAULTS.notifications.serverPushGraceMin`.
- Produces:
  - `PUSH_SUPPORT`, `pushSupport({ hasServiceWorker, hasPushManager, hasNotification, permission, standaloneKnown, installed }): PUSH_SUPPORT 값`, `readPushSupport(win, { installed }): PUSH_SUPPORT 값`(`installed`는 화면이 `components/pwa/installState.js readInstalled`로 넣는다)
  - `planReconcile({ record, liveWatchIds, mainOn, permission, browser, configKey, lang }): { retire: string[], repost: string[], renewNeeded: boolean }`(`browser`는 `{ endpointHash } | null`)
  - `statusTimes({ deadlines, date, nowMs, graceMin }): number[]`
  - `PUSH_RESULT`, `createGuardianPush({ store, fetchImpl, now, timers, win, nav, NotificationImpl, subtle }): { start, getState(watchId), subscribe(listener), turnOn(watchId), turnOff(watchId), renew(), takeOver(watchId), mute(watchId, on), refreshStatus(watchId, { force }), reconcile(), forgetBrowser({ timeoutMs }) }`
  - `getGuardianPush()`(서버 렌더링 중 `null`), `useGuardianPush(watchId, { poll = false }): { state, turnOn, turnOff, renew, takeOver, mute }`

정한 값:
- `turnOn`은 첫 `await` 전에 권한 요청을 시작한다(`Notification.permission`이 `default`면 `turnOnDeviceNotifications`를 곧바로 부른다). 그다음 준비 확인(미리 확인한 값이 참이면 건너뜀), 브라우저 구독 고르기, `POST`, 기록 순서다.
- 브라우저 구독 고르기: `pushManager.getSubscription()`이 있고 (a) 이 계정 구독 기록 가운데 같은 `endpointHash`이면서 `vapidKey`가 설정의 키와 같은 것이 있거나 (b) `guardianPushElsewhere()`가 참이면 그 구독을 다시 쓴다. 있지만 둘 다 아니면 `unsubscribe()` 뒤 새로 구독한다(키가 다른 구독 위에 `subscribe`를 부르면 브라우저가 던진다). 없으면 `subscribe({ userVisibleOnly: true, applicationServerKey })`.
- `turnOn`, `turnOff`, `renew`, `takeOver`, `reconcile`은 실행기 안의 줄 하나를 함께 쓴다(겹치지 않는다).
- `endpointHash`는 `subtle.digest('SHA-256', endpoint 바이트)`의 채움 없는 base64url이다.
- 결과 반영: `OK`면 `subs`에 넣고 `gone`에서 뺀다. `NOT_FOUND`면 `gone`에 넣는다. `LOGIN_REQUIRED`, `RATE_LIMITED`, `OFF`, `UNAVAILABLE`, `NETWORK`는 기록을 바꾸지 않고 결과만 둔다. `CLIENT_INVALID`나 구독 호출 예외는 `FAILED`.
- `turnOff`는 `retireGuardianPushSub` 뒤 `retryPendingServerDelete()`를 기다려 대기에 남았는지로 `OFF_DONE`·`OFF_PENDING`을 고른다. 이 기기 모든 계정에 구독이 없으면(`guardianPushElsewhere()` 거짓, 지금 기록도 빈 목록) 브라우저 `unsubscribe()`.
- `renew`는 옛 브라우저 구독 `unsubscribe()`, 새 `subscribe`, 이 계정의 모든 구독 다시 `POST` 순서다. 사용자 동작 안에서만 부른다.
- `takeOver`는 `turnOn`과 같고 권한 요청이 없다(이미 `granted`).
- 다시 맞추기와 상태 조회는 쓰기 가능할 때만, 한 번에 하나(겹쳐 부르면 같은 약속). 사본에 `watchId`가 없으면 설정도 읽지 않는다. 설정을 못 읽으면 기록을 바꾸지 않는다.
- 상태 조회 결과: `subscriptionActive` 거짓이면 `moved`(저절로 구독하지 않음). `NOT_FOUND`면 `gone`에 넣고 구독 기록에서 빼며 해지는 보내지 않는다. `LOGIN_REQUIRED`면 아무것도 바꾸지 않는다.
- `start`는 여러 번 불러도 한 번이다. `visibilitychange`, `online`, 저장소 주제를 잇는다. 타이머는 주입한 `timers`로만 건다.
- `NotificationBanner`가 마운트될 때 `getGuardianPush()?.start()`. `ClearSessionButton`은 `deleteAllMyData()` 전에 `await getGuardianPush()?.forgetBrowser({ timeoutMs: FORGET_TIMEOUT_MS })`.
- `console`을 쓰지 않는다.

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/notify-push-support.test.js
test('아이폰 Safari 탭(standalone 거짓, PushManager 없음)은 IOS_NEEDS_INSTALL', () => {});
test('홈 화면 앱인데 PushManager 가 없으면(iOS 16.3) IOS_TOO_OLD', () => {});
test('macOS Safari 처럼 standalone 속성이 있어도 API 가 모두 있으면 READY 다', () => {});
test('standalone 속성도 PushManager 도 없으면(인앱 브라우저) UNSUPPORTED', () => {});
test('권한이 denied 면 설치 여부와 무관하게 DENIED', () => {});
// test/notify-guardian-push-plan.test.js
test('endpoint 해시가 다르면 repost, VAPID 키가 다르면 renewNeeded 이고 repost 없음', () => {});
test('구독 기록이 있는데 브라우저 구독이 없으면 renewNeeded', () => {});
test('살아 있는 사본에 없는 watchId 는 retire', () => {});
test('기기 알림 스위치가 꺼졌거나 권한이 granted 가 아니면 전부 retire', () => {});
test('언어가 다르면 repost', () => {});
test('statusTimes 는 남은 마감마다 60초 전과 마감 + 11분, 지난 시각은 뺀다', () => {});
// test/notify-guardian-push.test.js (가짜 navigator·pushManager·Notification·fetch·timers·subtle)
test('turnOn: 권한 요청이 첫 await 전에 시작되고 subscribe({ userVisibleOnly: true, applicationServerKey }) 다음 POST 다', async () => {});
test('준비 확인 답이 없으면 update 뒤 다시 묻고 그래도 없으면 SW_NOT_READY 이며 subscribe 를 부르지 않는다', async () => {});
test('기록에 없는 키의 브라우저 구독이 남아 있으면 unsubscribe 뒤 새로 구독하고, 다른 계정이 쓰는 구독은 다시 쓴다', async () => {});
test('turnOn 결과: 401, 429, 503 OFF, 404(gone), 네트워크, subscribe 예외(FAILED)마다 기록 변화가 정해진 대로다', async () => {});
test('POST 가 실패하면 방금 만든 브라우저 구독을 다른 구독이 없을 때만 unsubscribe 한다', async () => {});
test('turnOff: 대기에 남으면 OFF_PENDING, 마지막 구독이면 브라우저 unsubscribe, 다른 계정에 구독이 있으면 하지 않는다', async () => {});
test('renew 는 unsubscribe 를 subscribe 보다 먼저 부르고 모든 구독을 다시 POST 한다', async () => {});
test('VAPID 키가 다르면 subscribe 를 부르지 않고 renewNeeded 다', async () => {});
test('endpoint 해시가 다르면 같은 브라우저 구독으로 다시 POST 하고 한 실행에 한 번만 시도한다', async () => {});
test('사본에 watchId 가 없으면 config 도 부르지 않는다', async () => {});
test('config 를 못 읽으면 구독 기록을 바꾸지 않는다', async () => {});
test('config 꺼짐이면 구독·상태·함께 있음 요청이 0건이다', async () => {});
test('상태 조회: subscriptionActive 거짓이면 moved 이고 저절로 구독하지 않는다', async () => {});
test('상태 조회 404 면 gone 에 넣고 구독 기록에서 빼며 해지 요청은 보내지 않는다', async () => {});
test('보기 전용이면 다시 맞추기와 상태 조회 요청이 0건이다', async () => {});
test('상태 조회는 앞 조회와 2분 미만이면 건너뛰고 force 면 보낸다', async () => {});
test('마감 60초 전과 마감 + 11분에 상태 조회 타이머가 걸린다', async () => {});
test('reconcile 을 겹쳐 불러도 요청은 한 차례다', async () => {});
test('forgetBrowser 는 3초 한도 안에서 끝나고 실패해도 던지지 않는다', async () => {});
test('어떤 흐름에서도 console 을 부르지 않고 요청 본문은 pushRequests 허용 목록 그대로다', async () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인.** `node --test test/notify-*.test.js`, `TZ=America/New_York node --test test/notify-*.test.js`, `/opt/homebrew/opt/node@18/bin/node --test test/notify-guardian-push.test.js`, `npm run lint && npm test`
- [ ] **Step 3: 독립 검토.** 저절로 구독하는 길이 없는지(VAPID 교체, `MOVED`), 로그·URL에 식별 값이 없는지, 끄기가 늘 대기를 거치는지 본다.
- [ ] **Step 4: 커밋한다.**

```
feat(notify): 보호자 구독 실행기(지원 판별, 준비 확인, 켜기·끄기, 다시 맞추기, 상태 조회, 함께 있음)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 6: 받은 링크 붙여넣기

**Files:**
- Create: `components/guardian/PasteLink.js`, `test/guardian-paste.test.js`
- Modify: `src/guardian/link.js`, `components/guardian/GuardianOpen.js`, `src/i18n/messages/guardian.js`, `app/styles/guardian.css`

**Interfaces:**
- Consumes: `parseGuardianLink`, `isGuardianFragment`(`src/guardian/link.js`·`encoding.js`), `holdPendingGuardianLink`(저장소), `notifyIncomingLink`(`components/guardian/hooks.js`)
- Produces: `fragmentFromPasted(text): string | null`, `PasteLink({ defaultOpen })`

정한 값:
- `fragmentFromPasted` 순서: 전체 글을 `parseGuardianLink`로, 안 되면 글 속 첫 `https?://\S+` 토큰을 `parseGuardianLink`로, 안 되면 앞뒤 공백을 뺀 글이 암호문 형식이면 그대로.
- 절은 `<details>`(사본이 없으면 `open`). 입력은 `<textarea>`(4줄), 라벨 연결, `autocomplete="off"`, `spellCheck={false}`. 열기 버튼 44px.
- 보관 실패는 기존 `guardian.holdFailed`를 쓴다.

새 문구(`messages`):

| 키 | ko | en |
| --- | --- | --- |
| `guardian.pasteTitle` | 받은 링크 붙여넣기 | Paste a link you received |
| `guardian.pasteLabel` | 메신저로 받은 보호자 링크 | Guardian link from your messenger |
| `guardian.pasteHelp` | 링크 전체를 붙여 넣어 주세요. 링크는 서버로 보내지 않아요. | Paste the whole link. The link is not sent to the server. |
| `guardian.pasteOpen` | 열기 | Open |
| `guardian.pasteInvalid` | SafeHour 보호자 링크가 아니에요. 메신저에서 받은 링크 전체를 다시 붙여 넣어 주세요. | This isn't a SafeHour guardian link. Paste the whole link from your messenger again. |

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/guardian-paste.test.js
test('링크 전체, 앞뒤 공백, 메신저 문장 속 링크, #암호문, # 없는 암호문을 받는다', () => {});
test('다른 경로(/x#...), 쿼리에 암호문, 형식이 틀린 암호문, 빈 글은 null', () => {});
test('글 속 링크가 여럿이면 첫 http(s) 토큰만 본다', () => {});
test('새 문구 다섯 키는 네 언어가 있고 어느 언어에도 안전합니다가 없다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 독립 검토.** 붙여 넣은 글이 요청·주소·로그에 닿는 길이 없는지 본다.
- [ ] **Step 4: 커밋한다.**

```
feat(guardian): 받은 일정 화면에 받은 링크 붙여넣기(홈 화면 앱에서 사본 다시 열기)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 7: `/g`의 '앱이 닫혀 있어도 받기' 항목, 복귀 확인 표시, 오늘 함께 있음

**Files:**
- Create: `components/guardian/guardianPushView.js`, `components/guardian/GuardianPushItemView.js`, `components/guardian/GuardianPushItem.js`, `test/guardian-push-view.test.js`
- Modify: `components/guardian/returnStatus.js`, `components/guardian/GuardianCopyView.js`, `components/guardian/GuardianOpen.js`, `src/i18n/messages/guardian.js`, `app/styles/guardian.css`
- Test: `test/guardian-copy-view.test.js`(줄 추가)

**Interfaces:**
- Consumes: Task 5 `useGuardianPush`, `PUSH_SUPPORT`, `PUSH_RESULT`. `readInstalled`(`components/pwa/installState.js`). `usePrefs`, `useStoreStatus`.
- Produces:
  - `PUSH_ITEM_STATE`, `guardianPushViewModel({ state, watchId, mainOn, writable }): { itemState, switchOn, switchDisabled, lines: string[], safetyLines: string[], actions: Array<'RELOAD'|'RENEW'|'TAKE_OVER'|'LOGIN'>, showMute: boolean }`
  - `confirmedFor(row, serverStatus): boolean`(`returnStatus.js`)
  - `GuardianCopyView`의 새 선택 prop `serverStatus = null`(`{ date, confirmed, atMs }`). 없으면 지금과 같다(디자인 보드 그대로).
  - `GuardianPushItem({ watchId })`. `GuardianOpen`은 `alerts` 자리에 `AlertsToggle`과 `GuardianPushItem`을 함께 넣고, 보이는 사본의 상태를 `serverStatus`로 넘긴다(`useGuardianPush(watchId, { poll: true })`).

정한 값:
- 상태별 줄과 버튼은 아래 표 그대로다. 늘 보이는 줄(`HIDDEN` 말고 모두): 동의 문장(`guardian.pushConsentStored`), `conditions.consentLegalReview`, `guardian.pushNoGuarantee`, `guardian.pushLocation`.
- 스위치는 기기 알림 스위치와 같은 부품(`role="switch"`), 라벨은 `guardian.pushTitle`. `WORKING`이면 잠그고 `guardian.pushWorking`.
- 복귀 확인 꼬리표는 아이콘과 글자를 함께 쓰고, 색은 토큰만(지남 꼬리표와 다른 토큰, 둘 다 AA).
- 함께 있음 스위치 라벨 `guardian.muteTitle`, 아래 `guardian.muteHelp`, `guardian.muteMidnight`.

| 상태 | 줄 | 버튼·스위치 |
| --- | --- | --- |
| `IOS_NEEDS_INSTALL` | `pushIosTitle`, 다섯 단계 목록, `pushIosNote` | 없음 |
| `IOS_TOO_OLD` | `pushIosOld` | 없음 |
| `UNSUPPORTED` | `pushUnsupported` | 없음 |
| `DENIED` | `pushDenied` | 없음 |
| `SW_NOT_READY` | `pushSwNotReady` | 새로 고침 |
| `AVAILABLE` | `pushIntro` | 스위치(꺼짐) |
| `WORKING` | `pushWorking` | 스위치(잠김) |
| `ON` | `pushOn` | 스위치(켜짐), 함께 있음 |
| `PAUSED` | `pushPaused` | 스위치(켜짐, 끄기만) |
| `RENEW_NEEDED` | `pushRenew` | 다시 켜기, 스위치(끄기) |
| `MOVED` | `pushMoved`, `pushMovedNote` | 이 휴대폰에서 다시 받기, 스위치(끄기) |
| `GONE` | `pushGone`, `pushOpenAppAlerts`(기기 알림 스위치가 꺼져 있으면 뒤 줄은 뺀다) | 없음 |

새 문구. `safety` 블록: `guardian.pushNoGuarantee`, `guardian.pushLocation`, `guardian.confirmedHelp`, `guardian.pushOffPending`, `guardian.pushOffUnsent`. 나머지는 `messages`. 영어 문장은 환자를 "the patient"로, 일본어는 「患者さん」으로 쓴다(검토 반영). 아이폰 4단계의 '받은 일정 보기'는 `today.receivedAction`의 각 언어 문구와 같게 쓴다.

| 키 | ko | en |
| --- | --- | --- |
| `guardian.pushTitle` | 앱이 닫혀 있어도 받기 | Get alerts even when the app is closed |
| `guardian.pushIntro` | 마감이 지나도 복귀 확인이 없으면 SafeHour 서버가 이 휴대폰에 알림을 보내요. | If there's no confirmation that the patient is back after a return time passes, the SafeHour server sends an alert to this phone. |
| `guardian.pushConsentStored` | 이 휴대폰의 알림 주소를 SafeHour 서버에 보관합니다. 환자의 출국 7일 뒤, 또는 스위치를 끄면 지워집니다. | We keep this phone's alert address on the SafeHour server. It is deleted 7 days after the patient leaves Korea, or when you turn this off. |
| `guardian.pushNoGuarantee` | 알림은 늦거나 오지 않을 수 있습니다. 알림만 믿지 말고 직접 연락해 주세요. | Alerts may be late or may not arrive. Do not rely on alerts alone; contact the patient directly. |
| `guardian.pushLocation` | 앱은 위치를 모릅니다. 환자가 누른 확인만 전달합니다. | The app does not know anyone's location. It only passes on the confirmation the patient taps. |
| `guardian.pushWorking` | 켜는 중이에요 | Turning on |
| `guardian.pushOn` | 이 휴대폰에서 앱이 닫혀 있어도 알림을 받아요. | This phone gets alerts even when the app is closed. |
| `guardian.pushOffDone` | 껐어요. 서버에서 이 휴대폰의 알림 주소를 지웠어요. | Turned off. We deleted this phone's alert address from the server. |
| `guardian.pushOffPending` | 이 휴대폰에서는 껐어요. 연결되면 서버에서도 지워요. 그 전까지 알림이 올 수 있어요. | Turned off on this phone. We'll delete it from the server once you're online. Until then, alerts may still arrive. |
| `guardian.pushOffUnsent` | 이 휴대폰의 서버 알림이 꺼졌지만 서버에서 지우지 못했어요. 환자의 일정이 끝날 때까지 서버가 알림을 보낼 수 있어요. | Server alerts are off on this phone, but this phone’s alert address could not be deleted from the server. The server may still send alerts until the patient’s schedule ends. |
| `guardian.pushPaused` | 서버 알림이 지금 쉬고 있어요. 앱이 열려 있을 때 알림은 그대로 받아요. | Server alerts are paused right now. You still get alerts while the app is open. |
| `guardian.pushUnsupported` | 이 브라우저에서는 앱이 닫혀 있을 때 알림을 받을 수 없어요. iPhone이라면 Safari에서 열어 홈 화면에 추가해 주세요. | This browser can't get alerts while the app is closed. On iPhone, open this page in Safari and add it to your Home Screen. |
| `guardian.pushIosTitle` | iPhone에서 받으려면 | To get alerts on iPhone |
| `guardian.pushIosStep1` | Safari에서 공유 버튼을 누르세요. | In Safari, tap the Share button. |
| `guardian.pushIosStep2` | '홈 화면에 추가'를 누르세요. | Tap “Add to Home Screen”. |
| `guardian.pushIosStep3` | 홈 화면의 SafeHour를 열고 로그인하세요. | Open SafeHour from your Home Screen and log in. |
| `guardian.pushIosStep4` | '받은 일정 보기'에서 메신저로 받은 링크를 붙여 넣고 PIN을 넣으세요. | In “View received schedule”, paste the link from your messenger and enter the PIN. |
| `guardian.pushIosStep5` | '앱이 닫혀 있어도 받기'를 켜세요. | Turn on “Get alerts even when the app is closed”. |
| `guardian.pushIosNote` | 홈 화면 앱은 Safari와 저장 공간이 따로라서 받은 일정을 한 번 더 열어야 해요. | The Home Screen app keeps its data separately from Safari, so you need to open the received schedule once more. |
| `guardian.pushIosOld` | iOS 16.4 이상에서만 받을 수 있어요. 설정에서 iOS를 업데이트한 뒤 다시 열어 주세요. | This works on iOS 16.4 or later. Update iOS in Settings, then open the app again. |
| `guardian.pushDenied` | 이 브라우저에서 알림이 차단돼 있어요. 브라우저 설정에서 SafeHour 알림을 허용한 뒤 다시 켜 주세요. | Notifications are blocked in this browser. Allow notifications for SafeHour in your browser settings, then turn this on again. |
| `guardian.pushSwNotReady` | 앱을 새로 고친 뒤 다시 켜 주세요. | Reload the app, then turn this on again. |
| `guardian.pushReload` | 새로 고침 | Reload |
| `guardian.pushRenew` | 알림 설정이 바뀌어 다시 켜야 해요. 다시 켜기 전까지 앱이 닫혀 있을 때 알림이 오지 않아요. | Alert settings changed, so you need to turn this on again. Until you do, alerts won't arrive while the app is closed. |
| `guardian.pushRenewButton` | 다시 켜기 | Turn on again |
| `guardian.pushMoved` | 다른 기기가 알림을 가져갔거나 이 휴대폰의 알림 주소가 만료됐어요. | Another device took over these alerts, or this phone's alert address expired. |
| `guardian.pushMovedNote` | 다시 받으면 지금 받는 기기에는 알림이 더 가지 않아요. | If you do, the device that gets them now will stop getting them. |
| `guardian.pushMovedButton` | 이 휴대폰에서 다시 받기 | Get them on this phone again |
| `guardian.pushGone` | 환자가 서버 알림을 껐거나 기간이 끝났어요. | The patient turned off server alerts, or the period ended. |
| `guardian.pushOpenAppAlerts` | 앱이 열려 있을 때 알림은 그대로 받아요. | You still get alerts while the app is open. |
| `guardian.pushLogin` | 로그인해야 켤 수 있어요. | Log in to turn this on. |
| `guardian.pushLimit` | 잠시 뒤 다시 시도해 주세요. | Please try again in a little while. |
| `guardian.pushUnavailable` | 지금 켜지 못했어요. 잠시 뒤 다시 시도해 주세요. | Couldn't turn this on right now. Please try again later. |
| `guardian.pushNetwork` | 연결되지 않아 켜지 못했어요. 연결된 뒤 다시 시도해 주세요. | You're offline, so this didn't turn on. Try again once you're connected. |
| `guardian.pushFailed` | 이 휴대폰에서 알림 주소를 만들지 못했어요. 앱을 새로 고친 뒤 다시 시도해 주세요. | This phone couldn't create an alert address. Reload the app and try again. |
| `guardian.pushPermissionLost` | 알림 권한이 꺼져 서버 알림도 껐어요. | Notification permission was turned off, so we turned off server alerts too. |
| `guardian.muteTitle` | 오늘 함께 있음 | Together today |
| `guardian.muteHelp` | 켜면 오늘(한국 시간) 서버 알림을 보내지 않아요. 자정이 지나면 저절로 풀려요. 앱이 열려 있을 때 마감 시각 알림은 그대로 와요. | When on, the server sends no alerts today (Korea time). It turns off automatically at midnight. Alerts at the return time still come while the app is open. |
| `guardian.muteMidnight` | 자정 직전 마감의 알림은 자정 뒤에 올 수 있어요. | An alert for a return time just before midnight may still arrive after midnight. |
| `guardian.muteOn` | 오늘은 서버 알림을 보내지 않아요. | No server alerts today. |
| `guardian.muteOff` | 오늘 서버 알림을 다시 받아요. | Server alerts are back on for today. |
| `guardian.confirmedTag` | 복귀 확인 | Tapped “I’m back” |
| `guardian.confirmedHelp` | 환자가 '돌아왔어요'를 눌렀어요. 앱은 위치를 모르기 때문에 실제로 돌아왔는지는 알 수 없어요. 걱정되면 환자에게 직접 연락해 주세요. | The patient tapped “I’m back”. The app does not know their location, so it cannot tell whether they are actually back. If you are worried, contact the patient directly. |
| `guardian.statusAsOf` | {time}에 서버에서 확인한 내용이에요. | As checked with the server at {time}. |

- [ ] **Step 1: 테스트를 쓴다**

```js
// test/guardian-push-view.test.js
test('사본에 watchId 가 없으면 HIDDEN 이다', () => {});
test('config 꺼짐이고 구독이 없으면 HIDDEN, 구독이 있으면 PAUSED 이고 끄기만 있다', () => {});
test('기기 알림 스위치가 꺼져 있어도 READY 면 AVAILABLE 이다(켜면 둘 다 켠다)', () => {});
test('아이폰 두 상태와 UNSUPPORTED, DENIED 는 켜기 스위치가 없다', () => {});
test('표의 상태마다 줄 키와 버튼이 정해진 대로다', () => {});
test('HIDDEN 말고는 동의 문장, 법률 검토 줄, 도착 비보장, 위치 줄이 늘 있다', () => {});
test('함께 있음은 ON 이고 쓰기 가능할 때만 보인다', () => {});
test('confirmedFor 는 조회 날짜가 줄 날짜와 다르면 거짓이다', () => {});
test('새 문구는 네 언어가 있고 safety 키 넷은 safety 블록에 있으며 어느 언어에도 안전합니다가 없다', () => {});
// test/guardian-copy-view.test.js
test('serverStatus 에 확인된 마감은 복귀 확인 꼬리표와 안내가 있고 마감 지남 꼬리표가 없으며 긴급 절은 그대로다', () => {});
test('serverStatus 가 없으면 지금과 같은 마크업이다', () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 독립 검토.** 표시 부품이 저장소를 읽지 않는지, 색만으로 뜻을 전하는 곳이 없는지, '복귀 확인'이 판정처럼 읽히는 문장이 없는지 본다.
- [ ] **Step 4: 커밋한다.**

```
feat(guardian): 받은 일정 화면의 앱이 닫혀 있어도 받기, 복귀 확인 표시, 오늘 함께 있음, 아이폰 안내

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 8: 화면 테스트

**Files:**
- Modify: `e2e/helpers.js`
- Create: `e2e/guardian-push.spec.js`

**Interfaces:**
- Consumes: Task 5~7의 화면, 기존 도우미 `loginDemo`, `startTrip`, `createGuardianLink`, `importGuardianCopy`, `readRecord`, `setClock`, `stubServerPush`, `WATCH_FIXTURE`, `expectNoAxeViolations`, `expectNoHorizontalScroll`, `expectTouchTargets`, `evidenceShot`
- Produces (`e2e/helpers.js`):
  - `stubServerPush`에 보호자 경로 선택지를 더한다: `subscribe = 200`, `unsubscribe = 200`, `status = { status: 200, date, confirmed: [], muted: false, subscriptionActive: true }`, `mute = 200`, `vapidPublicKey`(바꿔 끼울 수 있게). 응답 모양은 `docs/contracts.md` 그대로(`{ ok: true, subId }`, `{ ok: true }`, `{ ok: true, date, confirmed, muted, subscriptionActive }`, `{ ok: true, muted }`, 실패는 `{ ok: false, errorCode }`).
  - `stubPushApi(page, { permission = 'granted', subscribeThrows = false, endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-1', ios = null })`: 초기화 스크립트로 `PushManager.prototype.subscribe`·`getSubscription`과 구독 객체(`toJSON`, `unsubscribe`)를 바꾸고 호출을 `window.__pushCalls`에 적는다. `ios: 'tab'`이면 `window.PushManager`를 지우고 `navigator.standalone = false`, `ios: 'old'`면 지우고 `true`. 권한은 `context.grantPermissions(['notifications'])` 또는 `Notification.requestPermission` 바꿔 끼우기.
  - `openCopyWithWatch(page)`: 서버 알림을 켠 링크를 만들고(A-2 동의 항목) 사본을 연다.
  - `seedGuardianPush(page, record)`

정한 값:
- 서비스 워커는 빌드한 진짜 `sw.js`다. `ServiceWorker.deliverPushMessage`(CDP)로 푸시 하나를 보내 `registration.getNotifications()`의 제목·본문·`tag`를 본다. 두 번 시도해도 워커에 닿지 않으면 그 시험 하나만 빼고 이유를 engineering-notes에 적는다(워커 처리는 Task 3 `vm` 시험이 고정한다). 다른 시험은 빼지 않는다.
- 모든 시험에서 화면에 '안전합니다'가 없고, 요청 URL에 `watchId`·`subId`가 없다.

- [ ] **Step 1: 시험을 쓴다**

```js
test('사본에 watchId 가 없으면 항목이 없고 /api/push/config 와 /api/watch* 요청이 0건이다', async ({ page }) => {});
test('서버 스위치 꺼짐이고 구독이 없으면 항목이 없고 구독·상태·함께 있음 요청이 0건이다', async ({ page }) => {});
test('켜기: 본문이 { watchId, subscription: { endpoint, keys }, lang } 그대로(expirationTime 없음), 기록 subs 1건, 받아요 줄과 도착 비보장 줄', async ({ page }) => {});
test('기기 알림 스위치가 꺼진 채 켜기를 누르면 두 스위치가 함께 켜진다', async ({ page }) => {});
test('끄기는 DELETE { watchId, subId } 이고, 오프라인이면 대기에 남았다가 연결되면 보낸다', async ({ page, context }) => {});
test('기기 알림 스위치를 끄면 서버 구독도 해지한다', async ({ page }) => {});
test('상태 조회에 확인된 마감은 복귀 확인 꼬리표와 확인 시각이 있고 마감 지남이 없으며 긴급 절은 그대로다', async ({ page }) => {});
test('subscriptionActive 거짓이면 다시 받기 버튼이 있고 누르면 구독 요청이 다시 간다', async ({ page }) => {});
test('상태 조회 404 면 기간 끝 줄이 보이고 켜기가 없다', async ({ page }) => {});
test('설정의 VAPID 키가 바뀌면 다시 켜기가 보이고 누르면 unsubscribe, subscribe, POST 순서다', async ({ page }) => {});
test('서버 스위치 꺼짐에 구독이 있으면 쉬고 있어요 줄과 끄기만 있고 끄면 해지가 간다', async ({ page }) => {});
test('아이폰 Safari 탭 흉내: 홈 화면 추가 다섯 단계가 보이고 켜기 스위치가 없다', async ({ page }) => {});
test('아이폰 옛 버전 흉내: iOS 16.4 안내가 보인다', async ({ page }) => {});
test('오늘 함께 있음: POST mute { on: true } 다음 줄이 바뀌고 자정 안내가 있다', async ({ page }) => {});
test('붙여넣기: 사본 없는 /g 에서 링크 전체를 붙여 넣으면 PIN 흐름으로 열리고 주소에 # 이 없으며 붙여 넣은 글이 어떤 요청에도 없다', async ({ page }) => {});
test('내 정보 지우기: 해지 요청이 가고 브라우저 unsubscribe 가 불리며 남는 키는 셋이다', async ({ page }) => {});
test('빌드한 서비스 워커가 SAFEHOUR_SW_INFO 에 push: true 로 답한다', async ({ page }) => {});
test('CDP 로 보낸 푸시가 tag 와 함께 알림 하나로 뜬다', async ({ page }) => {});
test('새 부품: 접근성 위반 0, 320px 가로 스크롤 없음, 누르는 곳 44px 이상', async ({ page }) => {});
```

- [ ] **Step 2: 빌드한 뒤 이 파일만 돌린다.** `npm run build && E2E_PORT=<빈 포트> npm run e2e -- e2e/guardian-push.spec.js` (빈 포트를 매번 찾는다. 다른 세션의 서버를 끄지 않는다)
- [ ] **Step 3: `npm run lint && npm test`**
- [ ] **Step 4: 독립 검토.** 바꿔 끼운 Push API가 실제 코드 경로를 우회하지 않는지(실행기는 진짜 `pushManager` 호출 자리를 탄다) 본다.
- [ ] **Step 5: 커밋한다.**

```
test(e2e): 서버 알림 보호자 쪽(켜기·끄기, 스위치 꺼짐, 상태, 키 교체, 아이폰 안내, 붙여넣기, 서비스 워커)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 9: 문서

**Files:**
- Modify: `docs/security.md`, `docs/contracts.md`, `docs/business-rules.md`, `docs/architecture.md`, `docs/engineering-notes.md`, `docs/tracking/status.md`, `lib/store/AGENTS.md`, `lib/notify/AGENTS.md`, `src/guardian/AGENTS.md`, `components/AGENTS.md`, `docs/superpowers/specs/2026-11-09-server-push-design.md`

내용:
- `docs/security.md`: '기기 저장소와 계정 이름공간'에 `guardianPush`(담는 것: `watchId`, `subId`, 언어, 주소 해시, VAPID 공개키, 오늘 상태. 주소 원문과 키는 없음). 서버 삭제 대기의 두 종류. 남는 키 세 개 문장은 그대로 맞는지 확인. '보호자 링크'에 붙여넣기(서버로 보내지 않음, 탭 저장소 1시간 보관). 기록 범위에 "보호자 기기는 `watchId`·`subId`·주소를 로그와 URL에 싣지 않는다".
- `docs/contracts.md` '서버 알림': 'A-3 클라이언트가 지키는 것' 절(설정 읽기 시점, 준비 확인, 다시 맞추기 계기와 규칙, 저절로 구독하지 않는 두 경우, 404 처리, 해지 대기, 상태 조회 계기와 간격, 서비스 워커 메시지 계약).
- `docs/business-rules.md` '보호자': 항목이 보이는 조건, 두 스위치의 관계, 복귀 확인 표시(판정 아님), 오늘 함께 있음은 서버 푸시만, 기기 알림은 결정 15대로 그대로이고 같은 `tag`로 한 줄(R4).
- `docs/architecture.md`: 보호자 쪽 부품(`guardianPush` 실행기, 서비스 워커 `push`)과 경계를 넘는 값(`watchId`, `subId`, 구독 주소와 키, 언어만).
- `docs/engineering-notes.md`: '알고 남기는 틈' 전부를 증상, 원인, 대응 형식으로. `renotify`는 `tag`가 있을 때만, Safari 구독은 사용자 동작 가까이, 옛 워커 조용한 푸시, 다시 켜기는 `unsubscribe` 먼저. A-1 항목의 "A-3에서 정한다" 두 곳(00:01 함께 있음, `subscriptionActive`)을 정한 내용으로 바꾼다. CDP 시험을 뺐다면 그 이유.
- `docs/tracking/status.md`: 만든 것(A-3). 남은 것(환자 기기 푸시, A-4). 진행을 막는 것에 "아이폰 홈 화면 앱의 로그인 왕복 확인, 돌아오지 않으면 로그인 없는 사본 보관(질문 22 후속)"과 "보호자 동의 문구 법무 확인"을 더하고, 9번(sw.js 주석 참조)을 지운다. 스위치 전 실기기 확인에 "아이폰 푸시 수신, 잠금 화면 문구, 알림 누름 화면"을 더한다.
- `docs/tracking/findings.md`: sw.js 주석 참조 항목을 닫는다.
- `lib/notify/AGENTS.md`: '맡지 않는 것'의 서버 푸시 문장을 "보호자 기기의 구독과 다시 맞추기는 여기서 한다(`guardianPush.js`). 서버 쪽 보내기는 `lib/server/watch/`"로. 마감 지남 알림 절에 R4(같은 tag 한 줄, 예약은 결정 15대로 그대로). `lib/store/AGENTS.md`(`guardianPush`, 대기 두 종류), `src/guardian/AGENTS.md`(`pushRequests.js`, `fragmentFromPasted`), `components/AGENTS.md`(`GuardianPushItemView`, 복귀 확인 꼬리표 표시 규칙).
- 설계서: '구현에서 달라진 것 (A-3)' 절을 더해 이 계획의 1~28번과 '알고 남기는 틈'을 옮긴다. 3(a)의 "같은 스위치" 문장 옆에 1·2번을 가리킨다.
- `CLAUDE.md`, `AGENTS.md`의 "서버에 데이터베이스가 없고" 문장과 화면 약속 문구는 고치지 않는다.

- [ ] **Step 1: 문서를 고친다.** 새 글에 엠대시·엔대시가 없는지 `git diff -U0 | grep '^+' | perl -CSD -ne 'print if /[\x{2013}\x{2014}]/'`로 확인한다(결과가 없어야 한다).
- [ ] **Step 2: `npm run lint && npm test`**
- [ ] **Step 3: 독립 검토.** 문서와 코드의 이름·숫자가 같은지 본다.
- [ ] **Step 4: 커밋한다.**

```
docs: 서버 알림 보호자 쪽(A-3) 보안·계약·업무 규칙·구조·함정 문서

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

## 자체 점검

| 결정 | 맡는 작업 |
| --- | --- |
| 1~3 항목 조건, 두 스위치, 설정 읽기 시점 | Task 5, Task 7, Task 8 |
| 4 준비 확인 | Task 3, Task 5, Task 8 |
| 5 흐름 상태와 결과 | Task 5, Task 7 |
| 6~7 기록 모양, 브라우저 구독 하나 | Task 2, Task 5 |
| 8~10 다시 맞추기, `MOVED`, 404 | Task 5, Task 8 |
| 11~13 끄기, 스위치 꺼짐, 대기 두 종류 | Task 2, Task 5, Task 7, Task 8 |
| 14~16 상태 조회, 복귀 확인, 함께 있음 | Task 5, Task 7, Task 8 |
| 17~18 겹침 막기, 여러 환자 | Task 4 |
| 19~23 서비스 워커 | Task 3 |
| 24~26 지원 판별, 아이폰 안내, 붙여넣기 | Task 5, Task 6, Task 7, Task 8 |
| 27~28 로그인 없는 보호자, 동의 문구 | Task 7, Task 9 |

- Review Focus 다섯 줄의 고정 테스트는 모두 Task 3, 4, 5, 7, 8의 시험 이름에 있다.
- 이름 맞춤: `subscribeRequest`, `unsubscribeRequest`, `statusRequest`, `muteRequest`, `readStatusData`, `normalizeGuardianPush`, `retireGuardianPushSub`, `guardianPushElsewhere`, `watchNotificationTag`, `notificationTagOf`, `pushSupport`, `planReconcile`, `statusTimes`, `createGuardianPush`, `getGuardianPush`, `useGuardianPush`, `guardianPushViewModel`, `confirmedFor`, `fragmentFromPasted`는 작업 사이에 같은 이름과 인자로 쓴다.

## 실행 순서

| 묶음 | 작업 | 함께 돌릴 수 있는가 |
| --- | --- | --- |
| 1 | Task 1, Task 3, Task 6 | 셋 다 파일이 겹치지 않는다(문구 파일은 `notifications.js`와 `guardian.js`로 다르다) |
| 2 | Task 2 | 묶음 1이 합쳐진 뒤(Task 1의 `unsubscribeRequest`를 쓴다) |
| 3 | Task 4, Task 5 | 묶음 2가 합쳐진 뒤. 둘은 파일이 겹치지 않아 함께 돌 수 있다(Task 4는 `lib/notify/device.js`만) |
| 4 | Task 7 | 묶음 3이 합쳐진 뒤(Task 6의 `GuardianOpen.js` 변경 위에 올린다) |
| 5 | Task 8, Task 9 | 묶음 4가 합쳐진 뒤 함께 돈다 |

끝난 뒤: 전체 가지 독립 검토(조용한 푸시, 겹침, 저절로 구독하는 길, 지우기 경로, 로그·URL의 식별 값 중심), 전체 관문(`npm run lint && npm test && npm run build && E2E_PORT=<빈 포트> npm run e2e`), PR, CI, 병합(운영 스위치는 꺼진 채라 운영 화면은 그대로), `npm run verify:deploy -- https://safehour.vercel.app --skip-plan`. 서비스 워커 판이 바뀌므로 운영 확인에서 새 `sw.js`의 `SW_VERSION`이 `2026-11-16.1`인지 본다.
