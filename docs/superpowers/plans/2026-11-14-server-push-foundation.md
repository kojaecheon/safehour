# 서버 알림 기반 (갈래 2 단계 A-1) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 없이 서버 쪽만 만든다. 네 레코드 저장소, 횟수 제한, 웹 푸시 발송, 예약, `/api/watch*` 경로를 스위치가 꺼진 채 병합할 수 있는 상태로 넣는다.

**Architecture:** 웹 푸시 프로토콜(VAPID, RFC 8291)은 `src/push/`에 환경변수를 읽지 않는 서버 전용 모듈로 둔다. 저장과 업무 규칙은 `lib/server/watch/`에 두고, 저장소는 Redis 명령 배열을 받는 `kv.exec()` 하나 뒤에 숨긴다(메모리 구현과 Upstash REST 구현). 예약은 `scheduler` 어댑터 뒤에 두어 QStash를 나중에 다른 방식으로 바꿀 수 있게 한다. 라우트 파일은 얇게 두고 처리 본체는 `createWatchHandlers()`가 만든다.

**Tech Stack:** Next.js 16 App Router(라우트 핸들러, `runtime = 'nodejs'`), Node `node:crypto`, `fetch`, `node --test`. 새 패키지 없음.

**Spec:** `docs/superpowers/specs/2026-11-09-server-push-design.md`(8.1절 운영자 답과 11.1절 확인 결과가 본문보다 우선), `docs/decisions/0012-server-minimal-storage-guardian-push.md`

## Global Constraints

- `package.json`, `package-lock.json`을 바꾸지 않는다. `npx`로 도구를 받지 않는다. npm 스크립트도 더하지 않는다(스크립트는 `node scripts/…`로 실행한다).
- 새로 쓰는 글(코드 주석, 문서, 문구, 커밋 메시지)에 엠대시와 엔대시를 쓰지 않는다. 쉼표, 괄호, 콜론을 쓴다.
- 주석과 문서는 한국어로 쓴다. '안전합니다'라는 말을 쓰지 않는다.
- 서버에 저장하는 것은 설계서 2.1의 네 레코드뿐이다. 필드를 더하지 않는다. 더해야 할 것 같으면 멈추고 보고한다.
- 기록(로그), 예외 메시지, 응답 본문에 넣지 않는 것: `watchId`, 저장 키, `ownerHash`, `subId`, `writeToken`, endpoint 주소와 호스트, 날짜, 시각, 언어, 푸시 서비스 응답 원문, 저장소 주소와 토큰, QStash 메시지 id, IP, User-Agent.
- 식별 값은 요청 본문으로만 받는다. 경로와 쿼리 문자열에 싣지 않는다.
- 기능을 켜는 스위치는 값이 정확히 `'1'`일 때만 켜짐이다. 끄는 스위치는 `1`·`true`·`on`(앞뒤 공백, 대소문자 무시)을 켜짐으로 읽는다.
- 시계는 주입한다. `Date.now()`를 서비스 함수 안에서 직접 부르지 않는다(`ctx.now()`).
- 날짜와 시각은 `src/stay/time.js`의 도우미로만 계산한다(`kstInstantMs`, `addDays`, `isDateString`, `isClockTime`, `KST_OFFSET_MIN`). 오프셋 없는 문자열을 `new Date()`로 직접 읽지 않는다.
- 단위 테스트는 외부 호출 0건이다. 저장소와 푸시 서비스와 QStash는 가짜 `fetch`로 대신한다.
- 라우트와 그 아래 모듈은 상대 경로로 불러온다(`@/` 별칭은 `node --test`에서 읽지 못한다).
- 외부 서비스 형식(Upstash REST 응답 모양, QStash 발행·취소·서명, Vercel 보호 우회 헤더)은 기억으로 쓰지 않는다. 구현자가 공식 문서를 열어 확인하고 근거 주소를 주석에 남긴다. 확인하지 못하면 추정으로 구현하지 말고 보고한다.
- 커밋 메시지 끝줄: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`
- 각 작업의 마지막 확인: `npm run lint && npm test`.

## 설계서와 다르게 정한 것 (이 계획이 정본, 작업 9에서 설계서에 적는다)

1. **연장 경로를 합친다.** `PUT /api/watch`를 따로 두지 않는다. `PUT /api/watch/deadlines`가 `expiresOn`을 늘 함께 받아 상한을 다시 씌우고 TTL을 갱신한다. 체류가 늘면 일정도 바뀌어 마감을 다시 올리기 때문에 따로 부를 일이 없다.
2. **`expiresAt` 대신 `expiresOn`.** 출국일을 KST 날짜 문자열(`YYYY-MM-DD`)로 받는다. 시각 문자열을 주고받지 않아 시간대 해석이 생기지 않는다. 레코드 만료 시각은 서버가 계산한다.
3. **날짜 기록은 해시 하나.** `deadlines`·`confirmed`·`armed`·`pushed`·`muted`를 키 여러 개가 아니라 날짜마다 Redis 해시 하나에 둔다. '보낼 권리'는 `SADD pushed` 대신 같은 해시의 `HSETNX p:<시각>`으로 얻는다. 원자성은 같고 TTL이 하나로 끝난다.
4. **찾는 키의 비밀은 하나.** 저장 키, `ownerHash`, 횟수 제한 키, 중복 제거 id, 푸시 Topic을 모두 `SAFEHOUR_WATCH_OWNER_SECRET`에 서로 다른 문맥 문자열을 붙여 만든다. 세션 서명 키와는 다른 비밀이다. 이 비밀을 바꾸면 기존 지켜보기를 더는 찾지 못하고 TTL로 사라진다(환자가 다시 켜야 한다).
5. **상태 조회와 '오늘 함께 있음'은 `subId`를 함께 받는다.** 상태 조회는 `subId`를 주면 그 기기의 구독이 아직 유효한지(`subscriptionActive`)도 알려 준다. '오늘 함께 있음'은 지금 구독의 `subId`가 맞아야 바뀐다.
6. **예약 처리 경로는 QStash 서명 또는 `CRON_SECRET` Bearer 둘 다 받는다**(설계서 5.2 그대로). 미리보기 시험과 화면 테스트는 Bearer로 직접 부른다.
7. **시험 장치는 운영 배포에서 듣지 않는다.** 데모 로그인(`SAFEHOUR_ALLOW_DEMO_LOGIN=1`)은 운영에도 켜져 있으므로, 메모리 저장소·가짜 푸시 출처·`http` 기준 주소는 '데모 로그인이면서 `VERCEL_ENV`가 `production`이 아닐 때'만 듣는다(`testHooks`).
8. **예약 중복 제거 id는 예약마다 다르게 한다.** QStash 중복 제거는 취소한 메시지에도 10분 동안 걸려, 마감을 뺐다가 곧 다시 넣으면 새 예약이 삼켜질 수 있다. 같은 마감이 두 번 나가지 않게 하는 것은 `a:` 표시와 `HSETNX` 권리가 맡는다.
9. **지켜보기를 쓸 때마다 소유 집합의 만료도 늘린다**(`writeWatch`가 함께 한다). 삭제는 저장된 출국일이 아니라 어제부터 오늘 + 46일까지의 날짜를 훑는다(체류를 줄인 뒤 남은 날짜 기록까지 지운다).
10. **오류 코드를 넷 둔다.** `SAFEHOUR_SERVER_PUSH_OFF`(503, 기능이 꺼짐), `SAFEHOUR_SERVER_PUSH_UNAVAILABLE`(503, 저장소·예약 업체 일시 장애), `SAFEHOUR_WATCH_NOT_FOUND`(404), `SAFEHOUR_RATE_LIMITED`(429).

작업 5 검토(2026-11-15)를 반영해 더한 것. 작업 5 판정표와 다르면 아래가 정본이다.

11. **보냄 표시(`p:`)는 두 단계다.** 권리를 얻을 때 `'1'`(보내는 중), 푸시 서비스가 받으면 `'s'`(보냄). 보내지 못한 결과(구독 없음, 한도, 구독 만료, 거절, 다시 시도)는 모두 표시를 지운다. `readDay`의 `pushed`는 `'s'`인 시각만 담고, 보내는 중인 시각은 `claimed`에 따로 담는다. '돌아왔어요'는 `'s'`일 때만 복귀 확인 알림을 보낸다. 예약 처리는 권리를 얻는 같은 배치에서 날짜 기록을 다시 읽어 확인(`c:`)·함께 있음(`m`)·마감 목록을 다시 본다(맞지 않으면 권리를 돌려놓고 해당 SKIP). 보낸 뒤에는 `'s'`를 쓰는 같은 배치에서 `c:`를 다시 읽고, 그 사이 확인이 들어왔으면 복귀 확인 알림을 예약 처리가 보낸다(`k:` 권리로 한 번만). 보낸 뒤의 저장소 실패는 던지지 않고 `SENT`로 끝낸다(이미 나갔다).
12. **일찍 온 예약은 다시 부르게 한다.** 보낼 시각 − 30초보다 일찍 오면 `SKIP_EARLY`에 `retry: true`. '돌아왔어요' 되돌리기 마감도 보낼 시각 − 30초다. 상수 `EARLY_TOLERANCE_MS`는 `arm.js`가 내보내고 `due.js`와 `patient.js`가 함께 쓴다.
13. **출국일 뒤 날짜의 예약은 건너뛴다.** 예약 처리는 `date > watch.expiresOn`이면 `SKIP_CHANGED`.
14. **아무 일도 하지 않은 예약은 걸림 표시를 지운다.** `SKIP_CHANGED`(날짜 기록은 있는데 시각이 목록에 없을 때), `SKIP_MUTED`, `SKIP_NO_SUB`(미리 본 것과 보내기 결과 둘 다), `SUB_GONE`은 `a:<시각>`을 지운다. 지우는 `HDEL`과 같은 배치에서 이유를 다시 읽고(구독은 `EXISTS`, 날짜 기록은 `HGETALL`), 이유가 사라졌으면 `retry: true`로 끝내 다시 불린다. 권리를 쥔 뒤라면 `p:`도 같은 `HDEL`로 돌려놓는다. 보호자가 구독하면 어제·오늘의, '오늘 함께 있음'을 끄면 오늘의 걸리지 않은 마감을 다시 건다(함께 있음 표시는 오늘 기록에만 있다)(`armPending`, 실패는 응답을 바꾸지 않는다). 구독은 구독을 쓴 뒤에, 끄기는 `m`을 지운 뒤에 다시 건다(쓰기가 먼저, 다시 걸기의 읽기가 나중). 늦은 한도 안이면 지금 나간다. 걸기는 '오늘 함께 있음'인 날짜를 건너뛴다. 404·410인데 다시 읽은 구독의 `subId`가 다르면 지우지 않고 `RETRY`로 끝낸다(걸림 표시는 남긴다).
15. **하루 푸시 한도는 보낸 것만 센다.** 보내기 전에는 읽기만 해 한도를 보고(`peekRate`), `SENT`일 때만 센다(`countRate`). 세기가 실패해도 결과는 `SENT`다. 동시에 보내면 한도를 조금 넘을 수 있다.
16. **마감 올리기 응답에 `armFailed`를 더한다.** 예약 업체 실패로 걸지 못한 마감 수다. 0보다 크면 클라이언트가 잠시 뒤 같은 전체를 다시 올린다(A-2에서 쓴다).
17. **하루 1회 예약은 지켜보기 레코드가 없는 날짜 기록을 걸지 않는다.** 지켜보기마다 한 번만 확인하고 색인에서 뺀다.
18. **예약 처리는 일찍 온 예약(`SKIP_EARLY`, 다시 부름)을 확인(`SKIP_CONFIRMED`)보다 먼저 본다.** 작업 5 판정표의 순서(확인이 먼저, 일찍 옴은 다시 부르지 않음)를 바꾼 것이다. 정본 판정표는 `docs/contracts.md`의 `POST /api/watch/due`에 있다.

## 공용 모양

**WatchCtx**: 서비스 함수의 첫 인자. 운영에서는 작업 8의 `createWatchCtx()`가, 테스트에서는 `test/watch-fixtures.js`의 `testCtx()`가 만든다.

```js
{
  kv,         // { exec(commands: Array<Array<string|number>>): Promise<any[]> }  exec 한 번은 원자적이다
  keys,       // redisKeys(ns) 결과
  secret,     // string  (SAFEHOUR_WATCH_OWNER_SECRET)
  sealKeys,   // Buffer[]  32바이트 키. [현재, 이전?]
  now,        // () => number (ms)
  scheduler,  // { schedule({ body, notBeforeMs, dedupId }): Promise<{ ok: boolean, messageId?: string }>,
              //   cancel(messageId): Promise<boolean> }
  push,       // { send({ subscription: { endpoint, p256dh, auth }, payload: string, topic?: string }):
              //   Promise<{ outcome: 'SENT'|'GONE'|'RETRY'|'REJECTED', statusClass: '2xx'|'404/410'|'4xx'|'5xx'|'network' }> }
  reviewed,   // { ja: boolean, zh: boolean }  안전 문구 검수 스위치
  enabled,    // boolean  스위치 켜짐 && 차단 꺼짐 && 준비됨
  testOrigin, // string|null  데모 모드에서만 받는 가짜 푸시 서비스 출처
}
```

**Result**: 서비스 함수의 반환. `{ ok: true, ...값 }` 또는 `{ ok: false, reason: 'NOT_FOUND' | 'RATE_LIMITED' | 'BAD_REQUEST' }`. 저장소 장애는 `KvError`를 던진다(처리기가 503으로 바꾼다).

**저장 모양** (`ns`는 `prod`·`prev`·`dev`)

| 키 | 값 | 만료 |
| --- | --- | --- |
| `sh:<ns>:w:<watchKey>` | JSON `{ ownerHash, writeHash, expiresOn, registrations }` | `watchExpiryUnix(expiresOn)` |
| `sh:<ns>:s:<watchKey>` | JSON `{ v: 1, subId, sealed }`. `sealed`는 `{ endpoint, p256dh, auth, lang }`을 AES-256-GCM으로 감싼 문자열 | 지켜보기와 같다 |
| `sh:<ns>:d:<watchKey>:<date>` | 해시. `dl`=마감 JSON 배열, `c:<HH:MM>`=확인됨, `a:<HH:MM>`=예약 메시지 id, `p:<HH:MM>`=마감 지남 푸시 권리, `k:<HH:MM>`=복귀 확인 푸시 권리, `m`=오늘 함께 있음 | `dayExpiryUnix(date)` |
| `sh:<ns>:o:<ownerHash>` | 집합. 그 계정의 `watchKey`들 | 등록할 때마다 지금 + 60일 |
| `sh:<ns>:x:<date>` | 집합. 그 날짜에 마감이 있는 `watchKey`들(하루 1회 예약용 색인) | `dayExpiryUnix(date)` |
| `sh:<ns>:r:<rateKey>:<창 번호>` | 정수 | 창 길이 + 60초 |

- `dayExpiryUnix(date)` = (`date` + 2일) 00:00 KST의 유닉스 초. 날짜 끝 + 1일이다.
- `watchExpiryUnix(expiresOn)` = (`expiresOn` + 1일 + `DEFAULTS.stay.deleteAfterDepartureDays`) 00:00 KST의 유닉스 초. 출국일 끝 + 7일이다.
- `capExpiresOn(expiresOn, today)` = `min(expiresOn, today + DEFAULTS.stay.maxNights + 1일)`.
- 형식: `watchId` 22자, `writeToken` 43자, `subId` 22자, `watchKey` 43자 (모두 base64url). 날짜 `YYYY-MM-DD`, 시각 `HH:MM`.

**시각 규칙**

- 보낼 시각 `fireAtMs(date, time)` = `kstInstantMs(date, time)` + `DEFAULTS.notifications.serverPushGraceMin`분(10).
- 늦은 한도 `lateLimitMs(date, time)` = `kstInstantMs(date, time)` + `DEFAULTS.notifications.returnPassedGraceMin`분(60).

## Review Focus

테스트가 없으면 놓치기 쉬운 다섯 가지다. 각 줄 끝의 작업이 그 테스트를 갖는다.

1. **자정 경계.** 마감 23:55는 다음 날 00:05에 보낸다. 그때도 날짜 기록이 남아 있어야 하고, 00:05에 누른 '돌아왔어요'(어제 날짜)가 받아들여져야 한다. (작업 2, 5, 6)
2. **같은 마감을 다시 올림.** 예약을 다시 걸지 않고 확인·보냄 표시를 지우지 않는다. 마감이 빠지면 그 시각의 표시를 지우고, 뒤늦게 도착한 예약 처리는 건너뛴다. (작업 2, 5)
3. **저장소 장애.** 어느 경로든 503 `SAFEHOUR_SERVER_PUSH_UNAVAILABLE`이고 응답과 기록에 주소·토큰·명령이 없다. 예약 처리 경로는 503을 돌려줘 다시 불리게 한다. (작업 2, 8)
4. **적대적 입력.** endpoint `https://fcm.googleapis.com.evil.com/`, `https://evil.com/fcm.googleapis.com`, `https://fcm.googleapis.com@evil.com/`, IP 주소, 다른 포트, `http:`. 16KB를 넘는 본문. `days`의 `__proto__` 키. (작업 1, 8)
5. **꺼진 뒤의 삭제.** `SAFEHOUR_SERVER_PUSH`가 꺼져 있거나 차단 스위치가 켜져 있어도 `DELETE /api/watch`와 `DELETE /api/watch/subscribe`는 동작한다. 쓰기 경로는 503이다. (작업 8)

