// designBoard 이름공간 — 디자인 시안 보드(/design-board) (AX-303 · AX-304)
//
// 언어 기반 작업이 미리 만든 이름공간이다. 시안 보드 작업(AX-304 1차, AX-321 화면 시안)이 이 파일만 채운다.
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다. 새 키는 `designBoard.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요
//
// 'demo…' 키는 시안 보드의 **고정 데모 데이터**다. 실제 사용자·병원·가게 정보가 아니다.
// 가게 이름은 실제 업소를 가리키지 않도록 '데모'를 붙인다(중립 추천·광고 금지).

/** 일반 화면 문구 — 'designBoard.키': { ko, en, ja, zh } */
export const messages = {
  'designBoard.header': { ko: '디자인 시안 보드', en: 'Design board', ja: 'デザインボード', zh: '设计样板' },
  'designBoard.lead': {
    ko: 'SafeHour 밝은 여행앱 디자인 시스템의 토큰과 부품 견본입니다.',
    en: 'Tokens and component samples of the SafeHour bright travel design system.',
    ja: 'SafeHourの明るい旅行アプリ風デザインシステムのトークンと部品の見本です。',
    zh: '这里是 SafeHour 明亮旅行风设计系统的令牌和组件样例。',
  },
  'designBoard.note': {
    ko: '고정 데모 데이터만 씁니다. 이 기기의 사용자 정보를 읽지 않으며, 메뉴에 나오지 않는 내부 페이지입니다.',
    en: 'Uses fixed demo data only. It never reads user data on this device and is not linked from the menu.',
    ja: '固定のデモデータのみを使います。この端末の利用者情報は読み込まず、メニューにも表示されない内部ページです。',
    zh: '仅使用固定的演示数据。不会读取本设备上的用户信息，也不会出现在菜单中。',
  },

  // ── 색 ──
  'designBoard.colorsTitle': { ko: '색 토큰과 대비', en: 'Colour tokens and contrast', ja: '色トークンとコントラスト', zh: '颜色令牌与对比度' },
  'designBoard.colorsLead': {
    ko: '글자와 바탕 짝마다 대비를 이 화면에서 다시 계산합니다. 기준은 본문 4.5:1, UI 경계 3:1입니다.',
    en: 'Contrast is recalculated here for every text and background pair. The bar is 4.5:1 for text and 3:1 for UI edges.',
    ja: '文字と背景の組み合わせごとに、この画面でコントラストを計算し直します。基準は本文4.5:1、UI境界3:1です。',
    zh: '本页面会重新计算每组文字与背景的对比度。标准为正文 4.5:1，界面边界 3:1。',
  },
  'designBoard.groupBase': { ko: '바탕·글자·경계', en: 'Surfaces, text and edges', ja: '背景・文字・境界', zh: '底色、文字与边界' },
  'designBoard.groupAccent': {
    ko: '포인트 1색 — 한강 코발트',
    en: 'Single accent — Han River cobalt',
    ja: 'アクセント1色 — 漢江コバルト',
    zh: '唯一强调色 — 汉江钴蓝',
  },
  'designBoard.groupSupport': { ko: '보조색 — 벚꽃 분홍', en: 'Support — cherry blossom pink', ja: 'サブカラー — 桜ピンク', zh: '辅助色 — 樱花粉' },
  'designBoard.groupState': {
    ko: '판정 4상태 — 색 + 문구 + 아이콘',
    en: 'Four states — colour + words + icon',
    ja: '判定4状態 — 色＋文言＋アイコン',
    zh: '四种判定状态 — 颜色＋文字＋图标',
  },
  'designBoard.groupEmergency': { ko: '긴급·즉시 복귀', en: 'Emergency and return now', ja: '緊急・すぐ戻る', zh: '紧急与立即返回' },
  'designBoard.groupSource': { ko: '출처 영역·배지', en: 'Source areas and badges', ja: '出典エリア・バッジ', zh: '来源区域与徽章' },
  'designBoard.pass': { ko: 'AA 통과', en: 'Passes AA', ja: 'AA適合', zh: '符合 AA' },
  'designBoard.fail': { ko: 'AA 미달', en: 'Fails AA', ja: 'AA不適合', zh: '未达 AA' },
  'designBoard.textMin': { ko: '본문 기준 4.5:1', en: 'Text needs 4.5:1', ja: '本文基準 4.5:1', zh: '正文标准 4.5:1' },
  'designBoard.uiMin': { ko: 'UI 경계 기준 3:1', en: 'UI edge needs 3:1', ja: 'UI境界基準 3:1', zh: '界面边界标准 3:1' },
  'designBoard.measuring': { ko: '계산 중', en: 'Measuring', ja: '計算中', zh: '计算中' },
  'designBoard.decorative': {
    ko: '장식 전용 — 글자에 쓰지 않음',
    en: 'Decoration only — never for text',
    ja: '装飾専用 — 文字には使わない',
    zh: '仅作装饰 — 不用于文字',
  },

  // ── 글자 ──
  'designBoard.typeTitle': { ko: '글자', en: 'Type', ja: 'タイポグラフィ', zh: '字体排印' },
  'designBoard.typeNote': {
    ko: '기기에 있는 시스템 글꼴만 씁니다. 글꼴 파일을 내려받지 않고, 한·일·중 한자 자형이 섞이지 않게 언어마다 글꼴 목록을 나눕니다.',
    en: 'Only system fonts already on the device are used. No font files are downloaded, and each language has its own font list so Korean, Japanese and Chinese glyphs never mix.',
    ja: '端末にあるシステムフォントだけを使います。フォントファイルはダウンロードせず、日中韓の字形が混ざらないよう言語ごとにフォントを分けます。',
    zh: '只使用设备自带的系统字体。不下载字体文件，并按语言区分字体列表，避免中日韩字形混用。',
  },
  'designBoard.typeSample': {
    ko: '오늘은 경복궁까지 천천히 걸어요',
    en: 'A slow walk to Gyeongbokgung today',
    ja: '今日は景福宮までゆっくり歩きます',
    zh: '今天慢慢走到景福宫',
  },
  'designBoard.typeLangs': { ko: '언어별 시스템 글꼴', en: 'System font per language', ja: '言語別システムフォント', zh: '各语言的系统字体' },
  'designBoard.typeNumeric': { ko: '시각 숫자 (고정폭)', en: 'Clock figures (tabular)', ja: '時刻の数字（等幅）', zh: '时间数字（等宽）' },

  // ── 간격·모서리·그림자 ──
  'designBoard.spaceTitle': { ko: '간격·모서리·그림자', en: 'Spacing, radius and shadow', ja: '余白・角丸・影', zh: '间距、圆角与阴影' },
  'designBoard.spacing': { ko: '간격 (4px 단위)', en: 'Spacing (4 px steps)', ja: '余白（4px単位）', zh: '间距（4px 单位）' },
  'designBoard.radius': { ko: '모서리', en: 'Corner radius', ja: '角丸', zh: '圆角' },
  'designBoard.shadow': { ko: '그림자', en: 'Shadow', ja: '影', zh: '阴影' },

  // ── 부품 ──
  'designBoard.componentsTitle': { ko: '부품과 상태별 견본', en: 'Components and their states', ja: '部品と状態別の見本', zh: '组件及各状态样例' },
  'designBoard.cButton': { ko: '버튼', en: 'Buttons', ja: 'ボタン', zh: '按钮' },
  'designBoard.btnPrimary': { ko: '주 버튼', en: 'Primary button', ja: 'メインボタン', zh: '主按钮' },
  'designBoard.btnSecondary': { ko: '보조 버튼', en: 'Secondary button', ja: 'サブボタン', zh: '次按钮' },
  'designBoard.btnQuiet': { ko: '조용한 버튼', en: 'Quiet button', ja: '控えめなボタン', zh: '低调按钮' },
  'designBoard.btnDisabled': { ko: '비활성 버튼', en: 'Disabled button', ja: '無効なボタン', zh: '禁用按钮' },
  'designBoard.btnSmall': { ko: '작은 버튼', en: 'Small button', ja: '小さいボタン', zh: '小按钮' },
  'designBoard.btnReturn': { ko: '즉시 복귀 안내', en: 'Return now', ja: 'すぐ戻る案内', zh: '立即返回指引' },
  'designBoard.cBadge': { ko: '배지 5종', en: 'Five badges', ja: 'バッジ5種', zh: '五种徽章' },
  'designBoard.cState': { ko: '상태 배너 (4상태)', en: 'State banner (four states)', ja: '状態バナー（4状態）', zh: '状态横幅（四种状态）' },
  'designBoard.stateNote': {
    ko: '쉬는 날(관광 미추천)은 오류가 아닙니다 — 빨강·경고 삼각형 대신 회청색과 달 아이콘을 씁니다.',
    en: 'A rest day (no tourism) is not an error — it uses slate and a moon icon, never red or a warning triangle.',
    ja: '休む日（観光のおすすめなし）はエラーではありません。赤や警告の三角ではなく、青灰色と月のアイコンを使います。',
    zh: '休息日（不推荐观光）不是错误——使用蓝灰色和月亮图标，而不是红色或警告三角。',
  },
  'designBoard.cDateChip': { ko: '날짜 칩', en: 'Date chips', ja: '日付チップ', zh: '日期标签' },
  'designBoard.cTimeline': { ko: '하루 타임라인 — 지하철 노선도', en: 'Day timeline — metro line map', ja: '1日のタイムライン — 地下鉄路線図', zh: '一日时间线 — 地铁线路图' },
  'designBoard.timelineNote': {
    ko: '외출은 굵은 노선, 정거장은 역, 복귀 마감은 종착역입니다. 외출 밖 시간은 점선으로 이어집니다.',
    en: 'An outing is a bold line, each stop is a station and the return deadline is the terminus. Time outside outings is dotted.',
    ja: '外出は太い路線、立ち寄り先は駅、戻り期限は終着駅です。外出以外の時間は点線でつながります。',
    zh: '外出是粗线路，每个停靠点是车站，返回截止是终点站。外出以外的时间用虚线连接。',
  },
  'designBoard.tlPatient': { ko: '환자 일정', en: 'Patient plan', ja: '患者の日程', zh: '患者行程' },
  'designBoard.tlGuardian': { ko: '보호자 일정', en: 'Companion plan', ja: '付き添いの日程', zh: '陪同者行程' },
  'designBoard.cPlace': { ko: '장소 카드 (사진 중심)', en: 'Place cards (photo first)', ja: '場所カード（写真中心）', zh: '地点卡片（以照片为主）' },
  'designBoard.placeNote': {
    ko: '사진 주소가 없거나 불러오지 못하면 유형별 일러스트로 바뀝니다. 세 번째 카드는 깨진 사진 주소입니다.',
    en: 'With no photo URL, or when it fails to load, the card falls back to a category illustration. The third card has a broken photo URL.',
    ja: '写真のURLがない、または読み込めないときは種類別イラストに切り替わります。3枚目は壊れた写真URLです。',
    zh: '没有照片地址或加载失败时，会换成分类插图。第三张卡片使用了失效的照片地址。',
  },
  'designBoard.cArt': { ko: '유형별 일러스트', en: 'Category illustrations', ja: '種類別イラスト', zh: '分类插图' },
  'designBoard.cMeal': { ko: '식사 칸', en: 'Meal slots', ja: '食事枠', zh: '用餐时段' },
  'designBoard.cAnswer': { ko: '예 / 아니오 / 모르겠음 입력', en: 'Yes / No / Not sure input', ja: 'はい／いいえ／わからない入力', zh: '是／否／不确定 输入' },
  'designBoard.answerHospitalNote': {
    ko: '병원 발행 항목 — 모르겠음이 없고 고칠 수 없습니다',
    en: 'Hospital-issued item — no “Not sure”, and it cannot be edited',
    ja: '病院発行の項目 — 「わからない」はなく、変更できません',
    zh: '医院发布的项目 — 没有“不确定”，也无法修改',
  },
  'designBoard.qUv': { ko: '자외선을 피해야 하나요?', en: 'Do you need to avoid UV?', ja: '紫外線を避ける必要がありますか？', zh: '需要避开紫外线吗？' },
  'designBoard.qHeat': {
    ko: '사우나·찜질 등 열을 피해야 하나요?',
    en: 'Do you need to avoid heat such as saunas?',
    ja: 'サウナなどの熱を避ける必要がありますか？',
    zh: '需要避开桑拿等高温环境吗？',
  },
  'designBoard.qEscort': {
    ko: '보호자가 꼭 함께 있어야 하나요?',
    en: 'Must your companion stay with you?',
    ja: '付き添いの方が必ず一緒にいる必要がありますか？',
    zh: '陪同者必须一直在身边吗？',
  },
  'designBoard.cPeriod': { ko: '조건 기간 편집기 (틀)', en: 'Condition period editor (frame)', ja: '条件期間エディタ（枠）', zh: '条件期间编辑器（框架）' },
  'designBoard.demoPeriodSelf': { ko: '수술 후 첫 주', en: 'First week after surgery', ja: '手術後の最初の1週間', zh: '术后第一周' },
  'designBoard.demoPeriodHospital': { ko: '데모 병원 A 지침', en: 'Demo Hospital A instructions', ja: 'デモ病院Aの指示', zh: '演示医院 A 的指引' },
  'designBoard.demoSave': { ko: '기간 저장', en: 'Save period', ja: '期間を保存', zh: '保存期间' },
  'designBoard.demoCancel': { ko: '취소', en: 'Cancel', ja: 'キャンセル', zh: '取消' },
  'designBoard.cSheet': { ko: '시트 (전후 비교·복귀 틀)', en: 'Sheet (compare and return frame)', ja: 'シート（前後比較・戻りの枠）', zh: '底部面板（前后对比与返回框架）' },
  'designBoard.sheetOpen': { ko: '시트 열기', en: 'Open the sheet', ja: 'シートを開く', zh: '打开面板' },
  'designBoard.sheetTitle': { ko: '바뀐 일정 비교', en: 'What changed in your plan', ja: '変わった日程の比較', zh: '行程变化对比' },
  'designBoard.sheetBody': {
    ko: '뒤로 가기, Escape, 닫기·확인 버튼 어느 쪽으로 닫아도 방문 기록에 빈 칸이 남지 않습니다.',
    en: 'Closing with Back, Escape, the close button or OK leaves no stray history entry.',
    ja: '戻る操作、Esc、閉じる・OKボタンのどれで閉じても、履歴に余計な項目は残りません。',
    zh: '无论用返回、Esc、关闭按钮还是确认按钮关闭，都不会在浏览记录中留下多余项目。',
  },
  'designBoard.cEmpty': { ko: '빈 상태', en: 'Empty state', ja: '空の状態', zh: '空状态' },
  'designBoard.emptyTitle': { ko: '아직 일정이 없어요', en: 'No plan yet', ja: 'まだ日程がありません', zh: '还没有行程' },
  'designBoard.emptyBody': {
    ko: '체류 정보를 넣으면 날짜별 하루 일정을 만들어요.',
    en: 'Add your stay details and we will build a plan for each day.',
    ja: '滞在情報を入力すると、日付ごとの1日の日程を作ります。',
    zh: '填写停留信息后，会为每一天生成行程。',
  },
  'designBoard.emptyAction': { ko: '체류 정보 넣기', en: 'Add stay details', ja: '滞在情報を入力', zh: '填写停留信息' },
  'designBoard.cKorean': { ko: '한국어 안내 카드 (틀)', en: 'Korean help card (frame)', ja: '韓国語案内カード（枠）', zh: '韩语提示卡（框架）' },
  'designBoard.kcardTitle': { ko: '식이 카드', en: 'Food card', ja: '食事カード', zh: '饮食卡' },
  'designBoard.kcardLine1': {
    ko: '매운 음식은 빼 주세요',
    en: 'Please leave out spicy food',
    ja: '辛い料理は抜いてください',
    zh: '请不要放辣',
  },
  'designBoard.kcardLine2': {
    ko: '술은 마실 수 없어요',
    en: 'I cannot drink alcohol',
    ja: 'お酒は飲めません',
    zh: '我不能喝酒',
  },
  'designBoard.cSource': { ko: '출처 영역 5종', en: 'Five source areas', ja: '出典エリア5種', zh: '五种来源区域' },
  'designBoard.srcHospitalBody': {
    ko: '(데모) 7일 동안 사우나·찜질을 피하세요.',
    en: '(Demo) Avoid saunas and hot rooms for 7 days.',
    ja: '（デモ）7日間はサウナや岩盤浴を避けてください。',
    zh: '（演示）7 天内请避免桑拿和汗蒸。',
  },
  'designBoard.srcSelfBody': {
    ko: '자외선을 피해야 하나요? — 예',
    en: 'Do you need to avoid UV? — Yes',
    ja: '紫外線を避ける必要がありますか？ — はい',
    zh: '需要避开紫外线吗？ — 是',
  },
  'designBoard.srcEstimateBody': {
    ko: '택시 12분 · 복귀 여유 25분',
    en: 'Taxi 12 min · 25 min spare before the return deadline',
    ja: 'タクシー12分・戻り期限まで余裕25分',
    zh: '出租车 12 分钟 · 距返回截止还剩 25 分钟',
  },
  'designBoard.srcTourismBody': {
    ko: '(데모 원문) 조선 시대 궁궐로, 넓은 마당과 전각이 이어집니다.',
    en: '(Demo original) A Joseon-era palace with wide courtyards and halls.',
    ja: '（デモ原文）朝鮮時代の宮殿で、広い中庭と殿閣が続きます。',
    zh: '（演示原文）朝鲜时代的宫殿，宽阔的庭院与殿阁相连。',
  },
  'designBoard.srcAiBody': {
    ko: '(데모) 오전에는 고궁을 천천히 둘러보고, 점심 뒤에는 숙소에서 쉬는 하루예요.',
    en: '(Demo) A slow palace visit in the morning, then rest at your stay after lunch.',
    ja: '（デモ）午前は古宮をゆっくり巡り、昼食後は宿泊先で休む1日です。',
    zh: '（演示）上午慢慢参观古宫，午饭后回住处休息的一天。',
  },
  'designBoard.srcAiNote': {
    ko: 'AI가 쓴 소개 문장입니다. 판정에는 쓰지 않습니다.',
    en: 'Written by AI as an introduction. It is not used for any check.',
    ja: 'AIが書いた紹介文です。判定には使いません。',
    zh: '这是 AI 撰写的介绍文字，不用于任何判定。',
  },
  'designBoard.cShell': { ko: '앱 셸', en: 'App shell', ja: 'アプリの枠組み', zh: '应用外壳' },
  'designBoard.shellNote': {
    ko: '하단 내비 4개와 긴급 연락 버튼은 화면 아래에 고정됩니다. 보기 전용 배너는 저장소 상태에 따라 화면 맨 위에 붙습니다.',
    en: 'The four-item bottom menu and the emergency button are fixed to the bottom. The view-only banner appears at the top depending on the device store status.',
    ja: '下部メニュー4つと緊急連絡ボタンは画面下に固定されます。閲覧のみバナーは保存状態に応じて画面上部に表示されます。',
    zh: '底部四项菜单和紧急联系按钮固定在屏幕下方。仅供查看横幅会根据设备存储状态显示在顶部。',
  },

  // ── 데모 데이터 ──
  'designBoard.demoLodging': { ko: '데모 호텔 명동', en: 'Demo Hotel Myeongdong', ja: 'デモホテル明洞', zh: '演示酒店明洞' },
  'designBoard.demoPalace': { ko: '경복궁', en: 'Gyeongbokgung Palace', ja: '景福宮', zh: '景福宫' },
  'designBoard.demoMuseum': { ko: '데모 미술관', en: 'Demo Art Museum', ja: 'デモ美術館', zh: '演示美术馆' },
  'designBoard.demoFestival': { ko: '데모 야간 축제', en: 'Demo Night Festival', ja: 'デモ夜祭り', zh: '演示夜间庆典' },
  'designBoard.demoRestaurant': { ko: '데모 한식당', en: 'Demo Korean Restaurant', ja: 'デモ韓国料理店', zh: '演示韩餐馆' },
  'designBoard.demoShop': { ko: '데모 화장품 거리', en: 'Demo Beauty Street', ja: 'デモコスメ通り', zh: '演示美妆街' },
  'designBoard.demoHospital': { ko: '데모 병원 A', en: 'Demo Hospital A', ja: 'デモ病院A', zh: '演示医院 A' },
  'designBoard.demoStay': { ko: '체류 55분', en: 'Stay 55 min', ja: '滞在55分', zh: '停留 55 分钟' },
  'designBoard.demoWalk': { ko: '걷기 약 10분', en: 'About 10 min on foot', ja: '徒歩約10分', zh: '步行约 10 分钟' },
  'designBoard.demoReturnNote': {
    ko: '숙소에서 약을 먹는 시각 때문에 돌아와요',
    en: 'Back for the medicine you take at your stay',
    ja: '宿泊先で薬を飲む時刻のために戻ります',
    zh: '因为要在住处服药而返回',
  },
  'designBoard.demoCredit': {
    ko: '데모 사진 — 실제 관광공사 사진이 아닙니다',
    en: 'Demo photo — not a real tourism photo',
    ja: 'デモ写真 — 実際の観光公社の写真ではありません',
    zh: '演示照片 — 并非观光公社的真实照片',
  },

  // ── 화면 시안 (AX-321 이 채운다) ──
  'designBoard.screensTitle': { ko: '화면 시안', en: 'Screen mock-ups', ja: '画面デザイン案', zh: '页面设计稿' },
  'designBoard.screensPending': {
    ko: '비어 있는 자리입니다. 오늘·전체 일정·하루 일정·조건 입력·장소 상세·카드·긴급·보호자 열기 축소 시안을 다음 작업이 채웁니다.',
    en: 'Reserved. A later task fills in mini mock-ups of Today, Trip, Day plan, Conditions, Place, Cards, Emergency and Companion link.',
    ja: '空欄です。今日・全日程・1日の日程・条件入力・場所詳細・カード・緊急・付き添いリンクの縮小案は後の作業で埋めます。',
    zh: '此处留空。后续任务会补上今天、全部行程、单日行程、条件填写、地点详情、卡片、紧急和陪同者链接的缩略设计稿。',
  },
};

/** 안전 문구 — 상태 메시지·사유·고지·복귀 안내 문장 */
export const safety = {};
