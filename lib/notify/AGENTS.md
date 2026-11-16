# 알림 (`lib/notify/`)

## 맡는 것

- 일정에서 알림 예약 만들기(복귀 마감, 복약, 병원 일정)
- 알림 문구 만들기
- 기기 알림 요청과 앱 안 배너
- 예약 저장·정리
- 보호자 기기의 서버 알림 구독 실행기(`guardianPush.js`): 지원 판별, 서비스 워커 준비 확인, 켜기·끄기·다시 켜기·다시 받기, 다시
  맞추기, 상태 조회, 오늘 함께 있음과 화면 훅 `useGuardianPush`(ADR-0012, 스위치 꺼짐)

## 맡지 않는 것

- 서버 푸시 보내기. 기기 알림은 **앱이 열려 있거나 실행 중일 때만** 알린다. 보호자 기기의 구독과 다시 맞추기는 여기서
  한다(`guardianPush.js`). 서버 쪽 보내기는 `lib/server/watch/`(와 `src/push/`)다(ADR-0012, 스위치 꺼짐). 기기 알림은 서버 알림을
  켜도 그대로 동작한다
- 일정 계산 — `lib/trip/`, 서버 엔진
- 설정 화면 — `app/settings/`

## 항상 지켜야 하는 것

- **알림 문구에 조건 항목·병원 이름·복약 정보를 넣지 않는다.** 잠금 화면에 그대로 뜬다.
  "18:00까지 숙소로 돌아갈 시간이에요" 정도로 쓴다.
