# 운영

## 준비물

- Node 22 (`.nvmrc`에 고정). 최소 20.9.0 이상이면 돈다.
- 화면 테스트용 브라우저는 사용자 캐시에 이미 있다. 없다고 나오면 설치하지 말고 보고한다 —
  설치 명령이 새 의존성을 들여온다.

## 처음 한 번

```bash
npm ci
```

`npm install`을 쓰지 않는다. 잠금 파일을 고쳐 의존성이 바뀐다.

환경변수는 `.env.local`에 둔다. `.env.example`을 복사해 시작한다. **로컬에서는 아무 값도 없어도
앱이 뜨고**, 키가 없는 기능은 꺼진 상태로 동작한다(아래 표). 다만 키가 없으면 일정 만들기는
502로 실패한다 — 장소 후보를 받아올 수 없기 때문이다. 배포 환경은 사정이 다르다(아래 배포 항목).

## 자주 쓰는 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run lint` | 코드 검사 |
| `npm test` | 단위 테스트(외부 호출 없음) |
| `npm run build` | 운영 빌드 |
| `npm start` | 빌드 결과 실행 |
| `npm run e2e` | 화면 테스트(360px, 외부 호출 0건) |
| `npm run e2e:ui` | 화면 테스트를 눈으로 보며 실행 |
| `npm run audit` | 의존성 취약점 점검 |
| `npm run check` | 위 검사·테스트·빌드·점검을 순서대로 |

`npm run e2e`는 **이미 만들어져 있는 빌드 결과를 그대로 띄운다 — 빌드하지 않는다.** 고친 코드를
검증하려면 `npm run build`를 먼저 돌린다. 안 그러면 예전 빌드로 통과한다. (자동 검증 파이프라인은
빌드를 먼저 돌리므로 이 함정이 없다. 로컬에서만 조심하면 된다.)

`npm run check`는 마지막 단계에서 취약점 점검을 하고, 현재 잠금 파일에 해결되지 않은 권고가 남아 있어
묶음 전체가 실패로 끝난다. 코드 변경의 통과 여부를 볼 때는 앞의 세 명령을 따로 돌린다.

## 실제 외부 API를 부르는 명령

호출량과 증적을 만들기 때문에 **수동으로만** 돌린다. 자동 검증에 넣지 않는다.

| 명령 | 부르는 곳 |
| --- | --- |
| `npm run test:tour-api` | 관광공사 |
| `npm run analyze:gangnam` | 관광공사 |
| `npm run ai:eval` | Gemini (키가 있을 때만) |

`npm run usage:snapshot`은 외부를 부르지 않고 쌓인 호출 기록을 모은다. 다만 결과를
`docs/API_USAGE_SNAPSHOT.md`에 **덮어쓴다.** 그 파일은 지금 수정하면 안 되는 제출 산출물이므로,
그 제약이 풀리기 전에는 이 명령을 돌리지 않는다.

`npm run usage:weekly`는 위 명령들을 이어 돌린 **뒤 마지막에 `usage:snapshot`을 부른다.**
그래서 같은 금지가 그대로 적용된다 — 저장소에 정기 실행 설치 스크립트가 있지만, 걸어두면 그 제출
산출물이 자동으로 덮어써진다. 제약이 풀리기 전에는 걸지 않는다.

## 환경변수

