import fs from "node:fs/promises";
import path from "node:path";
import {
  callTourApi,
  extractTourItems,
  tourApiCounterSummary,
  tourTotalCount,
} from "../src/tour-api/client.js";
import {
  matchTourItems,
  normalizeTourCandidate,
} from "../src/tour-api/mapper.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "artifacts", "gangnam-analysis");
const DOCUMENT_PATH = path.join(
  PROJECT_ROOT,
  "docs",
  "GANGNAM_DATA_ANALYSIS.md",
);

// 사용자 GPS가 아니라 서비스 시연용으로 사용자가 선택했다고 가정한 고정 좌표.
const TEST_ORIGIN = Object.freeze({
  label: "강남 테스트 기준점",
  lat: 37.5105,
  lng: 127.059,
});
const RADIUS_METERS = 3_000;
const NUM_ROWS = 100;
const DETAIL_SAMPLE_LIMIT = 3;

async function fetchLocationList(serviceName) {
  return callTourApi({
    serviceName,
    operation: "locationBasedList2",
    parameters: {
      mapX: String(TEST_ORIGIN.lng),
      mapY: String(TEST_ORIGIN.lat),
      radius: String(RADIUS_METERS),
      arrange: "E",
      numOfRows: String(NUM_ROWS),
      pageNo: "1",
    },
    useCache: false,
  });
}

async function fetchBarrierDetails(barrierItems) {
  const entries = [];

  for (const item of barrierItems.slice(0, DETAIL_SAMPLE_LIMIT)) {
    const result = await callTourApi({
      serviceName: "barrierFree",
      operation: "detailWithTour2",
      parameters: {
        contentId: String(item.contentid),
        numOfRows: "10",
        pageNo: "1",
      },
      useCache: false,
    });

    entries.push([
      String(item.contentid),
      extractTourItems(result)[0] ?? null,
    ]);
  }

  return Object.fromEntries(entries);
}

