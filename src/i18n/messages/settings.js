// settings 이름공간 — 설정(/settings)·더보기(/more): 언어·알림·동의 철회·이 기기에서 내 정보 지우기 (AX-303 · AX-318)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// '내 정보 지우기'(ClearSessionButton)의 기존 키 접두사 `clear.` 을 그대로 쓴다.
// 새 키는 `settings.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  // ── 내 정보 지우기 (AX-210 → AX-318: 기기 저장소 전체 삭제 + 로그아웃) ──
  'clear.cta': {
    ko: '이 기기에서 내 정보 지우기',
    en: 'Delete my data from this device',
    ja: 'この端末から自分の情報を削除',
    zh: '从此设备删除我的信息',
  },
  'clear.note': {
    ko: '체류·조건·일정은 이 기기에만 저장됩니다. 서버에는 저장되지 않습니다.',
    en: 'Your stay, conditions and plans are stored on this device only. Nothing is stored on our server.',
    ja: '滞在・条件・予定はこの端末にのみ保存されます。サーバーには保存されません。',
    zh: '停留信息、条件和行程只保存在此设备上，不会保存在服务器上。',
  },
  'clear.question': {
    ko: '이 기기에 저장된 체류·조건·일정·보호자 사본을 모두 지우고 로그아웃할까요? 언어 설정만 남습니다. 되돌릴 수 없습니다.',
    en: 'Delete your stay, conditions, plans and companion copies from this device and sign out? Only your language setting is kept. This cannot be undone.',
    ja: 'この端末に保存された滞在・条件・予定・同行者用の写しをすべて削除してログアウトしますか？言語の設定だけが残ります。元に戻すことはできません。',
    zh: '要删除此设备上保存的停留信息、条件、行程和陪同者副本并退出登录吗？只保留语言设置。删除后无法恢复。',
  },
  'clear.confirm': { ko: '지우기', en: 'Delete', ja: '削除する', zh: '删除' },
  'clear.cancel': { ko: '취소', en: 'Cancel', ja: 'キャンセル', zh: '取消' },
  'clear.working': { ko: '지우는 중…', en: 'Deleting…', ja: '削除しています…', zh: '正在删除…' },
  'clear.done': {
    ko: '이 기기에서 내 정보를 지웠어요. (지운 항목 {count}개)',
    en: 'Your data has been deleted from this device. ({count} items deleted)',
    ja: 'この端末から自分の情報を削除しました。（削除した項目 {count} 件）',
    zh: '已从此设备删除您的信息。（已删除 {count} 项）',
  },
  'clear.partial': {
    ko: '일부 항목을 지우지 못했어요. 다시 시도해 주세요.',
    en: 'Some items could not be deleted. Please try again.',
    ja: '一部の項目を削除できませんでした。もう一度お試しください。',
    zh: '部分项目未能删除。请重试。',
  },
  'clear.loggedOut': {
    ko: '로그아웃했어요.',
    en: 'You have been signed out.',
    ja: 'ログアウトしました。',
    zh: '已退出登录。',
  },
  'clear.logoutPending': {
    ko: '로그아웃은 인터넷에 연결되면 마무리됩니다. 그때까지 이 기기는 로그인하지 않은 상태로 보입니다.',
    en: 'Signing out will finish once you are back online. Until then this device is treated as signed out.',
    ja: 'ログアウトはインターネットに接続したときに完了します。それまでこの端末はログインしていない状態として扱われます。',
    zh: '退出登录将在联网后完成。在此之前，此设备按未登录状态处理。',
  },
  'clear.goHome': { ko: '처음 화면으로', en: 'Go to the start screen', ja: '最初の画面へ', zh: '返回首页' },

  // ── 설정 (/settings) ──
  'settings.header': { ko: '설정', en: 'Settings', ja: '設定', zh: '设置' },
  'settings.langTitle': { ko: '언어', en: 'Language', ja: '言語', zh: '语言' },
  'settings.langHint': {
    ko: '화면 언어를 바꿔요. 이 기기에만 저장되고, 내 정보를 지워도 남아요.',
    en: 'Changes the display language. It is saved on this device only and kept when you delete your data.',
    ja: '画面の言語を変更します。この端末にだけ保存され、自分の情報を削除しても残ります。',
    zh: '更改显示语言。只保存在此设备上，删除个人信息后也会保留。',
  },
  'settings.notifyTitle': { ko: '알림', en: 'Notifications', ja: '通知', zh: '通知提醒' },
  'settings.notifyToggle': {
    ko: '복귀·복약·병원 일정 알림 받기',
    en: 'Reminders for return, medication and appointments',
    ja: '帰着・服薬・病院の予定の通知を受け取る',
    zh: '接收返回、服药和医院预约提醒',
  },
  'settings.notifyHint': {
    ko: '켤 때만 브라우저가 알림 권한을 물어요.',
    en: 'Your browser asks for permission only when you turn this on.',
    ja: 'オンにしたときだけ、ブラウザが通知の許可を求めます。',
    zh: '只有在开启时，浏览器才会请求通知权限。',
  },
  'settings.notifyOn': { ko: '알림을 켰어요.', en: 'Reminders are on.', ja: '通知をオンにしました。', zh: '已开启提醒。' },
  'settings.notifyOff': { ko: '알림을 껐어요.', en: 'Reminders are off.', ja: '通知をオフにしました。', zh: '已关闭提醒。' },
  'settings.notifyUnsupported': {
    ko: '이 브라우저는 알림을 지원하지 않아 켤 수 없어요.',
    en: 'This browser does not support notifications, so reminders cannot be turned on.',
    ja: 'このブラウザは通知に対応していないため、オンにできません。',
    zh: '此浏览器不支持通知，因此无法开启提醒。',
  },
  'settings.notifyDenied': {
    ko: '알림 권한이 허용되지 않아 켜지 못했어요. 브라우저 설정에서 허용한 뒤 다시 켜 주세요.',
    en: 'Notification permission was not given, so reminders are still off. Allow it in your browser settings, then turn this on again.',
    ja: '通知が許可されなかったため、オンにできませんでした。ブラウザの設定で許可してから、もう一度オンにしてください。',
    zh: '未获得通知权限，因此提醒仍未开启。请在浏览器设置中允许后再重新开启。',
  },
  'settings.readOnlyNote': {
    ko: '보기 전용에서는 바꿀 수 없어요. 로그인하면 바꿀 수 있어요.',
    en: 'This cannot be changed in view-only mode. Sign in to change it.',
    ja: '閲覧専用では変更できません。ログインすると変更できます。',
    zh: '只读模式下无法更改。登录后即可更改。',
  },
  'settings.saveFailed': {
    ko: '저장하지 못했어요. 다시 시도해 주세요.',
    en: 'Could not save. Please try again.',
    ja: '保存できませんでした。もう一度お試しください。',
    zh: '未能保存。请重试。',
  },
  'settings.consentTitle': {
    ko: '민감정보 동의',
    en: 'Consent to sensitive information',
    ja: '要配慮情報への同意',
    zh: '敏感信息同意',
  },
  'settings.consentAgreed': {
    ko: '{date}에 동의했어요.',
    en: 'You agreed on {date}.',
    ja: '{date} に同意しました。',
    zh: '您已于 {date} 同意。',
  },
  'settings.consentNone': {
    ko: '동의하지 않은 상태예요. 본인 체크 입력과 병원 연동을 쓰려면 조건 화면에서 동의하세요.',
    en: 'You have not agreed. To enter your own check or link a hospital, agree on the Conditions screen.',
    ja: '同意していない状態です。セルフチェックの入力や病院連携を使うには、条件の画面で同意してください。',
    zh: '您尚未同意。如需填写自查项目或关联医院，请在条件页面同意。',
  },
  'settings.consentWithdraw': { ko: '동의 철회', en: 'Withdraw consent', ja: '同意を撤回', zh: '撤回同意' },
  'settings.consentSheetTitle': {
    ko: '민감정보 동의를 철회할까요?',
    en: 'Withdraw your consent?',
    ja: '要配慮情報への同意を撤回しますか？',
    zh: '要撤回敏感信息同意吗？',
  },
  'settings.consentConfirm': { ko: '철회하기', en: 'Withdraw', ja: '撤回する', zh: '确认撤回' },
  'settings.cancel': { ko: '취소', en: 'Cancel', ja: 'やめる', zh: '取消操作' },
  'settings.consentDone': {
    ko: '동의를 철회했어요. 본인 체크 기간 {periods}개와 병원 연동 지침 {plans}개를 지웠어요.',
    en: 'Consent withdrawn. {periods} self-check periods and {plans} linked hospital plans were deleted.',
    ja: '同意を撤回しました。セルフチェックの期間 {periods} 件と病院連携の指示 {plans} 件を削除しました。',
    zh: '已撤回同意。已删除 {periods} 个自查期间和 {plans} 份医院关联指引。',
  },
  'settings.consentFailed': {
    ko: '철회하지 못했어요. 다시 시도해 주세요.',
    en: 'Could not withdraw consent. Please try again.',
    ja: '撤回できませんでした。もう一度お試しください。',
    zh: '未能撤回同意。请重试。',
  },
  'settings.conditionsLink': {
    ko: '조건 화면으로 가기',
    en: 'Go to Conditions',
    ja: '条件の画面へ移動',
    zh: '转到条件页面',
  },
  'settings.dataTitle': { ko: '내 정보', en: 'Your data', ja: '自分の情報', zh: '我的信息' },

  // ── 더보기 (/more) ──
  'settings.moreHeader': { ko: '더보기', en: 'More', ja: 'その他', zh: '更多' },
  'settings.moreMenuAria': { ko: '더보기 메뉴', en: 'More menu', ja: 'その他のメニュー', zh: '更多菜单' },
  'settings.moreGroupTools': { ko: '도구', en: 'Tools', ja: 'ツール', zh: '工具' },
  'settings.moreGroupInfo': { ko: '정보', en: 'Information', ja: '情報', zh: '信息' },
  'settings.moreCardsDesc': {
    ko: '식당·택시에서 보여 줄 한국어 문장',
    en: 'Korean sentences to show at restaurants and in taxis',
    ja: '飲食店やタクシーで見せる韓国語の文',
    zh: '在餐厅和出租车上出示的韩语句子',
  },
  'settings.moreGuardian': { ko: '보호자 링크', en: 'Companion link', ja: '同行者リンク', zh: '陪同者链接' },
  'settings.moreGuardianDesc': {
    ko: '일정 사본을 PIN으로 잠가 보호자에게 보내요',
    en: 'Send a PIN-locked copy of your plan to your companion',
    ja: '予定の写しをPINでロックして同行者に送ります',
    zh: '将行程副本用 PIN 锁定后发送给陪同者',
  },
  'settings.moreConditionsDesc': {
    ko: '본인 체크 기간과 병원 연동',
    en: 'Self-check periods and hospital link',
    ja: 'セルフチェックの期間と病院連携',
    zh: '自查期间与医院关联',
  },
  'settings.moreStay': {
    ko: '체류 정보 수정',
    en: 'Edit stay details',
    ja: '滞在情報の修正',
    zh: '修改停留信息',
  },
  'settings.moreStayDesc': {
    ko: '입국·출국, 숙소, 병원과 병원 일정',
    en: 'Arrival and departure, accommodation, hospitals and appointments',
    ja: '入国・出国、宿泊先、病院と病院の予定',
    zh: '入境与出境、住处、医院及医院预约',
  },
  'settings.moreSettingsDesc': {
    ko: '언어·알림·동의 철회·내 정보 지우기',
    en: 'Language, notifications, consent and deleting your data',
    ja: '言語・通知・同意の撤回・自分の情報の削除',
    zh: '语言、通知、撤回同意、删除个人信息',
  },
  'settings.morePrivacyDesc': {
    ko: '무엇을 받고 어디에 남기는지',
    en: 'What we ask for and where it is kept',
    ja: '何を受け取り、どこに残すか',
    zh: '我们收集什么、保存在哪里',
  },
};

