// 행정안전부 도로명주소 검색 API + 좌표제공 API 어댑터 (AX-310 · docs/business-rules.md '숙소와 병원', docs/contracts.md '`POST /api/address/search`')
//
// 흐름: 검색어 → 도로명주소 검색 API(최대 10건) → 결과마다 좌표제공 API → UTM-K → WGS84 → Address
//
// 공식 문서로 확인한 요청·응답 형식 (docs/standards.md '외부 API 형식': 기억으로 쓰지 않는다)
//   도로명주소 검색 API: https://business.juso.go.kr/jst/jstRoadNmAddrApiSearch
//     - 요청 URL  https://business.juso.go.kr/addrlink/addrLinkApi.do  (POST·GET, xml·json)
//     - 요청변수  confmKey(필수), currentPage(필수, 기본 1), countPerPage(필수, 기본 10, 0<n≤100),
//                keyword(필수), resultType(json)
//     - 출력      results.common { totalCount, currentPage, countPerPage, errorCode, errorMessage }
//                results.juso[] { roadAddr, roadAddrPart1, roadAddrPart2, jibunAddr, engAddr, zipNo,
//                                 admCd, rnMgtSn, bdMgtSn, bdNm, udrtYn, buldMnnm, buldSlno, ... }
//     - 오류코드  0 정상, -999 시스템에러, E0001 승인되지 않은 KEY, E0005 검색어 없음,
//                E0006 시도명만, E0008 한 글자, E0009 숫자만, E0010 너무 김(한글 40·영문숫자 80),
//                E0011 긴 숫자, E0012 특수문자+숫자만, E0013 SQL 예약어·특수문자(%,=,>,<,[,]),
//                E0014 개발키 만료, E0015 검색 범위 초과(9천 건)
//     - 문서 권고: 검색어에 특수문자나 SQL 예약어(OR, SELECT, INSERT, DELETE, UPDATE, CREATE, DROP,
//                EXEC, UNION, FETCH, DECLARE, TRUNCATE)가 있으면 보안장비가 호출 IP 를 차단할 수 있으니
//                호출 전에 거를 것.
//     - 주소 표기: 상세주소 입력이 없으면 "도로명주소 = roadAddr(전체도로명주소)".
//   좌표제공 API: https://business.juso.go.kr/jst/jstCoordApiSearch
//     - 요청 URL  https://business.juso.go.kr/addrlink/addrCoordApi.do  (POST·GET, xml·json)
//     - 요청변수  confmKey, admCd, rnMgtSn, udrtYn, buldMnnm(필수), buldSlno(선택), resultType(json)
//     - 출력      results.common { totalCount, errorCode, errorMessage },
//                results.juso[] { admCd, rnMgtSn, bdMgtSn, udrtYn, buldMnnm, buldSlno, entX, entY, bdNm }
//     - 오류코드  0 정상, -999, E0001 KEY, E0002–E0006 요청항목 없음, E0007 단시간 다량 요청
//   좌표계는 EPSG:5179(UTM-K GRS80) — 변환 근거는 ./utmk.js 머리말.
//
// 비밀정보 (docs/security.md '비밀값'·'기록': API 키, 전체 조회 URL 을 코드·로그·문서·테스트 데이터에 남기지 않는다)
//   - 키와 검색어는 URL 조회 문자열이 아니라 POST 본문(form)으로 보낸다. 어느 계층이 URL 을 기록해도 새지 않는다.
//   - 오류는 분류 코드(`E0001`, `HTTP_502`, `NETWORK` 등)만 담는다. 외부 오류 메시지·원인 객체를 싣지 않는다.
//   - 서버는 상태를 저장하지 않는다(docs/contracts.md '공통'). 검색어·결과를 디스크 캐시에 쓰지 않는다.

import { utmkToWgs84 } from './utmk.js';

export const JUSO_SEARCH_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
export const JUSO_COORD_URL = 'https://business.juso.go.kr/addrlink/addrCoordApi.do';

/** docs/contracts.md '`POST /api/address/search`': 결과 최대 10건 */
export const ADDRESS_RESULT_LIMIT = 10;
/** docs/contracts.md '`POST /api/address/search`': 검색어 2~60자 */
export const KEYWORD_MIN_LENGTH = 2;
export const KEYWORD_MAX_LENGTH = 60;

const REQUEST_TIMEOUT_MS = 8_000;
/** 좌표 API 동시 호출 수 — 공식 오류 E0007(단시간 다량 요청)을 피하려고 낮게 둔다 */
const COORD_CONCURRENCY = 3;
const TEXT_MAX_LENGTH = 200;

