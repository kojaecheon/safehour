// 개인정보·면책 고지 본문 (AX-211 · privacy 이름공간 소속 · AX-303)
//
// 이 문서의 모든 문장은 **코드에서 확인 가능한 사실**이어야 한다.
// "노력합니다", "최선을 다합니다" 같은 다짐은 쓰지 않는다 — 검증할 수 없기 때문이다.
// 사실이 바뀌면(저장 위치·전송 대상·보관 기간) 이 파일을 코드와 같은 PR 에서 고친다.
//
// 사람 승인이 필요한 항목(개인정보 보호책임자, 분쟁 관할, 보유기간 정책 확정)은
// `docs/SIGNOFF_CHECKLIST.md` 2·4절과 AX-104 에서 다룬다. 여기서는 **현재 사실**만 적는다.
//
// 고지는 안전 문구다 (spec 4.17). 화면은 src/i18n 의 safetyPair() 가 고른 주 언어로 보여준다
// — ja·zh 는 검수 스위치가 켜지기 전까지 영어로 대체된다. 모든 문단은 4개 언어를 모두 가진다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

export const LEGAL_SECTIONS = [
  {
    id: 'summary',
    title: { ko: '한 줄 요약', en: 'In one line', ja: 'ひとことで言うと', zh: '一句话概括' },
    lead: {
      ko: 'SafeHour는 이름·연락처·진단명·증상을 받지 않고, 현재 위치(GPS)를 쓰지 않으며, 입력한 조건을 서버에 저장하지 않습니다.',
      en: 'SafeHour does not ask for your name, contact details, diagnosis, or symptoms; it never uses your live location (GPS); and it does not store your entries on our server.',
      ja: 'SafeHourは、名前・連絡先・診断名・症状を受け取らず、現在地（GPS）を使わず、入力された条件をサーバーに保存しません。',
      zh: 'SafeHour 不收集姓名、联系方式、诊断名称或症状，不使用当前位置（GPS），也不会把您输入的条件保存在服务器上。',
    },
  },
  {
    id: 'collect',
    title: { ko: '무엇을 받나요', en: 'What we ask for', ja: '何を受け取りますか', zh: '我们收集什么' },
    lead: {
      ko: '추천을 계산하는 데 필요한 최소 항목만 받습니다.',
      en: 'Only the minimum needed to calculate a recommendation.',
      ja: 'おすすめを計算するのに必要な最小限の項目だけを受け取ります。',
      zh: '只收集计算推荐所需的最少项目。',
    },
    items: [
      {
        ko: '병원이 정한 주의조건 — 금식·외출 허용·동행 필수·자외선 회피·실내 한정 여부와 보행·이동 시간 한도 (예/아니오와 숫자)',
        en: 'The precautions your hospital set — fasting, whether going out is allowed, required escort, sun avoidance, indoor-only, and walking/travel limits (yes/no and numbers)',
        ja: '病院が定めた注意条件 — 絶食・外出の可否・同行必須・紫外線を避けるか・屋内のみか、および歩行・移動時間の上限（はい/いいえと数字）',
        zh: '医院规定的注意条件 — 是否禁食、是否允许外出、是否必须陪同、是否避免紫外线、是否仅限室内，以及步行和交通时间上限（是/否及数字）',
      },
      {
        ko: '병원 복귀 시각과 그 조건을 받은 시각',
        en: 'Your return time, and when you received those instructions',
        ja: '病院への帰着時刻と、その条件を受け取った時刻',
        zh: '返回医院的时间，以及收到这些条件的时间',
      },
      {
        ko: '직접 선택한 병원·숙소 기준점 좌표와 이름',
        en: 'The hospital or accommodation point you choose yourself — its coordinates and the name you type',
        ja: 'ご自身で選んだ病院・宿泊先の基準地点の座標と名前',
        zh: '您自己选择的医院或住处基准点的坐标和名称',
      },
      {
        ko: '동행 상황 — 보호자 유무, 환자 휴식 필요 여부, 분리 활동 허용 여부',
        en: 'Who is with you — whether a companion is present, whether the patient needs rest, and whether separate activity is allowed',
        ja: '同行の状況 — 同行者の有無、患者さんの休息が必要かどうか、別行動が認められているかどうか',
        zh: '陪同情况 — 是否有陪同者、患者是否需要休息、是否允许单独活动',
      },
    ],
  },
  {
    id: 'never',
    title: { ko: '무엇을 받지 않나요', en: 'What we never ask for', ja: '受け取らないもの', zh: '我们不收集什么' },
    items: [
      {
        ko: '이름, 연락처, 이메일, 생년월일',
        en: 'Name, phone number, email, date of birth',
        ja: '名前、連絡先、メールアドレス、生年月日',
        zh: '姓名、电话号码、电子邮箱、出生日期',
      },
      {
        ko: '진단명, 시술·수술 종류, 증상 서술',
        en: 'Diagnosis, type of procedure, description of symptoms',
        ja: '診断名、施術・手術の種類、症状の説明',
        zh: '诊断名称、手术或治疗类型、症状描述',
      },
      {
        ko: '병원 안내문 원문 (사진·텍스트 어느 형태로도 수집하지 않습니다)',
        en: 'The hospital document itself — neither as a photo nor as text',
        ja: '病院の案内文の原文（写真・テキストのどちらの形でも収集しません）',
        zh: '医院指引原文（无论照片还是文字形式都不收集）',
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
      ko: 'Google 또는 카카오로 로그인하면 그 서비스가 발급한 계정 식별자 하나만 받습니다. 다음에 열었을 때 같은 회복 계획을 불러오기 위한 것입니다.',
      en: 'When you sign in with Google or Kakao we receive one account identifier issued by that service — just enough to load the same recovery plan next time.',
      ja: 'Googleまたはカカオでログインすると、そのサービスが発行したアカウント識別子を1つだけ受け取ります。次に開いたときに同じ回復プランを読み込むためのものです。',
      zh: '使用 Google 或 Kakao 登录时，我们只获取该服务签发的一个账户标识符，用于下次打开时加载同一恢复计划。',
    },
    items: [
      {
        ko: '이름·이메일·프로필 사진을 요청하지 않습니다. 로그인 화면에서 이 항목들에 동의할 필요가 없습니다.',
        en: 'We do not request your name, email, or profile picture. You will not be asked to consent to them.',
        ja: '名前・メールアドレス・プロフィール写真は求めません。ログイン画面でこれらの項目に同意する必要はありません。',
        zh: '我们不索取姓名、电子邮箱或头像。您无需在登录页面同意这些项目。',
      },
      {
        ko: '로그인 토큰은 저장하지 않습니다. 식별자를 확인한 즉시 버립니다.',
        en: 'We do not keep the sign-in tokens. They are discarded as soon as the identifier is read.',
        ja: 'ログイントークンは保存しません。識別子を確認したらすぐに破棄します。',
        zh: '我们不保存登录令牌。读取标识符后立即丢弃。',
      },
      {
        ko: '로그인 상태는 이 브라우저의 서명된 쿠키에만 있습니다. 서버에 회원 데이터베이스가 없습니다.',
        en: 'Your signed-in state lives only in a signed cookie in this browser. There is no member database on our server.',
        ja: 'ログイン状態は、このブラウザの署名付きCookieにのみあります。サーバーに会員データベースはありません。',
        zh: '登录状态只保存在此浏览器的签名 Cookie 中。服务器上没有会员数据库。',
      },
      {
        ko: '로그인은 본인 확인이 아닙니다. 어느 환자의 계획인지는 병원이 발급한 코드로 확인합니다.',
        en: 'Signing in is not identity verification. Which patient a plan belongs to is confirmed by the code your hospital issues.',
        ja: 'ログインは本人確認ではありません。どの患者さんのプランかは、病院が発行したコードで確認します。',
        zh: '登录不是身份验证。计划属于哪位患者，由医院签发的代码确认。',
      },
      {
        ko: '"이 기기에서 내 정보 지우기" 를 누르면 로그아웃까지 함께 처리됩니다.',
        en: 'Using "Delete my data from this device" signs you out as well.',
        ja: '「この端末から自分の情報を削除」を押すと、ログアウトも同時に行われます。',
        zh: '点击“从此设备删除我的信息”后，也会同时退出登录。',
      },
    ],
  },
  {
    id: 'store',
    title: { ko: '어디에 남나요', en: 'Where it is kept', ja: 'どこに残りますか', zh: '信息保存在哪里' },
    lead: {
      ko: '입력한 조건과 판정 결과는 이 브라우저 탭 안에만 남습니다. 서버는 판정을 계산해 응답만 돌려주고 아무것도 저장하지 않습니다.',
      en: 'Your entries and results stay inside this browser tab. Our server calculates the result, returns it, and stores nothing.',
      ja: '入力した条件と判定結果は、このブラウザのタブの中にだけ残ります。サーバーは判定を計算して応答を返すだけで、何も保存しません。',
      zh: '您输入的条件和判定结果只保留在此浏览器标签页中。服务器只计算判定并返回结果，不保存任何内容。',
    },
    items: [
      {
        ko: '브라우저 탭을 닫으면 사라집니다.',
        en: 'They disappear when you close the browser tab.',
        ja: 'ブラウザのタブを閉じると消えます。',
        zh: '关闭浏览器标签页后即会消失。',
      },
      {
        ko: '"이 기기에서 내 정보 지우기" 로 언제든 즉시 지울 수 있습니다. 로그인 쿠키도 함께 지워집니다.',
        en: 'You can delete them at any time with "Delete my data from this device". The sign-in cookie is removed too.',
        ja: '「この端末から自分の情報を削除」でいつでもすぐに削除できます。ログインCookieも一緒に削除されます。',
        zh: '您可以随时通过“从此设备删除我的信息”立即删除。登录 Cookie 也会一并删除。',
      },
      {
        ko: '서버 기록에는 어느 공공 API 를 몇 번 불렀는지와 응답 성공 여부만 남고, 입력한 조건은 남지 않습니다.',
        en: 'Server logs record only which public API was called, how often, and whether it succeeded — not your entries.',
        ja: 'サーバーの記録には、どの公共APIを何回呼び出したかと応答の成否だけが残り、入力した条件は残りません。',
        zh: '服务器记录中只保留调用了哪个公共 API、调用次数以及是否成功，不保留您输入的条件。',
      },
    ],
  },
  {
    id: 'third-party',
    title: { ko: '어디로 전달되나요', en: 'Who else receives it', ja: 'どこへ送られますか', zh: '信息会发送到哪里' },
    lead: {
      ko: '선택한 기준점 좌표는 주변 장소와 날씨를 조회하기 위해 다음 공공 API 로 전달됩니다. 조건·복귀시각·동행 정보는 전달되지 않습니다.',
      en: 'The coordinates of the point you chose are sent to the public APIs below to look up nearby places and weather. Your conditions, return time, and companion details are not sent.',
      ja: '選んだ基準地点の座標は、周辺の場所と天気を調べるため、次の公共APIに送られます。条件・帰着時刻・同行の情報は送られません。',
      zh: '您选择的基准点坐标会发送到以下公共 API，用于查询周边地点和天气。条件、返回时间和陪同信息不会发送。',
    },
    items: [
      {
        ko: '한국관광공사 — 국문·영문·무장애 관광정보',
        en: 'Korea Tourism Organization — Korean, English, and barrier-free tourism data',
        ja: '韓国観光公社 — 韓国語・英語・バリアフリーの観光情報',
        zh: '韩国观光公社 — 韩文、英文及无障碍旅游信息',
      },
      {
        ko: '기상청 — 초단기 실황',
        en: 'Korea Meteorological Administration — current weather observation',
        ja: '韓国気象庁 — 超短期の実況',
        zh: '韩国气象厅 — 超短期实况',
      },
    ],
    note: {
      ko: '지도·경로 안내 서비스는 연결되어 있지 않습니다. 위치정보 검토가 끝나기 전까지 좌표를 다른 곳으로 보내지 않습니다.',
      en: 'No map or routing service is connected. We do not send coordinates anywhere else until our location-data review is complete.',
      ja: '地図・経路案内サービスには接続していません。位置情報の検討が終わるまでは、座標をほかの場所に送りません。',
      zh: '尚未接入地图或路线导航服务。在位置信息审查完成之前，我们不会把坐标发送到其他地方。',
    },
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
      ko: 'SafeHour는 증상이나 회복 단계를 해석하지 않습니다. 병원이 알려준 조건을 그대로 적용해 갈 수 있는 곳과 갈 수 없는 곳을 계산할 뿐이며, 의료진의 판단을 대체하지 않습니다.',
      en: 'SafeHour does not interpret symptoms or recovery stages. It applies the conditions your hospital gave you to work out where you can and cannot go. It does not replace your medical team.',
      ja: 'SafeHourは症状や回復段階を解釈しません。病院から伝えられた条件をそのまま当てはめて、行ける場所と行けない場所を計算するだけで、医療スタッフの判断に代わるものではありません。',
      zh: 'SafeHour 不解读症状或恢复阶段。它只是按原样套用医院给出的条件，计算哪些地方可以去、哪些不能去，不能代替医护人员的判断。',
    },
    items: [
      {
        ko: '몸 상태에 이상이 느껴지면 앱을 보지 말고 병원에 먼저 연락하세요. 응급 상황은 119 입니다.',
        en: 'If you feel unwell, contact your hospital before checking the app. In an emergency call 119.',
        ja: '体調に異変を感じたら、アプリを見る前にまず病院へ連絡してください。緊急の場合は119です。',
        zh: '如感到身体不适，请不要先看应用，而是先联系医院。紧急情况请拨打 119。',
      },
      {
        ko: '이동시간은 경로 안내 서비스가 아니라 보수적인 직선거리 추정값입니다. "추정" 표시가 붙은 값은 실제와 다를 수 있습니다.',
        en: 'Travel times are conservative straight-line estimates, not routing results. Values marked "Estimate" may differ from reality.',
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
        en: 'We do not recommend or broker hospitals or clinics. There are no rankings, ratings, or partnerships.',
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
