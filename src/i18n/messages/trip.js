// trip 이름공간 — 전체 일정(/trip)·하루 일정(/trip/[date])·전후 비교·복귀 시트·데모 사건 (AX-303 → AX-317)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// 퇴역한 단일 외출 흐름(`/plan`·`/result`)의 키(`plan.`·`result.`·`card.`)는 AX-317 에서 지웠다.
// 남은 기존 접두사: `event.`·`eventPanel.`(데모 사건 6종, test/i18n.test.js 가 고정), `delta.`(전후 비교 시트),
// `return.`(즉시 복귀 시트 — 안전 문구). 새 키는 `trip.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  // ── 전체 일정 (/trip) ──
  'trip.header': { ko: '전체 일정', en: 'Whole trip', ja: '全体の予定', zh: '整个行程' },
  'trip.loading': { ko: '일정을 불러오는 중이에요…', en: 'Loading the plan…', ja: '予定を読み込んでいます…', zh: '正在加载行程…' },
  'trip.range': { ko: '{start}부터 {end}까지', en: 'From {start} to {end}', ja: '{start}から{end}まで', zh: '从{start}到{end}' },
  'trip.changed': { ko: '변경됨', en: 'Changed', ja: '変更あり', zh: '有变化' },
  'trip.changedCta': {
    ko: '변경됨 — 무엇이 바뀌었는지 보기',
    en: 'Changed — see what changed',
    ja: '変更あり — 変更内容を見る',
    zh: '有变化 — 查看变化内容',
  },
  'trip.returnNowTag': { ko: '즉시 복귀', en: 'Return now', ja: 'すぐに戻る', zh: '立即返回' },
  'trip.dayPending': { ko: '일정 준비 중', en: 'Plan not ready', ja: '予定を準備中', zh: '行程准备中' },
  'trip.stopCount': { ko: '장소 {n}곳', en: '{n} places', ja: '{n}か所', zh: '{n} 个地点' },
  'trip.guardianStopCount': { ko: '보호자 {n}곳', en: 'Companion: {n} places', ja: '同行者 {n}か所', zh: '陪同者 {n} 个地点' },
  'trip.fixTitle': {
    ko: '이 날짜는 입력이 더 필요해요',
    en: 'This day needs more details',
    ja: 'この日は入力がさらに必要です',
    zh: '这一天需要补充信息',
  },
  'trip.fixLodging': {
    ko: '이 날짜의 숙소 넣기',
    en: 'Add where you stay this night',
    ja: 'この日の宿泊先を入れる',
    zh: '填写当天的住处',
  },
  'trip.fixConsent': {
    ko: '민감정보 동의하고 조건 넣기',
    en: 'Give consent and add conditions',
    ja: '機微情報に同意して条件を入れる',
    zh: '同意敏感信息并填写条件',
  },
  'trip.fixExpired': {
    ko: '새 병원 지침 받기 또는 본인 체크 넣기',
    en: 'Get new hospital guidance or add a self-check',
    ja: '新しい病院のガイドを受け取るか、本人チェックを入れる',
    zh: '获取新的医院指引或填写本人确认',
  },
  'trip.fixConditions': {
    ko: '이 날짜의 조건 넣기',
    en: 'Add conditions for this day',
    ja: 'この日の条件を入れる',
    zh: '填写当天的条件',
  },
  'trip.toolsTitle': { ko: '일정 편집', en: 'Edit the plan', ja: '予定の編集', zh: '编辑行程' },
  'trip.regenerateAll': {
    ko: '오늘 이후 일정 다시 만들기',
    en: 'Rebuild from today',
    ja: '今日以降の予定を作り直す',
    zh: '重新生成今天以后的行程',
  },

  // ── 하루 일정 (/trip/[date]) ──
  'trip.dayHeader': { ko: '하루 일정', en: 'Day plan', ja: '1日の予定', zh: '当天行程' },
  'trip.backToTrip': { ko: '전체 일정으로', en: 'Back to the whole trip', ja: '全体の予定へ', zh: '返回整个行程' },
  'trip.stripLabel': { ko: '날짜 고르기', en: 'Choose a date', ja: '日付を選ぶ', zh: '选择日期' },
  'trip.notInStayTitle': {
    ko: '체류 기간이 아닌 날짜예요',
    en: 'This date is outside your stay',
    ja: '滞在期間外の日付です',
    zh: '该日期不在停留期内',
  },
  'trip.notInStayBody': {
    ko: '전체 일정에서 날짜를 골라 주세요.',
    en: 'Please pick a date from the whole trip.',
    ja: '全体の予定から日付を選んでください。',
    zh: '请从整个行程中选择日期。',
  },
  'trip.noDayTitle': {
    ko: '이 날짜의 일정이 아직 없어요',
    en: 'No plan for this date yet',
    ja: 'この日の予定はまだありません',
    zh: '这一天还没有行程',
  },
  'trip.noDayBody': {
    ko: '로그인하고 인터넷에 연결되면 이 날짜의 일정을 만들어요.',
    en: 'We will build this day once you are signed in and online.',
    ja: 'ログインしてインターネットにつながると、この日の予定を作成します。',
    zh: '登录并联网后即可生成这一天的行程。',
  },
  'trip.gatedToday': {
    ko: '오늘은 매일 확인 전이라 길찾기와 일정 바꾸기를 멈췄어요.',
    en: 'Today’s check is not done yet, so directions and plan changes are paused.',
    ja: '今日はまだ毎日の確認前のため、道案内と予定の変更を停止しています。',
    zh: '今天尚未完成每日确认，导航和修改行程已暂停。',
  },
  'trip.goDailyCheck': {
    ko: '오늘 화면에서 확인하기',
    en: 'Check on the Today screen',
    ja: '「今日」画面で確認する',
    zh: '在“今天”页面确认',
  },
  'trip.tabsLabel': { ko: '누구의 일정', en: 'Whose plan', ja: '誰の予定', zh: '谁的行程' },
  'trip.tabPatient': { ko: '환자', en: 'Patient', ja: '患者さん', zh: '患者' },
  'trip.tabGuardian': { ko: '보호자', en: 'Companion', ja: '同行者', zh: '陪同者' },
  'trip.lockedLabel': { ko: '잠김', en: 'locked', ja: 'ロック中', zh: '已锁定' },
  'trip.timelinePatient': { ko: '환자 일정', en: 'Patient’s plan', ja: '患者の予定', zh: '患者行程' },
  'trip.timelineGuardian': { ko: '보호자 일정', en: 'Companion’s plan', ja: '同行者の予定', zh: '陪同者行程' },
  'trip.noTimeline': {
    ko: '이 날은 보여 줄 일정이 없어요. 위 상태와 사유를 확인해 주세요.',
    en: 'There is nothing to show for this day. Please check the status and reasons above.',
    ja: 'この日は表示できる予定がありません。上の状態と理由をご確認ください。',
    zh: '这一天没有可显示的行程。请查看上方的状态和原因。',
  },
  'trip.guardianLockTitle': {
    ko: '보호자 단독 외출 없음',
    en: 'No solo outing for the companion',
    ja: '同行者だけの外出はありません',
    zh: '陪同者无单独外出',
  },
  'trip.guardianInfoTitle': {
    ko: '보호자 일정 안내',
    en: 'About the companion’s plan',
    ja: '同行者の予定について',
    zh: '关于陪同者行程',
  },
  'trip.placeLodging': { ko: '숙소', en: 'Your stay', ja: '宿泊先', zh: '住处' },
  'trip.placeHospital': { ko: '병원', en: 'Hospital', ja: '病院', zh: '医院' },
  'trip.medicationAtLodging': { ko: '숙소에서 복용', en: 'Take at your stay', ja: '宿泊先で服用', zh: '在住处服用' },

  // ── 장소 카드 ──
  'trip.stayMin': { ko: '머무름 {n}분', en: 'Stay {n} min', ja: '滞在{n}分', zh: '停留 {n} 分钟' },
  'trip.shortened': { ko: '시간을 줄였어요', en: 'shortened', ja: '短縮', zh: '已缩短' },
  'trip.indoor': { ko: '실내', en: 'Indoor', ja: '屋内', zh: '室内' },
  'trip.outdoor': { ko: '실외', en: 'Outdoor', ja: '屋外', zh: '室外' },
  'trip.indoorUnknown': {
    ko: '실내 여부 모름',
    en: 'Indoor or outdoor unknown',
    ja: '屋内かどうか不明',
    zh: '不确定是否在室内',
  },
  'trip.pinned': { ko: '직접 고름', en: 'Picked by you', ja: '自分で選択', zh: '自己选择' },
  'trip.needsTranslation': { ko: '번역 필요', en: 'Translation needed', ja: '翻訳が必要', zh: '需要翻译' },
  'trip.dietEstimated': { ko: '식이 추정', en: 'Diet estimate', ja: '食事の推定', zh: '饮食估算' },
  'trip.orderCard': {
    ko: '주문할 때 보여 줄 한국어 카드',
    en: 'Korean card to show when ordering',
    ja: '注文時に見せる韓国語カード',
    zh: '点餐时出示的韩语卡片',
  },
  'trip.photoCredit': {
    ko: '사진 ⓒ한국관광공사',
    en: 'Photo ⓒKorea Tourism Organization',
    ja: '写真 ⓒ韓国観光公社',
    zh: '照片 ⓒ韩国观光公社',
  },

  // ── 편집 (docs/business-rules.md '사용자 편집') ──
  'trip.actionSwap': { ko: '바꾸기', en: 'Swap', ja: '変更', zh: '更换' },
  'trip.actionDelete': { ko: '빼기', en: 'Remove', ja: '外す', zh: '移除' },
  'trip.actionClearMeal': { ko: '식사 칸 비우기', en: 'Clear this meal', ja: 'この食事枠を空ける', zh: '清空此餐' },
  'trip.regenerate': { ko: '이 날짜 다시 만들기', en: 'Rebuild this day', ja: 'この日を作り直す', zh: '重新生成这一天' },
  'trip.regenerateTitle': {
    ko: '일정을 다시 만들까요?',
    en: 'Rebuild the plan?',
    ja: '予定を作り直しますか？',
    zh: '要重新生成行程吗？',
  },
  'trip.regenerateBody': {
    ko: '직접 고른 장소와 뺀 장소 기록을 지우고 처음부터 다시 짜요. 오늘 이미 출발한 외출은 그대로 둬요.',
    en: 'Places you picked or removed are forgotten and the plan is built again from scratch. Outings that already started today stay as they are.',
    ja: '自分で選んだ場所や外した場所の記録を消して、最初から組み直します。今日すでに出発した外出はそのままです。',
    zh: '将清除您选择或移除的地点记录，并从头重新安排。今天已经出发的外出保持不变。',
  },
  'trip.regenerateScope': { ko: '범위', en: 'Range', ja: '範囲', zh: '范围' },
  'trip.regenerateDay': { ko: '이 날짜만', en: 'This day only', ja: 'この日だけ', zh: '仅这一天' },
  'trip.regenerateFromToday': { ko: '오늘 이후 전체', en: 'Everything from today', ja: '今日以降すべて', zh: '今天以后全部' },
  'trip.regenerateConfirm': { ko: '다시 만들기', en: 'Rebuild', ja: '作り直す', zh: '重新生成' },
  'trip.cancel': { ko: '취소', en: 'Cancel', ja: 'キャンセル', zh: '取消' },
  'trip.regenerateDone': {
    ko: '일정을 다시 만들었어요.',
    en: 'The plan was rebuilt.',
    ja: '予定を作り直しました。',
    zh: '行程已重新生成。',
  },
  'trip.deleted': {
    ko: '장소를 뺐어요. 외출 시각을 다시 계산했어요.',
    en: 'Place removed. Outing times were recalculated.',
    ja: '場所を外しました。外出の時刻を計算し直しました。',
    zh: '已移除地点，并重新计算了外出时间。',
  },
  'trip.mealCleared': {
    ko: '식사 칸을 비웠어요. 자동으로 다시 채우지 않아요.',
    en: 'Meal cleared. We will not refill it automatically.',
    ja: '食事枠を空けました。自動では埋め直しません。',
    zh: '已清空此餐，不会自动重新安排。',
  },
  'trip.swapped': {
    ko: '장소를 바꿨어요. 바꾼 장소는 직접 고른 곳으로 표시돼요.',
    en: 'Place swapped. It is marked as picked by you.',
    ja: '場所を変更しました。変更した場所は自分で選んだ場所として表示されます。',
    zh: '已更换地点，并标记为自己选择。',
  },
  'trip.working': { ko: '처리하는 중이에요…', en: 'Working on it…', ja: '処理しています…', zh: '正在处理…' },
  'trip.editPast': {
    ko: '지난 날짜는 바꿀 수 없어요.',
    en: 'Past days cannot be changed.',
    ja: '過ぎた日は変更できません。',
    zh: '过去的日期无法更改。',
  },
  'trip.editReadOnly': {
    ko: '보기 전용이라 바꿀 수 없어요. 로그인하면 바꿀 수 있어요.',
    en: 'This is view-only. Sign in to make changes.',
    ja: '閲覧のみのため変更できません。ログインすると変更できます。',
    zh: '当前仅供查看，登录后才能更改。',
  },
  'trip.editGated': {
    ko: '매일 확인을 마치면 오늘 일정을 바꿀 수 있어요.',
    en: 'You can change today’s plan after today’s check.',
    ja: '毎日の確認が終わると今日の予定を変更できます。',
    zh: '完成每日确认后才能更改今天的行程。',
  },
  'trip.editNoPlan': {
    ko: '일정이 만들어진 뒤에 바꿀 수 있어요.',
    en: 'You can make changes once a plan exists.',
    ja: '予定が作成されてから変更できます。',
    zh: '生成行程后才能更改。',
  },
  'trip.errStopStarted': {
    ko: '이미 도착한 장소는 바꿀 수 없어요.',
    en: 'A place you already reached cannot be changed.',
    ja: 'すでに到着した場所は変更できません。',
    zh: '已到达的地点无法更改。',
  },
  'trip.errSwapNotPlaced': {
    ko: '그사이 판정이 바뀌어 이 장소를 넣을 수 없어요. 일정은 그대로예요.',
    en: 'The check changed in the meantime, so this place cannot be added. Your plan is unchanged.',
    ja: 'その間に判定が変わったため、この場所は入れられません。予定はそのままです。',
    zh: '期间判定已变化，无法加入此地点。行程保持不变。',
  },
  'trip.errUpdate': {
    ko: '연결에 실패해 일정을 바꾸지 못했어요. 기존 일정은 그대로예요.',
    en: 'We could not connect, so nothing changed. Your existing plan stays.',
    ja: '接続できず、予定を変更できませんでした。これまでの予定はそのままです。',
    zh: '连接失败，行程未更改。原有行程保持不变。',
  },
  'trip.errNotFound': {
    ko: '이 장소를 일정에서 찾지 못했어요.',
    en: 'This place is no longer in the plan.',
    ja: 'この場所は予定に見つかりませんでした。',
    zh: '在行程中找不到此地点。',
  },
  'trip.errGeneric': {
    ko: '처리하지 못했어요. 다시 시도해 주세요.',
    en: 'Something went wrong. Please try again.',
    ja: '処理できませんでした。もう一度お試しください。',
    zh: '未能完成，请重试。',
  },
  'trip.swapTitle': { ko: '다른 장소로 바꾸기', en: 'Swap for another place', ja: '別の場所に変更', zh: '更换为其他地点' },
  'trip.swapFrom': { ko: '지금 장소: {title}', en: 'Current place: {title}', ja: '今の場所：{title}', zh: '当前地点：{title}' },
  'trip.swapLead': {
    ko: '같은 시간 자리에 넣을 수 있는 곳만 보여 줘요(최대 5곳). 고르면 복귀 계산과 걷기·이동 한도를 다시 확인해요.',
    en: 'Only places that fit the same time slot are shown (up to 5). When you pick one we re-check the return time and walking and travel limits.',
    ja: '同じ時間枠に入れられる場所だけを表示します（最大5か所）。選ぶと、戻り時刻と歩行・移動の上限をもう一度確認します。',
    zh: '只显示可放入同一时段的地点（最多 5 个）。选择后会再次核对返回时间以及步行和交通上限。',
  },
  'trip.swapLoading': {
    ko: '넣을 수 있는 곳을 찾는 중이에요…',
    en: 'Looking for places that fit…',
    ja: '入れられる場所を探しています…',
    zh: '正在查找可放入的地点…',
  },
  'trip.swapEmpty': {
    ko: '지금 넣을 수 있는 다른 장소가 없어요.',
    en: 'No other place fits right now.',
    ja: '今入れられる別の場所はありません。',
    zh: '目前没有可放入的其他地点。',
  },
  'trip.swapPaused': {
    ko: '지금은 추천을 멈춘 상태예요.',
    en: 'Recommendations are paused right now.',
    ja: '現在おすすめを停止しています。',
    zh: '目前已暂停推荐。',
  },
  'trip.swapPick': { ko: '이 장소로 바꾸기', en: 'Swap to this place', ja: 'この場所に変更', zh: '更换为此地点' },
  'trip.swapSlack': {
    ko: '복귀까지 여유 {n}분',
    en: '{n} min to spare before the return time',
    ja: '戻り期限まで余裕{n}分',
    zh: '距返回截止还有 {n} 分钟余量',
  },

  // ── 근거 (적용한 조건·빠진 장소) ──
  'trip.conditionsTitle': {
    ko: '이 날 적용한 조건',
    en: 'Conditions applied this day',
    ja: 'この日に適用した条件',
    zh: '当天适用的条件',
  },
  'trip.conditionsNone': {
    ko: '이 날은 적용한 조건 기간이 없어요.',
    en: 'No condition period applies to this day.',
    ja: 'この日に適用する条件期間はありません。',
    zh: '这一天没有适用的条件期间。',
  },
  'trip.windowLine': {
    ko: '활동 시간 {start}–{end}',
    en: 'Activity hours {start}–{end}',
    ja: '活動時間 {start}–{end}',
    zh: '活动时间 {start}–{end}',
  },
  'trip.transportTAXI': { ko: '이동: 택시 기준', en: 'Travel: by taxi', ja: '移動：タクシー基準', zh: '交通：按出租车' },
  'trip.transportTRANSIT': {
    ko: '이동: 대중교통 기준',
    en: 'Travel: by public transport',
    ja: '移動：公共交通基準',
    zh: '交通：按公共交通',
  },
  'trip.excludedTitle': {
    ko: '빠진 장소와 사유 ({n})',
    en: 'Places left out and why ({n})',
    ja: '外した場所と理由（{n}）',
    zh: '未入选地点及原因（{n}）',
  },

  // ── 하루 소개 (docs/business-rules.md 'AI 소개 문장') ──
  'trip.introTitle': { ko: '하루 소개', en: 'About the day', ja: '1日の紹介', zh: '当天简介' },
  'trip.introAiNote': {
    ko: 'AI가 쓴 소개예요. 판정과 사유에는 쓰지 않고, 틀릴 수 있어요.',
    en: 'Written by AI. It is not used for any decision and may be wrong.',
    ja: 'AIが書いた紹介です。判定や理由には使わず、誤りがあるかもしれません。',
    zh: '由 AI 撰写的介绍。不用于任何判定或原因，可能有误。',
  },
  'trip.introTemplateLabel': {
    ko: '하루 소개 · 정해진 문장',
    en: 'About the day · fixed wording',
    ja: '1日の紹介・定型文',
    zh: '当天简介 · 固定文句',
  },

  // ── 데모 사건 패널 ──
  'trip.demoEvents': { ko: '오늘 들어온 데모 사건', en: 'Demo events today', ja: '今日のデモ事象', zh: '今天的演示事件' },
  'trip.demoUnknown': { ko: '알 수 없는 사건', en: 'Unknown event', ja: '不明な事象', zh: '未知事件' },
  'trip.demoReset': { ko: '사건 초기화', en: 'Clear demo events', ja: '事象をリセット', zh: '清除演示事件' },
  'trip.demoApplied': {
    ko: '데모 사건을 반영해 오늘 일정을 다시 판정했어요.',
    en: 'The demo event was applied and today was re-checked.',
    ja: 'デモ事象を反映し、今日の予定を判定し直しました。',
    zh: '已应用演示事件并重新判定今天的行程。',
  },
  'trip.demoResetDone': {
    ko: '데모 사건을 지우고 오늘 일정을 다시 판정했어요.',
    en: 'Demo events cleared and today was re-checked.',
    ja: 'デモ事象を消し、今日の予定を判定し直しました。',
    zh: '已清除演示事件并重新判定今天的行程。',
  },

  // ── 데모 사건 6종 (docs/platform/ITINERARY_RULES.md '데모 사건') ──
  'event.CLOSURE': { ko: '장소 휴무', en: 'Place closed', ja: '場所が休業', zh: '地点停业' },
  'event.WEATHER': { ko: '기상 악화', en: 'Bad weather', ja: '天候の悪化', zh: '天气恶化' },
  'event.TRAFFIC_SURGE': { ko: '교통 지연', en: 'Traffic delay', ja: '交通の遅れ', zh: '交通延误' },
  'event.APPOINTMENT': { ko: '병원 일정 변경', en: 'Appointment moved', ja: '病院の予定の変更', zh: '医院预约变更' },
  'event.PATIENT_RECALL': { ko: '환자 호출', en: 'Patient recalled', ja: '患者の呼び戻し', zh: '患者召回' },
  'event.RISK_SIGNAL': { ko: '위험 신호', en: 'Warning sign', ja: '注意サイン', zh: '警示信号' },
  'eventPanel.title': {
    ko: '변화 시연 (병원 연동 데모)',
    en: 'Simulate a change (hospital link demo)',
    ja: '変化の試行（病院連携デモ）',
    zh: '模拟变化（医院对接演示）',
  },
  'eventPanel.lead': {
    ko: '데모 사건을 넣으면 오늘 일정을 처음부터 다시 판정해요. 알림만 띄우고 예전 일정을 두지 않아요. 실제 병원 연동이 아니에요.',
    en: 'Adding a demo event re-checks today from the start. We never just notify you and keep the old plan. This is not a real hospital link.',
    ja: 'デモ事象を入れると、今日の予定を最初から判定し直します。通知だけして以前の予定を残すことはしません。実際の病院連携ではありません。',
    zh: '加入演示事件后，会从头重新判定今天的行程。不会只发通知而保留旧行程。这不是实际的医院对接。',
  },
  'eventPanel.CLOSURE': { ko: '다음 장소 휴무', en: 'Next place closes', ja: '次の場所が休業', zh: '下一个地点停业' },
  'eventPanel.CLOSUREDesc': {
    ko: '아직 도착하지 않은 첫 장소가 닫힌 것으로 봐요.',
    en: 'The first place you have not reached yet is treated as closed.',
    ja: 'まだ到着していない最初の場所が休業したものとみなします。',
    zh: '将尚未到达的第一个地点视为停业。',
  },
  'eventPanel.WEATHER': { ko: '기상 악화', en: 'Weather worsens', ja: '天候が悪化', zh: '天气恶化' },
  'eventPanel.WEATHERDesc': {
    ko: '실외 활동이 부적합하다고 봐요.',
    en: 'Outdoor activity is treated as unsuitable.',
    ja: '屋外での活動は不適とみなします。',
    zh: '将室外活动视为不适宜。',
  },
  'eventPanel.TRAFFIC_SURGE': {
    ko: '교통 지연 +20분',
    en: 'Traffic delay +20 min',
    ja: '交通の遅れ +20分',
    zh: '交通延误 +20 分钟',
  },
  'eventPanel.TRAFFIC_SURGEDesc': {
    ko: '오늘 모든 외출의 복귀 계산에 20분을 더해요.',
    en: 'Adds 20 minutes to every return calculation today.',
    ja: '今日のすべての外出の戻り計算に20分を加えます。',
    zh: '今天所有外出的返回计算都加上 20 分钟。',
  },
  'eventPanel.APPOINTMENT': {
    ko: '병원 일정 1시간 앞당김',
    en: 'Appointment 1 hour earlier',
    ja: '病院の予定が1時間早まる',
    zh: '医院预约提前 1 小时',
  },
  'eventPanel.APPOINTMENTDesc': {
    ko: '오늘 병원 일정을 60분 앞으로 옮겨요.',
    en: 'Moves today’s hospital appointment 60 minutes earlier.',
    ja: '今日の病院の予定を60分早めます。',
    zh: '将今天的医院预约提前 60 分钟。',
  },
  'eventPanel.PATIENT_RECALL': { ko: '환자 호출', en: 'Recall the patient', ja: '患者の呼び戻し', zh: '召回患者' },
  'eventPanel.PATIENT_RECALLDesc': {
    ko: '오늘 남은 일정을 비우고 즉시 복귀 안내를 띄워요.',
    en: 'Clears the rest of today and shows the return-now guidance.',
    ja: '今日の残りの予定を空にして、すぐに戻る案内を表示します。',
    zh: '清空今天剩余的行程并显示立即返回指引。',
  },
  'eventPanel.RISK_SIGNAL': { ko: '위험 신호 입력', en: 'Report a warning sign', ja: '注意サインを入力', zh: '报告警示信号' },
  'eventPanel.RISK_SIGNALDesc': {
    ko: '내용을 해석하지 않고 오늘 남은 외출을 모두 멈춰요.',
    en: 'Stops all remaining outings today without interpreting the report.',
    ja: '内容を解釈せず、今日の残りの外出をすべて止めます。',
    zh: '不解读内容，停止今天剩余的全部外出。',
  },

  // ── 전후 비교 시트 (docs/business-rules.md '전체 일정 확정과 변화 대응') ──
  'delta.title': { ko: '무엇이 바뀌었나요', en: 'What changed', ja: '何が変わりましたか', zh: '有哪些变化' },
  'delta.lead': {
    ko: '변화를 반영해 일정을 이미 다시 짰어요. 알림만 보내고 예전 일정을 그대로 두지 않아요.',
    en: 'We already rebuilt the plan for this change. We never just notify you and keep the old plan.',
    ja: '変化を反映して、予定をすでに組み直しました。通知だけして以前の予定を残すことはしません。',
    zh: '已根据变化重新安排行程。我们不会只发通知而保留旧行程。',
  },
  'delta.state': { ko: '상태', en: 'Status', ja: '状態', zh: '状态' },
  'delta.reasons': { ko: '사유', en: 'Reasons', ja: '理由', zh: '原因' },
  'delta.tagReplaced': { ko: '대체', en: 'Replaced', ja: '差し替え', zh: '替换' },
  'delta.tagRemoved': { ko: '빠짐', en: 'Removed', ja: '除外', zh: '移除' },
  'delta.tagAdded': { ko: '추가', en: 'Added', ja: '追加', zh: '新增' },
  'delta.tagShortened': { ko: '줄어듦', en: 'Shortened', ja: '短縮', zh: '缩短' },
  'delta.tagCancelled': { ko: '외출 취소', en: 'Outing cancelled', ja: '外出取り消し', zh: '外出取消' },
  'delta.tagDeadline': { ko: '새 마감', en: 'New deadline', ja: '新しい期限', zh: '新截止' },
  'delta.unknownPlace': {
    ko: '이름을 알 수 없는 장소',
    en: 'A place (name unavailable)',
    ja: '名前のわからない場所',
    zh: '名称未知的地点',
  },
  'delta.cancelledBody': {
    ko: '외출 하나가 취소됐어요',
    en: 'One outing was cancelled',
    ja: '外出が1件取り消されました',
    zh: '有一次外出被取消',
  },
  'delta.guardianPrefix': { ko: '보호자', en: 'Companion', ja: '同行者', zh: '陪同者' },
  'delta.noRows': {
    ko: '장소는 그대로이고 상태·사유만 바뀌었어요.',
    en: 'The places are the same; only the status and reasons changed.',
    ja: '場所はそのままで、状態と理由だけが変わりました。',
    zh: '地点未变，只有状态和原因发生了变化。',
  },

  // ── 즉시 복귀 시트 — 라벨·조작 ──
  'return.placeTitle': { ko: '돌아갈 곳', en: 'Where to go back to', ja: '戻る場所', zh: '返回地点' },
  'return.noLodging': {
    ko: '이 날의 숙소 정보가 없어요. 체류 정보를 확인해 주세요.',
    en: 'No place to stay is set for this day. Please check your trip details.',
    ja: 'この日の宿泊先の情報がありません。滞在情報をご確認ください。',
    zh: '这一天没有住处信息。请检查行程信息。',
  },
  'return.cardLink': {
    ko: '택시 기사에게 보여 줄 한국어 복귀 카드',
    en: 'Korean return card to show a taxi driver',
    ja: 'タクシー運転手に見せる韓国語の帰着カード',
    zh: '给出租车司机看的韩语返回卡片',
  },
  'return.call119': { ko: '119에 전화하기', en: 'Call 119', ja: '119に電話する', zh: '拨打 119' },
  'return.emergencyLink': {
    ko: '긴급 연락처 모두 보기',
    en: 'See all emergency contacts',
    ja: '緊急連絡先をすべて見る',
    zh: '查看所有紧急联系方式',
  },
  'return.confirm': { ko: '확인했어요', en: 'I understand', ja: '確認しました', zh: '我已知晓' },
  'return.placePlanned': { ko: '정해 둔 장소', en: 'Your planned place', ja: '予定の場所', zh: '预定地点' },
  'return.reopen': {
    ko: '복귀 안내 다시 보기',
    en: 'Show return guidance again',
    ja: '帰着案内をもう一度見る',
    zh: '再次查看返回指引',
  },
};

