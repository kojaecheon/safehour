// SafeHour 4상태 정의
//
// 중요: 상태는 사용자의 "회복 정도"를 의료적으로 평가한 결과가 아니다.
// 병원이 입력한 조건·일정·역할·데이터 신뢰와 복귀 SLA를 조합한 서비스 운영 결과다.

export const STATE = {
  /** 관광 추천 없음. 병원 연락/119/숙소 대기 안내만 제공. — 실패가 아니라 정상 결과 */
  NO_TOURISM: 'NO_TOURISM',
  /** 진료 대기·지연·시간창 부족·데이터 신뢰 부족 → 대기 및 짧은 후속 확인 */
  STANDBY: 'STANDBY',
  /** 환자는 휴식, 보호자만 근거리 활동 + 원터치 복귀 */
  SPLIT_NEARBY: 'SPLIT_NEARBY',
  /** 병원 허용 + 필수동행 충족 + 두 사용자 SLA 충족 → 공동 초단거리·저부담 */
  TOGETHER: 'TOGETHER',
};

/** 보수적 순서 (앞이 더 보수적) — 상태 강등 판단에 사용 */
export const STATE_ORDER = [
  STATE.NO_TOURISM,
  STATE.STANDBY,
  STATE.SPLIT_NEARBY,
  STATE.TOGETHER,
];

export function isMoreConservative(a, b) {
  return STATE_ORDER.indexOf(a) < STATE_ORDER.indexOf(b);
}

/** 두 상태 중 더 보수적인 것을 반환 */
export function mostConservative(...states) {
  return states.reduce((acc, s) => (isMoreConservative(s, acc) ? s : acc), STATE.TOGETHER);
}

/**
 * 사용자에게 반드시 보여야 하는 상태 설명 — 안전 문구다.
 * 화면은 src/i18n 의 safetyPair() 규칙으로 두 언어를 함께 보여준다 (spec 4.17).
 * ja·zh: 검수 전 번역 — 사람 검수 필요 (검수 스위치가 켜지기 전까지 화면에는 영어로 대체된다)
 */
export const STATE_MESSAGE = {
  [STATE.NO_TOURISM]: {
    ko: '지금은 관광을 권하지 않습니다',
    en: 'Tourism is not recommended right now',
    ja: '現在は観光をおすすめしていません',
    zh: '目前不建议观光',
    action: {
      ko: '병원 연락 또는 숙소 대기',
      en: 'Contact hospital or rest at accommodation',
      ja: '病院に連絡するか、宿泊先で待機してください',
      zh: '请联系医院或在住处等候',
    },
  },
  [STATE.STANDBY]: {
    ko: '대기가 필요합니다',
    en: 'Please stand by',
    ja: '待機が必要です',
    zh: '需要等待',
    action: {
      ko: '병원 인근 대기 후 재확인',
      en: 'Wait near hospital and re-check',
      ja: '病院の近くで待機し、あとで再確認してください',
      zh: '请在医院附近等候，稍后再次确认',
    },
  },
  [STATE.SPLIT_NEARBY]: {
    ko: '보호자만 근거리 활동이 가능합니다',
    en: 'Companion may take a nearby activity',
    ja: '同行者のみ近場での活動ができます',
    zh: '仅陪同者可在附近活动',
    action: {
      ko: '환자는 휴식, 보호자는 원터치 복귀 준비',
      en: 'Patient rests, companion keeps one-tap return',
      ja: '患者さんは休息し、同行者はワンタップで戻れるよう準備してください',
      zh: '患者休息，陪同者做好一键返回的准备',
    },
  },
  [STATE.TOGETHER]: {
    ko: '함께 짧은 활동이 가능합니다',
    en: 'A short activity together is possible',
    ja: '一緒に短い活動ができます',
    zh: '可以一起进行短时活动',
    action: {
      ko: '저부담 코스 확인',
      en: 'Review the low-intensity course',
      ja: '負担の少ないコースを確認してください',
      zh: '请查看低负担路线',
    },
  },
};

