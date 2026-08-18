# SafeHour 배포·운영 절차 (AX-105)

- **운영 URL: https://safehour.vercel.app** (최초 배포 2026-08-04)
- 대상: Vercel (Next.js)
- 연결: D09-RG007·RG008, D06-E014, D07-POL006·POL009
- 리전: `icn1` (서울) — 사용자와 TourAPI 모두 국내다

## 1. 최초 설정

### 1.1 프로젝트 연결

Vercel 대시보드에서 `kojaecheon/safehour` 저장소를 Import 한다.
`vercel.json` 이 프레임워크·리전·보안 헤더를 이미 지정하므로 빌드 설정은 기본값을 쓴다.

### 1.2 환경변수

Vercel → Settings → Environment Variables 에 등록한다.
**값은 저장소·PR·로그 어디에도 남기지 않는다** (D07-POL009).

| 변수 | 필수 | 환경 | 설명 |
| --- | --- | --- | --- |
| `TOUR_API_KEY` | 필수 | Production, Preview | 공공데이터포털 인증키. 없으면 추천이 전부 실패한다. |
| `SAFEHOUR_DATA_ROOT` | **필수** | Production, Preview | `/tmp/safehour`. 아래 1.3 참고 — 없으면 모든 API 가 500 이다. |
| `KMA_API_KEY` | 선택 | Production, Preview | 기상청 전용 키. **없으면 `TOUR_API_KEY` 로 폴백한다** — 공공데이터포털은 계정당 인증키가 하나이므로, 기상청 서비스만 활용신청하면 같은 키로 호출된다. |
| `SAFEHOUR_KILL_RECOMMENDATION` | 선택 | Production | 추천 전면 중단 스위치. 아래 3장 참고. |
| `SAFEHOUR_SESSION_SECRET` | **필수** | Production, Preview | 세션 서명 키(32자 이상). **없으면 로그인 기능 전체가 비활성**된다 — 서명 없는 세션은 위조 가능하므로 켜지 않는 편이 안전하다 (ADR-0004). |
| `SAFEHOUR_BASE_URL` | **필수** | Production, Preview | 배포 도메인. OAuth `redirect_uri` 를 **이 값으로 조립**한다. 요청 헤더로 만들면 호스트 헤더 주입에 열린다. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 선택 | Production, Preview | 둘 다 있어야 Google 로그인이 켜진다. 요청 범위는 `openid` 뿐(이메일·프로필 미수집). |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` | 선택 | Production, Preview | 둘 다 있어야 카카오 로그인이 켜진다. 선택 동의 항목을 요청하지 않는다. |
| `SAFEHOUR_ALLOW_DEMO_LOGIN` | 선택 | Production | `1` 일 때만 데모 진입 경로가 열린다. **심사위원이 소셜 로그인을 통과하지 못할 경우의 보험** (정의 §9-3). |

**Preview 에도 인증 변수를 넣을 때 주의**: `SAFEHOUR_BASE_URL` 은 환경마다 도메인이 다르다.
Preview 배포 URL 은 매번 바뀌므로, Preview 에서 소셜 로그인을 쓰려면 고정 도메인을 붙이거나
데모 경로로만 확인한다.

### 1.3 서버리스 파일시스템 — `SAFEHOUR_DATA_ROOT` 가 필수인 이유

TourAPI 클라이언트는 호출 카운터·로그·캐시를 파일로 쓴다. **Vercel 서버리스는
`/var/task` 가 읽기 전용**이라 기본 경로(`PROJECT_ROOT`)로는 디렉터리 생성부터 실패한다.

```
Error: ENOENT: no such file or directory, mkdir '/var/task/.cache/tour-api'
```

이 오류는 모듈 로드 시점에 나므로 **모든 API 가 500** 이 된다. `SAFEHOUR_DATA_ROOT`
를 `/tmp/safehour` 로 지정해 쓰기 가능한 경로를 쓰게 한다.

#### 남는 한계 — 인스턴스별 카운터 격리

`/tmp` 는 **서버리스 인스턴스마다 독립**이다. 인스턴스가 N개면 호출 카운터도 N벌로
쪼개진다. 즉 D07-POL005 의 "operation별 1,000회 자체 차단"이 **전역으로는 보장되지
않는다.** 최악의 경우 실제 호출량이 한도의 N배까지 나갈 수 있다.

현재는 다음 근거로 수용한다.

- 심사·시연 규모의 트래픽에서는 동시 인스턴스가 1–2개에 그친다
- 자체 한도(1,000)는 공급자 쿼터보다 보수적으로 잡은 값이라 여유가 있다
- 한도를 넘겨도 공급자가 `resultCode 22` 로 거부하고, 그것은 실패로 처리되어
  D06-E005 "안전한 미추천"으로 수렴한다 — **위험 추천이 나오는 방향은 아니다**

운영 트래픽이 늘면 공유 저장소(Vercel KV 등)로 카운터를 옮겨야 한다. AX-201 에서
계측·알림과 함께 다룬다.

#### 로그는 두 종류다 — 파일과 런타임

혼동하기 쉬워 구분해 둔다.

| | TourAPI 호출 로그 | 판정 로그 (ADR-0002) |
| --- | --- | --- |
| 어디에 | 파일 (`$SAFEHOUR_DATA_ROOT/logs/tour-api/`) | **stdout** → 플랫폼 런타임 로그 |
| 서버리스에서 | `/tmp`, 인스턴스별 격리, 재배포 시 소멸 | 플랫폼이 수집, 인스턴스 무관하게 조회 가능 |
| 무엇이 | operation·성공여부·소요시간·일일 카운트. 기준점 좌표는 `REDACTED` | 판정 상태·사유 코드·후보 수·소요시간 |
| 보존 | 인스턴스 수명 | 플랫폼 기본 정책 (AX-104 에서 확인) |

**판정 로그는 파일이 아니다.** 저장소를 두면 보존 정책이 선행 조건이 되고,
서버리스에서는 어차피 흩어져 집계되지 않기 때문이다.

`TOUR_API_KEY` 를 Preview 에도 넣는 이유는 PR 미리보기에서 실제 흐름을 확인하기
위해서다. 다만 Preview 는 호출 한도를 Production 과 공유하므로, 리허설을 반복할
때는 이미 캐시된 강남 프리셋 기준점을 쓴다.

### 1.3 배포 확인

```bash
curl -s https://<배포주소>/api/health | jq
```

```json
{
  "ok": true,
  "service": "safehour",
  "config": {
    "tourApiKeyConfigured": true,
    "weatherApiKeyConfigured": true,
    "weatherKeySource": "TOUR_API_KEY"
  },
  "flags": { "recommendationKilled": false }
}
```

키 값은 절대 노출되지 않고 **설정 여부만** 확인된다. `weatherKeySource` 는 기상 호출에
실제로 쓰이는 키가 전용 키인지 폴백인지 알려준다.

전체 검증은 스크립트로 한 번에 한다.

```bash
npm run verify:deploy -- https://safehour.vercel.app
```

헬스·보안 헤더·안전 게이트 3종·판정과 재판정·비밀정보 노출을 확인한다.

## 2. 배포 흐름

| 트리거 | 결과 |
| --- | --- |
| PR 생성·갱신 | Preview 배포 (고유 URL) |
| `main` 병합 | Production 배포 |

`main` 은 CI(`lint → test → build → audit → E2E`)를 통과한 코드만 병합한다.

### CI 강제 수단 — 현재 제약과 대안

**비공개 저장소 + GitHub 무료 플랜에서는 branch protection 과 auto-merge 를 쓸 수 없다.**
`PUT /branches/main/protection` 은 HTTP 403(Upgrade to GitHub Pro)을 반환하고,
`allow_auto_merge` 는 PATCH 해도 `false` 로 남는다. 실제로 PR #4 가 CI 실패 상태로
병합돼 main 이 깨진 적이 있다.

그래서 병합은 **항상 아래 스크립트로 한다.** CI 결과를 확인하고 통과했을 때만 병합한다.

```bash
npm run merge -- <PR번호>          # 지금 결과로 판정
npm run merge -- <PR번호> --wait   # 실행 중이면 완료까지 대기(최대 15분)
```

체크가 하나도 없거나, 실행 중이거나, 하나라도 실패하면 병합을 거부한다.

근본 해결은 둘 중 하나다. 동결(9/18) 전에 결정한다.

| 선택지 | 비용 | 비고 |
| --- | --- | --- |
| GitHub Pro 업그레이드 | 유료(월 단위) | branch protection·auto-merge 사용 가능 |
| 저장소 공개 전환 | 무료 | 심사 전 공개가 적절한지 판단 필요 |
| 현행 유지(스크립트 + 규율) | 무료 | 사람이 `gh pr merge` 를 직접 쓰면 방어가 뚫린다 |

## 3. Kill switch — 추천 전면 중단

### 언제 쓰는가

- 위험한 추천이 실제로 나온 것을 확인했을 때
- 판정 로직에 신뢰할 수 없는 결함이 발견됐을 때
- 외부 데이터가 오염돼 안전 판정을 믿을 수 없을 때

**코드 배포를 기다리지 않는다.** 환경변수 하나로 즉시 차단한다.

### 발동 절차

1. Vercel → Settings → Environment Variables → `SAFEHOUR_KILL_RECOMMENDATION` = `1`
   (Production)
2. Deployments → 최신 Production → **Redeploy** (환경변수는 재배포 시 반영된다)
3. `curl https://<배포주소>/api/health` 로 `flags.recommendationKilled: true` 확인
4. 발동 시각·사유·조치자를 이 문서 하단 이력에 남긴다

