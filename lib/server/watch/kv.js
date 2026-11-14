// 서버 알림 저장소 어댑터 (ADR-0012 · 계획 작업 2)
//
// 저장소는 `kv.exec(commands)` 하나 뒤에 숨긴다. commands 는 Redis 명령 배열의 배열이고,
// exec 한 번은 원자적이다(메모리 구현은 한 번에 동기로 처리하고, Upstash 는 /multi-exec 트랜잭션으로 보낸다).
// 결과는 명령 순서대로 돌려준다. 반환 모양은 Redis 와 같게 맞춘다:
//   SET 성공 'OK', NX 실패 null, HGETALL 은 [필드, 값, …] 평면 배열, 없는 키의 HGETALL·SMEMBERS 는 [],
//   HSETNX·EXISTS 는 0 또는 1.
//
// 오류는 KvError 하나로 던진다. code 는 'KV_UNAVAILABLE'(연결·HTTP·시간 초과) 또는 'KV_COMMAND'(명령 거부).
// 메시지와 속성에 저장소 주소, 토큰, 명령과 그 인자, 저장소 응답 원문을 넣지 않는다(cause 도 붙이지 않는다).
// 처리기는 KvError 를 503 SAFEHOUR_SERVER_PUSH_UNAVAILABLE 로 바꾼다.
//
// Upstash REST 형식 근거: https://upstash.com/docs/redis/features/restapi (2026-11-14 확인)
//   - 명령 하나: POST <url>, 본문은 JSON 배열 ["SET", "foo", "bar"]. 응답 { "result": … } 또는 { "error": … }
//   - 트랜잭션: POST <url>/multi-exec, 본문은 2차원 JSON 배열. 응답은 명령마다 { "result" } 또는 { "error" } 인
//     배열이다. 한 명령이 실패해도 나머지는 실행된다. 트랜잭션 전체가 폐기되면(문법 오류, 지원하지 않는 명령)
//     배열이 아니라 { "error": … } 하나가 온다.
//   - 인증: Authorization: Bearer <token>. 토큰을 주소 쿼리에 싣는 방식은 쓰지 않는다.
//   - 상태: 200 성공, 400 문법 오류·지원하지 않는 명령·명령 실패, 401 인증 실패.
//   - 기본 응답 형식은 JSON 이다(Upstash-Response-Format 헤더를 보내지 않는다).
//   확인하지 못한 것: 문서에 HGETALL 의 JSON 모양이 따로 적혀 있지 않다. 문서는 배열 응답을 JSON 배열로
//   싣는다고만 한다(예: { "result": ["value1", null, "value2"] }). Redis 의 HGETALL 은 RESP2 에서 평면
//   배열이므로 평면 배열로 올 것으로 보지만, 객체로 오는 경우에도 아래 normalizeResult 가 평면 배열로 바꾼다.
//   없는 키에 null 이 와도 [] 로 맞춘다.

import { withTimeout } from './timeout.js';

export class KvError extends Error {
  /** @param {'KV_UNAVAILABLE' | 'KV_COMMAND'} code */
  constructor(code) {
    super(code === 'KV_COMMAND' ? '저장소가 명령을 거부했습니다.' : '저장소에 연결하지 못했습니다.');
    this.name = 'KvError';
    this.code = code;
  }
}

/** HGETALL 평면 배열 → 객체. 원형이 없는 객체라 '__proto__' 같은 필드 이름도 그대로 담긴다 */
export function hashFromFlat(flat) {
  const out = Object.create(null);
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  return out;
}

// ---- 메모리 구현 ----

const commandError = () => new KvError('KV_COMMAND');

function isInt(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return (typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value))) && Number.isInteger(n);
}

/** SET 의 선택 인자를 읽는다. 형식이 틀리면 null */
function parseSetOptions(args) {
  let nx = false;
  let exat = null;
  for (let i = 2; i < args.length; i += 1) {
    const opt = String(args[i]).toUpperCase();
    if (opt === 'NX' && !nx) nx = true;
    else if (opt === 'EXAT' && exat === null && i + 1 < args.length && isInt(args[i + 1])) {
      exat = Number(args[i + 1]);
      i += 1;
    } else return null;
  }
  return { nx, exat };
}

