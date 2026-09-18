// privacy 이름공간 — 개인정보·면책 고지(/privacy) (AX-303)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// 고지 본문(섹션 구조)은 `src/i18n/legal.js` 에 있고, 이 이름공간에 속한다.
// 고지 본문과 아래 safety 문구는 안전 문구다 — 화면에는 safetyPair() 규칙으로 보인다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  'privacy.link': {
    ko: '개인정보와 면책 안내',
    en: 'Privacy and disclaimer',
    ja: 'プライバシーと免責事項',
    zh: '隐私与免责声明',
  },
  'privacy.header': {
    ko: '개인정보와 면책 안내',
    en: 'Privacy and disclaimer',
    ja: 'プライバシーと免責事項',
    zh: '隐私与免责声明',
  },
  'privacy.contactTitle': { ko: '문의', en: 'Contact', ja: 'お問い合わせ', zh: '联系方式' },
};

/** 안전 문구 — 고지 */
export const safety = {
  'privacy.intro': {
    ko: '이 화면은 SafeHour가 실제로 무엇을 받고, 어디에 남기고, 어디로 보내는지를 적은 것입니다. 코드에서 확인할 수 있는 사실만 담았습니다.',
    en: 'This page states what SafeHour actually asks for, where it is kept, and where it is sent. It contains only facts you can verify in the code.',
    ja: 'この画面では、SafeHourが実際に何を受け取り、どこに残し、どこへ送るのかを記載しています。コードで確認できる事実だけを載せています。',
    zh: '本页说明 SafeHour 实际收集什么、保存在哪里、发送到哪里。只包含可以在代码中核实的事实。',
  },
  'privacy.contactBody': {
    ko: '이 서비스는 2026 관광데이터 활용 공모전 출품작으로 운영 중인 시연 서비스입니다. 개인정보 보호책임자와 문의 창구는 정식 운영으로 전환할 때 이 화면에 게시합니다. 그때까지 이 기기에 남은 정보는 아래 버튼으로 직접 지울 수 있습니다.',
    en: 'This is a demonstration service entered in the 2026 Tourism Data Utilisation Competition. A data protection officer and contact channel will be published here when the service goes into regular operation. Until then you can delete anything left on this device with the button below.',
    ja: 'このサービスは、2026 観光データ活用コンテストの出品作として運営しているデモサービスです。個人情報保護責任者と問い合わせ窓口は、正式運営に移行する際にこの画面に掲載します。それまでは、この端末に残っている情報を下のボタンでご自身で削除できます。',
    zh: '本服务是作为 2026 旅游数据应用大赛参赛作品运营的演示服务。个人信息保护负责人及联系渠道将在转为正式运营时公布在本页。在此之前，您可以通过下方按钮自行删除此设备上留存的信息。',
  },
};