/** 안전 문구 — 복귀 안내(시트·마감·마감 이유·예상 귀가), 보호자 잠금 사유, 경고, 면책 */
export const safety = {
  'return.title': { ko: '지금 돌아가세요', en: 'Go back now', ja: '今すぐ戻ってください', zh: '请立即返回' },
  'return.body': {
    ko: '오늘 남은 일정을 비웠어요. 아래 숙소로 이동하세요. 몸 상태가 걱정되면 이동하기 전에 병원에 먼저 연락하세요.',
    en: 'The rest of today’s plan was cleared. Head back to your stay below. If you are worried about how you feel, contact your hospital before you move.',
    ja: '今日の残りの予定を空にしました。下の宿泊先へ移動してください。体調が心配なときは、移動する前にまず病院へ連絡してください。',
    zh: '今天剩余的行程已清空。请前往下方的住处。如担心身体状况，请在出发前先联系医院。',
  },
  'return.note': {
    ko: '지도 링크에는 숙소 위치를 넣지 않아요. 택시 기사에게 한국어 복귀 카드를 보여 주세요. 긴급하면 바로 119에 전화하세요.',
    en: 'We never put where you stay into map links. Show the Korean return card to a taxi driver. In an emergency call 119 right away.',
    ja: '地図のリンクに宿泊先の位置は入れません。タクシー運転手に韓国語の帰着カードを見せてください。緊急時はすぐに119へ電話してください。',
    zh: '地图链接不会包含住处位置。请向出租车司机出示韩语返回卡片。如遇紧急情况，请立即拨打 119。',
  },
  // 병원·정해 둔 장소용 맺음말. 시트 맨 아래에 놓이므로 위의 장소 칸을 가리킨다. 한국어 복귀 카드는 숙소 카드라 말하지 않는다 (findings 11)
  'return.notePlace': {
    ko: '길을 물을 때는 위의 장소 정보를 보여 주세요. 위급하면 119에 전화하세요.',
    en: 'When asking for directions, show the place details above. In an emergency, call 119.',
    ja: '道をたずねるときは、上の場所の情報を見せてください。緊急のときは119に電話してください。',
    zh: '问路时请出示上方的地点信息。紧急情况请拨打119。',
  },
  'return.bodyPlace': {
    ko: '오늘 남은 일정을 비웠어요. 아래 장소로 이동하세요. 몸 상태가 걱정되면 이동하기 전에 병원에 먼저 연락하세요.',
    en: 'The rest of today’s plan was cleared. Head to the place below. If you are worried about how you feel, contact your hospital before you move.',
    ja: '今日の残りの予定を空にしました。下の場所へ移動してください。体調が心配なときは、移動する前にまず病院へ連絡してください。',
    zh: '今天剩余的行程已清空。请前往下方地点。如担心身体状况，请在出发前先联系医院。',
  },
  'return.passedTitle': { ko: '복귀 마감 시각이 지났어요', en: 'Your return time has passed', ja: '帰着期限を過ぎました', zh: '返回截止时间已过' },
  'return.passedBody': {
    ko: '아직 밖이라면 아래 장소로 바로 이동하세요. 이미 돌아왔다면 아래 버튼을 눌러 닫으세요.',
    en: 'If you are still out, go straight to the place below. If you are already back, close this with the button below.',
    ja: 'まだ外出中なら、下の場所へすぐ移動してください。すでに戻っている場合は、下のボタンで閉じてください。',
    zh: '如果你还在外面，请立即前往下方地点。如果已经返回，请点击下方按钮关闭。',
  },
  'return.deadline': { ko: '복귀 마감 {time}', en: 'Be back by {time}', ja: '帰着期限 {time}', zh: '返回截止 {time}' },
  'trip.plannedReturn': { ko: '예상 귀가 {time}', en: 'Expected back {time}', ja: '帰着予定 {time}', zh: '预计返回 {time}' },

  // 외출 마감 이유 (docs/business-rules.md '하루 일정 생성'의 마감 후보 표)
  'trip.deadlineRETURN_TIME': {
    ko: '정해진 복귀 시각 기준',
    en: 'Set by your return time',
    ja: '決められた戻り時刻による',
    zh: '依据规定的返回时间',
  },
  'trip.deadlineMEDICATION': {
    ko: '숙소에서 먹을 약 시각 기준',
    en: 'Set by medicine you take at your stay',
    ja: '宿泊先で飲む薬の時刻による',
    zh: '依据在住处服药的时间',
  },
  'trip.deadlineAPPOINTMENT': {
    ko: '다음 병원 일정 기준',
    en: 'Set by your next hospital appointment',
    ja: '次の病院の予定による',
    zh: '依据下一次医院预约',
  },
  'trip.deadlineDAY_END': {
    ko: '하루 활동 종료 기준',
    en: 'Set by the end of the day’s activity hours',
    ja: '1日の活動終了時刻による',
    zh: '依据当天活动结束时间',
  },
  'trip.deadlineDEPARTURE': {
    ko: '출국 준비 시각 기준',
    en: 'Set by your departure preparation time',
    ja: '出国準備の時刻による',
    zh: '依据出境准备时间',
  },
  'trip.deadlinePATIENT_SCHEDULE': {
    ko: '환자의 다음 일정 기준',
    en: 'Set by the patient’s next plan',
    ja: '患者の次の予定による',
    zh: '依据患者的下一项安排',
  },

  // 보호자 탭 안내 (docs/business-rules.md '하루 일정 생성'의 보호자 단독 외출: 동행 필수라 만들 수 없으면 잠금과 사유를 보인다)
  'trip.guardianESCORT_REQUIRED': {
    ko: '동행이 필요한 날이라 보호자는 환자와 함께 있어요. 보호자 단독 외출을 만들지 않았어요.',
    en: 'A companion must stay with the patient this day, so no solo outing was planned for the companion.',
    ja: 'この日は同行が必要なため、同行者は患者と一緒にいます。同行者だけの外出は作っていません。',
    zh: '这一天需要陪同，陪同者应与患者在一起，因此没有安排陪同者单独外出。',
  },
  'trip.guardianGUARDIAN_MUST_STAY': {
    ko: '환자가 쉬는 동안 보호자가 곁을 지켜야 하는 날이에요. 보호자 단독 외출을 만들지 않았어요.',
    en: 'The companion should stay by the patient while they rest this day, so no solo outing was planned.',
    ja: 'この日は患者が休んでいる間、同行者がそばにいる必要があります。同行者だけの外出は作っていません。',
    zh: '这一天患者休息时陪同者需要守在身边，因此没有安排单独外出。',
  },
  'trip.guardianNO_COMPANION': {
    ko: '동반 보호자 없이 지내는 체류예요. 체류 정보에서 바꿀 수 있어요.',
    en: 'This stay has no companion. You can change it in your trip details.',
    ja: '同行者なしの滞在です。滞在情報で変更できます。',
    zh: '此次停留没有陪同者，可在行程信息中更改。',
  },
  'trip.guardianWITH_PATIENT': {
    ko: '이 날은 보호자가 환자와 함께 다녀요. 환자 탭의 일정을 함께 보세요.',
    en: 'On this day the companion goes along with the patient. See the patient tab.',
    ja: 'この日は同行者が患者と一緒に行動します。患者タブの予定をご覧ください。',
    zh: '这一天陪同者与患者同行，请查看患者标签中的行程。',
  },
  'trip.guardianNEEDS_INPUT': {
    ko: '조건 입력이 끝나면 보호자 일정도 만들어요.',
    en: 'The companion’s plan is built once conditions are added.',
    ja: '条件の入力が終わると、同行者の予定も作ります。',
    zh: '填写完条件后也会生成陪同者行程。',
  },
  'trip.guardianNO_OUTING': {
    ko: '이 날은 보호자 단독 외출이 없어요. 환자가 쉬는 시간이 없거나 넣을 장소가 없어요.',
    en: 'No solo outing for the companion this day: the patient has no rest time, or no place fits.',
    ja: 'この日は同行者だけの外出はありません。患者の休憩時間がないか、入れられる場所がありません。',
    zh: '这一天陪同者没有单独外出：患者没有休息时间，或没有合适的地点。',
  },

  // 하루 일정 경고 (docs/contracts.md '`POST /api/itinerary/plan`'의 warnings)
  'trip.warnMEDICATION_TIMES_MISSING': {
    ko: '복약 시각을 입력하지 않아 복약 마감은 만들지 않았어요. 약은 병원 안내대로 챙겨 주세요.',
    en: 'No medication times were entered, so no medication deadline was set. Take your medicine as your hospital told you.',
    ja: '服薬時刻が入力されていないため、服薬の期限は作っていません。薬は病院の案内どおりに飲んでください。',
    zh: '未填写服药时间，因此没有设置服药截止。请按医院的指示服药。',
  },
  'trip.warnDEFAULTS_APPLIED': {
    ko: "'모르겠음'으로 답한 항목에는 가장 엄격한 기본값을 적용했어요.",
    en: "Items answered 'not sure' use the strictest default.",
    ja: '「わからない」と答えた項目には、最も厳しい既定値を適用しました。',
    zh: '对回答“不确定”的项目适用了最严格的默认值。',
  },
  'trip.warnTRAVEL_TIMES_ESTIMATED': {
    ko: '이동 시간은 모두 추정이에요.',
    en: 'All travel times are estimates.',
    ja: '移動時間はすべて推定です。',
    zh: '所有交通时间均为估算。',
  },

  'trip.footer': {
    ko: '관광정보 출처: ⓒ한국관광공사. 이동·머무름 시간은 추정이에요. SafeHour는 의료진의 판단을 대체하지 않습니다.',
    en: 'Tourism data: ⓒKorea Tourism Organization. Travel and stay times are estimates. SafeHour does not replace your medical team.',
    ja: '観光情報の出典：ⓒ韓国観光公社。移動・滞在時間は推定です。SafeHourは医療スタッフの判断に代わるものではありません。',
    zh: '旅游信息来源：ⓒ韩国观光公社。交通和停留时间均为估算。SafeHour 不能代替医护人员的判断。',
  },
};