// 명령마다 인자 형식 검사. exec 는 실행 전에 배치 전체를 이것으로 확인하고, 하나라도 틀리면 아무것도 하지 않는다
// (Redis 트랜잭션이 큐에 넣을 때 문법 오류로 통째로 폐기되는 것과 같다).
const SYNTAX = {
  GET: (a) => a.length === 1,
  SET: (a) => a.length >= 2 && parseSetOptions(a) !== null,
  DEL: (a) => a.length >= 1,
  EXISTS: (a) => a.length >= 1,
  EXPIRE: (a) => a.length === 2 && isInt(a[1]),
  EXPIREAT: (a) => a.length === 2 && isInt(a[1]),
  INCR: (a) => a.length === 1,
  HSET: (a) => a.length >= 3 && (a.length - 1) % 2 === 0,
  HSETNX: (a) => a.length === 3,
  HDEL: (a) => a.length >= 2,
  HGETALL: (a) => a.length === 1,
  SADD: (a) => a.length >= 2,
  SREM: (a) => a.length >= 2,
  SMEMBERS: (a) => a.length === 1,
};

/**
 * 메모리 저장소. 데모 모드와 테스트에서 쓴다. 만료는 now() 와 비교해 읽을 때 지운다.
 * 받는 명령: GET, SET key value [NX] [EXAT 초], DEL, EXISTS, EXPIRE, EXPIREAT, INCR,
 * HSET, HSETNX, HDEL, HGETALL, SADD, SREM, SMEMBERS. 이 밖의 명령은 KV_COMMAND.
 * 실행 중 오류(형이 다른 키, 정수가 아닌 값의 INCR)는 MULTI/EXEC 처럼 나머지 명령을 모두 실행한 뒤
 * KV_COMMAND 를 던진다.
 */
export function createMemoryKv({ now }) {
  /** @type {Map<string, { type: 'string' | 'hash' | 'set', value: any, expireAtMs: number | null }>} */
  const store = new Map();

  function live(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expireAtMs !== null && now() >= entry.expireAtMs) {
      store.delete(key);
      return null;
    }
    return entry;
  }

  function typed(key, type) {
    const entry = live(key);
    if (entry && entry.type !== type) throw commandError();
    return entry;
  }

  function create(key, type, value) {
    const entry = { type, value, expireAtMs: null };
    store.set(key, entry);
    return entry;
  }

  const handlers = {
    GET(args) {
      const entry = typed(String(args[0]), 'string');
      return entry ? entry.value : null;
    },
    SET(args) {
      const key = String(args[0]);
      const { nx, exat } = parseSetOptions(args);
      if (nx && live(key)) return null;
      const entry = create(key, 'string', String(args[1]));
      entry.expireAtMs = exat === null ? null : exat * 1000;
      return 'OK';
    },
    DEL(args) {
      let n = 0;
      for (const k of args) {
        if (live(String(k))) {
          store.delete(String(k));
          n += 1;
        }
      }
      return n;
    },
    EXISTS(args) {
      return args.filter((k) => live(String(k))).length;
    },
    EXPIRE(args) {
      const entry = live(String(args[0]));
      if (!entry) return 0;
      entry.expireAtMs = now() + Number(args[1]) * 1000;
      return 1;
    },
    EXPIREAT(args) {
      const entry = live(String(args[0]));
      if (!entry) return 0;
      entry.expireAtMs = Number(args[1]) * 1000;
      return 1;
    },
    INCR(args) {
      const key = String(args[0]);
      const entry = typed(key, 'string');
      if (entry && !isInt(entry.value)) throw commandError();
      const next = (entry ? Number(entry.value) : 0) + 1;
      if (entry) entry.value = String(next);
      else create(key, 'string', String(next));
      return next;
    },
    HSET(args) {
      const key = String(args[0]);
      const entry = typed(key, 'hash') ?? create(key, 'hash', new Map());
      let added = 0;
      for (let i = 1; i < args.length; i += 2) {
        const field = String(args[i]);
        if (!entry.value.has(field)) added += 1;
        entry.value.set(field, String(args[i + 1]));
      }
      return added;
    },
    HSETNX(args) {
      const key = String(args[0]);
      const entry = typed(key, 'hash') ?? create(key, 'hash', new Map());
      const field = String(args[1]);
      if (entry.value.has(field)) return 0;
      entry.value.set(field, String(args[2]));
      return 1;
    },
    HDEL(args) {
      const key = String(args[0]);
      const entry = typed(key, 'hash');
      if (!entry) return 0;
      let n = 0;
      for (const f of args.slice(1)) if (entry.value.delete(String(f))) n += 1;
      if (entry.value.size === 0) store.delete(key);
      return n;
    },
    HGETALL(args) {
      const entry = typed(String(args[0]), 'hash');
      if (!entry) return [];
      const flat = [];
      for (const [f, v] of entry.value) flat.push(f, v);
      return flat;
    },
    SADD(args) {
      const key = String(args[0]);
      const entry = typed(key, 'set') ?? create(key, 'set', new Set());
      let n = 0;
      for (const m of args.slice(1)) {
        if (!entry.value.has(String(m))) {
          entry.value.add(String(m));
          n += 1;
        }
      }
      return n;
    },
    SREM(args) {
      const key = String(args[0]);
      const entry = typed(key, 'set');
      if (!entry) return 0;
      let n = 0;
      for (const m of args.slice(1)) if (entry.value.delete(String(m))) n += 1;
      if (entry.value.size === 0) store.delete(key);
      return n;
    },
    SMEMBERS(args) {
      const entry = typed(String(args[0]), 'set');
      return entry ? [...entry.value] : [];
    },
  };

  return {
    async exec(commands) {
      if (!Array.isArray(commands)) throw commandError();
      // 이름과 인자 형식을 모두 확인해, 틀린 명령이 섞이면 아무것도 실행하지 않는다
      for (const cmd of commands) {
        if (!Array.isArray(cmd) || cmd.length === 0) throw commandError();
        const name = String(cmd[0]).toUpperCase();
        if (!Object.hasOwn(SYNTAX, name) || !SYNTAX[name](cmd.slice(1))) throw commandError();
      }
      // await 없이 한 번에 처리하므로 exec 하나는 다른 exec 와 섞이지 않는다
      let failed = false;
      const results = commands.map((cmd) => {
        try {
          return handlers[String(cmd[0]).toUpperCase()](cmd.slice(1));
        } catch {
          failed = true;
          return null;
        }
      });
      if (failed) throw commandError();
      return results;
    },
  };
}

