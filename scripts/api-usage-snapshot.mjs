#!/usr/bin/env node
/**
 * 공공 API 호출 이력 스냅샷 (AX-205)
 *
 * `logs/tour-api/` 의 카운터와 호출 로그를 훑어 오퍼레이션별 누적 호출표를 만든다.
 * 공모전 1차심사 제출항목 4(공공데이터 활용 실적)의 **보조 증빙**이다 —
 * 정본은 공공데이터포털 마이페이지의 키별 호출 통계이고, 이 파일은 어떤 오퍼레이션을
 * 언제 얼마나 썼는지 우리 쪽에서 설명하기 위한 것이다.
 *
 * 로그 디렉터리는 SAFEHOUR_DATA_ROOT 를 따른다. 다른 루트(예: 예전 로컬 실행분)를
 * 함께 집계하려면 인자로 넘긴다:
 *
 *   node scripts/api-usage-snapshot.mjs [추가_DATA_ROOT ...]
 */

import fs from "node:fs";
import path from "node:path";

import {
  TOUR_API_DAILY_LIMIT,
  TOUR_API_PATHS,
  TOUR_API_SERVICES,
} from "../src/tour-api/config.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "docs", "API_USAGE_SNAPSHOT.md");

const COUNTER_PATTERN = /^counter-(\d{4}-\d{2}-\d{2})\.json$/;
const CALL_LOG_PATTERN = /^calls-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** 인증키가 로그에 새면 이 스냅샷을 제출물로 쓸 수 없다. 필드·문자열 양쪽을 본다. */
const SECRET_FIELD_NAMES = ["serviceKey", "ServiceKey", "apiKey", "authKey"];
const SECRET_URL_PATTERN = /[?&](serviceKey|ServiceKey)=/;

function kstToday() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function logDirectories() {
  const roots = process.argv.slice(2).filter((argument) => argument !== "--force");
  const directories = [
    TOUR_API_PATHS.logs,
    ...roots.map((root) => path.join(path.resolve(root), "logs", "tour-api")),
  ];
  return [...new Set(directories)].filter((directory) => {
    try {
      return fs.statSync(directory).isDirectory();
    } catch {
      return false;
    }
  });
}

function readCounters(directory) {
  const days = [];
  for (const name of fs.readdirSync(directory)) {
    const match = COUNTER_PATTERN.exec(name);
    if (!match) continue;
    const raw = fs.readFileSync(path.join(directory, name), "utf8");
    let counts;
    try {
      counts = JSON.parse(raw);
    } catch {
      console.warn(`  ! 카운터 파싱 실패 — 건너뜀: ${name}`);
      continue;
    }
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) continue;
    days.push({ date: match[1], counts });
  }
  return days;
}

function readCalls(directory) {
  const entries = [];
  for (const name of fs.readdirSync(directory)) {
    if (!CALL_LOG_PATTERN.test(name)) continue;
    const raw = fs.readFileSync(path.join(directory, name), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        console.warn(`  ! 호출 로그 한 줄 파싱 실패 — 건너뜀: ${name}`);
      }
    }
  }
  return entries;
}

function auditSecrets(entries) {
  const findings = [];
  for (const entry of entries) {
    for (const field of SECRET_FIELD_NAMES) {
      if (field in entry) findings.push(`최상위 필드 ${field}`);
      if (entry.parameters && field in entry.parameters) {
        findings.push(`parameters.${field}`);
      }
    }
    if (typeof entry.endpoint === "string" && SECRET_URL_PATTERN.test(entry.endpoint)) {
      findings.push("endpoint 쿼리에 serviceKey");
    }
  }
  return [...new Set(findings)];
}

function aggregate(directories) {
  const operationTotals = new Map(); // "service.operation" → 누적 호출
  const dateTotals = new Map(); // "YYYY-MM-DD" → 누적 호출
  const calls = [];

  for (const directory of directories) {
    for (const { date, counts } of readCounters(directory)) {
      for (const [key, value] of Object.entries(counts)) {
        if (!Number.isFinite(value)) continue;
        operationTotals.set(key, (operationTotals.get(key) ?? 0) + value);
        dateTotals.set(date, (dateTotals.get(date) ?? 0) + value);
      }
    }
    calls.push(...readCalls(directory));
  }

  return { operationTotals, dateTotals, calls };
}

function serviceLabel(serviceName) {
  return TOUR_API_SERVICES[serviceName]?.label ?? serviceName;
}