/** 상태 전이 사유 코드 — 사용자에게 "왜 바뀌었는지" 설명하기 위함 */
export const REASON = {
  NO_HOSPITAL_CONDITION: 'NO_HOSPITAL_CONDITION',
  STALE_HOSPITAL_CONDITION: 'STALE_HOSPITAL_CONDITION',
  CONFLICTING_CONDITION: 'CONFLICTING_CONDITION',
  RISK_SIGNAL: 'RISK_SIGNAL',
  FASTING_REQUIRED: 'FASTING_REQUIRED',
  OUTING_FORBIDDEN: 'OUTING_FORBIDDEN',
  ESCORT_REQUIRED: 'ESCORT_REQUIRED',
  SLA_INSUFFICIENT: 'SLA_INSUFFICIENT',
  DEPARTURE_WINDOW_TOO_SHORT: 'DEPARTURE_WINDOW_TOO_SHORT',
  APPOINTMENT_DELAYED: 'APPOINTMENT_DELAYED',
  WEATHER_BLOCKED: 'WEATHER_BLOCKED',
  UV_EXPOSURE: 'UV_EXPOSURE',
  INDOOR_ONLY_REQUIRED: 'INDOOR_ONLY_REQUIRED',
  WALK_LIMIT_EXCEEDED: 'WALK_LIMIT_EXCEEDED',
  TRAVEL_LIMIT_EXCEEDED: 'TRAVEL_LIMIT_EXCEEDED',
  CONGESTION_HIGH: 'CONGESTION_HIGH',
  CLOSED: 'CLOSED',
  DATA_UNRELIABLE: 'DATA_UNRELIABLE',
  PATIENT_RECALLED: 'PATIENT_RECALLED',
  NON_TOURISM_ACTIVITY: 'NON_TOURISM_ACTIVITY',
  NO_CANDIDATE: 'NO_CANDIDATE',
  /** 운영자가 추천을 전면 중단시킨 상태 (kill switch) */
  SERVICE_PAUSED: 'SERVICE_PAUSED',

  // ── 병원 회복 지침 연결 게이트 (AX-215) ──
  /** 연결된 병원 계획이 없다 */
  NO_HOSPITAL_PLAN: 'NO_HOSPITAL_PLAN',
  /** 계획 유효기간이 지났다 */
  PLAN_EXPIRED: 'PLAN_EXPIRED',
  /** 병원이 계획을 철회했다 */
  PLAN_REVOKED: 'PLAN_REVOKED',
  /** 확인하지 않은 중요 변경이 있다 — 확인해야 판정이 풀린다 */
  PLAN_UNCONFIRMED_UPDATE: 'PLAN_UNCONFIRMED_UPDATE',
  /** 복약 시각이 외출 창을 자른다 */
  MEDICATION_WINDOW: 'MEDICATION_WINDOW',

  // ── 체류 동반 플랫폼 (AX-302 · spec 5.2 새 사유 코드) ──
  /** 입국일 시작 전·출국일 마감 후라 일정을 만들지 않는다 */
  OUTSIDE_STAY_WINDOW: 'OUTSIDE_STAY_WINDOW',
  /** 그 날짜의 숙소가 없다 */
  LODGING_REQUIRED: 'LODGING_REQUIRED',
  /** 경계일 이후인데 적용되는 조건 기간이 없다 */
  CONDITION_INPUT_REQUIRED: 'CONDITION_INPUT_REQUIRED',
  /** 민감정보 동의가 없다 */
  SENSITIVE_CONSENT_REQUIRED: 'SENSITIVE_CONSENT_REQUIRED',
  /** 연동 지침이 만료된 날짜다 — 새 지침 또는 본인 체크가 필요하다 */
  HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED: 'HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED',
  /** 오늘 매일 확인을 아직 하지 않았다 */
  DAILY_CHECK_PENDING: 'DAILY_CHECK_PENDING',
  /** 열 노출(사우나·찜질 등) 단서가 있는 장소 */
  HEAT_EXPOSURE: 'HEAT_EXPOSURE',
  /** 물에 들어가는 활동(수영장·온천 등) 단서가 있는 장소 */
  WATER_ACTIVITY: 'WATER_ACTIVITY',
  /** 식이 항목에 걸리는 식당 (추정) */
  DIET_RESTRICTED: 'DIET_RESTRICTED',
  /** 식이 판단에 쓸 메뉴 단서가 없는 식당 */
  MENU_UNKNOWN: 'MENU_UNKNOWN',
};

