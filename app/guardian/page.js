// /guardian — 보호자 링크 만들기 (AX-320 · spec 4.11)
//
// 화면은 클라이언트 부품(components/guardian/GuardianCreate.js)이 그린다.
// 암호화·링크 조립은 브라우저 안에서만 한다 — 이 경로의 서버는 빈 화면 틀만 보낸다.

import GuardianCreate from '@/components/guardian/GuardianCreate.js';

export const metadata = {
  robots: { index: false, follow: false },
};

export default function GuardianPage() {
  return <GuardianCreate />;
}
