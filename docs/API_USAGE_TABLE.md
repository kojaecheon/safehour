# SafeHour 공공 API 활용표와 화면 대응 (AX-202)

- 연결: D09-RG004(데이터·API 게이트), RG008, D07-POL004·POL005
- 기준일: 2026-08-17 (3절 화면 대응을 병원 연동 흐름으로 갱신, 8절 호출 이력 루틴 추가 — AX-205)
- **운영 URL: https://safehour.vercel.app**
- 이 표의 내용은 코드에서 추출한 것이며, 문서와 구현이 어긋나면 코드가 정본이다.

## 1. 활용한 공공 API

| 제공기관 | 서비스 | Base URL | 용도 |
| --- | --- | --- | --- |
| 한국관광공사 | 국문 관광정보 | `apis.data.go.kr/B551011/KorService2` | 후보 목록·상세의 **근간** |
| 한국관광공사 | 영문 관광정보 | `apis.data.go.kr/B551011/EngService2` | 외국인 사용자용 영문 원문 |
| 한국관광공사 | 무장애 여행정보 | `apis.data.go.kr/B551011/KorWithService2` | 접근성 신호 |
| 기상청 | 단기예보 조회서비스 | `apis.data.go.kr/1360000/VilageFcstInfoService_2.0` | 실외 활동 적합성 판정 |

공통 요청 파라미터: `MobileOS=ETC`, `MobileApp=SafeHour`, `_type=json`

**인증키는 계정당 하나다.** 기상청은 전용 키(`KMA_API_KEY`) 없이 `TOUR_API_KEY` 로
호출된다 — 공공데이터포털은 서비스별 활용신청만 요구하기 때문이다.

## 2. 오퍼레이션별 호출 조건

| 오퍼레이션 | 서비스 | 언제 호출하나 | 주요 파라미터 |
| --- | --- | --- | --- |
| `locationBasedList2` | 국문·영문·무장애 | 추천 생성 1회당 **3콜** (병렬) | `mapX`(경도) `mapY`(위도) `radius=3000` `arrange=E`(거리순) `numOfRows=100` |
| `detailWithTour2` | 무장애 | 무장애 매칭 후보 **상위 3건** | `contentId` |
| `detailCommon2` | 국문·영문 | 장소 상세 진입 시 | `contentId` |
| `detailIntro2` | 국문·영문 | 장소 상세 진입 시 + **추천 시 상위 5건 운영·휴무 확인** | `contentId` `contentTypeId` |
| `detailImage2` | 국문·영문 | 〃 | `contentId` `imageYN=Y` |
| `getUltraSrtNcst` | 기상청 | 추천 생성 시 후보 조회와 **병렬** | `nx` `ny`(격자 변환) `base_date` `base_time` |

### 호출량 산정

| 사용자 행동 | 발생 호출 |
| --- | --- |
| 추천 1회 생성 | 관광 3 + 무장애 상세 최대 3 + **운영·휴무 상세 최대 5** + 기상 1 = **최대 12콜** |
| 변화 이벤트 재계산 | **0콜** — 후보를 클라이언트가 되돌려 보내 재판정만 한다 |
| 장소 상세 1건 | 국문 3 + 영문 3 = **최대 6콜** |

재계산이 0콜인 것이 핵심이다. 심사 시연에서 이벤트를 여러 번 주입해도 호출량이 늘지 않는다.

## 3. 화면 ↔ 내부 API ↔ 공공 API 대응

| 화면 | URL | 내부 API | 공공 API |
| --- | --- | --- | --- |
| 시작·안전 안내 | `/` | 없음 | 없음 |
| 로그인 (Google·Kakao) | `/login` | `/api/auth/login`·`callback`·`session`·`logout` | 없음 |
| 병원 지침 연결 | `/link` | `POST /api/plan/link` | 없음 |
| 오늘의 회복 (홈) | `/today` | `POST /api/today` | **없음** — 게이트 판정만 |
| 병원 안내 (읽기 전용) | `/guide` | 없음 — 기기 저장 지침 표시 | 없음 |
| 계획 확인·외출 판정 | `/plan` | `POST /api/recommend` | 관광 3종 + 기상 |
| 판정 결과 | `/result` | `POST /api/recalculate` | **없음** (재판정만) |
| 장소 상세 | `/place/{id}` | `POST /api/place` | 국문·영문 상세 3종 |
| 개인정보·면책 고지 | `/privacy` | 없음 | 없음 |
| 운영 상태 | `/api/health` | — | 없음 |

