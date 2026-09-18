// conditions 이름공간 — 조건 기간(/conditions)·병원 연결(/link)·병원 안내(/guide) (AX-303)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// 기존 키 접두사 `link.`·`guide.` 을 그대로 쓴다. 새 키는 `conditions.` 으로 시작한다.
// 병원 안내문 원문(채널 B)은 번역 대상이 아니다 — 여기에는 라벨만 둔다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  // ── 병원 연결 (AX-216) ──
  'link.header': { ko: '병원 연결', en: 'Connect hospital', ja: '病院連携', zh: '关联医院' },
  'link.title': {
    ko: '병원이 발행한\n회복 지침을 연결하세요',
    en: 'Connect the recovery plan\nyour hospital issued',
    ja: '病院が発行した\n回復ガイドを連携してください',
    zh: '请关联\n医院签发的恢复指引',
  },
  'link.lead': {
    ko: '병원에서 받은 QR 또는 코드를 입력하면 외출 조건과 안내를 그대로 가져옵니다. 직접 입력하지 않으셔도 됩니다.',
    en: 'Enter the QR or code from your hospital and we bring in the conditions and instructions exactly as issued. You do not type them yourself.',
    ja: '病院で受け取ったQRコードまたはコードを入力すると、外出条件と案内をそのまま取り込みます。ご自身で入力する必要はありません。',
    zh: '输入医院提供的二维码或代码后，外出条件和指引将按原样导入。您无需自己填写。',
  },
  'link.codeLabel': { ko: '연결 코드', en: 'Connection code', ja: '連携コード', zh: '关联代码' },
  'link.codePlaceholder': { ko: '예: DEMO-A', en: 'e.g. DEMO-A', ja: '例：DEMO-A', zh: '例如：DEMO-A' },
  'link.submit': { ko: '회복 지침 연결', en: 'Connect plan', ja: '回復ガイドを連携', zh: '关联恢复指引' },
  'link.submitting': { ko: '연결하는 중입니다…', en: 'Connecting…', ja: '連携しています…', zh: '正在关联…' },
  'link.demoTitle': {
    ko: '연동 없이 둘러보기',
    en: 'Explore without a hospital',
    ja: '連携せずに見てみる',
    zh: '不关联医院先看看',
  },
  'link.demoLead': {
    ko: '아래는 병원 연동을 흉내 낸 예시입니다. 실제 병원 정보가 아닙니다.',
    en: 'The samples below imitate a hospital connection. They are not real hospital data.',
    ja: '以下は病院連携を模したサンプルです。実際の病院情報ではありません。',
    zh: '以下是模拟医院关联的示例，并非真实的医院信息。',
  },
  'link.demoStandard': {
    ko: '예시 A — 외출 가능',
    en: 'Sample A — outing allowed',
    ja: 'サンプルA — 外出可',
    zh: '示例 A — 可以外出',
  },
  'link.demoRestricted': {
    ko: '예시 B — 외출 제한',
    en: 'Sample B — outing restricted',
    ja: 'サンプルB — 外出制限',
    zh: '示例 B — 外出受限',
  },
  'link.demoExpired': {
    ko: '예시 C — 지침 만료',
    en: 'Sample C — plan expired',
    ja: 'サンプルC — ガイドの期限切れ',
    zh: '示例 C — 指引已过期',
  },
  'link.demoBadge': {
    ko: '병원 연동 데모',
    en: 'Hospital connection demo',
    ja: '病院連携デモ',
    zh: '医院关联演示',
  },
  'link.errLabel': { ko: '연결하지 못했습니다', en: 'Could not connect', ja: '連携できませんでした', zh: '无法关联' },
  'link.errRequired': {
    ko: '연결 코드를 입력해 주세요.',
    en: 'Please enter the connection code.',
    ja: '連携コードを入力してください。',
    zh: '请输入关联代码。',
  },
  'link.errUnknown': {
    ko: '이 코드로 연결된 회복 지침을 찾지 못했습니다. 병원에서 받은 코드를 확인해 주세요.',
    en: 'No recovery plan was found for this code. Please check the code your hospital gave you.',
    ja: 'このコードに対応する回復ガイドが見つかりませんでした。病院で受け取ったコードをご確認ください。',
    zh: '未找到与此代码对应的恢复指引。请核对医院提供的代码。',
  },
  'link.errInvalid': {
    ko: '회복 지침 형식이 올바르지 않아 연결하지 않았습니다. 병원에 문의해 주세요.',
    en: 'The recovery plan format was not valid, so it was not connected. Please contact your hospital.',
    ja: '回復ガイドの形式が正しくないため、連携しませんでした。病院にお問い合わせください。',
    zh: '恢复指引格式不正确，因此未关联。请联系医院。',
  },
  'link.errNetwork': {
    ko: '네트워크 오류로 연결하지 못했습니다.',
    en: 'A network error stopped the connection.',
    ja: 'ネットワークエラーのため連携できませんでした。',
    zh: '由于网络错误，未能关联。',
  },
  'link.errLogin': {
    ko: '로그인 후 연결할 수 있습니다.',
    en: 'Please sign in before connecting.',
    ja: 'ログインすると連携できます。',
    zh: '登录后才能关联。',
  },
  'link.connected': {
    ko: '연결됨 · {issuer}',
    en: 'Connected · {issuer}',
    ja: '連携済み · {issuer}',
    zh: '已关联 · {issuer}',
  },
  'link.expires': { ko: '유효기간 {at}', en: 'Valid until {at}', ja: '有効期限 {at}', zh: '有效期至 {at}' },
  'link.goToday': {
    ko: '오늘의 회복 상태 보기',
    en: 'See today’s status',
    ja: '今日の回復状況を見る',
    zh: '查看今天的恢复状态',
  },
  'link.disconnect': { ko: '연결 해제', en: 'Disconnect', ja: '連携を解除', zh: '解除关联' },

  // ── 병원 회복 안내 (AX-218) ──
  'guide.header': {
    ko: '병원 회복 안내',
    en: 'Hospital instructions',
    ja: '病院の回復案内',
    zh: '医院恢复指引',
  },
  'guide.lead': {
    ko: '병원이 작성한 안내를 그대로 보여드립니다. SafeHour가 요약하거나 바꾸지 않습니다.',
    en: 'These are your hospital’s own words, shown unchanged. SafeHour does not summarise or edit them.',
    ja: '病院が作成した案内をそのままお見せします。SafeHourが要約したり変更したりすることはありません。',
    zh: '按原样显示医院撰写的指引。SafeHour 不做摘要或修改。',
  },
  'guide.issuedBadge': {
    ko: '병원에서 제공한 안내',
    en: 'Issued by your hospital',
    ja: '病院から提供された案内',
    zh: '医院提供的指引',
  },
  'guide.updatedAt': { ko: '{at} 발행', en: 'Issued {at}', ja: '{at} 発行', zh: '{at} 发布' },
  'guide.acknowledge': { ko: '확인했습니다', en: 'I have read this', ja: '確認しました', zh: '我已阅读' },
  'guide.acknowledged': { ko: '확인 완료', en: 'Reviewed', ja: '確認済み', zh: '已确认' },
  'guide.acknowledgeAll': {
    ko: '전체 확인 처리',
    en: 'Mark all as read',
    ja: 'すべて確認済みにする',
    zh: '全部标为已读',
  },
  'guide.critical': { ko: '확인 필요', en: 'Needs review', ja: '要確認', zh: '需确认' },
  'guide.criticalNote': {
    ko: '표시된 안내를 확인해야 외출 판정이 진행됩니다.',
    en: 'Outing checks stay on hold until you review the marked instructions.',
    ja: '表示された案内を確認するまで、外出の判定は保留されます。',
    zh: '在您确认标记的指引之前，外出判定将暂停。',
  },
  'guide.empty': {
    ko: '표시할 병원 안내가 없습니다.',
    en: 'There are no hospital instructions to show.',
    ja: '表示できる病院の案内はありません。',
    zh: '没有可显示的医院指引。',
  },
  'guide.catActivity': { ko: '활동·외출', en: 'Activity and outings', ja: '活動・外出', zh: '活动与外出' },
  'guide.catMedication': { ko: '복약', en: 'Medication', ja: '服薬', zh: '用药' },
  'guide.catFood': { ko: '음식·음료', en: 'Food and drink', ja: '飲食', zh: '饮食' },
  'guide.catLifestyle': { ko: '생활 안내', en: 'Daily life', ja: '生活の案内', zh: '生活指引' },
  'guide.catEscort': { ko: '동행', en: 'Companion', ja: '同行', zh: '陪同' },
  'guide.catEmergency': {
    ko: '이상 상황 대응',
    en: 'If something goes wrong',
    ja: '異常時の対応',
    zh: '异常情况应对',
  },
  'guide.catVisit': { ko: '다음 진료', en: 'Next appointment', ja: '次の診察', zh: '下次就诊' },
};

/** 안전 문구 */
export const safety = {};
