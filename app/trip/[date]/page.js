// /trip/[date] — 하루 일정 (AX-317 · spec 3.1 · 4.5–4.11 · 4.18)
//
// 이 페이지는 **정적으로** 그린다. 날짜는 화면(DayScreen)이 클라이언트에서 useParams 로 읽고, 일정은 기기 저장소에서 읽는다.
// 서버는 사용자 데이터를 모른다 — 요청마다 다시 그리는 서버 렌더가 필요 없다.
//   - force-static: 처음 연 날짜의 HTML 을 정적 사본으로 두고 다시 쓴다. 응답이 no-store 가 아니어서
//     서비스 워커(public/sw.js)가 한 번 연 날짜를 오프라인·로그인 만료에서도 보기 전용으로 연다(spec 4.18).
//   - 미리 만들 날짜는 없다(체류 날짜는 기기마다 다르다) — 처음 방문할 때 만든다.

import DayScreen from '@/components/trip/DayScreen.js';

export const dynamic = 'force-static';
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function TripDayPage() {
  return <DayScreen />;
}
