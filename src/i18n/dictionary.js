// SafeHour 화면 문구 사전 — 기존 import 경로 호환 (AX-209 → AX-303)
//
// 문구는 기능별 이름공간 파일(`src/i18n/messages/<이름공간>.js`)로 옮겼다.
// 등록과 규칙은 `src/i18n/messages/index.js`, 조회 함수는 `src/i18n/index.js` 에 있다.
// 이 파일은 기존 화면의 import 경로를 깨지 않기 위한 재수출만 둔다. 새 코드는 쓰지 않는다.

export { UI_TEXT } from './messages/index.js';
export { SCHEDULE_FIELD_KEY } from './messages/place.js';
