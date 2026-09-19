// emergency 이름공간 — 긴급 연락(/emergency): 119·1330·등록 병원 전화 (AX-303 · AX-318)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다. 새 키는 `emergency.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요
// 번호(119·1330·+82-2-1330)는 문구에 넣지 않고 app/emergency/contacts.js 의 값을 {number} 로 끼운다.

/** 일반 화면 문구 — 'emergency.키': { ko, en, ja, zh } */
export const messages = {
  'emergency.header': { ko: '긴급 연락', en: 'Emergency contacts', ja: '緊急連絡', zh: '紧急联系' },
  'emergency.callNumber': {
    ko: '{number} 전화 걸기',
    en: 'Call {number}',
    ja: '{number} に電話する',
    zh: '拨打 {number}',
  },
  'emergency.desc119': {
    ko: '화재·구급 — 구급차가 필요할 때',
    en: 'Fire and ambulance — when you need an ambulance',
    ja: '火災・救急 — 救急車が必要なとき',
    zh: '火警与急救 — 需要救护车时',
  },
  'emergency.desc1330': {
    ko: '관광통역안내 — 여행 안내와 통역',
    en: 'Korea Travel Helpline — travel information and interpretation',
    ja: '観光通訳案内 — 旅行の案内と通訳',
    zh: '旅游翻译咨询 — 旅游咨询与翻译',
  },
  'emergency.intlLabel': {
    ko: '1330이 연결되지 않거나 해외에서 걸 때',
    en: 'If 1330 does not connect, or when calling from abroad',
    ja: '1330 につながらないとき、または海外からかけるとき',
    zh: '无法接通 1330 或从海外拨打时',
  },
  'emergency.hospitalsTitle': {
    ko: '등록한 병원',
    en: 'Your hospitals',
    ja: '登録した病院',
    zh: '已登记的医院',
  },
  'emergency.hospitalNoPhone': {
    ko: '전화번호가 등록되지 않았어요.',
    en: 'No phone number is registered.',
    ja: '電話番号が登録されていません。',
    zh: '未登记电话号码。',
  },
  'emergency.hospitalsNone': {
    ko: '등록한 병원이 없어요. 체류 정보에 병원 전화를 넣으면 여기에 나와요.',
    en: 'No hospital is registered. Add your hospital’s phone number to your stay details to see it here.',
    ja: '登録した病院はありません。滞在情報に病院の電話番号を入力すると、ここに表示されます。',
    zh: '没有已登记的医院。在停留信息中填写医院电话后，将显示在这里。',
  },
};

/** 안전 문구 — 상태 메시지·사유·고지·복귀 안내 문장 */
export const safety = {
  'emergency.lead': {
    ko: '몸 상태에 이상이 느껴지면 앱보다 먼저 병원에 연락하세요. 위급하면 119에 전화하세요.',
    en: 'If you feel unwell, contact your hospital before checking the app. In an emergency, call 119.',
    ja: '体調に異変を感じたら、アプリより先に病院へ連絡してください。緊急のときは119に電話してください。',
    zh: '如感到身体不适，请先联系医院，而不是先看应用。情况危急时请拨打 119。',
  },
};
