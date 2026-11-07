// notifications 이름공간 — 기기 알림·앱 안 배너 문구 (조건·병원·복약 정보를 넣지 않는다) (AX-303 · AX-319)
//
// 언어 기반 작업이 미리 만든 빈 이름공간이다. 해당 화면 작업이 이 파일만 채운다.
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다. 새 키는 `notifications.` 으로 시작한다.
// ja·zh: 검수 전 번역 — 사람 검수 필요
//
// ── 잠금 화면에 그대로 보이는 문구다 (docs/business-rules.md '알림과 카드', lib/notify/AGENTS.md) ──
//   - 조건 항목(보행·식이·자외선 …), 병원(이름·'병원'이라는 말 포함), 복약(약·복용 …)을 쓰지 않는다.
//     복약 알림도 '숙소에서 챙길 일정' 처럼 일반 표현으로만 적는다.
//   - 본문 자리표시자는 {time}("HH:MM") 하나뿐이다. 장소 이름·주소·병원 이름을 넣을 자리를 만들지 않는다.
//   - test/notify-schedule.test.js 가 4개 언어의 금지어와 자리표시자를 검사한다.

/** 일반 화면 문구 — 'notifications.키': { ko, en, ja, zh } */
export const messages = {
  /** 기기 알림 제목·배너 머리글 */
  'notifications.title': {
    ko: 'SafeHour 알림',
    en: 'SafeHour reminder',
    ja: 'SafeHour のお知らせ',
    zh: 'SafeHour 提醒',
  },
  'notifications.dismiss': {
    ko: '닫기',
    en: 'Dismiss',
    ja: '閉じる',
    zh: '关闭',
  },
  'notifications.openToday': {
    ko: '오늘 일정 보기',
    en: "See today's plan",
    ja: '今日の予定を見る',
    zh: '查看今天的行程',
  },
  /** 보호자 알림을 눌렀을 때 열리는 화면 안내 */
  'notifications.openGuardianCopy': {
    ko: '받은 일정 보기',
    en: 'See the shared plan',
    ja: '受け取った予定を見る',
    zh: '查看收到的行程',
  },
};

/**
 * 안전 문구 — 복귀·출발 안내 문장. 화면에서는 safetyPair() 규칙으로 보인다
 * (ja·zh 는 검수 스위치가 켜지기 전까지 영어로 나간다).
 */
export const safety = {
  /** 외출 복귀 마감 — 숙소로 돌아오는 외출 (60·30분 전) */
  'notifications.returnLodging': {
    ko: '{time}까지 숙소로 돌아갈 시간이에요',
    en: 'Time to head back to your lodging by {time}',
    ja: '{time}までに宿泊先へ戻る時間です',
    zh: '请在{time}前返回住处',
  },
  /** 외출 복귀 마감 — 숙소가 아닌 곳으로 돌아가는 외출. 장소 이름·종류를 적지 않는다 */
  'notifications.returnOther': {
    ko: '{time}까지 정해 둔 장소로 돌아갈 시간이에요',
    en: 'Time to head back to your planned place by {time}',
    ja: '{time}までに予定の場所へ戻る時間です',
    zh: '请在{time}前返回预定地点',
  },
  /** 숙소에서 출발해야 하는 시각 15분 전. 가는 곳을 적지 않는다 */
  'notifications.leaveLodging': {
    ko: '{time}에 숙소에서 출발할 준비를 하세요',
    en: 'Get ready to leave your lodging at {time}',
    ja: '{time}に宿泊先を出発する準備をしてください',
    zh: '请准备在{time}从住处出发',
  },
  /** 숙소에서 할 일 10분 전 — 무엇인지 적지 않는다 */
  'notifications.atLodging': {
    ko: '{time}에 숙소에서 챙길 일정이 있어요',
    en: 'You have something scheduled at your lodging at {time}',
    ja: '{time}に宿泊先での予定があります',
    zh: '{time}在住处有一项安排',
  },
  /** 그 시각에 챙길 일 — 무엇인지 적지 않는다 */
  'notifications.scheduledNow': {
    ko: '{time} — 지금 챙길 일정이 있어요',
    en: "It's {time} — you have something scheduled now",
    ja: '{time}になりました — 予定の時間です',
    zh: '现在是{time} — 您有一项安排',
  },
  /** 환자 외출의 복귀 마감이 지남. 마감 뒤 60분까지 낸다 */
  'notifications.returnPassed': {
    ko: '{time} 복귀 마감이 지났어요. 아직 밖이라면 지금 돌아가세요',
    en: 'Your {time} return time has passed. If you are still out, head back now',
    ja: '{time}の戻り期限を過ぎました。まだ外出中なら、今すぐ戻ってください',
    zh: '{time}的返回截止时间已过。如果你还在外面，请立即返回',
  },
  /** 보호자 기기: 일행의 복귀 마감이 지남. 함께 있는지 알 수 없으므로 조건부로 쓴다 */
  'notifications.companionReturnPassed': {
    ko: '일행의 복귀 마감 {time}이 지났어요. 함께 있지 않다면 지금 연락해 보세요',
    en: "Your companion's {time} return time has passed. If you're not together, contact them now",
    ja: 'お連れの方の戻り期限{time}を過ぎました。一緒にいない場合は、今すぐ連絡してみてください',
    zh: '同伴的返回截止时间{time}已过。如果你们不在一起，请立即联系对方',
  },
};