## 파일 구조

```
src/push/                         웹 푸시 프로토콜. 서버 전용, 환경변수를 읽지 않는다
  vapid.js                        VAPID 키 들이기, JWT, Authorization 헤더, 출처별 JWT 재사용
  encrypt.js                      RFC 8291 aes128gcm 암호화 (salt·임시 키 주입 가능)
  decrypt.js                      같은 형식 복호화 (테스트와 가짜 푸시 서비스용)
  endpoint.js                     endpoint 검증 (https, 호스트 허용 목록)
  send.js                         푸시 한 건 보내기와 결과 분류
  index.js, AGENTS.md
lib/server/watch/
  kv.js                           kv.exec 인터페이스, 메모리 구현, Upstash REST 구현
  keys.js                         HMAC 키 유도, 형식 정규식, Redis 키 이름
  seal.js                         구독 봉인 (AES-256-GCM)
  limits.js                       횟수 제한 상수와 hitRate
  records.js                      네 레코드 읽기·쓰기 (Redis 배치는 이 파일만 안다)
  config.js                       환경변수 읽기와 준비 상태
  scheduler.js                    QStash 어댑터, 메모리 어댑터, 서명 검증
  text.js                         서버 푸시 문구
  notify.js                       보호자에게 푸시 보내기
  arm.js                          예약 걸기
  due.js                          예약 처리 판정표
  patient.js                      환자 쪽 동작
  guardian.js                     보호자 쪽 동작
  requests.js                     본문 읽기와 허용 목록
  log.js                          기록 조립
  context.js                      WatchCtx 조립
  handlers.js                     라우트 처리기
  AGENTS.md
app/api/push/config/route.js      GET
app/api/watch/route.js            POST, DELETE
app/api/watch/deadlines/route.js  PUT
app/api/watch/back/route.js       POST
app/api/watch/subscribe/route.js  POST, DELETE
app/api/watch/status/route.js     POST
app/api/watch/mute/route.js       POST
app/api/watch/due/route.js        POST
app/api/cron/watch-arm/route.js   GET
scripts/generate-push-secrets.mjs VAPID 키 쌍과 무작위 비밀 출력
test/watch-fixtures.js            testCtx, 고정 값
test/push-*.test.js, test/watch-*.test.js
```

---

### Task 1: 웹 푸시 프로토콜 (`src/push/`)

**Files:**
- Create: `src/push/vapid.js`, `src/push/encrypt.js`, `src/push/decrypt.js`, `src/push/endpoint.js`, `src/push/send.js`, `src/push/index.js`, `src/push/AGENTS.md`
- Test: `test/push-vapid.test.js`, `test/push-encrypt.test.js`, `test/push-endpoint.test.js`, `test/push-send.test.js`

**Interfaces:**
- Consumes: 없음 (`node:crypto`만)
- Produces:
  - `class PushError extends Error { code }`. `code`는 `'PUSH_KEY' | 'PUSH_PAYLOAD_TOO_LARGE' | 'PUSH_VAPID'`. 메시지에 키·endpoint를 넣지 않는다.
  - `createVapidSigner({ publicKey, privateKey, subject }) → { authorizationFor(endpointUrl: string, nowMs: number): string }`. `publicKey`는 65바이트 비압축 점의 base64url, `privateKey`는 32바이트의 base64url. 형식이 틀리면 `PushError('PUSH_VAPID')`.
  - `isValidVapidSubject(value) → boolean` (`mailto:` 또는 `https:`로 시작)
  - `MAX_PUSH_BODY_BYTES = 4096`
  - `encryptPushPayload({ plaintext: Buffer|string, p256dh, auth, salt?: Buffer, localPrivateKey?: Buffer }) → Buffer`
  - `decryptPushPayload({ body: Buffer, privateKey: Buffer, auth: string }) → Buffer`
  - `PUSH_HOST_RULES`, `parsePushEndpoint(value, { testOrigin } = {}) → { ok: true, url: URL, audience: string } | { ok: false }`
  - `PUSH_OUTCOME = { SENT, GONE, RETRY, REJECTED }`
  - `sendPush({ subscription: { endpoint, p256dh, auth }, payload, signer, topic, ttlSec = 3600, urgency = 'high', fetchImpl = globalThis.fetch, nowMs, timeoutMs = 5000, testOrigin }) → Promise<{ outcome, statusClass }>`. 절대 던지지 않는다.

정한 값:
- VAPID JWT 머리 `{ typ: 'JWT', alg: 'ES256' }`, 클레임 `{ aud, exp, sub }`. `aud`는 endpoint의 출처(`url.origin`), `exp`는 지금 + 12시간(초). 서명은 `dsaEncoding: 'ieee-p1363'`. 개인키는 x·y와 함께 JWK로 만들어 `createPrivateKey({ key, format: 'jwk' })`로 들인다.
- `Authorization: vapid t=<JWT>, k=<publicKey>`.
- JWT는 출처마다 기억해 두고 남은 수명이 1시간을 넘는 동안 다시 쓴다(Apple은 한 시간에 한 번 넘게 새로 만들지 말라고 한다).
- 암호화: `ecdh = ECDH(임시 개인키, p256dh)`, `ikm = HKDF(sha256, ikm=ecdh, salt=auth, info='WebPush: info\0' + p256dh + 임시 공개키, 32)`, `cek = HKDF(ikm, salt, 'Content-Encoding: aes128gcm\0', 16)`, `nonce = HKDF(ikm, salt, 'Content-Encoding: nonce\0', 12)`. 평문 끝에 `0x02`를 붙여 AES-128-GCM. 본문 = `salt(16) | 레코드 크기 uint32 BE 4096 | 65 | 임시 공개키(65) | 암호문+태그`.
- 평문이 3993바이트를 넘으면(본문이 4096을 넘으면) `PushError('PUSH_PAYLOAD_TOO_LARGE')`.
- 호스트 규칙: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`. `*.`는 한 단계 이상 하위 도메인만 맞는다(맨몸 `push.apple.com`은 아니다).
- endpoint 조건: 문자열, 2048자 이하, `https:`, 사용자 정보 없음, 포트 없음(또는 443), 호스트가 규칙에 맞음. `testOrigin`이 주어지고 URL의 출처가 그것과 같으면 다른 조건 없이 통과한다(데모 모드 전용, 넘기는 쪽이 책임진다).
- 보내기: `POST`, `redirect: 'manual'`, `AbortSignal.timeout(timeoutMs)`. 헤더 `Authorization`, `Content-Encoding: aes128gcm`, `Content-Type: application/octet-stream`, `TTL`, `Urgency`, 그리고 `topic`이 `/^[A-Za-z0-9_-]{1,32}$/`에 맞을 때만 `Topic`.
- 결과 분류: 2xx → `SENT`/`'2xx'`. 404·410 → `GONE`/`'404/410'`. 429 → `RETRY`/`'4xx'`. 5xx → `RETRY`/`'5xx'`. 예외·시간 초과 → `RETRY`/`'network'`. 그 밖(3xx 포함) → `REJECTED`/`'4xx'`. endpoint 검증 실패나 키 형식 오류는 `fetch` 없이 `REJECTED`/`'4xx'`.

- [ ] **Step 1: 암호화 테스트를 쓴다** (`test/push-encrypt.test.js`)

```js
const V = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const b = (s) => Buffer.from(s, 'base64url');

