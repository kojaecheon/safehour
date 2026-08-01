# SafeHour

성형외과·피부과 수술·시술을 받은 외국인 환자와 동반 보호자에게
병원이 제공한 주의조건과 복귀시간 안에서 가능한 관광 선택지만 보여주는 서비스입니다.
SafeHour는 증상이나 회복 단계를 해석해 의료 판단을 하지 않습니다.

## 현재 구현 범위

핵심 세로 흐름을 먼저 구현했습니다.

1. 사용자가 선택한 병원·숙소 고정 좌표 주변의 국문·영문·무장애 TourAPI 후보 조회
2. 영문 우선·국문 폴백과 무장애 신호를 SafeHour 공통 후보로 정규화
3. 병원 조건, 보행·이동 한도, 복귀 SLA에 따른 환자·보호자 코스 판정
4. 휴무·기상·교통·진료시간·환자 호출 발생 시 코스 재계산
5. 상위 1~10개 추천 제한(기본 5개, 실데이터 시연 3개)
6. 상위 추천의 개요·운영정보·이미지 URL 상세 보강

현재 GPS는 서버로 전송하지 않으며, 기준 좌표는 반드시 사용자가 선택한 고정 좌표만 허용합니다.

## 실행

Node.js 20.9 이상이 필요하며 로컬·CI 권장 버전은 Node.js 22입니다. `.env.example`을 참고하여 `.env.local`에
`TOUR_API_KEY`를 저장한 뒤 실행합니다.

```bash
npm ci
npm run dev
```

로컬 품질 기준선은 다음 한 명령으로 확인합니다.

```bash
npm run check
```

실데이터 검증은 API 키와 공공데이터포털 활용 신청이 준비된 환경에서만 실행합니다.

```bash
npm run test:tour-api
npm run analyze:gangnam
npm run demo:live
```

## 모바일 웹 (P0)

Next.js 기반 모바일 웹이 판정 엔진 위에 올라가 있습니다.

```bash
npm install
npm run dev
```

- `/` 시작 화면 → `/plan` 조건 입력 → `/result` 추천·변화 대응·즉시 복귀
- 내부 API: `POST /api/recommend`(조건 → 후보 조회 → 판정), `POST /api/recalculate`(이벤트 → 재판정 델타)
- 판정은 stateless — 서버는 세션·조건을 저장하지 않고, 클라이언트가 재계산 payload를 되돌려 보냅니다
- 엔진은 후보 최대 5개를 산출하고 화면은 상위 3개만 노출합니다
- 병원 안내문 원문은 수집하지 않으며, 현재 GPS는 사용하지 않습니다

`npm run demo:live`는 실데이터 추천 3건을 생성하고, 1순위 장소 휴무 이벤트 후
해당 장소가 제거되어 다음 후보로 대체되는지를 검증합니다.

## TourAPI 연결 검증

검증 대상:

- 국문 관광정보 `KorService2/areaBasedList2`
- 영문 관광정보 `EngService2/areaBasedList2`
- 무장애 여행정보 `KorWithService2/areaBasedList2`
- 무장애 상세정보 `KorWithService2/detailWithTour2`
- 국문·영문 상세 `detailCommon2`, `detailIntro2`, `detailImage2`

응답 원본과 검증 요약은 `artifacts/api-smoke/`에 저장됩니다. 이 디렉터리는 Git에서 제외됩니다.

API 인증키는 호출 로그에 기록하지 않습니다. 일별·오퍼레이션별 호출 수는
`logs/tour-api/`에 남고 800회부터 경고하며, 자체 한도 1,000회에서 추가 호출을 차단합니다.

## 문서

- [AX 개발 워크플로우](docs/AX_WORKFLOW.md)
- [개발 준비 상태와 명세 추적표](docs/DEVELOPMENT_READINESS.md)
- [우선순위 백로그](docs/AX_BACKLOG.md)
- [구현 방향과 다음 단계](docs/IMPLEMENTATION_DIRECTION.md)
- [TourAPI 연결 검증](docs/TOUR_API_VALIDATION.md)
- [강남 고정좌표 데이터 분석](docs/GANGNAM_DATA_ANALYSIS.md)
- [실데이터 판정·재계산 증빙](docs/LIVE_SCENARIO_EVIDENCE.md)
