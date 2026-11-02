// 개인정보·면책 고지 본문 (AX-211 → AX-318 · privacy 이름공간 소속 · AX-303)
//
// 이 문서의 모든 문장은 **코드와 명세에서 확인 가능한 사실**이어야 한다.
// "노력합니다", "최선을 다합니다" 같은 다짐은 쓰지 않는다 — 검증할 수 없기 때문이다.
// 사실이 바뀌면(저장 위치·전송 대상·보관 기간) 이 파일을 코드와 같은 PR 에서 고친다.
//
// AX-318 에서 바꾼 사실 (spec 4.1 · 4.11 · 4.14 · 4.16 · 4.17 · 4.19 · ADR-0007~0010)
//   - 저장: 탭 저장소(sessionStorage) → 이 기기의 영구 저장소(localStorage), 불투명 계정 키로 나눈 이름공간
//     (lib/store). "탭을 닫으면 사라진다"는 더 이상 사실이 아니다.
//   - 삭제: "출국 7일이 지난 뒤 앱을 처음 열 때 삭제됩니다" — '자동으로 삭제' 라고 쓰지 않는다(spec 4.1).
//   - 서버 전송: 관광 데이터 언어를 고르려고 lang 을 보낸다(판정은 언어와 무관). 주소 검색은 행정안전부 API.
//   - 보호자 링크: PIN 으로 암호화, 암호문은 # 뒤에만(서버로 가지 않음), 병원·식이·복약 정보 없음(규칙 37·38).
//   - AI 소개 문장: 기본 꺼짐. 켜져도 공개 장소 이름·유형·시각, 관심사, 이동 강도, 언어만 보낸다(lib/server/ai-intro.js).
//   - 지도 링크: 목적지 이름·좌표만. 출발지·숙소·병원 좌표 없음(lib/maps.js · 규칙 39).
//   - 민감정보 동의와 철회(lib/store withdrawSensitiveConsent). 동의 문구는 법무 검토 전(HUMAN_ACTIONS 5번).
//
// 사람 승인이 필요한 항목(개인정보 보호책임자, 분쟁 관할, 보유기간 정책 확정, 고지 갱신 법무 검토)은
// `docs/platform/HUMAN_ACTIONS.md` 5번과 `docs/SIGNOFF_CHECKLIST.md` 에서 다룬다. 여기서는 **현재 사실**만 적는다.
//
// 고지는 안전 문구다 (spec 4.17). 화면은 safetyPair() 의 두 언어(주 언어 + 한국어, ko 면 한국어 + 영어)를 함께 보여준다
// — ja·zh 는 검수 스위치가 켜지기 전까지 영어 + 한국어다. 모든 문단은 4개 언어를 모두 가진다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

