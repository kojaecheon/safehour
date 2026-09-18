// place 이름공간 — 장소 상세(/place/[candidateId]) (AX-303)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// 운영정보 필드 라벨은 기존 접두사 `schedule.` 을 그대로 쓴다.
// 관광공사 원문(개요·운영시간 값)은 번역 대상이 아니다 — 여기에는 라벨만 둔다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  'place.header': { ko: '장소 상세', en: 'Place details', ja: '場所の詳細', zh: '地点详情' },
  'place.backAria': { ko: '결과로 돌아가기', en: 'Back to results', ja: '結果に戻る', zh: '返回结果' },
  'place.backToResult': { ko: '결과로 돌아가기', en: 'Back to results', ja: '結果に戻る', zh: '返回结果' },
  'place.loading': {
    ko: '장소 정보를 불러오는 중입니다…',
    en: 'Loading place information…',
    ja: '場所の情報を読み込んでいます…',
    zh: '正在加载地点信息…',
  },
  'place.loadingDetails': {
    ko: '관광 원문을 불러오는 중입니다…',
    en: 'Loading the source text…',
    ja: '観光情報の原文を読み込んでいます…',
    zh: '正在加载旅游信息原文…',
  },
  'place.notShownLabel': { ko: '표시할 수 없음', en: 'Cannot show', ja: '表示できません', zh: '无法显示' },
  'place.notShownTitle': {
    ko: '이 장소의 판정 결과가 없습니다',
    en: 'There is no decision for this place',
    ja: 'この場所の判定結果がありません',
    zh: '此地点没有判定结果',
  },
  'place.notShownBody': {
    ko: '추천은 병원 조건과 복귀 시간을 기준으로 판정됩니다. 조건 없이 장소만 따로 보여드리지 않습니다.',
    en: 'Recommendations are decided from your hospital conditions and return time. We do not show places on their own.',
    ja: 'おすすめは、病院の条件と帰着時刻に基づいて判定します。条件なしで場所だけを個別にお見せすることはありません。',
    zh: '推荐是根据医院条件和返回时间判定的。我们不会在没有条件的情况下单独展示地点。',
  },
  'place.notShownCta': {
    ko: '조건 입력으로 이동',
    en: 'Go to conditions',
    ja: '条件入力へ移動',
    zh: '前往条件输入',
  },
  'place.blockedCta': {
    ko: '결과 화면에서 복귀 안내 보기',
    en: 'See return guidance',
    ja: '結果画面で帰着案内を見る',
    zh: '在结果页查看返回指引',
  },
  'place.detailErrLabel': { ko: '상세 정보 없음', en: 'No details', ja: '詳細情報なし', zh: '无详细信息' },
  'place.errDetail': {
    ko: '상세 정보를 불러오지 못했습니다.',
    en: 'Could not load the details.',
    ja: '詳細情報を読み込めませんでした。',
    zh: '未能加载详细信息。',
  },
  'place.errDetailNetwork': {
    ko: '네트워크 오류로 상세 정보를 불러오지 못했습니다.',
    en: 'A network error stopped the details from loading.',
    ja: 'ネットワークエラーのため詳細情報を読み込めませんでした。',
    zh: '由于网络错误，未能加载详细信息。',
  },
  'place.overviewTitle': {
    ko: '관광정보 원문',
    en: 'Source text',
    ja: '観光情報の原文',
    zh: '旅游信息原文',
  },
  'place.overviewEn': { ko: '영문', en: 'English', ja: '英語', zh: '英文' },
  'place.overviewKo': {
    ko: '국문 폴백',
    en: 'Korean fallback',
    ja: '韓国語で代替表示',
    zh: '以韩文代替',
  },
  'place.source': {
    ko: '출처: ⓒ한국관광공사',
    en: 'Source: ⓒKorea Tourism Organization',
    ja: '出典：ⓒ韓国観光公社',
    zh: '来源：ⓒ韩国观光公社',
  },
  'place.scheduleTitle': {
    ko: '운영·휴무 정보',
    en: 'Opening and closing',
    ja: '営業・休業情報',
    zh: '营业与休息信息',
  },
  'place.scheduleNote': {
    ko: '운영시간 원문을 그대로 표시합니다. SafeHour는 현재 영업 여부를 판단하지 않으니 방문 전에 직접 확인하세요.',
    en: 'Opening hours are shown exactly as published. SafeHour does not decide whether a place is open now — please check before you go.',
    ja: '営業時間の原文をそのまま表示します。SafeHourは現在営業しているかどうかを判断しないため、訪問前にご自身でご確認ください。',
    zh: '营业时间按原文显示。SafeHour 不判断当前是否营业，请在前往前自行确认。',
  },
  'place.scheduleEmpty': {
    ko: '운영시간 정보가 제공되지 않았습니다. 현재 영업 여부는 확인이 필요합니다.',
    en: 'No opening hours were provided. Please verify whether it is open.',
    ja: '営業時間の情報が提供されていません。現在営業しているかどうかは確認が必要です。',
    zh: '未提供营业时间信息。需要确认当前是否营业。',
  },
  'place.estimateTitle': {
    ko: 'SafeHour 추정값',
    en: 'SafeHour estimates',
    ja: 'SafeHourの推定値',
    zh: 'SafeHour 估算值',
  },
  'place.estimateNote': {
    ko: '아래 값은 관광정보 원문이 아니라 SafeHour가 조건 판정을 위해 계산한 값입니다.',
    en: 'These are not from the tourism source — SafeHour calculated them for the safety check.',
    ja: '以下の値は観光情報の原文ではなく、SafeHourが条件の判定のために計算した値です。',
    zh: '以下数值并非旅游信息原文，而是 SafeHour 为判定条件计算的数值。',
  },
  'place.estimateTravel': {
    ko: '기준점에서 편도 {value}',
    en: '{value} one-way from your point',
    ja: '基準地点から片道 {value}',
    zh: '从基准点单程 {value}',
  },
  'place.estimateWalkHeuristic': { ko: ' (추정)', en: ' (estimated)', ja: '（推定）', zh: '（估算）' },
  'place.estimateStay': {
    ko: '권장 체류 {value}',
    en: 'Suggested stay {value}',
    ja: 'おすすめの滞在 {value}',
    zh: '建议停留 {value}',
  },
  'place.accessTitle': {
    ko: '접근성 정보',
    en: 'Accessibility',
    ja: 'アクセシビリティ情報',
    zh: '无障碍信息',
  },
  'place.accessBody': {
    ko: '한국관광공사 무장애 여행정보에 등록된 장소입니다. 세부 시설은 방문 전에 확인하세요.',
    en: 'Listed in the Korea Tourism Organization barrier-free dataset. Please check specific facilities before you go.',
    ja: '韓国観光公社のバリアフリー旅行情報に登録されている場所です。細かな設備は訪問前にご確認ください。',
    zh: '此地点已登录在韩国观光公社的无障碍旅游信息中。具体设施请在前往前确认。',
  },
  'place.photosTitle': { ko: '사진', en: 'Photos', ja: '写真', zh: '照片' },
  'place.copyrightType1': {
    ko: '제1유형 (출처표시)',
    en: 'Type 1 (attribution)',
    ja: '第1類型（出典表示）',
    zh: '第1类（注明出处）',
  },
  'place.copyrightType3': {
    ko: '제3유형 (출처표시-변경금지)',
    en: 'Type 3 (attribution, no derivatives)',
    ja: '第3類型（出典表示・改変禁止）',
    zh: '第3类（注明出处·禁止改编）',
  },
  'place.copyrightUnknown': {
    ko: '저작권 구분 미제공',
    en: 'Copyright type not provided',
    ja: '著作権区分の提供なし',
    zh: '未提供版权类别',
  },
  'place.copyrightOther': {
    ko: '저작권 구분 {code}',
    en: 'Copyright type {code}',
    ja: '著作権区分 {code}',
    zh: '版权类别 {code}',
  },
  'place.partialErrors': {
    ko: '일부 상세 정보를 불러오지 못했습니다 ({count}건). 확인되지 않은 정보는 표시하지 않습니다.',
    en: 'Some details could not be loaded ({count}). We do not show unverified information.',
    ja: '一部の詳細情報を読み込めませんでした（{count}件）。確認できていない情報は表示しません。',
    zh: '部分详细信息未能加载（{count} 项）。我们不会显示未经确认的信息。',
  },

  // 운영정보 필드 라벨 — 값(원문)은 번역하지 않는다
  'schedule.usetime': { ko: '이용시간', en: 'Hours', ja: '利用時間', zh: '开放时间' },
  'schedule.opentime': { ko: '영업시간', en: 'Opening hours', ja: '営業時間', zh: '营业时间' },
  'schedule.restdate': { ko: '휴무일', en: 'Closed on', ja: '休業日', zh: '休息日' },
  'schedule.checkintime': { ko: '입실 시간', en: 'Check-in', ja: 'チェックイン', zh: '入住时间' },
  'schedule.checkouttime': { ko: '퇴실 시간', en: 'Check-out', ja: 'チェックアウト', zh: '退房时间' },
  'schedule.eventstartdate': {
    ko: '행사 시작일',
    en: 'Event starts',
    ja: 'イベント開始日',
    zh: '活动开始日期',
  },
  'schedule.eventenddate': { ko: '행사 종료일', en: 'Event ends', ja: 'イベント終了日', zh: '活动结束日期' },
  'schedule.playtime': { ko: '공연 시간', en: 'Show times', ja: '公演時間', zh: '演出时间' },
  'schedule.starttime': { ko: '시작 시간', en: 'Start time', ja: '開始時間', zh: '开始时间' },
  'schedule.endtime': { ko: '종료 시간', en: 'End time', ja: '終了時間', zh: '结束时间' },
};