### 발동 시 동작

- `/api/recommend`, `/api/recalculate` 가 **판정도 외부 호출도 하지 않고** 즉시
  `NO_TOURISM` 으로 응답한다.
- 사용자 화면에는 오류가 아니라 정상 미추천 결과로 보인다 —
  "점검을 위해 추천을 일시 중단했습니다. 병원 안내를 먼저 따르세요."
- 이벤트(휴무·기상·환자 호출)를 보내도 미추천이 유지된다.
- 즉시 복귀를 임의로 발동하지 않는다. 서비스 점검은 환자 호출이 아니다.

### 해제

같은 경로에서 값을 지우거나 `0` 으로 바꾸고 재배포한다. 해제 전에 **차단 사유가
실제로 해소됐는지** 확인한다. 스위치는 더 안전한 쪽으로만 움직이도록 설계돼 있어,
켜는 것은 안전하지만 끄는 것은 판단이 필요하다.

## 4. Rollback

### 판단 기준

다음 중 하나라도 관측되면 즉시 롤백한다.

- 위험 추천 1건 이상 (조건을 어긴 장소가 추천됨)
- 복귀 SLA 위반이 확인된 사례
- 안전 게이트가 동작하지 않음 (외출 금지·조건 만료인데 추천이 나옴)
- 현재 GPS 요청 발생
- 핵심 흐름(입력→추천→변화→복귀) 중 한 단계라도 진행 불가