| 이름 | 없으면 |
| --- | --- |
| `TOUR_API_KEY` | **일정 만들기가 502로 실패한다.** 장소 후보를 받아올 수 없다 — "후보 없음"이 아니라 "조회 못 함"이다 |
| `SAFEHOUR_DATA_ROOT` | 로컬에서는 저장소 폴더를 기본값으로 쓴다. **서버리스 배포에서는 필수다** — 호출 카운터·로그·캐시를 파일로 쓰는데 쓰기 가능한 경로가 없으면 모듈을 읽는 시점에 실패해 **모든 경로가 500**이 된다. 배포에서는 `/tmp` 아래를 가리킨다 |
| `KMA_API_KEY` | 관광공사 키로 대신 시도한다. **공백 한 칸이나 `off`를 넣으면 기상 조회를 끈다**(빈 값과 다르다). 꺼지면 기상은 '확인 불가'이고 판정에 반영하지 않는다 |
| `TOUR_API_WARNING_AT` · `TOUR_API_DAILY_LIMIT` | 하루 호출 경고 800 · 차단 1,000. 양의 정수가 아니면 기본값으로 돌아가고, 경고가 차단보다 크면 차단 값으로 맞춘다 |
| `SAFEHOUR_SESSION_SECRET` | **로그인 기능 자체가 꺼진다.** 32자 이상이어야 한다 |
| `SAFEHOUR_BASE_URL` | 로그인 콜백 주소를 만들 수 없다. 요청 헤더로 대신 만들지 않는다 |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | 구글 로그인 버튼이 동작하지 않는다 |
| `KAKAO_CLIENT_ID` · `KAKAO_CLIENT_SECRET` | 카카오 로그인 버튼이 동작하지 않는다 |
| `SAFEHOUR_ALLOW_DEMO_LOGIN` | 로그인 없이 보는 데모 경로가 닫힌다. **정확히 `1`일 때만** 열린다 |
| `JUSO_API_KEY` · `JUSO_COORD_API_KEY` | 주소 검색이 503을 돌려준다(데모 로그인 모드에서는 고정 데모 주소). **둘 다** 있어야 켜진다 |
| `SAFEHOUR_AI_INTRO` | 소개 문장이 정해진 템플릿이 된다. 기능을 **켜는** 스위치라 **정확히 `1`일 때만** 켜진다(`true`·`on`은 꺼짐) |
| `GEMINI_API_KEY` | 스위치가 켜져 있어도 템플릿만 쓴다 |
| `GEMINI_MODEL` | 코드에 있는 기본 모델을 쓴다. 바꾸면 평가를 다시 돌린다 |
| `SAFEHOUR_KILL_RECOMMENDATION` | 추천이 정상 동작한다. `1`·`true`·`on`이면 모든 날짜가 정거장 없이 서비스 중단으로 나온다(기능을 **끄는** 스위치라 느슨하게 읽는다) |
| `NEXT_PUBLIC_SAFEHOUR_CONTACT` | 도움말(`/help`)의 '문의' 구역이 나오지 않는다. 값은 `mailto:` 주소, `https://` 주소, 이메일 주소 중 하나이고 그 밖의 값은 링크 없이 글자로만 보인다. 공개 값이라 **빌드 때 번들에 새겨지므로 바꾸면 다시 빌드해야 한다**. 증상·병원 정보를 받는 창구로 쓰지 않는다. 설정하면 장소 데이터 연결 문제(`AUTH`·`SELF_LIMIT`) 안내의 링크가 '도움말 보기'(`/help`)에서 '문의하기'(`/help#contact`)로 바뀐다(`components/trip/HelpContactLink.js`) |
| `NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA` · `..._ZH` | 일본어·중국어 사용자의 안전 문구가 영어+한국어로 나온다. **빌드 때 번들에 새겨지므로 바꾸면 다시 빌드해야 한다** |

**서버 알림 (ADR-0012)**. 기본은 꺼짐이고, 켜는 절차는 아래 '서버 알림 켜기'에 있다. 아래 '필수' 값이 하나라도 없거나 형식이
틀리면 스위치를 켜도 꺼진 것과 같다(`/api/watch*` 쓰기 경로가 503 `SAFEHOUR_SERVER_PUSH_OFF`). 무엇이 빠졌는지는 헬스의
`config.serverPushMissing`에 **이름으로만** 나온다.

