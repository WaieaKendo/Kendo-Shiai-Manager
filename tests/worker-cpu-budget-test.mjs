// The front Worker's CPU per request, on a tournament-sized record.
//
// The KSM Worker runs on the Workers Free plan: 10 ms of CPU per request, after which Cloudflare
// stops it and the device gets a 500 ("Worker threw exception"). The Durable Object behind it has a
// far larger budget. During the ATKT Final run (dev, 2026-11-13) 38% of Worker requests were stopped
// (exceededResources, median CPU 10.0 ms): the Worker parsed and re-serialized the ~490 KB record
// about five times per save. Local workerd and the in-process runtime enforce no CPU limit and the
// other tests use small tournaments, so nothing else catches this.
//
// Here the real Worker (src-worker.js default export) talks to a stand-in Durable Object that
// answers at once with prepared bytes, so the time measured is the Worker's own work. It is
// compared with one JSON.parse of the same record in the same run, which keeps the check independent
// of the machine's speed. The harness's own cost (Node's Request/Response) is measured with a
// pass-through Worker and subtracted: the Worker's own work must cost less than half a parse of the
// record (the old code cost about six on a save).
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { installCloudflareShims } from './lib/worker-runtime.mjs';

installCloudflareShims();
const { default: worker } = await import('../src-worker.js');

const ID = '594b286a-0000-4000-8000-000000000000';

// A synthetic record the size and shape of ATKT Final (no real names): matches, pools and a long
// court action history of patches, about 500 KB of JSON.
function bigRecord() {
  const names = Array.from({ length: 160 }, (_, i) => `Competitor ${i} ${'ア'.repeat(i % 4)}`);
  const match = (d, i) => ({ id: `${d}-${i}`, white: names[i % 160], red: names[(i * 7 + 3) % 160], wp: i % 3 ? ['M'] : [], rp: i % 2 ? ['K', 'D'] : [], done: i % 4 !== 0, court: i % 2 ? 'A' : 'B', round: i % 5, completedResult: { winner: names[i % 160], wp: ['M'], rp: [] } });
  const allMatches = {};
  for (let d = 0; d < 7; d++) allMatches[`Division ${d}`] = Array.from({ length: 170 }, (_, i) => match(d, i));
  const patch = (court, i) => ({ format: 'patch-v1', label: `Next Match: ${names[i % 160]} vs ${names[(i + 9) % 160]}`, court, when: new Date(Date.UTC(2026, 10, 13, 6, 0, i)).toISOString(), clientId: `${court}-client-0000-0000`, revision: 700 + i, patches: Array.from({ length: 14 }, (_, k) => ({ path: ['allMatches', `Division ${i % 7}`, String(k), 'wp'], before: [], after: ['M', 'K'].slice(0, k % 3) })) });
  const courtActionHistory = { A: Array.from({ length: 100 }, (_, i) => patch('A', i)), B: Array.from({ length: 100 }, (_, i) => patch('B', i)) };
  const pools = Object.fromEntries(Array.from({ length: 7 }, (_, d) => [`Division ${d}`, Array.from({ length: 12 }, (_, p) => names.slice(p * 3, p * 3 + 4))]));
  const payload = { schemaVersion: '1.1', engineVersion: '4.0.0', savedAt: '2026-11-13T06:39:36.588Z', setup: { tName: 'Budget Test Taikai 剣道' }, state: { allMatches, courtActionHistory, pools, competitors: names.map(name => ({ name, dojo: 'Dojo' })) } };
  return { schemaVersion: '1.2', tournamentId: ID, engineVersion: '4.0.0', revision: 930, createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-13T08:21:41.869Z', updatedBy: { role: 'staff', clientId: 'x', name: 'KSM Device', court: 'B' }, payload };
}
const record = bigRecord();
const recordText = JSON.stringify(record);
const recordBytes = new TextEncoder().encode(recordText);
const putBodyBytes = new TextEncoder().encode(JSON.stringify({ tournamentId: ID, revision: 930, payload: record.payload }));
assert.ok(recordBytes.length > 450_000, `the record is tournament-sized (${recordBytes.length} bytes)`);

// A stand-in Durable Object namespace: the tournament answers with the prepared record bytes (and the
// library-row header the real DO sends), the library answers its small requests.
const libraryEntry = encodeURIComponent(JSON.stringify({ id: ID, name: record.payload.setup.tName, updatedAt: record.updatedAt }));
const recordResponse = () => new Response(recordBytes, { headers: { 'content-type': 'application/json', 'x-ksm-library-entry': libraryEntry } });
const env = {
  KSM_RESET_KEY: 'unused',
  TOURNAMENTS: {
    idFromName: name => name,
    get: () => ({
      async fetch(input, init) {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        if (path.startsWith('/library/identity/')) return Response.json({ slug: 'budget-test-2026' });
        if (path === '/library') return Response.json({ ok: true });
        if (path === '/snapshot' || path === '/bootstrap') return recordResponse();
        return Response.json({ error: 'unexpected ' + path }, { status: 500 });
      }
    })
  }
};
const headers = { 'content-type': 'application/json', 'x-ksm-client-schema': '9', 'x-ksm-role': 'staff', 'x-ksm-session-key': 'k' };
const routes = {
  'save (PUT)': () => new Request(`https://ksm.test/api/tournaments/${ID}`, { method: 'PUT', headers, body: putBodyBytes }),
  'load (GET)': () => new Request(`https://ksm.test/api/tournaments/${ID}`, { method: 'GET', headers }),
  'create (POST)': () => new Request('https://ksm.test/api/tournaments', { method: 'POST', headers, body: putBodyBytes })
};

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function timeSync(fn, runs = 25) {
  for (let i = 0; i < 5; i++) fn();
  const times = [];
  for (let i = 0; i < runs; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); }
  return median(times);
}
async function timeRoute(makeRequest, handler = worker, runs = 25) {
  const once = async () => {
    const request = makeRequest();
    const start = performance.now();
    const response = await handler.fetch(request, env);
    await response.arrayBuffer();  // the bytes the Worker sends back count too (a string body is encoded)
    return [performance.now() - start, response];
  };
  for (let i = 0; i < 5; i++) await once();
  const times = [];
  let last;
  for (let i = 0; i < runs; i++) { const [ms, response] = await once(); times.push(ms); last = response; }
  return [median(times), last];
}

