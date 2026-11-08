// 4개 언어와 안전 문구 병기 (AX-303 · spec 4.17 · 규칙 43·44)
//
// 이 파일이 고정하는 것
//   - 규칙 44: 브라우저 언어 정규화 (ko*·ja*·zh* → 각 언어, 그 밖 → en)
//   - 규칙 43: 안전 문구 병기 — 선택 언어+한국어, ko 는 한국어+영어,
//             ja·zh 는 검수 스위치가 꺼져 있으면 영어+한국어
//   - 검수 스위치: 빌드 시점 공개 환경변수, 값이 정확히 '1' 일 때만 켜짐
//   - 이름공간 등록과 키 완전성: 이름공간·구역마다 4개 언어의 키 집합이 같다
//   - 누락 키는 조용히 비지 않는다
//   - 판정 계층은 i18n 을 모른다 (언어 무관성)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_LANG,
  LANGS,
  LANG_NAMES,
  SAFETY_COPY_REVIEWED,
  SAFETY_REVIEW_ENV,
  displayText,
  isLang,
  isSafetyKey,
  normalizeLang,
  pickText,
  readSafetyReview,
  reasonText,
  safetyPair,
  safetyText,
  stateMessage,
  translate,
} from '../src/i18n/index.js';
import {
  LEGACY_PREFIXES,
  NAMESPACES,
  NAMESPACE_NAMES,
  SAFETY_KEYS,
  UI_TEXT,
} from '../src/i18n/messages/index.js';
import { LEGAL_SECTIONS } from '../src/i18n/legal.js';
import { STATE, STATE_MESSAGE, REASON, REASON_TEXT } from '../src/domain/states.js';

const OFF = Object.freeze({ ja: false, zh: false });
const ON = Object.freeze({ ja: true, zh: true });

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholders = (text) => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
const KANA = /[぀-ヿ]/;
const HAN = /[一-鿿]/;

/** 이름공간 파일이 기대하는 목록 — plan "T3" · 공유 파일 쓰기 안내 */
const EXPECTED_NAMESPACES = [
  'common',
  'onboarding',
  'conditions',
  'today',
  'trip',
  'place',
  'cards',
  'emergency',
  'guardian',
  'settings',
  'privacy',
  'designBoard',
  'notifications',
  'errors',
  'aiIntro',
  'help',
];

/** 고지 본문의 모든 4개 언어 쌍 */
function legalEntries() {
  return LEGAL_SECTIONS.flatMap((s) =>
    [s.title, s.lead, s.note, ...(s.items ?? [])].filter(Boolean).map((entry) => ({ id: s.id, entry })),
  );
}

/** 사람이 읽는 안전·일반 문구 전부 — { where, entry: { ko, en, ja, zh } } */
function allTranslatedEntries() {
  const out = [];
  for (const [key, entry] of Object.entries(UI_TEXT)) out.push({ where: key, entry });
  for (const [state, entry] of Object.entries(STATE_MESSAGE)) {
    out.push({ where: `STATE_MESSAGE.${state}`, entry });
    out.push({ where: `STATE_MESSAGE.${state}.action`, entry: entry.action });
  }
  for (const [code, entry] of Object.entries(REASON_TEXT)) out.push({ where: `REASON_TEXT.${code}`, entry });
  for (const { id, entry } of legalEntries()) out.push({ where: `LEGAL.${id}`, entry });
  return out;
}

