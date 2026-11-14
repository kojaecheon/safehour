// 다국어 계약 (AX-209 · AX-303)
//
// 대상 사용자가 외국인 환자이므로 "번역이 비어 있는 화면 문구" 는 결함이다.
// 이 테스트가 사전 누락·자리표시자 불일치·미사용 키를 실패로 고정한다.
// 4개 언어·안전 문구 병기·이름공간 규칙은 `i18n-languages.test.js` 가 고정한다.
//
// AX-303 에서 의도적으로 바꾼 단언: `ja-JP`·`zh-CN` 은 이제 `en` 이 아니라 `ja`·`zh` 다
// (docs/business-rules.md '언어' · ADR-0007 이 ADR-0003 규칙 1 을 개정).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { UI_TEXT } from '../src/i18n/messages/index.js';
import { SCHEDULE_FIELD_KEY } from '../src/i18n/messages/place.js';
import { UI_TEXT as LEGACY_UI_TEXT, SCHEDULE_FIELD_KEY as LEGACY_SCHEDULE } from '../src/i18n/dictionary.js';
import { LEGAL_SECTIONS } from '../src/i18n/legal.js';
import {
  CLEARABLE_KEYS,
  CLEARED_FLAG,
  DRAFT_KEY,
  LANG_KEY,
  RESULT_KEY,
} from '../lib/session.js';
import {
  DEFAULT_LANG,
  LANGS,
  intlLocale,
  interpolate,
  isLang,
  minutesLabel,
  normalizeLang,
  reasonText,
  stateMessage,
  translate,
} from '../src/i18n/index.js';
import { STATE, STATE_MESSAGE, REASON, REASON_TEXT } from '../src/domain/states.js';

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(text) {
  return new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]));
}

/**
 * 화면 코드에서 참조된 사전 키를 수집한다.
 * `t('key')` 뿐 아니라 상수 맵·상태 값으로 넘기는 형태(`fail('plan.errOuting')`,
 * `COPYRIGHT_KEY = { Type1: 'place.copyrightType1' }`)도 잡아야 하므로,
 * 키 모양의 문자열 리터럴을 모두 수집한 뒤 사전에 있는 것만 남긴다.
 */
const KEY_SHAPE = /'([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9_.]+)'/g;
const DIRECT_CALL = /\b(?:t|translate)\(\s*'([a-zA-Z0-9_.]+)'/g;

function eachSourceFile(fn) {
  // lib/notify: 기기 알림 문구 키(notifications.*)는 알림 예약·문구 모듈이 쓴다 (AX-319)
  // lib/server/watch: 서버 푸시 문구 키(notifications.server*)는 서버 푸시 문구 모듈이 쓴다 (ADR-0012)
  const roots = ['app', 'components', 'src/i18n', 'lib/notify', 'lib/server/watch'];
  const visit = (path) => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        visit(full);
        continue;
      }
      if (!full.endsWith('.js')) continue;
      // 이름공간 파일의 키 정의는 "사용" 이 아니다 (dictionary.js 는 호환용 재수출)
      if (full.startsWith(join('src', 'i18n', 'messages'))) continue;
      if (full.endsWith(join('src', 'i18n', 'dictionary.js'))) continue;
      fn(readFileSync(full, 'utf8'), full);
    }
  };
  roots.forEach(visit);
}

/** 키 모양의 문자열 리터럴 전부 — 상수 맵·상태 값으로 넘기는 키까지 잡는다 */
function collectReferencedLiterals() {
  const found = new Set();
  eachSourceFile((source) => {
    for (const m of source.matchAll(KEY_SHAPE)) found.add(m[1]);
  });
  return found;
}

/** `t('…')` · `translate('…')` 직접 호출만 — 오타를 잡는 용도 */
function collectDirectCallKeys() {
  const found = new Set();
  eachSourceFile((source) => {
    for (const m of source.matchAll(DIRECT_CALL)) found.add(m[1]);
  });
  return found;
}

/** 템플릿 리터럴로 조립되는 키(`event.${type}` 등)는 접두사로 인정한다 */
const DYNAMIC_PREFIXES = ['state.', 'event.', 'eventPanel.', 'schedule.'];

