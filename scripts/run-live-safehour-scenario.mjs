import fs from "node:fs/promises";
import path from "node:path";
import { createFallbackEstimator } from "../src/adapters/travelTime.js";
import { applyEvent, recommend } from "../src/engine/recommend.js";
import {
  loadSafeHourCandidates,
  ORIGIN_KIND,
} from "../src/tour-api/candidate-service.js";
import { enrichRecommendedCourse } from "../src/tour-api/detail-service.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const ARTIFACT_ROOT = path.join(PROJECT_ROOT, "artifacts", "live-scenario");
const EVIDENCE_DOCUMENT = path.join(
  PROJECT_ROOT,
  "docs",
  "LIVE_SCENARIO_EVIDENCE.md",
);

const ORIGIN = Object.freeze({
  kind: ORIGIN_KIND.USER_SELECTED_FIXED,
  label: "강남 테스트 기준점",
  lat: 37.5105,
  lng: 127.059,
});

function compactCourse(course) {
  return course.slice(0, 8).map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    titleLanguage: candidate.titleLanguage,
    indoor: candidate.indoor,
    walkMin: candidate.walkMin,
    stayMin: candidate.patient?.stayMin ?? candidate.companion?.stayMin ?? null,
    slackMin: candidate.sla?.slackMin ?? null,
    source: candidate.source,
    details: candidate.details
      ? {
          overviewLanguage: candidate.details.overviewLanguage,
          hasOverview: Boolean(candidate.details.overview),
          scheduleFields: Object.keys(candidate.details.operatingSchedule),
          openNow: candidate.details.openNow,
          openNowReason: candidate.details.openNowReason,
          imageCount: candidate.details.images.length,
          errorCount: candidate.details.errors.length,
        }
      : null,
  }));
}

function createEvidenceDocument({
  generatedAt,
  candidateResult,
  initial,
  initialDetailedCourse,
  closure,
}) {
  const firstBefore = initial.course[0];
  const removedTitles = closure.delta.removed.map((id) => {
    return initial.course.find((candidate) => candidate.id === id)?.title ?? id;
  });
  const addedTitles = closure.delta.added.map((id) => {
    return closure.result.course.find((candidate) => candidate.id === id)?.title ?? id;
  });
  const detailSummary = initialDetailedCourse.reduce(
    (summary, candidate) => {
      if (!candidate.details) return summary;
      summary.candidates += 1;
      if (candidate.details.overview) summary.overviews += 1;
      summary.scheduleFields += Object.keys(
        candidate.details.operatingSchedule,
      ).length;
      summary.imageUrls += candidate.details.images.length;
      summary.errors += candidate.details.errors.length;
      return summary;
    },
    {
      candidates: 0,
      overviews: 0,
      scheduleFields: 0,
      imageUrls: 0,
      errors: 0,
    },
  );

  return `# SafeHour 실데이터 판정·재계산 증빙

생성일: ${generatedAt}

## 시나리오

- 사용자 현재 GPS가 아닌 사용자가 선택한 강남 고정 좌표 사용
- TourAPI 반경 3km의 실시간 후보 조회
- 병원 조건: 외출 허용, 실내 전용, 자외선 회피, 최대 보행 20분, 편도 이동 30분
- 복귀시간: 실행 시점으로부터 150분
- 이동시간: 지도 API 승인 전 보수적 폴백 추정

## TourAPI → 판정 엔진 연결

| 항목 | 결과 |
|---|---:|
| 국문 반경 전체 | ${candidateResult.diagnostics.totals.korean} |
| 영문 반경 전체 | ${candidateResult.diagnostics.totals.english} |
| 무장애 반경 전체 | ${candidateResult.diagnostics.totals.barrierFree} |
| 엔진 입력 후보 | ${candidateResult.candidates.length} |
| 영문 자동 연결 | ${candidateResult.diagnostics.matching.english.matched} |
| 무장애 자동 연결 | ${candidateResult.diagnostics.matching.barrierFree.matched} |
| 무장애 상세 반영 | ${candidateResult.diagnostics.barrierDetailCount} |

## 상위 추천 상세 API 보강

| 항목 | 결과 |
|---|---:|
| 상세 조회 추천 | ${detailSummary.candidates} |
| 원문 개요 보유 | ${detailSummary.overviews} |
| 운영·휴무 원문 필드 | ${detailSummary.scheduleFields} |
| 이미지 URL | ${detailSummary.imageUrls} |
| 상세조회 오류 | ${detailSummary.errors} |

운영시간 원문이 있어도 현재 영업 여부를 임의 해석하지 않고 \`openNow=null\`을 유지한다.
이미지는 다운로드하지 않고 제공 URL과 저작권 구분코드만 보존한다.

## 최초 판정

- 상태: **${initial.state}**
- 추천 후보: ${initial.course.length}건
- 제외 후보: ${initial.excluded.length}건
- 출발 마감시각: ${initial.latestDepartureAt?.toISOString() ?? "없음"}
- 최초 추천: ${firstBefore?.title ?? "추천 없음"}

## 실시간 변수 주입

- 이벤트: 최초 추천 장소의 갑작스러운 휴무
- 변화 발생: **${closure.delta.hasVisibleChange}**
- 제거된 후보: ${removedTitles.join(", ") || "없음"}
- 새 대체 후보: ${addedTitles.join(", ") || "없음"}
- 변경 전 상태: ${closure.before.state}
- 변경 후 상태: ${closure.after.state}
- 변경 전 코스 수: ${closure.before.courseIds.length}
- 변경 후 코스 수: ${closure.after.courseIds.length}

## 과제 1 증명

SafeHour는 휴무 알림만 표시하지 않는다. 기존 코스를 다시 판정해 휴무 장소를 제거하고,
남은 후보를 복귀 SLA와 병원 조건으로 다시 계산한다. \`delta.hasVisibleChange=true\`를
자동 검증하므로 “알림만 발생하고 코스가 그대로인 구현”을 출시 차단할 수 있다.
`;
}

