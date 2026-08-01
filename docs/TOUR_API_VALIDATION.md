# SafeHour TourAPI 연결 검증 결과

검증일: 2026-07-30 (KST)

## 결론

SafeHour에 사용할 한국관광공사 TourAPI 3종과 무장애 상세조회가 모두 정상 응답했다.
네 요청 모두 HTTP 상태 `200`, 공공데이터포털 결과코드 `0000`을 반환했다.

## 검증 환경

- Mobile OS: `ETC`
- Mobile App: `SafeHour`
- 응답 형식: `JSON`
- 지역 조건: 서울특별시 (`areaCode=1`)
- 목록 요청 건수: 5건
- 인증키: `.env.local`에서만 로드하며 로그와 결과 파일에는 저장하지 않음

## 검증 결과

| 구분 | 요청 기능 | HTTP | 결과코드 | 서울 기준 전체 건수 | 수신 건수 |
|---|---|---:|---:|---:|---:|
| 국문 관광정보 | `KorService2/areaBasedList2` | 200 | 0000 | 2,274 | 5 |
| 영문 관광정보 | `EngService2/areaBasedList2` | 200 | 0000 | 731 | 5 |
| 무장애 여행정보 | `KorWithService2/areaBasedList2` | 200 | 0000 | 633 | 5 |
| 무장애 상세정보 | `KorWithService2/detailWithTour2` | 200 | 0000 | 1 | 1 |

전체 건수는 검증 시점의 서울 지역 조회 결과이며 데이터 갱신에 따라 달라질 수 있다.

## 표본 응답

- 국문: 가나돈까스의집 — 서울특별시 강남구 언주로 608
- 영문: 10 Corso Como Cheongdam Branch — 416, Apgujeong-ro, Gangnam-gu, Seoul
- 무장애: 가담 — 서울특별시 강남구 언주로167길 35
- 무장애 상세: 목록에서 받은 `contentId=2869760`으로 상세조회 성공

## SafeHour 활용 구조

1. 국문 관광정보를 관광지 기본정보와 영문 미제공 콘텐츠의 폴백 원본으로 사용한다.
2. 영문 관광정보를 외국인 환자와 보호자의 기본 표출 데이터로 사용한다.
3. 무장애 목록정보로 이동 제약이 있는 회복기 환자의 관광 후보를 우선 선별한다.
4. `detailWithTour2`의 접근성 정보를 SafeHour 판정 엔진의 이동·편의시설 조건으로 사용한다.
5. 병원 위치, 복귀시간, 병원 주의사항은 관광 데이터보다 우선하는 필수 제한조건으로 적용한다.

## 상세 API 추가 검증

강남 고정좌표의 실제 상위 추천과 대체 후보에 국문·영문 상세 API를 연결했다.

| 기능 | 필수 요청값 | 검증 결과 | 활용 |
|---|---|---|---|
| `detailCommon2` | `contentId` | 0000 | 원문 개요·주소·연락처 |
| `detailIntro2` | `contentId`, `contentTypeId` | 0000 | 운영시간·휴무일 원문 |
| `detailImage2` | `contentId`, `imageYN=Y` | 0000 | 이미지 URL·저작권 구분코드 |

2026년 변경된 `detailCommon2`에서는 과거의 `overviewYN`, `addrinfoYN`,
`mapinfoYN` 같은 선택 플래그가 제거되었다. 이 값을 보내면 HTTP 200이어도 공급자 오류
`INVALID_REQUEST_PARAMETER_ERROR`가 반환되므로 요청 검증 단계에서 차단한다.
`detailImage2`의 폐기된 `subImageYN`도 사용하지 않는다.

실데이터 시연에서는 최초 추천 3건 모두 원문 개요를 확보했고, 운영·휴무 원문 필드
6개와 이미지 URL 26개를 확인했다. 현재 영업 여부는 운영시간 문장을 임의로 해석하지
않고 `openNow=null`로 유지한다.

## 재검증

프로젝트 루트에서 다음 명령을 실행한다.

```bash
npm run test:tour-api
```

검증 응답은 `artifacts/api-smoke/`에 저장되며 해당 디렉터리는 Git에서 제외된다.
