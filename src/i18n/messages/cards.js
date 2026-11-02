// cards 이름공간 — 한국어 안내 카드(/cards): 식이·이동·복귀·병원 카드 (AX-303 · AX-318)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다. 새 키는 `cards.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요
//
// ── 카드 문장 (spec 4.12) ──
//   `cards.diet*`·`cards.moveKo`·`cards.returnKo`·`cards.hospitalKo` 의 **ko 값이 카드에 크게 보이는 고정 한국어 문장**이다.
//   AI 로 만들지 않고, 사람이 검수한다(docs/platform/HUMAN_ACTIONS.md 4번 — 의료진 검토 전 임시 문구).
//   en·ja·zh 값은 그 문장을 사용자에게 알려 주는 설명이다(카드 아래 작은 글씨).
//   식이 문장 다섯 개는 spec 4.12 표의 예시 문장 그대로다.

/** 일반 화면 문구 — 'cards.키': { ko, en, ja, zh } */
export const messages = {
  'cards.header': {
    ko: '한국어 안내 카드',
    en: 'Korean help cards',
    ja: '韓国語の案内カード',
    zh: '韩语提示卡',
  },
  'cards.intro': {
    ko: '식당 직원이나 택시 기사에게 카드를 보여 주세요. 카드의 한국어 문장은 정해진 문장입니다.',
    en: 'Show a card to restaurant staff or a taxi driver. The Korean sentences on the cards are fixed wording.',
    ja: '飲食店のスタッフやタクシーの運転手にカードを見せてください。カードの韓国語の文は決まった文です。',
    zh: '请把卡片出示给餐厅店员或出租车司机。卡片上的韩语句子是固定的文字。',
  },
  'cards.todayLabel': { ko: '{date} 기준', en: 'For {date}', ja: '{date} 時点', zh: '{date} 适用' },
  'cards.jumpAria': { ko: '카드 바로가기', en: 'Jump to a card', ja: 'カードへ移動', zh: '跳转到卡片' },
  'cards.explainTitle': {
    ko: '카드 내용',
    en: 'What the card says',
    ja: 'カードの内容',
    zh: '卡片内容',
  },

  // ── 식이 카드 ──
  'cards.dietTitle': { ko: '식이 카드', en: 'Food card', ja: '食事カード', zh: '饮食卡' },
  'cards.dietSpicy': {
    ko: '매운 음식은 빼 주세요',
    en: 'Please leave out anything spicy.',
    ja: '辛いものは抜いてください。',
    zh: '请不要放辣。',
  },
  'cards.dietAlcohol': {
    ko: '술은 마실 수 없어요',
    en: 'I cannot drink alcohol.',
    ja: 'お酒は飲めません。',
    zh: '我不能喝酒。',
  },
  'cards.dietHard': {
    ko: '딱딱하거나 질긴 음식은 피해야 해요',
    en: 'I need to avoid hard or chewy food.',
    ja: '硬いものや噛み切りにくいものは避ける必要があります。',
    zh: '我需要避免坚硬或难嚼的食物。',
  },
  'cards.dietHot': {
    ko: '음식을 뜨겁지 않게 식혀 주세요',
    en: 'Please let my food cool so it is not hot.',
    ja: '料理は熱くないように冷ましてください。',
    zh: '请把食物放凉一些，不要太烫。',
  },
  'cards.dietRaw': {
    ko: '날음식(회 등)은 먹을 수 없어요',
    en: 'I cannot eat raw food (such as raw fish).',
    ja: '生もの（刺身など）は食べられません。',
    zh: '我不能吃生食（如生鱼片）。',
  },
  'cards.dietNone': {
    ko: '오늘 적용되는 식이 제한이 없어요.',
    en: 'No food restrictions apply today.',
    ja: '今日適用される食事の制限はありません。',
    zh: '今天没有适用的饮食限制。',
  },
  'cards.dietNeedsInput': {
    ko: '오늘 조건이 아직 정해지지 않아 식이 카드를 만들 수 없어요.',
    en: 'Today’s conditions have not been set yet, so there is no food card.',
    ja: '今日の条件がまだ決まっていないため、食事カードを作れません。',
    zh: '今天的条件尚未设定，因此无法生成饮食卡。',
  },
  'cards.conditionsAction': {
    ko: '조건 화면으로 가기',
    en: 'Go to Conditions',
    ja: '条件の画面へ',
    zh: '前往条件页面',
  },
  'cards.outsideStay': {
    ko: '오늘은 체류 기간이 아니에요. 병원 카드만 보여 드려요.',
    en: 'Today is outside your stay dates, so only hospital cards are shown.',
    ja: '今日は滞在期間ではありません。病院カードだけを表示します。',
    zh: '今天不在您的停留期间内，因此只显示医院卡。',
  },

  // ── 이동 카드 ──
  'cards.moveTitle': { ko: '이동 카드', en: 'Directions card', ja: '移動カード', zh: '出行卡' },
  'cards.moveKo': {
    ko: '이 주소로 가 주세요',
    en: 'Please take me to this address.',
    ja: 'この住所まで行ってください。',
    zh: '请带我去这个地址。',
  },
  'cards.moveArrive': {
    ko: '{time} 도착 예정',
    en: 'Planned arrival {time}',
    ja: '{time} 到着予定',
    zh: '预计 {time} 到达',
  },
  'cards.moveGuardian': {
    ko: '보호자 일정',
    en: 'Companion’s plan',
    ja: '同行者の予定',
    zh: '陪同者的行程',
  },
  'cards.koAddressMissing': {
    ko: '한국어 주소 확인 필요',
    en: 'Korean address needs checking',
    ja: '韓国語の住所の確認が必要',
    zh: '需要确认韩文地址',
  },
  'cards.koAddressMissingBody': {
    ko: '이 장소는 한국어 주소 원문이 없어 표시 언어의 이름과 주소를 보여 드려요. 보여 주기 전에 확인하세요.',
    en: 'This place has no Korean address, so its name and address are shown in your language. Check them before you show the card.',
    ja: 'この場所には韓国語の住所の原文がないため、表示言語の名前と住所を表示しています。見せる前に確認してください。',
    zh: '该地点没有韩文地址原文，因此显示的是您所选语言的名称和地址。出示前请先确认。',
  },
  'cards.moveNone': {
    ko: '오늘 일정에 들를 곳이 없어요.',
    en: 'There are no stops in today’s plan.',
    ja: '今日の予定に立ち寄り先はありません。',
    zh: '今天的行程中没有要去的地点。',
  },

  // ── 복귀 카드 ──
  'cards.returnTitle': { ko: '복귀 카드', en: 'Return card', ja: '帰着カード', zh: '返回卡' },
  'cards.returnKo': {
    ko: '이 숙소로 가 주세요',
    en: 'Please take me to my accommodation.',
    ja: 'この宿泊先まで行ってください。',
    zh: '请带我去这个住处。',
  },
  'cards.returnNone': {
    ko: '오늘 밤 묵을 숙소가 등록되지 않았어요.',
    en: 'No accommodation is registered for tonight.',
    ja: '今夜の宿泊先が登録されていません。',
    zh: '尚未登记今晚的住处。',
  },

  // ── 병원 카드 ──
  'cards.hospitalTitle': { ko: '병원 카드', en: 'Hospital card', ja: '病院カード', zh: '医院卡' },
  'cards.hospitalKo': {
    ko: '이 병원으로 가 주세요',
    en: 'Please take me to this hospital.',
    ja: 'この病院まで行ってください。',
    zh: '请带我去这家医院。',
  },
  'cards.hospitalToday': {
    ko: '오늘 병원 일정',
    en: 'Appointment today',
    ja: '今日の病院の予定',
    zh: '今天有医院预约',
  },
  'cards.hospitalNone': {
    ko: '등록한 병원이 없어요.',
    en: 'No hospital is registered.',
    ja: '登録した病院はありません。',
    zh: '没有已登记的医院。',
  },

  // ── 빈 상태 ──
  'cards.emptyTitle': {
    ko: '아직 카드에 넣을 정보가 없어요',
    en: 'Nothing to put on a card yet',
    ja: 'カードに載せる情報がまだありません',
    zh: '暂时没有可放进卡片的信息',
  },
  'cards.emptyBody': {
    ko: '체류 정보를 넣으면 숙소·병원·오늘 일정으로 카드를 만들어요.',
    en: 'Add your stay details and cards are made from your accommodation, hospitals and today’s plan.',
    ja: '滞在情報を入力すると、宿泊先・病院・今日の予定からカードを作ります。',
    zh: '填写停留信息后，将根据住处、医院和今天的行程生成卡片。',
  },
  'cards.emptyAction': {
    ko: '체류 정보 넣기',
    en: 'Add stay details',
    ja: '滞在情報を入力',
    zh: '填写停留信息',
  },
  'cards.todayAction': {
    ko: '오늘 화면에서 확인하기',
    en: 'Confirm on the Today screen',
    ja: '「今日」の画面で確認する',
    zh: '在“今天”页面确认',
  },
};

/** 안전 문구 — 상태 메시지·사유·고지·복귀 안내 문장 */
export const safety = {
  'cards.dailyCheckPending': {
    ko: '오늘 조건을 아직 확인하지 않았어요. 오늘 화면에서 확인한 뒤 이동하세요.',
    en: 'You have not confirmed today’s conditions yet. Confirm them on the Today screen before you go out.',
    ja: '今日の条件をまだ確認していません。「今日」の画面で確認してから移動してください。',
    zh: '您还没有确认今天的条件。请先在“今天”页面确认后再出行。',
  },
};