function countBy(values, selector) {
  return values.reduce((counts, value) => {
    const key = String(selector(value));
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeMatch(matches) {
  return {
    totalPrimary: matches.length,
    matched: matches.filter((match) => match.localized).length,
    byStrategy: countBy(
      matches.filter((match) => match.localized),
      (match) => match.matchStrategy,
    ),
  };
}

function markdownTableRows(candidates) {
  return candidates
    .slice(0, 8)
    .map(
      (candidate) =>
        `| ${candidate.title.replaceAll("|", "\\|")} | ${
          candidate.titleLanguage
        } | ${candidate.indoor ?? "불명"} | ${candidate.walkMin}분 | ${
          candidate.sourceMetadata.accessibilitySignals.join(", ") || "없음"
        } |`,
    );
}

function createDocument({
  koreanResult,
  englishResult,
  barrierResult,
  englishMatchSummary,
  barrierMatchSummary,
  candidates,
  detailsById,
}) {
  const indoorCounts = countBy(
    candidates,
    (candidate) =>
      candidate.indoor === true
        ? "indoor"
        : candidate.indoor === false
          ? "outdoor"
          : "unknown",
  );
  const translationRequired = candidates.filter(
    (candidate) => candidate.needsTranslation,
  ).length;
  const withAccessibilityDetail = candidates.filter(
    (candidate) =>
      candidate.sourceMetadata.accessibilitySignals.length > 0,
  ).length;

  return `# SafeHour 강남 고정좌표 TourAPI 분석

검증일: ${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date())}

## 검증 목적

- 사용자 GPS를 사용하지 않고 사용자가 선택한 병원·숙소 고정 좌표로 주변 후보를 생성한다.
- \`locationBasedList2\`의 20km 제한보다 작은 3km 반경을 사용한다.
- 국문 후보에 영문·무장애 데이터를 연결해 SafeHour 엔진 입력으로 변환한다.
- 원문은 수정하지 않고 자체 추정값은 별도 필드로 분리한다.

## 요청 조건

- 기준점: ${TEST_ORIGIN.label} (${TEST_ORIGIN.lat}, ${TEST_ORIGIN.lng})
- 반경: ${RADIUS_METERS.toLocaleString()}m
- 요청 건수: 서비스별 최대 ${NUM_ROWS}건
- 현재 GPS 서버 전송: 사용하지 않음

## 실 API 응답

| 서비스 | 반경 내 전체 건수 | 이번 수신 |
|---|---:|---:|
| 국문 관광정보 | ${tourTotalCount(koreanResult).toLocaleString()} | ${extractTourItems(koreanResult).length} |
| 영문 관광정보 | ${tourTotalCount(englishResult).toLocaleString()} | ${extractTourItems(englishResult).length} |
| 무장애 여행정보 | ${tourTotalCount(barrierResult).toLocaleString()} | ${extractTourItems(barrierResult).length} |

## 교차 데이터 매칭

| 연결 대상 | 기준 후보 | 연결 성공 | ID 일치 | 좌표 20m 이내 |
|---|---:|---:|---:|---:|
| 국문 → 영문 | ${englishMatchSummary.totalPrimary} | ${englishMatchSummary.matched} | ${englishMatchSummary.byStrategy.contentId ?? 0} | ${englishMatchSummary.byStrategy.coordinate20m ?? 0} |
| 국문 → 무장애 | ${barrierMatchSummary.totalPrimary} | ${barrierMatchSummary.matched} | ${barrierMatchSummary.byStrategy.contentId ?? 0} | ${barrierMatchSummary.byStrategy.coordinate20m ?? 0} |

### 폴백 결정

- 자동 연결은 동일 \`contentId\` 또는 동일 콘텐츠 유형·좌표 20m 이내일 때만 허용한다.
- 영문 연결이 확인되지 않은 국문 후보 ${translationRequired}건은 국문 원문을 유지하고 \`needsTranslation=true\`로 분리한다.
- 제목이나 주소만으로 유사 매칭하지 않는다. 잘못된 장소 연결이 번역 누락보다 위험하기 때문이다.

## SafeHour 후보 정규화

- 실내 판정: ${indoorCounts.indoor ?? 0}건
- 실외 판정: ${indoorCounts.outdoor ?? 0}건
- 불명확하여 보수적으로 유지: ${indoorCounts.unknown ?? 0}건
- 무장애 상세 표본: ${Object.keys(detailsById).length}건
- 접근성 신호가 실제 보행부담 보정에 반영된 후보: ${withAccessibilityDetail}건

| 후보명 | 노출 언어 | 실내 여부 | 보행부담 추정 | 접근성 근거 |
|---|---|---|---:|---|
${markdownTableRows(candidates).join("\n")}

## 구현 원칙

1. \`contenttypeid\`만으로 실외라고 단정하지 않는다. 문화시설·숙박·쇼핑·음식점만 실내로 1차 분류하고 나머지는 불명으로 둔다.
2. 불명 후보는 병원의 실내 전용 조건이나 기상 악화 시 판정 엔진이 제외한다.
3. 무장애 정보는 실제 보행시간이 아니므로 휴리스틱 보행부담을 최대 20%까지만 낮춘다.
4. 운영시간·휴무일은 다음 단계에서 \`detailIntro2\`로 보강하며, 확인 전에는 \`openNow=null\`을 유지한다.
5. 이미지 파일은 내려받지 않고 TourAPI가 제공한 URL과 저작권 구분코드만 보존한다.

## 다음 연결

- \`detailCommon2\`: 원문 개요·상세 주소·좌표
- \`detailIntro2\`: 운영시간·휴무일
- \`detailImage2\`: 이미지 URL과 저작권 표시
- 실제 지도 API 승인 전까지 이동시간은 보수적 직선거리 폴백을 사용
`;
}

async function main() {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const outputDirectory = path.join(OUTPUT_ROOT, timestamp);
  await fs.mkdir(outputDirectory, { recursive: true });

  const [koreanResult, englishResult, barrierResult] = await Promise.all([
    fetchLocationList("korean"),
    fetchLocationList("english"),
    fetchLocationList("barrierFree"),
  ]);

  const koreanItems = extractTourItems(koreanResult);
  const englishItems = extractTourItems(englishResult);
  const barrierItems = extractTourItems(barrierResult);

  const englishMatches = matchTourItems(koreanItems, englishItems);
  const barrierMatches = matchTourItems(koreanItems, barrierItems);
  const englishByKoreanId = new Map(
    englishMatches.map((match) => [
      String(match.primary.contentid),
      match.localized,
    ]),
  );
  const barrierByKoreanId = new Map(
    barrierMatches.map((match) => [
      String(match.primary.contentid),
      match.localized,
    ]),
  );

  const matchedBarrierItems = barrierMatches
    .map((match) => match.localized)
    .filter(Boolean);
  const detailsById = await fetchBarrierDetails(matchedBarrierItems);

  const candidates = koreanItems.map((korean) => {
    const english = englishByKoreanId.get(String(korean.contentid));
    const barrierFree = barrierByKoreanId.get(String(korean.contentid));

    return normalizeTourCandidate({
      korean,
      english,
      barrierFree,
      barrierFreeDetail: barrierFree
        ? detailsById[String(barrierFree.contentid)]
        : null,
    });
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    origin: TEST_ORIGIN,
    radiusMeters: RADIUS_METERS,
    totals: {
      korean: tourTotalCount(koreanResult),
      english: tourTotalCount(englishResult),
      barrierFree: tourTotalCount(barrierResult),
    },
    matching: {
      english: summarizeMatch(englishMatches),
      barrierFree: summarizeMatch(barrierMatches),
    },
    candidates,
    callCounter: tourApiCounterSummary(),
  };

  await fs.writeFile(
    path.join(outputDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  const document = createDocument({
    koreanResult,
    englishResult,
    barrierResult,
    englishMatchSummary: summary.matching.english,
    barrierMatchSummary: summary.matching.barrierFree,
    candidates,
    detailsById,
  });
  await fs.writeFile(DOCUMENT_PATH, document, "utf8");

  console.log(
    JSON.stringify(
      {
        totals: summary.totals,
        matching: summary.matching,
        candidateCount: candidates.length,
        barrierDetailSamples: Object.keys(detailsById).length,
        document: DOCUMENT_PATH,
        artifact: path.join(outputDirectory, "summary.json"),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`강남 TourAPI 분석 실패: ${error.message}`);
  process.exitCode = 1;
});
