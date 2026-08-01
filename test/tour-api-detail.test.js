import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCandidateDetails,
  validateDetailRequest,
} from "../src/tour-api/detail-service.js";

describe("TourAPI 상세 요청 검증", () => {
  it("detailCommon2의 폐기 파라미터를 차단한다", () => {
    assert.throws(
      () =>
        validateDetailRequest("detailCommon2", {
          contentId: "100",
          overviewYN: "Y",
        }),
      /폐기된 요청 파라미터/,
    );
  });

  it("detailIntro2는 콘텐츠 유형을 필수로 요구한다", () => {
    assert.throws(
      () => validateDetailRequest("detailIntro2", { contentId: "100" }),
      /contentTypeId/,
    );
  });

  it("신규 detailCommon2 최소 요청을 허용한다", () => {
    assert.doesNotThrow(() =>
      validateDetailRequest("detailCommon2", { contentId: "100" }),
    );
  });
});

describe("TourAPI 상세 응답 정규화", () => {
  it("영문 원문을 우선하고 국문을 폴백으로 보존한다", () => {
    const detail = normalizeCandidateDetails({
      korean: {
        common: {
          overview: "국문 개요 원문",
          addr1: "서울 강남구",
        },
        intro: { usetimeculture: "09:00~18:00" },
        images: [
          {
            originimgurl: "https://example.test/ko.jpg",
            cpyrhtDivCd: "Type1",
          },
        ],
        errors: [],
      },
      english: {
        common: {
          overview: "Original English overview",
          addr1: "Gangnam-gu, Seoul",
        },
        intro: { usetimeculture: "09:00-18:00" },
        images: [
          {
            originimgurl: "https://example.test/en.jpg",
            cpyrhtDivCd: "Type3",
          },
        ],
        errors: [],
      },
    });

    assert.equal(detail.overview, "Original English overview");
    assert.equal(detail.overviewLanguage, "en");
    assert.equal(detail.address, "Gangnam-gu, Seoul");
    assert.equal(detail.operatingSchedule.usetimeculture, "09:00-18:00");
    assert.equal(detail.openNow, null);
    assert.equal(detail.images[0].url, "https://example.test/en.jpg");
    assert.equal(detail.images[0].copyrightDivisionCode, "Type3");
    assert.equal(detail.original.korean.common.overview, "국문 개요 원문");
  });

  it("영문 상세가 없으면 국문 원문을 사용한다", () => {
    const detail = normalizeCandidateDetails({
      korean: {
        common: { overview: "국문 개요" },
        intro: {},
        images: [],
        errors: [],
      },
      english: null,
    });

    assert.equal(detail.overview, "국문 개요");
    assert.equal(detail.overviewLanguage, "ko");
    assert.equal(detail.openNowReason, "SCHEDULE_NOT_PROVIDED");
  });
});
