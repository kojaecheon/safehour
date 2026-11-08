// help 이름공간 — 도움말(/help)과 더보기의 설치 안내 (S5)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// 안전 문구(safety)는 앱이 하지 않는 일, 알림이 오지 않을 수 있는 경우, "지금 돌아가세요" 안내다.
// 알림 문구 중 설정 화면이 이미 갖고 있는 것(settings.notifyDenied · settings.notifyDisclosure)은 다시 쓰지 않고 가져다 쓴다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  'help.header': { ko: '도움말', en: 'Help', ja: 'ヘルプ', zh: '帮助' },
  'help.moreDesc': {
    ko: '앱이 하는 일, 홈 화면에 추가하기, 자주 묻는 질문',
    en: 'What the app does, adding it to your home screen, FAQ',
    ja: 'アプリの役割、ホーム画面への追加、よくある質問',
    zh: '应用的作用、添加到主屏幕、常见问题',
  },

  // ── 이 앱이 하는 일과 하지 않는 일 (본문은 safety) ──
  'help.aboutTitle': {
    ko: '이 앱이 하는 일과 하지 않는 일',
    en: 'What this app does and does not do',
    ja: 'このアプリができること、しないこと',
    zh: '本应用做什么、不做什么',
  },

  // ── 홈 화면에 추가하기 ──
  'help.installTitle': { ko: '홈 화면에 추가하기', en: 'Add to your home screen', ja: 'ホーム画面に追加する', zh: '添加到主屏幕' },
  'help.installLead': {
    ko: '홈 화면에 추가하면 앱처럼 전체 화면으로 열려요. iPhone은 홈 화면에 추가해야 알림을 받을 수 있어요.',
    en: 'Once added, the app opens full screen like any other app. On iPhone, notifications work only after you add it to the home screen.',
    ja: 'ホーム画面に追加すると、アプリのように全画面で開きます。iPhoneでは、ホーム画面に追加しないと通知を受け取れません。',
    zh: '添加到主屏幕后，应用会像普通应用一样全屏打开。在 iPhone 上，只有添加到主屏幕后才能收到通知。',
  },
  'help.installIosTitle': { ko: '아이폰 (Safari)', en: 'iPhone (Safari)', ja: 'iPhone（Safariで）', zh: 'iPhone（使用 Safari）' },
  'help.installIos1': {
    ko: 'Safari로 SafeHour를 열어요.',
    en: 'Open SafeHour in Safari.',
    ja: 'SafariでSafeHourを開きます。',
    zh: '用 Safari 打开 SafeHour。',
  },
  'help.installIos2': {
    ko: '화면 아래의 공유 버튼(네모에서 위로 향한 화살표 모양)을 눌러요.',
    en: 'Tap the Share button at the bottom of the screen (a square with an arrow pointing up).',
    ja: '画面下の共有ボタン（四角から上向きの矢印が出ているマーク）をタップします。',
    zh: '点按屏幕下方的“分享”按钮（方框加向上箭头的图标）。',
  },
  'help.installIos3': {
    ko: '"홈 화면에 추가"를 누르고, 오른쪽 위의 "추가"를 눌러요.',
    en: 'Tap “Add to Home Screen”, then tap “Add” at the top right.',
    ja: '「ホーム画面に追加」をタップし、右上の「追加」をタップします。',
    zh: '点按“添加到主屏幕”，再点按右上角的“添加”。',
  },
  'help.installIos4': {
    ko: '앞으로는 홈 화면에 생긴 SafeHour 아이콘으로 열어요. 알림도 이 아이콘으로 연 앱에서 켜요.',
    en: 'From now on, open the SafeHour icon on your home screen. Turn notifications on in the app opened from that icon.',
    ja: '以降は、ホーム画面にできたSafeHourのアイコンから開きます。通知もそのアイコンから開いたアプリでオンにします。',
    zh: '之后请从主屏幕上的 SafeHour 图标打开。通知也要在从该图标打开的应用中开启。',
  },
  'help.installAndroidTitle': {
    ko: '안드로이드 (Chrome)',
    en: 'Android (Chrome)',
    ja: 'Android（Chromeで）',
    zh: 'Android（使用 Chrome）',
  },
  'help.installAndroid1': {
    ko: 'Chrome으로 SafeHour를 열어요.',
    en: 'Open SafeHour in Chrome.',
    ja: 'ChromeでSafeHourを開きます。',
    zh: '用 Chrome 打开 SafeHour。',
  },
  'help.installAndroid2': {
    ko: '오른쪽 위의 메뉴(점 세 개)를 눌러요.',
    en: 'Tap the menu (three dots) at the top right.',
    ja: '右上のメニュー（点が3つ）をタップします。',
    zh: '点按右上角的菜单（三个点）。',
  },
  'help.installAndroid3': {
    ko: '"홈 화면에 추가" 또는 "앱 설치"를 누르고 안내에 따라 추가해요.',
    en: 'Tap “Add to Home screen” or “Install app” and follow the prompts.',
    ja: '「ホーム画面に追加」または「アプリをインストール」をタップし、案内に従って追加します。',
    zh: '点按“添加到主屏幕”或“安装应用”，按提示完成添加。',
  },

  // ── 알림이 오지 않을 때 ──
  'help.notifyTitle': { ko: '알림이 오지 않을 때', en: 'If notifications do not arrive', ja: '通知が届かないとき', zh: '收不到通知时' },
  'help.notify1': {
    ko: '설정 화면에서 "복귀·복약·병원 일정 알림 받기" 스위치가 켜져 있는지 확인해요.',
    en: 'In Settings, check that the “Reminders for return, medication and appointments” switch is on.',
    ja: '設定画面で「帰着・服薬・病院の予定の通知を受け取る」スイッチがオンになっているか確認します。',
    zh: '在设置页面确认“接收返回、服药和医院预约提醒”开关已打开。',
  },
  'help.notify3': {
    ko: 'iPhone은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요. 위의 설치 방법을 따라 주세요.',
    en: 'On iPhone, notifications work only in the app you added to the home screen. Follow the steps above.',
    ja: 'iPhoneでは、ホーム画面に追加したアプリでのみ通知を受け取れます。上の手順に従ってください。',
    zh: '在 iPhone 上，只有添加到主屏幕的应用才能收到通知。请按上面的步骤操作。',
  },
  'help.notify5': {
    ko: '보호자가 받은 사본은 자동으로 갱신되지 않아요. 일정이 바뀌면 새 링크를 만들어 다시 보내 주세요.',
    en: 'The copy your guardian received does not update by itself. If the schedule changes, create a new link and send it again.',
    ja: '付き添い者が受け取ったコピーは自動では更新されません。予定が変わったら、新しいリンクを作成して送り直してください。',
    zh: '陪同者收到的副本不会自动更新。日程有变时，请创建新链接并重新发送。',
  },

  // ── 자주 묻는 질문 ──
  'help.faqTitle': { ko: '자주 묻는 질문', en: 'Frequently asked questions', ja: 'よくある質問', zh: '常见问题' },
  'help.faq1Q': {
    ko: '일정이 비어 있어요',
    en: 'My schedule is empty',
    ja: '予定が空です',
    zh: '日程是空的',
  },
  'help.faq1A': {
    ko: '일정 탭에서 그 날짜의 상태와 사유를 먼저 확인해 주세요. 조건에 따라 외출 일정을 만들지 않는 날이 있어요. 체류 정보를 고쳤다면 그 날짜 화면의 "이 날짜 다시 만들기"로 다시 만들 수 있고, 인터넷에 연결되어 있어야 해요.',
    en: 'Open the Trip tab and read the status and reason for that date first. On some days no outing is planned because of your conditions. If you edited your stay details, use “Rebuild this day” on that date. You need an internet connection for it.',
    ja: 'まず日程タブで、その日の状態と理由を確認してください。条件によって外出の予定を作らない日があります。滞在情報を修正した場合は、その日の画面の「この日を作り直す」で作り直せます。インターネット接続が必要です。',
    zh: '请先在“行程”页签查看该日期的状态和原因。根据条件，有些日子不会安排外出。如果修改了停留信息，可在该日页面使用“重新生成这一天”。需要联网。',
  },
  'help.faq2Q': {
    ko: '오늘 화면에 "입력이 필요해요"라고 나와요',
    en: 'Today says “We need more details”',
    ja: '今日の画面に「入力が必要です」と表示されます',
    zh: '今天页面显示“需要补充信息”',
  },
  'help.faq2A': {
    ko: '오늘 일정을 만들 때 빠진 조건이 있다는 뜻이에요. 조건 탭에서 비어 있는 항목을 채우거나 병원 안내를 확인한 뒤 오늘 화면으로 돌아와 주세요. 무엇을 입력해야 할지 모르겠다면 병원에 먼저 연락해 확인하세요.',
    en: 'It means a condition needed to plan today is missing. Fill in the empty items on the Conditions tab or check the hospital guidance, then return to Today. If you are not sure what to enter, contact your hospital first.',
    ja: '今日の予定を作るのに必要な条件が足りないという意味です。条件タブで空欄を入力するか、病院の案内を確認してから、今日の画面に戻ってください。何を入力すればよいか分からないときは、先に病院へ連絡して確認してください。',
    zh: '这表示安排今天行程所需的条件有缺失。请在“出行条件”页签补全空缺项或查看医院指引，然后回到“今天”页面。如果不确定该填什么，请先联系医院确认。',
  },
  'help.faq3Q': {
    ko: '장소를 바꾸고 싶어요',
    en: 'I want to change a place',
    ja: '場所を変更したいです',
    zh: '我想更换地点',
  },
  'help.faq3A': {
    ko: '일정 탭에서 날짜를 열고 장소의 "바꾸기"를 누르면 지금 넣을 수 있는 다른 장소가 나와요. 넣을 수 있는 장소가 없거나 이미 도착한 장소, 지난 날짜는 바꿀 수 없어요.',
    en: 'Open the date in the Trip tab and tap “Swap” on a place to see other places that can be added now. You cannot swap when there is no other place, for a place you have already reached, or for a past date.',
    ja: '日程タブで日付を開き、場所の「変更」をタップすると、今入れられる別の場所が表示されます。入れられる場所がないとき、すでに到着した場所、過去の日付は変更できません。',
    zh: '在“行程”页签打开日期，点按地点的“更换”，即可看到现在可加入的其他地点。没有可加入的地点、已到达的地点和过去的日期无法更换。',
  },
  'help.faq4Q': {
    ko: '보호자 링크가 열리지 않아요',
    en: 'The guardian link does not open',
    ja: '付き添い者リンクが開けません',
    zh: '陪同者链接打不开',
  },
  'help.faq4A': {
    ko: '세 가지를 확인해 주세요. 첫째, 링크가 중간에 잘리지 않았는지. 일부 메신저는 긴 링크를 자르니 "링크 복사"로 다시 받아 주세요. 둘째, 만료되지 않았는지. 출국일 23:59 이후에는 열리지 않아요. 셋째, PIN을 5번 틀려 잠기지 않았는지. 잠기면 그 기기에서 1시간 뒤에 다시 시도할 수 있어요. 그래도 안 되면 환자에게 새 링크를 받아 주세요.',
    en: 'Check three things. First, the link may have been cut short. Some messengers cut long links, so ask for it again using “Copy link”. Second, it may have expired: links stop opening after 23:59 on the departure date. Third, the PIN may be locked after 5 wrong tries; you can try again on that device after 1 hour. If it still fails, ask the patient for a new link.',
    ja: '次の3点を確認してください。1つ目は、リンクが途中で切れていないか。一部のメッセンジャーは長いリンクを切るので、「リンクをコピー」でもう一度受け取ってください。2つ目は、期限切れでないか。出国日の23:59を過ぎると開けません。3つ目は、PINを5回間違えてロックされていないか。ロックされた場合、その端末では1時間後に再試行できます。それでも開けないときは、患者から新しいリンクを受け取ってください。',
    zh: '请确认三点。第一，链接是否被截断。部分聊天软件会截断长链接，请让对方用“复制链接”重新发送。第二，链接是否已失效。离境日 23:59 之后将无法打开。第三，PIN 是否因输错 5 次而被锁定。锁定后，该设备 1 小时后可再试。仍然打不开时，请向患者索取新链接。',
  },
  'help.faq6Q': {
    ko: '데이터를 지우고 싶어요',
    en: 'I want to delete my data',
    ja: 'データを削除したいです',
    zh: '我想删除数据',
  },
  'help.faq6A': {
    ko: '설정 화면이나 개인정보와 면책 안내 화면 아래의 "이 기기에서 내 정보 지우기"를 누르세요. 이 기기의 체류·조건·일정과 보호자 사본이 지워지고, 한 번 지우면 되돌릴 수 없어요. 데이터는 이 기기에만 있어서 서버에서 대신 지워 줄 것이 없어요.',
    en: 'Tap “Delete my data from this device” in Settings or at the bottom of the Privacy and disclaimer page. Your stay, conditions, schedule and guardian copies on this device are erased, and this cannot be undone. Your data exists only on this device, so there is nothing on a server to delete.',
    ja: '設定画面、またはプライバシーと免責事項の画面の下にある「この端末から自分の情報を削除」をタップしてください。この端末の滞在・条件・予定と付き添い者のコピーが削除され、元に戻せません。データはこの端末にしかないため、サーバー側で削除するものはありません。',
    zh: '请在设置页面或“隐私与免责声明”页面底部点按“从此设备删除我的信息”。此设备上的停留信息、条件、日程和陪同者副本将被删除，且无法恢复。数据只保存在此设备上，服务器上没有需要删除的内容。',
  },
  'help.faq7Q': {
    ko: '일본어·중국어 문구가 영어로 보여요',
    en: 'Japanese or Chinese text shows in English',
    ja: '日本語・中国語の文言が英語で表示されます',
    zh: '日语、中文的文案显示为英文',
  },
  'help.faq7A': {
    ko: '일본어·중국어 번역은 아직 사람의 검수를 받지 않았어요. 검수가 끝나기 전에는 안전과 관련된 문장을 영어와 한국어로 함께 보여 줘요. 그 밖의 화면 문구는 번역된 그대로 나와요.',
    en: 'The Japanese and Chinese translations have not been reviewed by a person yet. Until review is done, sentences related to safety are shown in English together with Korean. Other screen text appears in the translated language.',
    ja: '日本語・中国語の翻訳は、まだ人による確認を受けていません。確認が終わるまで、安全に関わる文は英語と韓国語で併記して表示します。それ以外の画面の文言は翻訳のまま表示されます。',
    zh: '日语和中文翻译尚未经过人工审校。审校完成前，与安全相关的语句会以英文加韩文并列显示。其他界面文字则按翻译语言显示。',
  },

  // ── 문의 (NEXT_PUBLIC_SAFEHOUR_CONTACT 가 있을 때만 보인다) ──
  'help.contactTitle': { ko: '문의', en: 'Contact', ja: 'お問い合わせ', zh: '联系方式' },
  'help.contactLead': {
    ko: '도움말로 풀리지 않는 문제는 아래로 알려 주세요. 증상이나 병원 정보는 적지 말아 주세요.',
    en: 'If this page does not solve your problem, reach us below. Please do not include symptoms or hospital details.',
    ja: 'ヘルプで解決しない場合は、下記までご連絡ください。症状や病院の情報は書かないでください。',
    zh: '如果帮助页面无法解决问题，请通过下方方式联系我们。请不要写明症状或医院信息。',
  },

  // ── 더보기의 설치 안내 상자 ──
  'help.installCallout': {
    ko: '홈 화면에 추가하면 앱처럼 전체 화면으로 열려요. iPhone은 알림을 받으려면 꼭 필요해요.',
    en: 'Add SafeHour to your home screen to open it full screen like an app. On iPhone this is required for notifications.',
    ja: 'ホーム画面に追加すると、アプリのように全画面で開きます。iPhoneで通知を受け取るには必須です。',
    zh: '添加到主屏幕后，可像应用一样全屏打开。在 iPhone 上，这是接收通知的必要步骤。',
  },
  'help.installCalloutLink': {
    ko: '설치 방법 보기',
    en: 'See how to install',
    ja: 'インストール方法を見る',
    zh: '查看安装方法',
  },
};

