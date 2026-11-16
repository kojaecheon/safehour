'use client';

// 받은 일정 화면(/g)의 '앱이 닫혀 있어도 받기' 항목 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 7, ADR-0012)
//
// 실행기 훅(useGuardianPush)을 부르고 기기 설정(prefs.notifications)과 보기 전용 신호를 읽는 곳은 이 파일 하나다.
// 표시는 GuardianPushItemView, 무엇을 그릴지는 guardianPushViewModel 이 정한다(둘 다 저장소를 읽지 않는다).
//
//   <GuardianPushItem watchId={watchId} />         항목
//   const serverStatus = useGuardianServerStatus(watchId);   보이는 사본의 오늘 상태 조회(복귀 확인 표시, 5분마다 다시 묻는다)
//
// 정한 것
//   - 켜기·다시 켜기·다시 받기는 누름 안에서 곧바로 부른다(권한 요청과 구독은 사용자 동작 안에서만 된다). 결과 줄은 실행기가
//     남긴 lastResult 로 그린다(화면이 따로 들고 있지 않는다).
//   - 세션을 아직 확인하지 않았으면(오프라인 말고) 항목을 그리지 않는다. 로그인 안내가 잠깐 보였다 사라지지 않게 한다
//     (기기 알림 스위치의 보기 전용 안내와 같은 기준, shouldShowReadOnly).
//   - 지원 판별의 installed 는 실행기 기본값(navigator.standalone)을 쓴다. 훅이 installed 를 받지 않아 readInstalled 를
//     넘기지 않는다(계획 Interfaces 와 다른 점, 보고에 적는다).
//   - 상태 조회의 주기 묻기는 useGuardianServerStatus 한 곳만 건다(항목은 poll 없이 같은 상태를 읽는다).
//   - 보기 전용(로그인 문제)이면 바로 위 기기 알림 스위치(AlertsToggle)가 로그인 버튼을 이미 그린다. 같은 화면에 로그인 버튼이
//     두 번 나오지 않게 이 항목은 안내 줄만 두고 버튼은 뺀다(loginElsewhere, 검토 Minor 2). 두 부품은 같은 기준
//     (shouldShowReadOnly 이고 오프라인이 아님)으로 판단한다.

import { useEffect, useState } from 'react';
import { usePrefs } from '@/components/cards/useDeviceData.js';
import useStoreStatus, { shouldShowReadOnly } from '@/components/ui/useStoreStatus.js';
import { useGuardianPush } from '@/lib/notify/useGuardianPush.js';
import { READ_ONLY_REASON } from '@/lib/store/index.js';
import { WATCH_ID_RE } from '@/src/guardian/watchRequests.js';
import { kstDate } from './errorView.js';
import GuardianPushItemView from './GuardianPushItemView.js';
import { PUSH_ACTION, guardianPushViewModel } from './guardianPushView.js';

/** 로그인하고 받은 일정 화면으로 돌아온다 */
const LOGIN_HREF = `/login?returnTo=${encodeURIComponent('/g')}`;
const TICK_MS = 60 * 1000;

const isWatchId = (value) => typeof value === 'string' && WATCH_ID_RE.test(value);

/** 오늘(한국 시간, 'YYYY-MM-DD'). 1분마다 다시 읽어 화면을 연 채 자정을 넘겨도 바뀐다 */
function useKstToday() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return kstDate(nowMs);
}

/**
 * 보이는 사본의 오늘 상태 조회({ date, confirmed, muted, active, atMs }). 없으면 null.
 * 로그인한 보호자만 조회한다(실행기가 정한다). GuardianCopyView 의 serverStatus 로 넘긴다.
 * @param {string|null|undefined} watchId
 */
export function useGuardianServerStatus(watchId) {
  const { state } = useGuardianPush(watchId, { poll: isWatchId(watchId) });
  return state.status ?? null;
}

/**
 * @param {object} props
 * @param {string|null|undefined} props.watchId  보이는 사본의 watchId
 */
export default function GuardianPushItem({ watchId }) {
  const { state, turnOn, turnOff, renew, takeOver, mute } = useGuardianPush(watchId);
  const prefs = usePrefs();
  const status = useStoreStatus();
  const today = useKstToday();

  // 세션 확인 전에는 그리지 않는다(오프라인은 확인 없이도 확실하다)
  if (status.readOnly && !shouldShowReadOnly(status)) return null;

  const model = guardianPushViewModel({
    state,
    watchId,
    mainOn: prefs?.notifications === true,
    writable: status.readOnly === false && Boolean(status.accountKey),
    offline: status.reason === READ_ONLY_REASON.OFFLINE,
    loginElsewhere: shouldShowReadOnly(status) && status.reason !== READ_ONLY_REASON.OFFLINE,
    today,
  });

  function onToggle(on) {
    if (on) void turnOn();
    else void turnOff();
  }

  function onAction(action) {
    if (action === PUSH_ACTION.RELOAD) window.location.reload();
    else if (action === PUSH_ACTION.RENEW) void renew();
    else if (action === PUSH_ACTION.TAKE_OVER) void takeOver();
  }

  return (
    <GuardianPushItemView
      model={model}
      onToggle={onToggle}
      onMute={(on) => void mute(on)}
      onAction={onAction}
      loginHref={LOGIN_HREF}
    />
  );
}
