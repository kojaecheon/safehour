// 시안 보드 손복사본 걸림 (SEED ③층 마지막 일괄, 최종 검토 지적)
//
// app/design-board/ScreenPreviews.js 는 저장소를 읽거나 서버를 부르는 화면 부품을 부를 수 없어서
// 몇 군데를 마크업만 손으로 옮겨 적었다. 원본의 클래스 이름이나 문구 키가 바뀌어도 복사본은 조용히
// 옛 모양으로 남고, 보드가 실제 화면과 어긋난다.
//
// 이 테스트는 복사본마다 '원본에 남아 있어야 하는 문자열'을 적어 두고 두 쪽을 모두 본다.
//   - 원본에 그 문자열이 없다: 원본이 바뀌었다. 복사본을 같이 고치고 아래 목록을 새 문자열로 바꾼다.
//   - 복사본에 그 문자열이 없다: 복사본이 먼저 바뀌었다. 원본과 맞는지 보고 목록을 고친다.
// 목록에는 클래스 이름(className="…")과, 클래스가 없는 복사본이 기대는 문구 키·분기 모양을 적는다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PREVIEWS = 'app/design-board/ScreenPreviews.js';

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/** 복사본 함수 한 개의 본문: `function 이름(` 부터 첫 줄 맨 앞 `}` 까지 */
function copyBlock(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${PREVIEWS} 에 function ${name}( 이 없다. 복사본 이름이 바뀌었으면 이 목록도 고친다`);
  const end = source.indexOf('\n}\n', start);
  assert.ok(end > start, `${PREVIEWS} 의 ${name} 끝을 찾지 못했다`);
  return source.slice(start, end + 2);
}

const cls = (value) => `className="${value}"`;

/**
 * 복사본(ScreenPreviews.js 의 함수) → 원본 파일들과 원본에 남아 있어야 하는 문자열.
 * 한 복사본이 원본 여러 곳을 닮았으면 원본마다 따로 적는다.
 */
const COPIES = [
  {
    block: 'Deadline',
    origins: {
      'app/today/page.js': [
        cls('today-deadline'),
        cls('today-deadline-main'),
        cls('today-deadline-place'),
        cls('today-estimate'),
        cls('trip-pair-secondary'),
        "t('today.returnTo'",
        "t('common.badgeEstimate')",
      ],
    },
  },
  {
    block: 'StopActions',
    origins: {
      'components/trip/DayScreen.js': [
        cls('trip-stop-actions'),
        cls('btn btn-secondary btn-small'),
        "t('trip.actionSwap')",
        "t('trip.actionClearMeal')",
        "t('trip.actionDelete')",
      ],
    },
  },
  {
    // 클래스가 없는 변환 규칙: 줄 종류별 분기와 문구 키가 같아야 한다
    block: 'useTimeline',
    origins: {
      'components/trip/DayScreen.js': [
        "case 'depart':",
        "case 'return':",
        "case 'appointment':",
        "case 'medication':",
        "case 'rest':",
        "case 'stop':",
        "case 'meal':",
        "t('trip.placeLodging')",
        "t('trip.placeHospital')",
        "t('trip.medicationAtLodging')",
        "t('trip.plannedReturn'",
        // 복귀 마감 이름·시각·이유는 deadlineCopyOf 한곳이 고른다 (사용성 점검 A4: 하루 활동 종료는 '오늘 활동 종료')
        'deadlineCopyOf(entry',
        't(copy.timeKey',
        'copy.reasonKey ? t(copy.reasonKey) : null',
        'kindKey: copy.labelKey',
      ],
    },
  },
  {
    // 정해진 문장 가지: IntroArea 의 마크업, 그리고 서버 템플릿(templateIntro)과 같은 문장 고르기
    block: 'IntroBlock',
    origins: {
      'components/trip/IntroArea.js': [
        cls('ui-block trip-intro-block'),
        cls('trip-intro'),
        cls('trip-intro-head'),
        cls('trip-intro-text'),
        "t('trip.introTemplateLabel')",
      ],
      'lib/server/ai-intro.js': [
        "titles.length === 1 ? 'one' : titles.length === 2 ? 'two' : 'many'",
        '{ place1: titles[0], place2: titles[1], count: String(titles.length) }',
        '/\\{(place1|place2|count)\\}/g',
        'INTRO_TEMPLATES[name][lang]',
      ],
    },
  },
  {
    block: 'ConsentWithdrawBlock',
    origins: {
      'components/conditions/ConsentWithdraw.js': [
        cls('ui-block conditions-withdraw'),
        cls('ui-callout conditions-callout'),
        cls('conditions-actions'),
        "t('conditions.withdrawTitle')",
        "t('conditions.consentGranted'",
        "k={'conditions.withdrawEffect'}",
        "t('conditions.withdrawAction')",
      ],
    },
  },
  {
    block: 'CardsSection',
    origins: {
      'components/cards/TodayCards.js': [cls('ui-block cards-section'), cls('cards-section-title')],
    },
  },
  {
    // 등록한 병원 행은 EmergencyScreen 안에 풀어 적었다
    block: 'EmergencyScreen',
    origins: {
      'app/emergency/page.js': [
        cls('emergency-section'),
        cls('emergency-hospitals'),
        cls('emergency-hospital'),
        cls('emergency-hospital-name'),
        cls('btn btn-secondary btn-small emergency-hospital-call'),
        cls('emergency-no-phone'),
        "t('emergency.hospitalsTitle')",
        "t('emergency.hospitalNoPhone')",
        "t('emergency.callNumber'",
      ],
    },
  },
  {
    block: 'GuardianPinSection',
    origins: {
      'components/guardian/GuardianOpen.js': [
        cls('guardian-section guardian-pin-card'),
        cls('field'),
        cls('guardian-pin'),
        "t('guardian.pinEntryTitle')",
        "t('guardian.pinEntryLabel')",
        "t('guardian.unlockButton')",
      ],
    },
  },
];

const previews = read(PREVIEWS);

describe('시안 보드 손복사본이 원본과 같은 문자열을 쓴다', () => {
  for (const { block, origins } of COPIES) {
    test(`${block}: 원본 ${Object.keys(origins).join(', ')}`, () => {
      const copy = copyBlock(previews, block);
      const problems = [];
      for (const [file, needles] of Object.entries(origins)) {
        const original = read(file);
        for (const needle of needles) {
          if (!original.includes(needle)) problems.push(`원본 ${file} 에 ${needle} 이(가) 없다`);
          if (!copy.includes(needle)) problems.push(`복사본 ${block} 에 ${needle} 이(가) 없다`);
        }
      }
      assert.deepEqual(problems, [], `${block} 복사본과 원본이 어긋났다. ${PREVIEWS} 를 원본에 맞춰 고친다`);
    });
  }
});