describe('규칙 44 — 브라우저 언어를 4개 언어로 좁힌다', () => {
  test('spec 예시: ja-JP→ja, zh-CN·zh-TW→zh, fr→en, ko-KR→ko', () => {
    assert.equal(normalizeLang('ja-JP'), 'ja');
    assert.equal(normalizeLang('zh-CN'), 'zh');
    assert.equal(normalizeLang('zh-TW'), 'zh');
    assert.equal(normalizeLang('fr'), 'en');
    assert.equal(normalizeLang('ko-KR'), 'ko');
  });

  test('지역·문자 변형과 대소문자를 가리지 않는다', () => {
    for (const tag of ['ko', 'KO-kr', 'ko_KR']) assert.equal(normalizeLang(tag), 'ko', tag);
    for (const tag of ['ja', 'JA', 'ja_JP', 'ja-Jpan-JP']) assert.equal(normalizeLang(tag), 'ja', tag);
    for (const tag of ['zh', 'zh-Hans', 'zh-Hant', 'zh-Hant-HK', 'zh-SG', 'zh_CN', 'ZH-tw']) {
      assert.equal(normalizeLang(tag), 'zh', tag);
    }
  });

  test('그 밖의 언어는 모두 en — 모르는 언어를 한국어로 떨어뜨리지 않는다', () => {
    for (const tag of ['en', 'en-US', 'fr-FR', 'es', 'vi-VN', 'th', 'de', 'ru', 'kok', 'jam']) {
      assert.equal(normalizeLang(tag), 'en', tag);
    }
  });

  test('빈 값·비문자열은 기본 언어다', () => {
    for (const tag of ['', '   ', undefined, null, 42]) assert.equal(normalizeLang(tag), DEFAULT_LANG);
  });

  test('지원 언어는 ko·en·ja·zh 네 개다', () => {
    assert.deepEqual([...LANGS], ['ko', 'en', 'ja', 'zh']);
    for (const lang of LANGS) assert.equal(isLang(lang), true, lang);
    for (const value of ['fr', 'zh-CN', 'ja-JP', '', null, undefined]) assert.equal(isLang(value), false);
  });

  test('언어 전환 버튼 이름은 모든 언어에 있고 자기 언어로 적는다', () => {
    assert.deepEqual(Object.keys(LANG_NAMES), [...LANGS]);
    assert.equal(LANG_NAMES.ko, '한국어');
    assert.equal(LANG_NAMES.en, 'English');
    assert.ok(KANA.test(LANG_NAMES.ja) || HAN.test(LANG_NAMES.ja));
    assert.ok(HAN.test(LANG_NAMES.zh) && !KANA.test(LANG_NAMES.zh));
  });
});

describe('안전 문구 검수 스위치', () => {
  test('환경변수 이름이 spec 4.17 과 같다', () => {
    assert.deepEqual(
      { ...SAFETY_REVIEW_ENV },
      {
        ja: 'NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA',
        zh: 'NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_ZH',
      },
    );
  });

  test("값이 정확히 '1' 일 때만 켜진다", () => {
    assert.deepEqual({ ...readSafetyReview({ ja: '1', zh: '1' }) }, { ja: true, zh: true });
    for (const value of [undefined, null, '', '0', 'true', 'TRUE', 'yes', 'on', ' 1', '1 ', '01', 1, true]) {
      assert.deepEqual(
        { ...readSafetyReview({ ja: value, zh: value }) },
        { ja: false, zh: false },
        `값 ${JSON.stringify(value)}`,
      );
    }
    assert.deepEqual({ ...readSafetyReview() }, { ja: false, zh: false });
  });

  test('ja·zh 스위치는 서로 독립이다', () => {
    assert.deepEqual({ ...readSafetyReview({ ja: '1' }) }, { ja: true, zh: false });
    assert.deepEqual({ ...readSafetyReview({ zh: '1' }) }, { ja: false, zh: true });
  });

  test('현재 값은 그 환경변수에서 읽는다 (기본 꺼짐)', () => {
    assert.deepEqual(
      { ...SAFETY_COPY_REVIEWED },
      {
        ...readSafetyReview({
          ja: process.env.NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA,
          zh: process.env.NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_ZH,
        }),
      },
    );
    assert.ok(Object.isFrozen(SAFETY_COPY_REVIEWED));
  });

  test('Next.js 가 빌드 때 치환하도록 process.env.<이름> 을 글자 그대로 쓴다', () => {
    // 구조 분해·동적 키로 읽으면 브라우저 번들에서는 늘 꺼짐이 된다
    const source = readFileSync(new URL('../src/i18n/index.js', import.meta.url), 'utf8');
    assert.ok(source.includes('process.env.NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_JA'));
    assert.ok(source.includes('process.env.NEXT_PUBLIC_SAFEHOUR_SAFETY_COPY_REVIEWED_ZH'));
  });
});