// The cost of the harness itself (Node's Request/Response, reading the reply): a Worker that hands
// each request to the stand-in DO and returns its answer untouched. Subtracted from each route.
const passThrough = { fetch: (request, env_) => env_.TOURNAMENTS.get(ID).fetch(new Request(request.url.includes('/api/tournaments/') ? 'https://durable-object/snapshot' : 'https://durable-object/bootstrap', { method: request.method, headers: request.headers, body: request.body })) };

let failed = false;
const parseMs = timeSync(() => JSON.parse(recordText));
console.log(`one JSON.parse of the ${Math.round(recordBytes.length / 1024)} KB record: ${parseMs.toFixed(2)} ms`);
for (const [name, makeRequest] of Object.entries(routes)) {
  const [harnessMs] = await timeRoute(makeRequest, passThrough);
  const [ms, response] = await timeRoute(makeRequest);
  const own = Math.max(0, ms - harnessMs);
  // Half a parse: the old code cost about five per save, a pass-through about none.
  const ok = response.status === 200 && own < parseMs / 2;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: Worker ${own.toFixed(2)} ms of its own work (${(own / parseMs).toFixed(2)} parses; ${ms.toFixed(2)} ms total, harness ${harnessMs.toFixed(2)} ms), status ${response.status}`);
  if (!ok) failed = true;
}

// The pass-through still answers as before: the record with the friendly-link slug added.
{
  const response = await worker.fetch(routes['load (GET)'](), env);
  const body = await response.json();
  const ok = body.slug === 'budget-test-2026' && body.revision === 930 && body.tournamentId === ID;
  console.log(`${ok ? 'PASS' : 'FAIL'} the load still returns the record with its slug`);
  if (!ok) failed = true;
}

if (failed) {
  console.log('The Worker costs more than one parse of a tournament record: it must stream records through,\n' +
    'not parse them (src-worker.js libraryEntryHeader(); Workers Free plan, 10 ms CPU per request).');
  process.exit(1);
}
console.log('PASS worker CPU budget');