describe('사전 무결성', () => {
  test('기존 import 경로(dictionary.js)가 같은 사전을 가리킨다', () => {
    assert.equal(LEGACY_UI_TEXT, UI_TEXT);
    assert.equal(LEGACY_SCHEDULE, SCHEDULE_FIELD_KEY);
  });

  test('모든 키가 4개 언어를 모두 가진다', () => {
    const missing = [];
    for (const [key, entry] of Object.entries(UI_TEXT)) {
      for (const lang of LANGS) {
        const value = entry[lang];
        if (typeof value !== 'string' || value.trim() === '') missing.push(`${key}.${lang}`);
      }
    }
    assert.deepEqual(missing, [], `번역 누락: ${missing.join(', ')}`);
  });

  test('4개 언어의 자리표시자 집합이 같다', () => {
    const mismatched = [];
    for (const [key, entry] of Object.entries(UI_TEXT)) {
      const ko = placeholders(entry.ko);
      for (const lang of LANGS) {
        const other = placeholders(entry[lang]);
        if (ko.size !== other.size || [...ko].some((name) => !other.has(name))) {
          mismatched.push(`${key}.${lang}`);
        }
      }
    }
    assert.deepEqual(mismatched, [], `자리표시자 불일치: ${mismatched.join(', ')}`);
  });

  test('영문이 한국어를 그대로 복사한 항목이 없다', () => {
    // 언어명(한국어/English)처럼 의도적으로 번역하지 않는 항목만 예외다
    const allowSame = new Set(['common.langKo', 'common.langEn', 'common.dash']);
    const copied = Object.entries(UI_TEXT)
      .filter(([key, e]) => !allowSame.has(key) && e.ko === e.en)
      .map(([key]) => key);
    assert.deepEqual(copied, [], `한국어가 그대로 남은 영문: ${copied.join(', ')}`);
  });

  test('화면에서 쓰지 않는 키가 없다', () => {
    const used = collectReferencedLiterals();
    const unused = Object.keys(UI_TEXT).filter(
      (key) => !used.has(key) && !DYNAMIC_PREFIXES.some((p) => key.startsWith(p)),
    );
    assert.deepEqual(unused, [], `사용되지 않는 키: ${unused.join(', ')}`);
  });

  test('t() 로 직접 부르는 키가 모두 사전에 있다', () => {
    const missing = [...collectDirectCallKeys()].filter((key) => !UI_TEXT[key]);
    assert.deepEqual(missing, [], `사전에 없는 키: ${missing.join(', ')}`);
  });

  test('모든 상태와 사유 코드에 화면 라벨이 있다', () => {
    for (const state of Object.values(STATE)) {
      assert.ok(UI_TEXT[`state.${state}`], `state.${state} 라벨 없음`);
      assert.ok(STATE_MESSAGE[state], `${state} 도메인 문구 없음`);
    }
    // 사유 문구는 도메인이 소유한다 — 여기서는 누락만 확인한다
    for (const code of Object.values(REASON)) {
      assert.ok(REASON_TEXT[code], `${code} 사유 문구 없음`);
      for (const lang of LANGS) assert.ok(REASON_TEXT[code][lang], `${code}.${lang} 번역 누락`);
    }
  });

  test('변화 이벤트 6종에 라벨과 시연 설명이 있다', () => {
    for (const type of [
      'CLOSURE',
      'WEATHER',
      'TRAFFIC_SURGE',
      'APPOINTMENT',
      'PATIENT_RECALL',
      'RISK_SIGNAL',
    ]) {
      assert.ok(UI_TEXT[`event.${type}`], `event.${type} 없음`);
      assert.ok(UI_TEXT[`eventPanel.${type}`], `eventPanel.${type} 없음`);
      assert.ok(UI_TEXT[`eventPanel.${type}Desc`], `eventPanel.${type}Desc 없음`);
    }
  });

  test('운영정보 필드 매핑이 모두 사전 키를 가리킨다', () => {
    for (const [field, key] of Object.entries(SCHEDULE_FIELD_KEY)) {
      assert.ok(UI_TEXT[key], `${field} → ${key} 사전에 없음`);
    }
  });
});