describe('규칙 43 — 안전 문구 병기 언어 (safetyPair)', () => {
  test('ko 사용자는 한국어+영어 (스위치와 무관)', () => {
    for (const flags of [OFF, ON]) assert.deepEqual(safetyPair('ko', flags), { primary: 'ko', secondary: 'en' });
  });

  test('en 사용자는 영어+한국어 (스위치와 무관)', () => {
    for (const flags of [OFF, ON]) assert.deepEqual(safetyPair('en', flags), { primary: 'en', secondary: 'ko' });
  });

  test('ja 사용자: 스위치 꺼짐이면 영어+한국어, 켜짐이면 일본어+한국어', () => {
    assert.deepEqual(safetyPair('ja', OFF), { primary: 'en', secondary: 'ko' });
    assert.deepEqual(safetyPair('ja', ON), { primary: 'ja', secondary: 'ko' });
  });

  test('zh 사용자: 스위치 꺼짐이면 영어+한국어, 켜짐이면 중국어+한국어', () => {
    assert.deepEqual(safetyPair('zh', OFF), { primary: 'en', secondary: 'ko' });
    assert.deepEqual(safetyPair('zh', ON), { primary: 'zh', secondary: 'ko' });
  });

  test('한 언어의 스위치가 다른 언어를 켜지 않는다', () => {
    assert.deepEqual(safetyPair('zh', { ja: true, zh: false }), { primary: 'en', secondary: 'ko' });
    assert.deepEqual(safetyPair('ja', { ja: false, zh: true }), { primary: 'en', secondary: 'ko' });
    // 'true' 같은 느슨한 값은 켜짐이 아니다 — 스위치는 readSafetyReview 로만 만든다
    assert.deepEqual(safetyPair('ja', { ja: 'true', zh: 1 }), { primary: 'en', secondary: 'ko' });
  });

  test('스위치를 넘기지 않으면 빌드 시점 값을 쓴다', () => {
    for (const lang of LANGS) assert.deepEqual(safetyPair(lang), safetyPair(lang, SAFETY_COPY_REVIEWED));
  });

  test('지원하지 않는 값은 기본 언어 규칙을 따른다', () => {
    for (const lang of ['fr', '', undefined, null]) {
      assert.deepEqual(safetyPair(lang, OFF), safetyPair(DEFAULT_LANG, OFF), String(lang));
    }
  });

  test('두 줄은 늘 서로 다른 언어이고, 한국어가 빠지는 것은 주 언어가 한국어일 때뿐이다', () => {
    for (const lang of LANGS) {
      for (const flags of [OFF, ON]) {
        const { primary, secondary } = safetyPair(lang, flags);
        assert.notEqual(primary, secondary);
        assert.ok(isLang(primary) && isLang(secondary));
        if (primary === 'ko') assert.equal(secondary, 'en');
        else assert.equal(secondary, 'ko');
      }
    }
  });
});

