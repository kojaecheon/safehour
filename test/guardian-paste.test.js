// 받은 링크 붙여넣기 (docs/superpowers/plans/2026-11-15-server-push-guardian-ui.md Task 6, 정한 값 26 · docs/security.md '보호자 링크')
//
// /g 의 '받은 링크 붙여넣기' 절(components/guardian/PasteLink.js)이 쓰는 fragmentFromPasted 와 새 문구를 고정한다.
//   - 받는 글: 링크 전체, 메신저 문장 속 첫 http(s) 링크, '#암호문', '#' 없는 암호문(앞뒤 공백은 뺀다)
//   - 받지 않는 글: 다른 경로, 경로·쿼리에 실린 암호문, 형식이 틀린 암호문, 빈 글, 길이 상한을 넘는 글
//   - 글 속 링크가 여럿이면 첫 http(s) 토큰만 본다(어느 링크를 열지 추측하지 않는다)
//   - 공백·줄바꿈을 건너 이어 붙이지 않는다: '링크⏎PIN' 한 메시지에서 PIN 이 암호문에 붙으면 PIN 이 늘 틀리고,
//     다섯 번이면 링크가 잠기고, PIN 이 탭 저장소(lib/store/pendingGuardianLink.js 'PIN·평문 불가')에 남는다(독립 리뷰 I1)
//   - 링크 앞뒤에 붙은 문장부호·한중일 글자·보이지 않는 글자는 떼고 읽는다. 뒤에 붙은 - 와 _ 는 암호문 글자라 떼지 않는다(리뷰 m1).
//     그런 글은 대부분 정규 끝 검사에 걸려 null 이고, 길이 나머지 3 암호문 뒤의 하나만 다른 암호문이 된다(알려진 한계)
//   - 보이는 구분 없이 링크 바로 뒤에 붙은 PIN(폭 없는 글자로 갈린 것 포함)은 받지 않는다: 끝이 정규 base64url 이 아니거나,
//     끝의 PIN 모양 숫자를 떼어 낸 앞부분이 정규 암호문이면 null(독립 리뷰 2차 I1)
//   - base64url 글자인 - · _ 로 이은 PIN('링크-PIN', '링크__PIN')도 받지 않는다: 앞부분 끝의 - · _ 를 0~3개 떼어 보며
//     정규 암호문이 나오면 null. 끝이 - · _ 인 진짜 암호문은 떼기 전(0개)에 먼저 본다(독립 리뷰 3차 I1)
//   - 링크가 줄바꿈에서 끊긴 글, WhatsApp 서식(*링크*, ~링크~, _링크_)도 다룬다(2차 리뷰)
// 보이지 않는 글자는 이 파일과 src/guardian/link.js 에 그대로 쓰지 않고 이스케이프(\u200B 등)로 쓴다.
// 붙여넣기 절의 펼침 규칙과 받아들인 뒤 포커스 순서(components/guardian/pasteView.js, 순수 함수)도 여기서 고정한다.
// 붙여 넣은 글을 서버로 보내지 않고 주소창에 싣지 않는 것은 화면의 몫이다(화면 테스트 Task 8).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { PASTE_MAX_CHARS, buildGuardianLink, fragmentFromPasted } from '../src/guardian/link.js';
import * as guardianEntry from '../src/guardian/index.js';
import { readFileSync } from 'node:fs';
import { PIN_LENGTH, fromBase64Url, isGuardianFragment, isValidPin, toBase64Url } from '../src/guardian/crypto.js';
import { messages as guardianMessages, safety as guardianSafety } from '../src/i18n/messages/guardian.js';
import { UI_TEXT } from '../src/i18n/messages/index.js';
import { LANGS } from '../src/i18n/index.js';
import {
  INCOMING_STATUS_ID,
  LOGIN_TITLE_ID,
  PASTE_FOCUS_ORDER,
  PIN_ENTRY_TITLE_ID,
  initialPasteFold,
  pasteDefaultOpen,
  pasteFocusTarget,
  pasteFoldAfterAccept,
  pasteFoldAfterToggle,
  pasteFoldOpen,
} from '../components/guardian/pasteView.js';

const ORIGIN = 'https://safehour.example';
/** 형식에 맞는 암호문 둘(base64url 80자, 테스트 전용: 풀리지 않는 값이다) */
const FRAGMENT = 'Ab0_-xYz'.repeat(10);
const OTHER_FRAGMENT = 'Zz9-_QwE'.repeat(10);
/**
 * 길이를 4로 나눈 나머지가 0·2·3 인 암호문. 나머지 1 은 base64url 암호문 길이가 될 수 없다(isGuardianFragment 가 거른다).
 * 끝 글자는 정규 base64url 이다(나머지 2 는 A·Q·g·w, 나머지 3 은 값이 4의 배수): 'g' 는 32, 'k' 는 36
 */
