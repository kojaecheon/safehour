// onboarding 이름공간 — 시작(/)·로그인(/login)·체류 설정(/onboarding) (AX-303)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// 기존 키 접두사 `home.`·`login.` 을 그대로 쓴다. 새 키는 `onboarding.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  // ── 시작 화면 (SCR001) ──
  'home.titleLine1': {
    ko: '병원 조건 안에서만,',
    en: 'Only what your hospital',
    ja: '病院の条件の範囲内で、',
    zh: '只在医院条件范围内，',
  },
  'home.titleLine2': {
    ko: '안심 관광을 추천합니다',
    en: 'instructions allow',
    ja: '観光をご提案します',
    zh: '为您推荐观光',
  },
  'home.lead': {
    ko: '수술·시술 후 회복 중인 외국인 환자와 보호자를 위해, 병원이 정한 주의조건과 복귀시간을 지키는 활동만 골라 보여드립니다.',
    en: 'For international patients recovering from a procedure and their companions, we show only activities that fit the precautions and return time your hospital set.',
    ja: '手術・施術後に回復中の外国人患者さんと同行者のために、病院が定めた注意条件と帰着時刻を守れる活動だけを選んでご案内します。',
    zh: '我们为术后恢复中的外国患者及陪同者，只挑选符合医院注意事项和返回时间的活动。',
  },
  'home.principlesAria': {
    ko: 'SafeHour의 세 가지 원칙',
    en: 'Three principles of SafeHour',
    ja: 'SafeHourの3つの原則',
    zh: 'SafeHour 的三项原则',
  },
  'home.principlesTitle': {
    ko: '시작 전에 꼭 알아두세요',
    en: 'Before you start',
    ja: '始める前に必ずお読みください',
    zh: '开始前请务必了解',
  },
  'home.cta': { ko: '안심 코스 만들기', en: 'Plan a safe outing', ja: '外出コースを作る', zh: '制定外出路线' },
  'home.clearedNotice': {
    ko: '이 기기에서 입력한 조건과 추천 결과를 지웠습니다.',
    en: 'Your entries and results have been deleted from this device.',
    ja: 'この端末で入力した条件とおすすめ結果を削除しました。',
    zh: '已删除在此设备上输入的条件和推荐结果。',
  },

  // ── 로그인 (AX-219) ──
  'login.header': { ko: '로그인', en: 'Sign in', ja: 'ログイン', zh: '登录' },
  'login.title': {
    ko: '회복 계획을 안전하게 불러오려면\n로그인이 필요합니다',
    en: 'Sign in to load your\nrecovery plan securely',
    ja: '回復プランを読み込むには\nログインが必要です',
    zh: '需要先登录\n才能加载您的恢复计划',
  },
  'login.lead': {
    ko: '로그인은 다음에 열었을 때 같은 계획을 다시 불러오기 위한 것입니다. 이름·이메일·프로필은 받지 않습니다.',
    en: 'Signing in only lets us load the same plan next time you open the app. We do not receive your name, email, or profile.',
    ja: 'ログインは、次に開いたときに同じプランを読み込むためのものです。名前・メールアドレス・プロフィールは受け取りません。',
    zh: '登录只是为了下次打开时加载同一计划。我们不会获取您的姓名、电子邮箱或个人资料。',
  },
  'login.google': { ko: 'Google로 계속하기', en: 'Continue with Google', ja: 'Googleで続ける', zh: '使用 Google 继续' },
  'login.kakao': { ko: '카카오로 계속하기', en: 'Continue with Kakao', ja: 'カカオで続ける', zh: '使用 Kakao 继续' },
  'login.demo': {
    ko: '로그인 없이 둘러보기 (데모)',
    en: 'Explore without signing in (demo)',
    ja: 'ログインせずに見てみる（デモ）',
    zh: '不登录先看看（演示）',
  },
  'login.demoNote': {
    ko: '데모는 비식별 예시 계획으로 전체 흐름만 보여줍니다. 실제 병원 정보는 들어 있지 않습니다.',
    en: 'The demo shows the full flow with a de-identified sample plan. It contains no real hospital data.',
    ja: 'デモでは、個人を特定できないサンプルプランで全体の流れだけをお見せします。実際の病院情報は含まれていません。',
    zh: '演示使用无法识别个人身份的示例计划，仅展示完整流程。其中不含真实的医院信息。',
  },
  'login.notConfigured': { ko: '준비 중', en: 'Not available yet', ja: '準備中', zh: '准备中' },
  'login.hospitalNext': {
    ko: '병원 회복 계획 연결은 로그인 다음 단계입니다. 병원에서 받은 QR 또는 코드가 필요합니다.',
    en: 'Connecting your hospital recovery plan is the next step. You will need the QR code or code your hospital gave you.',
    ja: '病院の回復プランの連携は、ログインの次のステップです。病院で受け取ったQRコードまたはコードが必要です。',
    zh: '关联医院恢复计划是登录后的下一步。需要医院提供的二维码或代码。',
  },
  'login.notIdentityCheck': {
    ko: '로그인은 본인 확인이 아닙니다. 어느 환자의 계획인지는 병원이 발급한 코드로 확인합니다.',
    en: 'Signing in is not identity verification. Which patient a plan belongs to is confirmed by the code your hospital issues.',
    ja: 'ログインは本人確認ではありません。どの患者さんのプランかは、病院が発行したコードで確認します。',
    zh: '登录不是身份验证。计划属于哪位患者，由医院签发的代码确认。',
  },
  'login.errorLabel': {
    ko: '로그인하지 못했습니다',
    en: 'Could not sign in',
    ja: 'ログインできませんでした',
    zh: '无法登录',
  },
  'login.errCancelled': {
    ko: '로그인을 취소했습니다. 다시 시도해 주세요.',
    en: 'Sign-in was cancelled. Please try again.',
    ja: 'ログインがキャンセルされました。もう一度お試しください。',
    zh: '登录已取消。请重试。',
  },
  'login.errExpired': {
    ko: '시간이 지나 다시 시작해야 합니다. 다시 시도해 주세요.',
    en: 'The attempt timed out. Please try again.',
    ja: '時間が経過したため、最初からやり直す必要があります。もう一度お試しください。',
    zh: '操作已超时，需要重新开始。请重试。',
  },
  'login.errRetry': {
    ko: '문제가 생겨 로그인을 마치지 못했습니다. 다시 시도해 주세요.',
    en: 'Something went wrong before sign-in finished. Please try again.',
    ja: '問題が発生し、ログインを完了できませんでした。もう一度お試しください。',
    zh: '出现问题，未能完成登录。请重试。',
  },
  'login.errNotConfigured': {
    ko: '이 방식은 아직 연결되지 않았습니다. 다른 방식을 선택해 주세요.',
    en: 'This method is not connected yet. Please choose another.',
    ja: 'この方法はまだ連携されていません。別の方法を選んでください。',
    zh: '此方式尚未接通。请选择其他方式。',
  },
  'login.signedIn': { ko: '로그인되어 있습니다', en: 'You are signed in', ja: 'ログインしています', zh: '已登录' },
  'login.logout': { ko: '로그아웃', en: 'Sign out', ja: 'ログアウト', zh: '退出登录' },
};