describe('규칙 43 — 화면에 보이는 안전 문구', () => {
  test('ja 사용자의 상태 메시지: 스위치 꺼짐 → 영어+한국어', () => {
    const { primary, secondary } = safetyPair('ja', OFF);
    const top = stateMessage(STATE.NO_TOURISM, primary);
    assert.equal(top.message, STATE_MESSAGE.NO_TOURISM.en);
    assert.equal(top.action, STATE_MESSAGE.NO_TOURISM.action.en);
    assert.equal(stateMessage(STATE.NO_TOURISM, secondary).message, STATE_MESSAGE.NO_TOURISM.ko);
  });

  test('ja 사용자의 상태 메시지: 스위치 켜짐 → 일본어+한국어', () => {
    const { primary, secondary } = safetyPair('ja', ON);
    assert.equal(stateMessage(STATE.STANDBY, primary).message, STATE_MESSAGE.STANDBY.ja);
    assert.equal(stateMessage(STATE.STANDBY, secondary).message, STATE_MESSAGE.STANDBY.ko);
  });

  test('ko 사용자의 상태 메시지는 한국어+영어', () => {
    const { primary, secondary } = safetyPair('ko', OFF);
    assert.equal(stateMessage(STATE.TOGETHER, primary).message, STATE_MESSAGE.TOGETHER.ko);
    assert.equal(stateMessage(STATE.TOGETHER, secondary).message, STATE_MESSAGE.TOGETHER.en);
  });

  test('사유 문구도 같은 규칙을 따른다 (새 사유 코드 포함)', () => {
    for (const code of [REASON.OUTING_FORBIDDEN, REASON.DAILY_CHECK_PENDING, REASON.MENU_UNKNOWN]) {
      assert.equal(reasonText(code, safetyPair('zh', OFF).primary), REASON_TEXT[code].en, code);
      assert.equal(reasonText(code, safetyPair('zh', ON).primary), REASON_TEXT[code].zh, code);
      assert.equal(reasonText(code, safetyPair('ja', ON).primary), REASON_TEXT[code].ja, code);
      assert.equal(reasonText(code, safetyPair('ko', OFF).secondary), REASON_TEXT[code].en, code);
    }
  });

  test('고지 본문도 주 언어로 고른다', () => {
    const lead = LEGAL_SECTIONS.find((s) => s.id === 'summary').lead;
    assert.equal(pickText(lead, safetyPair('ja', OFF).primary), lead.en);
    assert.equal(pickText(lead, safetyPair('ja', ON).primary), lead.ja);
    assert.equal(pickText(lead, safetyPair('zh', ON).primary), lead.zh);
    assert.equal(pickText(lead, safetyPair('ko', OFF).primary), lead.ko);
  });

  test('안전 문구 키는 화면 t() 에서 주 언어로 보인다 (복귀 안내·고지)', () => {
    for (const key of ['return.title', 'return.body', 'home.p1Title', 'state.NO_TOURISM']) {
      assert.equal(displayText(key, 'ja', undefined, OFF), UI_TEXT[key].en, key);
      assert.equal(displayText(key, 'ja', undefined, ON), UI_TEXT[key].ja, key);
      assert.equal(displayText(key, 'zh', undefined, OFF), UI_TEXT[key].en, key);
      assert.equal(displayText(key, 'ko', undefined, OFF), UI_TEXT[key].ko, key);
      assert.equal(displayText(key, 'en', undefined, OFF), UI_TEXT[key].en, key);
    }
  });

  test('일반 화면 문구는 스위치와 무관하게 ja·zh 번역을 그대로 쓴다', () => {
    for (const key of ['common.back', 'today.header', 'place.header']) {
      assert.equal(isSafetyKey(key), false, key);
      assert.equal(displayText(key, 'ja', undefined, OFF), UI_TEXT[key].ja, key);
      assert.equal(displayText(key, 'zh', undefined, OFF), UI_TEXT[key].zh, key);
    }
  });

  test('safetyText 는 병기할 두 줄을 언어와 함께 준다', () => {
    assert.deepEqual(safetyText('return.body', 'zh', undefined, OFF), {
      primary: { lang: 'en', text: UI_TEXT['return.body'].en },
      secondary: { lang: 'ko', text: UI_TEXT['return.body'].ko },
    });
    assert.deepEqual(safetyText('return.body', 'ko', undefined, OFF), {
      primary: { lang: 'ko', text: UI_TEXT['return.body'].ko },
      secondary: { lang: 'en', text: UI_TEXT['return.body'].en },
    });
    assert.deepEqual(safetyText('return.body', 'ja', undefined, ON).primary, {
      lang: 'ja',
      text: UI_TEXT['return.body'].ja,
    });
  });

  test('병기 양쪽 모두 자리표시자를 치환한다', () => {
    const { primary, secondary } = safetyText('return.deadline', 'ja', { time: '15:30' }, OFF);
    assert.ok(primary.text.includes('15:30') && !primary.text.includes('{time}'), primary.text);
    assert.ok(secondary.text.includes('15:30') && !secondary.text.includes('{time}'), secondary.text);
  });

  test('상태 라벨·복귀 안내·고지 3종이 안전 문구로 등록돼 있다', () => {
    const required = [
      ...Object.values(STATE).map((s) => `state.${s}`),
      'return.title',
      'return.body',
      'return.note',
      'return.notePlace',
      'home.p1Title',
      'home.p1Body',
      'home.p2Title',
      'home.p2Body',
      'home.p3Title',
      'home.p3Body',
      'home.footer',
      'privacy.intro',
    ];
    for (const key of required) assert.ok(SAFETY_KEYS.has(key), `${key} 가 안전 문구가 아니다`);
  });
});

