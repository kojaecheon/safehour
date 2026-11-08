// 관광공사 자체 호출 카운터 요약 (GET /api/health 가 쓴다)
//
// 운영자가 "오늘 어느 조회가 몇 번 나갔고 한도까지 얼마 남았는지"를 배포된 서버에서 바로 보게 한다.
// 읽는 것은 src/tour-api/client.js 가 이미 쓰는 operation별 일일 카운터 파일뿐이다. 새 저장소를 만들지 않는다.
//
// 담는 것: KST 날짜, operation 이름(예: korean.locationBasedList2), 사용 횟수, 차단 값, 경고 값
// 담지 않는 것: 키, 요청 URL, 매개변수(좌표 포함), 호출 기록 내용

/** operation 이름은 '서비스.오퍼레이션' 모양만 내보낸다. 카운터 파일이 손으로 고쳐져도 다른 문자열은 나가지 않는다 */
const OPERATION_RE = /^[A-Za-z]{1,40}\.[A-Za-z0-9]{1,60}$/;

/**
 * @param {object} args
 * @param {() => {date: string, byOperation: Record<string, number>}} args.summary  카운터 읽기(손상이면 던진다)
 * @param {number} args.dailyLimit
 * @param {number} args.warningAt
 * @returns {{date: string|null, dailyLimit: number, warningAt: number, counterReadable: boolean,
 *   operations: Record<string, {used: number, limit: number, state: 'OK'|'WARNING'|'BLOCKED'}>}}
 */
export function buildTourApiUsage({ summary, dailyLimit, warningAt }) {
  const base = { dailyLimit, warningAt };
  let read;
  try {
    read = summary();
  } catch {
    // 손상·읽기 실패. 원문에는 파일 경로가 있어 싣지 않는다. 호출 쪽은 이때 한도 확인이 안 돼 호출을 막는다.
    return { date: null, ...base, counterReadable: false, operations: {} };
  }
  const operations = {};
  for (const [name, value] of Object.entries(read?.byOperation ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!OPERATION_RE.test(name)) continue;
    const used = Number.isSafeInteger(value) && value >= 0 ? value : 0;
    const state = used >= dailyLimit ? 'BLOCKED' : used >= warningAt ? 'WARNING' : 'OK';
    operations[name] = { used, limit: dailyLimit, state };
  }
  return { date: typeof read?.date === 'string' ? read.date : null, ...base, counterReadable: true, operations };
}

/**
 * 실제 카운터를 읽어 요약한다. 관광 모듈은 시작할 때 환경변수·디렉터리를 정하므로 부를 때 불러온다
 * (헬스 경로를 읽기만 해도 데이터 루트가 정해지면 테스트가 임시 루트를 쓸 수 없다).
 */
export async function readTourApiUsage() {
  const [{ tourApiCounterSummary }, { TOUR_API_DAILY_LIMIT, TOUR_API_WARNING_AT }] = await Promise.all([
    import('../../src/tour-api/client.js'),
    import('../../src/tour-api/config.js'),
  ]);
  return buildTourApiUsage({ summary: tourApiCounterSummary, dailyLimit: TOUR_API_DAILY_LIMIT, warningAt: TOUR_API_WARNING_AT });
}