/** 안전 문구 — 시작 화면의 고지 3종과 의료 면책 */
export const safety = {
  'home.p1Title': {
    ko: '① 의료 판단을 하지 않습니다.',
    en: '① We make no medical judgements.',
    ja: '① 医療的な判断は行いません。',
    zh: '① 我们不做医疗判断。',
  },
  'home.p1Body': {
    ko: '증상 해석이나 외출 가능 여부 진단은 하지 않으며, 병원이 제공한 조건만 따릅니다.',
    en: 'We do not interpret symptoms or decide whether you may go out. We follow only the conditions your hospital gave you.',
    ja: '症状の解釈や外出できるかどうかの診断は行わず、病院から伝えられた条件だけに従います。',
    zh: '我们不解读症状，也不判断您能否外出，只遵循医院提供的条件。',
  },
  'home.p2Title': {
    ko: '② 현재 위치(GPS)를 서버로 보내지 않습니다.',
    en: '② We never send your live location (GPS) to our server.',
    ja: '② 現在地（GPS）をサーバーに送信しません。',
    zh: '② 我们不会把您的当前位置（GPS）发送到服务器。',
  },
  'home.p2Body': {
    ko: '직접 선택한 병원·숙소 고정 기준점만 사용합니다.',
    en: 'We use only the fixed hospital or accommodation point you choose yourself.',
    ja: 'ご自身で選んだ病院・宿泊先の固定地点だけを使います。',
    zh: '只使用您自己选择的医院或住处的固定基准点。',
  },
  'home.p3Title': {
    ko: '③ 조건을 지킬 수 없으면 추천하지 않습니다.',
    en: '③ If the conditions cannot be met, we recommend nothing.',
    ja: '③ 条件を守れない場合は、おすすめしません。',
    zh: '③ 无法满足条件时，我们不做推荐。',
  },
  'home.p3Body': {
    ko: '추천이 없는 결과도 실패가 아니라 안전을 위한 정상 결과입니다.',
    en: 'An empty result is not a failure — it is the correct, safe answer.',
    ja: 'おすすめがない結果も失敗ではなく、安全を優先した正常な結果です。',
    zh: '没有推荐的结果并不是失败，而是以安全为先的正常结果。',
  },
  'home.footer': {
    ko: 'SafeHour는 의료진의 판단을 대체하지 않습니다. 몸 상태에 이상이 느껴지면 즉시 병원에 연락하세요. 관광정보 출처: ⓒ한국관광공사',
    en: 'SafeHour does not replace your medical team. If you feel unwell, contact your hospital immediately. Tourism data: ⓒKorea Tourism Organization',
    ja: 'SafeHourは医療スタッフの判断に代わるものではありません。体調に異変を感じたら、すぐに病院へ連絡してください。観光情報の出典：ⓒ韓国観光公社',
    zh: 'SafeHour 不能代替医护人员的判断。如感到身体不适，请立即联系医院。旅游信息来源：ⓒ韩国观光公社',
  },
};