| 이름 | 없으면 |
| --- | --- |
| `SAFEHOUR_SERVER_PUSH` | 서버 알림이 꺼져 있다(기본). 기능을 **켜는** 스위치라 **정확히 `1`일 때만** 켜진다. 꺼져 있어도 삭제 경로(`DELETE /api/watch`, `DELETE /api/watch/subscribe`)는 동작한다 |
| `SAFEHOUR_KILL_SERVER_PUSH` | 막지 않는다. 기능을 **끄는** 차단 스위치라 `1`·`true`·`on`(앞뒤 공백·대소문자 무시)을 켜짐으로 읽는다. 켜지면 쓰기 경로가 503, 예약 처리가 아무것도 보내지 않고(`SKIP_OFF`), 삭제 경로만 동작한다 |
| `UPSTASH_REDIS_REST_URL` · `UPSTASH_REDIS_REST_TOKEN` | (필수) 저장소가 없어 준비되지 않는다. 삭제 경로도 503이다. 이 이름이 없으면 Vercel 연동이 넣는 `KV_REST_API_URL`·`KV_REST_API_TOKEN`을 읽는다(주소와 토큰은 같은 접두사에서 읽는다). 주소는 `https:`만 받는다 |
| `QSTASH_TOKEN` · `QSTASH_CURRENT_SIGNING_KEY` · `QSTASH_NEXT_SIGNING_KEY` | (필수) 예약을 걸 수 없어 준비되지 않는다. 하나라도 없으면 셋 다 없는 것으로 본다. `QSTASH_URL`은 선택이고 비우면 `https://qstash.upstash.io`다 |
| `SAFEHOUR_VAPID_PUBLIC_KEY` · `SAFEHOUR_VAPID_PRIVATE_KEY` · `SAFEHOUR_VAPID_SUBJECT` | (필수) 푸시를 보낼 수 없어 준비되지 않는다. 공개키는 base64url 65바이트(첫 바이트 `0x04`), 개인키는 32바이트이고 **같은 쌍이어야** 한다. 연락처는 `mailto:` 또는 `https:` 주소이고 푸시 서비스에 전달된다 |
| `SAFEHOUR_PUSH_STORE_KEY` | (필수) 구독을 봉인할 수 없어 준비되지 않는다. base64url로 정확히 32바이트. 교체 중에는 옛 키를 `SAFEHOUR_PUSH_STORE_KEY_PREVIOUS`에 둔다(선택, 형식이 틀리면 무시) |
| `SAFEHOUR_WATCH_OWNER_SECRET` | (필수) 준비되지 않는다. 32자 이상이고 `SAFEHOUR_SESSION_SECRET`과 **같은 값이면 없는 것으로 본다.** 저장 키·소유자 해시·횟수 제한 키·중복 제거 id·푸시 Topic을 모두 이 비밀로 만든다 |
| `CRON_SECRET` | (필수) 준비되지 않는다. 16자 이상. Vercel이 하루 1회 예약을 부를 때 `Authorization: Bearer`로 싣는다. 값이 배포 때 고정되므로 바꾸면 다시 배포한다 |
| `SAFEHOUR_PUBLIC_BASE_URL` | 예약 업체가 되부를 주소를 Vercel 시스템 값으로 만든다: 운영은 `https://` + `VERCEL_PROJECT_PRODUCTION_URL`, 미리보기는 `https://` + `VERCEL_BRANCH_URL`(없으면 `VERCEL_URL`). 넣었는데 형식이 틀리면 Vercel 주소로 넘어가지 않고 빠진 값으로 알린다 |
| `SAFEHOUR_WATCH_GUARDIAN_NO_LOGIN` | 보호자도 로그인해야 구독·상태 조회·오늘 함께 있음을 쓴다(기본). **정확히 `1`**이면 로그인 없이 된다. 아이폰 실기기 확인 뒤 정한다(결정 22) |
| `SAFEHOUR_STORE_MODE` · `SAFEHOUR_PUSH_TEST_ORIGIN` | 화면 테스트 전용. 데모 로그인이면서 운영 배포(`VERCEL_ENV=production`)가 **아닐 때만** 듣는다. 데모 로그인은 운영에도 켜 두므로 운영 배포에서는 값이 있어도 무시한다. `memory`면 메모리 저장소와 메모리 예약을 쓴다 |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel이 넣는 시스템 값이라 직접 적지 않는다. 미리보기 배포 보호를 우회하는 비밀이고, 없으면 미리보기에서 예약 업체의 되부르기가 보호에 막힌다 |