describe('이름공간 등록', () => {
  test('16개 이름공간이 모두 미리 만들어져 등록돼 있다', () => {
    assert.deepEqual([...NAMESPACE_NAMES].sort(), [...EXPECTED_NAMESPACES].sort());
    assert.deepEqual(Object.keys(NAMESPACES).sort(), [...EXPECTED_NAMESPACES].sort());
    for (const name of EXPECTED_NAMESPACES) {
      assert.ok(
        existsSync(new URL(`../src/i18n/messages/${name}.js`, import.meta.url)),
        `${name}.js 파일 없음`,
      );
    }
  });

  test('모든 이름공간 파일이 messages·safety 두 구역을 내보낸다', () => {
    for (const [name, ns] of Object.entries(NAMESPACES)) {
      for (const section of ['messages', 'safety']) {
        const table = ns[section];
        assert.ok(table && typeof table === 'object' && !Array.isArray(table), `${name}.${section}`);
      }
    }
  });

  test('이름공간·구역마다 4개 언어의 키 집합이 같다', () => {
    const problems = [];
    for (const [name, ns] of Object.entries(NAMESPACES)) {
      for (const section of ['messages', 'safety']) {
        const keys = Object.keys(ns[section]).sort();
        for (const lang of LANGS) {
          const present = keys.filter((key) => {
            const value = ns[section][key]?.[lang];
            return typeof value === 'string' && value.trim() !== '';
          });
          if (present.length !== keys.length) {
            const missing = keys.filter((k) => !present.includes(k));
            problems.push(`${name}.${section}.${lang}: ${missing.join(', ')}`);
          }
        }
        for (const key of keys) {
          const extra = Object.keys(ns[section][key]).filter((lang) => !LANGS.includes(lang));
          if (extra.length) problems.push(`${name}.${section} ${key}: 모르는 언어 ${extra.join(', ')}`);
        }
      }
    }
    assert.deepEqual(problems, [], `번역 누락:\n${problems.join('\n')}`);
  });

  test('키는 이름공간 이름(또는 등록된 기존 접두사)으로 시작한다', () => {
    const wrong = [];
    for (const [name, ns] of Object.entries(NAMESPACES)) {
      const prefixes = [`${name}.`, ...(LEGACY_PREFIXES[name] ?? [])];
      for (const section of ['messages', 'safety']) {
        for (const key of Object.keys(ns[section])) {
          if (!prefixes.some((p) => key.startsWith(p))) wrong.push(`${name}: ${key}`);
        }
      }
    }
    assert.deepEqual(wrong, [], `이름공간 밖 키: ${wrong.join(', ')}`);
  });

  test('기존 접두사는 이름공간 한 곳에만 속한다', () => {
    const owner = new Map();
    for (const [name, prefixes] of Object.entries(LEGACY_PREFIXES)) {
      assert.ok(NAMESPACE_NAMES.includes(name), `${name} 은 등록된 이름공간이 아니다`);
      for (const prefix of prefixes) {
        assert.ok(!owner.has(prefix), `${prefix} 가 ${owner.get(prefix)}·${name} 두 곳에 있다`);
        assert.ok(
          !NAMESPACE_NAMES.some((n) => `${n}.` === prefix),
          `${prefix} 는 다른 이름공간 이름과 같다`,
        );
        owner.set(prefix, name);
      }
    }
  });

  test('한 키는 한 곳에만 정의된다', () => {
    const seen = new Map();
    const dup = [];
    for (const [name, ns] of Object.entries(NAMESPACES)) {
      for (const section of ['messages', 'safety']) {
        for (const key of Object.keys(ns[section])) {
          if (seen.has(key)) dup.push(`${key} (${seen.get(key)}, ${name}.${section})`);
          seen.set(key, `${name}.${section}`);
        }
      }
    }
    assert.deepEqual(dup, [], `중복 키: ${dup.join(', ')}`);
  });

  test('UI_TEXT 는 모든 이름공간을 평평하게 합친 것이고, SAFETY_KEYS 는 safety 구역과 같다', () => {
    let total = 0;
    const safety = new Set();
    for (const ns of Object.values(NAMESPACES)) {
      for (const section of ['messages', 'safety']) {
        for (const [key, entry] of Object.entries(ns[section])) {
          total += 1;
          assert.equal(UI_TEXT[key], entry, key);
          if (section === 'safety') safety.add(key);
        }
      }
    }
    assert.equal(Object.keys(UI_TEXT).length, total);
    assert.deepEqual([...SAFETY_KEYS].sort(), [...safety].sort());
  });

  test('4개 언어의 자리표시자 집합이 같다', () => {
    const mismatched = [];
    for (const [key, entry] of Object.entries(UI_TEXT)) {
      const base = placeholders(entry.ko);
      for (const lang of LANGS) {
        if (JSON.stringify(placeholders(entry[lang])) !== JSON.stringify(base)) mismatched.push(`${key}.${lang}`);
      }
    }
    assert.deepEqual(mismatched, [], `자리표시자 불일치: ${mismatched.join(', ')}`);
  });
});

