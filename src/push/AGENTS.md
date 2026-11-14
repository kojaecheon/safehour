# 웹 푸시 프로토콜 (`src/push/`)

## 맡는 것

서버가 보호자 기기로 웹 푸시 한 건을 보내는 데 필요한 표준 절차를 `node:crypto`와 `fetch`만으로 구현한다.

- VAPID 서명(RFC 8292): 키 들이기, JWT, `Authorization: vapid t=<JWT>, k=<공개키>` 헤더, 출처별 JWT 재사용
- 본문 암호화(RFC 8291, aes128gcm)와 같은 형식의 복호화(테스트와 가짜 푸시 서비스용)
- endpoint 검증: `https:`, 알려진 푸시 서비스 호스트만(`PUSH_HOST_RULES`)
- 푸시 한 건 보내기와 응답 상태를 `SENT`·`GONE`·`RETRY`·`REJECTED`로 나누기

## 맡지 않는 것

- 환경변수 읽기, VAPID 키와 연락처 고르기: `lib/server/watch/config.js`
- 구독 저장과 봉인, 언제 누구에게 보낼지 정하기: `lib/server/watch/`
- 알림 문구: `lib/server/watch/text.js`
- 기기 안 알림 예약과 서비스 워커: `lib/notify/`, `public/`

## 항상 지켜야 하는 것

- **서버 전용이다.** 클라이언트 코드(`app/`의 화면, `components/`, `lib/store/`, `lib/trip/`)에서 불러오지 않는다.
  `node:crypto`를 쓰고 VAPID 개인키를 다룬다.
- **환경변수를 읽지 않는다.** 키, 연락처, 시각, `fetch`는 모두 부르는 쪽이 넘긴다. 브라우저 API도 쓰지 않는다.
- **네트워크는 주입한 `fetchImpl`로만 나간다.** 단위 테스트는 가짜 `fetchImpl`을 쓰고 실제 호출이 0건이다.
- **오류와 결과에 키·endpoint·응답 원문을 넣지 않는다.** `PushError`의 메시지는 고정 문장이고 판단은 `code`로 한다
  (`PUSH_KEY`, `PUSH_PAYLOAD_TOO_LARGE`, `PUSH_VAPID`). `sendPush`는 던지지 않고 `{ outcome, statusClass }` 두 값만
  돌려준다. 응답 본문은 읽지 않는다. `node:crypto`나 `fetch`가 던진 원래 메시지는 버린다.
- **endpoint 허용 목록을 넓히지 않는다.** 서버가 그 주소로 요청을 보내므로 아무 주소나 받으면 내부망이나 다른 서비스를
  찌르는 통로가 된다. 호스트를 더할 때는 그 브라우저의 공식 푸시 서비스 호스트인지 확인한다. `*.`는 한 단계 이상
  하위 도메인만 맞고, 사용자 정보·443 밖의 포트·`http:`는 받지 않는다.
- `testOrigin`은 데모 모드의 가짜 푸시 서비스에만 넘긴다. 운영 경로에서는 넘기지 않는다.
- **리디렉트를 따라가지 않는다**(`redirect: 'manual'`). 3xx는 `REJECTED`다.
- **본문 형식을 바꾸지 않는다.** 평문 끝의 구분 바이트는 `0x02`(마지막 레코드)이고, 레코드는 하나, 레코드 크기 필드는
  4096이다. 본문 전체는 4096바이트(`MAX_PUSH_BODY_BYTES`)를 넘지 않는다. 평문 상한은 3993바이트이고 넘으면
  `PUSH_PAYLOAD_TOO_LARGE`다.
- salt와 임시 키는 매번 새로 뽑는다. 주입 인자(`salt`, `localPrivateKey`)는 시험 벡터 테스트용이다.

## 구현 방식

- 키 유도: `ikm = HKDF(공유 비밀, auth, 'WebPush: info\0' | p256dh | 임시 공개키, 32)`,
  `cek = HKDF(ikm, salt, 'Content-Encoding: aes128gcm\0', 16)`, `nonce = HKDF(ikm, salt, 'Content-Encoding: nonce\0', 12)`.
  암호화와 복호화가 같은 함수(`deriveContentKeys`)를 쓴다.
- 본문 = `salt(16) | uint32 BE 4096 | 65 | 임시 공개키(65) | 암호문+태그(16)`.
- VAPID JWT는 `exp`가 지금 + 12시간이고, 같은 출처에 남은 수명이 1시간을 넘는 동안 다시 쓴다. Apple 푸시 서비스가
  같은 출처의 토큰을 한 시간에 한 번 넘게 새로 만들지 말라고 하기 때문이다.
- VAPID 개인키는 공개키와 짝인지 확인한 뒤 x·y와 함께 JWK로 들인다. 서명은 `ieee-p1363`(r|s 64바이트)이다.
- `PushError`와 base64url 키 읽기는 `encrypt.js`에 두고 다른 파일이 가져다 쓴다.

## 테스트

- **RFC 8291 부록 A 시험 벡터 테스트를 지우거나 값을 바꾸지 않는다.** 암호화 본문이 바이트 단위로 같아야 하고,
  같은 본문을 구독 개인키로 풀면 원문이 나와야 한다.
- 3993바이트 평문이 정확히 4096바이트 본문이 되는지, 3994바이트가 거부되는지 확인한다.
- 적대적 endpoint(호스트 뒤에 붙인 도메인, 경로에 넣은 호스트, `@` 뒤 호스트, IP, 다른 포트, `http:`, 2048자 초과)가
  모두 거부되는지 확인한다.
- 오류 메시지와 결과 객체에 키·endpoint·응답 원문이 없는지 단언한다.