const FRAGMENTS_BY_MOD4 = [FRAGMENT, `${FRAGMENT}Qg`, `${FRAGMENT}Q7k`];
/** 실제 암호문과 같은 길로 만든 암호문(crypto.js toBase64Url, 바이트 300·301·302 → 400·402·403자) */
const encodedFragment = (bytes) => toBase64Url(Uint8Array.from({ length: bytes }, (_, i) => (i * 37 + 11) % 256));
const ENCODED_BY_MOD4 = [300, 301, 302].map(encodedFragment);
const PIN = '246810';
/** \uB05D\uC790\uB9AC\uAC00 0~9 \uC778 PIN \uC5F4 \uAC1C: \uB05D\uC790\uB9AC\uAC00 0\u00B74\u00B78 \uC774\uBA74 \uAE38\uC774 \uB098\uBA38\uC9C0 3 \uC758 \uC815\uADDC \uB05D\uC774 \uB41C\uB2E4 */
const PINS_BY_LAST_DIGIT = Array.from({ length: 10 }, (_, digit) => `13579${digit}`);
/** PIN \uACFC \uB9C1\uD06C \uC0AC\uC774\uC5D0 \uB080 base64url \uAE00\uC790(- \u00B7 _). 1~3\uAC1C\uC640 \uADF8\uBCF4\uB2E4 \uAE34 \uAC83 */
const JOINERS = ['-', '_', '--', '__', '-_', '_-', '---', '___', '----', '_-_-_'];
/** \uB05D\uC744 \uBC14\uAFBC \uAE38\uC774 \uB098\uBA38\uC9C0 0 \uC554\uD638\uBB38\uC744 \uBC14\uC774\uD2B8\uB85C \uB418\uB3CC\uB824 toBase64Url \uB85C \uB2E4\uC2DC \uB9CC\uB4E0\uB2E4(\uBE4C\uB354\uAC00 \uC2E4\uC81C\uB85C \uB0B4\uB294 \uAC12) */
const encodedEndingWith = (tail) => toBase64Url(fromBase64Url(`${ENCODED_BY_MOD4[0].slice(0, -tail.length)}${tail}`));
const ZWSP = '\u200B';
/** 붙여넣기 해석이 지우는 보이지 않는 글자 전부(link.js INVISIBLE_RE 와 같은 목록) */
const INVISIBLES = ['\u00AD', '\u200B', '\u200C', '\u200D', '\u200E', '\u200F', '\u2060', '\uFEFF'];

const PASTE_KEYS = [
  'guardian.pasteTitle',
  'guardian.pasteLabel',
  'guardian.pasteHelp',
  'guardian.pasteOpen',
  'guardian.pasteInvalid',
  'guardian.pasteHoldFailed',
];

