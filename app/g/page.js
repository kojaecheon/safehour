// /g: 보호자 링크 열기 (AX-320 · docs/business-rules.md '보호자', docs/security.md '보호자 링크')
//
// 링크 = <origin>/g#<암호문>. 브라우저는 # 뒤를 서버로 보내지 않으므로 이 경로의 서버 요청에는 암호문이 없다.
// 서버는 빈 화면 틀만 보내고, 암호문 읽기·PIN 풀기·사본 저장은 클라이언트 부품(components/guardian/GuardianOpen.js)이 한다.

import GuardianOpen from '@/components/guardian/GuardianOpen.js';

export const metadata = {
  robots: { index: false, follow: false },
};

export default function GuardianOpenPage() {
  return <GuardianOpen />;
}