### 절차

1. **먼저 kill switch 를 켠다** (3장). 롤백보다 빠르고, 잘못된 추천을 즉시 멈춘다.
2. Vercel → Deployments → 직전 정상 배포 → **Promote to Production**
3. `/api/health` 와 핵심 흐름을 수동 확인
4. kill switch 해제
5. 원인 분석 후 수정 PR — 같은 결함을 고정하는 회귀 테스트를 반드시 포함한다

Vercel 은 이전 배포를 보존하므로 롤백에 재빌드가 필요 없다.

## 5. 배포 전 체크리스트

- [ ] CI `quality` 통과 (lint · 단위 295 · build · audit · E2E 93)
- [ ] `/api/health` 에서 `tourApiKeyConfigured: true`
- [ ] `/api/auth/session` 에서 `auth.ready: true`, 쓰려는 공급자가 `configured: true`
- [ ] 핵심 흐름 수동 1회: 로그인 → 병원 지침 연결 → 안내 확인 → 외출 판정 → 휴무 이벤트 → 즉시 복귀
- [ ] 현재 GPS 요청 0건 (브라우저 개발자도구 → Application → Permissions)
- [ ] 360px 에서 가로 스크롤 없음
- [ ] kill switch 발동·해제 리허설 1회 (실제 사고 때 처음 해보면 늦다)

