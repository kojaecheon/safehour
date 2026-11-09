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
| `NEXT_PUBLIC_SAFEHOUR_CONTACT` | 도움말(`/help`)의 '문의' 구역이 나오지 않는다. 값은 `mailto:` 주소, `https://` 주소, 이메일 주소 중 하나이고 그 밖의 값은 링크 없이 글자로만 보인다. 공개 값이라 **빌드 때 번들에 새겨지므로 바꾸면 다시 빌드해야 한다**. 증상·병원 정보를 받는 창구로 쓰지 않는다 |
| `NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA` · `..._ZH` | 일본어·중국어 사용자의 안전 문구가 영어+한국어로 나온다. **빌드 때 번들에 새겨지므로 바꾸면 다시 빌드해야 한다** |

## 상태 확인

```bash
curl -s localhost:3000/api/health
```

응답의 `ok`, 기상 설정 상태, 추천 중단 스위치 상태, 관광공사 자체 호출 카운터(`tourApiUsage`: 오늘
operation별 `used/limit`, `warningAt`, `dailyLimit`)를 한 번에 보여준다. 배포 뒤 첫 확인은 이 경로다.

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
병합·운영 배포·원격 push는 관문과 독립 리뷰를 통과한 뒤 운영자에게 묻지 않고 진행한다(2026-11-09 운영자 지시). 병합 뒤에는 `verify:deploy`를 한 번 돌려 확인하고, 실패하면 더 병합하지 않고 보고한다.

| 할 일 | 방법 |
| --- | --- |
| 병합 | `npm run merge -- <PR번호> --wait`. CI 통과를 확인한 뒤에만 squash 병합한다 |
| 환경변수 | Vercel 설정의 Environments에서 Production과 Preview에 **따로** 넣는다. `TOUR_API_KEY`, `SAFEHOUR_DATA_ROOT`(`/tmp/safehour`), `SAFEHOUR_SESSION_SECRET`, `SAFEHOUR_ALLOW_DEMO_LOGIN`(`1`)이 두 곳 모두에 있어야 데모 로그인과 일정 만들기가 된다. `SAFEHOUR_BASE_URL`은 소셜 로그인 콜백에만 쓰므로 운영에만 둔다. 세션 비밀값은 환경마다 다른 값을 쓴다 |
| 환경변수 반영 | 값을 바꾼 뒤 다시 배포해야 반영된다. 미리보기는 해당 배포의 메뉴에서 Redeploy를 고르고 환경이 Preview인지 확인한다 |
| 배포 확인 | `npm run verify:deploy -- https://safehour.vercel.app`. 헬스·보안 헤더·로그인·일정 API를 본다. 헬스에 호출 카운터가 있으면 operation별 사용량을 한 줄로 보인다 |
| 배포 확인의 호출 비용 | 데모 로그인이 켜진 배포본에서는 일정 생성 검사가 실제 일정 요청을 한 번 보낸다. 캐시가 없으면 관광공사 목록 조회 2회(국문·무장애)가 나가고 상세 조회가 더해질 수 있어 **그날 호출 한도를 쓴다** |
| 일정 검사 생략 | `npm run verify:deploy -- <주소> --skip-plan`(또는 `SAFEHOUR_VERIFY_SKIP_PLAN=1`). 일정 생성 검사 두 건을 '생략'으로 표시하고 실패로 세지 않는다. 그날 이미 502 `upstream=QUOTA`를 봤을 때, 헬스 카운터가 `WARNING`·`BLOCKED`일 때, 하루에 여러 번 다시 확인할 때 쓴다. 코드·환경변수가 바뀐 첫 배포 확인은 생략하지 않는다 |
| 되돌리기 | Vercel의 Instant Rollback으로 직전 운영 배포로 돌린다 |

## 데이터 초기화

서버에 데이터가 없으므로 초기화할 것도 없다. 사용자 기기 데이터는 앱의 '이 기기에서 내 정보 지우기'로
지운다. 화면 테스트가 쓰는 임시 데이터는 `.e2e-data/` 아래에 생기고 지워도 된다.