**공공 API 를 부르는 화면은 `/plan` 과 `/place` 둘뿐이다.** 로그인·병원 연결·오늘의 회복·
병원 안내는 전부 0콜이며, 심사 시연에서 이 구간을 반복해도 호출량이 늘지 않는다.

변화 전후 비교(SCR007)와 즉시 복귀(SCR008)는 결과 화면 내 모달이다 — 라우트 결정은
`docs/decisions/0001-route-contract.md` 참고. 병원 연동 구조는
`docs/PRODUCT_DEFINITION.md`, 인증은 `docs/decisions/0004-authentication.md` 가 소유한다.

## 4. 데이터가 화면에 쓰이는 방식

| 공공 API 필드 | 화면 표시 | 가공 여부 |
| --- | --- | --- |
| `title` | 추천 카드 제목 | 영문 우선·국문 폴백. **원문 그대로**, 폴백 시 "번역 필요" 배지와 `lang` 속성 표기 |
| `overview` | 장소 상세 관광정보 원문 | **원문 그대로.** SafeHour 문구를 섞지 않음 |
| `addr1`·`addr2` | 장소 상세 주소 | 결합만 |
| `usetime`·`opentime` 등 | 운영시간 | 원문 그대로 + 사용자 언어 라벨. **번역하지 않고, 이 텍스트로 "지금 영업 중"을 판단하지 않음** |
| `restdate` 계열 · `eventstartdate`·`eventenddate` | 휴무·행사 기간 | **닫힘 근거가 명백할 때만 후보에서 제외** (끝난 행사, 오늘과 맞는 정기 휴무 요일). 그 외에는 `openNow=null` 유지 |
| `originimgurl` | 사진 | **URL 참조만.** 다운로드·재가공 없음 |
| `cpyrhtDivCd` | 사진 캡션 저작권 구분 | 코드 → 라벨 변환 (제1유형/제3유형) |
| `mapx`·`mapy` | 거리·이동시간 계산 입력 | 화면에 좌표를 직접 표시하지 않음 |
| 무장애 상세 | 접근성 정보 | 신호 존재 여부만. 보행부담 보정에 **최대 20%** 반영 |
| 기상 `PTY`·`RN1`·`T1H` | "기상 실황" 문구 | 임계값 판정 후 실외 후보 제외 근거로 사용 |

**SafeHour 자체 추정값**(이동시간·보행시간·체류·복귀 여유)은 관광 원문과 **별도 섹션**에
두고 "추정" 배지를 붙인다. 원천 데이터와 자체 계산을 섞지 않는 것이 D07-POL004 요건이다.

## 5. 호출량 통제 (D07-POL005)

| 항목 | 값 | 구현 |
| --- | --- | --- |
| 경고 임계 | operation별 **800회/일** | 로그에 `DAILY_LIMIT_NEAR` 기록 |
| 자체 차단 | operation별 **1,000회/일** | 초과 시 호출 전에 예외 |
| 카운터 기준 | KST 일자 | `logs/tour-api/counter-<날짜>.json` |
| 캐시 | 기본 TTL 15분 | 적중 시 외부 호출·카운터 증가 없음 |
| 인증키 로그 | **미기록** | 로그에 `serviceKey`·전체 query URL 없음 (테스트로 고정) |
| 기준점 좌표 로그 | **미기록** | `mapX`/`mapY` 를 `REDACTED` 로 가림 (D07-POL002, 테스트로 고정) |

이 절은 **TourAPI 호출 로그**에 대한 것이다. 판정 결과 로그는 성격이 달라
`docs/DEPLOYMENT.md` 1.3 과 ADR-0002 에서 따로 다룬다.

경계 동작은 `test/tour-api-limits.test.js` 22건으로 고정돼 있다 —
799/800/999/1000/1001, 병렬 호출 시 한도 초과 방지, 캐시 적중 시 미증가,
좌표 redaction, 로그 쓰기 실패 시 호출 결과 보존.

**서버리스 한계**: Vercel 인스턴스마다 `/tmp` 가 독립이라 카운터가 인스턴스별로 나뉜다.
전역 1,000회 보장이 깨지지만, 한도를 넘겨도 공급자가 거부하고 그것은 "안전한 미추천"
으로 수렴한다. 자세한 근거는 `docs/DEPLOYMENT.md` 1.3.

