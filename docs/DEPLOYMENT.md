# SafeHour 배포·운영 절차 (AX-105)

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
| `KMA_API_KEY` | 선택 | Production, Preview | 기상청 단기예보 키. 없으면 기상은 "확인 불가"로 표기되고 판정에 반영되지 않는다. |
| `SAFEHOUR_KILL_RECOMMENDATION` | 선택 | Production | 추천 전면 중단 스위치. 아래 3장 참고. |

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
  "config": { "tourApiKeyConfigured": true, "weatherApiKeyConfigured": false },
  "flags": { "recommendationKilled": false }
}
```

키 값은 절대 노출되지 않고 **설정 여부만** 확인된다.

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

- [ ] CI `quality` 통과 (lint · 단위 143 · build · audit · E2E 25)
- [ ] `/api/health` 에서 `tourApiKeyConfigured: true`
- [ ] 핵심 흐름 수동 1회: 입력 → 추천 3개 → 휴무 이벤트로 대체 → 즉시 복귀
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
- **운영 알림**: 호출 한도 경고(800회)·판정 실패가 현재는 서버 로그에만 남는다.
  AX-201 에서 대시보드·알림을 다룬다.

## 8. 발동 이력

| 일시 | 조치 | 사유 | 조치자 |
| --- | --- | --- | --- |
| — | — | — | — |