function callStatistics(calls) {
  const resultCodes = new Map();
  let ok = 0;
  let warned = 0;
  let elapsedSum = 0;
  let elapsedCount = 0;
  let elapsedMax = 0;

  for (const call of calls) {
    if (call.ok === true) ok += 1;
    if (call.warning) warned += 1;
    const code = call.resultCode ?? call.httpStatus ?? "unknown";
    resultCodes.set(String(code), (resultCodes.get(String(code)) ?? 0) + 1);
    if (Number.isFinite(call.elapsedMs)) {
      elapsedSum += call.elapsedMs;
      elapsedCount += 1;
      elapsedMax = Math.max(elapsedMax, call.elapsedMs);
    }
  }

  return {
    total: calls.length,
    ok,
    failed: calls.length - ok,
    warned,
    resultCodes: [...resultCodes.entries()].sort((a, b) => b[1] - a[1]),
    averageMs: elapsedCount ? Math.round(elapsedSum / elapsedCount) : null,
    maxMs: elapsedCount ? elapsedMax : null,
  };
}

function renderMarkdown({ operationTotals, dateTotals, calls, directories, secretFindings }) {
  const dates = [...dateTotals.keys()].sort();
  const stats = callStatistics(calls);
  const total = [...operationTotals.values()].reduce((sum, value) => sum + value, 0);
  const peakDay = [...dateTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const rows = [...operationTotals.entries()]
    .map(([key, count]) => {
      const [serviceName, operation] = key.split(".");
      return { serviceName, operation, count };
    })
    .sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation));

  const lines = [];
  lines.push("# 공공 API 호출 이력 스냅샷 (AX-205)");
  lines.push("");
  lines.push(
    "> **자동 생성 파일이다.** 손으로 고치지 말고 `npm run usage:snapshot` 을 다시 돌린다.",
  );
  lines.push("");
  lines.push(`- 생성: ${kstToday()} (KST)`);
  lines.push(
    `- 집계 대상: ${directories.map((directory) => `\`${path.relative(PROJECT_ROOT, directory) || directory}\``).join(", ")}`,
  );
  lines.push(
    "- **정본은 공공데이터포털 마이페이지의 키별 호출 통계다.** 이 파일은 어떤 오퍼레이션을",
  );
  lines.push(
    "  언제 얼마나 썼는지 설명하기 위한 보조 증빙이며, 로컬·배포 인스턴스별로 나뉜 카운터를 합친 값이다.",
  );
  lines.push("");

  lines.push("## 1. 요약");
  lines.push("");
  lines.push("| 항목 | 값 |");
  lines.push("| --- | --- |");
  lines.push(`| 누적 호출 (카운터 합) | **${total.toLocaleString("ko-KR")}회** |`);
  lines.push(`| 검증 일수 | ${dates.length}일 |`);
  lines.push(`| 최초 · 최종 검증일 | ${dates[0] ?? "—"} · ${dates.at(-1) ?? "—"} |`);
  lines.push(
    `| 최대 사용일 | ${peakDay ? `${peakDay[0]} (${peakDay[1]}회)` : "—"} — operation별 일 한도 ${TOUR_API_DAILY_LIMIT.toLocaleString("ko-KR")}회 |`,
  );
  lines.push(`| 호출 로그 건수 | ${stats.total.toLocaleString("ko-KR")}건 |`);
  lines.push(
    `| 성공률 | ${stats.total ? `${((stats.ok / stats.total) * 100).toFixed(1)}% (성공 ${stats.ok} · 실패 ${stats.failed})` : "—"} |`,
  );
  lines.push(
    `| 응답 지연 | ${stats.averageMs === null ? "—" : `평균 ${stats.averageMs}ms · 최대 ${stats.maxMs}ms`} |`,
  );
  lines.push(`| 한도 경고 발생 | ${stats.warned}건 |`);
  lines.push("");

  lines.push("## 2. 오퍼레이션별 누적 호출");
  lines.push("");
  if (rows.length === 0) {
    lines.push("집계된 호출이 없다. 인증키를 설정하고 `npm run usage:weekly` 를 실행한다.");
  } else {
    lines.push("| 서비스 | 오퍼레이션 | 누적 호출 |");
    lines.push("| --- | --- | --- |");
    for (const row of rows) {
      lines.push(
        `| ${serviceLabel(row.serviceName)} | \`${row.operation}\` | ${row.count.toLocaleString("ko-KR")} |`,
      );
    }
    lines.push(`| **합계** | | **${total.toLocaleString("ko-KR")}** |`);
  }
  lines.push("");

  lines.push("## 3. 일자별 호출");
  lines.push("");
  if (dates.length === 0) {
    lines.push("기록 없음.");
  } else {
    lines.push("| 일자 (KST) | 호출 |");
    lines.push("| --- | --- |");
    for (const date of dates) {
      lines.push(`| ${date} | ${dateTotals.get(date).toLocaleString("ko-KR")} |`);
    }
  }
  lines.push("");

  lines.push("## 4. 응답 코드 분포");
  lines.push("");
  if (stats.resultCodes.length === 0) {
    lines.push("기록 없음.");
  } else {
    lines.push("| resultCode | 건수 |");
    lines.push("| --- | --- |");
    for (const [code, count] of stats.resultCodes) {
      lines.push(`| \`${code}\` | ${count.toLocaleString("ko-KR")} |`);
    }
    lines.push("");
    lines.push("`0000` 은 정상 응답이다. 그 외 코드는 공공데이터포털 오류코드 표를 따른다.");
  }
  lines.push("");

  lines.push("## 5. 인증키 비기록 검사");
  lines.push("");
  if (secretFindings.length === 0) {
    lines.push(
      `호출 로그 ${stats.total.toLocaleString("ko-KR")}건에서 인증키 흔적을 찾지 못했다 — **통과**.`,
    );
    lines.push("");
    lines.push("검사 항목: `serviceKey`·`apiKey`·`authKey` 필드, `endpoint` 쿼리스트링.");
  } else {
    lines.push("🔴 **인증키가 로그에 기록되고 있다. 이 상태로 제출하면 안 된다.**");
    lines.push("");
    for (const finding of secretFindings) lines.push(`- ${finding}`);
  }
  lines.push("");

  lines.push("## 6. 이 표를 읽는 법");
  lines.push("");
  lines.push(
    "- 카운터는 **KST 일자 · operation 단위**로 쌓인다. 캐시에 적중한 요청은 외부 호출이 없어 늘지 않는다.",
  );
  lines.push(
    "- 배포본은 Vercel 인스턴스마다 `/tmp` 가 독립이라 카운터가 나뉜다. 여기 수치는 **하한**으로 본다.",
  );
  lines.push("- 기상청 호출은 이 카운터에 잡히지 않는다 — 증빙은 `docs/TOUR_API_VALIDATION.md` 참고.");
  lines.push("- 산정 근거와 화면 대응은 `docs/API_USAGE_TABLE.md` 가 소유한다.");
  lines.push("");

  return lines.join("\n");
}