async function main() {
  const candidateResult = await loadSafeHourCandidates({
    origin: ORIGIN,
    radiusMeters: 3_000,
    numOfRows: 100,
    barrierDetailLimit: 3,
    useCache: true,
  });

  const now = new Date();
  const input = {
    condition: {
      version: "demo-condition-v1",
      issuedAt: now,
      issuedBy: "hospital-coordinator-demo",
      fasting: false,
      outingAllowed: true,
      escortRequired: false,
      avoidUv: true,
      indoorOnly: true,
      maxWalkMin: 20,
      maxTravelMin: 30,
    },
    plan: {
      now,
      returnBy: new Date(now.getTime() + 150 * 60_000),
      origin: ORIGIN,
      hospital: ORIGIN,
      maxResults: 3,
    },
    roles: {
      hasCompanion: true,
      companionSeparateAllowed: true,
      patientResting: false,
    },
    candidates: candidateResult.candidates,
    travelTime: createFallbackEstimator(),
  };

  const initial = recommend(input);
  if (initial.course.length === 0) {
    throw new Error(
      `실시간 변화 검증용 최초 추천이 없습니다. 상태=${initial.state}`,
    );
  }

  const closure = applyEvent(input, {
    type: "CLOSURE",
    closedIds: [initial.course[0].id],
  });
  if (!closure.delta.hasVisibleChange) {
    throw new Error("과제 1 실패: 휴무 이벤트 후 사용자에게 보이는 변화가 없습니다.");
  }

  const uniqueRecommended = [
    ...new Map(
      [...initial.course, ...closure.result.course].map((candidate) => [
        candidate.id,
        candidate,
      ]),
    ).values(),
  ];
  const detailedRecommended = await enrichRecommendedCourse(
    uniqueRecommended,
    { limit: uniqueRecommended.length, useCache: true },
  );
  const detailsByCandidateId = new Map(
    detailedRecommended.map((candidate) => [candidate.id, candidate.details]),
  );
  const withDetails = (course) =>
    course.map((candidate) => ({
      ...candidate,
      details: detailsByCandidateId.get(candidate.id) ?? null,
    }));
  const initialDetailedCourse = withDetails(initial.course);
  const closureDetailedCourse = withDetails(closure.result.course);

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const outputDirectory = path.join(ARTIFACT_ROOT, timestamp);
  await fs.mkdir(outputDirectory, { recursive: true });

  const artifact = {
    generatedAt: new Date().toISOString(),
    diagnostics: candidateResult.diagnostics,
    initial: {
      state: initial.state,
      reasons: initial.reasons,
      course: compactCourse(initialDetailedCourse),
      excludedCount: initial.excluded.length,
      decisions: initial.decisions,
    },
    closure: {
      event: closure.event,
      before: closure.before,
      after: closure.after,
      delta: closure.delta,
      course: compactCourse(closureDetailedCourse),
    },
  };

  await fs.writeFile(
    path.join(outputDirectory, "result.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    EVIDENCE_DOCUMENT,
    createEvidenceDocument({
      generatedAt: artifact.generatedAt,
      candidateResult,
      initial,
      initialDetailedCourse,
      closure,
    }),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        candidateCount: candidateResult.candidates.length,
        initialState: initial.state,
        initialCourseCount: initial.course.length,
        event: closure.event.type,
        changed: closure.delta.hasVisibleChange,
        removed: closure.delta.removed,
        afterState: closure.after.state,
        document: EVIDENCE_DOCUMENT,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`SafeHour 실데이터 시나리오 실패: ${error.message}`);
  process.exitCode = 1;
});
