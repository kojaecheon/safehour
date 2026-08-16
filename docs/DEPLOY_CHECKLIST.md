# 제출 전 배포 체크리스트 — 운영자 실행분

- 기준일: 2026-08-15 · 제출 마감까지 37일
- 이 문서는 **사람만 할 수 있는 일**을 순서대로 적는다. 절차·원리는 `docs/DEPLOYMENT.md` 가 소유한다.
- 왜 급한가: 1차 심사의 **서비스 구현성 30점**은 심사위원이 URL 로 직접 들어와 눌러보는 것으로
  판정된다. **지금 배포본에는 병원 연동 흐름이 없다.**

---

## 0. 지금 상태

| | 상태 |
| --- | --- |
| 코드 | 로그인 · 병원 연결 · 오늘의 회복 · 병원 안내 · 외출 판정까지 완성. 단위 271 · E2E 91 통과 |
| 배포본 (`safehour.vercel.app`) | **옛 화면** — 수기 입력 방식. 로그인·병원 연동 없음 |
| 막고 있는 것 | Vercel 환경변수 + OAuth 앱 등록. **둘 다 운영자 계정이 필요해 대행 불가** |

---

## 1. 준비물 만들기 (약 40분)

### 1-1. 세션 서명 키 생성

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

출력값을 `SAFEHOUR_SESSION_SECRET` 으로 쓴다. **저장소·PR·메신저 어디에도 붙여넣지 않는다.**
이 키가 없으면 로그인 기능 자체가 꺼진다 (위조 가능한 세션을 켜지 않는 설계).

### 1-2. Google OAuth 클라이언트

