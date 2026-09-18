// /design-board — 디자인 시안 보드 (AX-304 · spec 3.1 · 7장)
// 내비에 노출하지 않는 내부 페이지다. 검색에도 올리지 않는다.
// 고정 데모 데이터만 쓴다 — 사용자 데이터를 읽지 않는다.

import DesignBoard from './DesignBoard.js';

export const metadata = {
  title: 'SafeHour — Design board',
  robots: { index: false, follow: false },
};

export default function DesignBoardPage() {
  return <DesignBoard />;
}