## 상태 확인

```bash
curl -s localhost:3000/api/health
```

응답의 `ok`, 기상 설정 상태, 추천 중단 스위치 상태, 관광공사 자체 호출 카운터(`tourApiUsage`: 오늘
operation별 `used/limit`, `warningAt`, `dailyLimit`)를 한 번에 보여준다. 배포 뒤 첫 확인은 이 경로다.
서버 알림 상태는 `flags.serverPush`·`flags.serverPushKilled`와 `config.serverPushReady`·`config.serverPushMissing`(빠진
환경변수 이름)으로 본다.

카운터는 `SAFEHOUR_DATA_ROOT` 아래 파일이다. 서버리스 배포에서는 이 경로(`/tmp`)가 실행 인스턴스마다 따로라
헬스가 보여 주는 숫자는 **응답한 인스턴스 한 곳의 오늘 호출 수**다. 공공데이터포털에 실제로 쌓인 전체 호출 수가
아니다. 제공처 쪽 한도는 공공데이터포털 마이페이지에서 확인한다.

일정 API 가 502 `SAFEHOUR_EXTERNAL_API`를 내면 응답 본문의 `upstream`과 서버 로그
`[itinerary.plan] candidate load failed: SAFEHOUR_EXTERNAL_API upstream=<분류>`로 원인 갈래를 본다.

| `upstream` | 먼저 볼 곳 |
| --- | --- |
| `QUOTA` | 공공데이터포털 일일 한도 소진. 자정(한국 시각)에 풀린다. 그날 배포 확인은 `--skip-plan`으로 |
| `SELF_LIMIT` | 우리 operation별 차단 값(`TOUR_API_DAILY_LIMIT`)에 닿았다. 헬스의 `tourApiUsage`로 어느 조회인지 본다 |
| `AUTH` | 인증키 미설정·미등록·만료, 서비스 활용 신청 여부 |
| `UPSTREAM_ERROR` · `PARSE` · `NETWORK` | 제공처 장애나 일시 오류. 잠시 뒤 다시 확인한다 |

HTTP 429 → `QUOTA`, HTTP 401·403 → `AUTH` 분류는 실제 게이트웨이 응답으로 확인하지 않았다(`docs/tracking/findings.md` 16).

## 배포

Vercel(서울 리전) 설정이 저장소에 있다. `main`에 병합하면 운영(`https://safehour.vercel.app`)에
바로 배포되고, 다른 브랜치는 push할 때마다 미리보기 배포가 만들어진다. 미리보기는 Vercel 로그인으로
막혀 있어 브라우저로 확인한다.

**병합은 곧 운영 배포다.** 공모전 심사는 끝났고(2026-11-02 미선정 통보) 보류는 풀렸지만,
병합·운영 배포·원격 push는 관문과 독립 리뷰를 통과한 뒤 운영자에게 묻지 않고 진행한다(2026-11-09 운영자 지시). 병합 뒤에는 `verify:deploy`를 한 번 돌려 확인하고, 실패하면 더 병합하지 않고 보고한다. 일정 검사는 요청 1건에 관광공사 호출 수십 건을 쓰므로, 하루 첫 확인이나 일정 경로·환경변수가 바뀐 병합이 아니면 `--skip-plan`으로 돌린다(개발계정 일일 한도 1,000건).

