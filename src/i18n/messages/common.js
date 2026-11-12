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

  // ── 앱 셸 (AX-304) — 하단 내비·긴급 버튼·보기 전용 배너 ──
  'common.navAria': { ko: '주 메뉴', en: 'Main menu', ja: 'メインメニュー', zh: '主菜单' },
  'common.navToday': { ko: '오늘', en: 'Today', ja: '今日', zh: '今天' },
  'common.navTrip': { ko: '일정', en: 'Trip', ja: '日程', zh: '行程' },
  'common.navConditions': { ko: '조건', en: 'Conditions', ja: '条件', zh: '出行条件' },
  'common.navMore': { ko: '더보기', en: 'More', ja: 'その他', zh: '更多' },
  // 내비 칸은 5개라 좁다 — 320px 에서 칸당 64px 이다. 긴급 칸만 짧은 문구를 쓴다.
  // 영어 'Emergency'(74px)는 칸을 넘어 화면 밖으로 잘린다 — 국제적으로 통하는 'SOS' 로 줄였다.
  // 화면 제목과 로그인 전 떠 있는 버튼은 그대로 common.emergency('Emergency')를 쓴다.
  'common.navEmergency': { ko: '긴급', en: 'SOS', ja: '緊急', zh: '紧急' },
  'common.emergency': { ko: '긴급 연락', en: 'Emergency', ja: '緊急連絡', zh: '紧急联系' },
  'common.readOnlyTitle': {
    ko: '보기 전용 — 로그인이 필요합니다',
    en: 'View only — sign-in required',
    ja: '閲覧のみ — ログインが必要です',
    zh: '仅供查看 — 需要登录',
  },
  'common.readOnlyNoSession': {
    ko: '이 기기에 저장된 사본만 보여 줍니다. 만들기·편집·연동·공유는 로그인한 뒤에 할 수 있습니다.',
    en: 'You are seeing the copy saved on this device. Sign in to create, edit, link or share.',
    ja: 'この端末に保存された控えだけを表示しています。作成・編集・連携・共有はログイン後にできます。',
    zh: '目前只显示保存在本设备上的副本。登录后才能创建、编辑、关联或分享。',
  },
  'common.readOnlyExpired': {
    ko: '로그인이 만료되었습니다. 이 기기에 저장된 사본만 보여 줍니다.',
    en: 'Your sign-in has expired. You are seeing the copy saved on this device.',
    ja: 'ログインの有効期限が切れました。この端末に保存された控えだけを表示しています。',
    zh: '登录已过期。目前只显示保存在本设备上的副本。',
  },
  // 오프라인은 로그인 문제가 아니다(사용성 점검 C2): 제목부터 연결 없음으로 쓴다. 로그인 링크는 두지 않는다.
  // 둘째 문장은 코드가 하는 일만 적는다: 'online' 이벤트에 저장소가 보기 전용을 풀고(로그인이 유지돼 있을 때),
  // 일정 실행기가 미뤄 둔 앱 열기 확인(병원 지침 재확인·기상·남은 재계획)을 이어서 한다(lib/store/store.js setOnline, lib/trip/runtime.js onStatus)
  'common.readOnlyOfflineTitle': {
    ko: '인터넷 연결 없음, 저장된 일정만 보여 줘요',
    en: 'No internet connection. Showing your saved plan only',
    ja: 'インターネット未接続、保存済みの予定だけを表示しています',
    zh: '未连接网络，仅显示已保存的日程',
  },
  'common.readOnlyOfflineBody': {
    ko: '이 기기에 저장된 사본이에요. 다시 연결되면 로그인 상태를 확인하고, 로그인돼 있으면 편집이 다시 켜지고 일정을 새로 확인해요.',
    en: 'This is the copy saved on this device. When you reconnect, we check your sign-in; if you are still signed in, editing turns back on and your plan is checked again.',
    ja: 'この端末に保存された控えです。再接続するとログイン状態を確認し、ログインが続いていれば編集が再開され、予定も確認し直します。',
    zh: '这是保存在本设备上的副本。重新连接后会先确认登录状态；如果仍处于登录状态，就会恢复编辑并重新检查日程。',
  },
  'common.readOnlyLogin': { ko: '로그인하기', en: 'Sign in', ja: 'ログインする', zh: '去登录' },
  'common.close': { ko: '닫기', en: 'Close', ja: '閉じる', zh: '关闭' },
  'common.today': { ko: '오늘', en: 'Today', ja: '本日', zh: '今日' },

  // ── 배지 5종 (docs/platform/DESIGN_SYSTEM.md '배지 5종 (`Badge`)'): 모양·아이콘·문구로 구분한다 ──
  'common.badgeEstimate': { ko: '추정', en: 'Estimate', ja: '推定', zh: '估算' },
  'common.badgeDefaulted': {
    ko: '기본값 적용',
    en: 'Default applied',
    ja: '既定値を適用',
    zh: '已套用默认值',
  },
  'common.badgeHoursUnconfirmed': {
    ko: '운영 확인 필요',
    en: 'Check opening hours',
    ja: '営業状況の確認が必要',
    zh: '需确认营业情况',
  },
  'common.badgeDemo': { ko: '병원 연동 데모', en: 'Hospital link demo', ja: '病院連携デモ', zh: '医院对接演示' },
  'common.badgeReadOnly': { ko: '보기 전용', en: 'View only', ja: '閲覧のみ', zh: '仅供查看' },

  // ── 출처 영역 5종 (docs/platform/DESIGN_SYSTEM.md '출처 영역 5종 (`SourceArea` · `SourceTag`)'): 병원 발행 / 본인 체크 / SafeHour 판정·추정 / 관광공사 원문 / AI 소개 ──
  'common.sourceHospital': { ko: '병원 발행', en: 'Issued by hospital', ja: '病院が発行', zh: '医院发布' },
  'common.sourceSelf': { ko: '본인 체크', en: 'Your self-check', ja: '本人チェック', zh: '本人填写' },
  'common.sourceEstimate': {
    ko: 'SafeHour 판정·추정',
    en: 'SafeHour check & estimate',
    ja: 'SafeHourの判定・推定',
    zh: 'SafeHour 判定与估算',
  },
  'common.sourceTourism': {
    ko: '관광공사 원문',
    en: 'Korea Tourism Organization original',
    ja: '韓国観光公社の原文',
    zh: '韩国观光公社原文',
  },
  'common.sourceAi': { ko: 'AI 소개', en: 'AI introduction', ja: 'AIによる紹介', zh: 'AI 介绍' },

  // ── 예 / 아니오 / 모르겠음 입력 (docs/business-rules.md '조건 기간') ──
  'common.answerYes': { ko: '예', en: 'Yes', ja: 'はい', zh: '是' },
  'common.answerNo': { ko: '아니오', en: 'No', ja: 'いいえ', zh: '否' },
  'common.answerUnknown': { ko: '모르겠음', en: 'Not sure', ja: 'わからない', zh: '不确定' },
  'common.answerNoHint': {
    ko: '병원이 그런 안내를 하지 않았어요',
    en: 'The hospital gave no such instruction',
    ja: '病院からそのような案内はありませんでした',
    zh: '医院没有给出这样的说明',
  },
  'common.answerUnknownHint': {
    ko: '가장 엄격한 기본값을 적용해요',
    en: 'The strictest default will be applied',
    ja: '最も厳しい既定値を適用します',
    zh: '将套用最严格的默认值',
  },

  // ── 조건 기간 편집기 틀 ──
  'common.periodStart': { ko: '시작일', en: 'Start date', ja: '開始日', zh: '开始日期' },
  'common.periodEnd': { ko: '종료일 (포함)', en: 'End date (included)', ja: '終了日（当日を含む）', zh: '结束日期（含当天）' },

  // ── 하루 타임라인 ──
  'common.tlDepart': { ko: '출발', en: 'Leave', ja: '出発', zh: '出发' },
  'common.tlReturn': { ko: '복귀 마감', en: 'Return by', ja: '戻り期限', zh: '返回截止' },
  // 마감 이유가 하루 활동 종료(DAY_END)인 복귀: 병원이 정한 마감이 아니라 앱 기본값이라 이름을 나눈다 (사용성 점검 2026-11-08 A4)
  'common.tlDayEnd': { ko: '활동 종료', en: 'Activities end', ja: '活動終了', zh: '活动结束' },
  'common.tlDayEndToday': { ko: '오늘 활동 종료', en: 'Today’s activities end', ja: '今日の活動終了', zh: '今日活动结束' },
  'common.tlAppointment': { ko: '병원 일정', en: 'Hospital appointment', ja: '病院の予定', zh: '医院预约' },
  'common.tlMedication': { ko: '복약', en: 'Medication', ja: '服薬', zh: '服药' },
  'common.tlRest': { ko: '숙소에서 휴식', en: 'Rest at your stay', ja: '宿泊先で休憩', zh: '在住处休息' },
  'common.legWalk': { ko: '도보 {n}분', en: 'Walk {n} min', ja: '徒歩{n}分', zh: '步行{n}分钟' },
  'common.legTaxi': { ko: '택시 {n}분', en: 'Taxi {n} min', ja: 'タクシー{n}分', zh: '出租车{n}分钟' },
  'common.legTransit': { ko: '대중교통 {n}분', en: 'Transit {n} min', ja: '公共交通{n}分', zh: '公共交通{n}分钟' },

  // ── 식사 칸 (docs/business-rules.md '하루 일정 생성'의 식사 칸 문단): '추천 장소 없음'은 정상 결과다 ──
  'common.mealLunch': { ko: '점심', en: 'Lunch', ja: '昼食', zh: '午餐' },
  'common.mealDinner': { ko: '저녁', en: 'Dinner', ja: '夕食', zh: '晚餐' },
  'common.mealNone': {
    ko: '추천 장소 없음',
    en: 'No place to suggest',
    ja: 'おすすめの店なし',
    zh: '暂无推荐地点',
  },
  'common.mealCleared': {
    ko: '비워 둔 식사 칸',
    en: 'You left this meal open',
    ja: '空けておいた食事枠',
    zh: '您留空的用餐时段',
  },
  'common.mealNotApplicable': {
    ko: '이 시간에는 식사 칸이 없어요',
    en: 'No meal slot at this time',
    ja: 'この時間には食事枠がありません',
    zh: '此时段没有用餐安排',
  },

  // ── 장소 유형 (Stop.category) — 사진이 없을 때 일러스트와 함께 보인다 ──
  'common.categoryFood': { ko: '음식점', en: 'Restaurant', ja: 'レストラン', zh: '餐厅' },
  'common.categoryCafe': { ko: '카페', en: 'Café', ja: 'カフェ', zh: '咖啡馆' },
  'common.categorySpot': { ko: '관광지', en: 'Sightseeing', ja: '観光地', zh: '景点' },
  'common.categoryCulture': { ko: '문화시설', en: 'Culture', ja: '文化施設', zh: '文化设施' },
  'common.categoryFestival': { ko: '축제·공연', en: 'Festival', ja: '祭り・公演', zh: '节庆演出' },
  'common.categoryCourse': { ko: '여행 코스', en: 'Route', ja: '旅行コース', zh: '旅游路线' },
  'common.categoryLeisure': { ko: '레포츠', en: 'Leisure', ja: 'レジャー', zh: '休闲运动' },
  'common.categoryShopping': { ko: '쇼핑', en: 'Shopping', ja: 'ショッピング', zh: '购物' },
  'common.categoryLodging': { ko: '숙소', en: 'Stay', ja: '宿泊', zh: '住宿' },
  'common.categoryOther': { ko: '기타', en: 'Other', ja: 'その他の場所', zh: '其他' },

  // ── 한국어 안내 카드 틀 (docs/business-rules.md '알림과 카드') ──
  'common.showThisCard': {
    ko: '직원에게 이 화면을 보여 주세요',
    en: 'Show this screen to the staff',
    ja: 'この画面をスタッフに見せてください',
    zh: '请把此画面出示给工作人员',
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

  // ── 상태 상자의 사유별 행동 줄 (사용성 점검 2026-11-08 A1·A2, components/trip/viewModel.js dayActionKey) ──
  // 시각·입력 누락·확인 대기처럼 병원과 무관한 사유에 '병원 연락'·'병원 인근 대기'를 쓰지 않는다.
  // 병원 지침 사유(외출 제한·복귀 요청·지침 철회·만료·외출 늦음 등)는 상태 기본 행동 줄(src/domain/states.js)을 그대로 쓴다.
  'common.actionTimeShort': {
    ko: '오늘은 남은 시간이 적어 외출 일정을 만들지 않았어요.',
    en: 'There is little time left today, so no outing was planned.',
    ja: '今日は残り時間が少ないため、外出の予定を作っていません。',
    zh: '今天剩余时间不多，因此没有安排外出。',
  },
  'common.actionTimeShortDay': {
    ko: '이날은 남은 시간이 적어 외출 일정을 만들지 않았어요.',
    en: 'No outing plan on this day because too little time is left.',
    ja: 'この日は残り時間が少ないため、外出の予定を作っていません。',
    zh: '这一天剩余时间不多，因此没有安排外出。',
  },
  'common.actionTravelDay': {
    ko: '입국·출국 이동이 있는 날이라 외출 일정을 만들지 않았어요.',
    en: 'No outing plan on this day because of arrival or departure travel.',
    ja: '入国・出国の移動がある日のため、外出の予定を作っていません。',
    zh: '这一天有入境或出境的行程，因此没有安排外出。',
  },
  'common.actionNoCandidate': {
    ko: '조건에 맞는 장소를 아직 찾지 못했어요. 잠시 뒤 다시 확인해 주세요.',
    en: 'No place that fits your conditions was found yet. Please check again later.',
    ja: '条件に合う場所はまだ見つかっていません。しばらくしてからもう一度確認してください。',
    zh: '暂时还没有找到符合条件的地点。请稍后再查看。',
  },
  'common.actionNeedsInput': {
    ko: '아직 조건을 입력하지 않아 일정을 만들지 않았어요. 조건을 입력하면 일정이 생겨요.',
    en: 'No plan was made because your conditions are not entered yet. Enter them and a plan will be made.',
    ja: 'まだ条件を入力していないため、予定を作っていません。条件を入力すると予定ができます。',
    zh: '还没有输入条件，因此没有安排行程。输入条件后就会生成行程。',
  },
  'common.actionNeedsInputOther': {
    ko: '입력할 내용이 남아 있어 일정을 만들지 않았어요. 입력을 마치면 일정이 생겨요.',
    en: 'Some details are still missing, so no plan was made. Finish entering them and a plan will be made.',
    ja: '入力が必要な項目が残っているため、予定を作っていません。入力を終えると予定ができます。',
    zh: '还有需要输入的内容，因此没有安排行程。输入完成后就会生成行程。',
  },
  'common.actionDailyCheck': {
    ko: '오늘 일정은 매일 확인을 마치면 열려요. 위의 확인 항목을 눌러 주세요.',
    en: 'Today’s plan opens once you finish today’s check. Please tap the check above.',
    ja: '今日の予定は毎日の確認を終えると開きます。上の確認項目を押してください。',
    zh: '完成每日确认后，今天的行程就会开放。请点击上方的确认项目。',
  },
  'common.actionDailyCheckElsewhere': {
    ko: '오늘 일정은 매일 확인을 마치면 열려요. 오늘 화면에서 확인해 주세요.',
    en: 'Today’s plan opens once you finish today’s check. Please check on the Today screen.',
    ja: '今日の予定は毎日の確認を終えると開きます。「今日」の画面で確認してください。',
    zh: '完成每日确认后，今天的行程就会开放。请在“今天”页面确认。',
  },
  'common.actionHospitalGuide': {
    ko: '병원 안내를 먼저 확인해 주세요. 확인하면 오늘 일정이 열려요.',
    en: 'Please review your hospital’s guidance first. Today’s plan opens once you do.',
    ja: 'まず病院の案内を確認してください。確認すると今日の予定が開きます。',
    zh: '请先确认医院的指引。确认后，今天的行程就会开放。',
  },
  // 외출이 있는 날 상태 상자 아래 고정 줄 (사용성 점검 A3): '동행 가능'이 몸 상태 판정으로 읽히지 않게
  'common.outingDayNote': {
    ko: '입력한 조건 안에서 짠 일정이에요. 몸 상태는 병원 안내를 따르세요.',
    en: 'This plan was made within the conditions you entered. For how you feel, follow your hospital’s guidance.',
    ja: '入力した条件の範囲で作った予定です。体の状態については病院の案内に従ってください。',
    zh: '这是在你输入的条件范围内安排的行程。身体状况请遵循医院的指引。',
  },
};