/** 검색어를 거부한 이유. 화면이 문구를 고를 때 쓴다 */
export const KEYWORD_REJECTION = Object.freeze({
  /** 문자열이 아니거나 2–60자가 아님 */
  LENGTH: 'KEYWORD_LENGTH',
  /** 공식 문서가 거르라고 한 특수문자·SQL 예약어, 또는 제어문자 */
  CHARS: 'KEYWORD_CHARS',
  /** 외부 API 가 검색어 문제로 거절함(시도명만, 숫자만, 결과 과다 등) */
  REJECTED: 'KEYWORD_REJECTED',
});

/** 검색 API 오류 중 사용자가 검색어를 고쳐서 풀 수 있는 것 */
const INPUT_ERROR_CODES = new Set(['E0005', 'E0006', 'E0008', 'E0009', 'E0010', 'E0011', 'E0012', 'E0013', 'E0015']);

// E0013 목록(%,=,>,<,[,]) — 공식 오류코드표
const FORBIDDEN_CHARS = /[%=<>[\]]/;
// 공식 예제의 SQL 예약어 목록. 단어 단위로만 본다 — "Oryu-ro" 같은 영문 주소가 걸리지 않게.
const SQL_RESERVED = /\b(?:OR|SELECT|INSERT|DELETE|UPDATE|CREATE|DROP|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b/i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * 외부 API 실패. `code` 는 로그에 남겨도 되는 분류 코드뿐이다.
 * kind: 'INPUT'(검색어 문제) | 'UPSTREAM'(외부 장애·키 오류) | 'UNAVAILABLE'(키 미설정)
 */
export class JusoApiError extends Error {
  constructor(kind, code) {
    super(kind === 'INPUT' ? '주소 검색어를 처리할 수 없습니다.' : '주소 검색 서비스를 쓸 수 없습니다.');
    this.name = 'JusoApiError';
    this.kind = kind;
    this.code = code;
  }
}

function cleanKey(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/** 두 키(검색·좌표)가 모두 설정돼 있는가 */
export function jusoConfigured(env = process.env) {
  return Boolean(cleanKey(env.JUSO_API_KEY) && cleanKey(env.JUSO_COORD_API_KEY));
}

/**
 * 검색어 정리·검증. 외부 호출 전에 부른다.
 * - NFC 정규화(분해형 한글 입력 대비), 연속 공백 하나로, 앞뒤 공백 제거
 * - 2–60자(유니코드 문자 단위)
 * - 공식 문서가 거르라고 한 특수문자·SQL 예약어, 제어문자 거부
 * @returns {{ok: true, keyword: string} | {ok: false, reason: string}}
 */
export function normalizeAddressKeyword(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: KEYWORD_REJECTION.LENGTH };
  if (CONTROL_CHARS.test(raw.replace(/[\t\n\r]/g, ' '))) return { ok: false, reason: KEYWORD_REJECTION.CHARS };
  const keyword = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = Array.from(keyword).length;
  if (length < KEYWORD_MIN_LENGTH || length > KEYWORD_MAX_LENGTH) {
    return { ok: false, reason: KEYWORD_REJECTION.LENGTH };
  }
  if (FORBIDDEN_CHARS.test(keyword) || SQL_RESERVED.test(keyword)) {
    return { ok: false, reason: KEYWORD_REJECTION.CHARS };
  }
  return { ok: true, keyword };
}

/**
 * form 본문 POST 호출 → `{ errorCode, juso }`.
 * 실패는 모두 JusoApiError('UPSTREAM', 분류코드) 로 바꾼다 — 원래 오류(메시지에 URL·키가 섞일 수 있음)는 버린다.
 */
async function postForm(url, params, { fetchImpl, timeoutMs }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new JusoApiError('UPSTREAM', timedOut ? 'TIMEOUT' : 'NETWORK');
  }

  if (!response.ok) throw new JusoApiError('UPSTREAM', `HTTP_${response.status}`);

  let payload;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    throw new JusoApiError('UPSTREAM', 'NOT_JSON');
  }

  const common = payload?.results?.common;
  if (!common || typeof common !== 'object') throw new JusoApiError('UPSTREAM', 'BAD_SHAPE');
  const juso = payload.results.juso;
  return {
    errorCode: String(common.errorCode ?? '').trim(),
    juso: Array.isArray(juso) ? juso : [],
  };
}