describe('fragmentFromPasted', () => {
  test('링크 전체, 앞뒤 공백, 메신저 문장 속 링크, #암호문, # 없는 암호문을 받는다', () => {
    assert.equal(isGuardianFragment(FRAGMENT), true);
    const link = buildGuardianLink(ORIGIN, FRAGMENT);
    for (const text of [
      link,
      `  ${link}\n`,
      `${ORIGIN}/g/#${FRAGMENT}`,
      `${ORIGIN}/g?utm_source=chat#${FRAGMENT}`,
      `보호자 링크예요 ${link} PIN은 따로 보낼게요`,
      `SafeHour guardian link:\n${link}\nThe PIN comes separately.`,
      `#${FRAGMENT}`,
      `  #${FRAGMENT}  `,
      FRAGMENT,
      `\t${FRAGMENT}\n`,
    ]) {
      assert.equal(fragmentFromPasted(text), FRAGMENT, JSON.stringify(text).slice(0, 80));
    }
  });

  test('다른 경로(/x#...), 쿼리에 암호문, 형식이 틀린 암호문, 빈 글은 null', () => {
    for (const text of [
      // 끝이 정규 base64url 이 아닌 암호문(나머지 2 의 끝 '7' 은 값 59, 'E' 는 값 4): 우리가 만든 링크가 아니다
      `${FRAGMENT}Q7`,
      `${FRAGMENT}QE`,
      `${ORIGIN}/g#${FRAGMENT}Q7`,
      `보호자 링크 ${ORIGIN}/g#${FRAGMENT}QE 입니다`,
      `${ORIGIN}/x#${FRAGMENT}`,
      `${ORIGIN}/guardian#${FRAGMENT}`,
      `${ORIGIN}/#${FRAGMENT}`,
      `링크예요 ${ORIGIN}/x#${FRAGMENT}`,
      `${ORIGIN}/g?c=${FRAGMENT}`,
      `${ORIGIN}/g/${FRAGMENT}`,
      `${ORIGIN}/g`,
      `${ORIGIN}/g#`,
      `ftp://safehour.example/g#${FRAGMENT}`,
      `javascript:alert(1)#${FRAGMENT}`,
      `#${FRAGMENT}!`,
      `${FRAGMENT}!`,
      `${FRAGMENT} ${FRAGMENT}`,
      '#abc',
      'abc',
      'PIN 246810',
      '',
      '   \n',
      null,
      undefined,
      42,
    ]) {
      assert.equal(fragmentFromPasted(text), null, JSON.stringify(text ?? String(text)).slice(0, 80));
    }
  });

  test('글 속 링크가 여럿이면 첫 http(s) 토큰만 본다', () => {
    const first = buildGuardianLink(ORIGIN, FRAGMENT);
    const second = buildGuardianLink(ORIGIN, OTHER_FRAGMENT);
    assert.equal(fragmentFromPasted(`먼저 ${first} 그리고 ${second}`), FRAGMENT);
    assert.equal(fragmentFromPasted(`먼저 ${second} 그리고 ${first}`), OTHER_FRAGMENT);
    // 첫 토큰이 보호자 링크가 아니면 뒤의 보호자 링크를 읽지 않는다
    assert.equal(fragmentFromPasted(`안내 https://example.com/help 그리고 ${first}`), null);
    assert.equal(fragmentFromPasted(`안내 http://example.com 그리고 ${first}`), null);
    assert.equal(fragmentFromPasted(`앱: https://safehour.example\n링크: ${first}`), null);
  });

  test('링크 뒤 줄바꿈·탭 다음의 PIN·글은 암호문에 붙지 않는다(길이 나머지 0·2·3 모두)', () => {
    assert.deepEqual(
      FRAGMENTS_BY_MOD4.map((f) => f.length % 4),
      [0, 2, 3],
    );
    assert.equal(isGuardianFragment(`${FRAGMENT}Q`), false, '나머지 1 은 암호문 길이가 아니다');
    for (const fragment of FRAGMENTS_BY_MOD4) {
      assert.equal(isGuardianFragment(fragment), true);
      const link = buildGuardianLink(ORIGIN, fragment);
      for (const text of [
        `${link}\n246810`,
        `${link}\r\n246810`,
        `${link}\t246810`,
        `${link}\nThanks`,
        `${link}\n----`,
        `${link}\n\n246810`,
        `${link} 246810`,
        `SafeHour\n${link}\n246810`,
        `${ORIGIN}/g?utm_source=chat#${fragment}\n246810`,
      ]) {
        assert.equal(fragmentFromPasted(text), fragment, `len%4=${fragment.length % 4} ${JSON.stringify(text.slice(-12))}`);
      }
      // '#' 있는·없는 암호문 뒤의 PIN 은 붙이지도, 떼어 읽지도 않는다
      for (const text of [`#${fragment}\n246810`, `${fragment}\n246810`, `${fragment}\r\n246810`, `#${fragment}\t246810`]) {
        assert.equal(fragmentFromPasted(text), null, `len%4=${fragment.length % 4} ${JSON.stringify(text.slice(-12))}`);
      }
    }
  });

  test('링크 끝 ASCII 문장부호, 앞뒤 괄호·따옴표·한중일 글자, 보이지 않는 글자는 떼고 읽는다', () => {
    const link = buildGuardianLink(ORIGIN, FRAGMENT);
    const half = 40;
    for (const text of [
      `${link}.`,
      `${link},`,
      `${link}!?`,
      `링크: ${link}.`,
      `(${link})`,
      `(링크 ${link}).`,
      `[${link}]`,
      `{${link}}`,
      `"${link}"`,
      `'${link}'`,
      `“${link}”`,
      `<${link}>`,
      `link <${link}> pin later`,
      `「${link}」`,
      `${link}。`,
      `リンク ${link}。`,
      `链接${link}，PIN另发`,
      `（링크 ${link}）`,
      `${link}${ZWSP}`,
      `${ZWSP}${link}`,
      `\uFEFF${link}`,
      `\u200E${link}\u200F`,
      `\u00A0${link}\u00A0`,
      ...INVISIBLES.map((mark) => `${link.slice(0, -half)}${mark}${link.slice(-half)}`),
      ...INVISIBLES.map((mark) => `${mark}${link}${mark}`),
    ]) {
      assert.equal(fragmentFromPasted(text), FRAGMENT, JSON.stringify(text.replace(FRAGMENT, '<F>')));
    }
  });

  test('스킴은 대소문자를 가리지 않는다(글 전체·문장 속 모두)', () => {
    const link = buildGuardianLink(ORIGIN, FRAGMENT);
    for (const text of [
      link.replace('https://', 'HTTPS://'),
      link.replace('https://', 'Https://'),
      `보호자 링크 ${link.replace('https://', 'HTTPS://')} 입니다`,
      `보호자 링크 ${link.replace('https://', 'HTTP://')} 입니다`,
      `(${link.replace('https://', 'HTTPS://')}).`,
    ]) {
      assert.equal(fragmentFromPasted(text), FRAGMENT, JSON.stringify(text.replace(FRAGMENT, '<F>')));
    }
  });

  test("'##암호문'과 '/g##암호문'은 받지 않는다", () => {
    for (const text of [`##${FRAGMENT}`, `  ##${FRAGMENT}\n`, `${ORIGIN}/g##${FRAGMENT}`, `링크 ${ORIGIN}/g##${FRAGMENT} 입니다`]) {
      assert.equal(fragmentFromPasted(text), null, JSON.stringify(text.replace(FRAGMENT, '<F>')));
    }
  });

  test('링크 바로 뒤에 붙은 - 와 _ 는 정규 끝 검사로 대부분 거른다(나머지 3 암호문은 알려진 한계)', () => {
    // 80자 + 1자 = 81자(나머지 1): 형식이 아니라 받지 않는다
    for (const tail of ['-', '_']) {
      assert.equal(fragmentFromPasted(`${buildGuardianLink(ORIGIN, FRAGMENT)}${tail}`), null, tail);
    }
    assert.equal(fragmentFromPasted(`_${buildGuardianLink(ORIGIN, FRAGMENT)}-`), null, '_..-');
    // 82자 + 1자 = 83자(나머지 3): 끝 글자(- 는 62, _ 는 63)가 4의 배수가 아니라 받지 않는다
    const even = FRAGMENTS_BY_MOD4[1];
    for (const tail of ['-', '_']) {
      assert.equal(fragmentFromPasted(`${buildGuardianLink(ORIGIN, even)}${tail}`), null, tail);
      assert.equal(fragmentFromPasted(`보호자 링크 ${buildGuardianLink(ORIGIN, even)}${tail} 입니다`), null, `문장 속 ${tail}`);
    }
    // 알려진 한계: 83자 + 1자 = 84자(나머지 0)는 정규 암호문이 되어 다른 암호문을 연다(PIN 이 맞지 않는다고 나온다, PIN 은 붙지 않는다)
    const odd = FRAGMENTS_BY_MOD4[2];
    for (const tail of ['-', '_']) {
      assert.equal(fragmentFromPasted(`${buildGuardianLink(ORIGIN, odd)}${tail}`), `${odd}${tail}`, tail);
    }
    // 같은 한계: PIN 없이 붙은 - · _ 가 길이를 나머지 0 으로 맞추면(나머지 2 뒤 2개) 떼지 못한다
    for (const tail of ['--', '_-']) {
      assert.equal(fragmentFromPasted(`${buildGuardianLink(ORIGIN, even)}${tail}`), `${even}${tail}`, tail);
    }
  });

  test('보이는 구분 없이 붙은 PIN: 모든 붙임 모양·길이 나머지 0·2·3 에서 null 이다(임시 보관에 PIN 이 닿지 않는다)', () => {
    // PIN 규칙(crypto.js): 정확히 6자리 ASCII 숫자
    assert.equal(PIN_LENGTH, 6);
    assert.equal(isValidPin(PIN), true);
    const fragments = [...FRAGMENTS_BY_MOD4, ...ENCODED_BY_MOD4];
    assert.deepEqual(
      fragments.map((f) => f.length % 4),
      [0, 2, 3, 0, 2, 3],
    );
    for (const fragment of fragments) {
      assert.equal(isGuardianFragment(fragment), true);
      assert.equal(fragmentFromPasted(fragment), fragment, '붙이지 않은 암호문은 받는다');
      const link = buildGuardianLink(ORIGIN, fragment);
      for (const between of ['', ...INVISIBLES]) {
        for (const text of [
          `${link}${between}${PIN}`,
          `#${fragment}${between}${PIN}`,
          `${fragment}${between}${PIN}`,
          `보호자 링크 ${link}${between}${PIN}`,
          `보호자 링크 ${link}${between}${PIN} 입니다`,
          `(${link}${between}${PIN}).`,
        ]) {
          const label = `len%4=${fragment.length % 4} between=${JSON.stringify(between)} ${JSON.stringify(text.replace(fragment, '<F>'))}`;
          assert.equal(fragmentFromPasted(text), null, label);
        }
      }
    }
  });

  test('- · _ 로 이은 PIN: 길이 나머지 0·2·3, 이음 글자 1~3개(와 그보다 긴 것), PIN 끝자리 0~9 모두 null(3차 I1)', () => {
    assert.ok(PINS_BY_LAST_DIGIT.every(isValidPin));
    assert.deepEqual(
      PINS_BY_LAST_DIGIT.map((pin) => pin.at(-1)),
      [...'0123456789'],
    );
    const fragments = [...FRAGMENTS_BY_MOD4, ...ENCODED_BY_MOD4];
    for (const fragment of fragments) {
      const link = buildGuardianLink(ORIGIN, fragment);
      for (const joiner of JOINERS) {
        for (const pin of PINS_BY_LAST_DIGIT) {
          for (const text of [
            `${link}${joiner}${pin}`,
            `#${fragment}${joiner}${pin}`,
            `${fragment}${joiner}${pin}`,
            `보호자 링크 ${link}${joiner}${ZWSP}${pin} 입니다`,
          ]) {
            const label = `len%4=${fragment.length % 4} joiner=${JSON.stringify(joiner)} pin=${pin} ${JSON.stringify(text.replace(fragment, '<F>'))}`;
            assert.equal(fragmentFromPasted(text), null, label);
          }
        }
      }
    }
  });

  test('끝이 - · _ 인 진짜 암호문: 그대로는 받고, PIN 을 붙이면(이음 글자가 있든 없든) null', () => {
    for (const tail of ['-', '_', '-_', '__', '---']) {
      const fragment = encodedEndingWith(tail);
      assert.ok(fragment.endsWith(tail), tail);
      assert.equal(fragment.length % 4, 0, tail);
      assert.equal(toBase64Url(fromBase64Url(fragment)), fragment, `${tail} 는 빌더가 내는 값`);
      const link = buildGuardianLink(ORIGIN, fragment);
      for (const text of [link, `#${fragment}`, fragment, `보호자 링크 ${link} 입니다`, `${link}\n${PIN}`, `*${link}*`]) {
        assert.equal(fragmentFromPasted(text), fragment, `${tail} ${JSON.stringify(text.replace(fragment, '<F>'))}`);
      }
      for (const joiner of ['', ...JOINERS]) {
        for (const pin of PINS_BY_LAST_DIGIT) {
          for (const text of [`${link}${joiner}${pin}`, `#${fragment}${joiner}${pin}`, `${fragment}${joiner}${pin}`]) {
            const label = `tail=${tail} joiner=${JSON.stringify(joiner)} pin=${pin}`;
            assert.equal(fragmentFromPasted(text), null, label);
          }
        }
      }
    }
  });

  test('끝이 숫자여도 PIN 을 떼어 낸 앞부분이 정규 암호문이 아니면 받는다(진짜 암호문을 막지 않는다)', () => {
    const head74 = FRAGMENT.slice(0, -7);
    const head72 = FRAGMENT.slice(0, -8);
    for (const fragment of [
      // 나머지 0, 끝 6자 숫자, 앞부분(74자, 나머지 2)의 끝 'B'(값 1)가 정규가 아니다
      `${head74}B${PIN}`,
      // 끝 7자·8자가 숫자: PIN 모양(숫자가 아닌 글자 뒤 6자리)이 아니다
      `${head74}9${PIN}`,
      `${FRAGMENT.slice(0, -9)}B98${PIN}`,
      // 나머지 3(끝 '0' 은 값 52): 앞부분이 나머지 1 이고 끝이 - · _ 가 아니라 떼어 볼 것이 없다
      `${FRAGMENT}g${PIN}`,
      `${FRAGMENT.slice(1)}g9${PIN}`,
      // 나머지 0, 앞부분(74자) 끝 'B-'·'B_': 하나를 떼면 나머지 1, 'B' 는 이음 글자가 아니라 더 떼지 않는다
      `${head72}B-${PIN}`,
      `${head72}B_${PIN}`,
      // 이음 글자가 아닌 글자를 건너뛰어 떼지 않는다: 'B' 너머의 83자(나머지 3, 끝 'k' 는 정규)에 닿지 않는다
      `${FRAGMENTS_BY_MOD4[2]}-B${PIN}`,
      `${FRAGMENTS_BY_MOD4[2]}-B-${PIN}`,
      // 최소 길이에 가까운 암호문(64자): 떼어 낸 앞부분(58자·56자)은 정규 끝이어도 암호문 최소 길이에 못 미친다
      `${'A'.repeat(57)}g${PIN}`,
      `${'A'.repeat(55)}w--${PIN}`,
    ]) {
      assert.equal(isGuardianFragment(fragment), true, fragment.slice(-8));
      assert.equal(fragmentFromPasted(fragment), fragment, fragment.slice(-8));
      assert.equal(fragmentFromPasted(buildGuardianLink(ORIGIN, fragment)), fragment, `link ${fragment.slice(-8)}`);
    }
    // 링크+PIN 과 구별할 수 없는 진짜 암호문은 받지 않는다. 진짜 암호문이 이 모양일 확률은 길이 나머지 0 이 약 9.2e-7
    // (앞부분 끝이 A·Q·g·w, 또는 - · _ 둘), 나머지 3 이 약 5.5e-7(앞부분 끝이 - · _), 나머지 2 는 0 이다
    for (const fragment of [`${head74}g${PIN}`, `${head72}--${PIN}`, `${head72}_-${PIN}`, `${FRAGMENT}-${PIN}`, `${FRAGMENT}_${PIN}`]) {
      assert.equal(isGuardianFragment(fragment), true, fragment.slice(-8));
      assert.equal(fragmentFromPasted(fragment), null, fragment.slice(-8));
    }
  });

  test('메신저 모양 그대로 붙여 넣으면 정확한 암호문을 받는다(길이 나머지 0·2·3)', () => {
    for (const fragment of [...FRAGMENTS_BY_MOD4, ...ENCODED_BY_MOD4]) {
      const link = buildGuardianLink(ORIGIN, fragment);
      for (const text of [
        // 카카오톡: 링크 줄바꿈 PIN, 제목 줄과 안내 줄
        `${link}\n${PIN}`,
        `[SafeHour] 보호자 링크\n${link}\n\nPIN은 따로 보낼게요`,
        // LINE(일본어 문장, 。), WeChat(중국어 문장, ，)
        `リンク ${link}。PINは別で送ります`,
        `链接${link}，PIN另发`,
        // WhatsApp: 여러 메시지 복사, 굵게·취소선·기울임
        `[15/11/2026, 10:00] Mom: ${link}\n[15/11/2026, 10:01] Mom: ${PIN}`,
        `*${link}*`,
        `~${link}~`,
        `_${link}_`,
        `*_${link}_*`,
        `_*${link}*_`,
        `링크: _${link}_.`,
        // iMessage: 링크만, 뒤 공백·줄바꿈
        link,
        `${link} \n`,
      ]) {
        const label = `len%4=${fragment.length % 4} ${JSON.stringify(text.replace(fragment, '<F>'))}`;
        assert.equal(fragmentFromPasted(text), fragment, label);
      }
    }
  });

  test('WhatsApp 기울임 표시 _ 는 링크 앞에 _ 가 있을 때 그 수만큼만 뗀다', () => {
    // 끝이 _ 인 암호문(나머지 0): 앞에 _ 가 하나면 하나만 떼어 암호문 끝의 _ 는 남긴다
    const underscored = `${'Ab0-xYzQ'.repeat(10).slice(0, -1)}_`;
    assert.equal(underscored.length % 4, 0);
    assert.equal(isGuardianFragment(underscored), true);
    const link = buildGuardianLink(ORIGIN, underscored);
    for (const text of [link, `_${link}_`, `보호자 링크 _${link}_ 입니다`, `*${link}*`, `~${link}~`]) {
      assert.equal(fragmentFromPasted(text), underscored, JSON.stringify(text.replace(underscored, '<F>')));
    }
    // 앞에 _ 가 없으면 끝의 _ 는 암호문 글자다: 떼지 않는다(나머지 2 + _ 는 정규 끝이 아니라 null)
    assert.equal(fragmentFromPasted(`*${buildGuardianLink(ORIGIN, FRAGMENTS_BY_MOD4[1])}_*`), null);
  });

  test('링크가 줄바꿈에서 끊겼으면(다음 줄이 긴 base64url 덩어리) 받지 않는다', () => {
    for (const fragment of [...FRAGMENTS_BY_MOD4, ...ENCODED_BY_MOD4]) {
      const link = buildGuardianLink(ORIGIN, fragment);
      for (const cut of [16, 40, 41, 42, 43]) {
        const head = link.slice(0, -cut);
        const tail = link.slice(-cut);
        for (const text of [
          `${head}\n${tail}`,
          `${head}\r\n${tail}`,
          `보호자 링크 ${head}\n${tail}\n${PIN}`,
          `보호자 링크 ${head}\r\n${tail} 입니다`,
          `${head}.\n${tail}`,
        ]) {
          const label = `len%4=${fragment.length % 4} cut=${cut} ${JSON.stringify(text.replace(head, '<H>').replace(tail, '<T>'))}`;
          assert.equal(fragmentFromPasted(text), null, label);
        }
      }
      // 다음 줄이 짧거나(PIN, 15자 이하) 링크 조각이 아니면 그대로 받는다
      for (const text of [`${link}\n${PIN}`, `${link}\n----`, `${link}\nThanks a lot`, `${link}\n\n${PIN}`, `${link}\n${'A'.repeat(15)}`]) {
        assert.equal(fragmentFromPasted(text), fragment, `len%4=${fragment.length % 4} ${JSON.stringify(text.slice(-16))}`);
      }
    }
  });

  test('보이지 않는 글자는 link.js 와 이 테스트 파일에 이스케이프로만 쓴다', () => {
    const invisible = /[\u00A0\u00AD\u200B-\u200F\u2060\uFEFF]/;
    for (const path of ['../src/guardian/link.js', './guardian-paste.test.js']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      assert.equal(invisible.test(source), false, path);
    }
  });

  test('글 길이 상한(입력란 maxLength 와 같은 값)을 넘으면 받지 않는다', () => {
    assert.equal(PASTE_MAX_CHARS, 32_768);
    const link = buildGuardianLink(ORIGIN, FRAGMENT);
    const atLimit = `${link}${' '.repeat(PASTE_MAX_CHARS - link.length)}`;
    assert.equal(atLimit.length, PASTE_MAX_CHARS);
    assert.equal(fragmentFromPasted(atLimit), FRAGMENT);
    assert.equal(fragmentFromPasted(`${atLimit} `), null);
    assert.equal(fragmentFromPasted(`https://safehour.example/g#${'A'.repeat(1_500_000)}`), null);
  });

  test('링크 앞 서식 표시 묶음이 길어도 한 번만 훑는다(정규식 /[*_~]+$/ 의 제곱 시간 대신, 3차 리뷰 측정)', () => {
    const link = buildGuardianLink(ORIGIN, FRAGMENT);
    const run = PASTE_MAX_CHARS - link.length - 2;
    const cases = [
      // 묶음 뒤에 다른 글자(공백·x)가 오면 묶음은 링크 바로 앞이 아니다: '_' 를 세지 않는다
      [`${'*'.repeat(run)} ${link}`, FRAGMENT],
      [`${'*_~'.repeat(Math.floor(run / 3))}x${link}`, FRAGMENT],
      [`${'_'.repeat(run)}x${link}_`, null],
      // 링크 바로 앞의 긴 묶음: 든 '_' 수만큼 끝의 '_' 를 뗀다
      [`${'~'.repeat(run)}_${link}_`, FRAGMENT],
    ];
    const started = performance.now();
    for (const [text, expected] of cases) {
      assert.ok(text.length <= PASTE_MAX_CHARS, String(text.length));
      assert.equal(fragmentFromPasted(text), expected, JSON.stringify(text.slice(0, 8)));
    }
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 200, `${elapsed.toFixed(0)}ms`);
  });

  test('공개 진입점(src/guardian/index.js)이 같은 함수와 상한을 내보낸다', () => {
    assert.equal(guardianEntry.fragmentFromPasted, fragmentFromPasted);
    assert.equal(guardianEntry.PASTE_MAX_CHARS, PASTE_MAX_CHARS);
  });
});

