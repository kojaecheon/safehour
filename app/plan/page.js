// /plan: 퇴역한 단일 외출 흐름 (AX-317 · docs/platform/IA_AND_FLOWS.md '퇴역하는 화면' · ADR-0006)
//
// 판정 경로가 두 벌이 되면 결과가 어긋난다(PRODUCT_DEFINITION §9-5). 체류 전체 하루 일정으로 바꾸면서
// 단일 외출 확인 화면을 퇴역했다. 예전 주소(북마크·설치 아이콘)로 들어와도 오늘 화면으로 보낸다.

import { redirect } from 'next/navigation';

export default function RetiredPlanPage() {
  redirect('/today');
}
