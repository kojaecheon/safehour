// settings 이름공간 — 설정(/settings): 언어·알림·동의 철회·이 기기에서 내 정보 지우기 (AX-303)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// '내 정보 지우기'(ClearSessionButton)의 기존 키 접두사 `clear.` 을 그대로 쓴다.
// 새 키는 `settings.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  // ── 내 정보 지우기 (AX-210) ──
  'clear.cta': {
    ko: '이 기기에서 내 정보 지우기',
    en: 'Delete my data from this device',
    ja: 'この端末から自分の情報を削除',
    zh: '从此设备删除我的信息',
  },
  'clear.note': {
    ko: '병원 조건과 판정 결과는 이 브라우저에만 남습니다. 서버에는 저장되지 않습니다.',
    en: 'Your hospital conditions and results stay in this browser only. Nothing is stored on our server.',
    ja: '病院の条件と判定結果はこのブラウザにのみ残ります。サーバーには保存されません。',
    zh: '医院条件和判定结果只保留在此浏览器中，不会保存在服务器上。',
  },
  'clear.question': {
    ko: '입력한 조건과 추천 결과를 지울까요? 되돌릴 수 없습니다.',
    en: 'Delete your entries and results? This cannot be undone.',
    ja: '入力した条件とおすすめ結果を削除しますか？元に戻すことはできません。',
    zh: '要删除您输入的条件和推荐结果吗？删除后无法恢复。',
  },
  'clear.confirm': { ko: '지우기', en: 'Delete', ja: '削除する', zh: '删除' },
  'clear.cancel': { ko: '취소', en: 'Cancel', ja: 'キャンセル', zh: '取消' },
};

/** 안전 문구 */
export const safety = {};
