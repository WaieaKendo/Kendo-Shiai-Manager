// In-memory stand-in for the Cloudflare runtime (Durable Objects, storage, WebSocketPair,
// static assets), so Node tests run the real src-worker.js in-process, with no network.
// Used by worker-api-test.mjs (the API contract) and staff-auth-hardening-test.mjs.
//
//   const api = await createInProcessApi({ resetKey });
//   await api.call('POST', '/api/tournaments', { body });   // a Response
//   await api.openSocket(id, { role, key });                  // { status, messages, waitFor, close }
//   api.durableObject(id)                                     // that tournament's TournamentState
//   api.storage(id)                                           // its MemoryStorage (entries in .map)

export function installCloudflareShims() {
  // Workers allow `new Response(null,{status:101,webSocket})`; undici rejects status 101.
  const NativeResponse = globalThis.Response;
  globalThis.Response = class extends NativeResponse {
    constructor(body, init = {}) {
      if (init.status === 101) {
        super(null, { status: 200 });
        Object.defineProperty(this, 'status', { value: 101 });
        this.webSocket = init.webSocket;
      } else super(body, init);
    }
  };
  // Workers accept a ReadableStream body without `duplex`; undici requires it.
  const NativeRequest = globalThis.Request;
  globalThis.Request = class extends NativeRequest {
    constructor(input, init) {
      if (init?.body && typeof init.body.getReader === 'function' && !init.duplex) init = { ...init, duplex: 'half' };
      super(input, init);
    }
  };
  globalThis.WebSocketPair = function WebSocketPair() {
    const client = { messages: [], closed: null, listeners: [] };
    const server = {
      attachment: null,
      serializeAttachment(value) { this.attachment = structuredClone(value); },
      deserializeAttachment() { return this.attachment; },
      send(message) { if (client.closed) throw new Error('socket closed'); client.messages.push(JSON.parse(message)); client.listeners.forEach(fn => fn()); },
      close(code, reason) { client.closed = { code, reason }; },
    };
    client.peer = server;
    return { 0: client, 1: server };
  };
}


export class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async deleteAll() { this.map.clear(); }
}


export async function createInProcessApi({ resetKey = 'test-reset-key' } = {}) {
  installCloudflareShims();
  const { default: workerEntry, TournamentState } = await import('../../src-worker.js');
  const objects = new Map();
  // A Durable Object handles one request at a time here. (Real DOs use input
  // gates; see the concurrent-save check, which should also be run in live mode.)
  const queues = new Map();
  const namespace = {
    idFromName: name => name,
    get(id) {
      if (!objects.has(id)) {
        const sockets = new Set();
        const state = {
          storage: new MemoryStorage(),
          acceptWebSocket: ws => sockets.add(ws),
          getWebSockets: () => [...sockets].filter(ws => !ws.closedByTest),
        };
        objects.set(id, { instance: new TournamentState(state, env), sockets, state });
      }
      const { instance } = objects.get(id);
      return {
        fetch(input, init) {
          const request = input instanceof Request ? input : new Request(input, init);
          const run = () => instance.fetch(request);
          const prev = queues.get(id) || Promise.resolve();
          const next = prev.then(run, run);
          queues.set(id, next.catch(() => {}));
          return next;
        },
      };
    },
  };
  const env = {
    TOURNAMENTS: namespace,
    ASSETS: { fetch: async () => new Response('static asset', { status: 200 }) },
    KSM_RESET_KEY: resetKey,
  };
  const call = async (method, path, { headers = {}, body } = {}) => {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    return workerEntry.fetch(new Request(`http://ksm.test${path}`, init), env);
  };
  return {
    call,
    durableObject(id) { namespace.get(id); return objects.get(id).instance; },
    storage(id) { namespace.get(id); return objects.get(id).state.storage; },
    async openSocket(id, params = {}) {
      const qs = new URLSearchParams(params).toString();
      const response = await call('GET', `/api/tournaments/${id}/live?${qs}`, { headers: { Upgrade: 'websocket' } });
      if (response.status !== 101) return { status: response.status };
      const client = response.webSocket;
      const obj = objects.get(id);
      return {
        status: 101,
        messages: client.messages,
        send(message) { return obj.instance.webSocketMessage(client.peer, message); },
        waitFor: pred => waitFor(client.messages, pred, fn => client.listeners.push(fn)),
        async close() {
          client.peer.closedByTest = true;
          await obj.instance.webSocketClose(client.peer, 1000, 'test done');
        },
      };
    },
  };
}

export function waitFor(messages, pred, subscribe, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const hit = () => messages.find(pred);
    if (hit()) return resolve(hit());
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), timeoutMs);
    subscribe(() => { const m = hit(); if (m) { clearTimeout(timer); resolve(m); } });
  });
}