export const LEGAL_SECTIONS = [
  {
    id: 'summary',
    title: { ko: '한 줄 요약', en: 'In one line', ja: 'ひとことで言うと', zh: '一句话概括' },
    lead: {
      ko: 'SafeHour는 이름·연락처·진단명·증상을 받지 않고, 현재 위치(GPS)를 쓰지 않으며, 입력한 체류·조건·일정을 서버에 저장하지 않습니다. 모두 이 기기에만 저장됩니다.',
      en: 'SafeHour does not ask for your name, contact details, diagnosis or symptoms; it never uses your live location (GPS); and it does not store your stay, conditions or plans on our server. They are stored on this device only.',
      ja: 'SafeHourは、名前・連絡先・診断名・症状を受け取らず、現在地（GPS）を使わず、入力された滞在・条件・予定をサーバーに保存しません。すべてこの端末にだけ保存されます。',
      zh: 'SafeHour 不收集姓名、联系方式、诊断名称或症状，不使用当前位置（GPS），也不会把您输入的停留信息、条件和行程保存在服务器上。这些信息只保存在此设备上。',
    },
  },
  {
    id: 'collect',
    title: { ko: '무엇을 받나요', en: 'What we ask for', ja: '何を受け取りますか', zh: '我们收集什么' },
    lead: {
      ko: '체류 기간의 일정을 만드는 데 필요한 항목만 받습니다.',
      en: 'Only what is needed to build plans for your stay.',
      ja: '滞在期間の予定を作るのに必要な項目だけを受け取ります。',
      zh: '只收集为停留期间制定行程所需的项目。',
    },
    items: [
      {
        ko: '체류 정보 — 입국·출국 날짜와 시각, 공항, 동반 보호자 여부, 관심사, 이동 강도',
        en: 'Stay details — arrival and departure dates and times, airports, whether a companion is with you, interests, and pace',
        ja: '滞在情報 — 入国・出国の日付と時刻、空港、同行者の有無、関心のあること、移動のペース',
        zh: '停留信息 — 入境和出境的日期与时间、机场、是否有陪同者、兴趣、出行节奏',
      },
      {
        ko: '숙소와 병원 — 직접 입력한 이름, 도로명주소 검색으로 고른 주소와 좌표, 병원 전화(입력한 경우), 병원 일정의 날짜·시각과 수술·시술인지 진료인지 여부',
        en: 'Accommodation and hospitals — the names you type, the address and coordinates you pick from the road-name address search, the hospital phone number (if you enter it), and the date, time and kind (procedure or visit) of each appointment',
        ja: '宿泊先と病院 — ご自身で入力した名前、道路名住所の検索で選んだ住所と座標、病院の電話番号（入力した場合）、病院の予定の日付・時刻と、手術・施術か診察かの区別',
        zh: '住处和医院 — 您自己输入的名称、通过道路名地址搜索选择的地址和坐标、医院电话（如有填写），以及医院预约的日期、时间和类别（手术/治疗或门诊）',
      },
      {
        ko: '조건 — 병원이 발행한 지침, 또는 동의한 뒤 직접 고른 본인 체크 항목(외출 허용, 복귀 시각, 보행·이동 시간 한도, 자외선·열·물 회피, 보호자 동행, 식사·식이 제한, 복약 시각). 예·아니오·모르겠음과 숫자·시각만 받고 자유 서술 칸은 없습니다.',
        en: 'Conditions — a plan issued by your hospital, or self-check items you choose after giving consent (going out, return time, walking and travel limits, avoiding sun, heat or water, companion required, meal and food limits, medication times). Only yes / no / not sure, numbers and times — there is no free-text field.',
        ja: '条件 — 病院が発行した指示、または同意したうえでご自身で選んだセルフチェック項目（外出の可否、帰着時刻、歩行・移動時間の上限、紫外線・熱・水の回避、同行者の付き添い、食事・食べ物の制限、服薬時刻）。はい・いいえ・わからないと数字・時刻だけを受け取り、自由記述欄はありません。',
        zh: '条件 — 医院签发的指引，或您在同意后自己选择的自查项目（是否允许外出、返回时间、步行和交通时间上限、避免紫外线/高温/入水、是否需要陪同、饮食限制、服药时间）。只接收是/否/不确定以及数字和时间，没有自由填写栏。',
      },
    ],
  },
  {
    id: 'never',
    title: { ko: '무엇을 받지 않나요', en: 'What we never ask for', ja: '受け取らないもの', zh: '我们不收集什么' },
    items: [
      {
        ko: '이름, 연락처, 이메일, 생년월일',
        en: 'Your name, phone number, email or date of birth',
        ja: '名前、連絡先、メールアドレス、生年月日',
        zh: '您的姓名、电话号码、电子邮箱、出生日期',
      },
      {
        ko: '진단명, 시술·수술의 종류, 증상 서술',
        en: 'Diagnosis, the type of procedure, or a description of symptoms',
        ja: '診断名、施術・手術の種類、症状の説明',
        zh: '诊断名称、手术或治疗的类型、症状描述',
      },
      {
        ko: '병원 안내문을 사진이나 글로 올려 받지 않습니다. 병원 연동(데모) 지침에 담긴 안내문은 이 기기에만 보관하고 번역·요약하지 않습니다.',
        en: 'We do not take uploads of hospital documents, as photos or as text. Instructions inside a linked (demo) hospital plan are kept on this device only and are not translated or summarised.',
        ja: '病院の案内文を写真や文章としてアップロードで受け取ることはありません。病院連携（デモ）の指示に含まれる案内文はこの端末にだけ保管し、翻訳・要約しません。',
        zh: '我们不接收以照片或文字形式上传的医院指引。医院关联（演示）指引中的说明只保存在此设备上，不做翻译或摘要。',
      },
      {
        ko: '현재 위치(GPS). 브라우저 수준에서도 차단되어 있어 코드 실수로도 요구할 수 없습니다.',
        en: 'Your live location (GPS). It is blocked at the browser level, so it cannot be requested even by mistake.',
        ja: '現在地（GPS）。ブラウザのレベルでも遮断されているため、コードの誤りによっても要求できません。',
        zh: '当前位置（GPS）。已在浏览器层面屏蔽，即使代码出错也无法请求。',
      },
    ],
  },
  {
    id: 'account',
    title: {
      ko: '로그인은 무엇을 가져가나요',
      en: 'What signing in gives us',
      ja: 'ログインで何を受け取りますか',
      zh: '登录时我们获得什么',
    },
    lead: {
      ko: 'Google 또는 카카오로 로그인하면 그 서비스가 발급한 계정 식별자 하나만 받습니다. 서버는 이것을 되돌릴 수 없는 계정 키로 바꿔, 이 기기 안에서 계정별 저장 공간을 나누는 데만 씁니다.',
      en: 'When you sign in with Google or Kakao we receive one account identifier issued by that service. Our server turns it into an account key that cannot be reversed, used only to keep each account’s data separate on this device.',
      ja: 'Googleまたはカカオでログインすると、そのサービスが発行したアカウント識別子を1つだけ受け取ります。サーバーはこれを元に戻せないアカウントキーに変え、この端末の中でアカウントごとの保存場所を分けるためだけに使います。',
      zh: '使用 Google 或 Kakao 登录时，我们只获取该服务签发的一个账户标识符。服务器会把它转换为无法还原的账户密钥，仅用于在此设备上按账户区分存储空间。',
    },
    items: [
      {
        ko: '이름·이메일·프로필 사진을 요청하지 않습니다. 로그인 화면에서 이 항목들에 동의할 필요가 없습니다.',
        en: 'We do not request your name, email or profile picture. You will not be asked to consent to them.',
        ja: '名前・メールアドレス・プロフィール写真は求めません。ログイン画面でこれらの項目に同意する必要はありません。',
        zh: '我们不索取姓名、电子邮箱或头像。您无需在登录页面同意这些项目。',
      },
      {
        ko: '로그인 토큰과 원래 계정 식별자는 저장하지 않습니다.',
        en: 'We do not keep the sign-in tokens or the original account identifier.',
        ja: 'ログイントークンと元のアカウント識別子は保存しません。',
        zh: '我们不保存登录令牌，也不保存原始账户标识符。',
      },
      {
        ko: '로그인 상태는 이 브라우저의 서명된 쿠키에만 있고 12시간 동안 유지됩니다. 서버에 회원 데이터베이스가 없습니다.',
        en: 'Your signed-in state lives only in a signed cookie in this browser and lasts 12 hours. There is no member database on our server.',
        ja: 'ログイン状態はこのブラウザの署名付きCookieにだけあり、12時間有効です。サーバーに会員データベースはありません。',
        zh: '登录状态只保存在此浏览器的签名 Cookie 中，有效期为 12 小时。服务器上没有会员数据库。',
      },
      {
        ko: '로그인이 만료되거나 오프라인이면, 이 기기에 마지막으로 로그인한 계정의 사본을 보기 전용으로 보여줍니다.',
        en: 'If your sign-in expires or you are offline, the copy saved for the last account signed in on this device is shown in view-only mode.',
        ja: 'ログインの期限が切れたりオフラインになったりした場合は、この端末に最後にログインしたアカウントの写しを閲覧専用で表示します。',
        zh: '登录过期或处于离线状态时，将以只读方式显示此设备上最后登录账户的副本。',
      },
      {
        ko: '로그인은 본인 확인이 아닙니다. 병원 연동은 병원이 발급한 코드로 연결합니다.',
        en: 'Signing in is not identity verification. A hospital plan is linked with the code your hospital issues.',
        ja: 'ログインは本人確認ではありません。病院連携は、病院が発行したコードでつなぎます。',
        zh: '登录不是身份验证。医院关联使用医院签发的代码进行连接。',
      },
    ],
  },
  {
    id: 'store',
    title: { ko: '어디에 남나요', en: 'Where it is kept', ja: 'どこに残りますか', zh: '信息保存在哪里' },
    lead: {
      ko: '체류·조건·일정·설정은 이 브라우저의 영구 저장소(localStorage)에 계정별로 나뉘어 저장되고, 브라우저를 닫아도 남습니다. 서버는 일정을 계산해 응답만 돌려주고 아무것도 저장하지 않습니다.',
      en: 'Your stay, conditions, plans and settings are saved in this browser’s persistent storage (localStorage), separated by account, and stay there after you close the browser. Our server calculates the plan, returns it, and stores nothing.',
      ja: '滞在・条件・予定・設定は、このブラウザの永続ストレージ（localStorage）にアカウントごとに分けて保存され、ブラウザを閉じても残ります。サーバーは予定を計算して応答を返すだけで、何も保存しません。',
      zh: '停留信息、条件、行程和设置按账户分别保存在此浏览器的持久存储（localStorage）中，关闭浏览器后仍会保留。服务器只计算行程并返回结果，不保存任何内容。',
    },
    items: [
      {
        ko: '일정 계산 요청에는 조건 값이 실리지만, 서버는 계산 뒤 버리고 기록에도 남기지 않습니다.',
        en: 'Plan requests carry your condition values, but the server discards them after calculating and does not write them to its logs.',
        ja: '予定の計算要求には条件の値が含まれますが、サーバーは計算後に破棄し、記録にも残しません。',
        zh: '行程计算请求中包含条件值，但服务器计算后即丢弃，也不会写入日志。',
      },
      {
        ko: '서버 기록에는 공공 API 호출 횟수·성공 여부와 일정 계산의 요약(엔진 버전, 날짜 수, 상태별 개수, 사유 코드, 출처 종류별 개수, 언어)만 남습니다. 좌표·날짜·장소 이름·주소·조건 값·계정 키는 남기지 않습니다.',
        en: 'Server logs keep only public API call counts and results, and a summary of each plan calculation (engine version, number of days, count per status, reason codes, count per source type, language). Coordinates, dates, place names, addresses, condition values and account keys are not logged.',
        ja: 'サーバーの記録に残るのは、公共APIの呼び出し回数・成否と、予定計算の要約（エンジンのバージョン、日数、状態ごとの件数、理由コード、出典の種類ごとの件数、言語）だけです。座標・日付・場所の名前・住所・条件の値・アカウントキーは残しません。',
        zh: '服务器日志只保留公共 API 的调用次数和结果，以及每次行程计算的摘要（引擎版本、天数、各状态数量、原因代码、各来源类型数量、语言）。不记录坐标、日期、地点名称、地址、条件值或账户密钥。',
      },
      {
        ko: '보호자 링크로 가져온 사본도 이 기기에만 저장되고, 만료되면 지워집니다.',
        en: 'Copies opened from a companion link are also stored on this device only, and are deleted when they expire.',
        ja: '同行者リンクから取り込んだ写しもこの端末にだけ保存され、期限が切れると削除されます。',
        zh: '通过陪同者链接导入的副本同样只保存在此设备上，过期后即被删除。',
      },
    ],
  },
  {
    id: 'delete',
    title: { ko: '언제 지워지나요', en: 'When it is deleted', ja: 'いつ削除されますか', zh: '信息何时删除' },
    lead: {
      ko: '체류·조건·일정은 출국 7일이 지난 뒤 앱을 처음 열 때 삭제됩니다.',
      en: 'Your stay, conditions and plans are deleted the first time you open the app after 7 days have passed since your departure.',
      ja: '滞在・条件・予定は、出国から7日が過ぎたあとに初めてアプリを開いたときに削除されます。',
      zh: '停留信息、条件和行程会在出境满 7 天后您首次打开应用时删除。',
    },
    items: [
      {
        ko: '그 뒤에 앱을 열지 않으면 이 기기에 남아 있습니다. 먼저 지우려면 “이 기기에서 내 정보 지우기”를 누르세요.',
        en: 'If you do not open the app after that, the data stays on this device. To delete it sooner, use “Delete my data from this device”.',
        ja: 'その後にアプリを開かなければ、この端末に残ったままです。先に削除するには「この端末から自分の情報を削除」を押してください。',
        zh: '如果之后没有打开应用，数据会一直留在此设备上。如需提前删除，请点击“从此设备删除我的信息”。',
      },
      {
        ko: '“이 기기에서 내 정보 지우기”는 이 기기의 모든 계정 저장 공간, 보호자 사본, 알림 예약, AI 문장 캐시, 언어 외 설정을 지우고 로그아웃합니다. 언어 설정만 남습니다.',
        en: '“Delete my data from this device” deletes every account’s storage on this device, companion copies, scheduled reminders, the AI sentence cache and all settings except language, and signs you out. Only the language setting is kept.',
        ja: '「この端末から自分の情報を削除」は、この端末のすべてのアカウントの保存場所、同行者用の写し、通知の予約、AI文のキャッシュ、言語以外の設定を削除し、ログアウトします。言語の設定だけが残ります。',
        zh: '“从此设备删除我的信息”会删除此设备上所有账户的存储空间、陪同者副本、提醒计划、AI 句子缓存以及除语言以外的设置，并退出登录。只保留语言设置。',
      },
      {
        ko: '인터넷에 연결되지 않은 상태에서 지우면 기기 삭제는 바로 끝나고, 로그아웃은 다시 연결되면 마무리됩니다.',
        en: 'If you delete while offline, the data on the device is deleted at once, and signing out finishes when you are back online.',
        ja: 'インターネットに接続していない状態で削除すると、端末の削除はすぐに終わり、ログアウトは接続が戻ったときに完了します。',
        zh: '如果在未联网时删除，设备上的数据会立即删除，退出登录将在重新联网后完成。',
      },
    ],
  },
  {
    id: 'consent',
    title: { ko: '민감정보 동의', en: 'Consent to sensitive information', ja: '要配慮情報への同意', zh: '敏感信息同意' },
    lead: {
      ko: '본인 체크를 처음 입력하기 전, 또는 병원을 연동하기 전에 민감정보 동의를 받습니다. 동의 문구 버전과 동의 시각을 이 기기에 저장합니다.',
      en: 'We ask for consent to sensitive information before you first enter a self-check or link a hospital. The version of the consent text and the time you agreed are saved on this device.',
      ja: '初めてセルフチェックを入力する前、または病院と連携する前に、要配慮情報への同意をいただきます。同意文のバージョンと同意した時刻をこの端末に保存します。',
      zh: '在您首次填写自查项目或关联医院之前，我们会请求敏感信息同意。同意文本的版本和同意时间保存在此设备上。',
    },
    items: [
      {
        ko: '동의하지 않으면 수술·시술 전 날짜에 조건 없는 일정만 쓸 수 있습니다.',
        en: 'Without consent, you can only use plans without conditions for the days before your procedure.',
        ja: '同意しない場合は、手術・施術より前の日に条件なしの予定だけを使えます。',
        zh: '如不同意，只能使用手术或治疗之前日期的无条件行程。',
      },
      {
        ko: '설정에서 언제든 철회할 수 있습니다. 철회하면 본인 체크 기간과 병원 연동 지침 사본(연결 코드 포함)을 지웁니다.',
        en: 'You can withdraw it at any time in Settings. Withdrawing deletes your self-check periods and the copies of linked hospital plans (including the link codes).',
        ja: '設定からいつでも撤回できます。撤回すると、セルフチェックの期間と病院連携の指示の写し（連携コードを含む）を削除します。',
        zh: '您可以随时在设置中撤回。撤回后将删除自查期间和医院关联指引的副本（包括关联代码）。',
      },
      {
        ko: '동의 문구는 아직 법무 검토 전입니다.',
        en: 'The consent text has not yet been reviewed by a lawyer.',
        ja: '同意文はまだ法務の確認を受けていません。',
        zh: '同意文本尚未经过法务审核。',
      },
    ],
  },
  {
    id: 'third-party',
    title: { ko: '어디로 전달되나요', en: 'Who else receives it', ja: 'どこへ送られますか', zh: '信息会发送到哪里' },
    lead: {
      ko: '서버는 아래 공공 API를 부릅니다. 이름·연락처와 조건 값은 전달하지 않습니다.',
      en: 'Our server calls the public APIs below. Your name, contact details and condition values are not sent to them.',
      ja: 'サーバーは次の公共APIを呼び出します。名前・連絡先と条件の値は送りません。',
      zh: '服务器会调用以下公共 API。姓名、联系方式和条件值不会发送给它们。',
    },
    items: [
      {
        ko: '한국관광공사 — 숙소·병원 등 직접 고른 기준점 좌표 주변의 관광정보. 그 언어의 관광정보를 고르려고 선택한 언어(lang)를 서버로 보냅니다. 판정 결과는 언어와 무관합니다.',
        en: 'Korea Tourism Organization — tourism data around the reference points you chose, such as your accommodation or hospital. Your chosen language (lang) is sent to the server to pick tourism data in that language. The results do not depend on the language.',
        ja: '韓国観光公社 — 宿泊先・病院など、ご自身で選んだ基準地点の座標周辺の観光情報。その言語の観光情報を選ぶため、選んだ言語（lang）をサーバーに送ります。判定の結果は言語に左右されません。',
        zh: '韩国观光公社 — 您选择的基准点（如住处或医院）坐标周边的旅游信息。为选取该语言的旅游信息，会把您选择的语言（lang）发送到服务器。判定结果与语言无关。',
      },
      {
        ko: '기상청 — 기준점 주변 날씨(초단기 실황)',
        en: 'Korea Meteorological Administration — current weather around the reference point',
        ja: '韓国気象庁 — 基準地点周辺の天気（超短期の実況）',
        zh: '韩国气象厅 — 基准点周边的天气（超短期实况）',
      },
      {
        ko: '행정안전부 도로명주소 API — 숙소·병원 주소를 찾을 때 입력한 검색어만 보냅니다. 병원 목록이나 추천은 보여주지 않습니다.',
        en: 'Ministry of the Interior and Safety road-name address API — only the search words you type when looking up an accommodation or hospital address are sent. No list or recommendation of hospitals is shown.',
        ja: '行政安全部の道路名住所API — 宿泊先・病院の住所を探すときに入力した検索語だけを送ります。病院の一覧やおすすめは表示しません。',
        zh: '行政安全部道路名地址 API — 查找住处或医院地址时只发送您输入的搜索词。不显示医院列表或推荐。',
      },
    ],
    note: {
      ko: '지도 앱과 AI 소개 문장으로 가는 정보는 아래 두 항목에 따로 적었습니다.',
      en: 'What goes to map apps and to the AI introduction is described separately in the next two sections.',
      ja: '地図アプリとAI紹介文に送られる情報は、次の2つの項目に分けて記載しています。',
      zh: '发送到地图应用和 AI 介绍语的信息，分别写在下面两个部分。',
    },
  },
  {
    id: 'maps',
    title: { ko: '지도 길찾기 링크', en: 'Map direction links', ja: '地図の経路リンク', zh: '地图导航链接' },
    lead: {
      ko: '장소의 “구글 지도로 열기”·“카카오맵으로 열기”는 목적지 장소의 이름과 좌표만 담은 링크입니다. 누를 때만 열립니다.',
      en: 'The “Open in Google Maps” and “Open in Kakao Map” links for a place carry only that destination’s name and coordinates. They open only when you tap them.',
      ja: '場所の「Googleマップで開く」「カカオマップで開く」は、目的地の名前と座標だけを含むリンクです。押したときだけ開きます。',
      zh: '地点的“在 Google 地图中打开”“在 Kakao 地图中打开”是只包含目的地名称和坐标的链接，只有点击时才会打开。',
    },
    items: [
      {
        ko: '출발지는 넣지 않습니다. 출발지는 지도 앱이 정합니다.',
        en: 'No starting point is included. The map app decides the starting point.',
        ja: '出発地は含めません。出発地は地図アプリが決めます。',
        zh: '链接中不包含出发地。出发地由地图应用决定。',
      },
      {
        ko: '숙소·병원 좌표는 어떤 지도 링크에도 넣지 않습니다. 복귀 카드와 병원 카드는 주소 글자만 보여줍니다.',
        en: 'Accommodation and hospital coordinates are never put in a map link. The return card and hospital cards show the address as text only.',
        ja: '宿泊先・病院の座標は、どの地図リンクにも含めません。帰着カードと病院カードは住所の文字だけを表示します。',
        zh: '住处和医院的坐标不会放入任何地图链接。返回卡和医院卡只显示地址文字。',
      },
      {
        ko: '링크를 연 뒤에는 Google·카카오의 개인정보 처리방침이 적용됩니다.',
        en: 'Once a link is opened, the privacy policy of Google or Kakao applies.',
        ja: 'リンクを開いたあとは、Googleまたはカカオのプライバシーポリシーが適用されます。',
        zh: '打开链接后，适用 Google 或 Kakao 的隐私政策。',
      },
    ],
  },
  {
    id: 'ai',
    title: { ko: 'AI 일정 소개 문장', en: 'AI plan introduction', ja: 'AIによる予定の紹介文', zh: 'AI 行程介绍语' },
    lead: {
      ko: 'AI 소개 문장은 기본으로 꺼져 있습니다. 꺼져 있을 때는 정해진 템플릿 문장을 씁니다.',
      en: 'The AI introduction is off by default. While it is off, a fixed template sentence is used.',
      ja: 'AIによる紹介文は、初期設定ではオフです。オフのあいだは決まったテンプレートの文を使います。',
      zh: 'AI 介绍语默认关闭。关闭时使用固定的模板句子。',
    },
    items: [
      {
        ko: '켜져 있을 때도 Google Gemini에는 언어, 그날 정거장의 공개 장소 이름·유형·시각, 관심사, 이동 강도만 보냅니다.',
        en: 'Even when it is on, Google Gemini receives only the language, the public names, types and times of that day’s stops, your interests, and your pace.',
        ja: 'オンのときでも、Google Geminiに送るのは言語、その日の立ち寄り先の公開された名前・種類・時刻、関心のあること、移動のペースだけです。',
        zh: '即使开启，发送给 Google Gemini 的也只有语言、当天各站点的公开名称、类型和时间、兴趣以及出行节奏。',
      },
      {
        ko: '조건, 병원·시술 정보, 숙소 이름·주소, 날짜, 계정 정보는 보내지 않습니다.',
        en: 'Conditions, hospital or procedure details, accommodation names and addresses, dates and account details are not sent.',
        ja: '条件、病院・施術の情報、宿泊先の名前・住所、日付、アカウント情報は送りません。',
        zh: '不发送条件、医院或治疗信息、住处名称和地址、日期以及账户信息。',
      },
    ],
  },
  {
    id: 'guardian',
    title: { ko: '보호자 링크', en: 'Companion link', ja: '同行者リンク', zh: '陪同者链接' },
    lead: {
      ko: '보호자 링크는 만들 때마다 공유 동의를 받고, 직접 정한 PIN으로 암호화합니다. 암호문은 링크의 # 뒤에만 있어 서버로 전송되지 않습니다.',
      en: 'Each time you make a companion link we ask for your consent to share, and the link is encrypted with a PIN you set. The encrypted part sits only after the # in the link, so it is never sent to our server.',
      ja: '同行者リンクは作るたびに共有への同意をいただき、ご自身で決めたPINで暗号化します。暗号文はリンクの # より後ろにだけあるため、サーバーには送られません。',
      zh: '每次创建陪同者链接时都会请求共享同意，并用您设定的 PIN 加密。密文只位于链接的 # 之后，因此不会发送到服务器。',
    },
    items: [
      {
        ko: '사본에는 날짜별 동행 필요 여부와 보호자 단독 외출 가능 여부, 환자 복귀 마감과 복귀 장소(숙소 이름·주소, 병원이면 “병원”이라는 표시만), 보호자 외출 일정, 긴급 번호만 담습니다. 식이·복약·보행·자외선·열·물 조건과 병원 정보는 담지 않습니다.',
        en: 'The copy holds only whether an escort is needed and whether the companion may go out alone each day, the patient’s return deadlines and return place (accommodation name and address, or just the word “hospital”), the companion’s outings, and emergency numbers. Food, medication, walking, sun, heat and water conditions and hospital details are not included.',
        ja: '写しに含むのは、日ごとの付き添いの要否と同行者の単独外出の可否、患者さんの帰着の締め切りと帰着先（宿泊先の名前・住所、病院の場合は「病院」という表示だけ）、同行者の外出予定、緊急番号だけです。食事・服薬・歩行・紫外線・熱・水の条件と病院の情報は含みません。',
        zh: '副本只包含每天是否需要陪同和陪同者能否单独外出、患者的返回截止时间和返回地点（住处名称和地址；如是医院，只显示“医院”）、陪同者的外出行程以及紧急电话。不包含饮食、服药、步行、紫外线、高温、入水条件和医院信息。',
      },
      {
        ko: 'PIN을 5번 연속 틀리면 1시간 동안 잠깁니다. 링크는 보낸 때의 사본이며 자동으로 갱신되지 않고, 만료되면 보이지 않고 지워집니다.',
        en: 'Five wrong PINs in a row lock it for one hour. The link is a copy from the moment you sent it; it is not updated automatically, and once it expires it is no longer shown and is deleted.',
        ja: 'PINを5回続けて間違えると1時間ロックされます。リンクは送った時点の写しで、自動では更新されず、期限が切れると表示されなくなり削除されます。',
        zh: '连续 5 次输错 PIN 将锁定 1 小时。链接是发送时的副本，不会自动更新，过期后不再显示并被删除。',
      },
    ],
  },
  {
    id: 'medical',
    title: {
      ko: '의료 판단이 아닙니다',
      en: 'This is not medical advice',
      ja: '医療的な判断ではありません',
      zh: '这不是医疗建议',
    },
    lead: {
      ko: 'SafeHour는 증상이나 회복 단계를 해석하지 않습니다. 병원이 발행한 지침이나 직접 고른 본인 체크 항목을 그대로 적용해 일정을 계산할 뿐이며, 의료진의 판단을 대체하지 않습니다.',
      en: 'SafeHour does not interpret symptoms or recovery stages. It applies your hospital’s plan or the self-check items you chose exactly as given to calculate plans. It does not replace your medical team.',
      ja: 'SafeHourは症状や回復段階を解釈しません。病院が発行した指示やご自身で選んだセルフチェック項目をそのまま当てはめて予定を計算するだけで、医療スタッフの判断に代わるものではありません。',
      zh: 'SafeHour 不解读症状或恢复阶段。它只是按原样套用医院签发的指引或您自己选择的自查项目来计算行程，不能代替医护人员的判断。',
    },
    items: [
      {
        ko: '몸 상태에 이상이 느껴지면 앱을 보지 말고 병원에 먼저 연락하세요. 응급 상황은 119 입니다.',
        en: 'If you feel unwell, contact your hospital before checking the app. In an emergency call 119.',
        ja: '体調に異変を感じたら、アプリを見る前にまず病院へ連絡してください。緊急の場合は119です。',
        zh: '如感到身体不适，请不要先看应用，而是先联系医院。紧急情况请拨打 119。',
      },
      {
        ko: '“모르겠음”을 고른 항목에는 가장 엄격한 기본값을 적용하고 “기본값 적용”으로 표시합니다. 이 기본값은 의료진 검토 전의 임시값입니다.',
        en: 'Items answered “not sure” get the strictest default and are marked “Default applied”. These defaults are provisional until reviewed by medical staff.',
        ja: '「わからない」を選んだ項目には最も厳しい初期値を当てはめ、「初期値を適用」と表示します。この初期値は医療スタッフの確認前の暫定値です。',
        zh: '选择“不确定”的项目会套用最严格的默认值，并标注“已套用默认值”。这些默认值是医护人员审核前的临时值。',
      },
      {
        ko: '이동시간은 경로 안내 서비스가 아니라 보수적인 직선거리 추정값입니다. “추정” 표시가 붙은 값은 실제와 다를 수 있습니다.',
        en: 'Travel times are conservative straight-line estimates, not routing results. Values marked “Estimate” may differ from reality.',
        ja: '移動時間は経路案内サービスの結果ではなく、余裕を持たせた直線距離による推定値です。「推定」と表示された値は実際と異なる場合があります。',
        zh: '交通时间不是路线导航结果，而是基于直线距离的保守估算。标有“估算”的数值可能与实际不同。',
      },
      {
        ko: '장소의 운영시간은 공공 데이터 원문 그대로 보여줍니다. 현재 영업 여부는 판단하지 않으니 방문 전에 직접 확인하세요.',
        en: 'Opening hours are shown exactly as published in public data. We do not decide whether a place is open now — please check before you go.',
        ja: '場所の営業時間は公共データの原文のまま表示します。現在営業しているかどうかは判断しないため、訪問前にご自身でご確認ください。',
        zh: '地点的营业时间按公共数据原文显示。我们不判断当前是否营业，请在前往前自行确认。',
      },
      {
        ko: '병원이나 의료기관을 추천·알선하지 않습니다. 순위·평점·제휴 기능이 없습니다.',
        en: 'We do not recommend or broker hospitals or clinics. There are no rankings, ratings or partnerships.',
        ja: '病院や医療機関をおすすめしたり、あっせんしたりしません。順位・評価・提携の機能はありません。',
        zh: '我们不推荐或介绍医院及医疗机构。没有排名、评分或合作功能。',
      },
    ],
  },
  {
    id: 'sources',
    title: { ko: '데이터 출처', en: 'Data sources', ja: 'データの出典', zh: '数据来源' },
    items: [
      {
        ko: '관광정보 출처: ⓒ한국관광공사',
        en: 'Tourism data: ⓒKorea Tourism Organization',
        ja: '観光情報の出典：ⓒ韓国観光公社',
        zh: '旅游信息来源：ⓒ韩国观光公社',
      },
      {
        ko: '기상정보 출처: ⓒ기상청',
        en: 'Weather data: ⓒKorea Meteorological Administration',
        ja: '気象情報の出典：ⓒ韓国気象庁',
        zh: '天气信息来源：ⓒ韩国气象厅',
      },
      {
        ko: '사진은 내려받지 않고 원본 주소를 그대로 참조하며, 저작권 구분을 함께 표시합니다.',
        en: 'Photos are referenced at their original address rather than downloaded, and their copyright type is shown alongside.',
        ja: '写真はダウンロードせず元のアドレスをそのまま参照し、著作権区分もあわせて表示します。',
        zh: '照片不下载，直接引用原始地址，并同时显示版权类别。',
      },
    ],
  },
];
