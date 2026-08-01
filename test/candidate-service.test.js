import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ORIGIN_KIND,
  validateCandidateQuery,
} from "../src/tour-api/candidate-service.js";

describe("TourAPI 후보 조회 안전 경계", () => {
  it("사용자가 선택한 고정 좌표만 허용한다", () => {
    const result = validateCandidateQuery({
      origin: {
        kind: ORIGIN_KIND.USER_SELECTED_FIXED,
        lat: 37.5105,
        lng: 127.059,
      },
      radiusMeters: 3_000,
    });

    assert.equal(result.origin.kind, "USER_SELECTED_FIXED");
    assert.equal(result.radiusMeters, 3_000);
  });

  it("현재 GPS 등 출처가 다른 좌표는 거부한다", () => {
    assert.throws(
      () =>
        validateCandidateQuery({
          origin: {
            kind: "CURRENT_GPS",
            lat: 37.5105,
            lng: 127.059,
          },
          radiusMeters: 3_000,
        }),
      /고정 좌표만 허용/,
    );
  });

  it("20km를 초과하는 반경은 거부한다", () => {
    assert.throws(
      () =>
        validateCandidateQuery({
          origin: {
            kind: ORIGIN_KIND.USER_SELECTED_FIXED,
            lat: 37.5105,
            lng: 127.059,
          },
          radiusMeters: 20_001,
        }),
      /20,000m/,
    );
  });
});
