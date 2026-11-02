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

describe("TourAPI 상세 응답 정규화 — 선택 언어 (AX-308 · spec 4.8)", () => {
  const locale = (overview, addr1, url) => ({
    common: overview === undefined ? null : { overview, addr1 },
    intro: {},
    images: url ? [{ originimgurl: url, cpyrhtDivCd: "Type1" }] : [],
    errors: [],
  });

  it("zh 는 중문 → 영문 → 국문 순으로 필드마다 고른다", () => {
    const detail = normalizeCandidateDetails({
      lang: "zh",
      korean: locale("국문 개요", "서울", "https://example.test/ko.jpg"),
      english: locale("English overview", "Seoul", null),
      chineseSimplified: locale("中文概要", "首尔", null),
    });
    assert.equal(detail.overview, "中文概要");
    assert.equal(detail.overviewLanguage, "zh");
    assert.equal(detail.address, "首尔");
    // 중문·영문 이미지가 없으면 국문 이미지
    assert.equal(detail.images[0].url, "https://example.test/ko.jpg");
    assert.deepEqual(detail.sources, ["TourAPI:KorService2", "TourAPI:EngService2", "TourAPI:ChsService2"]);
    assert.equal(detail.original.chineseSimplified.common.overview, "中文概要");
  });

  it("ja 개요가 비어 있으면 다음 언어의 개요를 쓰고 그 언어를 표기한다", () => {
    const detail = normalizeCandidateDetails({
      lang: "ja",
      korean: locale("국문 개요", "서울"),
      japanese: locale("", "ソウル"),
    });
    assert.equal(detail.overview, "국문 개요");
    assert.equal(detail.overviewLanguage, "ko");
    assert.equal(detail.address, "ソウル");
  });

  it("ko 는 영문 원문이 있어도 국문을 쓴다", () => {
    const detail = normalizeCandidateDetails({
      lang: "ko",
      korean: locale("국문 개요", "서울"),
      english: locale("English overview", "Seoul"),
    });
    assert.equal(detail.overview, "국문 개요");
    assert.equal(detail.overviewLanguage, "ko");
  });
});
