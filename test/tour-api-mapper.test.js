import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFallbackEstimator } from "../src/adapters/travelTime.js";
import { recommend } from "../src/engine/recommend.js";
import { tourApiResponseHeader } from "../src/tour-api/client.js";
import {
  canonicalContentType,
  matchTourItems,
  normalizeTourCandidate,
} from "../src/tour-api/mapper.js";

const NOW = new Date("2026-07-30T10:00:00+09:00");

const koreanCulture = Object.freeze({
  contentid: "kor-100",
  contenttypeid: "14",
  title: "테스트 문화시설",
  addr1: "서울특별시 강남구 테스트로 1",
  mapx: "127.0592",
  mapy: "37.5110",
  modifiedtime: "20260729120000",
  firstimage: "https://example.test/image.jpg",
  cpyrhtDivCd: "Type1",
  cat1: "A02",
  cat2: "A0206",
  cat3: "A02060100",
});

const englishCulture = Object.freeze({
  contentid: "eng-900",
  contenttypeid: "78",
  title: "Test Cultural Facility",
  addr1: "1, Test-ro, Gangnam-gu, Seoul",
  mapx: "127.0592",
  mapy: "37.5110",
  modifiedtime: "20260729120000",
});

const barrierCulture = Object.freeze({
  contentid: "bf-700",
  contenttypeid: "14",
  title: "테스트 문화시설",
  mapx: "127.0592",
  mapy: "37.5110",
  modifiedtime: "20260729120000",
});

const barrierDetail = Object.freeze({
  contentid: "bf-700",
  route: "출입구까지 턱이 없음",
  elevator: "엘리베이터 있음",
});

describe("TourAPI 다국어 매칭", () => {
  it("영문 콘텐츠 유형을 국문 기준 유형으로 정규화한다", () => {
    assert.equal(canonicalContentType("78"), "14");
    assert.equal(canonicalContentType("82"), "39");
    assert.equal(canonicalContentType("14"), "14");
  });

  it("ID가 달라도 같은 유형·20m 이내 좌표면 영문 항목으로 연결한다", () => {
    const [match] = matchTourItems([koreanCulture], [englishCulture]);

    assert.equal(match.localized.contentid, "eng-900");
    assert.equal(match.matchStrategy, "coordinate20m");
  });

  it("좌표가 가까워도 콘텐츠 유형이 다르면 자동 연결하지 않는다", () => {
    const [match] = matchTourItems(
      [koreanCulture],
      [{ ...englishCulture, contenttypeid: "82" }],
    );

    assert.equal(match.localized, null);
    assert.equal(match.matchStrategy, null);
  });
});

describe("TourAPI 오류 응답", () => {
  it("상위 레벨 공급자 오류 코드도 식별한다", () => {
    assert.deepEqual(
      tourApiResponseHeader({
        resultCode: "10",
        resultMsg: "INVALID_REQUEST_PARAMETER_ERROR(addrinfoYN)",
      }),
      {
        resultCode: "10",
        resultMsg: "INVALID_REQUEST_PARAMETER_ERROR(addrinfoYN)",
      },
    );
  });
});