function main() {
  const directories = logDirectories();
  if (directories.length === 0) {
    console.warn("호출 로그 디렉터리를 찾지 못했다. 빈 스냅샷을 쓴다.");
  }

  const { operationTotals, dateTotals, calls } = aggregate(directories);
  const secretFindings = auditSecrets(calls);
  const total = [...operationTotals.values()].reduce((sum, value) => sum + value, 0);

  // `logs/` 는 Git 제외다. 새 클론이나 CI 에서 무심코 실행하면 집계가 0 이 나오고,
  // 그대로 쓰면 여태 쌓은 제출 증빙이 빈 표로 덮인다. 덮어쓰기는 --force 로만 허용한다.
  if (total === 0 && fs.existsSync(OUTPUT_PATH) && !process.argv.includes("--force")) {
    console.warn(
      `집계된 호출이 0회다. 기존 ${path.relative(PROJECT_ROOT, OUTPUT_PATH)} 를 보존하고 종료한다.`,
    );
    console.warn("  로그가 있는 머신에서 실행했는지 확인한다 (SAFEHOUR_DATA_ROOT).");
    console.warn("  비우는 것이 의도라면 --force 를 붙인다.");
    return;
  }

  const markdown = renderMarkdown({
    operationTotals,
    dateTotals,
    calls,
    directories,
    secretFindings,
  });
  fs.writeFileSync(OUTPUT_PATH, `${markdown}\n`, "utf8");

  console.log(`스냅샷 작성: ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}`);
  console.log(`  누적 호출 ${total}회 · 검증 ${dateTotals.size}일 · 로그 ${calls.length}건`);

  if (secretFindings.length > 0) {
    console.error("인증키가 호출 로그에 기록되고 있다:");
    for (const finding of secretFindings) console.error(`  - ${finding}`);
    process.exitCode = 1;
    return;
  }

  if (total === 0) {
    console.warn("집계된 호출이 없다. TOUR_API_KEY 를 설정하고 npm run usage:weekly 를 실행한다.");
  }
}

main();