[Google Cloud Console](https://console.cloud.google.com/) → API 및 서비스 → 사용자 인증 정보

1. **OAuth 동의 화면** 구성 — 앱 이름 `SafeHour`, 사용자 지원 이메일
2. 범위(Scope)는 **`openid` 하나만** 추가한다. 이메일·프로필을 넣지 않는다
3. **OAuth 클라이언트 ID** 만들기 → 유형 **웹 애플리케이션**
4. **승인된 리디렉션 URI** 에 정확히 이 값을 넣는다

   ```
   https://safehour.vercel.app/api/auth/callback
   ```

5. 클라이언트 ID · 보안 비밀번호를 받아둔다

> ⚠ **가장 놓치기 쉬운 함정**: OAuth 동의 화면이 **테스트 모드**로 남아 있으면
> 테스트 사용자로 등록된 계정만 로그인할 수 있다. **심사위원은 로그인하지 못한다.**
> `openid` 는 민감하지 않은 범위라 별도 검증 없이 **프로덕션으로 게시**할 수 있으니,
> 반드시 게시 상태를 프로덕션으로 바꾼다.

### 1-3. 카카오 로그인

[Kakao Developers](https://developers.kakao.com/) → 내 애플리케이션

1. 애플리케이션 추가 (`SafeHour`)
2. **플랫폼 → Web** 에 사이트 도메인 `https://safehour.vercel.app` 등록
3. **카카오 로그인 활성화** ON
4. **Redirect URI** 에 정확히 이 값을 넣는다

   ```
   https://safehour.vercel.app/api/auth/callback
   ```

5. **동의항목은 하나도 켜지 않는다** — 회원번호만 쓴다
6. **보안 → Client Secret** 을 생성하고 **사용함** 으로 설정한다 (코드가 요구한다)
7. REST API 키(= `KAKAO_CLIENT_ID`)와 Client Secret 을 받아둔다

### 1-4. 공공데이터포털 인증키 확정

`docs/COMPETITION_SUBMISSION.md` 2.C2-1 참조. 요약하면 다음 넷이다.

- 제출할 **계정 하나**를 정한다 (그 키로 나간 호출만 인정된다)
- **인코딩키·디코딩키 두 값**을 마이페이지에서 복사해 둔다
- `KorService2` · `EngService2` · `KorWithService2` · 기상청 `VilageFcstInfoService_2.0`
  **네 서비스 활용신청이 모두 승인**됐는지 확인
- 운영계정을 신청할지 결정 — 하려면 **승인 대기가 있으니 지금**

키를 확정했으면 `.env.local` 의 `TOUR_API_KEY` 를 그 값으로 맞추고, **그날 바로** 아래를 한 번
실행한다. 이후 **주 1회** 반복한다.

```bash
npm run usage:weekly
```

실API 검증 3종이 돌고 `docs/API_USAGE_SNAPSHOT.md` 가 갱신된다. 호출 이력은 **소급이
불가능**하다 — 현재 누적이 24콜/2일뿐이라 지금 시작하지 않으면 개발 기간(07.27~09.21)
이력이 얇은 채로 제출된다.

---

## 2. Vercel 환경변수 등록 (약 10분)

Vercel → 프로젝트 → Settings → Environment Variables.
**Production** 에 전부 넣는다. Preview 는 도메인이 매번 바뀌므로 소셜 로그인 대신 데모로 확인한다.

| 변수 | 값 | 없으면 |
| --- | --- | --- |
| `TOUR_API_KEY` | 확정한 인증키 (디코딩키) | 추천이 전부 실패 |
| `SAFEHOUR_DATA_ROOT` | `/tmp/safehour` | **모든 API 가 500** |
| `SAFEHOUR_SESSION_SECRET` | 1-1 에서 만든 값 | 로그인 전체 비활성 |
| `SAFEHOUR_BASE_URL` | `https://safehour.vercel.app` | OAuth 콜백 주소를 못 만들어 로그인 불가 |
| `GOOGLE_CLIENT_ID` | 1-2 에서 받은 값 | Google 버튼이 "준비 중" |
| `GOOGLE_CLIENT_SECRET` | 1-2 에서 받은 값 | 〃 |
| `KAKAO_CLIENT_ID` | 1-3 REST API 키 | 카카오 버튼이 "준비 중" |
| `KAKAO_CLIENT_SECRET` | 1-3 Client Secret | 〃 |
| `SAFEHOUR_ALLOW_DEMO_LOGIN` | `1` | 심사위원이 로그인 실패 시 **대안 경로가 사라진다** |

`SAFEHOUR_BASE_URL` 끝에 슬래시를 붙이지 않는다. 도메인이 바뀌면 **OAuth 콘솔의 Redirect URI 도
같이 바꿔야** 한다 — 둘이 한 글자라도 다르면 로그인이 실패한다.

> **데모 경로를 켜는 이유**: 요강상 테스트 계정은 "SNS 연동 로그인" 으로 제출하지만,
> 심사 환경에서 소셜 로그인이 막히면 **구현성 30점을 통째로 잃는다.** 데모 경로는
> 비식별 예시 지침으로 전체 흐름만 보여주며 화면에 "병원 연동 데모" 를 상시 표시한다.

---

## 3. 배포 (약 5분)

현재 작업은 `claude/competition-prep-process-a1a2fa` 브랜치에 있다.

1. 변경분을 커밋하고 PR 을 연다
2. CI `quality` 통과 확인 (lint · 단위 271 · build · audit · E2E 91)
3. `main` 에 머지 → Vercel 이 Production 배포

`npm run merge` 가 안전 머지 스크립트다 (branch protection 이 플랜 제약으로 불가한 대신).

---

## 4. 배포 후 확인 (약 15분)

### 4-1. 자동 확인

```bash
npm run verify:deploy -- https://safehour.vercel.app
```

### 4-2. 설정이 실제로 먹었는지

```bash
curl -s https://safehour.vercel.app/api/health
curl -s https://safehour.vercel.app/api/auth/session
```

- `health` → `tourApiKeyConfigured: true`, `recommendationKilled: false`
- `session` → `auth.ready: true`, `providers` 의 `google`·`kakao` 가 `configured: true`,
  `auth.demoLogin: true`

`ready: false` 면 `SAFEHOUR_SESSION_SECRET` 또는 `SAFEHOUR_BASE_URL` 이 빠진 것이다.

### 4-3. 사람이 눈으로 (심사위원이 할 행동 그대로)

- [ ] **실제 Google 계정으로 로그인** — 다른 사람 계정으로도 한 번 (테스트 모드 함정 확인)
- [ ] **실제 카카오 계정으로 로그인**
- [ ] 로그인 화면에서 동의 항목에 **이메일·프로필이 뜨지 않는지** 확인
- [ ] `/link` → `예시 A` → 오늘의 회복이 **대기**로 뜨는지
- [ ] `/guide` → 전체 확인 → 오늘의 회복이 **동행 가능**으로 풀리는지
- [ ] 외출 판정 → 추천 3건 → 휴무 이벤트 → 대체 투입
- [ ] 즉시 복귀 안내
- [ ] 상단 `English` 로 전 화면 영문 전환
- [ ] "이 기기에서 내 정보 지우기" → 로그아웃까지 되는지
- [ ] 위치 권한 팝업이 **뜨지 않는지**
- [ ] 360px 폭에서 가로 스크롤 없음

### 4-4. 실기기 (미수행 — 15분)

`docs/DEVICE_TEST_CHECKLIST.md` 절차를 폰에서 한 번 수행한다.
**안드로이드 뒤로가기 2-1 항목이 실패하면 다른 작업보다 먼저 고친다** — 안전 지시를
읽는 도중 페이지를 떠나는 결함이다.

---

## 5. 내가 해야 하는 것만 모으면

| # | 할 일 | 대략 |
| --- | --- | --- |
| 1 | 세션 서명 키 생성 | 1분 |
| 2 | Google OAuth 클라이언트 만들기 + **프로덕션 게시** | 20분 |
| 3 | 카카오 로그인 앱 만들기 + Client Secret 사용함 | 15분 |
| 4 | 공공데이터포털 인증키·활용신청 확인, 운영계정 결정 | 15분 |
| 4b | `npm run usage:weekly` 첫 실행 — 이후 **주 1회** | 3분 |
| 5 | Vercel 환경변수 9개 등록 | 10분 |
| 6 | PR 머지 → 배포 | 5분 |
| 7 | 배포 후 눈으로 확인 (4-3) | 15분 |
| 8 | 실기기 검증 (4-4) | 15분 |

**합계 약 1시간 40분.** 이 중 2·3번이 가장 오래 걸리고, **2번의 프로덕션 게시를 빼먹으면
심사위원이 로그인하지 못한다.**

---

## 6. 내가 대신 할 수 있는 것

| 항목 | 상태 |
| --- | --- |
| 코드·테스트·문서 | 완료 |
| 배포 후 자동 검증 (`verify:deploy`) | 실행 가능 |
| `/api/health`·`/api/auth/session` 응답 확인 | 실행 가능 |
| 배포본 화면 캡처 (`capture:images`) | 배포 URL 로 실행 가능 |
| 호출 이력 축적 도구 (AX-205) | 완료 — `npm run usage:weekly`. **실행은 키가 있는 로컬에서** |

비밀값 입력, 외부 콘솔 계정 작업, 실기기 조작은 대행하지 않는다.