describe("TourAPI → SafeHour 후보 정규화", () => {
  it("영문 제목을 우선하고 국문 ID를 정규화 기준으로 유지한다", () => {
    const candidate = normalizeTourCandidate({
      korean: koreanCulture,
      english: englishCulture,
      barrierFree: barrierCulture,
      barrierFreeDetail: barrierDetail,
      now: NOW,
    });

    assert.equal(candidate.id, "kor-100");
    assert.equal(candidate.title, "Test Cultural Facility");
    assert.equal(candidate.titleLanguage, "en");
    assert.equal(candidate.needsTranslation, false);
    assert.equal(candidate.tourismEligible, true);
    assert.deepEqual(candidate.sourceIds, {
      korean: "kor-100",
      english: "eng-900",
      barrierFree: "bf-700",
    });
  });

  it("무장애 신호는 보행 부담 추정치를 제한적으로만 낮춘다", () => {
    const candidate = normalizeTourCandidate({
      korean: koreanCulture,
      barrierFreeDetail: barrierDetail,
      now: NOW,
    });

    assert.equal(candidate.walkMin, 14);
    assert.deepEqual(candidate.sourceMetadata.accessibilitySignals, [
      "route",
      "elevator",
    ]);
    assert.equal(candidate.walkEstimateConfidence, "heuristic");
  });

  it("영문이 없으면 국문을 폴백하고 번역 필요 상태를 표시한다", () => {
    const candidate = normalizeTourCandidate({
      korean: {
        ...koreanCulture,
        contentid: "food-1",
        contenttypeid: "39",
        title: "테스트 음식점",
      },
      now: NOW,
    });

    assert.equal(candidate.title, "테스트 음식점");
    assert.equal(candidate.titleLanguage, "ko");
    assert.equal(candidate.needsTranslation, true);
    assert.equal(candidate.hasFood, true);
    assert.equal(candidate.indoor, true);
  });

  it("관광지의 실내 여부가 불명확하면 추정하지 않고 null로 둔다", () => {
    const candidate = normalizeTourCandidate({
      korean: {
        ...koreanCulture,
        contentid: "spot-1",
        contenttypeid: "12",
      },
      now: NOW,
    });

    assert.equal(candidate.indoor, null);
    assert.equal(candidate.uvExposed, null);
  });

  it("숙박시설은 관광 활동 후보로 추천하지 않는다", () => {
    const candidate = normalizeTourCandidate({
      korean: {
        ...koreanCulture,
        contentid: "hotel-1",
        contenttypeid: "32",
        title: "테스트 숙박시설",
      },
      now: NOW,
    });

    const result = recommend({
      condition: {
        version: "hospital-rule-v1",
        issuedAt: NOW,
        issuedBy: "hospital-coordinator",
        fasting: false,
        outingAllowed: true,
        escortRequired: false,
        avoidUv: false,
        indoorOnly: false,
        maxWalkMin: 20,
        maxTravelMin: 30,
      },
      plan: {
        now: NOW,
        returnBy: new Date("2026-07-30T12:30:00+09:00"),
        origin: { lat: 37.5105, lng: 127.0588 },
        hospital: { lat: 37.5105, lng: 127.0588 },
      },
      roles: {
        hasCompanion: true,
        companionSeparateAllowed: true,
        patientResting: false,
      },
      candidates: [candidate],
      travelTime: createFallbackEstimator(),
    });

    assert.equal(result.course.length, 0);
    assert.ok(
      result.excluded[0].reasons.includes("NON_TOURISM_ACTIVITY"),
    );
  });

  it("정규화 후보가 판정 엔진의 입력으로 직접 동작한다", () => {
    const candidate = normalizeTourCandidate({
      korean: koreanCulture,
      english: englishCulture,
      barrierFree: barrierCulture,
      barrierFreeDetail: barrierDetail,
      tags: { openNow: true, congestion: "low" },
      now: NOW,
    });

    const result = recommend({
      condition: {
        version: "hospital-rule-v1",
        issuedAt: NOW,
        issuedBy: "hospital-coordinator",
        fasting: false,
        outingAllowed: true,
        escortRequired: false,
        avoidUv: true,
        indoorOnly: true,
        maxWalkMin: 20,
        maxTravelMin: 30,
      },
      plan: {
        now: NOW,
        returnBy: new Date("2026-07-30T12:30:00+09:00"),
        origin: { lat: 37.5105, lng: 127.0588 },
        hospital: { lat: 37.5105, lng: 127.0588 },
      },
      roles: {
        hasCompanion: true,
        companionSeparateAllowed: true,
        patientResting: false,
      },
      candidates: [candidate],
      travelTime: createFallbackEstimator(),
    });

    assert.equal(result.state, "TOGETHER");
    assert.equal(result.course[0].id, "kor-100");
    assert.ok(result.decisions.length > 0);
  });
});