test('RFC 8291 부록 A 시험 벡터와 본문이 바이트 단위로 같다', () => {
  const body = encryptPushPayload({
    plaintext: b(V.plaintext), p256dh: V.uaPublic, auth: V.auth, salt: b(V.salt), localPrivateKey: b(V.asPrivate),
  });
  assert.equal(body.toString('base64url'), V.body);
});
test('시험 벡터 본문을 구독 개인키로 풀면 원문이 나온다', () => {
  assert.equal(decryptPushPayload({ body: b(V.body), privateKey: b(V.uaPrivate), auth: V.auth }).toString('utf8'),
    'When I grow up, I want to be a watermelon');
});
test('salt와 임시 키를 주지 않으면 매번 다른 본문이 나오고, 풀면 같은 원문이다', () => { /* 두 번 암호화, notEqual, 둘 다 복호화 */ });
test('평문 3993바이트는 4096바이트 본문이 되고, 3994바이트는 PUSH_PAYLOAD_TOO_LARGE', () => { /* body.length === 4096 */ });
test('p256dh가 65바이트 비압축 점이 아니거나 auth가 16바이트가 아니면 PUSH_KEY', () => { /* 길이 64, 첫 바이트 0x03, auth 15바이트 */ });
test('오류 메시지에 키 값이 없다', () => { /* err.message에 V.uaPublic, V.auth가 없다 */ });
```

- [ ] **Step 2: 실패를 확인한다.** `node --test test/push-encrypt.test.js` → 모듈 없음으로 실패
- [ ] **Step 3: `src/push/encrypt.js`, `src/push/decrypt.js`를 구현한다**
- [ ] **Step 4: 통과를 확인한다**
- [ ] **Step 5: VAPID 테스트를 쓴다** (`test/push-vapid.test.js`)

테스트 키는 `generateKeyPairSync('ec', { namedCurve: 'prime256v1' })`로 만들고 JWK의 `x`·`y`·`d`에서 base64url 공개키(0x04 + x + y)와 개인키를 꺼낸다.

```js
test('Authorization 은 "vapid t=<JWT>, k=<공개키>" 이고 JWT 는 공개키로 검증된다', () => {
  // t=, k= 를 나눠 k === publicKey, JWT 세 조각
  // verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKeyObject, dsaEncoding: 'ieee-p1363' }, sig) === true
  // 머리 { typ: 'JWT', alg: 'ES256' }
});
test('aud 는 endpoint 의 출처, sub 는 연락처, exp 는 지금 + 12시간이다', () => {
  // authorizationFor('https://fcm.googleapis.com/fcm/send/abc?x=1', NOW) → aud 'https://fcm.googleapis.com', exp === floor(NOW/1000) + 43200
});
test('같은 출처는 11시간 동안 같은 JWT 를 다시 쓰고, 그 뒤에는 새로 만든다', () => { /* NOW, NOW+10h59m → 같음. NOW+11h1m → 다름 */ });
test('출처가 다르면 JWT 도 다르다', () => {});
test('키 형식이 틀리거나 연락처가 mailto:·https: 가 아니면 PUSH_VAPID', () => {});
```

- [ ] **Step 6: 실패 확인, `src/push/vapid.js` 구현, 통과 확인**
- [ ] **Step 7: endpoint 테스트를 쓴다** (`test/push-endpoint.test.js`)

```js
const OK = [
  'https://fcm.googleapis.com/fcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://web.push.apple.com/abc',
  'https://api.sandbox.push.apple.com/abc',
  'https://db5p.notify.windows.com/w/?token=abc',
];
const BAD = [
  'http://fcm.googleapis.com/fcm/send/abc',
  'https://fcm.googleapis.com.evil.com/x',
  'https://evil.com/fcm.googleapis.com',
  'https://fcm.googleapis.com@evil.com/x',
  'https://user:pw@fcm.googleapis.com/x',
  'https://fcm.googleapis.com:8443/x',
  'https://push.apple.com/x',
  'https://127.0.0.1/x',
  'https://[::1]/x',
  'https://xn--fcm-googleapis-com.evil/x',
  'not a url', '', null, 42, `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
];
test('허용 호스트의 https 주소만 받는다', () => { /* OK 전부 ok:true 이고 audience === url.origin, BAD 전부 ok:false */ });
test('testOrigin 이 주어지면 그 출처만 더 받는다', () => {
  // parsePushEndpoint('http://127.0.0.1:3199/push/abc', { testOrigin: 'http://127.0.0.1:3199' }).ok === true
  // parsePushEndpoint('http://127.0.0.1:3200/push/abc', { testOrigin: 'http://127.0.0.1:3199' }).ok === false
  // testOrigin 없이 'http://127.0.0.1:3199/push/abc' → false
});
```

- [ ] **Step 8: 실패 확인, `src/push/endpoint.js` 구현, 통과 확인**
- [ ] **Step 9: 보내기 테스트를 쓴다** (`test/push-send.test.js`). 가짜 `fetchImpl`이 받은 요청을 기록한다.

```js
test('요청은 POST, 리디렉트를 따라가지 않고, 헤더가 정해진 대로다', async () => {
  // method 'POST', redirect 'manual', signal 있음
  // headers: Authorization 이 'vapid t=' 로 시작, 'Content-Encoding' === 'aes128gcm', TTL === '3600', Urgency === 'high', Topic === 'abcDEF_-123'
  // body 를 구독 개인키로 풀면 payload 와 같다
});
test('topic 이 형식에 맞지 않으면 Topic 헤더를 넣지 않는다', async () => { /* 'a b', 33자 */ });
test('응답 상태를 결과로 나눈다', async () => {
  // 201→SENT/2xx, 404→GONE/404/410, 410→GONE, 429→RETRY/4xx, 500→RETRY/5xx, 503→RETRY/5xx,
  // 400→REJECTED/4xx, 403→REJECTED/4xx, 413→REJECTED/4xx, 301→REJECTED/4xx
});
test('fetch 가 던지거나 시간 초과면 RETRY/network 이고 예외가 새지 않는다', async () => {});
test('허용 목록 밖 endpoint 나 틀린 구독 키는 fetch 를 부르지 않고 REJECTED 다', async () => { /* 호출 수 0 */ });
test('결과 객체에는 outcome 과 statusClass 뿐이다', async () => { /* Object.keys 정렬 비교 */ });
```

- [ ] **Step 10: 실패 확인, `src/push/send.js`와 `src/push/index.js` 구현, 통과 확인**
- [ ] **Step 11: `src/push/AGENTS.md`를 쓴다.** 다른 폴더의 `AGENTS.md`와 같은 틀(맡는 것, 맡지 않는 것, 항상 지켜야 하는 것). 반드시 적을 것: 서버 전용이고 클라이언트에서 불러오지 않는다, 환경변수를 읽지 않는다, 오류와 결과에 키·endpoint·응답 원문을 넣지 않는다, 시험 벡터 테스트를 지우지 않는다, 구분 바이트 `0x02`와 4096바이트 상한.
- [ ] **Step 12: `npm run lint && npm test` 통과 뒤 커밋한다.** `feat(push): 웹 푸시 프로토콜(VAPID, RFC 8291)을 표준 기능으로 구현`

---

### Task 2: 저장 계층 (`kv`, `keys`, `seal`, `limits`, `records`)

**Files:**
- Create: `lib/server/watch/kv.js`, `lib/server/watch/keys.js`, `lib/server/watch/seal.js`, `lib/server/watch/limits.js`, `lib/server/watch/records.js`, `test/watch-fixtures.js`
- Test: `test/watch-kv.test.js`, `test/watch-keys.test.js`, `test/watch-records.test.js`

**Interfaces:**
- Consumes: `src/stay/time.js`(`kstInstantMs`, `addDays`, `KST_OFFSET_MIN`), `src/stay/defaults.js`(`DEFAULTS.stay.maxNights`, `DEFAULTS.stay.deleteAfterDepartureDays`)
- Produces:
  - `kv.js`: `class KvError extends Error { code: 'KV_UNAVAILABLE' | 'KV_COMMAND' }`, `createMemoryKv({ now }) → kv`, `sharedMemoryKv({ now }) → kv`(프로세스에 하나, `globalThis` 심볼에 둔다), `createUpstashKv({ url, token, fetchImpl = globalThis.fetch, timeoutMs = 4000 }) → kv`, `hashFromFlat(flat) → Record<string, string>`
  - `keys.js`: `WATCH_ID_RE`, `WRITE_TOKEN_RE`, `SUB_ID_RE`, `WATCH_KEY_RE`, `watchKeyOf(watchId, secret)`, `ownerHashOf(accountKey, secret)`, `writeHashOf(writeToken)`, `tokenMatches(writeToken, writeHash) → boolean`, `idMatches(a, b) → boolean`(길이를 먼저 보고 `timingSafeEqual`), `rateKeyOf({ bucket, subject }, secret)`, `dedupIdOf({ watchKey, date, time }, secret)`, `topicOf({ watchKey, date, time }, secret) → 32자`, `newSubId() → 22자`, `redisKeys(ns) → { watch(wk), sub(wk), day(wk, date), owner(oh), index(date), rate(rk, window) }`
  - `seal.js`: `sealJson(value, key: Buffer) → string`(`'v1.' + base64url(iv 12 | 암호문 | 태그 16)`), `openJson(sealed, keys: Buffer[]) → object | null`(던지지 않는다)
  - `limits.js`: `WATCH_LIMITS`, `hitRate(ctx, bucket: keyof 창이 있는 항목, subject: string) → Promise<boolean>`(허용이면 `true`)
  - `records.js`:
    - `kstToday(nowMs) → 'YYYY-MM-DD'`, `dayExpiryUnix(date)`, `watchExpiryUnix(expiresOn)`, `capExpiresOn(expiresOn, today)`
    - `DAY_FIELD = { deadlines: 'dl', muted: 'm', confirmed: (t) => 'c:' + t, armed: (t) => 'a:' + t, pushed: (t) => 'p:' + t, closed: (t) => 'k:' + t }`
    - `readWatch(ctx, watchKey) → WatchRecord | null`, `writeWatch(ctx, watchKey, record, { onlyIfAbsent = false } = {}) → Promise<boolean>`
    - `findWatch(ctx, watchId) → { watchKey, watch } | null`, `findWritableWatch(ctx, watchId, writeToken) → { watchKey, watch } | null`
    - `touchExpiry(ctx, watchKey, expiresOn) → void`(구독 키의 만료를 지켜보기와 맞춘다)
    - `readDay(ctx, watchKey, date) → DayRecord | null`, `readDays(ctx, watchKey, dates) → Map<date, DayRecord | null>`(exec 한 번). `DayRecord = { deadlines: string[], confirmed: string[], armed: Record<string, string>, pushed: string[], closed: string[], muted: boolean }`
    - `replaceDays(ctx, watchKey, days: Array<{ date, deadlines: string[] }>) → { removedMessageIds: string[], changed: number }`
    - `setDayField(ctx, watchKey, date, field, value) → void`(`HSET` + `EXPIREAT`), `claimDayField(ctx, watchKey, date, field) → boolean`(`HSETNX`가 1이면 `true`, 같은 exec에서 `EXPIREAT`), `clearDayField(ctx, watchKey, date, field) → void`
    - `readSub(ctx, watchKey) → { subId, endpoint, p256dh, auth, lang } | null`(봉인을 못 풀면 `null`), `writeSub(ctx, watchKey, sub, expiresOn) → void`, `deleteSub(ctx, watchKey) → void`
    - `addOwnerWatch(ctx, ownerHash, watchKey) → void`, `ownerWatchKeys(ctx, ownerHash) → string[]`(지켜보기 레코드가 사라진 키는 걸러 내고 집합에서도 뺀다)
    - `indexMembers(ctx, date) → string[]`, `dropIndexMember(ctx, date, watchKey) → void`
    - `deleteWatchData(ctx, watchKey, watch) → { messageIds: string[] }`
  - `test/watch-fixtures.js`: `SECRET`(48자), `SEAL_KEY`(32바이트 Buffer), `IDS = { watchId, writeToken, accountKey, otherAccountKey }`(형식에 맞는 고정 문자열), `fixedClock(iso) → { now(), set(iso), advanceMin(n) }`, `subscriptionFixture() → { subscription: { endpoint, p256dh, auth }, privateKey: Buffer }`(실제 P-256 키 쌍), `testCtx({ at = '2026-11-20T03:00:00Z' } = {}) → ctx`. `testCtx`의 `scheduler`는 `{ calls: [], cancelled: [], fail: false, schedule, cancel }` 기록기(`fail`이 참이면 `{ ok: false }`, 아니면 `{ ok: true, messageId: 'm' + 순번 }`), `push`는 `{ sent: [], outcome: 'SENT', send }` 기록기, `clock`도 함께 돌려준다(`ctx.clock`).

정한 값:
- HMAC은 모두 `HMAC-SHA256(secret, '<문맥>\n' + 값들을 '\n'으로 이은 것)`의 base64url이다. 문맥: `watch/v1`, `watch-owner/v1`, `rate/v1`, `dedup/v1`, `topic/v1`. `topicOf`는 앞 24바이트만 base64url로(32자).
- `WATCH_LIMITS`:

```js
export const WATCH_LIMITS = Object.freeze({
  create: { limit: 10, windowSec: 3600 },     // 세션(계정)당
  deadlines: { limit: 60, windowSec: 3600 },  // 지켜보기당
  back: { limit: 50, windowSec: 86400 },
  subscribe: { limit: 10, windowSec: 3600 },
  status: { limit: 120, windowSec: 3600 },
  mute: { limit: 30, windowSec: 3600 },
  push: { limit: 20, windowSec: 86400 },
  maxWatchesPerOwner: 3,
  maxRegistrations: 5,
  maxDays: 46,
  maxDeadlinesPerDay: 10,
});
```

- `hitRate`: 키 `keys.rate(rateKeyOf({ bucket, subject }, ctx.secret), floor(now / (windowSec * 1000)))`. `exec([['INCR', key], ['EXPIRE', key, windowSec + 60]])`. 첫 결과가 `limit` 이하면 `true`.
- 메모리 구현이 받는 명령(이 밖의 명령은 `KvError('KV_COMMAND')`): `GET`, `SET key value [NX] [EXAT 초]`, `DEL k…`, `EXISTS k`, `EXPIRE k 초`, `EXPIREAT k 초`, `INCR k`, `HSET k f v [f v …]`, `HSETNX k f v`, `HDEL k f…`, `HGETALL k`, `SADD k m…`, `SREM k m…`, `SMEMBERS k`. 반환 모양은 Redis와 같게 한다(`SET` 성공 `'OK'`, `NX` 실패 `null`, `HGETALL`은 `[필드, 값, …]` 평면 배열, 없는 키의 `HGETALL`·`SMEMBERS`는 `[]`, `HSETNX`·`EXISTS`는 0 또는 1). 만료는 `now()`와 비교해 읽을 때 지운다.
- Upstash 구현: 명령이 하나면 `POST <url>` 본문 `["CMD", …]`, 둘 이상이면 `POST <url>/multi-exec` 본문 `[[…], […]]`. 헤더 `Authorization: Bearer <token>`. 응답의 `result`를 차례대로 돌려준다. HTTP 실패·시간 초과는 `KvError('KV_UNAVAILABLE')`, 응답 안의 `error`는 `KvError('KV_COMMAND')`. **`/multi-exec`의 응답 모양과 `HGETALL`의 반환 모양은 Upstash 공식 문서로 확인하고 근거 주소를 주석에 남긴다.** 문서의 모양이 위와 다르면 Upstash 구현 안에서 위 모양으로 맞춘다.
- `replaceDays` 규칙: 날짜마다 지금 해시를 읽는다(exec 한 번에 모두). 새 목록이 비었으면 그 날짜 키를 지우고 색인에서 뺀다. 새 목록이 지금 `dl`과 같으면 아무것도 쓰지 않는다. 다르면 `dl`을 바꾸고, 새 목록에 없는 시각의 `c:`·`a:`·`p:`·`k:` 필드를 지우고, `EXPIREAT`, 색인 `SADD` + `EXPIREAT`. 지운 `a:` 필드의 값(메시지 id)을 `removedMessageIds`로 돌려준다. `m` 필드는 건드리지 않는다.
- `deleteWatchData`: 어제(KST)부터 `watch.expiresOn`까지의 날짜 키를 읽어 `a:` 값들을 모으고, 지켜보기·구독·날짜 키를 지우고, 각 날짜 색인과 소유 집합에서 뺀다.

- [ ] **Step 1: `test/watch-fixtures.js`와 `test/watch-kv.test.js`를 쓴다**

```js
test('메모리: SET NX 는 처음만 OK 이고 두 번째는 null 이다', async () => {});
test('메모리: EXAT 가 지나면 GET 이 null 이고 EXISTS 가 0 이다', async () => { /* clock.advanceMin */ });
test('메모리: HSETNX 는 처음 1, 다음 0 이고 값은 처음 것이다', async () => {});
test('메모리: HGETALL 은 평면 배열이고 hashFromFlat 이 객체로 바꾼다', async () => {});
test('메모리: 모르는 명령은 KV_COMMAND 를 던진다', async () => { /* ['KEYS', '*'] */ });
test('메모리: exec 는 결과를 명령 순서대로 돌려준다', async () => {});
test('Upstash: 명령 하나는 기본 주소로, 여러 개는 /multi-exec 로 보낸다', async () => {
  // 가짜 fetch 가 받은 url, method 'POST', headers.Authorization === 'Bearer tok', JSON 본문을 검사
});
test('Upstash: 응답의 result 를 순서대로 돌려준다', async () => {});
test('Upstash: HTTP 500 과 fetch 예외는 KV_UNAVAILABLE, 응답 안의 error 는 KV_COMMAND 다', async () => {});
test('Upstash: 오류 메시지와 속성에 주소·토큰·명령이 없다', async () => { /* JSON.stringify(err) + err.message 에 'tok', 'upstash.example', 'SET' 이 없다 */ });
```

- [ ] **Step 2: 실패 확인, `kv.js` 구현, 통과 확인**
- [ ] **Step 3: `test/watch-keys.test.js`를 쓴다** (keys, seal, limits)

```js
test('같은 입력은 같은 키, 문맥이 다르면 다른 값이다', () => { /* watchKeyOf(x, s) !== ownerHashOf(x, s), 43자 */ });
test('비밀이 다르면 키도 다르다', () => {});
test('값 경계가 섞이지 않는다', () => { /* dedupIdOf({watchKey:'a', date:'b\nc', time:'d'}) !== dedupIdOf({watchKey:'a\nb', date:'c', time:'d'}) 는 형식 검증 뒤라 생기지 않지만, rateKeyOf({bucket:'ab', subject:'c'}) !== rateKeyOf({bucket:'a', subject:'bc'}) */ });
test('topicOf 는 32자 base64url 이다', () => {});
test('tokenMatches 는 맞는 토큰만 참이고 길이가 달라도 던지지 않는다', () => {});
test('redisKeys 는 환경 이름을 접두사에 넣는다', () => { /* redisKeys('prev').day('K', '2026-11-20') === 'sh:prev:d:K:2026-11-20' */ });
test('봉인을 풀면 원래 값이고, 한 글자라도 바뀌면 null 이다', () => {});
test('이전 키로 봉인한 값도 열린다', () => { /* openJson(sealed, [newKey, oldKey]) */ });
test('키가 틀리거나 형식이 아니면 null 이고 던지지 않는다', () => { /* '', 'v1.', 'v2.abc', 42 */ });
test('hitRate 는 한도까지 참, 그다음은 거짓이고 창이 바뀌면 다시 참이다', async () => { /* subscribe 한도 10: 10번 true, 11번째 false, clock.advanceMin(61) 뒤 true */ });
test('hitRate 키에 주체가 그대로 들어가지 않는다', async () => { /* kv 에 쌓인 키 문자열에 subject 가 없다 */ });
```

- [ ] **Step 4: 실패 확인, `keys.js`·`seal.js`·`limits.js` 구현, 통과 확인**
- [ ] **Step 5: `test/watch-records.test.js`를 쓴다**

```js
test('만료 계산: 날짜 기록은 날짜 끝 + 1일, 지켜보기는 출국일 끝 + 7일이다', () => {
  assert.equal(dayExpiryUnix('2026-11-20'), Date.parse('2026-11-21T15:00:00Z') / 1000);
  assert.equal(watchExpiryUnix('2026-11-20'), Date.parse('2026-11-27T15:00:00Z') / 1000);
});
test('capExpiresOn 은 오늘 + 46일을 넘기지 않는다', () => {
  assert.equal(capExpiresOn('2027-12-31', '2026-11-20'), '2027-01-05');
  assert.equal(capExpiresOn('2026-11-25', '2026-11-20'), '2026-11-25');
});
test('kstToday 는 KST 날짜다', () => { /* 2026-11-20T15:30:00Z → '2026-11-21' */ });
test('writeWatch onlyIfAbsent 는 이미 있으면 false 이고 덮어쓰지 않는다', async () => {});
test('지켜보기는 만료 시각이 지나면 읽히지 않는다', async () => {});
test('findWritableWatch 는 토큰이 틀리면 null 이다', async () => {});
test('replaceDays: 새 날짜는 마감을 저장하고 색인에 넣는다', async () => {});
test('replaceDays: 같은 목록을 다시 올리면 changed 가 0 이고 확인·예약·보냄 표시가 그대로다', async () => {});
test('replaceDays: 빠진 시각의 표시를 지우고 그 예약 메시지 id 를 돌려준다', async () => {
  // 14:30, 18:00 저장 → a:14:30 = 'm1', c:14:30, p:18:00 설정 → 18:00 만 다시 올림
  // removedMessageIds === ['m1'], confirmed === [], pushed === ['18:00']
});
test('replaceDays: 빈 목록이면 날짜 기록과 색인 항목을 지운다', async () => {});
test('replaceDays: m 표시는 남는다', async () => {});
test('claimDayField 는 처음만 true 다', async () => {});
test('자정 경계: 23:55 마감의 날짜 기록은 다음 날 00:05 에도 읽힌다', async () => { /* clock.set('2026-11-20T15:05:00Z') */ });
test('구독은 봉인되어 저장된다', async () => { /* kv 의 원문 문자열에 endpoint, p256dh, auth 가 없다. readSub 는 원래 값을 돌려준다 */ });
test('봉인 키가 바뀌어 못 푸는 구독은 null 이다', async () => {});
test('ownerWatchKeys 는 사라진 지켜보기를 걸러 내고 집합에서도 뺀다', async () => {});
test('deleteWatchData 는 지켜보기·구독·날짜 기록·색인·소유 집합을 지우고 예약 메시지 id 를 돌려준다', async () => {});
```

- [ ] **Step 6: 실패 확인, `records.js` 구현, 통과 확인**
- [ ] **Step 7: `npm run lint && npm test` 통과 뒤 커밋한다.** `feat(watch): 서버 알림 저장 계층(kv 어댑터, 키 유도, 구독 봉인, 횟수 제한, 레코드)`

---

### Task 3: 설정, 스위치, 오류 코드, 기본값

**Files:**
- Create: `lib/server/watch/config.js`, `scripts/generate-push-secrets.mjs`
- Modify: `lib/server/runtime-flags.js`, `src/stay/errorCodes.js`, `src/stay/defaults.js`(`notifications`), `app/api/health/route.js`, `.env.example`, `test/kill-switch.test.js`(스위치 목록을 고정한 단언)
- Test: `test/watch-config.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `runtime-flags.js`: `SERVER_PUSH_SWITCH = 'SAFEHOUR_SERVER_PUSH'`, `SERVER_PUSH_KILL_SWITCH = 'SAFEHOUR_KILL_SERVER_PUSH'`, `isServerPushSwitchOn(env = process.env)`(정확히 `'1'`), `isServerPushKilled(env = process.env)`(느슨하게), `runtimeFlagsSnapshot()`이 `{ recommendationKilled, serverPush, serverPushKilled }`를 돌려준다
  - `errorCodes.js`: `ERROR_CODE.SERVER_PUSH_OFF = 'SAFEHOUR_SERVER_PUSH_OFF'`(503), `ERROR_CODE.SERVER_PUSH_UNAVAILABLE = 'SAFEHOUR_SERVER_PUSH_UNAVAILABLE'`(503), `ERROR_CODE.WATCH_NOT_FOUND = 'SAFEHOUR_WATCH_NOT_FOUND'`(404), `ERROR_CODE.RATE_LIMITED = 'SAFEHOUR_RATE_LIMITED'`(429)
  - `defaults.js`: `DEFAULTS.notifications.serverPushGraceMin = 10`
  - `config.js`: `watchConfig(env = process.env) → WatchConfig`

```js
// WatchConfig
{
  switchOn, killed, ready, enabled,   // enabled = switchOn && !killed && ready
  missing,                            // string[]  없거나 형식이 틀린 환경변수 이름 (값은 담지 않는다)
  namespace,                          // 'prod' | 'prev' | 'dev'  (VERCEL_ENV: production → prod, preview → prev, 그 밖 → dev)
  demo,                               // SAFEHOUR_ALLOW_DEMO_LOGIN === '1'
  store,                              // { mode: 'upstash', url, token } | { mode: 'memory' } | null
  qstash,                             // { url, token, currentSigningKey, nextSigningKey } | null
  vapid,                              // { publicKey, privateKey, subject } | null
  sealKeys,                           // Buffer[]  [현재, 이전?]
  ownerSecret, cronSecret,            // string | null
  baseUrl,                            // string | null  끝 슬래시 없음
  protectionBypass,                   // string | null  (VERCEL_AUTOMATION_BYPASS_SECRET)
  guardianLoginRequired,              // SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN === '1' 이면 false, 아니면 true
  testOrigin,                         // demo 일 때만 SAFEHOUR_PUSH_TEST_ORIGIN, 아니면 null
}
```

정한 값:
- 저장소: `UPSTASH_REDIS_REST_URL`·`UPSTASH_REDIS_REST_TOKEN`을 먼저, 없으면 `KV_REST_API_URL`·`KV_REST_API_TOKEN`을 읽는다. 주소는 `https:`여야 한다. `SAFEHOUR_STORE_MODE === 'memory'`이고 `demo`이면 `{ mode: 'memory' }`(Upstash 값이 있어도 메모리가 이긴다). 데모가 아닌데 `memory`면 무시한다.
- QStash: `QSTASH_URL`(없으면 `https://qstash.upstash.io`), `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`. 셋 중 하나라도 없으면 `null`.
- VAPID: `SAFEHOUR_VAPID_PUBLIC_KEY`(base64url로 풀어 65바이트, 첫 바이트 `0x04`), `SAFEHOUR_VAPID_PRIVATE_KEY`(32바이트), `SAFEHOUR_VAPID_SUBJECT`(`mailto:` 또는 `https:`).
- 봉인 키: `SAFEHOUR_PUSH_STORE_KEY`(base64url로 풀어 정확히 32바이트), 선택 `SAFEHOUR_PUSH_STORE_KEY_PREVIOUS`(같은 형식, 틀리면 무시).
- `SAFEHOUR_WATCH_OWNER_SECRET`: 32자 이상. `CRON_SECRET`: 16자 이상.
- `baseUrl`: `SAFEHOUR_PUBLIC_BASE_URL`(`https:`만, 데모에서는 `http://localhost`·`http://127.0.0.1`도) → 운영이면 `https://` + `VERCEL_PROJECT_PRODUCTION_URL` → 그 밖이면 `https://` + (`VERCEL_BRANCH_URL` 또는 `VERCEL_URL`) → `null`. **Vercel 시스템 환경변수 이름은 공식 문서로 확인하고 근거 주소를 주석에 남긴다.**
- `ready`: 저장소가 있고, VAPID·봉인 키·소유 비밀·`CRON_SECRET`이 있고, (메모리 모드이거나 QStash와 `baseUrl`이 있다). 빠진 것의 정본 이름을 `missing`에 넣는다(저장소는 `UPSTASH_REDIS_REST_URL`·`UPSTASH_REDIS_REST_TOKEN`).
- `/api/health`의 `config`에 `serverPushReady: boolean`, `serverPushMissing: string[]`을 더한다. 값은 담지 않는다.
- `scripts/generate-push-secrets.mjs`: `generateKeyPairSync('ec', { namedCurve: 'prime256v1' })`로 키 쌍을 만들고 표준 출력에 `SAFEHOUR_VAPID_PUBLIC_KEY=…`, `SAFEHOUR_VAPID_PRIVATE_KEY=…`, `SAFEHOUR_PUSH_STORE_KEY=…`(32바이트), `SAFEHOUR_WATCH_OWNER_SECRET=…`(32바이트), `CRON_SECRET=…`(32바이트)를 한 줄씩 낸다. 파일을 쓰지 않고 네트워크를 쓰지 않는다. 머리 주석에 "운영과 미리보기에 서로 다른 값을 쓴다, 출력은 비밀번호 관리자에만 옮긴다, 저장소에 커밋하지 않는다"를 적는다.
- `.env.example`: 위 환경변수 전부를 이름·용도·기본 동작·없을 때 동작과 함께 적는다(기존 항목의 글투를 따른다). `SAFEHOUR_SERVER_PUSH`는 켜는 스위치, `SAFEHOUR_KILL_SERVER_PUSH`는 끄는 스위치라는 것, `SAFEHOUR_STORE_MODE`와 `SAFEHOUR_PUSH_TEST_ORIGIN`은 데모 로그인일 때만 듣는다는 것을 적는다.
- `defaults.js`의 새 값 주석: `/** 서버 푸시 유예(분): 복귀 마감 뒤 이만큼 지나도록 확인이 없으면 보호자에게 보낸다. 사람 검토 전 임시값 (ADR-0012 결정 6) */`

- [ ] **Step 1: 테스트를 쓴다** (`test/watch-config.test.js`). 유효한 환경 묶음 `FULL`을 테스트 안에서 만든다(VAPID 키는 `generateKeyPairSync`로).

```js
test('스위치: SAFEHOUR_SERVER_PUSH 는 정확히 "1" 일 때만 켜진다', () => { /* '1' true, 'true'·'on'·' 1'·'' false */ });
test('스위치: SAFEHOUR_KILL_SERVER_PUSH 는 1·true·on 을 켜짐으로 읽는다', () => { /* ' ON ' true, 'false'·'0' false */ });
test('runtimeFlagsSnapshot 은 세 스위치를 돌려준다', () => {
  assert.deepEqual(Object.keys(runtimeFlagsSnapshot()), ['recommendationKilled', 'serverPush', 'serverPushKilled']);
});
test('모두 갖춰지면 ready 이고 missing 이 비어 있다', () => { /* enabled === true */ });
test('차단 스위치가 켜지면 enabled 가 거짓이다', () => {});
test('빠지거나 형식이 틀린 값은 이름으로 missing 에 들어간다', () => {
  // 하나씩 빼거나 망가뜨린다: VAPID 공개키 64바이트, 개인키 31바이트, subject 'someone@example.com',
  // 봉인 키 31바이트, 소유 비밀 31자, CRON_SECRET 15자, QStash 서명 키 하나 없음, 저장소 주소 http:
});
test('저장소 환경변수는 두 이름을 모두 읽는다', () => { /* KV_REST_API_URL·TOKEN 만 있어도 store.mode === 'upstash' */ });
test('메모리 모드는 데모 로그인일 때만 듣는다', () => {
  // SAFEHOUR_STORE_MODE=memory + SAFEHOUR_ALLOW_DEMO_LOGIN=1 → store.mode 'memory', QStash·baseUrl 없이도 ready
  // 데모가 아니면 store === null (Upstash 값도 없을 때)
});
test('testOrigin 은 데모 로그인일 때만 읽는다', () => {});
test('namespace 는 VERCEL_ENV 를 따른다', () => { /* production→prod, preview→prev, 없음→dev */ });
test('baseUrl 순서: 명시 값, 운영 주소, 미리보기 주소', () => {});
test('guardianLoginRequired 는 기본이 참이고 "1" 일 때만 거짓이다', () => {});
test('오류 코드와 상태', () => {
  assert.equal(ERROR_HTTP_STATUS[ERROR_CODE.SERVER_PUSH_OFF], 503);
  assert.equal(ERROR_HTTP_STATUS[ERROR_CODE.SERVER_PUSH_UNAVAILABLE], 503);
  assert.equal(ERROR_HTTP_STATUS[ERROR_CODE.WATCH_NOT_FOUND], 404);
  assert.equal(ERROR_HTTP_STATUS[ERROR_CODE.RATE_LIMITED], 429);
});
test('서버 푸시 유예 기본값은 10분이다', () => { assert.equal(DEFAULTS.notifications.serverPushGraceMin, 10); });
test('헬스 응답은 준비 여부와 빠진 이름만 알리고 값을 담지 않는다', async () => {
  // process.env 를 잠시 FULL 로 바꾸고 GET() 호출. JSON 문자열에 비밀 값이 하나도 없다. config.serverPushReady === true
});
test('generate-push-secrets 는 형식에 맞는 값을 낸다', () => {
  // execFileSync(process.execPath, ['scripts/generate-push-secrets.mjs']) 출력을 줄별로 읽어 watchConfig 에 넣으면 VAPID·봉인 키·소유 비밀·CRON_SECRET 이 missing 에 없다
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현한다.** `test/kill-switch.test.js`의 스위치 목록 단언(`['recommendationKilled']`)은 새 목록으로 고친다(의도한 변경).
- [ ] **Step 4: 통과 확인, `npm run lint && npm test`**
- [ ] **Step 5: 커밋한다.** `feat(watch): 서버 알림 설정·스위치·오류 코드·유예 기본값, 비밀 생성 스크립트`. 본문에 "kill-switch 테스트의 스위치 목록 단언을 새 스위치 둘을 더한 목록으로 고쳤다"를 적는다.

---

### Task 4: 예약 어댑터 (`scheduler.js`)

**Files:**
- Create: `lib/server/watch/scheduler.js`
- Test: `test/watch-scheduler.test.js`

**Interfaces:**
- Consumes: 없음 (`node:crypto`, `fetch`)
- Produces:
  - `DUE_PATH = '/api/watch/due'`
  - `createQstashScheduler({ url, token, baseUrl, protectionBypass = null, fetchImpl = globalThis.fetch, timeoutMs = 4000 }) → scheduler`
  - `createMemoryScheduler() → scheduler & { messages: Array<{ messageId, body, notBeforeMs, dedupId }> }`, `sharedMemoryScheduler()`(프로세스에 하나)
  - `verifyQstashSignature({ signature, rawBody, currentKey, nextKey, nowMs, path = DUE_PATH }) → boolean`(던지지 않는다)
  - `scheduler.schedule({ body: object, notBeforeMs: number, dedupId: string }) → Promise<{ ok: true, messageId } | { ok: false }>`, `scheduler.cancel(messageId) → Promise<boolean>`. 둘 다 던지지 않는다.

정한 값 (**QStash 공식 문서로 확인하고 근거 주소를 주석에 남긴다.** 아래는 설계서 11.1의 확인 결과다):
- 발행: `POST <url>/v2/publish/<baseUrl + DUE_PATH>`, 헤더 `Authorization: Bearer <token>`, `Content-Type: application/json`, `Upstash-Not-Before: <유닉스 초>`, `Upstash-Deduplication-Id: <dedupId>`, `Upstash-Retries: 3`. `protectionBypass`가 있으면 `Upstash-Forward-x-vercel-protection-bypass: <값>`(Vercel 배포 보호 우회 헤더 이름도 Vercel 문서로 확인). 응답 JSON의 `messageId`.
- 취소: `DELETE <url>/v2/messages/<messageId>`. 2xx와 404는 `true`(이미 없음), 그 밖과 예외는 `false`.
- 서명: `Upstash-Signature`는 HS256 JWT다. 지금 키 또는 다음 키로 서명이 맞고(`timingSafeEqual`), `iss === 'Upstash'`, `exp`가 지금보다 뒤, `nbf`가 지금 + 60초 이하, `body` 클레임이 원본 본문의 SHA-256(base64url, 끝의 `=`는 떼고 비교), `sub`의 경로가 `path`와 같을 때만 `true`. 머리의 `alg`가 `HS256`이 아니면 `false`.
- `notBeforeMs`는 초로 올림한다(일찍 도착하지 않게).
- 메모리 구현의 `messageId`는 `'mem-' + 순번`. `cancel`은 목록에서 빼고 `true`.

- [ ] **Step 1: 테스트를 쓴다**

```js
test('발행 요청의 주소와 헤더', async () => {
  // url === 'https://qstash.example/v2/publish/https://app.example/api/watch/due'
  // Authorization 'Bearer qtok', Upstash-Not-Before === String(Math.ceil(notBeforeMs / 1000)), Upstash-Deduplication-Id, Upstash-Retries '3'
  // 본문 === JSON.stringify(body). 결과 { ok: true, messageId: 'msg_1' }
});
test('보호 우회 값이 있으면 전달 헤더를 붙이고, 없으면 붙이지 않는다', async () => {});
test('발행 실패(HTTP 500, 예외, messageId 없음)는 { ok: false } 이고 던지지 않는다', async () => {});
test('취소는 DELETE 를 보내고 2xx·404 는 true, 500·예외는 false 다', async () => {});
test('서명: 지금 키로 만든 JWT 는 통과한다', () => { /* 테스트 안에서 HS256 JWT 를 직접 만든다 */ });
test('서명: 다음 키로 만든 JWT 도 통과한다', () => {});
test('서명: 본문이 한 글자라도 다르면 거짓이다', () => {});
test('서명: 만료됐거나, nbf 가 미래이거나, iss 가 다르거나, 경로가 다르면 거짓이다', () => {});
test('서명: alg 가 none 이거나 조각 수가 틀리거나 값이 문자열이 아니면 거짓이고 던지지 않는다', () => {});
test('서명: 다른 키로 만든 JWT 는 거짓이다', () => {});
test('메모리 예약은 메시지를 쌓고 cancel 이 뺀다', async () => {});
test('결과와 예외에 토큰·주소가 없다', async () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(watch): 예약 어댑터(QStash 발행·취소·서명 검증, 메모리 구현)`

---

### Task 5: 보내는 쪽 (문구, 보호자 푸시, 예약 걸기, 예약 처리)

**Files:**
- Create: `lib/server/watch/text.js`, `lib/server/watch/notify.js`, `lib/server/watch/arm.js`, `lib/server/watch/due.js`
- Modify: `src/i18n/messages/notifications.js`(`safety`에 키 셋)
- Test: `test/watch-outbound.test.js`

**Interfaces:**
- Consumes: Task 2(`records.js`, `keys.js`, `limits.js`, `test/watch-fixtures.js`), `src/i18n/index.js`(`safetyPair`, `translate`, `SAFETY_COPY_REVIEWED`), `lib/notify/text.js`(`NOTIFY_TITLE_KEY`)
- Produces:
  - `text.js`: `PUSH_KIND = { OVERDUE, CONFIRMED, DEVICE_CHANGED }`, `PUSH_TEXT_KEY`, `pushPayload(kind, { date, time, lang }, reviewed) → string | null`(JSON `{ title, body, url: '/g', tag }`)
  - `notify.js`: `pushToGuardian(ctx, watchKey, { kind, date, time }) → Promise<{ outcome: 'SENT'|'GONE'|'RETRY'|'REJECTED'|'NO_SUB'|'CAPPED', statusClass?: string }>`, `pushToSubscription(ctx, sub, { kind }) → Promise<{ outcome, statusClass? }>`
  - `arm.js`: `fireAtMs(date, time)`, `lateLimitMs(date, time)`, `armPending(ctx, watchKey, dates: string[]) → Promise<{ armed: number, failed: number }>`, `cancelMessages(ctx, messageIds: string[]) → Promise<void>`(던지지 않는다), `armIndexedDates(ctx, dates: string[]) → Promise<{ watches: number, armed: number, failed: number }>`
  - `due.js`: `DUE_OUTCOME`, `processDue(ctx, { watchKey, date, time }) → Promise<{ outcome: string, retry: boolean, statusClass?: string }>`

정한 값:
- 새 문구 (`safety` 구역, ja·zh는 검수 전 번역):

| 키 | ko | en | ja | zh |
| --- | --- | --- | --- | --- |
| `notifications.serverCompanionOverdue` | 일행의 복귀 마감 {time}이 지났고 아직 복귀 확인이 없어요. 함께 있지 않다면 지금 연락해 보세요 | Your companion's {time} return time has passed, and there's no confirmation yet that they're back. If you're not together, contact them now | お連れの方の戻り期限{time}を過ぎましたが、まだ戻りの確認がありません。一緒にいない場合は、今すぐ連絡してみてください | 同伴的返回截止时间{time}已过，尚未收到返回确认。如果你们不在一起，请立即联系对方 |
| `notifications.serverCompanionConfirmed` | 일행이 {time} 마감 뒤 복귀를 확인했어요 | Your companion confirmed they're back after the {time} return time | お連れの方が{time}の戻り期限のあと、戻りを確認しました | 同伴已在{time}的返回截止时间之后确认返回 |
| `notifications.serverDeviceChanged` | 알림 받는 기기가 바뀌었어요. 직접 바꾼 것이 아니라면 일행에게 알려 주세요 | Alerts now go to a different device. If you didn't change it, let your companion know | 通知を受け取る端末が変わりました。ご自身で変更していない場合は、お連れの方に知らせてください | 接收提醒的设备已更换。如果不是你本人操作，请告知同伴 |

  금지어 검사(`test/notify-schedule.test.js`의 `FORBIDDEN`)에 걸리는 낱말이 있으면 뜻을 지키는 범위에서 그 낱말만 바꾸고 보고에 적는다. '돌아오지 않았어요'처럼 사실을 단정하는 표현으로 바꾸지 않는다.
- 문구 언어는 `safetyPair(lang, reviewed).primary`다(ja·zh는 검수 스위치가 꺼져 있으면 영어). 제목은 `NOTIFY_TITLE_KEY`를 같은 언어로.
- `tag`: `OVERDUE`·`CONFIRMED`는 `'sh-watch-' + date + '-' + time`(확인 알림이 마감 지남 알림을 갈아 끼운다), `DEVICE_CHANGED`는 `'sh-watch-device'`.
- `pushPayload`는 `time`이 `HH:MM`이 아니거나(`DEVICE_CHANGED` 제외) 모르는 `kind`면 `null`.
- `pushToGuardian`: 구독이 없으면 `NO_SUB`. `hitRate(ctx, 'push', watchKey)`가 거짓이면 `CAPPED`. `ctx.push.send({ subscription, payload, topic: topicOf(…) })`. 결과가 `GONE`이면 `deleteSub`. `DEVICE_CHANGED`는 `pushToSubscription`으로만 보낸다(횟수 제한 없음, 결과로 아무것도 지우지 않는다, Topic 없음).
- `armPending`: 날짜마다 `readDay`. 각 마감 `t`에 대해 `armed[t]`가 있거나 `pushed`에 있거나 `now >= lateLimitMs(date, t)`이면 건너뛴다. 아니면 `scheduler.schedule({ body: { k: watchKey, d: date, t }, notBeforeMs: max(fireAtMs(date, t), now), dedupId: dedupIdOf({ watchKey, date, time: t }, secret) + '.' + randomBytes(6).toString('base64url') })`. 중복 제거 id 끝에 예약마다 무작위 꼬리를 붙인다(QStash 중복 제거는 취소한 메시지에도 10분 걸려, 뺐다가 다시 넣은 마감의 새 예약이 삼켜질 수 있다). 성공하면 `setDayField(… DAY_FIELD.armed(t), messageId)`. 실패하면 `failed`를 센다(다음 업로드나 하루 1회 예약이 다시 건다).
- `armIndexedDates`: 날짜마다 `indexMembers`. 날짜 기록이 없는 `watchKey`는 `dropIndexMember`. 있으면 `armPending`. 한 지켜보기의 오류가 나머지를 막지 않는다(`KvError`는 그대로 던진다).
- `processDue` 판정표 (위에서부터, 처음 맞는 줄이 결과다):

| 조건 | outcome | retry |
| --- | --- | --- |
| `ctx.enabled`가 거짓 | `SKIP_OFF` | false |
| 지켜보기 없음 | `SKIP_NO_WATCH` | false |
| 날짜 기록이 없거나 `time`이 `deadlines`에 없음 | `SKIP_CHANGED` | false |
| `confirmed`에 있음 | `SKIP_CONFIRMED` | false |
| `muted` | `SKIP_MUTED` | false |
| `now < fireAtMs − 30초` | `SKIP_EARLY` | false |
| `now >= lateLimitMs` | `SKIP_LATE` | false |
| 구독 없음 | `SKIP_NO_SUB` | false |
| `claimDayField(pushed)`가 거짓 | `SKIP_DUP` | false |
| `pushToGuardian` → `SENT` | `SENT` | false |
| → `CAPPED` | `SKIP_CAP` | false |
| → `GONE` | `SUB_GONE` | false |
| → `NO_SUB` | `SKIP_NO_SUB` | false |
| → `RETRY` | `RETRY` (그 전에 `clearDayField(pushed)`) | true |
| → `REJECTED` | `SEND_REJECTED` | false |

- [ ] **Step 1: 테스트를 쓴다** (`test/watch-outbound.test.js`). 준비 도우미 `seed(ctx, { deadlines, sub })`를 테스트 파일 안에 둔다(지켜보기 레코드, 오늘 날짜 기록, 구독을 `records.js`로 넣는다).

```js
// 문구
test('문구: 넣는 값은 {time} 하나이고 자리표시자가 남지 않는다', () => { /* 4개 언어 × OVERDUE·CONFIRMED */ });
test('문구: ja·zh 는 검수 전이면 영어로, 검수 뒤면 그 언어로 나간다', () => {});
test('문구: 새 키 셋 모두 4개 언어 값이 있고 serverDeviceChanged 에는 자리표시자가 없다', () => {});
test('문구: payload 는 title·body·url·tag 뿐이고 url 은 /g 다', () => { /* Object.keys(JSON.parse(p)).sort() */ });
test('문구: 모르는 kind, 형식이 틀린 시각은 null 이다', () => {});
test('문구: 마감 지남 문구는 "확인이 없어요"라고 쓰고 단정하지 않는다', () => { /* ko 본문에 '복귀 확인이 없어요' 포함, '돌아오지 않' 미포함 */ });
// 보호자 푸시
test('pushToGuardian: 구독이 없으면 NO_SUB 이고 보내지 않는다', async () => {});
test('pushToGuardian: 보낸 payload 의 언어는 구독의 lang 을 따른다', async () => {});
test('pushToGuardian: GONE 이면 구독을 지운다', async () => {});
test('pushToGuardian: 하루 20건을 넘으면 CAPPED 다', async () => {});
test('pushToGuardian: topic 은 32자이고 날짜·시각이 그대로 들어 있지 않다', async () => {});
// 예약 걸기
test('armPending: 마감 + 10분에 예약을 걸고 메시지 id 를 기록한다', async () => {
  // 12:00 KST, 마감 14:30 → notBeforeMs === Date.parse('2026-11-20T05:40:00Z'), body { k, d: '2026-11-20', t: '14:30' }
});
test('armPending: 이미 건 시각은 다시 걸지 않는다', async () => { /* 두 번 불러도 scheduler.calls.length === 1 */ });
test('armPending: 보낼 시각이 지났어도 늦은 한도 안이면 지금으로 건다', async () => { /* 14:45, 마감 14:30 → notBeforeMs === now */ });
test('armPending: 마감 + 60분이 지났으면 걸지 않는다', async () => {});
test('armPending: 예약 실패는 failed 로 세고 기록하지 않아 다음에 다시 건다', async () => {});
test('armPending: 자정 경계, 23:55 마감은 다음 날 00:05 에 건다', async () => { /* notBeforeMs === Date.parse('2026-11-20T15:05:00Z') */ });
test('armIndexedDates: 색인의 지켜보기를 돌며 걸고, 날짜 기록이 없는 항목은 색인에서 뺀다', async () => {});
test('cancelMessages 는 예약 업체가 실패해도 던지지 않는다', async () => {});
// 예약 처리
test('processDue: 확인이 없으면 한 번 보낸다', async () => { /* 14:40 KST, outcome SENT, push.sent.length === 1 */ });
test('processDue: 같은 예약이 두 번 와도 한 번만 보낸다', async () => { /* 둘째는 SKIP_DUP */ });
test('processDue: 동시에 두 번 불러도 한 번만 보낸다', async () => { /* Promise.all 두 개, sent.length === 1 */ });
test('processDue: 판정표의 건너뛰기', async () => {
  // SKIP_OFF(enabled false), SKIP_NO_WATCH, SKIP_CHANGED(마감이 빠짐), SKIP_CONFIRMED, SKIP_MUTED,
  // SKIP_EARLY(14:39:00), SKIP_LATE(15:30), SKIP_NO_SUB. 모두 push.sent.length === 0 이고 retry false
});
test('processDue: 마감 + 9분 30초부터는 보낸다', async () => {});
test('processDue: 푸시 서비스가 RETRY 면 권리를 돌려놓고 retry 가 참이다. 다시 부르면 보낸다', async () => {});
test('processDue: GONE 이면 구독을 지우고 다시 부르지 않게 한다', async () => { /* SUB_GONE, retry false */ });
test('processDue: REJECTED 는 다시 부르지 않는다', async () => {});
test('processDue: 다시 올린 뒤 빠진 마감의 예약이 늦게 와도 보내지 않는다', async () => { /* replaceDays 로 14:30 제거 뒤 호출 → SKIP_CHANGED */ });
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인**
- [ ] **Step 3: `npm run lint && npm test`** (금지어 검사가 새 문구를 함께 본다)
- [ ] **Step 4: 커밋한다.** `feat(watch): 서버 푸시 문구, 보호자 푸시, 예약 걸기, 예약 처리 판정표`

---

### Task 6: 환자 쪽 동작 (`patient.js`)

**Files:**
- Create: `lib/server/watch/patient.js`
- Test: `test/watch-patient.test.js`

**Interfaces:**
- Consumes: Task 2(`records.js`, `keys.js`, `limits.js`), Task 5(`armPending`, `cancelMessages`, `fireAtMs`, `pushToGuardian`, `PUSH_KIND`)
- Produces:
  - `registerWatch(ctx, { accountKey, watchId, writeToken, expiresOn }) → Result & { expiresOn }`
  - `putDeadlines(ctx, { watchId, writeToken, expiresOn, days, accountKey = null }) → Result & { expiresOn }`
  - `markBack(ctx, { watchId, writeToken, date, by, undo = false }) → Result & { recorded: boolean }`
  - `deleteWatch(ctx, { watchId, writeToken }) → Result`
  - `deleteOwnedWatches(ctx, { accountKey }) → Result & { deleted: number }`

규칙:
- **registerWatch**
  1. `hitRate(ctx, 'create', accountKey)`가 거짓이면 `RATE_LIMITED`.
  2. `expiresOn`이 오늘(KST)보다 앞이면 `BAD_REQUEST`. `capped = capExpiresOn(expiresOn, today)`.
  3. 이미 있는 `watchId`: 저장된 `ownerHash`가 이 계정 것과 다르면 `NOT_FOUND`. 같고 `registrations >= maxRegistrations`면 `RATE_LIMITED`. 아니면 `writeHash`·`expiresOn`을 바꾸고 `registrations + 1`.
  4. 새 `watchId`: `ownerWatchKeys`가 `maxWatchesPerOwner` 이상이면 `RATE_LIMITED`. `writeWatch(…, { onlyIfAbsent: true })`, `registrations: 0`. `false`가 돌아오면(동시에 만들어짐) 한 번 다시 읽어 3번 규칙을 적용한다.
  5. `addOwnerWatch`, `touchExpiry`. `{ ok: true, expiresOn: capped }`.
- **putDeadlines**
  1. `hitRate(ctx, 'deadlines', watchKey)`. `findWritableWatch`가 없으면 `NOT_FOUND`. `accountKey`가 있고 `ownerHash`가 다르면 `NOT_FOUND`.
  2. `expiresOn`이 오늘보다 앞이면 `BAD_REQUEST`. `capped`가 저장된 값과 다르면 `writeWatch`(다른 필드는 그대로) + `touchExpiry`.
  3. `days` 중 `today <= date <= capped`인 것만 `replaceDays`에 넘긴다. 범위 밖 날짜는 조용히 버린다.
  4. `cancelMessages(removedMessageIds)`, 그리고 `armPending(ctx, watchKey, [today, today + 1].filter((d) => d <= capped))`.
  5. `{ ok: true, expiresOn: capped }`. 예약 실패는 응답을 바꾸지 않는다.
- **markBack**
  1. `hitRate(ctx, 'back', watchKey)`. `findWritableWatch`가 없으면 `NOT_FOUND`.
  2. `date`가 오늘이나 어제(KST)가 아니거나, 그 날짜 기록의 `deadlines`에 `by`가 없으면 `{ ok: true, recorded: false }`.
  3. `undo`가 아니면: `setDayField(confirmed(by), '1')`. 그 시각이 `pushed`에 있고 `claimDayField(closed(by))`가 참이면 `pushToGuardian(… { kind: CONFIRMED, date, time: by })`를 한 번 부른다(결과와 무관하게 성공). `{ ok: true, recorded: true }`.
  4. `undo`이면: `now >= fireAtMs(date, by)`이면 `{ ok: true, recorded: false }`. 아니면 `clearDayField(confirmed(by))`, `{ ok: true, recorded: true }`.
- **deleteWatch**: `findWritableWatch`가 없으면 `NOT_FOUND`. `deleteWatchData` 뒤 `cancelMessages`. `ctx.enabled`와 무관하게 동작한다.
- **deleteOwnedWatches**: `ownerWatchKeys`의 각 키를 읽어 `ownerHash`가 같은 것만 `deleteWatchData` + `cancelMessages`. `{ ok: true, deleted }`.

- [ ] **Step 1: 테스트를 쓴다**

```js
// 등록
test('등록: 새 id 는 레코드를 만들고 원래 토큰은 저장되지 않는다', async () => { /* kv 원문 전체에 writeToken, watchId, accountKey 문자열이 없다 */ });
test('등록: 출국일은 오늘 + 46일로 깎인다', async () => { /* expiresOn '2027-12-31' → '2027-01-05' */ });
test('등록: 지난 출국일은 BAD_REQUEST 다', async () => {});
test('등록: 같은 계정이 다시 등록하면 토큰이 바뀌고 이전 토큰은 통하지 않는다', async () => {});
test('등록: 다른 계정이 같은 id 를 등록하면 NOT_FOUND 이고 레코드가 바뀌지 않는다', async () => {});
test('등록: 다시 등록은 5회까지이고 6번째는 RATE_LIMITED 다', async () => {});
test('등록: 한 계정의 살아 있는 지켜보기는 3개까지다', async () => {});
test('등록: 시간당 10회를 넘으면 RATE_LIMITED 다', async () => {});
// 마감
test('마감: 토큰이 틀리거나 모르는 id 는 같은 NOT_FOUND 다', async () => { /* 두 결과 deepEqual */ });
test('마감: 세션 계정이 소유자와 다르면 NOT_FOUND 다', async () => {});
test('마감: 오늘·내일 것만 예약하고 그 뒤 날짜는 저장만 한다', async () => { /* 3일치 올림 → scheduler.calls 의 d 가 오늘·내일뿐 */ });
test('마감: 지난 날짜와 출국일 뒤 날짜는 버린다', async () => {});
test('마감: 같은 내용을 다시 올려도 예약이 늘지 않는다', async () => {});
test('마감: 빠진 시각의 예약을 취소한다', async () => { /* scheduler.cancelled 에 그 메시지 id */ });
test('마감: 출국일이 늘면 레코드와 만료가 갱신된다', async () => {});
test('마감: 예약 업체가 실패해도 ok 이고 다음 업로드에서 다시 건다', async () => {});
// 돌아왔어요
test('돌아왔어요: 확인하면 그 뒤 예약 처리가 보내지 않는다', async () => { /* processDue → SKIP_CONFIRMED */ });
test('돌아왔어요: 두 번 눌러도 같은 결과다', async () => {});
test('돌아왔어요: 목록에 없는 시각, 내일 날짜, 그제 날짜는 recorded false 다', async () => {});
test('돌아왔어요: 자정 경계, 00:05 에 어제 23:55 마감을 확인할 수 있다', async () => {});
test('돌아왔어요: 되돌리면 예약 처리가 다시 보낸다', async () => {});
test('돌아왔어요: 마감 + 10분 뒤에는 되돌릴 수 없다', async () => { /* recorded false, confirmed 그대로 */ });
test('돌아왔어요: 마감 지남 푸시를 보낸 뒤 확인하면 복귀 확인 푸시를 한 번만 보낸다', async () => {
  // processDue SENT → markBack → push.sent 2건, 둘째 payload 의 body 가 확인 문구. markBack 한 번 더 → 여전히 2건
});
test('돌아왔어요: 푸시를 보내지 않은 마감을 확인하면 아무것도 보내지 않는다', async () => {});
test('돌아왔어요: 토큰이 틀리면 NOT_FOUND 다', async () => {});
// 삭제
test('삭제: 지켜보기·구독·날짜 기록이 모두 사라지고 건 예약을 취소한다', async () => { /* kv 에 그 watchKey 가 들어간 키가 없다 */ });
test('삭제: ctx.enabled 가 거짓이어도 동작한다', async () => {});
test('삭제: 토큰이 틀리면 NOT_FOUND 이고 아무것도 지우지 않는다', async () => {});
test('내 정보 전체 삭제: 그 계정의 지켜보기만 지운다', async () => { /* 다른 계정 것은 남는다. deleted === 2 */ });
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(watch): 환자 쪽 동작(지켜보기 등록, 마감 올리기, 돌아왔어요, 삭제)`

---

### Task 7: 보호자 쪽 동작 (`guardian.js`)

**Files:**
- Create: `lib/server/watch/guardian.js`
- Test: `test/watch-guardian.test.js`

**Interfaces:**
- Consumes: Task 1(`parsePushEndpoint`), Task 2, Task 5(`pushToSubscription`, `PUSH_KIND`)
- Produces:
  - `subscribeGuardian(ctx, { watchId, subscription: { endpoint, p256dh, auth }, lang }) → Result & { subId }`
  - `unsubscribeGuardian(ctx, { watchId, subId }) → Result`
  - `watchStatus(ctx, { watchId, subId = null }) → Result & { date, confirmed: string[], muted: boolean, subscriptionActive: boolean }`
  - `muteToday(ctx, { watchId, subId, on }) → Result & { muted: boolean }`

규칙:
- **subscribeGuardian**: `hitRate(ctx, 'subscribe', watchKey)`. `findWatch`가 없으면 `NOT_FOUND`. `parsePushEndpoint(endpoint, { testOrigin: ctx.testOrigin })`가 실패하면 `BAD_REQUEST`. 이전 구독을 읽어 둔다. 새 `subId`로 `writeSub`. 이전 구독이 있고 endpoint가 다르면 `pushToSubscription(ctx, 이전 구독, { kind: DEVICE_CHANGED })`를 한 번 부른다(실패해도 구독은 성공). `{ ok: true, subId }`.
- **unsubscribeGuardian**: `findWatch`가 없거나, 구독이 없거나, `subId`가 다르면(`idMatches`) `NOT_FOUND`. 맞으면 `deleteSub`. `ctx.enabled`와 무관하게 동작한다.
- **watchStatus**: `hitRate(ctx, 'status', watchKey)`. 지켜보기가 없으면 `NOT_FOUND`. 오늘(KST) 날짜 기록의 `confirmed`(정렬)와 `muted`. 날짜 기록이 없으면 `confirmed: []`, `muted: false`. `subscriptionActive`는 `subId`가 지금 구독의 것과 같을 때만 참.
- **muteToday**: `hitRate(ctx, 'mute', watchKey)`. 지켜보기가 없거나 `subId`가 지금 구독과 다르면 `NOT_FOUND`. `on`이면 `setDayField(오늘, DAY_FIELD.muted, '1')`, 아니면 `clearDayField`. `{ ok: true, muted: on }`.

- [ ] **Step 1: 테스트를 쓴다**

```js
test('구독: subId 를 돌려주고 구독을 봉인해 저장한다', async () => { /* subId 22자, kv 원문에 endpoint 없음 */ });
test('구독: 모르는 watchId 는 NOT_FOUND 다', async () => {});
test('구독: 허용 목록 밖 endpoint 는 BAD_REQUEST 이고 저장하지 않는다', async () => { /* 'https://fcm.googleapis.com.evil.com/x' */ });
test('구독: 다른 기기가 구독하면 이전 기기에 "기기가 바뀌었어요"를 한 번 보낸다', async () => {
  // push.sent[0].subscription.endpoint === 이전 endpoint, payload body 가 serverDeviceChanged 문구
});
test('구독: 같은 기기가 다시 구독하면 바뀜 알림을 보내지 않는다', async () => {});
test('구독: 이전 기기 알림이 실패해도 새 구독은 성공한다', async () => { /* push.outcome = 'RETRY' */ });
test('구독: 시간당 10회를 넘으면 RATE_LIMITED 다', async () => {});
test('구독: 구독의 만료는 지켜보기와 같다', async () => { /* 지켜보기 만료 뒤 readSub === null */ });
test('구독 해지: subId 가 맞으면 지우고, 틀리면 NOT_FOUND 이고 남는다', async () => {});
test('구독 해지: ctx.enabled 가 거짓이어도 동작한다', async () => {});
test('상태: 오늘 확인된 마감과 함께 있음 여부만 돌려준다', async () => { /* Object.keys 정렬: ['confirmed','date','muted','ok','subscriptionActive'] */ });
test('상태: 어제 확인은 오늘 상태에 섞이지 않는다', async () => {});
test('상태: subId 가 지금 구독과 같을 때만 subscriptionActive 가 참이다', async () => {});
test('함께 있음: 켜면 그날 예약 처리가 보내지 않고, 끄면 다시 보낸다', async () => { /* processDue → SKIP_MUTED, 끈 뒤 SENT */ });
test('함께 있음: 날짜가 바뀌면 풀린다', async () => { /* 다음 날 watchStatus.muted === false */ });
test('함께 있음: subId 가 틀리면 NOT_FOUND 다', async () => {});
test('함께 있음: 마감을 다시 올려도 유지된다', async () => {});
```

- [ ] **Step 2: 실패 확인, 구현, 통과 확인, `npm run lint && npm test`**
- [ ] **Step 3: 커밋한다.** `feat(watch): 보호자 쪽 동작(구독, 해지, 상태 조회, 오늘 함께 있음)`

---

### Task 8: 본문 검증, 기록, 처리기, 라우트

**Files:**
- Create: `lib/server/watch/requests.js`, `lib/server/watch/log.js`, `lib/server/watch/context.js`, `lib/server/watch/handlers.js`, `lib/server/watch/AGENTS.md`, `app/api/push/config/route.js`, `app/api/watch/route.js`, `app/api/watch/deadlines/route.js`, `app/api/watch/back/route.js`, `app/api/watch/subscribe/route.js`, `app/api/watch/status/route.js`, `app/api/watch/mute/route.js`, `app/api/watch/due/route.js`, `app/api/cron/watch-arm/route.js`
- Modify: `vercel.json`(`crons`)
- Test: `test/watch-requests.test.js`, `test/watch-routes.test.js`

**Interfaces:**
- Consumes: Task 1~7 전부, `lib/server/route-guard.js`(`sessionFromRequest`, `errorResponse`, `authRequiredResponse`, `ERROR_CODE`), `src/auth/session.js`(`deriveAccountKey`, `sessionSecret`), `lib/server/itinerary-request.js`(`BAD_REQUEST`)
- Produces:
  - `requests.js`: `MAX_BODY_BYTES = 16384`, `readJsonBody(request) → Promise<{ ok: true, body, raw } | { ok: false }>`, 그리고 `normalizeRegister`, `normalizeDeadlines`, `normalizeBack`, `normalizeRemove`, `normalizeSubscribe`, `normalizeUnsubscribe`, `normalizeStatus`, `normalizeMute`, `normalizeDue`. 각각 `(body) → { ok: true, value } | { ok: false, field }`
  - `log.js`: `WATCH_ROUTE`(닫힌 목록), `buildWatchLogEntry({ route, outcome, errorCode, elapsedMs, counts }) → object`, `logWatch(args) → void`
  - `context.js`: `createWatchCtx(cfg, { now = Date.now, fetchImpl = globalThis.fetch } = {}) → WatchCtx | null`(저장소가 없으면 `null`)
  - `handlers.js`: `createWatchHandlers({ env, now, fetchImpl, ctx } = {}) → { pushConfig, register, remove, deadlines, back, subscribe, unsubscribe, status, mute, due, cronArm }`. 각 값은 `(request) → Promise<Response>`. `env`·`now`·`ctx`는 테스트 주입용이고 운영에서는 `process.env`, `Date.now`, `createWatchCtx`를 쓴다.

계약 (작업 9가 `docs/contracts.md`에 그대로 옮긴다):

| 경로 | 권한 | 요청 본문 | 성공 응답 |
| --- | --- | --- | --- |
| `GET /api/push/config` | 없음 | 없음 | `{ ok: true, enabled, vapidPublicKey: string \| null, guardianLoginRequired }`. 꺼져 있으면 `enabled: false`, `vapidPublicKey: null` |
| `POST /api/watch` | 환자 세션 | `{ watchId, writeToken, expiresOn }` | `{ ok: true, expiresOn }` |
| `DELETE /api/watch` | `writeToken` 또는 세션 | `{ watchId, writeToken }` 또는 `{ all: true }`(세션 필요) | `{ ok: true }` 또는 `{ ok: true, deleted }` |
| `PUT /api/watch/deadlines` | `writeToken`(세션이 있으면 소유자 일치도) | `{ watchId, writeToken, expiresOn, days: [{ date, deadlines: ["HH:MM"] }] }` | `{ ok: true, expiresOn, armFailed }` |
| `POST /api/watch/back` | `writeToken`(세션 불필요) | `{ watchId, writeToken, date, by, undo? }` | `{ ok: true, recorded }` |
| `POST /api/watch/subscribe` | `watchId`(+ 보호자 세션, 설정에 따라) | `{ watchId, subscription: { endpoint, keys: { p256dh, auth } }, lang }` | `{ ok: true, subId }` |
| `DELETE /api/watch/subscribe` | `watchId` + `subId` | `{ watchId, subId }` | `{ ok: true }` |
| `POST /api/watch/status` | `watchId`(+ 보호자 세션, 설정에 따라) | `{ watchId, subId? }` | `{ ok: true, date, confirmed, muted, subscriptionActive }` |
| `POST /api/watch/mute` | `watchId` + `subId`(+ 보호자 세션, 설정에 따라) | `{ watchId, subId, on }` | `{ ok: true, muted }` |
| `POST /api/watch/due` | `Upstash-Signature` 또는 `Authorization: Bearer <CRON_SECRET>` | `{ k, d, t }` | `{ ok: true }`. 다시 불러야 하면 503 |
| `GET /api/cron/watch-arm` | `Authorization: Bearer <CRON_SECRET>` | 없음 | `{ ok: true, armed, failed }` 또는 꺼져 있으면 `{ ok: true, skipped: 'OFF' }` |

오류 (모두 `{ ok: false, errorCode, message }`, 메시지는 고정 문장):

| 상태 | errorCode | 언제 | message |
| --- | --- | --- | --- |
| 400 | `SAFEHOUR_BAD_REQUEST` | 본문이 JSON이 아님, 16KB 초과, 필드 형식(`field` 포함), 지난 출국일, 허용 목록 밖 endpoint | 요청 형식이 올바르지 않습니다. |
| 401 | `SAFEHOUR_AUTH_REQUIRED` | 세션이 필요한 경로, 예약 경로의 인증 실패 | (기존 문장) |
| 404 | `SAFEHOUR_WATCH_NOT_FOUND` | 모르는 id, 만료, 틀린 토큰, 남의 id, 틀린 `subId` | 서버 알림 정보를 찾을 수 없습니다. |
| 429 | `SAFEHOUR_RATE_LIMITED` | 횟수 제한, 재등록·동시 지켜보기 한도 | 요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요. |
| 503 | `SAFEHOUR_SERVER_PUSH_OFF` | 쓰기 경로인데 `enabled`가 거짓, 삭제 경로인데 저장소 설정이 없음 | 서버 알림이 꺼져 있습니다. |
| 503 | `SAFEHOUR_SERVER_PUSH_UNAVAILABLE` | `KvError` 등 예상 못 한 실패 | 서버 알림을 잠시 쓸 수 없습니다. |

처리 순서 (쓰기 경로): ① `cfg = watchConfig(env)`, `enabled`가 아니면 503 OFF ② 세션이 필요한 경로면 세션 확인 ③ 본문 읽기와 허용 목록 ④ 서비스 함수 ⑤ `reason`을 위 표로 바꿈 ⑥ `try/catch`로 예상 못 한 예외를 503 UNAVAILABLE로 ⑦ `logWatch` 한 줄. 삭제 경로(`remove`, `unsubscribe`)는 ①에서 `enabled` 대신 `createWatchCtx(cfg)`가 `null`인지만 본다.

정한 값:
- 정규화 규칙: `watchId`·`writeToken`·`subId`·`k`는 `keys.js`의 정규식, 날짜는 `isDateString`, 시각은 `isClockTime`, `lang`은 ko·en·ja·zh, `on`·`undo`·`all`은 불리언(`undo`는 없으면 `false`). `days`는 배열, 길이 `maxDays` 이하, 각 항목은 `{ date, deadlines }`만 읽고 날짜가 겹치면 400, `deadlines`는 길이 `maxDeadlinesPerDay` 이하이고 중복을 없애 정렬한다. `p256dh`는 base64url로 풀어 65바이트(첫 바이트 `0x04`), `auth`는 16바이트, `endpoint`는 문자열 2048자 이하(호스트 검사는 서비스가 한다). 허용 목록 밖 필드는 조용히 버린다. 결과 객체는 정해진 키만 새로 만들어 담는다(받은 객체를 그대로 넘기지 않는다).
- `readJsonBody`: `request.text()`로 읽어 UTF-8 바이트 길이가 `MAX_BODY_BYTES`를 넘으면 실패, JSON이 객체가 아니면 실패. `raw`는 서명 검증용 원문이다.
- 보호자 세션: `cfg.guardianLoginRequired`가 참이면 `subscribe`·`status`·`mute`에 세션을 요구한다. `unsubscribe`는 요구하지 않는다.
- `register`와 `remove({ all: true })`의 `accountKey`는 `deriveAccountKey(session, sessionSecret(env))`. `deadlines`는 세션이 있으면 `accountKey`를 넘기고 없으면 `null`.
- `due`: 원문으로 `verifyQstashSignature`(QStash 설정이 있을 때) 또는 `Authorization` 헤더가 `Bearer <cronSecret>`과 같은지(`idMatches`) 확인한다. 둘 다 아니면 401. 인증 뒤 `cfg.store`가 없으면 200 `{ ok: true }`(할 일이 없다). `processDue`가 `retry`면 503 UNAVAILABLE, `KvError`도 503.
- `cronArm`: `enabled`가 아니면 인증 없이 200 `{ ok: true, skipped: 'OFF' }`. 켜져 있으면 Bearer 확인(실패 401) 뒤 `armIndexedDates(ctx, [today - 1, today, today + 1])`. 어제를 넣는 것은 어제 늦은 밤 마감의 예약이 실패했을 때 늦은 한도 안이면 다시 걸기 위해서다.
- 처리기는 `ctx`가 주입됐든 직접 만들었든 `enabled`를 `cfg.enabled`로 덮어쓴 사본을 서비스에 넘긴다(`{ ...ctx, enabled: cfg.enabled }`). 스위치 판단의 정본은 `watchConfig`다.
- `createWatchCtx`: `keys`는 `redisKeys(cfg.namespace)`, `secret`은 `cfg.ownerSecret`, `sealKeys`·`testOrigin`은 `cfg`의 값. 저장소가 `upstash`면 `createUpstashKv`, `memory`면 `sharedMemoryKv`. 예약은 QStash 설정이 있으면 `createQstashScheduler`, 메모리 모드면 `sharedMemoryScheduler`, 둘 다 아니면 `schedule`이 늘 `{ ok: false }`인 빈 구현. 푸시는 VAPID가 있으면 `createVapidSigner`를 묶은 `sendPush`, 없으면 늘 `REJECTED`. `reviewed`는 넣지 않는다(`undefined`). 문구 함수가 `safetyPair`의 기본값(이 빌드의 검수 스위치)을 쓰고, 서버 코드가 `SAFETY_COPY_REVIEWED`를 직접 들이지 않는다는 i18n 테스트를 지킨다.
- `WATCH_ROUTE`: `push.config`, `watch.register`, `watch.remove`, `watch.deadlines`, `watch.back`, `watch.subscribe`, `watch.unsubscribe`, `watch.status`, `watch.mute`, `watch.due`, `watch.cron`.
- 기록 한 줄: `{ evt: 'watch', route, outcome, errorCode?, ms?, counts? }`. `outcome`은 `OK`·`REJECTED`·`NOT_FOUND`·`LIMITED`·`OFF`·`FAILED`와 `DUE_OUTCOME`의 값만(닫힌 목록 밖은 `FAILED`). `errorCode`는 `/^SAFEHOUR_[A-Z_]+$/`만. `counts`는 `watches`·`armed`·`failed`·`deleted` 네 개의 음이 아닌 정수만, `push`는 `'2xx'|'404/410'|'4xx'|'5xx'|'network'`만. 그 밖의 입력은 버린다.
- 라우트 파일은 `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`을 두고 머리 주석에 요청·응답·오류를 적는다(`app/api/itinerary/plan/route.js`의 틀). 처리기는 `createWatchHandlers()`에서 꺼낸다.
- `vercel.json`: `"crons": [{ "path": "/api/cron/watch-arm", "schedule": "10 15 * * *" }]`(15:10 UTC = 00:10 KST, Hobby는 최대 59분 흔들린다).
- `lib/server/watch/AGENTS.md`: 맡는 것, 맡지 않는 것(판정, 화면, 위치), 항상 지켜야 하는 것(네 레코드 밖 필드 금지, Redis 배치는 `records.js`만 안다, `replaceDays`는 읽기와 쓰기가 두 번이라 클라이언트는 지켜보기 하나에 업로드를 하나씩만 보내고 늘 최신 전체를 보낸다, 기록·예외·응답 금지 값, 모든 404는 같은 모양, 삭제 경로는 스위치와 무관, 시계 주입, 토큰 원문 저장 금지).

- [ ] **Step 1: `test/watch-requests.test.js`를 쓴다**

```js
test('허용 목록 밖 필드는 버린다', () => { /* normalizeRegister({ ...ok, lat: 37.5, hospital: 'x' }).value 의 키는 세 개뿐 */ });
test('형식이 틀리면 field 를 알려 준다', () => { /* watchId 21자 → 'watchId', expiresOn '2026-13-01' → 'expiresOn' */ });
test('days: 47개, 겹친 날짜, 날짜당 11개, "25:00" 은 거절한다', () => {});
test('days: 시각 중복을 없애고 정렬한다', () => { /* ['18:00','14:30','18:00'] → ['14:30','18:00'] */ });
test('days: __proto__·constructor 키가 결과를 오염시키지 않는다', () => {
  // JSON.parse('{"watchId":…,"days":[{"date":"2026-11-20","deadlines":[],"__proto__":{"x":1}}],"__proto__":{"polluted":true}}')
  // 결과 value 와 ({}).polluted 가 undefined
});
test('구독 키: p256dh 65바이트·auth 16바이트만 받는다', () => {});
test('readJsonBody: 16KB 를 넘거나 JSON 이 아니거나 배열이면 실패다', async () => {});
test('기록: 정해진 필드만 나가고 닫힌 목록 밖 값은 버린다', () => {
  // buildWatchLogEntry({ route: 'watch.back', outcome: 'OK', watchId: 'x', date: '2026-11-20', counts: { armed: 2, endpoint: 'h' } })
  // → 키는 evt·route·outcome·counts 뿐, counts 는 { armed: 2 }
});
test('기록: 모르는 route·outcome 은 정해진 값으로 바뀐다', () => {});
```

- [ ] **Step 2: 실패 확인, `requests.js`·`log.js` 구현, 통과 확인**
- [ ] **Step 3: `test/watch-routes.test.js`를 쓴다.** 처리기를 `createWatchHandlers({ env, now, ctx })`로 만들어 `Request`를 직접 넣는다. `env`는 Task 3 테스트와 같은 방식의 유효한 묶음(메모리 모드, 데모 로그인, `SAFEHOUR_SESSION_SECRET`은 `test/itinerary-fixtures.js`의 `SESSION_SECRET`), `ctx`는 `testCtx()`. 세션 쿠키는 `createSessionToken`으로 만든다. 기록은 `process.stdout.write`를 잠시 가로채 모은다.

```js
test('스위치가 꺼져 있으면 쓰기 경로 여섯 개(등록, 마감, 돌아왔어요, 구독, 상태, 함께 있음)가 모두 503 SAFEHOUR_SERVER_PUSH_OFF 다', async () => {});
test('차단 스위치가 켜져도 쓰기 경로는 503 이다', async () => {});
test('스위치가 꺼져 있어도 DELETE /api/watch 와 DELETE /api/watch/subscribe 는 동작한다', async () => { /* 켠 채 만들고, 끄고, 지운다 → 200 */ });
test('GET /api/push/config: 켜져 있으면 공개키를, 꺼져 있으면 null 을 준다. 개인키는 어디에도 없다', async () => {});
test('POST /api/watch 는 세션이 없으면 401 이다', async () => {});
test('환자 흐름: 등록 → 마감 올리기 → 돌아왔어요 → 삭제', async () => { /* 각 응답 상태와 본문 키 */ });
test('보호자 흐름: 구독 → 상태 → 함께 있음 → 해지', async () => {});
test('모르는 id, 틀린 토큰, 남의 id 재등록은 바이트까지 같은 404 다', async () => { /* 세 응답의 status 와 text() 가 같다 */ });
test('보호자 경로는 설정에 따라 세션을 요구한다', async () => { /* 기본: 세션 없으면 401. NO_LOGIN=1: 통과. unsubscribe 는 늘 세션 없이 */ });
test('횟수 제한은 429 SAFEHOUR_RATE_LIMITED 다', async () => {});
test('본문이 16KB 를 넘거나 JSON 이 아니면 400 이다', async () => {});
test('허용 목록 밖 endpoint 는 400 이다', async () => {});
test('저장소가 실패하면 503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE 이고 응답·기록에 내부 값이 없다', async () => {
  // kv.exec 가 KvError 를 던지게 바꾼다. 모든 경로에서 status 503, 응답 본문 키는 ok·errorCode·message 뿐
});
test('예약 처리: 서명도 Bearer 도 없으면 401 이다', async () => {});
test('예약 처리: Bearer CRON_SECRET 으로 부르면 처리하고 200 이다', async () => { /* push.sent.length === 1 */ });
test('예약 처리: QStash 서명으로 부르면 처리하고, 본문을 바꾸면 401 이다', async () => {});
test('예약 처리: 푸시 서비스가 RETRY 면 503 을, 저장소가 실패해도 503 을 돌려준다', async () => {});
test('하루 1회 예약: 꺼져 있으면 인증 없이 skipped, 켜져 있으면 Bearer 가 필요하다', async () => {});
test('하루 1회 예약: 오늘과 내일의 걸리지 않은 마감을 건다', async () => {});
test('기록: 어느 경로의 기록에도 watchId·토큰·subId·endpoint·날짜·시각·계정 키가 없다', async () => {
  // 위 흐름을 모두 돌린 뒤 모은 기록 줄 전체에서 고정 값 문자열을 찾는다
});
test('계약: 응답 본문의 키가 표와 같다', async () => { /* 경로마다 Object.keys 정렬 비교 */ });
test('라우트 파일이 처리기를 내보낸다', async () => {
  // import('../app/api/watch/route.js') 의 POST·DELETE, deadlines 의 PUT, back·status·mute·due 의 POST,
  // subscribe 의 POST·DELETE, push/config 와 cron/watch-arm 의 GET 이 함수이고 runtime === 'nodejs', dynamic === 'force-dynamic'
});
test('vercel.json 의 예약은 하루 한 번이다', () => { /* crons 길이 1, schedule '10 15 * * *', path '/api/cron/watch-arm' */ });
```

- [ ] **Step 4: 실패 확인, `context.js`·`handlers.js`·라우트·`vercel.json`·`AGENTS.md` 구현, 통과 확인**
- [ ] **Step 5: `npm run lint && npm test && npm run build`** (새 라우트가 빌드에 잡히는지 본다)
- [ ] **Step 6: 커밋한다.** `feat(watch): 서버 알림 API 경로(본문 허용 목록, 기록, 처리기, 하루 1회 예약)`

---

### Task 9: 문서

**Files:**
- Modify: `docs/contracts.md`, `docs/operations.md`, `docs/security.md`, `docs/architecture.md`, `docs/engineering-notes.md`, `docs/tracking/status.md`, `lib/server/AGENTS.md`, `lib/notify/AGENTS.md`, `CLAUDE.md`, `AGENTS.md`, `docs/superpowers/specs/2026-11-09-server-push-design.md`

내용:
- `docs/contracts.md`: Task 8의 계약 표와 오류 표를 경로별 절로 옮긴다. `GET /api/health`에 새 필드(`flags.serverPush`, `flags.serverPushKilled`, `config.serverPushReady`, `config.serverPushMissing`)를 더한다.
- `docs/operations.md`: 환경변수 표에 새 변수, '서버 알림 켜기' 절(비밀 생성 스크립트 실행, Vercel 미리보기 환경에 넣을 값, Upstash·QStash 연동, 배포 보호 우회, 하루 1회 예약은 운영 배포에서만 돌고 미리보기에서는 `/api/cron/watch-arm`과 `/api/watch/due`를 Bearer로 직접 부른다), '비밀 교체' 절(ADR-0012 결정 19 + 이 계획의 '다르게 정한 것' 4번), '사고 대응' 절(결정 23의 다섯 단계), 데이터 초기화에 "저장소 키 접두사 `sh:<환경>:`".
- `docs/security.md`: '무엇을 지키나'에 서버 쪽 자산(네 레코드, 비밀 다섯 가지)을 "스위치가 꺼져 있는 동안 운영에는 생기지 않는다"는 사실과 함께 더한다. '권한'에 경로별 권한 표, '기록'에 서버 알림 기록 규칙, '비밀값'에 새 비밀. 화면의 약속 문구는 건드리지 않는다(결정 16: 운영 스위치를 켜는 배포에서 바꾼다).
- `docs/architecture.md`: 부품에 `src/push`, `lib/server/watch`, 외부 서비스(Upstash Redis, QStash, 푸시 서비스)와 경계를 넘는 값.
- `docs/engineering-notes.md`: 증상 → 원인 → 대응 형식으로 (1) 푸시가 조용히 버려진다 → 구분 바이트 `0x02` 누락 (2) VAPID 개인키를 못 읽는다 → 원시 32바이트는 JWK로 들인다 (3) 예약이 두 번 온다 → QStash 중복 제거 창은 10분, `HSETNX` 권리가 주 장치 (4) 미리보기에서 예약 처리 경로가 401 → 배포 보호, 우회 헤더 (5) 구현 중 알게 된 것.
- `docs/tracking/status.md`: 만든 것(A-1), 남은 것(A-2 환자 화면, A-3 보호자 화면과 서비스 워커, 환자 기기 푸시, A-4 운영), 진행을 막는 것(운영자: 비밀 입력, Upstash·QStash 연동, QStash 리전 확인, 실기기, 법무).
- `lib/server/AGENTS.md`: "이 계층은 아무것도 저장하지 않는다"에 예외를 적는다(`lib/server/watch/`는 ADR-0012의 네 레코드만 저장한다, 스위치가 켜졌을 때만).
- `lib/notify/AGENTS.md`: '서버 푸시는 맡지 않는다' 문장에 "서버 푸시는 `lib/server/watch/`와 `src/push/`가 맡는다"를 잇는다.
- `CLAUDE.md`와 `AGENTS.md`(내용 동일하게): 문서 나무에 `src/push/AGENTS.md`, `lib/server/watch/AGENTS.md` 두 줄. "서버에 데이터베이스가 없고" 문장은 그대로 둔다(결정 16). 그 문단 끝에 한 문장을 더한다: "서버 알림(ADR-0012)은 스위치가 꺼진 채 코드에만 들어와 있다. 켜지면 네 가지 레코드만 저장한다."
- 설계서: 머리말 아래에 '구현에서 달라진 것' 절을 더해 이 계획의 '설계서와 다르게 정한 것' 열일곱 가지를 옮긴다.

- [ ] **Step 1: 문서를 고친다.** 새 글에 엠대시·엔대시가 없는지 `git diff -U0 | grep '^+' | perl -CSD -ne 'print if /[\x{2013}\x{2014}]/'`로 확인한다(결과가 없어야 한다). 이 기계의 `grep`은 ugrep이라 `\|`를 글자로 읽어 예전 명령은 늘 통과했다.
- [ ] **Step 2: `npm run lint && npm test`** (문서 링크나 문구를 고정한 테스트가 있으면 함께 본다)
- [ ] **Step 3: 커밋한다.** `docs: 서버 알림 기반(A-1) 계약·운영·보안·구조 문서`

---

## 실행 순서

| 묶음 | 작업 | 함께 돌릴 수 있는가 |
| --- | --- | --- |
| 1 | Task 1, Task 2, Task 3, Task 4 | 넷 다 서로 다른 파일이라 함께 돈다 |
| 2 | Task 5 | 묶음 1이 합쳐진 뒤 |
| 3 | Task 6, Task 7 | 서로 다른 파일이라 함께 돈다 |
| 4 | Task 8, Task 9 | 함께 돈다(문서는 이 계획의 계약 표를 옮긴다) |

끝난 뒤: 전체 가지 독립 검토(보안 중심), 전체 관문(`npm run lint && npm test && npm run build && E2E_PORT=<빈 포트> npm run e2e`), PR, CI, 병합(운영 스위치는 꺼진 채), `npm run verify:deploy -- https://safehour.vercel.app --skip-plan`.
