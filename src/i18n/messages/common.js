// common 이름공간 — 여러 화면이 함께 쓰는 문구와 상태 라벨 (AX-303)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  'common.back': { ko: '뒤로 가기', en: 'Go back', ja: '戻る', zh: '返回' },
  'common.confirm': { ko: '확인', en: 'OK', ja: 'わかりました', zh: '知道了' },
  'common.none': { ko: '없음', en: 'none', ja: 'なし', zh: '无' },
  // 지금 언어를 읽지 못하는 사람도 찾을 수 있게 다른 언어를 섞어 적는다
  'common.langToggle': {
    ko: 'Language — 한국어 선택됨',
    en: '언어 — English selected',
    ja: 'Language — 日本語を選択中',
    zh: 'Language — 已选择中文',
  },
  'common.minutesUnknown': { ko: '확인 불가', en: 'Unknown', ja: '確認できません', zh: '无法确认' },
  'common.minutes': { ko: '{n}분', en: '{n} min', ja: '{n}分', zh: '{n}分钟' },
  'common.hours': { ko: '{h}시간', en: '{h} h', ja: '{h}時間', zh: '{h}小时' },
  'common.hoursMinutes': {
    ko: '{h}시간 {m}분',
    en: '{h} h {m} min',
    ja: '{h}時間{m}分',
    zh: '{h}小时{m}分钟',
  },
};

/** 안전 문구 — 상태 라벨. 상태 메시지 본문의 정본은 src/domain/states.js 다 */
export const safety = {
  'state.NO_TOURISM': { ko: '관광 미추천', en: 'No tourism', ja: '観光のおすすめなし', zh: '不推荐观光' },
  'state.STANDBY': { ko: '대기', en: 'Stand by', ja: '待機', zh: '等待' },
  'state.SPLIT_NEARBY': {
    ko: '보호자 근거리',
    en: 'Companion nearby',
    ja: '同行者のみ近場',
    zh: '仅陪同者就近',
  },
  'state.TOGETHER': { ko: '동행 가능', en: 'Together', ja: '一緒に外出可', zh: '可一同外出' },
};