const SHARED_KEY = Symbol.for('safehour.watch.memoryKv');

/**
 * 프로세스에 하나뿐인 메모리 저장소(데모 모드). 시계는 마지막으로 부른 쪽의 now 로 바뀐다.
 * 저장소는 하나지만 시계 참조를 바꿔 끼울 수 있어, 나중에 부른 쪽이 처음 시계에 묶이지 않는다.
 */
export function sharedMemoryKv({ now }) {
  let shared = globalThis[SHARED_KEY];
  if (!shared) {
    shared = { now };
    shared.kv = createMemoryKv({ now: () => shared.now() });
    globalThis[SHARED_KEY] = shared;
  }
  shared.now = now;
  return shared.kv;
}

// ---- Upstash REST 구현 ----

/** 문서에 따로 적히지 않은 모양을 Redis 모양으로 맞춘다(머리 주석의 '확인하지 못한 것') */
function normalizeResult(cmd, result) {
  const name = String(cmd[0]).toUpperCase();
  if (name === 'HGETALL') {
    if (result === null || result === undefined) return [];
    if (!Array.isArray(result) && typeof result === 'object') {
      const flat = [];
      for (const [f, v] of Object.entries(result)) flat.push(f, v);
      return flat;
    }
  }
  if (name === 'SMEMBERS' && (result === null || result === undefined)) return [];
  return result;
}

function readItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new KvError('KV_UNAVAILABLE');
  if (Object.hasOwn(item, 'error')) throw new KvError('KV_COMMAND');
  if (!Object.hasOwn(item, 'result')) throw new KvError('KV_UNAVAILABLE');
  return item.result;
}

export function createUpstashKv({ url, token, fetchImpl = globalThis.fetch, timeoutMs = 4000 }) {
  const base = String(url).replace(/\/+$/, '');

  // 응답 본문 읽기까지 timeoutMs 안에 끝나야 한다(withTimeout)
  function post(path, body) {
    return withTimeout(timeoutMs, async (signal) => {
      let response;
      try {
        response = await fetchImpl(`${base}${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
      } catch {
        throw new KvError('KV_UNAVAILABLE');
      }
      // 400 은 명령 거부라 본문의 error 를 본다. 그 밖의 실패(401, 5xx 등)는 쓸 수 없는 상태로 보고,
      // 본문을 읽지 않고 놓아 연결을 돌려준다
      if (!response.ok && response.status !== 400) {
        try {
          await response.body?.cancel();
        } catch {
          // 놓지 못해도 결과는 같다
        }
        throw new KvError('KV_UNAVAILABLE');
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new KvError('KV_UNAVAILABLE');
      }
      if (data && typeof data === 'object' && !Array.isArray(data) && Object.hasOwn(data, 'error')) {
        throw new KvError('KV_COMMAND');
      }
      if (!response.ok) throw new KvError('KV_UNAVAILABLE');
      return data;
    });
  }

  return {
    async exec(commands) {
      if (!Array.isArray(commands)) throw new KvError('KV_COMMAND');
      if (commands.length === 0) return [];
      if (commands.length === 1) {
        const data = await post('', commands[0]);
        return [normalizeResult(commands[0], readItem(data))];
      }
      const data = await post('/multi-exec', commands);
      if (!Array.isArray(data) || data.length !== commands.length) throw new KvError('KV_UNAVAILABLE');
      const results = data.map(readItem);
      return results.map((r, i) => normalizeResult(commands[i], r));
    },
  };
}
