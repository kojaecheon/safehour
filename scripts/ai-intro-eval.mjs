#!/usr/bin/env node
// AI 일정 소개 문장 평가: 수동 실행 전용 (AX-309 · docs/platform/AI_USE_CASE_INTRO.md)
//
//   SAFEHOUR_AI_INTRO=1 GEMINI_API_KEY=... npm run ai:eval [-- --out <결과.json>]
//
// - 스위치(SAFEHOUR_AI_INTRO=1)와 키(GEMINI_API_KEY)가 **모두** 있을 때만 실제 Gemini 를 부른다.
//   하나라도 없으면 '건너뜀' 메시지만 내고 끝난다(종료 코드 0). CI·npm test 에서는 실행하지 않는다.
// - 평가 세트: evals/ai-intro/*.json (고정 하루 일정 샘플 × ko·en·ja·zh)
// - 라우트와 같은 경로를 쓴다: sanitizeIntroRequest → requestGeminiIntro(제한시간 3초, 재시도 없음) → checkIntroOutput
// - 사람 검토를 위해 AI 원문(검사에서 떨어진 것 포함)을 출력한다. 평가 세트는 공개 장소 이름뿐이라 개인정보가 없다.
//   키·전체 URL 은 출력하지 않는다.
// - 호출 수 = 샘플 수 × 4. 사용 승인 판단의 근거로 쓴다(승인 기준은 AI 사용 문서).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AI_INTRO_TIMEOUT_MS,
  INTRO_LANGS,
  aiIntroStatus,
  requestGeminiIntro,
  sanitizeIntroRequest,
} from '../lib/server/ai-intro.js';
import { AI_INTRO_MAX_CHARS, checkIntroOutput } from '../lib/server/ai-intro-checks.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVAL_DIR = join(ROOT, 'evals', 'ai-intro');

const status = aiIntroStatus(process.env);
if (!status.enabled) {
  const why = {
    SWITCH_OFF: 'SAFEHOUR_AI_INTRO=1 이 아님',
    KEY_MISSING: 'GEMINI_API_KEY 없음',
    MODEL_INVALID: 'GEMINI_MODEL 값이 모델 이름 모양이 아님',
  }[status.reason] ?? status.reason;
  console.log(`[ai-intro-eval] 건너뜀 — ${why}. 스위치와 키가 모두 있을 때만 실제 Gemini 를 불러 평가한다.`);
  process.exit(0);
}

const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;

function loadCases() {
  const cases = [];
  for (const file of readdirSync(EVAL_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const set = JSON.parse(readFileSync(join(EVAL_DIR, file), 'utf8'));
    for (const sample of set.samples) {
      for (const lang of INTRO_LANGS) {
        const parsed = sanitizeIntroRequest({
          lang,
          stops: sample.stops.map((s) => ({ title: s.title[lang], category: s.category, arriveAt: s.arriveAt })),
          interests: sample.interests,
          pace: sample.pace,
        });
        if (!parsed.ok) throw new Error(`평가 세트 형식 오류: ${file} ${sample.id}/${lang} (${parsed.field})`);
        cases.push({ file, id: sample.id, lang, input: parsed.input });
      }
    }
  }
  return cases;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const cases = loadCases();
console.log(
  `[ai-intro-eval] 모델 ${status.model} · ${cases.length}건 · 제한시간 ${AI_INTRO_TIMEOUT_MS}ms · 길이 한도 ${AI_INTRO_MAX_CHARS}자`,
);

const results = [];
for (const c of cases) {
  const started = Date.now();
  const raw = await requestGeminiIntro(c.input);
  const latencyMs = Date.now() - started;
  const check = raw.ok ? checkIntroOutput(raw.text, { lang: c.lang, titles: c.input.stops.map((s) => s.title) }) : null;
  const result = {
    id: c.id,
    lang: c.lang,
    source: check?.ok ? 'AI' : 'TEMPLATE',
    fallback: raw.ok ? (check.ok ? null : `CHECK_FAILED:${check.category ?? check.rule}`) : `${raw.reason}${raw.detail ? `:${raw.detail}` : ''}`,
    latencyMs,
    output: raw.ok ? raw.text : null,
  };
  results.push(result);
  const head = `[${c.lang}] ${c.id.padEnd(24)} ${result.source.padEnd(8)} ${String(latencyMs).padStart(5)}ms`;
  console.log(result.fallback ? `${head}  ${result.fallback}` : head);
  if (result.output !== null) console.log(`       ${result.source === 'AI' ? '출력' : '거절된 원문'}: ${JSON.stringify(result.output)}`);
}

const summary = { model: status.model, checkedAt: new Date().toISOString(), total: results.length, byLang: {}, fallbacks: {} };
for (const lang of INTRO_LANGS) {
  const mine = results.filter((r) => r.lang === lang);
  const latencies = mine.map((r) => r.latencyMs);
  summary.byLang[lang] = {
    ai: mine.filter((r) => r.source === 'AI').length,
    total: mine.length,
    p95LatencyMs: percentile(latencies, 95),
    maxLatencyMs: latencies.length ? Math.max(...latencies) : null,
  };
}
for (const r of results) if (r.fallback) summary.fallbacks[r.fallback] = (summary.fallbacks[r.fallback] ?? 0) + 1;

console.log('\n[ai-intro-eval] 요약');
for (const [lang, s] of Object.entries(summary.byLang)) {
  console.log(`  ${lang}: AI 통과 ${s.ai}/${s.total} · p95 ${s.p95LatencyMs}ms · 최대 ${s.maxLatencyMs}ms`);
}
console.log(`  템플릿 대체 사유: ${JSON.stringify(summary.fallbacks)}`);
console.log('  승인 전 사람이 모든 AI 출력 문장을 읽고 판정한다(docs/platform/AI_USE_CASE_INTRO.md 6장).');

if (outPath) {
  writeFileSync(outPath, `${JSON.stringify({ summary, results }, null, 2)}\n`);
  console.log(`  결과 저장: ${outPath}`);
}
