// E2E 서버 시계 이동기 (테스트 전용, 선택 사용)
//
// 서버는 일정의 '지금'을 요청이 아니라 자기 시계에서만 읽는다(lib/server/itinerary-request.js,
// lib/server/itinerary-service.js 의 clock). 그래서 브라우저 시계(page.clock)만 옮겨서는
// '외출 중 15:31' 같은 시각을 만들 수 없다. 이 파일이 서버 프로세스의 Date 를 정해 둔 만큼 옮긴다.
//
// playwright.config.js 가 e2e/network-guard.cjs 옆에서 NODE_OPTIONS `--require` 로 싣는다.
//   - SAFEHOUR_E2E_GUARD_DIR/clock-offset 파일에 적힌 밀리초(정수, 음수 가능)만큼 시계를 옮긴다.
//   - 파일이 없거나 비어 있으면 0 이라 아무것도 바뀌지 않는다.
//   - 옮기는 것은 Date.now() · 인자 없는 new Date() · Date() 뿐이다. new Date(값)·Date.parse·Date.UTC 등은 그대로다.
//   - 파일은 250ms 간격으로만 다시 읽는다(핫 경로는 읽기 없이 숫자 하나 더하기). 바꾼 값은 1초 안에 적용된다.
//   - 요청이 시각을 정하는 길은 없다. 이동량은 테스트 러너가 쓰는 이 파일에서만 온다.
// 불러온 사실은 GUARD_DIR/clock-ready-<pid> 표식으로 남긴다(e2e/network.spec.js 가 확인한다).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const GUARD_DIR = process.env.SAFEHOUR_E2E_GUARD_DIR;

if (GUARD_DIR && !globalThis.__safehourE2eClockShim) {
  const OFFSET_FILE = path.join(GUARD_DIR, 'clock-offset');
  const RECHECK_MS = 250;
  const RealDate = Date;
  const realNow = RealDate.now.bind(RealDate);

  let offsetMs = 0;
  let checkedAt = -Infinity;

  const readOffset = () => {
    try {
      const n = Number.parseInt(fs.readFileSync(OFFSET_FILE, 'utf8').trim(), 10);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0; // 파일 없음 = 이동 없음
    }
  };

  const shiftedNow = () => {
    const real = realNow();
    if (real - checkedAt >= RECHECK_MS) {
      checkedAt = real;
      offsetMs = readOffset();
    }
    return real + offsetMs;
  };

  const ShiftedDate = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(target, args.length === 0 ? [shiftedNow()] : args, newTarget);
    },
    apply() {
      return new RealDate(shiftedNow()).toString();
    },
    get(target, prop, receiver) {
      if (prop === 'now') return shiftedNow;
      return Reflect.get(target, prop, receiver);
    },
  });

  fs.mkdirSync(GUARD_DIR, { recursive: true });
  globalThis.__safehourE2eClockShim = true;
  globalThis.Date = ShiftedDate;
  fs.writeFileSync(path.join(GUARD_DIR, `clock-ready-${process.pid}`), `${new RealDate().toISOString()}\n`, 'utf8');
}
