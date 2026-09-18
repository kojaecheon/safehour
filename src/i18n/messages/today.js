// today 이름공간 — 홈(/today): 오늘 상태·매일 확인·다음 일정·복귀 마감 (AX-303)
//
// 형식과 쓰기 규칙은 ./index.js 머리 주석을 따른다.
// ja·zh: 검수 전 번역 — 사람 검수 필요

/** 일반 화면 문구 */
export const messages = {
  'today.header': { ko: '오늘의 회복', en: 'Today', ja: '今日', zh: '今天' },
  'today.loading': {
    ko: '회복 상태를 확인하는 중입니다…',
    en: 'Checking your status…',
    ja: '回復状況を確認しています…',
    zh: '正在确认您的状态…',
  },
  'today.notConnectedTitle': {
    ko: '연결된 병원 지침이 없습니다',
    en: 'No hospital plan is connected',
    ja: '連携された病院のガイドがありません',
    zh: '尚未关联医院指引',
  },
  'today.notConnectedBody': {
    ko: '병원이 발행한 회복 지침이 있어야 외출 선택지를 계산할 수 있습니다.',
    en: 'We can only work out outing options once your hospital has issued a recovery plan.',
    ja: '病院が発行した回復ガイドがあってはじめて、外出の選択肢を計算できます。',
    zh: '只有在医院签发恢复指引后，才能计算外出选项。',
  },
  'today.notConnectedCta': { ko: '병원 연결하기', en: 'Connect hospital', ja: '病院と連携する', zh: '关联医院' },
  'today.verified': {
    ko: '병원 지침 확인됨 · {issuer}',
    en: 'Hospital plan verified · {issuer}',
    ja: '病院のガイドを確認済み · {issuer}',
    zh: '已核实医院指引 · {issuer}',
  },
  'today.outingTitle': { ko: '오늘 외출', en: 'Going out today', ja: '今日の外出', zh: '今天外出' },
  'today.deadline': { ko: '복귀 마감 {at}', en: 'Be back by {at}', ja: '帰着期限 {at}', zh: '返回截止 {at}' },
  'today.deadlineReturnBy': {
    ko: '병원 복귀 시각 기준',
    en: 'set by your return time',
    ja: '帰着時刻に基づく',
    zh: '依据返回时间',
  },
  'today.deadlineMedication': {
    ko: '복약 시각이 더 이릅니다',
    en: 'your medication time comes first',
    ja: '服薬時刻のほうが早いため',
    zh: '用药时间更早',
  },
  'today.deadlineVisit': {
    ko: '다음 진료가 더 이릅니다',
    en: 'your next appointment comes first',
    ja: '次の診察のほうが早いため',
    zh: '下次就诊时间更早',
  },
  'today.nextMed': { ko: '다음 복약 {at}', en: 'Next medication {at}', ja: '次の服薬 {at}', zh: '下次用药 {at}' },
  'today.nextVisit': {
    ko: '다음 진료 {at}',
    en: 'Next appointment {at}',
    ja: '次の診察 {at}',
    zh: '下次就诊 {at}',
  },
  'today.unconfirmed': {
    ko: '확인하지 않은 병원 안내가 {count}건 있습니다',
    en: '{count} hospital instruction(s) you have not reviewed',
    ja: '未確認の病院の案内が{count}件あります',
    zh: '有 {count} 条医院指引尚未确认',
  },
  'today.reviewCta': {
    ko: '병원 안내 확인하기',
    en: 'Review instructions',
    ja: '病院の案内を確認する',
    zh: '查看医院指引',
  },
  'today.ctaOuting': {
    ko: '안전 외출 확인',
    en: 'Check a safe outing',
    ja: '外出コースを確認',
    zh: '查看外出路线',
  },
  'today.ctaContact': {
    ko: '병원에 연락하세요',
    en: 'Contact your hospital',
    ja: '病院に連絡してください',
    zh: '请联系医院',
  },
  'today.guideCta': {
    ko: '병원 회복 안내 전체 보기',
    en: 'See all hospital instructions',
    ja: '病院の回復案内をすべて見る',
    zh: '查看全部医院恢复指引',
  },
};

/** 안전 문구 */
export const safety = {};
