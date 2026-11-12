// /result: 퇴역한 단일 외출 결과 화면 (AX-317 · docs/platform/IA_AND_FLOWS.md '퇴역하는 화면' · ADR-0006)
//
// 판정 경로가 두 벌이 되면 결과가 어긋난다(PRODUCT_DEFINITION §9-5). 추천 결과·변화 시연·복귀 시트는
// 오늘(/today)과 하루 일정(/trip/[date]) 화면으로 옮겼다. 예전 주소로 들어와도 오늘 화면으로 보낸다.

import { redirect } from 'next/navigation';

export default function RetiredResultPage() {
  redirect('/today');
}
