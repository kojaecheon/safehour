// 운영 스위치 — 배포 후 코드 수정 없이 즉시 동작을 바꿀 수 있어야 하는 것만 둔다.
//
// 원칙 (D06-E014, D07-POL006)
//   - kill switch 는 "더 안전한 쪽으로만" 움직인다. 추천을 켜는 스위치는 없다.
//   - 스위치 상태는 응답에 드러내 사용자가 이유를 알 수 있게 한다. 조용히 막지 않는다.
//   - 환경변수로 제어한다 — Vercel 대시보드에서 재배포 없이 값을 바꾸고
//     재시작하면 즉시 반영되므로 사고 대응 시간이 짧다.

/** 값이 "켜짐"으로 해석되는가 — 실수로 문자열 'false' 를 켜짐으로 읽지 않는다 */
function isEnabled(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

/**
 * 추천 전면 중단 스위치.
 * 켜지면 판정을 돌리지 않고 모든 요청을 NO_TOURISM 으로 응답한다.
 * 위험 추천이 발견됐을 때 코드 배포를 기다리지 않고 즉시 차단하기 위한 것이다.
 */
export function isRecommendationKilled() {
  return isEnabled(process.env.SAFEHOUR_KILL_RECOMMENDATION);
}

/**
 * kill switch 가 켜졌을 때 사용자에게 보여줄 판정.
 * 오류 화면이 아니라 정상적인 미추천 결과로 표시된다 (D05 7장).
 */
export function killSwitchDecision() {
  return {
    state: 'NO_TOURISM',
    reasons: ['SERVICE_PAUSED'],
    course: [],
    excluded: [],
    decisions: [
      {
        step: 'killSwitch',
        result: 'blocked',
        detail: 'SAFEHOUR_KILL_RECOMMENDATION',
        at: new Date().toISOString(),
      },
    ],
    patientCourse: [],
    companionCourse: [],
    returnNow: false,
  };
}

/**
 * 운영자가 대시보드에서 확인할 수 있는 현재 스위치 상태.
 * 켜져 있다는 사실 자체는 비밀이 아니다 — 오히려 드러나야 대응이 빨라진다.
 */
export function runtimeFlagsSnapshot() {
  return {
    recommendationKilled: isRecommendationKilled(),
  };
}