## 6. 보안 헤더

`vercel.json` 이 모든 응답에 적용한다.

| 헤더 | 목적 |
| --- | --- |
| `Permissions-Policy: geolocation=()` | **브라우저 레벨에서 위치정보 접근 차단** — 코드 실수로도 현재 GPS 를 요구할 수 없게 한다 (D07-BAN002) |
| `X-Content-Type-Options: nosniff` | MIME 추측 차단 |
| `X-Frame-Options: DENY` | 클릭재킹 차단 |
| `Referrer-Policy: strict-origin-when-cross-origin` | 외부로 경로·쿼리 유출 방지 |
| `Cache-Control: no-store` (API) | 판정 결과가 중간 캐시에 남지 않게 한다 |

## 7. 미해결

- **canary 배포**: Vercel 무료 플랜에는 트래픽 분할이 없다. 심사 규모에서는
  kill switch + 즉시 롤백으로 대응한다. 필요해지면 재검토한다.
- **운영 알림**: 호출 한도 경고(800회)와 판정 결과가 로그에만 남고 알림은 없다.
  판정 결과 자체는 ADR-0002 로 구조화된 로그가 됐으므로 플랫폼 로그에서
  `"evt":"decision"` 으로 걸러 볼 수 있다. 별도 대시보드는 만들지 않는다.

## 8. 발동 이력

| 일시 | 조치 | 사유 | 조치자 |
| --- | --- | --- | --- |
| 2026-08-04 00:34 | 발동 → 해제 | **리허설** (실제 사고 아님) | 운영자 |

### 2026-08-04 리허설 결과

실제 사고 때 처음 해보면 늦으므로 운영 URL 에서 발동·해제를 한 번 수행했다.

| 단계 | 소요 |
| --- | --- |
| 환경변수 등록 | 3초 |
| 재배포 | 25초 |
| 발동 확인(`/api/health`) | 11초 |
| **발동 총 소요** | **39초** |
| 해제(변수 삭제 + 재배포 + 확인) | **29초** |

확인한 것:

- `/api/health` → `recommendationKilled: true`
- `/api/recommend` → `servicePaused: true`, `NO_TOURISM`, 코스 0건, 사유 `SERVICE_PAUSED`
- 사용자 화면 → 오류가 아니라 정상 미추천 배너
  ("지금은 관광을 권하지 않습니다 / 점검을 위해 추천을 일시 중단했습니다")
- 해제 후 `npm run verify:deploy` 13/13 통과로 정상 복구 확인

**결론: 위험 추천을 발견한 시점부터 40초 안에 전면 차단할 수 있다.** 롤백(직전 배포
Promote)보다 빠르므로, 4장 절차대로 kill switch 를 먼저 켜는 것이 맞다.

리허설 중 검증 스크립트의 오탐도 하나 잡았다 — 비밀정보 검사가 키 "값" 이 아니라
"이름"(`TOUR_API_KEY` 문자열)에 반응했다. `weatherKeySource` 를 추가하면서 드러났고,
값 대조 방식으로 고쳤다.