describe('붙여넣기 문구', () => {
  test('새 문구 여섯 키는 네 언어가 있고 어느 언어에도 안전합니다가 없다', () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    for (const key of PASTE_KEYS) {
      const entry = guardianMessages[key];
      assert.ok(entry, `${key} 는 messages 에 있다`);
      assert.equal(guardianSafety[key], undefined, `${key} 는 safety 가 아니다`);
      assert.equal(UI_TEXT[key], entry);
      for (const lang of LANGS) {
        assert.equal(typeof entry[lang], 'string', `${key}.${lang}`);
        assert.ok(entry[lang].trim().length > 0, `${key}.${lang}`);
        assert.ok(!dashes.test(entry[lang]), `${key}.${lang} 에 대시`);
      }
      assert.ok(!/안전합니다|안전해요/.test(entry.ko), `${key}.ko`);
      assert.ok(!/\bsafe\b/i.test(entry.en), `${key}.en`);
      assert.ok(!/安全/.test(entry.ja), `${key}.ja`);
      assert.ok(!/安全/.test(entry.zh), `${key}.zh`);
    }
    assert.equal(guardianMessages['guardian.pasteTitle'].ko, '받은 링크 붙여넣기');
    assert.equal(guardianMessages['guardian.pasteTitle'].en, 'Paste a link you received');
    assert.equal(guardianMessages['guardian.pasteHelp'].ko, '링크 전체를 붙여 넣어 주세요. 링크는 서버로 보내지 않아요.');
    assert.equal(
      guardianMessages['guardian.pasteInvalid'].ko,
      'SafeHour 보호자 링크가 아니에요. 메신저에서 받은 링크 전체를 다시 붙여 넣어 주세요.',
    );
    // 붙여넣기 칸의 보관 실패: 로그인 안내용 holdFailed('로그인한 뒤 받은 링크를 다시 눌러')를 쓰지 않는다(리뷰 m3)
    assert.equal(guardianMessages['guardian.pasteHoldFailed'].ko, '링크를 잠시 담아 두지 못했어요. 앱을 다시 연 뒤 붙여 넣어 주세요.');
    assert.equal(guardianMessages['guardian.pasteHoldFailed'].en, "Couldn't keep the link for now. Reopen the app and paste it again.");
    assert.notEqual(guardianMessages['guardian.pasteHoldFailed'].ko, guardianMessages['guardian.holdFailed'].ko);
    // 붙여넣기 버튼은 PIN 입력의 '열기'(guardian.unlockButton)와 이름이 다르다: 절을 펼친 채 PIN 단계여도 '열기' 버튼이 둘이 되지 않는다
    assert.deepEqual(guardianMessages['guardian.pasteOpen'], { ko: '링크 열기', en: 'Open link', ja: 'リンクを開く', zh: '打开链接' });
    for (const lang of LANGS) {
      assert.notEqual(guardianMessages['guardian.pasteOpen'][lang], guardianMessages['guardian.unlockButton'][lang], lang);
    }
  });
});