/** 안전 문구 */
export const safety = {
  'help.aboutLead': {
    ko: 'SafeHour는 병원 주의사항 안에서 하루 일정을 만들어 주는 여행 동반 앱이에요.',
    en: 'SafeHour is a travel companion that builds each day’s schedule within your hospital’s precautions.',
    ja: 'SafeHourは、病院の注意事項の範囲内で1日の予定を作る旅行サポートアプリです。',
    zh: 'SafeHour 是一款旅行陪伴应用，在医院注意事项的范围内安排每天的行程。',
  },
  'help.about1': {
    ko: '하는 일: 입력한 병원 조건을 지키는 범위에서 날짜별 일정을 만들고, 복귀 마감을 알려 줘요.',
    en: 'What it does: builds a schedule for each date within the conditions you entered, and reminds you of your return deadline.',
    ja: 'できること：入力した病院の条件の範囲で日付ごとの予定を作り、戻り期限をお知らせします。',
    zh: '它能做的：在您输入的医院条件范围内安排每天的行程，并提醒返回截止时间。',
  },
  'help.about2': {
    ko: '의료 판단은 하지 않아요. 증상, 시술 종류, 회복 단계를 묻거나 해석하지 않고, 입력한 조건을 완화하지도 않아요.',
    en: 'It makes no medical judgment. It does not ask about or interpret symptoms, procedure types or recovery stages, and it never relaxes the conditions you entered.',
    ja: '医療的な判断はしません。症状、施術の種類、回復段階を尋ねたり解釈したりせず、入力した条件を緩めることもありません。',
    zh: '它不做任何医疗判断。不询问也不解读症状、手术或疗程类型和恢复阶段，也不会放宽您输入的条件。',
  },
  'help.about3': {
    ko: '"조건에 맞는다"는 "안전하다"는 뜻이 아니에요. 외출 전에 병원 안내를 확인하고, 망설여지면 병원에 먼저 연락하세요.',
    en: '“Meets your conditions” does not mean “safe”. Check your hospital’s guidance before going out, and contact the hospital first if you are unsure.',
    ja: '「条件に合っている」ことは「安全」という意味ではありません。外出前に病院の案内を確認し、迷うときは先に病院へ連絡してください。',
    zh: '“符合条件”不等于“安全”。外出前请查看医院的指引，如有疑问，请先联系医院。',
  },
  'help.about4': {
    ko: '현재 위치(GPS)를 모으지 않아요. 기준점은 직접 고른 숙소와 병원 주소뿐이에요.',
    en: 'It does not collect your current location (GPS). The only reference points are the lodging and hospital addresses you chose.',
    ja: '現在地（GPS）は収集しません。基準点は、ご自身で選んだ宿泊先と病院の住所だけです。',
    zh: '不收集您的当前位置（GPS）。参考点只有您自己选择的住处和医院地址。',
  },
  'help.about5': {
    ko: '병원을 추천하거나 순위를 매기지 않아요.',
    en: 'It does not recommend or rank hospitals.',
    ja: '病院の推薦やランキングはしません。',
    zh: '不推荐医院，也不对医院排名。',
  },
  'help.about6': {
    ko: '데이터는 이 기기에만 저장돼요. 기기를 바꾸거나 데이터를 지우면 복구할 수 없어요.',
    en: 'Your data is stored only on this device. If you change devices or delete the data, it cannot be recovered.',
    ja: 'データはこの端末にのみ保存されます。端末を変えたりデータを削除したりすると、復元できません。',
    zh: '数据只保存在此设备上。更换设备或删除数据后无法恢复。',
  },
  'help.faq5Q': {
    ko: '"지금 돌아가세요"가 떴어요',
    en: '“Go back now” appeared',
    ja: '「今すぐ戻ってください」と表示されました',
    zh: '出现了“请立即返回”',
  },
  'help.faq5A': {
    ko: '복귀 마감이 지났거나 곧 지난다는 안내예요. 아직 밖이라면 화면에 나온 돌아갈 곳으로 바로 이동하세요. 이미 돌아왔다면 버튼을 눌러 닫으면 돼요. 몸이 평소와 다르거나 판단이 서지 않으면 병원에 먼저 연락하세요.',
    en: 'It means your return deadline has passed or is about to. If you are still out, head to the place shown on screen right away. If you are already back, tap the button to close it. If anything feels unusual or you are unsure, contact your hospital first.',
    ja: '戻り期限を過ぎた、またはまもなく過ぎるという案内です。まだ外にいる場合は、画面に表示された戻る場所へすぐに移動してください。すでに戻っている場合は、ボタンをタップして閉じてください。普段と違う様子があるときや判断に迷うときは、先に病院へ連絡してください。',
    zh: '这表示返回截止时间已过或即将到来。如果您还在外面，请立即前往屏幕上显示的返回地点。如果已经回来，点按按钮关闭即可。如果感觉与平时不同或无法判断，请先联系医院。',
  },
};