/** 안전 문구 — 관광 미추천 상태 안내와 의료 면책 */
export const safety = {
  'place.blockedTitle': {
    ko: '지금은 관광을 권하지 않습니다',
    en: 'Tourism is not recommended right now',
    ja: '現在は観光をおすすめしていません',
    zh: '目前不建议观光',
  },
  'place.blockedBody': {
    ko: '현재 판정에서는 이 장소를 포함해 어떤 관광도 추천하지 않습니다. 장소 정보 대신 복귀 안내를 확인해 주세요.',
    en: 'In the current decision no tourism is recommended, including this place. Please check the return guidance instead.',
    ja: '現在の判定では、この場所を含め、どの観光もおすすめしていません。場所の情報ではなく、帰着案内をご確認ください。',
    zh: '根据当前判定，包括此地点在内，我们不推荐任何观光。请查看返回指引，而不是地点信息。',
  },
  'place.footer': {
    ko: '관광정보 출처: ⓒ한국관광공사. SafeHour는 의료진의 판단을 대체하지 않습니다.',
    en: 'Tourism data: ⓒKorea Tourism Organization. SafeHour does not replace your medical team.',
    ja: '観光情報の出典：ⓒ韓国観光公社。SafeHourは医療スタッフの判断に代わるものではありません。',
    zh: '旅游信息来源：ⓒ韩国观光公社。SafeHour 不能代替医护人员的判断。',
  },
};

/** TourAPI 운영정보 필드 → 사전 키. 값(원문)은 번역 대상이 아니다. */
export const SCHEDULE_FIELD_KEY = {
  usetime: 'schedule.usetime',
  usetimeculture: 'schedule.usetime',
  usetimeleports: 'schedule.usetime',
  opentime: 'schedule.opentime',
  opentimefood: 'schedule.opentime',
  opentimeshopping: 'schedule.opentime',
  restdate: 'schedule.restdate',
  restdateculture: 'schedule.restdate',
  restdateleports: 'schedule.restdate',
  restdatefood: 'schedule.restdate',
  restdateshopping: 'schedule.restdate',
  checkintime: 'schedule.checkintime',
  checkouttime: 'schedule.checkouttime',
  eventstartdate: 'schedule.eventstartdate',
  eventenddate: 'schedule.eventenddate',
  playtime: 'schedule.playtime',
  starttime: 'schedule.starttime',
  endtime: 'schedule.endtime',
};
