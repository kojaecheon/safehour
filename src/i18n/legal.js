// 개인정보·면책 고지 본문 (AX-211)
//
// 이 문서의 모든 문장은 **코드에서 확인 가능한 사실**이어야 한다.
// "노력합니다", "최선을 다합니다" 같은 다짐은 쓰지 않는다 — 검증할 수 없기 때문이다.
// 사실이 바뀌면(저장 위치·전송 대상·보관 기간) 이 파일을 코드와 같은 PR 에서 고친다.
//
// 사람 승인이 필요한 항목(개인정보 보호책임자, 분쟁 관할, 보유기간 정책 확정)은
// `docs/SIGNOFF_CHECKLIST.md` 2·4절과 AX-104 에서 다룬다. 여기서는 **현재 사실**만 적는다.

export const LEGAL_SECTIONS = [
  {
    id: 'summary',
    title: { ko: '한 줄 요약', en: 'In one line' },
    lead: {
      ko: 'SafeHour는 이름·연락처·진단명·증상을 받지 않고, 현재 위치(GPS)를 쓰지 않으며, 입력한 조건을 서버에 저장하지 않습니다.',
      en: 'SafeHour does not ask for your name, contact details, diagnosis, or symptoms; it never uses your live location (GPS); and it does not store your entries on our server.',
    },
  },
  {
    id: 'collect',
    title: { ko: '무엇을 받나요', en: 'What we ask for' },
    lead: {
      ko: '추천을 계산하는 데 필요한 최소 항목만 받습니다.',
      en: 'Only the minimum needed to calculate a recommendation.',
    },
    items: [
      {
        ko: '병원이 정한 주의조건 — 금식·외출 허용·동행 필수·자외선 회피·실내 한정 여부와 보행·이동 시간 한도 (예/아니오와 숫자)',
        en: 'The precautions your hospital set — fasting, whether going out is allowed, required escort, sun avoidance, indoor-only, and walking/travel limits (yes/no and numbers)',
      },
      {
        ko: '병원 복귀 시각과 그 조건을 받은 시각',
        en: 'Your return time, and when you received those instructions',
      },
      {
        ko: '직접 선택한 병원·숙소 기준점 좌표와 이름',
        en: 'The hospital or accommodation point you choose yourself — its coordinates and the name you type',
      },
      {
        ko: '동행 상황 — 보호자 유무, 환자 휴식 필요 여부, 분리 활동 허용 여부',
        en: 'Who is with you — whether a companion is present, whether the patient needs rest, and whether separate activity is allowed',
      },
    ],
  },
  {
    id: 'never',
    title: { ko: '무엇을 받지 않나요', en: 'What we never ask for' },
    items: [
      { ko: '이름, 연락처, 이메일, 생년월일', en: 'Name, phone number, email, date of birth' },
      { ko: '진단명, 시술·수술 종류, 증상 서술', en: 'Diagnosis, type of procedure, description of symptoms' },
      {
        ko: '병원 안내문 원문 (사진·텍스트 어느 형태로도 수집하지 않습니다)',
        en: 'The hospital document itself — neither as a photo nor as text',
      },
      {
        ko: '현재 위치(GPS). 브라우저 수준에서도 차단되어 있어 코드 실수로도 요구할 수 없습니다.',
        en: 'Your live location (GPS). It is blocked at the browser level, so it cannot be requested even by mistake.',
      },
    ],
  },
  {
    id: 'account',
    title: { ko: '로그인은 무엇을 가져가나요', en: 'What signing in gives us' },
    lead: {
      ko: 'Google 또는 카카오로 로그인하면 그 서비스가 발급한 계정 식별자 하나만 받습니다. 다음에 열었을 때 같은 회복 계획을 불러오기 위한 것입니다.',
      en: 'When you sign in with Google or Kakao we receive one account identifier issued by that service — just enough to load the same recovery plan next time.',
    },
    items: [
      {
        ko: '이름·이메일·프로필 사진을 요청하지 않습니다. 로그인 화면에서 이 항목들에 동의할 필요가 없습니다.',
        en: 'We do not request your name, email, or profile picture. You will not be asked to consent to them.',
      },
      {
        ko: '로그인 토큰은 저장하지 않습니다. 식별자를 확인한 즉시 버립니다.',
        en: 'We do not keep the sign-in tokens. They are discarded as soon as the identifier is read.',
      },
      {
        ko: '로그인 상태는 이 브라우저의 서명된 쿠키에만 있습니다. 서버에 회원 데이터베이스가 없습니다.',
        en: 'Your signed-in state lives only in a signed cookie in this browser. There is no member database on our server.',
      },
      {
        ko: '로그인은 본인 확인이 아닙니다. 어느 환자의 계획인지는 병원이 발급한 코드로 확인합니다.',
        en: 'Signing in is not identity verification. Which patient a plan belongs to is confirmed by the code your hospital issues.',
      },
      {
        ko: '"이 기기에서 내 정보 지우기" 를 누르면 로그아웃까지 함께 처리됩니다.',
        en: 'Using "Delete my data from this device" signs you out as well.',
      },
    ],
  },
  {
    id: 'store',
    title: { ko: '어디에 남나요', en: 'Where it is kept' },
    lead: {
      ko: '입력한 조건과 판정 결과는 이 브라우저 탭 안에만 남습니다. 서버는 판정을 계산해 응답만 돌려주고 아무것도 저장하지 않습니다.',
      en: 'Your entries and results stay inside this browser tab. Our server calculates the result, returns it, and stores nothing.',
    },
    items: [
      {
        ko: '브라우저 탭을 닫으면 사라집니다.',
        en: 'They disappear when you close the browser tab.',
      },
      {
        ko: '"이 기기에서 내 정보 지우기" 로 언제든 즉시 지울 수 있습니다. 로그인 쿠키도 함께 지워집니다.',
        en: 'You can delete them at any time with "Delete my data from this device". The sign-in cookie is removed too.',
      },
      {
        ko: '서버 기록에는 어느 공공 API 를 몇 번 불렀는지와 응답 성공 여부만 남고, 입력한 조건은 남지 않습니다.',
        en: 'Server logs record only which public API was called, how often, and whether it succeeded — not your entries.',
      },
    ],
  },
  {
    id: 'third-party',
    title: { ko: '어디로 전달되나요', en: 'Who else receives it' },
    lead: {
      ko: '선택한 기준점 좌표는 주변 장소와 날씨를 조회하기 위해 다음 공공 API 로 전달됩니다. 조건·복귀시각·동행 정보는 전달되지 않습니다.',
      en: 'The coordinates of the point you chose are sent to the public APIs below to look up nearby places and weather. Your conditions, return time, and companion details are not sent.',
    },
    items: [
      { ko: '한국관광공사 — 국문·영문·무장애 관광정보', en: 'Korea Tourism Organization — Korean, English, and barrier-free tourism data' },
      { ko: '기상청 — 초단기 실황', en: 'Korea Meteorological Administration — current weather observation' },
    ],
    note: {
      ko: '지도·경로 안내 서비스는 연결되어 있지 않습니다. 위치정보 검토가 끝나기 전까지 좌표를 다른 곳으로 보내지 않습니다.',
      en: 'No map or routing service is connected. We do not send coordinates anywhere else until our location-data review is complete.',
    },
  },
  {
    id: 'medical',
    title: { ko: '의료 판단이 아닙니다', en: 'This is not medical advice' },
    lead: {
      ko: 'SafeHour는 증상이나 회복 단계를 해석하지 않습니다. 병원이 알려준 조건을 그대로 적용해 갈 수 있는 곳과 갈 수 없는 곳을 계산할 뿐이며, 의료진의 판단을 대체하지 않습니다.',
      en: 'SafeHour does not interpret symptoms or recovery stages. It applies the conditions your hospital gave you to work out where you can and cannot go. It does not replace your medical team.',
    },
    items: [
      {
        ko: '몸 상태에 이상이 느껴지면 앱을 보지 말고 병원에 먼저 연락하세요. 응급 상황은 119 입니다.',
        en: 'If you feel unwell, contact your hospital before checking the app. In an emergency call 119.',
      },
      {
        ko: '이동시간은 경로 안내 서비스가 아니라 보수적인 직선거리 추정값입니다. "추정" 표시가 붙은 값은 실제와 다를 수 있습니다.',
        en: 'Travel times are conservative straight-line estimates, not routing results. Values marked "Estimate" may differ from reality.',
      },
      {
        ko: '장소의 운영시간은 공공 데이터 원문 그대로 보여줍니다. 현재 영업 여부는 판단하지 않으니 방문 전에 직접 확인하세요.',
        en: 'Opening hours are shown exactly as published in public data. We do not decide whether a place is open now — please check before you go.',
      },
      {
        ko: '병원이나 의료기관을 추천·알선하지 않습니다. 순위·평점·제휴 기능이 없습니다.',
        en: 'We do not recommend or broker hospitals or clinics. There are no rankings, ratings, or partnerships.',
      },
    ],
  },
  {
    id: 'sources',
    title: { ko: '데이터 출처', en: 'Data sources' },
    items: [
      { ko: '관광정보 출처: ⓒ한국관광공사', en: 'Tourism data: ⓒKorea Tourism Organization' },
      { ko: '기상정보 출처: ⓒ기상청', en: 'Weather data: ⓒKorea Meteorological Administration' },
      {
        ko: '사진은 내려받지 않고 원본 주소를 그대로 참조하며, 저작권 구분을 함께 표시합니다.',
        en: 'Photos are referenced at their original address rather than downloaded, and their copyright type is shown alongside.',
      },
    ],
  },
];