| 할 일 | 방법 |
| --- | --- |
| 병합 | `npm run merge -- <PR번호> --wait`. CI 통과를 확인한 뒤에만 squash 병합한다 |
| 환경변수 | Vercel 설정의 Environments에서 Production과 Preview에 **따로** 넣는다. `TOUR_API_KEY`, `SAFEHOUR_DATA_ROOT`(`/tmp/safehour`), `SAFEHOUR_SESSION_SECRET`, `SAFEHOUR_ALLOW_DEMO_LOGIN`(`1`)이 두 곳 모두에 있어야 데모 로그인과 일정 만들기가 된다. `SAFEHOUR_BASE_URL`은 소셜 로그인 콜백에만 쓰므로 운영에만 둔다. 세션 비밀값은 환경마다 다른 값을 쓴다 |
| 환경변수 반영 | 값을 바꾼 뒤 다시 배포해야 반영된다. 미리보기는 해당 배포의 메뉴에서 Redeploy를 고르고 환경이 Preview인지 확인한다 |
| 배포 확인 | `npm run verify:deploy -- https://safehour.vercel.app`. 헬스·보안 헤더·로그인·일정 API를 본다. 헬스에 호출 카운터가 있으면 operation별 사용량을 한 줄로 보인다 |
| 배포 확인의 호출 비용 | 데모 로그인이 켜진 배포본에서는 일정 생성 검사가 실제 일정 요청을 한 번 보낸다. 캐시가 없으면 관광공사 목록 조회 2회(국문·무장애)가 나가고 상세 조회가 더해질 수 있어 **그날 호출 한도를 쓴다** |
| 일정 검사 생략 | `npm run verify:deploy -- <주소> --skip-plan`(또는 `SAFEHOUR_VERIFY_SKIP_PLAN=1`). 일정 생성 검사 두 건을 '생략'으로 표시하고 실패로 세지 않는다. 그날 이미 502 `upstream=QUOTA`를 봤을 때, 헬스 카운터가 `WARNING`·`BLOCKED`일 때, 하루에 여러 번 다시 확인할 때 쓴다. 코드·환경변수가 바뀐 첫 배포 확인은 생략하지 않는다 |
| 되돌리기 | Vercel의 Instant Rollback으로 직전 운영 배포로 돌린다 |

## 서버 알림 켜기

법무 검토 전에는 **미리보기 배포에서만** 켜고 운영 스위치는 끈다(결정 13). 운영 스위치를 켜는 배포에서 화면의 "서버에 저장하지
않습니다" 약속 문구와 `CLAUDE.md`·`AGENTS.md`의 문장을 함께 바꾼다(결정 16). 켜기 전에는 지금 문구가 사실이므로 바꾸지 않는다.
값 입력은 운영자가 직접 한다.

1. **비밀 만들기**: 환경마다 따로 한 번씩 돌린다.

   ```bash
   node scripts/generate-push-secrets.mjs
   ```

   `SAFEHOUR_VAPID_PUBLIC_KEY`, `SAFEHOUR_VAPID_PRIVATE_KEY`, `SAFEHOUR_PUSH_STORE_KEY`, `SAFEHOUR_WATCH_OWNER_SECRET`,
   `CRON_SECRET`을 `이름=값`으로 한 줄씩 낸다. 파일을 쓰지 않고 네트워크를 쓰지 않는다. 출력은 비밀번호 관리자에만 옮기고
   파일·메신저·저장소에 남기지 않는다. 운영과 미리보기는 다른 값을 쓴다. `SAFEHOUR_VAPID_SUBJECT`(운영자 연락처 `mailto:` 주소)는
   직접 정한다.
2. **Upstash Redis 연동**: Vercel Marketplace에서 Upstash Redis를 프로젝트에 붙인다. 리전은 도쿄다(서울 리전이 없어 결정 18에 따라
   국외 이전 고지가 필요하다). 백업은 켜지 않는다(지운 값이 백업에 남지 않게). 월 예산 상한을 건다(결정 20, 금액은 운영자가 정한다).
   무료 등급은 데이터베이스가 하나라 운영·미리보기·로컬이 같은 데이터베이스를 쓰고, `VERCEL_ENV`로 정해지는 키 접두사
   (`sh:prod:`·`sh:prev:`·`sh:dev:`)로 나뉜다. 연동이 `KV_REST_API_*` 이름으로 넣어도 코드가 읽는다.