/**
 * 사유 문구 — 안전 문구다. 화면은 src/i18n 의 safetyPair() 규칙으로 보여준다 (spec 4.17).
 * 4개 언어를 모두 가진다. 새 사유 코드는 도메인 작업이 추가하고 문구는 언어 작업이 채운다.
 * ja·zh: 검수 전 번역 — 사람 검수 필요 (검수 스위치가 켜지기 전까지 화면에는 영어로 대체된다)
 */
export const REASON_TEXT = {
  [REASON.NO_HOSPITAL_CONDITION]: {
    ko: '병원 주의조건이 입력되지 않았습니다',
    en: 'Hospital conditions not provided',
    ja: '病院の注意条件が入力されていません',
    zh: '尚未输入医院注意条件',
  },
  [REASON.STALE_HOSPITAL_CONDITION]: {
    ko: '병원 주의조건이 최신이 아닙니다',
    en: 'Hospital conditions are outdated',
    ja: '病院の注意条件が最新ではありません',
    zh: '医院注意条件不是最新的',
  },
  [REASON.CONFLICTING_CONDITION]: {
    ko: '병원 조건이 서로 상충합니다',
    en: 'Hospital conditions conflict',
    ja: '病院の条件が互いに矛盾しています',
    zh: '医院条件相互矛盾',
  },
  [REASON.RISK_SIGNAL]: {
    ko: '주의가 필요한 상태가 입력되었습니다',
    en: 'A condition requiring attention was reported',
    ja: '注意が必要な状態が入力されました',
    zh: '已报告需要注意的状况',
  },
  [REASON.FASTING_REQUIRED]: {
    ko: '금식 중이라 식음 활동을 제외했습니다',
    en: 'Fasting — food activities excluded',
    ja: '絶食中のため、飲食を伴う活動を除外しました',
    zh: '正在禁食，已排除饮食类活动',
  },
  [REASON.OUTING_FORBIDDEN]: {
    ko: '병원이 외출을 제한했습니다',
    en: 'Hospital restricted outings',
    ja: '病院が外出を制限しています',
    zh: '医院限制外出',
  },
  [REASON.ESCORT_REQUIRED]: {
    ko: '필수 동행 조건을 충족하지 못했습니다',
    en: 'Required escort not available',
    ja: '同行必須の条件を満たしていません',
    zh: '未满足必须有人陪同的条件',
  },
  [REASON.SLA_INSUFFICIENT]: {
    ko: '복귀 시간이 부족합니다',
    en: 'Not enough time to return',
    ja: '帰着までの時間が足りません',
    zh: '返回时间不足',
  },
  [REASON.DEPARTURE_WINDOW_TOO_SHORT]: {
    ko: '출발 가능 시간이 부족합니다',
    en: 'Departure window too short',
    ja: '出発できる時間が足りません',
    zh: '可出发的时间不足',
  },
  [REASON.APPOINTMENT_DELAYED]: {
    ko: '진료 시간이 변경되었습니다',
    en: 'Appointment time changed',
    ja: '診察時間が変更されました',
    zh: '就诊时间已变更',
  },
  [REASON.WEATHER_BLOCKED]: {
    ko: '기상 조건으로 실외 활동을 제외했습니다',
    en: 'Outdoor activities excluded due to weather',
    ja: '気象条件のため、屋外での活動を除外しました',
    zh: '因天气条件，已排除室外活动',
  },
  [REASON.UV_EXPOSURE]: {
    ko: '자외선 회피 조건으로 실외 노출 장소를 제외했습니다',
    en: 'Excluded — UV exposure to be avoided',
    ja: '紫外線を避ける条件のため、屋外にさらされる場所を除外しました',
    zh: '因需避免紫外线，已排除室外暴露的地点',
  },
  [REASON.INDOOR_ONLY_REQUIRED]: {
    ko: '병원이 실내 활동만 허용했습니다',
    en: 'Hospital allows indoor activities only',
    ja: '病院が屋内での活動のみを認めています',
    zh: '医院只允许室内活动',
  },
  [REASON.WALK_LIMIT_EXCEEDED]: {
    ko: '허용된 보행 시간을 초과합니다',
    en: 'Exceeds allowed walking time',
    ja: '認められた歩行時間を超えます',
    zh: '超出允许的步行时间',
  },
  [REASON.TRAVEL_LIMIT_EXCEEDED]: {
    ko: '허용된 이동 시간을 초과합니다',
    en: 'Exceeds allowed travel time',
    ja: '認められた移動時間を超えます',
    zh: '超出允许的交通时间',
  },
  [REASON.CONGESTION_HIGH]: {
    ko: '혼잡도가 높아 제외했습니다',
    en: 'Excluded due to high congestion',
    ja: '混雑度が高いため除外しました',
    zh: '因拥挤程度高已排除',
  },
  [REASON.CLOSED]: {
    ko: '운영하지 않는 시간입니다',
    en: 'Currently closed',
    ja: '営業していない時間です',
    zh: '不在营业时间内',
  },
  [REASON.DATA_UNRELIABLE]: {
    ko: '정보를 확인할 수 없어 제외했습니다',
    en: 'Excluded — information could not be verified',
    ja: '情報を確認できないため除外しました',
    zh: '因无法确认信息已排除',
  },
  [REASON.PATIENT_RECALLED]: {
    ko: '환자 또는 병원이 복귀를 요청했습니다',
    en: 'Patient or hospital requested return',
    ja: '患者さんまたは病院が帰着を求めています',
    zh: '患者或医院要求返回',
  },
  [REASON.NON_TOURISM_ACTIVITY]: {
    ko: '관광 활동 장소가 아니어서 제외했습니다',
    en: 'Excluded because it is not a tourism activity',
    ja: '観光向けの場所ではないため除外しました',
    zh: '因不是观光活动场所已排除',
  },
  [REASON.NO_CANDIDATE]: {
    ko: '조건을 통과한 후보가 없습니다',
    en: 'No candidate passed the conditions',
    ja: '条件を満たす候補がありません',
    zh: '没有符合条件的候选',
  },
  [REASON.SERVICE_PAUSED]: {
    ko: '점검을 위해 추천을 일시 중단했습니다. 병원 안내를 먼저 따르세요',
    en: 'Recommendations are paused for maintenance. Please follow your hospital guidance',
    ja: '点検のため、おすすめを一時停止しています。まず病院の案内に従ってください',
    zh: '因维护暂停推荐。请优先遵循医院指引',
  },
  [REASON.NO_HOSPITAL_PLAN]: {
    ko: '연결된 병원 회복 지침이 없습니다',
    en: 'No hospital recovery plan is connected',
    ja: '連携された病院の回復ガイドがありません',
    zh: '尚未关联医院恢复指引',
  },
  [REASON.PLAN_EXPIRED]: {
    ko: '병원 회복 지침의 유효기간이 지났습니다',
    en: 'Your hospital recovery plan has expired',
    ja: '病院の回復ガイドの有効期限が切れています',
    zh: '医院恢复指引已过有效期',
  },
  [REASON.PLAN_REVOKED]: {
    ko: '병원이 회복 지침을 거둬들였습니다',
    en: 'Your hospital withdrew the recovery plan',
    ja: '病院が回復ガイドを取り下げました',
    zh: '医院已撤回恢复指引',
  },
  [REASON.PLAN_UNCONFIRMED_UPDATE]: {
    ko: '확인하지 않은 병원 안내 변경이 있습니다',
    en: 'There is a hospital update you have not reviewed',
    ja: '未確認の病院の案内の変更があります',
    zh: '有尚未确认的医院指引变更',
  },
  [REASON.MEDICATION_WINDOW]: {
    ko: '복약 시각까지 돌아와야 합니다',
    en: 'You must be back before your medication time',
    ja: '服薬時刻までに戻る必要があります',
    zh: '必须在用药时间前返回',
  },

  // 체류 동반 플랫폼 (AX-302 · spec 5.2 새 사유 코드)
  [REASON.OUTSIDE_STAY_WINDOW]: {
    ko: '입국 후 일정 시작 전이거나 출국 준비 시간이라 일정을 만들지 않았습니다',
    en: 'No plan here — this is before your arrival-day start or after your departure-day cutoff',
    ja: '入国後の予定開始前、または出国準備の時間のため、予定を作成していません',
    zh: '此时段在入境后行程开始之前或属于出境准备时间，因此未安排行程',
  },
  [REASON.LODGING_REQUIRED]: {
    ko: '이 날짜의 숙소를 입력해 주세요',
    en: 'Please enter your lodging for this date',
    ja: 'この日の宿泊先を入力してください',
    zh: '请输入这一天的住处',
  },
  [REASON.CONDITION_INPUT_REQUIRED]: {
    ko: '이 날짜에 적용할 조건을 입력해 주세요',
    en: 'Please enter the conditions that apply to this date',
    ja: 'この日に適用する条件を入力してください',
    zh: '请输入适用于这一天的条件',
  },
  [REASON.SENSITIVE_CONSENT_REQUIRED]: {
    ko: '조건을 입력하려면 민감정보 처리 동의가 필요합니다',
    en: 'Consent to process sensitive information is needed before entering conditions',
    ja: '条件を入力するには、要配慮個人情報の取り扱いへの同意が必要です',
    zh: '输入条件前，需要同意处理敏感个人信息',
  },
  [REASON.HOSPITAL_PLAN_EXPIRED_INPUT_REQUIRED]: {
    ko: '병원 지침의 유효기간이 지났습니다. 병원에서 새 지침을 받거나 본인 체크로 입력하세요',
    en: 'Your hospital plan has expired. Get a new plan from your hospital or enter a self-check',
    ja: '病院のガイドの有効期限が切れています。病院で新しいガイドを受け取るか、セルフチェックで入力してください',
    zh: '医院指引已过有效期。请向医院获取新的指引，或通过自我核对输入',
  },
  [REASON.DAILY_CHECK_PENDING]: {
    ko: '오늘 조건이 그대로인지 먼저 확인해 주세요',
    en: "Please confirm first whether today's conditions are unchanged",
    ja: '今日の条件が変わっていないか、まず確認してください',
    zh: '请先确认今天的条件是否有变化',
  },
  [REASON.HEAT_EXPOSURE]: {
    ko: '열을 피해야 하는 조건이라 사우나·찜질 등 단서가 있는 장소를 제외했습니다',
    en: 'Excluded — heat exposure (sauna, jjimjil, etc.) is to be avoided',
    ja: '熱を避ける条件のため、サウナ・チムジルバンなどの手がかりがある場所を除外しました',
    zh: '因需避免高温，已排除带有桑拿、汗蒸等线索的地点',
  },
  [REASON.WATER_ACTIVITY]: {
    ko: '물에 들어가면 안 되는 조건이라 수영장·온천 등 단서가 있는 장소를 제외했습니다',
    en: 'Excluded — water activities (pool, hot spring, etc.) are to be avoided',
    ja: '水に入ってはいけない条件のため、プール・温泉などの手がかりがある場所を除外しました',
    zh: '因不能下水，已排除带有游泳池、温泉等线索的地点',
  },
  [REASON.DIET_RESTRICTED]: {
    ko: '식이 조건에 맞지 않는 것으로 추정되어 제외했습니다',
    en: 'Excluded — estimated not to fit your dietary conditions',
    ja: '食事の条件に合わないと推定されるため除外しました',
    zh: '推测不符合饮食条件，已排除',
  },
  [REASON.MENU_UNKNOWN]: {
    ko: '식이 조건을 판단할 메뉴 정보가 없어 제외했습니다',
    en: 'Excluded — no menu information to check against your dietary conditions',
    ja: '食事の条件を判断するためのメニュー情報がないため除外しました',
    zh: '没有可用于判断饮食条件的菜单信息，已排除',
  },
};