describe('ja·zh 번역 채움 (검수 전)', () => {
  test('상태 메시지·행동 안내·사유 문구가 4개 언어를 모두 가진다', () => {
    const missing = [];
    for (const state of Object.values(STATE)) {
      const entry = STATE_MESSAGE[state];
      for (const lang of LANGS) {
        if (!entry?.[lang]?.trim()) missing.push(`STATE_MESSAGE.${state}.${lang}`);
        if (!entry?.action?.[lang]?.trim()) missing.push(`STATE_MESSAGE.${state}.action.${lang}`);
      }
    }
    for (const code of Object.values(REASON)) {
      for (const lang of LANGS) {
        if (!REASON_TEXT[code]?.[lang]?.trim()) missing.push(`REASON_TEXT.${code}.${lang}`);
      }
    }
    assert.deepEqual(missing, [], `누락: ${missing.join(', ')}`);
  });

  test('ja·zh 가 한국어·영어를 그대로 복사하지 않았고 서로도 다르다', () => {
    const copied = [];
    for (const { where, entry } of allTranslatedEntries()) {
      for (const lang of ['ja', 'zh']) {
        if (entry[lang] === entry.ko || entry[lang] === entry.en) copied.push(`${where}.${lang}`);
      }
      if (entry.ja === entry.zh) copied.push(`${where}: ja=zh`);
    }
    assert.deepEqual(copied, [], `복사본: ${copied.join(', ')}`);
  });

  test('문자 체계: 한글이 남지 않았고, ja 는 일본어 문자·zh 는 한자이며 가나가 없다', () => {
    const wrong = [];
    for (const { where, entry } of allTranslatedEntries()) {
      if (HANGUL.test(entry.ja)) wrong.push(`${where}.ja 한글`);
      if (HANGUL.test(entry.zh)) wrong.push(`${where}.zh 한글`);
      if (!KANA.test(entry.ja) && !HAN.test(entry.ja)) wrong.push(`${where}.ja 일본어 문자 없음`);
      if (!HAN.test(entry.zh)) wrong.push(`${where}.zh 한자 없음`);
      if (KANA.test(entry.zh)) wrong.push(`${where}.zh 가나`);
    }
    assert.deepEqual(wrong, [], wrong.join('\n'));
  });

  test("안전을 단정하지 않는다 ('안전합니다' 금지와 같은 규칙)", () => {
    const banned = {
      ko: /안전합니다|안전해요/,
      ja: /安全です|安全でした|安全だ|安全を保証|安全が保証|安全であ|安心です/,
      zh: /是安全的|很安全|安全无虞|保证安全|确保安全|绝对安全|可以放心/,
    };
    const offenders = [];
    for (const { where, entry } of allTranslatedEntries()) {
      for (const [lang, pattern] of Object.entries(banned)) {
        if (pattern.test(entry[lang])) offenders.push(`${where}.${lang}: ${entry[lang]}`);
      }
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
  });
});

describe('누락은 조용히 비지 않는다', () => {
  test('없는 키·코드는 키·코드 자체를 돌려준다 (모든 언어)', () => {
    for (const lang of LANGS) {
      assert.equal(translate('nope.missing', lang), 'nope.missing');
      assert.equal(displayText('nope.missing', lang, undefined, OFF), 'nope.missing');
      assert.equal(reasonText('UNKNOWN_CODE', lang), 'UNKNOWN_CODE');
      assert.equal(stateMessage('WHATEVER', lang), null);
    }
    const pair = safetyText('nope.missing', 'ja', undefined, OFF);
    assert.equal(pair.primary.text, 'nope.missing');
    assert.equal(pair.secondary.text, 'nope.missing');
  });

  test('한 언어가 비면 영어, 그다음 한국어로 떨어진다 — 빈 문자열도 누락으로 본다', () => {
    assert.equal(pickText({ ko: '가', en: 'A' }, 'ja'), 'A');
    assert.equal(pickText({ ko: '가', en: 'A', ja: '' }, 'ja'), 'A');
    assert.equal(pickText({ ko: '가', en: '  ' }, 'zh'), '가');
    assert.equal(pickText({ ko: '가', en: 'A', zh: '甲' }, 'zh'), '甲');
    assert.equal(pickText({}, 'ja'), null);
    assert.equal(pickText(undefined, 'ja'), null);
  });
});

describe('판정은 언어와 무관하다 — i18n 은 표시 계층에만 있다', () => {
  test('판정·일정·서버 모듈이 i18n 을 가져오지 않는다', () => {
    const roots = ['src/engine', 'src/stay', 'src/recovery', 'lib/server', 'app/api'];
    // 예외 (AX-309 · spec 4.16): AI 일정 소개 모듈은 대체 템플릿(aiIntro 이름공간) 한 파일만 읽는다.
    // 소개 문장은 표시 문구이고 판정 입력이 아니다. 이 파일도 다른 i18n 모듈(런타임·검수 스위치)은 가져오지 못한다.
    const ALLOWED_I18N_IMPORTS = {
      [join('lib', 'server', 'ai-intro.js')]: ['../../src/i18n/messages/aiIntro.js'],
    };
    const offenders = [];
    const visit = (path) => {
      for (const entry of readdirSync(path)) {
        const full = join(path, entry);
        if (statSync(full).isDirectory()) {
          visit(full);
          continue;
        }
        if (!/\.(m?js)$/.test(full)) continue;
        const source = readFileSync(full, 'utf8');
        const allowed = ALLOWED_I18N_IMPORTS[full] ?? [];
        const i18nImports = [...source.matchAll(/from\s+['"]([^'"]*i18n[^'"]*)['"]/g)].map((m) => m[1]);
        if (i18nImports.some((spec) => !allowed.includes(spec)) || /SAFETY_COPY_REVIEWED/.test(source)) {
          offenders.push(full);
        }
      }
    };
    for (const root of roots) if (existsSync(root)) visit(root);
    assert.deepEqual(offenders, [], `판정 계층이 i18n 을 참조: ${offenders.join(', ')}`);
  });
});
