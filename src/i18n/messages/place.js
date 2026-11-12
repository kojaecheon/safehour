// place 이름공간 — 장소 상세(/place/[candidateId]) (AX-303 → AX-317)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// 운영정보 필드 라벨은 기존 접두사 `schedule.` 을 그대로 쓴다.
// 관광공사 원문(개요·운영시간 값)은 번역 대상이 아니다 — 여기에는 라벨만 둔다.
// 퇴역한 결과 화면(/result)으로 돌아가는 문구·판정 없음 안내는 AX-317 에서 지웠다(장소는 확정 일정에서만 찾는다).
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  'place.header': { ko: '장소 상세', en: 'Place details', ja: '場所の詳細', zh: '地点详情' },
  'place.back': { ko: '하루 일정으로', en: 'Back to the day plan', ja: '1日の予定へ', zh: '返回当天行程' },
  'place.loading': {
    ko: '장소 정보를 불러오는 중이에요…',
    en: 'Loading place information…',
    ja: '場所の情報を読み込んでいます…',
    zh: '正在加载地点信息…',
  },
  'place.loadingDetails': {
    ko: '관광공사 원문을 불러오는 중이에요…',
    en: 'Loading the tourism source text…',
    ja: '観光公社の原文を読み込んでいます…',
    zh: '正在加载旅游原文…',
  },
  'place.notFoundTitle': {
    ko: '일정에서 이 장소를 찾지 못했어요',
    en: 'This place is not in your plan',
    ja: 'この場所は予定に見つかりません',
    zh: '行程中找不到此地点',
  },
  'place.notFoundBody': {
    ko: '일정이 바뀌었을 수 있어요. 전체 일정에서 다시 골라 주세요. 일정에 없는 장소는 보여 주지 않아요.',
    en: 'Your plan may have changed. Please pick it again from the whole trip. We only show places that are in your plan.',
    ja: '予定が変わった可能性があります。全体の予定からもう一度選んでください。予定にない場所は表示しません。',
    zh: '行程可能已变化。请从整个行程中重新选择。我们只显示行程中的地点。',
  },
  'place.notFoundCta': { ko: '전체 일정 보기', en: 'Open the whole trip', ja: '全体の予定を開く', zh: '打开整个行程' },

  // ── 지도 길찾기 (docs/business-rules.md '알림과 카드') ──
  'place.mapsTitle': { ko: '지도 앱으로 길찾기', en: 'Directions in a map app', ja: '地図アプリで道案内', zh: '在地图应用中导航' },
  'place.mapsNote': {
    ko: '목적지(이 장소)의 이름과 좌표만 넘겨요. 출발지와 숙소 위치는 보내지 않아요.',
    en: 'Only this place’s name and coordinates are sent. Your starting point and where you stay are never sent.',
    ja: '目的地（この場所）の名前と座標だけを渡します。出発地や宿泊先の位置は送りません。',
    zh: '只传送目的地（此地点）的名称和坐标，不会发送出发地和住处位置。',
  },
  // ja·zh 는 앱 이름만 둔다: 320px 에서 '…で開く'가 단어 중간에서 끊겼다(사용성 점검 G1). 링크라 '연다'는 뜻은 버튼이 전한다.
  // zh 카카오맵은 'KakaoMap' 대신 'Kakao 地图'다: zh 문구는 한자를 담아야 한다(test/i18n-languages.test.js 문자 체계)
  'place.mapGoogle': { ko: '구글 지도로 열기', en: 'Open in Google Maps', ja: 'Googleマップ', zh: 'Google 地图' },
  'place.mapKakao': { ko: '카카오맵으로 열기', en: 'Open in KakaoMap', ja: 'カカオマップ', zh: 'Kakao 地图' },
  'place.mapsUnavailable': {
    ko: '좌표가 없어 지도 링크를 만들 수 없어요.',
    en: 'No coordinates, so no map link can be made.',
    ja: '座標がないため、地図のリンクを作れません。',
    zh: '没有坐标，无法生成地图链接。',
  },

  // ── SafeHour 판정·추정 (원문과 분리) ──
  'place.planTitle': { ko: '이 장소의 일정', en: 'This place in your plan', ja: 'この場所の予定', zh: '此地点的安排' },
  'place.estimateNote': {
    ko: '관광공사 원문이 아니라 SafeHour가 조건 판정을 위해 계산한 값이에요.',
    en: 'Not from the tourism source — SafeHour calculated these to check your conditions.',
    ja: '観光公社の原文ではなく、SafeHourが条件の判定のために計算した値です。',
    zh: '这些不是旅游原文，而是 SafeHour 为判定条件计算的数值。',
  },
  'place.visit': { ko: '방문', en: 'Visit', ja: '訪問', zh: '到访' },
  'place.stay': { ko: '머무름', en: 'Stay', ja: '滞在', zh: '停留' },
  'place.leg': { ko: '오는 길', en: 'Getting there', ja: '行き方', zh: '前往方式' },
  'place.walk': { ko: '걷기 부담', en: 'Walking load', ja: '歩行の負担', zh: '步行负担' },
  'place.walkValue': { ko: '약 {n}분', en: 'About {n} min', ja: '約{n}分', zh: '约 {n} 分钟' },
  'place.indoor': { ko: '실내 여부', en: 'Indoor?', ja: '屋内かどうか', zh: '是否室内' },
  'place.picked': { ko: '고름', en: 'Choice', ja: '選択', zh: '选择' },
  'place.hoursNote': {
    ko: '운영 시간을 확인하지 못했어요. 열려 있다고 단정하지 않으니 방문 전에 확인해 주세요.',
    en: 'Opening hours could not be confirmed. We do not assume it is open — please check before you go.',
    ja: '営業時間を確認できませんでした。営業していると断定しないため、訪問前にご確認ください。',
    zh: '无法确认营业时间。我们不会断定其正在营业，请在前往前确认。',
  },
  'place.dietNote': {
    ko: '메뉴·이름·유형 단서로 식이 조건을 추정했어요. 주문할 때 직원에게 한 번 더 확인해 주세요.',
    en: 'Diet fit was estimated from menu, name and type clues. Please double-check with staff when you order.',
    ja: 'メニュー・名前・種類の手がかりから食事条件を推定しました。注文時に店員にもう一度確認してください。',
    zh: '根据菜单、名称和类型线索估算了饮食条件。点餐时请再向店员确认。',
  },
  'place.orderCardBody': {
    ko: '뜨거운 음식·딱딱한 음식 제한은 식당을 빼지 않고 한국어 카드로 알려요.',
    en: 'Limits on hot or hard food do not remove restaurants; show the Korean card instead.',
    ja: '熱い食べ物・硬い食べ物の制限では飲食店を外さず、韓国語カードで伝えます。',
    zh: '对热食、硬食的限制不会排除餐厅，而是用韩语卡片告知。',
  },
  'place.orderCardCta': { ko: '식이 카드 열기', en: 'Open the diet card', ja: '食事カードを開く', zh: '打开饮食卡片' },

  // ── 관광공사 원문 ──
  'place.koTitle': {
    ko: '한국어 원문 (택시 기사에게 보여 주세요)',
    en: 'Korean original (show to a taxi driver)',
    ja: '韓国語の原文（タクシー運転手に見せてください）',
    zh: '韩语原文（出示给出租车司机）',
  },
  'place.koMissing': {
    ko: '한국어 주소 확인 필요',
    en: 'Korean address needs checking',
    ja: '韓国語の住所の確認が必要',
    zh: '需要确认韩语地址',
  },
  'place.moveCard': {
    ko: '한국어 이동 카드 보기',
    en: 'Open the Korean travel card',
    ja: '韓国語の移動カードを見る',
    zh: '查看韩语出行卡片',
  },
  'place.overviewTitle': { ko: '소개 원문', en: 'Original description', ja: '紹介の原文', zh: '介绍原文' },
  'place.langKo': { ko: '한국어', en: 'Korean', ja: '韓国語', zh: '韩语' },
  'place.langEn': { ko: '영어', en: 'English', ja: '英語', zh: '英语' },
  'place.langJa': { ko: '일본어', en: 'Japanese', ja: '日本語', zh: '日语' },
  'place.langZh': { ko: '중국어', en: 'Chinese', ja: '中国語', zh: '中文' },
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
  'place.errDetail': {
    ko: '상세 정보를 불러오지 못했어요. 일정 속 정보는 그대로예요.',
    en: 'Could not load the details. Your plan details still stand.',
    ja: '詳細情報を読み込めませんでした。予定の情報はそのままです。',
    zh: '未能加载详细信息。行程信息保持不变。',
  },
  'place.errDetailNetwork': {
    ko: '네트워크 오류로 상세 정보를 불러오지 못했어요. 일정 속 정보는 그대로예요.',
    en: 'A network error stopped the details from loading. Your plan details still stand.',
    ja: 'ネットワークエラーのため詳細情報を読み込めませんでした。予定の情報はそのままです。',
    zh: '由于网络错误，未能加载详细信息。行程信息保持不变。',
  },
  'place.errDetailOffline': {
    ko: '보기 전용(로그인 만료·오프라인)이라 관광공사 원문을 불러오지 않았어요. 일정 속 정보는 그대로예요.',
    en: 'View-only (signed out or offline), so the tourism source was not loaded. Your plan details still stand.',
    ja: '閲覧のみ（ログイン切れ・オフライン）のため、観光公社の原文は読み込みませんでした。予定の情報はそのままです。',
    zh: '当前仅供查看（登录过期或离线），未加载旅游原文。行程信息保持不变。',
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

/** 안전 문구 — 의료 면책 */
export const safety = {
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
