import Link from 'next/link';

// SCR001 — 시작 화면
// CTA 주변에서 핵심 한계 3가지가 읽지 않아도 인지되도록 배치한다 (D03).
export default function HomePage() {
  return (
    <>
      <header className="top-bar">
        <span className="brand">SafeHour</span>
      </header>
      <main className="page">
        <section className="card" style={{ paddingTop: 24, paddingBottom: 24 }}>
          <h1>
            병원 조건 안에서만,
            <br />
            안심 관광을 추천합니다
          </h1>
          <p style={{ marginTop: 10 }}>
            수술·시술 후 회복 중인 외국인 환자와 보호자를 위해, 병원이 정한 주의조건과
            복귀시간을 지키는 활동만 골라 보여드립니다.
          </p>
        </section>

        <section className="card" aria-label="SafeHour의 세 가지 원칙">
          <h2>시작 전에 꼭 알아두세요</h2>
          {/* listStyle none 은 Safari/VoiceOver 에서 리스트 시맨틱을 제거하므로 role 로 복원 */}
          <ul role="list" style={{ listStyle: 'none', display: 'grid', gap: 10, marginTop: 4 }}>
            <li>
              <strong>① 의료 판단을 하지 않습니다.</strong>
              <br />
              <span style={{ color: 'var(--ink-soft)', fontSize: 15 }}>
                증상 해석이나 외출 가능 여부 진단은 하지 않으며, 병원이 제공한 조건만 따릅니다.
              </span>
            </li>
            <li>
              <strong>② 현재 위치(GPS)를 서버로 보내지 않습니다.</strong>
              <br />
              <span style={{ color: 'var(--ink-soft)', fontSize: 15 }}>
                직접 선택한 병원·숙소 고정 기준점만 사용합니다.
              </span>
            </li>
            <li>
              <strong>③ 조건을 지킬 수 없으면 추천하지 않습니다.</strong>
              <br />
              <span style={{ color: 'var(--ink-soft)', fontSize: 15 }}>
                추천이 없는 결과도 실패가 아니라 안전을 위한 정상 결과입니다.
              </span>
            </li>
          </ul>
        </section>

        <Link href="/plan" className="btn" style={{ marginTop: 4 }}>
          안심 코스 만들기
        </Link>

        <p className="source-note" style={{ marginTop: 16 }}>
          SafeHour는 의료진의 판단을 대체하지 않습니다. 몸 상태에 이상이 느껴지면 즉시 병원에
          연락하세요. 관광정보 출처: 한국관광공사 TourAPI.
        </p>
      </main>
    </>
  );
}