describe('고지 본문 (AX-211)', () => {
  /** 섹션의 모든 언어별 문단을 평평하게 모은다 */
  function entriesOf(section) {
    return [section.title, section.lead, section.note, ...(section.items ?? [])].filter(Boolean);
  }

  test('모든 문단이 4개 언어를 모두 가진다', () => {
    const missing = [];
    for (const section of LEGAL_SECTIONS) {
      entriesOf(section).forEach((entry, i) => {
        for (const lang of LANGS) {
          if (typeof entry[lang] !== 'string' || entry[lang].trim() === '') {
            missing.push(`${section.id}[${i}].${lang}`);
          }
        }
      });
    }
    assert.deepEqual(missing, [], `고지 번역 누락: ${missing.join(', ')}`);
  });

  test('섹션 id 가 중복되지 않는다 — 화면에서 앵커로 쓰인다', () => {
    const ids = LEGAL_SECTIONS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `중복 id: ${ids.join(', ')}`);
  });

  test('안전·개인정보 핵심 섹션이 빠지지 않았다', () => {
    const ids = new Set(LEGAL_SECTIONS.map((s) => s.id));
    for (const required of ['collect', 'never', 'store', 'third-party', 'medical', 'sources']) {
      assert.ok(ids.has(required), `${required} 섹션 없음`);
    }
  });

  test('검증할 수 없는 다짐 표현을 쓰지 않는다', () => {
    const banned = [
      '최선을 다',
      '노력합니다',
      '안전을 보장',
      'guarantee',
      'best effort',
      '保証',
      '努めます',
      '最善を尽く',
      '保证',
      '尽力',
      '竭力',
    ];
    const offenders = [];
    for (const section of LEGAL_SECTIONS) {
      for (const entry of entriesOf(section)) {
        for (const lang of LANGS) {
          const found = banned.find((word) => entry[lang].includes(word));
          if (found) offenders.push(`${section.id}: ${found}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `검증 불가 표현: ${offenders.join(', ')}`);
  });
});

describe('단말 데이터 삭제 목록 (AX-210)', () => {
  test('조건 draft 와 판정 결과가 삭제 대상이다', () => {
    assert.ok(CLEARABLE_KEYS.includes(DRAFT_KEY), '조건 draft 가 삭제 대상이 아니다');
    assert.ok(CLEARABLE_KEYS.includes(RESULT_KEY), '판정 결과가 삭제 대상이 아니다');
  });

  test('언어 설정은 삭제하지 않는다 — 지운 뒤에도 읽을 수 있어야 한다', () => {
    assert.equal(CLEARABLE_KEYS.includes(LANG_KEY), false);
  });

  test('삭제 목록이 화면에서 쓰는 저장 키를 모두 덮는다', () => {
    // 화면 코드가 sessionStorage 에 쓰는 safehour.* 키를 전부 찾아
    // 삭제 대상 또는 명시적 예외(언어·삭제 플래그)에 속하는지 확인한다
    const found = new Set();
    eachSourceFile((source) => {
      for (const m of source.matchAll(/'(safehour\.[a-zA-Z]+)'/g)) found.add(m[1]);
    });
    const allowed = new Set([...CLEARABLE_KEYS, LANG_KEY, CLEARED_FLAG]);
    const uncovered = [...found].filter((key) => !allowed.has(key));
    assert.deepEqual(uncovered, [], `삭제되지 않는 저장 키: ${uncovered.join(', ')}`);
  });
});

describe('언어 결정', () => {
  // AX-303: ja·zh 를 en 으로 좁히던 단언을 의도적으로 바꿨다 (docs/business-rules.md '언어')
  test('ko·ja·zh 태그는 각 언어로, 나머지는 en 으로 좁힌다', () => {
    assert.equal(normalizeLang('ko'), 'ko');
    assert.equal(normalizeLang('ko-KR'), 'ko');
    assert.equal(normalizeLang('KO-kr'), 'ko');
    assert.equal(normalizeLang('en-US'), 'en');
    assert.equal(normalizeLang('ja-JP'), 'ja');
    assert.equal(normalizeLang('zh-CN'), 'zh');
    assert.equal(normalizeLang('zh-TW'), 'zh');
    assert.equal(normalizeLang('fr'), 'en');
  });

  test('빈 값·비문자열은 기본 언어로 떨어진다', () => {
    assert.equal(normalizeLang(''), DEFAULT_LANG);
    assert.equal(normalizeLang('   '), DEFAULT_LANG);
    assert.equal(normalizeLang(undefined), DEFAULT_LANG);
    assert.equal(normalizeLang(null), DEFAULT_LANG);
    assert.equal(normalizeLang(42), DEFAULT_LANG);
  });

  test('지원 언어만 통과시킨다', () => {
    assert.equal(isLang('ko'), true);
    assert.equal(isLang('en'), true);
    assert.equal(isLang('ja'), true);
    assert.equal(isLang('zh'), true);
    assert.equal(isLang('fr'), false);
    assert.equal(isLang(null), false);
  });

  test('Intl 로케일이 언어별로 다르다', () => {
    assert.equal(intlLocale('ko'), 'ko-KR');
    assert.equal(intlLocale('en'), 'en-GB');
    assert.equal(intlLocale('ja'), 'ja-JP');
    assert.equal(intlLocale('zh'), 'zh-CN');
  });
});

describe('문구 조회', () => {
  test('언어별로 다른 문구를 돌려준다', () => {
    assert.equal(translate('common.confirm', 'ko'), '확인');
    assert.equal(translate('common.confirm', 'en'), 'OK');
    assert.equal(translate('common.confirm', 'ja'), UI_TEXT['common.confirm'].ja);
    assert.equal(translate('common.confirm', 'zh'), UI_TEXT['common.confirm'].zh);
    assert.notEqual(translate('common.confirm', 'ja'), translate('common.confirm', 'en'));
  });

  test('없는 키는 키 자체를 돌려준다 — 조용히 사라지지 않는다', () => {
    assert.equal(translate('nope.missing', 'ko'), 'nope.missing');
  });

  test('자리표시자를 치환한다', () => {
    // AX-317: 퇴역한 추천 카드 키(card.rank)를 지워 새 일정 화면 키로 바꿨다
    assert.equal(translate('trip.stopCount', 'ko', { n: 2 }), '장소 2곳');
    assert.equal(translate('trip.stopCount', 'en', { n: 2 }), '2 places');
  });

  test('값이 없는 자리표시자는 표시자를 남긴다', () => {
    assert.equal(interpolate('{a}/{b}', { a: 1 }), '1/{b}');
    assert.equal(interpolate('{a}', undefined), '{a}');
  });
});

describe('안전 문구는 도메인이 소유한다', () => {
  test('상태 문구를 언어별로 가져온다', () => {
    assert.equal(stateMessage(STATE.NO_TOURISM, 'ko').message, '지금은 관광을 권하지 않습니다');
    assert.equal(
      stateMessage(STATE.NO_TOURISM, 'en').message,
      'Tourism is not recommended right now',
    );
    assert.equal(stateMessage(STATE.NO_TOURISM, 'en').action, 'Contact hospital or rest at accommodation');
  });

  test('알 수 없는 상태는 null 이다', () => {
    assert.equal(stateMessage('WHATEVER', 'ko'), null);
  });

  test('사유 코드를 언어별로 가져오고, 미정의 코드는 코드를 노출한다', () => {
    assert.equal(reasonText(REASON.OUTING_FORBIDDEN, 'ko'), '병원이 외출을 제한했습니다');
    assert.equal(reasonText(REASON.OUTING_FORBIDDEN, 'en'), 'Hospital restricted outings');
    assert.equal(reasonText('UNKNOWN_CODE', 'ko'), 'UNKNOWN_CODE');
  });
});

describe('분 단위 라벨', () => {
  test('60분 미만은 분으로 표기한다', () => {
    assert.equal(minutesLabel(20, 'ko'), '20분');
    assert.equal(minutesLabel(20, 'en'), '20 min');
    assert.equal(minutesLabel(20, 'ja'), '20分');
    assert.equal(minutesLabel(20, 'zh'), '20分钟');
  });

  test('정시는 시간만 표기한다', () => {
    assert.equal(minutesLabel(120, 'ko'), '2시간');
    assert.equal(minutesLabel(120, 'en'), '2 h');
  });

  test('시간과 분을 함께 표기한다', () => {
    assert.equal(minutesLabel(95, 'ko'), '1시간 35분');
    assert.equal(minutesLabel(95, 'en'), '1 h 35 min');
    assert.equal(minutesLabel(95, 'ja'), '1時間35分');
    assert.equal(minutesLabel(95, 'zh'), '1小时35分钟');
  });

  test('값이 없으면 확인 불가로 표기한다 — 0 으로 오해하게 두지 않는다', () => {
    assert.equal(minutesLabel(null, 'ko'), '확인 불가');
    assert.equal(minutesLabel(undefined, 'en'), 'Unknown');
    assert.equal(minutesLabel(Number.NaN, 'en'), 'Unknown');
  });

  test('0분은 확인 불가가 아니다', () => {
    assert.equal(minutesLabel(0, 'ko'), '0분');
    assert.equal(minutesLabel(0, 'en'), '0 min');
  });
});