/** 로그용 분류 코드 — 외부 오류코드 형식이 아니면 UNKNOWN 으로 뭉갠다(임의 문자열을 로그에 흘리지 않는다) */
function safeErrorCode(code) {
  return /^(?:-?\d{1,4}|E\d{4})$/.test(code) ? code : 'UNKNOWN';
}

function text(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX_LENGTH);
}

function digits(value) {
  const s = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return /^\d{1,25}$/.test(s) ? s : null;
}

/** 검색 결과 한 건 → 좌표 API 요청변수. 필수 항목이 없으면 null(좌표를 물을 수 없다) */
function coordParams(item) {
  const admCd = digits(item?.admCd);
  const rnMgtSn = digits(item?.rnMgtSn);
  const udrtYn = digits(item?.udrtYn);
  const buldMnnm = digits(item?.buldMnnm);
  const buldSlno = digits(item?.buldSlno) ?? '0';
  if (!admCd || !rnMgtSn || (udrtYn !== '0' && udrtYn !== '1') || !buldMnnm) return null;
  return { admCd, rnMgtSn, udrtYn, buldMnnm, buldSlno };
}

function round7(n) {
  return Math.round(n * 1e7) / 1e7;
}

/**
 * 검색 결과 + 좌표 → Address(src/stay/stay.js 의 @typedef). 좌표가 없거나 대한민국 밖이면 null: 추정값으로 채우지 않는다.
 * 계약 밖 필드(행정코드·영문주소·우편번호 등)는 싣지 않는다.
 */
export function toAddress(item, coord) {
  const roadAddress = text(item?.roadAddr) || text(`${item?.roadAddrPart1 ?? ''}${item?.roadAddrPart2 ?? ''}`);
  if (!roadAddress || !coord) return null;
  const point = utmkToWgs84(coord.entX, coord.entY);
  if (!point) return null;

  const address = { roadAddress };
  const jibunAddress = text(item.jibunAddr);
  if (jibunAddress) address.jibunAddress = jibunAddress;
  const buildingName = text(item.bdNm);
  if (buildingName) address.buildingName = buildingName;
  address.lat = round7(point.lat);
  address.lng = round7(point.lng);
  address.source = 'JUSO';
  return address;
}

/** 순서를 지키며 동시 호출 수를 제한한다. 하나가 실패하면 새 호출을 시작하지 않는다 */
async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await fn(items[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * 도로명주소를 검색하고 좌표를 붙여 Address 목록(최대 10건)을 돌려준다.
 * 검색어는 `normalizeAddressKeyword` 를 통과한 값이어야 한다.
 * @param {string} keyword
 * @param {{env?: Record<string, string|undefined>, fetchImpl?: typeof fetch, timeoutMs?: number}} [opts]
 * @returns {Promise<Array<{roadAddress: string, jibunAddress?: string, buildingName?: string, lat: number, lng: number, source: 'JUSO'}>>}
 * @throws {JusoApiError}
 */
export async function searchRoadAddresses(keyword, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const searchKey = cleanKey(env.JUSO_API_KEY);
  const coordKey = cleanKey(env.JUSO_COORD_API_KEY);
  if (!searchKey || !coordKey) throw new JusoApiError('UNAVAILABLE', 'NO_KEY');

  const search = await postForm(
    JUSO_SEARCH_URL,
    {
      confmKey: searchKey,
      currentPage: '1',
      countPerPage: String(ADDRESS_RESULT_LIMIT),
      keyword,
      resultType: 'json',
    },
    { fetchImpl, timeoutMs },
  );
  if (search.errorCode !== '0') {
    const code = safeErrorCode(search.errorCode);
    throw new JusoApiError(INPUT_ERROR_CODES.has(code) ? 'INPUT' : 'UPSTREAM', code);
  }

  const items = search.juso.slice(0, ADDRESS_RESULT_LIMIT);
  const addresses = await mapLimited(items, COORD_CONCURRENCY, async (item) => {
    const params = coordParams(item);
    if (!params) return null;
    const coord = await postForm(JUSO_COORD_URL, { confmKey: coordKey, ...params, resultType: 'json' }, { fetchImpl, timeoutMs });
    if (coord.errorCode !== '0') throw new JusoApiError('UPSTREAM', safeErrorCode(coord.errorCode));
    const point = coord.juso.find((row) => row && row.entX != null && row.entY != null);
    return toAddress(item, point ?? null);
  });

  return addresses.filter(Boolean);
}
