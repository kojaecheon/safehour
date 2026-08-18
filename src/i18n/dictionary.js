// SafeHour 화면 문구 사전 (AX-209)
//
// 규칙
//   - 모든 키는 ko·en 을 **동시에** 가진다. 한쪽만 채우는 것은 금지이며
//     `test/i18n.test.js` 가 누락을 실패로 잡는다.
//   - 안전 판정 문구(상태·사유)는 여기 두지 않는다. `src/domain/states.js` 의
//     STATE_MESSAGE·REASON_TEXT 가 정본이며, 화면이 다시 번역하지 않는다.
//   - TourAPI·기상청 **원문은 번역 대상이 아니다.** 원문은 그대로 두고 라벨만 번역한다.
//   - `{name}` 형태의 자리표시자는 t(key, vars) 로 치환한다.

export const UI_TEXT = {
  // ── 공통 ──
  'common.back': { ko: '뒤로 가기', en: 'Go back' },
  'common.confirm': { ko: '확인', en: 'OK' },
  'common.none': { ko: '없음', en: 'none' },
  'common.langToggle': { ko: 'Language — 한국어 선택됨', en: '언어 — English selected' },
  'common.minutesUnknown': { ko: '확인 불가', en: 'Unknown' },
  'common.minutes': { ko: '{n}분', en: '{n} min' },
  'common.hours': { ko: '{h}시간', en: '{h} h' },
  'common.hoursMinutes': { ko: '{h}시간 {m}분', en: '{h} h {m} min' },

  // ── 시작 화면 (SCR001) ──
  'home.titleLine1': { ko: '병원 조건 안에서만,', en: 'Only what your hospital' },
  'home.titleLine2': { ko: '안심 관광을 추천합니다', en: 'instructions allow' },
  'home.lead': {
    ko: '수술·시술 후 회복 중인 외국인 환자와 보호자를 위해, 병원이 정한 주의조건과 복귀시간을 지키는 활동만 골라 보여드립니다.',
    en: 'For international patients recovering from a procedure and their companions, we show only activities that fit the precautions and return time your hospital set.',
  },
  'home.principlesAria': { ko: 'SafeHour의 세 가지 원칙', en: 'Three principles of SafeHour' },
  'home.principlesTitle': { ko: '시작 전에 꼭 알아두세요', en: 'Before you start' },
  'home.p1Title': { ko: '① 의료 판단을 하지 않습니다.', en: '① We make no medical judgements.' },
  'home.p1Body': {
    ko: '증상 해석이나 외출 가능 여부 진단은 하지 않으며, 병원이 제공한 조건만 따릅니다.',
    en: 'We do not interpret symptoms or decide whether you may go out. We follow only the conditions your hospital gave you.',
  },
  'home.p2Title': {
    ko: '② 현재 위치(GPS)를 서버로 보내지 않습니다.',
    en: '② We never send your live location (GPS) to our server.',
  },
  'home.p2Body': {
    ko: '직접 선택한 병원·숙소 고정 기준점만 사용합니다.',
    en: 'We use only the fixed hospital or accommodation point you choose yourself.',
  },
  'home.p3Title': {
    ko: '③ 조건을 지킬 수 없으면 추천하지 않습니다.',
    en: '③ If the conditions cannot be met, we recommend nothing.',
  },
  'home.p3Body': {
    ko: '추천이 없는 결과도 실패가 아니라 안전을 위한 정상 결과입니다.',
    en: 'An empty result is not a failure — it is the correct, safe answer.',
  },
  'home.cta': { ko: '안심 코스 만들기', en: 'Plan a safe outing' },
  'home.clearedNotice': {
    ko: '이 기기에서 입력한 조건과 추천 결과를 지웠습니다.',
    en: 'Your entries and results have been deleted from this device.',
  },

  // ── 내 정보 지우기 (AX-210) ──
  'clear.cta': { ko: '이 기기에서 내 정보 지우기', en: 'Delete my data from this device' },
  'clear.note': {
    ko: '병원 조건과 판정 결과는 이 브라우저에만 남습니다. 서버에는 저장되지 않습니다.',
    en: 'Your hospital conditions and results stay in this browser only. Nothing is stored on our server.',
  },
  'clear.question': {
    ko: '입력한 조건과 추천 결과를 지울까요? 되돌릴 수 없습니다.',
    en: 'Delete your entries and results? This cannot be undone.',
  },
  'clear.confirm': { ko: '지우기', en: 'Delete' },
  'clear.cancel': { ko: '취소', en: 'Cancel' },

  // ── 로그인 (AX-219) ──
  'login.header': { ko: '로그인', en: 'Sign in' },
  'login.title': { ko: '회복 계획을 안전하게 불러오려면\n로그인이 필요합니다', en: 'Sign in to load your\nrecovery plan securely' },
  'login.lead': {
    ko: '로그인은 다음에 열었을 때 같은 계획을 다시 불러오기 위한 것입니다. 이름·이메일·프로필은 받지 않습니다.',
    en: 'Signing in only lets us load the same plan next time you open the app. We do not receive your name, email, or profile.',
  },
  'login.google': { ko: 'Google로 계속하기', en: 'Continue with Google' },
  'login.kakao': { ko: '카카오로 계속하기', en: 'Continue with Kakao' },
  'login.demo': { ko: '로그인 없이 둘러보기 (데모)', en: 'Explore without signing in (demo)' },
  'login.demoNote': {
    ko: '데모는 비식별 예시 계획으로 전체 흐름만 보여줍니다. 실제 병원 정보는 들어 있지 않습니다.',
    en: 'The demo shows the full flow with a de-identified sample plan. It contains no real hospital data.',
  },
  'login.notConfigured': { ko: '준비 중', en: 'Not available yet' },
  'login.hospitalNext': {
    ko: '병원 회복 계획 연결은 로그인 다음 단계입니다. 병원에서 받은 QR 또는 코드가 필요합니다.',
    en: 'Connecting your hospital recovery plan is the next step. You will need the QR code or code your hospital gave you.',
  },
  'login.notIdentityCheck': {
    ko: '로그인은 본인 확인이 아닙니다. 어느 환자의 계획인지는 병원이 발급한 코드로 확인합니다.',
    en: 'Signing in is not identity verification. Which patient a plan belongs to is confirmed by the code your hospital issues.',
  },
  'login.errorLabel': { ko: '로그인하지 못했습니다', en: 'Could not sign in' },
  'login.errCancelled': { ko: '로그인을 취소했습니다. 다시 시도해 주세요.', en: 'Sign-in was cancelled. Please try again.' },
  'login.errExpired': {
    ko: '시간이 지나 다시 시작해야 합니다. 다시 시도해 주세요.',
    en: 'The attempt timed out. Please try again.',
  },
  'login.errRetry': {
    ko: '문제가 생겨 로그인을 마치지 못했습니다. 다시 시도해 주세요.',
    en: 'Something went wrong before sign-in finished. Please try again.',
  },
  'login.errNotConfigured': {
    ko: '이 방식은 아직 연결되지 않았습니다. 다른 방식을 선택해 주세요.',
    en: 'This method is not connected yet. Please choose another.',
  },
  'login.signedIn': { ko: '로그인되어 있습니다', en: 'You are signed in' },
  'login.logout': { ko: '로그아웃', en: 'Sign out' },

  // ── 병원 연결 (AX-216) ──
  'link.header': { ko: '병원 연결', en: 'Connect hospital' },
  'link.title': { ko: '병원이 발행한\n회복 지침을 연결하세요', en: 'Connect the recovery plan\nyour hospital issued' },
  'link.lead': {
    ko: '병원에서 받은 QR 또는 코드를 입력하면 외출 조건과 안내를 그대로 가져옵니다. 직접 입력하지 않으셔도 됩니다.',
    en: 'Enter the QR or code from your hospital and we bring in the conditions and instructions exactly as issued. You do not type them yourself.',
  },
  'link.codeLabel': { ko: '연결 코드', en: 'Connection code' },
  'link.codePlaceholder': { ko: '예: DEMO-A', en: 'e.g. DEMO-A' },
  'link.submit': { ko: '회복 지침 연결', en: 'Connect plan' },
  'link.submitting': { ko: '연결하는 중입니다…', en: 'Connecting…' },
  'link.demoTitle': { ko: '연동 없이 둘러보기', en: 'Explore without a hospital' },
  'link.demoLead': {
    ko: '아래는 병원 연동을 흉내 낸 예시입니다. 실제 병원 정보가 아닙니다.',
    en: 'The samples below imitate a hospital connection. They are not real hospital data.',
  },
  'link.demoStandard': { ko: '예시 A — 외출 가능', en: 'Sample A — outing allowed' },
  'link.demoRestricted': { ko: '예시 B — 외출 제한', en: 'Sample B — outing restricted' },
  'link.demoExpired': { ko: '예시 C — 지침 만료', en: 'Sample C — plan expired' },
  'link.demoBadge': { ko: '병원 연동 데모', en: 'Hospital connection demo' },
  'link.errLabel': { ko: '연결하지 못했습니다', en: 'Could not connect' },
  'link.errRequired': { ko: '연결 코드를 입력해 주세요.', en: 'Please enter the connection code.' },
  'link.errUnknown': {
    ko: '이 코드로 연결된 회복 지침을 찾지 못했습니다. 병원에서 받은 코드를 확인해 주세요.',
    en: 'No recovery plan was found for this code. Please check the code your hospital gave you.',
  },
  'link.errInvalid': {
    ko: '회복 지침 형식이 올바르지 않아 연결하지 않았습니다. 병원에 문의해 주세요.',
    en: 'The recovery plan format was not valid, so it was not connected. Please contact your hospital.',
  },
  'link.errNetwork': { ko: '네트워크 오류로 연결하지 못했습니다.', en: 'A network error stopped the connection.' },
  'link.errLogin': { ko: '로그인 후 연결할 수 있습니다.', en: 'Please sign in before connecting.' },
  'link.connected': { ko: '연결됨 · {issuer}', en: 'Connected · {issuer}' },
  'link.expires': { ko: '유효기간 {at}', en: 'Valid until {at}' },
  'link.goToday': { ko: '오늘의 회복 상태 보기', en: 'See today’s status' },
  'link.disconnect': { ko: '연결 해제', en: 'Disconnect' },

  // ── 오늘의 회복 상태 (AX-217) ──
  'today.header': { ko: '오늘의 회복', en: 'Today' },
  'today.loading': { ko: '회복 상태를 확인하는 중입니다…', en: 'Checking your status…' },
  'today.notConnectedTitle': { ko: '연결된 병원 지침이 없습니다', en: 'No hospital plan is connected' },
  'today.notConnectedBody': {
    ko: '병원이 발행한 회복 지침이 있어야 외출 선택지를 계산할 수 있습니다.',
    en: 'We can only work out outing options once your hospital has issued a recovery plan.',
  },
  'today.notConnectedCta': { ko: '병원 연결하기', en: 'Connect hospital' },
  'today.verified': { ko: '병원 지침 확인됨 · {issuer}', en: 'Hospital plan verified · {issuer}' },
  'today.outingTitle': { ko: '오늘 외출', en: 'Going out today' },
  'today.deadline': { ko: '복귀 마감 {at}', en: 'Be back by {at}' },
  'today.deadlineReturnBy': { ko: '병원 복귀 시각 기준', en: 'set by your return time' },
  'today.deadlineMedication': { ko: '복약 시각이 더 이릅니다', en: 'your medication time comes first' },
  'today.deadlineVisit': { ko: '다음 진료가 더 이릅니다', en: 'your next appointment comes first' },
  'today.nextMed': { ko: '다음 복약 {at}', en: 'Next medication {at}' },
  'today.nextVisit': { ko: '다음 진료 {at}', en: 'Next appointment {at}' },
  'today.unconfirmed': {
    ko: '확인하지 않은 병원 안내가 {count}건 있습니다',
    en: '{count} hospital instruction(s) you have not reviewed',
  },
  'today.reviewCta': { ko: '병원 안내 확인하기', en: 'Review instructions' },
  'today.ctaOuting': { ko: '안전 외출 확인', en: 'Check a safe outing' },
  'today.ctaContact': { ko: '병원에 연락하세요', en: 'Contact your hospital' },
  'today.guideCta': { ko: '병원 회복 안내 전체 보기', en: 'See all hospital instructions' },

  // ── 외출 계획 확인 (AX-221) — 수기 입력 화면을 대체한다 ──
  'plan.header': { ko: '안전 외출', en: 'Safe outing' },
  'plan.callout': {
    ko: '아래 조건은 병원이 발행한 것입니다. SafeHour가 해석하거나 완화하지 않으며, 직접 고칠 수 없습니다.',
    en: 'The conditions below were issued by your hospital. SafeHour never interprets or relaxes them, and you cannot edit them.',
  },
  'plan.needPlanTitle': { ko: '병원 지침을 먼저 연결하세요', en: 'Connect your hospital plan first' },
  'plan.needPlanBody': {
    ko: '병원이 발행한 회복 지침 없이는 외출 선택지를 계산하지 않습니다.',
    en: 'Without a hospital-issued recovery plan we do not calculate outing options.',
  },
  'plan.needPlanCta': { ko: '병원 연결하기', en: 'Connect hospital' },
  'plan.blockedTitle': { ko: '지금은 외출을 계산하지 않습니다', en: 'We are not calculating outings right now' },
  'plan.blockedCta': { ko: '오늘의 회복 보기', en: 'See today’s status' },
  'plan.issuedBy': { ko: '발행 {issuer}', en: 'Issued by {issuer}' },
  'plan.conditionsTitle': { ko: '병원이 정한 조건', en: 'Conditions set by your hospital' },
  'plan.outingAllowed': { ko: '외출 허용', en: 'Going out allowed' },
  'plan.outingForbidden': { ko: '외출 제한', en: 'Going out restricted' },
  'plan.indoorOnly': { ko: '실내 활동만', en: 'Indoor only' },
  'plan.avoidUv': { ko: '자외선 회피', en: 'Avoid sun' },
  'plan.avoidHeat': { ko: '열 노출 회피', en: 'Avoid heat' },
  'plan.noWater': { ko: '수중 활동 금지', en: 'No water activities' },
  'plan.escortRequired': { ko: '동행 필수', en: 'Companion required' },
  'plan.foodRestricted': { ko: '식음 제한', en: 'Food and drink restricted' },
  'plan.walkLimit': { ko: '보행 {value} 이내', en: 'Walk within {value}' },
  'plan.travelLimit': { ko: '편도 이동 {value} 이내', en: 'One-way travel within {value}' },
  'plan.anchorTitle': { ko: '복귀 기준점', en: 'Return point' },
  'plan.deadlineTitle': { ko: '복귀 마감', en: 'Be back by' },
  'plan.rolesTitle': { ko: '지금 상황', en: 'Right now' },
  'plan.rolesHint': {
    ko: '병원 조건이 아니라 지금 상황입니다. 이것만 선택하시면 됩니다.',
    en: 'These are about your situation right now, not hospital conditions. This is all you choose.',
  },
  'plan.submit': { ko: '안전 판정으로 추천 받기', en: 'Run the safety check' },
  'plan.submitting': { ko: '조건에 맞는 활동을 찾고 있습니다…', en: 'Finding activities that fit your conditions…' },
  'plan.footer': {
    ko: '병원 조건은 판정 계산에만 쓰이며 서버에 저장되지 않습니다. 병원 안내문 원문은 서버로 전송되지 않습니다.',
    en: 'Hospital conditions are used only to calculate the result and are never stored on our server. The hospital’s own instructions are never sent to our server.',
  },

  // ── 병원 회복 안내 (AX-218) ──
  'guide.header': { ko: '병원 회복 안내', en: 'Hospital instructions' },
  'guide.lead': {
    ko: '병원이 작성한 안내를 그대로 보여드립니다. SafeHour가 요약하거나 바꾸지 않습니다.',
    en: 'These are your hospital’s own words, shown unchanged. SafeHour does not summarise or edit them.',
  },
  'guide.issuedBadge': { ko: '병원에서 제공한 안내', en: 'Issued by your hospital' },
  'guide.updatedAt': { ko: '{at} 발행', en: 'Issued {at}' },
  'guide.acknowledge': { ko: '확인했습니다', en: 'I have read this' },
  'guide.acknowledged': { ko: '확인 완료', en: 'Reviewed' },
  'guide.acknowledgeAll': { ko: '전체 확인 처리', en: 'Mark all as read' },
  'guide.critical': { ko: '확인 필요', en: 'Needs review' },
  'guide.criticalNote': {
    ko: '표시된 안내를 확인해야 외출 판정이 진행됩니다.',
    en: 'Outing checks stay on hold until you review the marked instructions.',
  },
  'guide.empty': { ko: '표시할 병원 안내가 없습니다.', en: 'There are no hospital instructions to show.' },
  'guide.catActivity': { ko: '활동·외출', en: 'Activity and outings' },
  'guide.catMedication': { ko: '복약', en: 'Medication' },
  'guide.catFood': { ko: '음식·음료', en: 'Food and drink' },
  'guide.catLifestyle': { ko: '생활 안내', en: 'Daily life' },
  'guide.catEscort': { ko: '동행', en: 'Companion' },
  'guide.catEmergency': { ko: '이상 상황 대응', en: 'If something goes wrong' },
  'guide.catVisit': { ko: '다음 진료', en: 'Next appointment' },

  // ── 개인정보·면책 고지 (AX-211) ──
  'privacy.link': { ko: '개인정보와 면책 안내', en: 'Privacy and disclaimer' },
  'privacy.header': { ko: '개인정보와 면책 안내', en: 'Privacy and disclaimer' },
  'privacy.intro': {
    ko: '이 화면은 SafeHour가 실제로 무엇을 받고, 어디에 남기고, 어디로 보내는지를 적은 것입니다. 코드에서 확인할 수 있는 사실만 담았습니다.',
    en: 'This page states what SafeHour actually asks for, where it is kept, and where it is sent. It contains only facts you can verify in the code.',
  },
  'privacy.contactTitle': { ko: '문의', en: 'Contact' },
  'privacy.contactBody': {
    ko: '이 서비스는 2026 관광데이터 활용 공모전 출품작으로 운영 중인 시연 서비스입니다. 개인정보 보호책임자와 문의 창구는 정식 운영으로 전환할 때 이 화면에 게시합니다. 그때까지 이 기기에 남은 정보는 아래 버튼으로 직접 지울 수 있습니다.',
    en: 'This is a demonstration service entered in the 2026 Tourism Data Utilisation Competition. A data protection officer and contact channel will be published here when the service goes into regular operation. Until then you can delete anything left on this device with the button below.',
  },
  'home.footer': {
    ko: 'SafeHour는 의료진의 판단을 대체하지 않습니다. 몸 상태에 이상이 느껴지면 즉시 병원에 연락하세요. 관광정보 출처: ⓒ한국관광공사',
    en: 'SafeHour does not replace your medical team. If you feel unwell, contact your hospital immediately. Tourism data: ⓒKorea Tourism Organization',
  },

  // ── 조건 입력 (SCR002–004) ──




  'plan.hasCompanion': { ko: '보호자가 함께 있습니다', en: 'A companion is with me' },
  'plan.patientResting': { ko: '환자는 지금 휴식이 필요합니다', en: 'The patient needs rest right now' },
  'plan.patientRestingSub': {
    ko: '보호자 분리 활동을 우선 검토합니다',
    en: 'We will look at companion-only options first',
  },
  'plan.splitAllowed': {
    ko: '병원이 보호자 분리 활동을 허용했습니다',
    en: 'The hospital allows the companion to go out separately',
  },
  'plan.splitAllowedSubOff': {
    ko: '보호자 동행 필수 조건이 켜져 있어 선택할 수 없습니다',
    en: 'Unavailable while "companion must accompany" is on',
  },
  'plan.splitAllowedSubOn': {
    ko: '병원 안내에 분리 허용이 있는 경우에만 켜세요',
    en: 'Turn on only if your hospital said so',
  },

  'plan.errLabel': { ko: '확인 필요', en: 'Please check' },
  'plan.errRecommend': { ko: '추천을 생성하지 못했습니다.', en: 'Could not generate recommendations.' },
  'plan.errNetwork': {
    ko: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    en: 'A network error occurred. Please try again shortly.',
  },

  // ── 결과 (SCR005) ──
  'result.header': { ko: '안심 코스', en: 'Your safe outing' },
  'result.backAria': { ko: '조건 입력으로 돌아가기', en: 'Back to conditions' },
  'result.loading': { ko: '결과를 불러오는 중입니다…', en: 'Loading your result…' },
  'result.emptyLabel': { ko: '결과 없음', en: 'No result' },
  'result.emptyTitle': { ko: '표시할 추천 결과가 없습니다', en: 'There is no result to show' },
  'result.emptyBody': { ko: '조건 입력부터 다시 시작해 주세요.', en: 'Please start again from the conditions.' },
  'result.emptyCta': { ko: '조건 입력으로 이동', en: 'Go to conditions' },
  'result.returnCta': { ko: '즉시 복귀 안내', en: 'Return now' },
  'result.returnInfoAria': { ko: '복귀 정보', en: 'Return information' },
  'result.returnDeadline': { ko: '복귀 마감', en: 'Be back by' },
  'result.latestDeparture': { ko: '늦어도 출발', en: 'Leave by' },
  'result.anchor': { ko: '기준점', en: 'Reference point' },
  'result.weatherUnsafe': {
    ko: '기상 실황: {reasons} — 실외 후보를 제외했습니다.',
    en: 'Current weather: {reasons} — outdoor options were excluded.',
  },
  'result.weatherUnknown': {
    ko: '기상 실황 확인 불가 — 기상은 이번 판정에 반영되지 않았습니다.',
    en: 'Weather could not be verified — it was not used in this decision.',
  },
  'result.weatherOk': {
    ko: '기상 실황 이상 없음 (기상청 {observedAt} 발표)',
    en: 'Weather is clear (KMA observation at {observedAt})',
  },
  'result.degradedEnglish': {
    ko: '영문 관광정보를 불러오지 못해 국문 정보로 표시합니다. ',
    en: 'English tourism data was unavailable, so Korean data is shown. ',
  },
  'result.degradedBarrierFree': {
    ko: '무장애 정보를 확인하지 못했습니다. ',
    en: 'Accessibility data could not be verified. ',
  },
  'result.degradedTail': {
    ko: '확인되지 않은 정보는 사실로 표시하지 않습니다.',
    en: 'We never present unverified information as fact.',
  },
  'result.courseAria': { ko: '추천 코스', en: 'Recommended outing' },
  'result.tabsAria': { ko: '환자·보호자 코스 전환', en: 'Switch between patient and companion' },
  'result.tabPatient': { ko: '환자 코스', en: 'Patient' },
  'result.tabCompanion': { ko: '보호자 코스', en: 'Companion' },
  'result.splitCallout': {
    ko: '지금은 환자 휴식이 우선입니다. 환자 코스 대신 보호자 근거리 코스를 확인하세요.',
    en: 'Rest comes first for the patient right now. Check the companion’s nearby options instead.',
  },
  'result.noCoursePatient': {
    ko: '환자에게는 지금 조건을 통과한 활동이 없습니다. 이것은 안전을 위한 정상 결과입니다.',
    en: 'No activity passed the conditions for the patient right now. This is the correct, safe result.',
  },
  'result.noCourseCompanion': {
    ko: '보호자에게는 지금 조건을 통과한 활동이 없습니다. 이것은 안전을 위한 정상 결과입니다.',
    en: 'No activity passed the conditions for the companion right now. This is the correct, safe result.',
  },
  'result.excludedSummary': { ko: '제외된 장소와 이유 ({count}곳)', en: 'Excluded places and why ({count})' },
  'result.excludedMore': { ko: '외 {count}곳', en: 'and {count} more' },
  'result.lastChange': { ko: '마지막 변화: {event}', en: 'Latest change: {event}' },
  'result.badgeChanged': { ko: '코스 변경됨', en: 'Outing changed' },
  'result.badgeKept': { ko: '코스 유지', en: 'Outing unchanged' },
  'result.recalcBusy': {
    ko: '코스를 처음부터 다시 판정하고 있습니다…',
    en: 'Re-checking your outing from the start…',
  },
  'result.recalcErrLabel': { ko: '재계산 실패', en: 'Re-check failed' },
  'result.recalcErrDefault': { ko: '재계산에 실패했습니다.', en: 'The re-check failed.' },
  'result.recalcErrNetwork': {
    ko: '네트워크 오류로 재계산하지 못했습니다. 기존 추천을 계속 신뢰하지 마세요.',
    en: 'A network error stopped the re-check. Do not rely on the previous recommendation.',
  },
  'result.footer': {
    ko: '관광정보 출처: ⓒ한국관광공사 · 기상정보 출처: ⓒ기상청. 이동시간은 경로 API 연결 전까지 보수적 추정값입니다. SafeHour는 의료진의 판단을 대체하지 않습니다.',
    en: 'Tourism data: ⓒKorea Tourism Organization · Weather: ⓒKorea Meteorological Administration. Travel times are conservative estimates until a routing API is connected. SafeHour does not replace your medical team.',
  },
  'result.sumState': { ko: '상태 {before} → {after}', en: 'Status {before} → {after}' },
  'result.sumRemoved': { ko: '제거 {names}', en: 'Removed {names}' },
  'result.sumAdded': { ko: '대체 투입 {names}', en: 'Added instead {names}' },
  'result.sumShortened': { ko: '체류 축소 {names}', en: 'Shortened stay {names}' },
  'result.sumKept': {
    ko: '조건과 복귀 SLA를 계속 충족해 코스가 유지됐습니다.',
    en: 'Conditions and the return deadline are still met, so the outing stands.',
  },

  // ── 상태 라벨 (배너 태그) ──
  'state.NO_TOURISM': { ko: '관광 미추천', en: 'No tourism' },
  'state.STANDBY': { ko: '대기', en: 'Stand by' },
  'state.SPLIT_NEARBY': { ko: '보호자 근거리', en: 'Companion nearby' },
  'state.TOGETHER': { ko: '동행 가능', en: 'Together' },

  // ── 변화 이벤트 ──
  'event.CLOSURE': { ko: '장소 휴무', en: 'Place closed' },
  'event.WEATHER': { ko: '기상 악화', en: 'Weather worsened' },
  'event.TRAFFIC_SURGE': { ko: '교통 지연', en: 'Traffic delay' },
  'event.APPOINTMENT': { ko: '진료시간 변경', en: 'Appointment moved' },
  'event.PATIENT_RECALL': { ko: '환자 호출', en: 'Patient recalled' },
  'event.RISK_SIGNAL': { ko: '위험신호 입력', en: 'Warning sign reported' },

  'eventPanel.title': { ko: '실시간 변화 시연', en: 'Simulate a real-time change' },
  'eventPanel.lead': {
    ko: '변화가 생기면 코스를 처음부터 다시 판정합니다. 알림만 띄우고 기존 코스를 유지하는 동작은 하지 않습니다.',
    en: 'When something changes we re-check the whole outing. We never just show a notice and keep the old plan.',
  },
  'eventPanel.CLOSURE': { ko: '1순위 장소 휴무', en: 'Top place closes' },
  'eventPanel.CLOSUREDesc': {
    ko: '지금 코스의 1순위 장소가 휴무가 됩니다.',
    en: 'The top place in your outing closes.',
  },
  'eventPanel.WEATHER': { ko: '기상 악화', en: 'Weather worsens' },
  'eventPanel.WEATHERDesc': { ko: '실외 활동이 부적합해집니다.', en: 'Outdoor activity becomes unsuitable.' },
  'eventPanel.TRAFFIC_SURGE': { ko: '교통 지연 +20분', en: 'Traffic delay +20 min' },
  'eventPanel.TRAFFIC_SURGEDesc': {
    ko: '이동시간에 보수 버퍼가 더해집니다.',
    en: 'A conservative buffer is added to travel time.',
  },
  'eventPanel.APPOINTMENT': { ko: '진료 1시간 앞당김', en: 'Appointment 1 hour earlier' },
  'eventPanel.APPOINTMENTDesc': {
    ko: '복귀 가능 시간이 줄어듭니다.',
    en: 'Your available time shrinks.',
  },
  'eventPanel.RISK_SIGNAL': { ko: '위험신호 입력', en: 'Report a warning sign' },
  'eventPanel.RISK_SIGNALDesc': {
    ko: '해석 없이 입력 사실만으로 추천을 중단합니다.',
    en: 'We stop recommending on the report alone, without interpreting it.',
  },
  'eventPanel.PATIENT_RECALL': { ko: '환자 호출', en: 'Patient recalled' },
  'eventPanel.PATIENT_RECALLDesc': {
    ko: '모든 추천을 무효화하고 즉시 복귀로 전환합니다.',
    en: 'All recommendations are voided and return mode begins.',
  },

  // ── 추천 카드 ──
  'card.rank': { ko: '{rank}순위', en: 'No. {rank}' },
  'card.langEn': { ko: '영문 정보', en: 'English source' },
  'card.langKo': { ko: '국문 정보', en: 'Korean source' },
  'card.needsTranslation': { ko: '번역 필요', en: 'Translation needed' },
  'card.travel': { ko: '이동 편도 {value}', en: 'One-way {value}' },
  'card.estimate': { ko: '추정', en: 'Estimate' },
  'card.stay': { ko: '체류 {value}', en: 'Stay {value}' },
  'card.shrunk': { ko: ' (축소됨)', en: ' (shortened)' },
  'card.slack': { ko: '복귀 여유 {value}', en: '{value} to spare' },
  'card.indoor': { ko: '실내', en: 'Indoor' },
  'card.outdoor': { ko: '실외', en: 'Outdoor' },
  'card.indoorUnknown': { ko: '실내 여부 확인 불가', en: 'Indoor status unknown' },
  'card.walk': { ko: '보행 약 {value}', en: 'Walk about {value}' },
  'card.detailCta': { ko: '추천 근거와 원문 보기', en: 'See why, and the source text' },

  // ── 즉시 복귀 시트 (SCR008) ──
  'return.title': { ko: '지금 복귀하세요', en: 'Return now' },
  'return.body': {
    ko: '아래 기준점으로 이동하세요. 몸 상태에 이상이 느껴지면 이동 전에 병원에 먼저 연락하세요.',
    en: 'Head to the point below. If you feel unwell, contact your hospital before moving.',
  },
  'return.coords': { ko: '좌표 {lat}, {lng}', en: 'Coordinates {lat}, {lng}' },
  'return.deadline': { ko: '복귀 마감 {time}', en: 'Be back by {time}' },
  'return.copyCta': {
    ko: '기준점 좌표 복사 (지도 앱에 붙여넣기)',
    en: 'Copy coordinates (paste into your map app)',
  },
  'return.copyOk': { ko: '좌표를 복사했습니다.', en: 'Coordinates copied.' },
  'return.copyFail': {
    ko: '복사에 실패했습니다. 위 좌표를 직접 확인해 주세요.',
    en: 'Copy failed. Please read the coordinates above.',
  },
  'return.note': {
    ko: '경로 안내 연결은 위치정보 검토 완료 후 제공됩니다. 긴급 상황이면 119 또는 병원에 바로 연락하세요.',
    en: 'Turn-by-turn directions will be added after our location-data review. In an emergency call 119 or your hospital immediately.',
  },

  // ── 변화 델타 시트 (SCR007) ──
  'delta.title': { ko: '{event} 발생', en: '{event}' },
  'delta.lead': {
    ko: '코스를 처음부터 다시 판정해 아래 결과를 이미 적용했습니다.',
    en: 'We re-checked the whole outing and already applied the result below.',
  },
  'delta.leadChanged': { ko: ' 변화 내용을 확인하세요.', en: ' Review what changed.' },
  'delta.leadKept': {
    ko: ' 기존 코스가 조건을 계속 충족합니다.',
    en: ' Your existing outing still meets the conditions.',
  },
  'delta.tagState': { ko: '상태 변경', en: 'Status change' },
  'delta.tagRemoved': { ko: '제거', en: 'Removed' },
  'delta.tagAdded': { ko: '대체 투입', en: 'Added instead' },
  'delta.tagShortened': { ko: '체류 축소', en: 'Stay shortened' },
  'delta.tagKept': { ko: '유지', en: 'Unchanged' },
  'delta.keptBody': {
    ko: '조건과 복귀 SLA를 계속 충족해 코스가 유지됩니다.',
    en: 'Conditions and the return deadline are still met, so the outing stands.',
  },

  // ── 장소 상세 (SCR006) ──
  'place.header': { ko: '장소 상세', en: 'Place details' },
  'place.backAria': { ko: '결과로 돌아가기', en: 'Back to results' },
  'place.backToResult': { ko: '결과로 돌아가기', en: 'Back to results' },
  'place.loading': { ko: '장소 정보를 불러오는 중입니다…', en: 'Loading place information…' },
  'place.loadingDetails': { ko: '관광 원문을 불러오는 중입니다…', en: 'Loading the source text…' },
  'place.notShownLabel': { ko: '표시할 수 없음', en: 'Cannot show' },
  'place.notShownTitle': { ko: '이 장소의 판정 결과가 없습니다', en: 'There is no decision for this place' },
  'place.notShownBody': {
    ko: '추천은 병원 조건과 복귀 시간을 기준으로 판정됩니다. 조건 없이 장소만 따로 보여드리지 않습니다.',
    en: 'Recommendations are decided from your hospital conditions and return time. We do not show places on their own.',
  },
  'place.notShownCta': { ko: '조건 입력으로 이동', en: 'Go to conditions' },
  'place.blockedTitle': { ko: '지금은 관광을 권하지 않습니다', en: 'Tourism is not recommended right now' },
  'place.blockedBody': {
    ko: '현재 판정에서는 이 장소를 포함해 어떤 관광도 추천하지 않습니다. 장소 정보 대신 복귀 안내를 확인해 주세요.',
    en: 'In the current decision no tourism is recommended, including this place. Please check the return guidance instead.',
  },
  'place.blockedCta': { ko: '결과 화면에서 복귀 안내 보기', en: 'See return guidance' },
  'place.detailErrLabel': { ko: '상세 정보 없음', en: 'No details' },
  'place.errDetail': { ko: '상세 정보를 불러오지 못했습니다.', en: 'Could not load the details.' },
  'place.errDetailNetwork': {
    ko: '네트워크 오류로 상세 정보를 불러오지 못했습니다.',
    en: 'A network error stopped the details from loading.',
  },
  'place.overviewTitle': { ko: '관광정보 원문', en: 'Source text' },
  'place.overviewEn': { ko: '영문', en: 'English' },
  'place.overviewKo': { ko: '국문 폴백', en: 'Korean fallback' },
  'place.source': { ko: '출처: ⓒ한국관광공사', en: 'Source: ⓒKorea Tourism Organization' },
  'place.scheduleTitle': { ko: '운영·휴무 정보', en: 'Opening and closing' },
  'place.scheduleNote': {
    ko: '운영시간 원문을 그대로 표시합니다. SafeHour는 현재 영업 여부를 판단하지 않으니 방문 전에 직접 확인하세요.',
    en: 'Opening hours are shown exactly as published. SafeHour does not decide whether a place is open now — please check before you go.',
  },
  'place.scheduleEmpty': {
    ko: '운영시간 정보가 제공되지 않았습니다. 현재 영업 여부는 확인이 필요합니다.',
    en: 'No opening hours were provided. Please verify whether it is open.',
  },
  'place.estimateTitle': { ko: 'SafeHour 추정값', en: 'SafeHour estimates' },
  'place.estimateNote': {
    ko: '아래 값은 관광정보 원문이 아니라 SafeHour가 조건 판정을 위해 계산한 값입니다.',
    en: 'These are not from the tourism source — SafeHour calculated them for the safety check.',
  },
  'place.estimateTravel': { ko: '기준점에서 편도 {value}', en: '{value} one-way from your point' },
  'place.estimateWalkHeuristic': { ko: ' (추정)', en: ' (estimated)' },
  'place.estimateStay': { ko: '권장 체류 {value}', en: 'Suggested stay {value}' },
  'place.accessTitle': { ko: '접근성 정보', en: 'Accessibility' },
  'place.accessBody': {
    ko: '한국관광공사 무장애 여행정보에 등록된 장소입니다. 세부 시설은 방문 전에 확인하세요.',
    en: 'Listed in the Korea Tourism Organization barrier-free dataset. Please check specific facilities before you go.',
  },
  'place.photosTitle': { ko: '사진', en: 'Photos' },
  'place.copyrightType1': { ko: '제1유형 (출처표시)', en: 'Type 1 (attribution)' },
  'place.copyrightType3': {
    ko: '제3유형 (출처표시-변경금지)',
    en: 'Type 3 (attribution, no derivatives)',
  },
  'place.copyrightUnknown': { ko: '저작권 구분 미제공', en: 'Copyright type not provided' },
  'place.copyrightOther': { ko: '저작권 구분 {code}', en: 'Copyright type {code}' },
  'place.partialErrors': {
    ko: '일부 상세 정보를 불러오지 못했습니다 ({count}건). 확인되지 않은 정보는 표시하지 않습니다.',
    en: 'Some details could not be loaded ({count}). We do not show unverified information.',
  },
  'place.footer': {
    ko: '관광정보 출처: ⓒ한국관광공사. SafeHour는 의료진의 판단을 대체하지 않습니다.',
    en: 'Tourism data: ⓒKorea Tourism Organization. SafeHour does not replace your medical team.',
  },

  // 운영정보 필드 라벨 — 값(원문)은 번역하지 않는다
  'schedule.usetime': { ko: '이용시간', en: 'Hours' },
  'schedule.opentime': { ko: '영업시간', en: 'Opening hours' },
  'schedule.restdate': { ko: '휴무일', en: 'Closed on' },
  'schedule.checkintime': { ko: '입실 시간', en: 'Check-in' },
  'schedule.checkouttime': { ko: '퇴실 시간', en: 'Check-out' },
  'schedule.eventstartdate': { ko: '행사 시작일', en: 'Event starts' },
  'schedule.eventenddate': { ko: '행사 종료일', en: 'Event ends' },
  'schedule.playtime': { ko: '공연 시간', en: 'Show times' },
  'schedule.starttime': { ko: '시작 시간', en: 'Start time' },
  'schedule.endtime': { ko: '종료 시간', en: 'End time' },
};

/** TourAPI 운영정보 필드 → 사전 키. 값(원문)은 번역 대상이 아니다. */
export const SCHEDULE_FIELD_KEY = {
  usetime: 'schedule.usetime',
  usetimeculture: 'schedule.usetime',
  usetimeleports: 'schedule.usetime',
  opentime: 'schedule.opentime',
  opentimefood: 'schedule.opentime',
  opentimeshopping: 'schedule.opentime',
  restdate: 'schedule.restdate',
  restdateculture: 'schedule.restdate',
  restdateleports: 'schedule.restdate',
  restdatefood: 'schedule.restdate',
  restdateshopping: 'schedule.restdate',
  checkintime: 'schedule.checkintime',
  checkouttime: 'schedule.checkouttime',
  eventstartdate: 'schedule.eventstartdate',
  eventenddate: 'schedule.eventenddate',
  playtime: 'schedule.playtime',
  starttime: 'schedule.starttime',
  endtime: 'schedule.endtime',
};