- 알림 권한은 사용자가 스위치를 켤 때만 요청한다(설정 화면의 알림 스위치, 보호자 화면 `/g`의 복귀 마감 알림 스위치와 '앱이 닫혀
  있어도 받기' 켜기). 셋 다 같은 `turnOnDeviceNotifications`로 같은 기기 설정 `prefs.notifications` 를 켠다. 화면을 열자마자 요청하지 않는다.
- **서버 알림 구독은 저절로 만들지 않는다.** `pushManager.subscribe`는 켜기·다시 받기·다시 켜기(사용자 동작) 안에서만 부른다. 키가
  바뀌거나 다른 기기가 가져가면 버튼을 보일 뿐이다. 기기 알림 스위치를 끄거나 권한이 사라지면 이 계정의 서버 구독을 모두 끈다.
- 구독 실행기는 `console`을 쓰지 않고 `watchId`·`subId`·구독 주소와 그 해시·계정 키를 URL·오류·기록에 싣지 않는다(요청 본문으로만
  보낸다). 실행기는 던지지 않는다.
- **앱이 완전히 닫혀 있으면 알림을 받지 못할 수 있다**는 사실을 숨기지 않는다. 설정 화면에 그대로 적는다.
- 시점은 조정 가능한 기본값 파일에서 읽는다. 여기에 숫자를 직접 쓰지 않는다.
- 일정이 바뀌면 예약을 다시 만든다. 지난 일정의 알림이 남아 울리지 않게 한다.

## 구현 방식

- 예약 만들기는 순수 함수다 — 일정과 현재 시각을 받아 예약 목록을 돌려준다. 브라우저 API는 실행
  계층에서만 쓴다.
- 병원 일정 알림은 숙소에서 출발해야 하는 시각을 기준으로 한다. 직전 외출이 병원에서 끝나는 날은
  복귀 마감 알림이 그 역할을 대신하므로 중복해서 만들지 않는다.
- 복약은 '숙소에서 복용'과 '숙소 밖 복용'의 시점이 다르다. 앞은 미리, 뒤는 그 시각에 알린다.
- 마감 지남 알림은 두 종류다. `RETURN_PASSED`(환자 외출의 복귀 마감)와 `COMPANION_RETURN_PASSED`(보호자 기기,
  가장 최근에 가져온 보호자 사본의 오늘(KST) 하루에 담긴 환자 복귀 마감). 마감 시각에 울리고, 늦게 깨어나도
  `expiresAt` = 마감 + 60분까지는 낸다. 때가 된 id 는 밀려서 내지 않은 것까지 모두 저장소 `overdueSeen` 에 남겨,
  앱을 다시 열어도 다시 내지 않는다.
- 보호자 마감 지남(`COMPANION_RETURN_PASSED`)의 알림 칸 태그는 서버 푸시와 같은 `sh-watch-<날짜>-<HH:MM>`이다(R4,
  `watchNotificationTag`·`notificationTagOf`). 서비스 워커로 낼 때 같은 태그 알림이 떠 있으면 내지 않아 같은 마감의 두 알림이 알림
  칸에서 한 줄이 된다(떠 있는지 묻기는 1초 `TAG_CHECK_TIMEOUT_MS`, 답이 없으면 낸다). 예약과 늦은 알림 창은 서버 알림 계획 결정 15대로
  그대로이고, 복귀 확인과도 무관하게 울린다. 태그에 환자가 없으므로 예약을 만든 사본과 다른 `watchId`의 사본에 같은 날짜·시각 마감이
  있으면 예약 id 태그로 낸다(`mayShareWatchTag`, 실행기가 `sharedWatchTag`로 넘기고 기본값은 거짓). 환자 알림은 늘 예약 id 태그다.
- 외출 중 재계획으로 즉시 복귀가 켜져 마감이 지금으로 당겨진 외출만 `RETURN_PASSED` 를 만들지 않는다(`returnNow` 이고 사유에
  `OUTING_OVERDUE`, 그 외출의 `slackMin < 0`). 그 마감은 실제 마감 시각이 아니다. 같은 날의 다른 외출, `PATIENT_RECALLED`·
  `PLAN_REVOKED`·`PLAN_EXPIRED` 로 즉시 복귀가 켜진 날의 외출은 실제 마감이 남아 있으므로 그대로 만든다(`isOverdueClampedDay`).
- 앱 안 배너는 스위치와 상관없이 늘 바뀐다. 스위치(`prefs.notifications`)는 기기 알림만 막는다.
- 기기 알림을 누르면 서비스 워커가 알림 `data.url` 의 화면을 연다. 허용 목록(`/today`, `/g`) 밖이면 `/today` 를 연다.
  서비스 워커 없이 생성자로 낸 알림은 `onclick` 이 같은 허용 목록(`notificationClickPath`)으로 창을 옮긴다.
- 보호자 구독 실행기는 하나다(`createGuardianPush`, 브라우저에서는 `client.js`의 `getGuardianPush`, 시작은 알림 배너
  `components/pwa/NotificationBanner.js`). 무엇을 할지는 순수 함수가 정한다: 지원 판별 `pushSupport.js`(사용자 에이전트를 읽지 않는다),
  다시 맞추기와 상태 조회 시각 `guardianPushPlan.js`(`planReconcile`, `statusTimes`). 동작은 약속 줄 하나에 한 번에 하나씩 돌고
  (같은 기기의 탭 사이에서도: Web Locks `safehour-guardian-push` 안에서 기록을 다시 읽어 정하고 60초까지만 붙잡는다. 없으면 탭
  안에서만), 같은 지켜보기의 동작이 도는 중이면 그 약속을 돌려준다(`getState(watchId).busy`). 기다린 뒤의 기록 쓰기는 `store.updateGuardianPush`만 쓴다.
  요청 규칙은 `docs/contracts.md` 'A-3 클라이언트가 지키는 것'. 요청 간격(`CONFIG_TTL_MS`, `STATUS_POLL_MS` 등)은 알림 시점이 아니라
  실행기 상수다. 상태 조회의 마감 뒤 시각은 기본값 파일의 `serverPushGraceMin`을 읽는다(마감 + 11분).

## 테스트

- 만들어진 문구에 조건·병원·복약 관련 낱말이 없는지 단언한다.
- 외출·복약·병원 일정이 섞인 하루로 예약 목록을 만들어 개수와 시점을 확인한다.
- 일정을 바꿨을 때 예전 예약이 남지 않는지 확인한다.
- 보호자 구독 실행기(`test/notify-guardian-push.test.js`), 다시 맞추기·상태 조회 시각(`test/notify-guardian-push-plan.test.js`), 지원
  판별(`test/notify-push-support.test.js`), 마감 지남 태그와 같은 태그 건너뛰기(`test/notify-device.test.js`, `test/notify-runtime.test.js`).
