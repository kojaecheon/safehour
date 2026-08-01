import fs from "node:fs/promises";
import path from "node:path";
import {
  callTourApi,
  extractTourItems,
  tourApiCounterSummary,
  tourTotalCount,
} from "../src/tour-api/client.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "artifacts", "api-smoke");

function createFileName(name) {
  return `${name.replaceAll(/[^a-zA-Z0-9-_]/g, "-")}.json`;
}

async function saveResult(outputDirectory, result) {
  await fs.writeFile(
    path.join(outputDirectory, createFileName(result.name)),
    `${JSON.stringify(result.payload, null, 2)}\n`,
    "utf8",
  );
}

function summarize(result) {
  const firstItem = extractTourItems(result)[0] ?? {};

  return {
    name: result.name,
    httpStatus: 200,
    resultCode: result.payload.response.header.resultCode,
    itemCount: extractTourItems(result).length,
    totalCount: tourTotalCount(result),
    sample: {
      contentId: firstItem.contentid ?? null,
      title: firstItem.title ?? null,
      address: [firstItem.addr1, firstItem.addr2].filter(Boolean).join(" ") || null,
    },
  };
}

async function main() {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const outputDirectory = path.join(OUTPUT_ROOT, timestamp);
  await fs.mkdir(outputDirectory, { recursive: true });

  const commonListParameters = {
    arrange: "A",
    areaCode: "1",
  };

  const requests = [
    {
      name: "korean-area-list",
      serviceName: "korean",
      operation: "areaBasedList2",
    },
    {
      name: "english-area-list",
      serviceName: "english",
      operation: "areaBasedList2",
    },
    {
      name: "barrier-free-area-list",
      serviceName: "barrierFree",
      operation: "areaBasedList2",
    },
  ];

  const listResults = [];
  for (const request of requests) {
    const result = await callTourApi({
      serviceName: request.serviceName,
      operation: request.operation,
      parameters: {
        ...commonListParameters,
        numOfRows: "5",
        pageNo: "1",
      },
      useCache: false,
    });
    result.name = request.name;
    listResults.push(result);
    await saveResult(outputDirectory, result);
  }

  const barrierFreeItem = extractTourItems(
    listResults.find((result) => result.name === "barrier-free-area-list"),
  )[0];

  if (!barrierFreeItem?.contentid) {
    throw new Error("무장애 관광정보에서 상세조회용 contentId를 찾지 못했습니다.");
  }

  const barrierFreeDetail = await callTourApi({
    serviceName: "barrierFree",
    operation: "detailWithTour2",
    parameters: {
      contentId: String(barrierFreeItem.contentid),
      numOfRows: "5",
      pageNo: "1",
    },
    useCache: false,
  });
  barrierFreeDetail.name = "barrier-free-detail";
  await saveResult(outputDirectory, barrierFreeDetail);

  const summary = [...listResults, barrierFreeDetail].map(summarize);
  await fs.writeFile(
    path.join(outputDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  console.table(
    summary.map(({ name, httpStatus, resultCode, itemCount, totalCount }) => ({
      name,
      httpStatus,
      resultCode,
      itemCount,
      totalCount,
    })),
  );
  console.log("오늘 TourAPI 실제 호출:", tourApiCounterSummary());
  console.log(`검증 결과 저장: ${outputDirectory}`);
}

main().catch((error) => {
  console.error(`TourAPI 검증 실패: ${error.message}`);
  process.exitCode = 1;
});