describe('붙여넣기 절 펼침과 받아들인 뒤 포커스(pasteView.js)', () => {
  test('펼침 기본값: 사본도 여는 중인 링크도 없을 때만 펼친다. 형식이 틀린 링크 안내는 여는 중이 아니다', () => {
    assert.equal(pasteDefaultOpen({ hasCopy: false, showIncoming: false, invalid: false }), true);
    assert.equal(pasteDefaultOpen({ hasCopy: true, showIncoming: false, invalid: false }), false);
    // 여는 중(로그인·PIN·오프라인·확인 중): 사본이 없어도 접는다
    assert.equal(pasteDefaultOpen({ hasCopy: false, showIncoming: true, invalid: false }), false);
    assert.equal(pasteDefaultOpen({ hasCopy: true, showIncoming: true, invalid: false }), false);
    // 형식이 틀린 링크: 다시 붙여 넣을 수 있게 펼친다(사본이 있으면 접는다)
    assert.equal(pasteDefaultOpen({ hasCopy: false, showIncoming: true, invalid: true }), true);
    assert.equal(pasteDefaultOpen({ hasCopy: true, showIncoming: true, invalid: true }), false);
  });

  test('기본값이 그대로면 보호자가 고른 펼침을 지키고, 기본값이 바뀌면 새 기본값을 따른다', () => {
    assert.deepEqual(initialPasteFold(true), { forDefault: true, open: true });
    assert.deepEqual(initialPasteFold(false), { forDefault: false, open: false });
    // 보호자가 접었다(기본값 펼침 그대로): 접힌 채
    assert.equal(pasteFoldOpen({ forDefault: true, open: false }, true), false);
    // 보호자가 펼쳤다(기본값 접힘 그대로): 펼친 채
    assert.equal(pasteFoldOpen({ forDefault: false, open: true }, false), true);
    // 기본값이 바뀌었다: 보호자가 고른 값이 아니라 새 기본값
    assert.equal(pasteFoldOpen({ forDefault: true, open: true }, false), false);
    assert.equal(pasteFoldOpen({ forDefault: false, open: false }, true), true);
  });

  test('요약 줄 toggle: 그린 값과 같으면 같은 객체(다시 그리지 않는다), 다르면 지금 기본값과 함께 둔다', () => {
    const fold = initialPasteFold(true);
    assert.equal(pasteFoldAfterToggle(fold, true, true), fold);
    assert.deepEqual(pasteFoldAfterToggle(fold, true, false), { forDefault: true, open: false });
    // 기본값이 바뀐 뒤 속성을 맞추며 난 toggle(새 기본값과 같은 값): 그대로
    assert.equal(pasteFoldAfterToggle(fold, false, false), fold);
    // 기본값이 바뀐 뒤 보호자가 펼쳤다: 새 기본값과 함께 펼침
    assert.deepEqual(pasteFoldAfterToggle(fold, false, true), { forDefault: false, open: true });
  });

  test('받아들이면 접고, 그 뒤 기본값이 바뀌면 새 기본값을 따른다', () => {
    const accepted = pasteFoldAfterAccept(true);
    assert.deepEqual(accepted, { forDefault: true, open: false });
    assert.equal(pasteFoldOpen(accepted, true), false);
    // 받아들인 링크로 여는 중이 되면(기본값 접힘) 접힌 채, 여는 중이 끝나고 사본이 없으면(기본값 펼침) 다시 펼친다
    assert.equal(pasteFoldOpen(accepted, false), false);
    assert.equal(pasteFoldOpen(pasteFoldAfterAccept(false), true), true);
    // 여는 중에 받아들여도(기본값 접힘) 접는다
    assert.equal(pasteFoldOpen(pasteFoldAfterAccept(false), false), false);
  });

  test('받아들인 뒤 포커스 순서: PIN 입력 제목, 로그인 안내 제목, 상태 줄, 사본 제목', () => {
    assert.deepEqual(PASTE_FOCUS_ORDER, ['guardian-pin-entry-title', 'guardian-login-title', 'guardian-incoming-status']);
    assert.deepEqual(PASTE_FOCUS_ORDER, [PIN_ENTRY_TITLE_ID, LOGIN_TITLE_ID, INCOMING_STATUS_ID]);
    assert.ok(Object.isFrozen(PASTE_FOCUS_ORDER));
    const finder = (ids) => (id) => (ids.includes(id) ? `#${id}` : null);
    const heading = 'copy-heading';
    assert.equal(pasteFocusTarget(finder([PIN_ENTRY_TITLE_ID, LOGIN_TITLE_ID, INCOMING_STATUS_ID]), heading), `#${PIN_ENTRY_TITLE_ID}`);
    assert.equal(pasteFocusTarget(finder([LOGIN_TITLE_ID, INCOMING_STATUS_ID]), heading), `#${LOGIN_TITLE_ID}`);
    assert.equal(pasteFocusTarget(finder([INCOMING_STATUS_ID]), heading), `#${INCOMING_STATUS_ID}`);
    assert.equal(pasteFocusTarget(finder([]), heading), heading);
    assert.equal(pasteFocusTarget(finder([]), null), null);
    assert.equal(pasteFocusTarget(finder([]), undefined), null);
    // 찾는 순서도 고정한다: 앞에서 찾으면 뒤는 묻지 않는다
    const asked = [];
    pasteFocusTarget((id) => {
      asked.push(id);
      return id === LOGIN_TITLE_ID ? id : null;
    }, heading);
    assert.deepEqual(asked, [PIN_ENTRY_TITLE_ID, LOGIN_TITLE_ID]);
  });
});