3. **QStash 연동**: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`를 넣는다. QStash 리전은 유럽(기본)과
   미국뿐이라 예약 메시지 본문(저장 키·날짜·시각)이 그곳에 놓인다. 운영 스위치를 켜기 전에 운영자와 법무가 리전을 확인한다.
   월 예산 상한을 건다(결정 20). 앱은 지켜보기당 하루 120건까지만 예약을 발행하고 서비스 전체 상한은 두지 않는다. 기록의
   `watch.deadlines` `failed` 수와 QStash 하루 메시지 수를 함께 본다.
4. **배포 보호 우회**: 미리보기는 Vercel 로그인으로 막혀 있어 QStash의 되부르기가 앱에 닿지 못한다. Vercel 설정의 Deployment
   Protection에서 Protection Bypass for Automation 비밀을 만든다. Vercel이 그 값을 `VERCEL_AUTOMATION_BYPASS_SECRET`으로 넣고,
   예약 어댑터가 발행할 때 `Upstash-Forward-x-vercel-protection-bypass` 헤더로 실어 QStash가 `x-vercel-protection-bypass`로
   전달한다. 비밀을 만들기 전에 건 예약에는 이 헤더가 없으므로, 시험은 비밀을 만든 뒤 새로 올린 마감으로 한다.
5. **Preview 환경에 넣을 값**: `SAFEHOUR_SERVER_PUSH=1`과 1~3의 값 전부(`SAFEHOUR_VAPID_SUBJECT` 포함). `SAFEHOUR_PUBLIC_BASE_URL`은
   비워 두면 브랜치 주소를 쓴다. 넣은 뒤 그 미리보기 배포를 Redeploy한다(환경변수는 다시 배포해야 반영된다).
6. **확인**: 미리보기의 `/api/health`에서 `flags.serverPush` 참, `flags.serverPushKilled` 거짓, `config.serverPushReady` 참,
   `config.serverPushMissing` 빈 배열인지 본다. `/api/push/config`의 `enabled`도 참이어야 한다.
7. **하루 1회 예약은 운영 배포에서만 돈다**(Vercel Cron의 성질). 미리보기 시험은 두 경로를 `Authorization: Bearer <CRON_SECRET>`로
   직접 부른다. 미리보기는 보호가 걸려 있으므로 우회 헤더도 함께 싣는다. 아래 값은 자리표시자이고 실제 값은 비밀번호 관리자에서 꺼낸다.

   ```bash
   curl -s -H "Authorization: Bearer <CRON_SECRET>" -H "x-vercel-protection-bypass: <우회 비밀>" \
     https://<미리보기 주소>/api/cron/watch-arm
   curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" -H "x-vercel-protection-bypass: <우회 비밀>" \
     -H "Content-Type: application/json" -d '{"k":"<저장 키>","d":"YYYY-MM-DD","t":"HH:MM"}' \
     https://<미리보기 주소>/api/watch/due
   ```

   예약 처리 경로의 `k`는 `watchId`가 아니라 저장 키(HMAC)다. QStash 콘솔의 메시지 본문에서 그대로 가져온다.
8. **실기기 시험**: 안드로이드 Chrome(앱 닫힘), 아이폰 홈 화면 앱(iOS 16.4 이상), 데스크톱 브라우저. 화면(A-2·A-3)이 붙은 뒤에 한다.
9. **운영 스위치 전에 갖출 것 두 가지**: 코드가 막지 않으므로 운영자가 확인한다.
   - **운영의 실제 소셜 로그인**: 운영 배포의 서버 알림 경로는 데모 세션을 세션이 없는 것으로 본다. 데모 로그인은 누가 눌러도 같은
     신원이라 받으면 남의 지켜보기를 다시 등록하거나 지울 수 있기 때문이다(`docs/security.md` '서버 알림 경로의 권한'). 그래서 환자
     등록과 '서버에 남은 내 정보 지우기'(`{ all: true }`)에는 실제 로그인이 필요하고, 보호자 로그인을 요구하는 설정(기본)이면 보호자도
     같다. 지금 코드가 지원하는 제공자는 **구글과 카카오** 둘이다(`src/auth/config.js`). Production에 `SAFEHOUR_BASE_URL`,
     `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`, `KAKAO_CLIENT_ID`·`KAKAO_CLIENT_SECRET`을 넣고, 각 제공자 콘솔에 콜백 주소
     (`<SAFEHOUR_BASE_URL>/api/auth/callback`)를 등록한 뒤 운영에서 두 로그인을 실제로 끝까지 해 본다.
   - **Vercel Firewall 횟수 제한 규칙**: `/api/watch`로 시작하는 경로와 `/api/push/`로 시작하는 경로에 IP 단위 횟수 제한 규칙을 건다.
     앱의 횟수 제한은 계정·지켜보기 단위라 형식에 맞는 id를 바꿔 가며 보내면 새로 센다. 삭제 경로 둘에는 한도가 없고 차단 스위치가
     켜져도 열려 있다. 요청 하나가 저장소 명령을 1~3번 쓰므로 막지 않으면 Upstash 할당량이 바닥나고, 그러면 예약 처리까지 503이 된다.
     `/api/watch/due`는 예약 업체(QStash)가 같은 마감 시각에 몰아서 부르므로 규칙에서 빼거나 따로 넉넉한 한도를 둔다(서명이나
     Bearer가 없으면 저장소에 닿기 전에 401이다). 한도 값은 운영자가 정하고, 요금제별로 쓸 수 있는 규칙은 그때 Vercel 문서로 확인한다.
10. **운영 스위치**: 법무 검토가 끝나고 9가 갖춰진 뒤, 약속 문구를 바꾸는 같은 배포에서 Production에 운영용 값(미리보기와 다른 비밀)을
    넣고 켠다.

## 비밀 교체

정기 교체는 하지 않고 **유출이 의심될 때만** 바꾼다(결정 19). 보관은 Vercel 환경변수(운영·미리보기 다른 값)이고, 사본은 운영자
비밀번호 관리자 한 곳뿐이다. 바꾼 뒤에는 그 환경을 다시 배포해야 반영된다.

| 비밀 | 바꾸면 생기는 일 | 절차 |
| --- | --- | --- |
| VAPID 키 쌍 | 기존 보호자 구독을 모두 쓸 수 없다(브라우저 구독이 공개키에 묶여 있다). 보호자가 알림 받기를 다시 켜야 한다 | 스크립트로 새 쌍을 만들어 두 값을 함께 바꾼다. 공개키는 `/api/push/config`로 내려가므로 다시 빌드할 필요는 없다 |
| `SAFEHOUR_PUSH_STORE_KEY` | 새 키만으로는 기존 구독의 봉인을 풀지 못한다 | 새 키를 넣고 옛 키를 `SAFEHOUR_PUSH_STORE_KEY_PREVIOUS`에 둔다. 읽기는 두 키 모두로 하고, 새로 쓰는 구독은 새 키로 봉인한다. 저장된 구독은 다시 구독하거나 만료될 때(늦어도 54일)까지 옛 키 봉인으로 남으므로 그 뒤에 `_PREVIOUS`를 지운다. 봉인 키 자체가 샜으면 옛 키를 두지 않는다(보호자가 다시 켠다) |
| `SAFEHOUR_WATCH_OWNER_SECRET` | 저장 키·소유자 해시·횟수 제한 키·중복 제거 id·Topic이 모두 바뀐다. 기존 지켜보기를 더는 찾지 못하고 TTL로 사라진다. 환자가 서버 알림을 다시 켜고 보호자가 다시 구독해야 한다. 이미 건 예약은 도착해도 지켜보기가 없어 보내지 않는다 | 새 값을 넣고 다시 배포한다. 옛 레코드는 삭제 경로로도 찾지 못하므로, 유출 대응이면 '사고 대응'의 저장소 비우기를 함께 한다 |
| `SAFEHOUR_SESSION_SECRET` | 계정 키가 바뀌어 소유자 해시가 달라진다. 기존 지켜보기는 쓰기 토큰으로는 계속 쓰지만 '서버에 남은 내 정보 지우기'(`{ all: true }`)로 찾지 못하고, 같은 `watchId`로 다시 등록하면 남의 것으로 보아 404다. TTL로만 사라진다 | 세션 비밀은 로그인과 기기 저장소의 계정 이름공간도 바꾸므로 서버 알림보다 영향이 크다. 그쪽을 먼저 본다 |
| `CRON_SECRET` | 하루 1회 예약과 직접 부르는 예약 처리가 새 값으로만 통한다 | Vercel Cron은 배포 때의 값을 쓰므로 바꾼 뒤 반드시 다시 배포한다 |
| Upstash 토큰 · QStash 토큰 | 옛 토큰으로는 저장소·예약 업체를 부르지 못한다 | 업체 콘솔에서 다시 발급하고 환경변수를 바꾼 뒤 다시 배포한다 |
| QStash 서명 키 둘 | 서명을 검증하지 못한 예약 처리는 401로 거절되고, 예약 업체는 다시 부르다 멈춘다 | QStash 콘솔에서 서명 키를 바꾼 뒤 두 값을 함께 바꾸고 다시 배포한다. 코드는 지금 키와 다음 키 둘 다로 검증한다. 콘솔의 교체 방식은 그때 Upstash 문서로 확인한다 |
| 배포 보호 우회 비밀 | 미리보기에서 예약 업체의 되부르기가 막힌다 | Vercel 설정에서 다시 만든다. 그 전에 건 예약은 옛 값을 싣고 있다 |

## 사고 대응

담당은 운영자 1인이다(결정 23). 서버 알림 자산의 유출이 의심되면 아래 순서로 한다.

1. **차단 스위치를 켠다**: 켜 둔 환경에 `SAFEHOUR_KILL_SERVER_PUSH=1`을 넣고 다시 배포한다. 쓰기 경로가 503이 되고, 예약 처리는
   아무것도 보내지 않으며(`SKIP_OFF`), 삭제 경로는 계속 동작한다. 헬스의 `flags.serverPushKilled`로 반영을 확인한다.
2. **비밀을 바꾼다**: 위 '비밀 교체' 표를 따른다. 샌 것으로 의심되는 비밀부터 바꾼다.
3. **저장소를 비운다**: Upstash 콘솔에서 그 환경의 접두사(`sh:prod:` 등) 아래 키를 지운다. 데이터베이스 하나를 환경들이 함께 쓰므로
   데이터베이스 전체 비우기(`FLUSHDB`)는 다른 환경의 키까지 지운다. 걸어 둔 QStash 메시지와 실패 대기열도 콘솔에서 지운다(남아
   있어도 도착하면 지켜보기가 없어 보내지 않는다).
4. **영향 범위를 확인한다**: 저장소만 샜으면 보이는 것은 해시된 키, 날짜와 `HH:MM` 목록, 봉인된 구독이다. 봉인 키도 샜으면 보호자
   기기의 푸시 주소와 언어가 드러난다. 소유 비밀도 샜으면 특정 계정의 계정 키를 아는 사람이 그 계정의 사용 여부를 확인할 수 있다
   (`docs/security.md` '무엇을 지키나'). 앱 기록에는 식별 값이 없다. QStash에는 메시지 본문(저장 키·날짜·시각)이 있다.
5. **이용자에게 알린다**: 법이 정한 기한 안에 고지한다. 기한은 법무 확인 항목이다.

## 데이터 초기화

서버 알림 스위치가 꺼져 있는 동안 서버에는 데이터가 없으므로 초기화할 것도 없다. 사용자 기기 데이터는 앱의 '이 기기에서 내 정보 지우기'로
지운다. 화면 테스트가 쓰는 임시 데이터는 `.e2e-data/` 아래에 생기고 지워도 된다.

서버 알림을 켜면 Upstash Redis의 저장소 키 접두사 `sh:<환경>:`(`prod`·`prev`·`dev`) 아래에 키가 생긴다. 모두 만료 시각이 있어
저절로 사라진다: 지켜보기·구독은 출국일 끝 + 7일, 날짜 기록과 날짜 색인은 그 날짜 끝 + 1일, 소유 집합은 지켜보기를 마지막으로 쓴 때 + 60일,
횟수 제한 계수기는 창 길이 + 60초. 한 환경만 비우려면 그 접두사의 키만 지운다.