/** 안전 문구 — 고지 */
export const safety = {
  'settings.notifyDisclosure': {
    ko: '앱이 완전히 닫혀 있으면 알림을 받지 못할 수 있습니다.',
    en: 'You may not receive notifications if the app is fully closed.',
    ja: 'アプリが完全に閉じていると、通知を受け取れないことがあります。',
    zh: '如果应用已完全关闭，您可能收不到通知。',
  },
  'settings.consentEffectIntro': {
    ko: '철회하면 다음이 일어납니다.',
    en: 'If you withdraw, the following happens.',
    ja: '撤回すると、次のようになります。',
    zh: '撤回后将发生以下情况。',
  },
  'settings.consentEffect1': {
    ko: '본인 체크 기간과 병원 연동 지침 사본(연결 코드 포함)을 이 기기에서 지웁니다.',
    en: 'Your self-check periods and the copies of linked hospital plans (including the link codes) are deleted from this device.',
    ja: 'セルフチェックの期間と、病院連携の指示の写し（連携コードを含む）をこの端末から削除します。',
    zh: '从此设备删除自查期间和医院关联指引的副本（包括关联代码）。',
  },
  'settings.consentEffect2': {
    ko: '수술·시술 날짜부터는 “동의 필요”로 바뀌어 일정이 만들어지지 않습니다. 그 전 날짜에는 조건 없는 일정만 만들어집니다.',
    en: 'From your procedure date onward, days change to “consent needed” and no plan is made. Days before that get plans without any conditions.',
    ja: '手術・施術の日以降は「同意が必要」に変わり、予定は作られません。それより前の日は、条件なしの予定だけが作られます。',
    zh: '从手术或治疗当天起，日期将变为“需要同意”，不会生成行程。在此之前的日期只生成不含条件的行程。',
  },
  'settings.consentEffect3': {
    ko: '일정을 다시 계산합니다. 지운 조건은 되돌릴 수 없어, 다시 동의한 뒤 새로 입력해야 합니다.',
    en: 'Your plan is recalculated. Deleted conditions cannot be restored — after agreeing again you need to enter them again.',
    ja: '予定を計算し直します。削除した条件は元に戻せないため、もう一度同意したあとで入力し直す必要があります。',
    zh: '将重新计算行程。已删除的条件无法恢复，重新同意后需要再次填写。',
  },
};
