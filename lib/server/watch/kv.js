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

function toInt(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) throw commandError();
  return n;
}

/**
 * 메모리 저장소. 데모 모드와 테스트에서 쓴다. 만료는 now() 와 비교해 읽을 때 지운다.
 * 받는 명령: GET, SET key value [NX] [EXAT 초], DEL, EXISTS, EXPIRE, EXPIREAT, INCR,
 * HSET, HSETNX, HDEL, HGETALL, SADD, SREM, SMEMBERS. 이 밖의 명령은 KV_COMMAND.
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

  function need(args, min, pairs = false) {
    if (args.length < min) throw commandError();
    if (pairs && (args.length - 1) % 2 !== 0) throw commandError();
  }

  const handlers = {
    GET(args) {
      need(args, 1);
      const entry = typed(String(args[0]), 'string');
      return entry ? entry.value : null;
    },
    SET(args) {
      need(args, 2);
      const key = String(args[0]);
      let nx = false;
      let exat = null;
      for (let i = 2; i < args.length; i += 1) {
        const opt = String(args[i]).toUpperCase();
        if (opt === 'NX') nx = true;
        else if (opt === 'EXAT' && i + 1 < args.length) {
          exat = toInt(args[i + 1]);
          i += 1;
        } else throw commandError();
      }
      if (nx && live(key)) return null;
      const entry = create(key, 'string', String(args[1]));
      entry.expireAtMs = exat === null ? null : exat * 1000;
      return 'OK';
    },
    DEL(args) {
      need(args, 1);
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
      need(args, 1);
      return args.filter((k) => live(String(k))).length;
    },
    EXPIRE(args) {
      need(args, 2);
      const entry = live(String(args[0]));
      const sec = toInt(args[1]);
      if (!entry) return 0;
      entry.expireAtMs = now() + sec * 1000;
      return 1;
    },
    EXPIREAT(args) {
      need(args, 2);
      const entry = live(String(args[0]));
      const unix = toInt(args[1]);
      if (!entry) return 0;
      entry.expireAtMs = unix * 1000;
      return 1;
    },
    INCR(args) {
      need(args, 1);
      const key = String(args[0]);
      const entry = typed(key, 'string');
      const next = (entry ? toInt(entry.value) : 0) + 1;
      if (entry) entry.value = String(next);
      else create(key, 'string', String(next));
      return next;
    },
    HSET(args) {
      need(args, 3, true);
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
      if (args.length !== 3) throw commandError();
      const key = String(args[0]);
      const entry = typed(key, 'hash') ?? create(key, 'hash', new Map());
      const field = String(args[1]);
      if (entry.value.has(field)) return 0;
      entry.value.set(field, String(args[2]));
      return 1;
    },
    HDEL(args) {
      need(args, 2);
      const key = String(args[0]);
      const entry = typed(key, 'hash');
      if (!entry) return 0;
      let n = 0;
      for (const f of args.slice(1)) if (entry.value.delete(String(f))) n += 1;
      if (entry.value.size === 0) store.delete(key);
      return n;
    },
    HGETALL(args) {
      need(args, 1);
      const entry = typed(String(args[0]), 'hash');
      if (!entry) return [];
      const flat = [];
      for (const [f, v] of entry.value) flat.push(f, v);
      return flat;
    },
    SADD(args) {
      need(args, 2);
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
      need(args, 2);
      const key = String(args[0]);
      const entry = typed(key, 'set');
      if (!entry) return 0;
      let n = 0;
      for (const m of args.slice(1)) if (entry.value.delete(String(m))) n += 1;
      if (entry.value.size === 0) store.delete(key);
      return n;
    },
    SMEMBERS(args) {
      need(args, 1);
      const entry = typed(String(args[0]), 'set');
      return entry ? [...entry.value] : [];
    },
  };

  return {
    async exec(commands) {
      if (!Array.isArray(commands)) throw commandError();
      // 이름부터 모두 확인해 모르는 명령이 섞이면 아무것도 실행하지 않는다
      for (const cmd of commands) {
        if (!Array.isArray(cmd) || cmd.length === 0) throw commandError();
        if (!Object.hasOwn(handlers, String(cmd[0]).toUpperCase())) throw commandError();
      }
      // await 없이 한 번에 처리하므로 exec 하나는 다른 exec 와 섞이지 않는다
      return commands.map((cmd) => handlers[String(cmd[0]).toUpperCase()](cmd.slice(1)));
    },
  };
}

const SHARED_KEY = Symbol.for('safehour.watch.memoryKv');

/** 프로세스에 하나뿐인 메모리 저장소(데모 모드). 처음 부른 쪽의 now 를 쓴다 */
export function sharedMemoryKv({ now }) {
  if (!globalThis[SHARED_KEY]) globalThis[SHARED_KEY] = createMemoryKv({ now });
  return globalThis[SHARED_KEY];
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

  async function post(path, body) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new KvError('KV_UNAVAILABLE');
    }
    // 400 은 명령 거부라 본문의 error 를 본다. 그 밖의 실패(401, 5xx 등)는 쓸 수 없는 상태로 본다
    if (!response.ok && response.status !== 400) throw new KvError('KV_UNAVAILABLE');
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
