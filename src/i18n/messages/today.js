// today 이름공간 — 홈(/today): 오늘 상태·매일 확인·다음 일정·복귀 마감·변경 알림 (AX-303 → AX-317)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// 복귀 마감·마감 이유·예상 귀가 문장은 trip 이름공간의 안전 문구(`return.*`, `trip.deadline*`, `trip.plannedReturn`)를 함께 쓴다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  'today.header': { ko: '오늘', en: 'Today', ja: '今日', zh: '今天' },
  'today.loading': {
    ko: '오늘 일정을 불러오는 중이에요…',
    en: 'Loading today’s plan…',
    ja: '今日の予定を読み込んでいます…',
    zh: '正在加载今天的行程…',
  },

  // 첫 조건 기간 저장 뒤 한 번만 보이는 알림 (운영자 결정 2026-11-08)
  'today.firstPlanReady': {
    ko: '첫 일정을 만들었어요.',
    en: 'Your first plan is ready.',
    ja: '最初の日程を作成しました。',
    zh: '已生成第一份行程。',
  },

  // ── 빈 상태·준비 중 ──
  'today.noStayTitle': { ko: '아직 체류 정보가 없어요', en: 'No trip details yet', ja: 'まだ滞在情報がありません', zh: '还没有行程信息' },
  'today.noStayBody': {
    ko: '입국·출국 날짜, 숙소, 병원 일정을 넣으면 날짜별 하루 일정을 만들어요.',
    en: 'Add your arrival and departure, where you stay and your hospital appointments, and we will build a plan for each day.',
    ja: '入国・出国の日付、宿泊先、病院の予定を入れると、日ごとの予定を作ります。',
    zh: '填写入境和出境日期、住处以及医院预约后，我们会为每一天生成行程。',
  },
  'today.noStayAction': { ko: '체류 정보 넣기', en: 'Add trip details', ja: '滞在情報を入れる', zh: '填写行程信息' },
  // 체류가 없고 이 기기에 보호자 사본이 있을 때 (usability 2026-11-08 D1)
  'today.receivedTitle': {
    ko: '보호자로 받은 일정이 있어요',
    en: 'You have a schedule received as a companion',
    ja: '同行者として受け取った予定があります',
    zh: '你有一份作为陪同者收到的日程',
  },
  'today.receivedBody': {
    ko: '환자에게 받은 일정은 받은 일정 화면에서 볼 수 있어요. 보호자는 체류 정보를 따로 넣지 않아도 돼요.',
    en: 'You can see the schedule from the patient on the Received schedule screen. Companions do not need to add their own trip details.',
    ja: '患者から受け取った予定は「受け取った予定」画面で見られます。同行者は滞在情報を別に入れる必要はありません。',
    zh: '从患者那里收到的日程可以在“收到的日程”页面查看。陪同者不需要另外填写行程信息。',
  },
  'today.receivedAction': { ko: '받은 일정 보기', en: 'View received schedule', ja: '受け取った予定を見る', zh: '查看收到的日程' },
  'today.generatingTitle': {
    ko: '전체 일정을 만드는 중이에요',
    en: 'Building your whole trip plan',
    ja: '全体の予定を作成しています',
    zh: '正在生成整个行程',
  },
  'today.generatingBody': {
    ko: '관광 정보를 확인하며 날짜별 일정을 짜고 있어요. 잠시만 기다려 주세요.',
    en: 'We are checking tourism data and planning each day. Please wait a moment.',
    ja: '観光情報を確認しながら日ごとの予定を組んでいます。少しお待ちください。',
    zh: '正在核对旅游信息并安排每天的行程，请稍候。',
  },
  'today.noPlanTitle': { ko: '아직 일정이 없어요', en: 'No plan yet', ja: 'まだ予定がありません', zh: '还没有行程' },
  'today.noPlanBody': {
    ko: '일정을 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
    en: 'We could not build the plan. Check your connection and try again.',
    ja: '予定を作成できませんでした。接続を確認して、もう一度お試しください。',
    zh: '未能生成行程。请检查网络连接后重试。',
  },
  // 저장 일정이 없을 때 첫 일정 만들기 실패 원인별 본문(components/trip/viewModel.js noPlanBodyKey, usability 2026-11-08 C1)
  'today.noPlanQuota': {
    ko: '오늘 장소 데이터 제공처의 조회 한도에 닿아 일정을 만들지 못했어요. 자정(한국 시각) 이후 다시 시도해 주세요.',
    en: 'We could not build the plan because the place data provider has reached today’s lookup limit. Please try again after midnight (Korea time).',
    ja: '本日、場所データ提供元の照会上限に達したため、予定を作成できませんでした。韓国時間の午前0時以降にもう一度お試しください。',
    zh: '今天地点数据提供方的查询次数已达上限，未能生成行程。请在韩国时间午夜之后重试。',
  },
  'today.noPlanConnection': {
    ko: '장소 데이터 연결에 문제가 있어 일정을 만들지 못했어요. 운영자에게 알려 주세요.',
    en: 'We could not build the plan because there is a problem with the place data connection. Please let the operator know.',
    ja: '場所データの接続に問題があるため、予定を作成できませんでした。運営者にお知らせください。',
    zh: '地点数据连接出现问题，未能生成行程。请告知运营方。',
  },
  'today.noPlanTourism': {
    ko: '관광 정보를 불러오지 못해 일정을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    en: 'We could not build the plan because tourism data could not be loaded. Please try again in a moment.',
    ja: '観光情報を読み込めなかったため、予定を作成できませんでした。しばらくしてからもう一度お試しください。',
    zh: '未能加载旅游信息，因此未能生成行程。请稍后重试。',
  },
  'today.noPlanNetwork': {
    ko: '서버에 연결하지 못해 일정을 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
    en: 'We could not reach the server, so the plan was not built. Check your internet connection and try again.',
    ja: 'サーバーに接続できなかったため、予定を作成できませんでした。インターネット接続を確認して、もう一度お試しください。',
    zh: '无法连接到服务器，未能生成行程。请检查网络连接后重试。',
  },
  'today.noPlanEngine': {
    ko: '일정을 계산하지 못했어요. 다시 시도해 주세요.',
    en: 'We could not calculate the plan. Please try again.',
    ja: '予定を計算できませんでした。もう一度お試しください。',
    zh: '未能计算行程。请重试。',
  },
  // 원인을 가리지 못하는 그 밖의 실패(요청 거부, 기기 저장 실패 등): 원인을 단정하지 않는다
  'today.noPlanGeneric': {
    ko: '일정을 만들지 못했어요. 다시 시도해 주세요.',
    en: 'We could not build the plan. Please try again.',
    ja: '予定を作成できませんでした。もう一度お試しください。',
    zh: '未能生成行程。请重试。',
  },
  'today.noPlanReadOnly': {
    ko: '로그인하고 인터넷에 연결되면 일정을 만들어요.',
    en: 'We will build the plan once you are signed in and online.',
    ja: 'ログインしてインターネットにつながると予定を作成します。',
    zh: '登录并联网后即可生成行程。',
  },
  'today.retry': { ko: '다시 시도', en: 'Try again', ja: 'もう一度試す', zh: '重试' },
  'today.beforeTripTitle': {
    ko: '여행 시작 전이에요',
    en: 'Your trip has not started yet',
    ja: '旅行はまだ始まっていません',
    zh: '行程尚未开始',
  },
  'today.beforeTripBody': {
    ko: '{date}부터 이 화면에 그날 일정이 보여요. 전체 일정은 지금도 볼 수 있어요.',
    en: 'From {date}, this screen shows that day’s plan. You can already see the whole trip.',
    ja: '{date}から、この画面にその日の予定が表示されます。全体の予定は今も見られます。',
    zh: '从{date}起，此页面会显示当天的行程。现在也可以查看整个行程。',
  },
  'today.afterTripTitle': { ko: '체류 기간이 끝났어요', en: 'Your stay has ended', ja: '滞在期間が終わりました', zh: '停留期已结束' },
  'today.afterTripBody': {
    ko: '이 기기의 체류 정보는 출국 7일이 지난 뒤 앱을 처음 열 때 삭제됩니다.',
    en: 'Trip data on this device is deleted the first time you open the app 7 days after departure.',
    ja: 'この端末の滞在情報は、出国から7日が過ぎたあと最初にアプリを開いたときに削除されます。',
    zh: '出境 7 天后首次打开应用时，将删除此设备上的行程信息。',
  },
  'today.seeTrip': { ko: '전체 일정 보기', en: 'See the whole trip', ja: '全体の予定を見る', zh: '查看整个行程' },

  // ── 매일 확인 (docs/business-rules.md '매일 확인') ──
  'today.checkFlag': { ko: '확인 필요', en: 'Check needed', ja: '確認が必要', zh: '需要确认' },
  'today.checkTitle': {
    ko: '오늘 조건이 그대로인가요?',
    en: 'Are today’s conditions the same?',
    ja: '今日の条件は変わりありませんか？',
    zh: '今天的条件没有变化吗？',
  },
  'today.checkLead': {
    ko: '병원 안내가 바뀌지 않았는지 확인해 주세요. 확인하기 전에는 길찾기와 일정 바꾸기를 잠시 멈춰요.',
    en: 'Please check that your hospital’s guidance has not changed. Until you confirm, directions and plan changes are paused.',
    ja: '病院の案内が変わっていないか確認してください。確認するまでは、道案内と予定の変更を一時停止します。',
    zh: '请确认医院的指引没有变化。确认之前，导航和修改行程会暂停。',
  },
  'today.checkSame': { ko: '그대로예요', en: 'Still the same', ja: '変わりありません', zh: '没有变化' },
  'today.checkChanged': { ko: '바뀌었어요', en: 'Something changed', ja: '変わりました', zh: '有变化' },
  'today.checkCompanionYes': {
    ko: '동반 보호자와 함께 지내요',
    en: 'You are staying with a companion',
    ja: '同行者と一緒に滞在しています',
    zh: '有陪同者一起停留',
  },
  'today.checkCompanionNo': {
    ko: '동반 보호자 없이 지내요',
    en: 'You are staying without a companion',
    ja: '同行者なしで滞在しています',
    zh: '没有陪同者',
  },
  'today.checkOthersNone': {
    ko: '그 밖의 {n}개 항목은 제한 없음',
    en: '{n} other items: no restriction',
    ja: 'そのほか{n}項目は制限なし',
    zh: '其他 {n} 项：无限制',
  },
  // 제한 항목은 접어 둔다: 펼치기 문구. 확인 화면이 조건 감사표가 되지 않게 한다(docs/business-rules.md '매일 확인')
  'today.checkMoreItems': {
    ko: '제한 항목 {n}개 보기',
    en: 'Show {n} restrictions',
    ja: '制限項目 {n} 件を表示',
    zh: '查看 {n} 项限制',
  },
  'today.checkDone': {
    ko: '오늘 확인을 마쳤어요. 자정까지 유지돼요.',
    en: 'Today’s check is done. It lasts until midnight.',
    ja: '今日の確認が終わりました。深夜0時まで有効です。',
    zh: '今天的确认已完成，有效至午夜。',
  },
  'today.checkReadOnly': {
    ko: '보기 전용이라 지금은 확인할 수 없어요. 로그인하면 확인할 수 있어요.',
    en: 'This is view-only, so you cannot confirm now. Sign in to confirm.',
    ja: '閲覧のみのため、今は確認できません。ログインすると確認できます。',
    zh: '当前为仅供查看模式，无法确认。登录后即可确认。',
  },

  // ── 알림·안내 ──
  'today.unconfirmedTitle': {
    ko: '확인하지 않은 병원 안내가 있어요',
    en: 'There is hospital guidance you have not reviewed',
    ja: '未確認の病院の案内があります',
    zh: '有尚未确认的医院指引',
  },
  'today.unconfirmedBody': {
    ko: '중요한 병원 안내를 확인하기 전에는 오늘 길찾기와 일정 바꾸기를 멈춰요.',
    en: 'Until you review the important hospital guidance, today’s directions and plan changes are paused.',
    ja: '重要な病院の案内を確認するまでは、今日の道案内と予定の変更を停止します。',
    zh: '确认重要的医院指引之前，今天的导航和修改行程会暂停。',
  },
  'today.unconfirmedCta': {
    ko: '병원 안내 확인하기',
    en: 'Review hospital guidance',
    ja: '病院の案内を確認する',
    zh: '查看医院指引',
  },
  'today.updateFailedTitle': {
    ko: '일정을 새로 고치지 못했어요',
    en: 'We could not update your plan',
    ja: '予定を更新できませんでした',
    zh: '未能更新行程',
  },
  'today.updateFailedBody': {
    ko: '마지막으로 저장한 일정을 그대로 보여 주고 있어요. 연결되면 다시 확인해요.',
    en: 'You are seeing the last saved plan. We will check again when you are connected.',
    ja: '最後に保存した予定をそのまま表示しています。接続されたら再確認します。',
    zh: '当前显示的是最后保存的行程。联网后会再次检查。',
  },
  // 관광공사 조회 실패 분류별 본문(components/trip/viewModel.js updateFailedBodyKey)
  'today.updateFailedQuota': {
    ko: '오늘 장소 데이터 제공처의 조회 한도에 닿았어요. 자정(한국 시각) 이후 다시 시도해 주세요. 저장된 일정은 그대로예요.',
    en: 'The place data provider has reached today’s lookup limit. Please try again after midnight (Korea time). Your saved plan is unchanged.',
    ja: '本日、場所データ提供元の照会上限に達しました。韓国時間の午前0時以降にもう一度お試しください。保存した予定はそのままです。',
    zh: '今天地点数据提供方的查询次数已达上限。请在韩国时间午夜之后重试。已保存的行程保持不变。',
  },
  'today.updateFailedTemporary': {
    ko: '장소 데이터를 잠시 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요. 저장된 일정은 그대로예요.',
    en: 'We could not load place data just now. Please try again in a moment. Your saved plan is unchanged.',
    ja: '場所データを一時的に読み込めませんでした。しばらくしてからもう一度お試しください。保存した予定はそのままです。',
    zh: '暂时无法加载地点数据。请稍后重试。已保存的行程保持不变。',
  },
  'today.updateFailedConnection': {
    ko: '장소 데이터 연결에 문제가 있어요. 운영자에게 알려 주세요. 저장된 일정은 그대로예요.',
    en: 'There is a problem with the place data connection. Please let the operator know. Your saved plan is unchanged.',
    ja: '場所データの接続に問題があります。運営者にお知らせください。保存した予定はそのままです。',
    zh: '地点数据连接出现问题。请告知运营方。已保存的行程保持不变。',
  },
  // 운영자에게 알려야 하는 실패(AUTH · SELF_LIMIT)에 붙는 링크(components/trip/HelpContactLink.js, findings 16)
  'today.contactLink': { ko: '문의하기', en: 'Contact us', ja: 'お問い合わせ', zh: '联系我们' },
  'today.helpLink': { ko: '도움말 보기', en: 'View help', ja: 'ヘルプを見る', zh: '查看帮助' },
  'today.syncing': { ko: '일정을 확인하는 중이에요…', en: 'Checking your plan…', ja: '予定を確認しています…', zh: '正在检查行程…' },
  'today.guardianResendTitle': {
    ko: '보호자에게 보낸 링크가 예전 일정이에요',
    en: 'Your companion’s link shows an older plan',
    ja: '同行者に送ったリンクは以前の予定です',
    zh: '发给陪同者的链接是旧行程',
  },
  'today.guardianResendBody': {
    ko: '일정이 바뀌었어요. 보호자 링크는 자동으로 바뀌지 않으니 다시 보내 주세요.',
    en: 'Your plan changed. The companion link does not update itself, so please send it again.',
    ja: '予定が変わりました。同行者のリンクは自動で更新されないため、もう一度送ってください。',
    zh: '行程已变化。陪同者链接不会自动更新，请重新发送。',
  },
  'today.guardianWindowTitle': {
    ko: '보낸 링크의 날짜가 지났어요',
    en: 'The dates in your companion link have passed',
    ja: '同行者に送ったリンクの日付が過ぎました',
    zh: '发给陪同者的链接日期已过',
  },
  'today.guardianWindowBody': {
    ko: '다음 {n}일 링크를 다시 보내 주세요.',
    en: 'Please send a new link for the next {n} days.',
    ja: '次の{n}日間のリンクを送り直してください。',
    zh: '请重新发送接下来{n}天的链接。',
  },
  'today.guardianResendCta': {
    ko: '보호자 링크 다시 보내기',
    en: 'Send the companion link again',
    ja: '同行者のリンクを再送する',
    zh: '重新发送陪同者链接',
  },
  'today.companionTitle': {
    ko: '보호자 일정을 더하려면 다시 만들어야 해요',
    en: 'Rebuild to add companion plans',
    ja: '同行者の予定を加えるには作り直しが必要です',
    zh: '需要重新生成才能加入陪同者行程',
  },
  'today.companionBody': {
    ko: '동반 보호자를 켰지만 이미 외출이 있는 날에는 보호자 외출이 더해지지 않았어요. 오늘 이후 일정을 다시 만들면 더해질 수 있어요.',
    en: 'You turned on a companion, but days that already have outings did not get companion outings. Rebuilding from today may add them.',
    ja: '同行者をオンにしましたが、すでに外出がある日には同行者の外出が追加されていません。今日以降の予定を作り直すと追加される場合があります。',
    zh: '已开启陪同者，但已有外出的日子没有加入陪同者外出。重新生成今天以后的行程后可能会加入。',
  },
  'today.companionCta': { ko: '다시 만들기', en: 'Rebuild', ja: '作り直す', zh: '重新生成' },
  'today.companionDismiss': { ko: '나중에', en: 'Later', ja: 'あとで', zh: '稍后' },
  'today.needsInputTitle': {
    ko: '오늘 일정을 만들려면 입력이 필요해요',
    en: 'We need more details to plan today',
    ja: '今日の予定を作るには入力が必要です',
    zh: '需要补充信息才能安排今天的行程',
  },

  // ── 다음 외출·복귀 마감 ──
  'today.nextOutTitle': { ko: '지금 외출 중', en: 'Out now', ja: '外出中', zh: '正在外出' },
  'today.nextNextTitle': { ko: '다음 외출', en: 'Next outing', ja: '次の外出', zh: '下一次外出' },
  'today.nextDoneTitle': {
    ko: '오늘 외출을 모두 마쳤어요',
    en: 'All of today’s outings are done',
    ja: '今日の外出はすべて終わりました',
    zh: '今天的外出已全部结束',
  },
  'today.departAt': { ko: '{time} 출발', en: 'Leave at {time}', ja: '{time} 出発', zh: '{time} 出发' },
  'today.returnTo': { ko: '돌아갈 곳: {place}', en: 'Return to: {place}', ja: '戻る場所：{place}', zh: '返回地点：{place}' },
  'today.nextStop': { ko: '다음 장소', en: 'Next place', ja: '次の場所', zh: '下一个地点' },
  'today.noOutingTitle': {
    ko: '오늘은 외출 일정이 없어요',
    en: 'No outings today',
    ja: '今日は外出の予定がありません',
    zh: '今天没有外出安排',
  },
  'today.noOutingBody': {
    ko: '위 상태와 사유를 확인해 주세요. 숙소에서 쉬는 날일 수 있어요.',
    en: 'Please check the status and reasons above. It may be a day to rest where you stay.',
    ja: '上の状態と理由をご確認ください。宿泊先で休む日かもしれません。',
    zh: '请查看上方的状态和原因。今天可能是在住处休息的日子。',
  },
  'today.appointmentLine': {
    ko: '병원 일정 {start}–{end} (이동 포함)',
    en: 'Hospital appointment {start}–{end} (including travel)',
    ja: '病院の予定 {start}–{end}（移動を含む）',
    zh: '医院预约 {start}–{end}（含交通）',
  },
  'today.gatedMaps': {
    ko: '매일 확인을 마치면 길찾기를 쓸 수 있어요.',
    en: 'Directions open once you finish today’s check.',
    ja: '毎日の確認が終わると道案内を使えます。',
    zh: '完成每日确认后即可使用导航。',
  },
  'today.gatedHospital': {
    ko: '병원 안내를 확인하면 길찾기를 쓸 수 있어요.',
    en: 'Directions open once you review the hospital guidance.',
    ja: '病院の案内を確認すると道案内を使えます。',
    zh: '确认医院指引后即可使用导航。',
  },
  'today.fullDay': { ko: '오늘 전체 일정', en: 'Today’s full plan', ja: '今日の予定をすべて見る', zh: '今天的完整行程' },
  'today.tomorrow': { ko: '내일 일정', en: 'Tomorrow’s plan', ja: '明日の予定', zh: '明天的行程' },
  'today.privacyLink': {
    ko: '개인정보·면책 고지',
    en: 'Privacy and disclaimer',
    ja: '個人情報・免責の告知',
    zh: '个人信息与免责声明',
  },
};

/** 안전 문구 — 오늘 화면의 복귀 안내는 trip 이름공간 안전 문구를 함께 쓴다 */
export const safety = {};