## 6. 출처 표기

화면에 상시 노출되는 문구다.

| 위치 | 문구 |
| --- | --- |
| 시작 화면 하단 | "관광정보 출처: ⓒ한국관광공사" |
| 결과 화면 하단 | "관광정보 출처: ⓒ한국관광공사 · 기상정보 출처: ⓒ기상청. 이동시간은 경로 API 연결 전까지 보수적 추정값입니다. SafeHour는 의료진의 판단을 대체하지 않습니다." |
| 장소 상세 원문 아래 | "출처: ⓒ한국관광공사" |
| 장소 상세 하단 | "관광정보 출처: ⓒ한국관광공사. SafeHour는 의료진의 판단을 대체하지 않습니다." |
| 사진 캡션 | "제1유형 (출처표시)" / "제3유형 (출처표시-변경금지)" |
| 결과 화면 복귀 정보 | "기상 실황 … (기상청 <발표시각> 발표)" |

### 표기 규칙 (공모전 요강 FAQ)

- **허용**: `출처: ⓒ한국관광공사`, `출처: ⓒ한국관광콘텐츠랩` — 기관명 텍스트 표기
- **지양**: `TourAPI` 등 **API 서비스명 단독 표기**. `KorService2` 같은 오퍼레이션명도 화면에 노출하지 않는다
- **금지**: 공사 공식 CI/BI 로고 이미지 사용, 서비스명·로고에 공사를 지칭하는 표현 사용
- 활용 API 서비스명은 **화면이 아니라 기능설명서 4번 항목**에 기재한다

내부 데이터 필드 `details.sources`(`TourAPI:KorService2` 등)는 진단·증빙용으로 유지하되
화면에는 렌더링하지 않는다. 근거는 `docs/COMPETITION_SUBMISSION.md` 2절 C1.

## 7. 미연동 (의도적)

| API | 상태 | 사유 |
| --- | --- | --- |
| 지도·경로(Directions) | **미연동** | 위치정보 사전검토(문의 2540) 회신 대기. 회신 전 제3자 좌표 전송 금지 |
| 현재 위치(GPS) | **영구 미사용** | D07-BAN002. `Permissions-Policy: geolocation=()` 로 브라우저 레벨 차단 |

이동시간은 지도 API 대신 **보수적 직선거리 추정**(도심 우회계수 1.4, 회복기 환자 속도)을
쓰고, 화면에 "추정" 배지를 반드시 표시한다.

## 8. 운영 증적

| 항목 | 위치 |
| --- | --- |
| 배포 URL | https://safehour.vercel.app |
| 배포·운영 절차 | `docs/DEPLOYMENT.md` |
| 실데이터 판정·재계산 증빙 | `docs/LIVE_SCENARIO_EVIDENCE.md` |
| TourAPI 연결 검증 | `docs/TOUR_API_VALIDATION.md` |
| 강남 고정좌표 데이터 분석 | `docs/GANGNAM_DATA_ANALYSIS.md` |
| 호출 로그·카운터 | `logs/tour-api/` (Git 제외 — 인증키 비기록) |
| **오퍼레이션별 누적 호출표** | `docs/API_USAGE_SNAPSHOT.md` (자동 생성) |
| 배포본 자동 검증 | `npm run verify:deploy -- https://safehour.vercel.app` |

### 호출 이력 축적 루틴 (AX-205)

제출 키를 **하나로 확정한 뒤**, 주 1회 이상 실행한다. 실행할 때마다 실API 검증이 돌고
누적 호출표가 갱신된다.

```bash
npm run usage:weekly
```

`test:tour-api` → `analyze:gangnam` → `demo:live` → `usage:snapshot` 순서로 실행된다.
집계만 다시 하려면 `npm run usage:snapshot`.

- 스냅샷은 **보조 증빙**이다. 제출 시 정본은 공공데이터포털 마이페이지의 키별 호출 통계다.
- 스냅샷 생성 시 호출 로그에 인증키가 남아 있는지 자동 검사하고, 발견되면 **exit 1** 로 멈춘다.
- 배포본 카운터는 Vercel 인스턴스마다 나뉘므로 수치는 **하한**이다.
