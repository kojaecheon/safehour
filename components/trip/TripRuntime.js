'use client';

// 일정 동기화 실행 부품 (AX-317 · spec 4.6, 4.9, 규칙 13)
//
// app/layout.js 가 앱 셸 옆에 한 번 단다. 하는 일은 두 가지다.
//   1. 일정 동기화 실행기(lib/trip)를 켠다 — useTrip() 이 첫 마운트에서 저장소 구독과 앱 열기 순서를 한 번 실행하고,
//      화면이 다시 보이면 재확인한다. 어느 화면으로 앱을 열어도 변화 감지·재계획이 돈다.
//   2. **즉시 복귀 시트를 자동으로 연다** (spec 4.9, 끌 수 없다). 환자 호출·외출 중 지침 철회·만료·외출 중 재계획으로
//      이미 늦음으로 오늘이 returnNow 가 되면 지금 보고 있는 화면 위에 연다. 뒤로 가기는 시트만 닫는다(페이지를 떠나지 않는다).
//   3. 즉시 복귀가 아니고 외출의 복귀 마감이 지났으면(overdueReturn, 마감 지남 설계서 4.2) 마감 지남 시트(PASSED)를 연다.
//      저장 일정은 그대로다. 닫으면(확인했어요·Escape·뒤로 가기) 그 외출로는 다시 열지 않는다. 즉시 복귀 시트가 우선이다.
//
// 달지 않는 곳
//   - /design-board: 고정 데모 데이터만 쓰는 화면이다(사용자 데이터를 읽지 않는다, spec 7장) — 실행기도 켜지 않는다.
//   - 시트만 열지 않는 곳: 시작·로그인(로그인 전 흐름), /g(보호자 기기), /emergency(긴급 연락을 가리지 않는다).
//     그 화면을 떠나면 시트가 다시 열린다.

import { usePathname } from 'next/navigation';
import ReturnSheet from '@/components/ReturnSheet.js';
import useTrip from '@/lib/trip/useTrip.js';

const OFF_PATHS = Object.freeze(['/design-board']);
const NO_SHEET_PATHS = Object.freeze(['/', '/login', '/g', '/emergency']);

function inPaths(pathname, list) {
  return list.some((base) => (base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)));
}

function TripSync({ showSheet }) {
  const trip = useTrip();
  const ir = trip.immediateReturn;
  const passed = trip.overdueReturn;
  if (!showSheet) return null;
  if (ir) {
    return <ReturnSheet day={trip.tripPlan?.days?.[ir.date] ?? null} stay={trip.stay} cause={ir.cause} onClose={trip.dismissImmediateReturn} />;
  }
  if (!passed) return null;
  return (
    <ReturnSheet
      variant="PASSED"
      day={trip.tripPlan?.days?.[passed.date] ?? null}
      stay={trip.stay}
      outingId={passed.outingId}
      onClose={trip.dismissOverdueReturn}
    />
  );
}

export default function TripRuntime() {
  const pathname = usePathname() ?? '/';
  if (inPaths(pathname, OFF_PATHS)) return null;
  return <TripSync showSheet={!inPaths(pathname, NO_SHEET_PATHS)} />;
}
