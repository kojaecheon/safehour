// 퇴역한 판정 경로 격리 (spec 3.2 단일 외출 흐름 퇴역, 9.2 · ADR-0006)
//
// 단일 외출 흐름의 판정 모듈(src/engine/recommend.js)과 그것이 쓰던 함수들은 아직 저장소에 남아 있다.
// 공모전 심사 증빙을 만드는 스크립트와 시나리오 테스트가 그것을 쓰기 때문이고, 정리는 시상(2026-11-05)
// 이후로 미뤘다 (docs/tracking/findings.md).
//
// 남겨 두는 동안 지켜야 하는 것은 하나다 — **운영 코드가 이 경로를 부르지 않는다.**
// 판정 경로가 두 벌이 되면 결과가 어긋나고, 그것이 이 제품에서 가장 위험한 결함이다.
// 이 모듈은 자체 엔진 버전·자체 상태 결정·자체 최소 외출 창 상수를 들고 있고, 조정 가능한 기본값
// 파일을 읽지 않으며, 열·물·식이·날짜 기준 휴무 게이트를 거치지 않는다. 다시 연결되면 조용히 갈라진다.
//
// 이 테스트는 그 연결을 막는다. 정리가 끝나면 이 파일도 함께 지운다.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** 운영 코드가 사는 곳 — 사용자 요청이 실제로 닿는 경로만 */
const PRODUCTION_DIRS = ['app', 'lib', 'components', 'src'];

/** 운영에서 부르면 안 되는 것 */
const RETIRED = Object.freeze({
  'src/engine/recommend.js': '단일 외출 흐름의 판정 모듈',
  recommend: '단일 외출 판정 진입점',
  applyEvent: '단일 외출 시절의 사건 적용',
  gateHospitalCondition: '폐기된 병원 조건 24시간 최신성 게이트',
  rankCandidates: '단일 외출 시절의 후보 순위',
});

/** 퇴역 모듈 자신과 그 전용 의존은 검사 대상이 아니다 */
const EXEMPT = new Set(['src/engine/recommend.js', 'src/engine/safetyGate.js']);

function jsFilesUnder(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) out.push(path.relative(ROOT, full));
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

/** import 문만 본다 — 주석이나 문자열에 이름이 나오는 것은 호출이 아니다 */
const IMPORT_RE = /^\s*import\s[\s\S]*?from\s*['"]([^'"]+)['"]/gm;

function importsOf(relPath) {
  const source = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const found = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    found.push({ statement: match[0], specifier: match[1] });
  }
  return found;
}

describe('퇴역한 단일 외출 판정 경로 격리', () => {
  test('운영 코드는 퇴역 판정 모듈을 불러오지 않는다', () => {
    const offenders = [];
    for (const dir of PRODUCTION_DIRS) {
      for (const file of jsFilesUnder(dir)) {
        if (EXEMPT.has(file)) continue;
        for (const { statement, specifier } of importsOf(file)) {
          const target = path.normalize(path.join(path.dirname(file), specifier));
          if (target === path.normalize('src/engine/recommend.js')) {
            offenders.push(`${file} → ${specifier} (${RETIRED['src/engine/recommend.js']})`);
          }
          for (const name of ['recommend', 'applyEvent', 'gateHospitalCondition', 'rankCandidates']) {
            const named = new RegExp(`[{,]\\s*${name}\\s*[,}]`);
            if (named.test(statement)) offenders.push(`${file} → ${name} (${RETIRED[name]})`);
          }
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `운영 코드가 퇴역한 판정 경로를 불러온다. 판정 경로는 하나여야 한다:\n  ${offenders.join('\n  ')}`,
    );
  });

  test('퇴역 모듈은 아직 저장소에 있다 — 지워졌으면 이 테스트도 지운다', () => {
    // 심사 증빙 스크립트가 아직 이 모듈을 쓴다. 파일이 사라졌다면 정리가 끝난 것이므로
    // 이 격리 테스트 자체가 필요 없다.
    assert.equal(fs.existsSync(path.join(ROOT, 'src/engine/recommend.js')), true);
  });
});
