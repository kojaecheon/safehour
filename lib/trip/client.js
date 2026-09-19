// 브라우저 기본 일정 동기화 실행기 (AX-316)
//
// 화면은 getTripSync() 로 하나뿐인 실행기를 받는다(훅은 lib/trip/useTrip.js). 서버 렌더링 중에는 null 이다.
// 기본 저장소(getStore)와 같은 출처의 일정 API 를 쓴다. 관광 데이터 언어는 화면 언어와 같은 순서로 정한다 —
// 기기에 저장한 선택 → 브라우저 언어(components/LanguageProvider.js 와 같다).

import { isLang, normalizeLang } from '../../src/i18n/index.js';
import { getStore } from '../store/index.js';
import { createTripApi } from './api.js';
import { createTripSync } from './runtime.js';

let browserSync = null;

/** @returns {ReturnType<typeof createTripSync> | null} */
export function getTripSync() {
  if (typeof window === 'undefined') return null;
  if (!browserSync) {
    const store = getStore();
    const win = window;
    browserSync = createTripSync({
      store,
      api: createTripApi(),
      getLang: () => {
        const saved = store.readLang();
        return isLang(saved) ? saved : normalizeLang(win.navigator?.language);
      },
      timers: { setTimeout: win.setTimeout.bind(win), clearTimeout: win.clearTimeout.bind(win) },
    });
  }
  return browserSync;
}
