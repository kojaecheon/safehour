// 같은 장소가 여러 건으로 등록된 경우를 하나로 합친다.
//
// 국문 관광정보에는 동일 장소가 contentId 를 달리해 두 번 등록돼 있는 경우가 있다.
// 실제로 코엑스 아쿠아리움이 `2507822` 와 `130284` 두 건으로 나와, 추천 3건 중
// 2건이 같은 장소가 된 적이 있다. 회복기 환자에게 외출 기회는 한 번뿐인데
// 선택지가 실질 하나 줄어드는 것은 손해다.
//
// 다만 원문을 함부로 지우지 않는다. **이름이 같고 위치도 같을 때만** 합친다 —
// "이름이 비슷하다" 만으로 지우면 별개 장소를 잃는다 (예: 같은 브랜드의 다른 지점).
// 확실하지 않으면 남긴다.

import { haversineKm } from "../engine/slaCalculator.js";

/** 이름이 같아도 이 거리보다 멀면 다른 장소로 본다 */
export const SAME_PLACE_METERS = 100;

/**
 * 제목에서 비교용 키를 뽑는다.
 *
 * 영문 관광정보는 제목에 국문을 괄호로 함께 준다 —
 * `"COEX Aquarium (코엑스 아쿠아리움)"`. 그래서 한글만 따로 모으면
 * 국문 항목 `"코엑스 아쿠아리움"` 과 맞출 수 있다.
 *
 * 라틴 문자 키도 함께 뽑아, 국문이 없는 항목끼리도 비교되게 한다.
 */
export function titleKeys(title) {
  const text = String(title ?? "");
  const hangul = (text.match(/[가-힣]+/g) ?? []).join("");
  const latin = (text.match(/[A-Za-z]+/g) ?? []).join("").toLowerCase();
  return {
    hangul: hangul.length >= 2 ? hangul : null,
    latin: latin.length >= 3 ? latin : null,
  };
}

/** 좌표가 있고 SAME_PLACE_METERS 안에 있는가. 좌표가 없으면 판단하지 않는다. */
function withinSamePlace(a, b) {
  const ok = (c) => Number.isFinite(c?.lat) && Number.isFinite(c?.lng);
  if (!ok(a) || !ok(b)) return false;
  return haversineKm(a, b) * 1000 <= SAME_PLACE_METERS;
}

function sameName(a, b) {
  const x = titleKeys(a.title);
  const y = titleKeys(b.title);
  if (x.hangul && y.hangul && x.hangul === y.hangul) return true;
  if (x.latin && y.latin && x.latin === y.latin) return true;
  return false;
}

/**
 * 둘 중 남길 후보를 고른다.
 *
 * 대상 사용자가 외국인 환자라 **영문 원문이 있는 쪽**을 우선한다.
 * 그다음은 사진이 있는 쪽, 마지막은 먼저 온 쪽(거리순이므로 더 가깝다).
 */
function richer(a, b) {
  const score = (c) =>
    (c.titleLanguage === "en" ? 2 : 0) + (c.attribution?.imageUrl ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

/**
 * 이름과 위치가 같은 후보를 하나로 합친다.
 *
 * @returns {{candidates: object[], merged: Array<{kept: string, dropped: string, title: string}>}}
 *   `merged` 는 진단용이다 — 무엇이 왜 빠졌는지 설명할 수 있어야 한다.
 */
export function dedupeSamePlace(candidates) {
  const kept = [];
  const merged = [];

  for (const candidate of candidates) {
    const twinIndex = kept.findIndex(
      (other) => sameName(other, candidate) && withinSamePlace(other, candidate),
    );

    if (twinIndex === -1) {
      kept.push(candidate);
      continue;
    }

    const winner = richer(kept[twinIndex], candidate);
    const loser = winner === candidate ? kept[twinIndex] : candidate;
    kept[twinIndex] = winner;
    merged.push({ kept: winner.id, dropped: loser.id, title: winner.title });
  }

  return { candidates: kept, merged };
}
