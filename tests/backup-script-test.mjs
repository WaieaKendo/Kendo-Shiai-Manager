// scripts/backup-tournaments.mjs and scripts/health-check.mjs against a stand-in KSM server on
// localhost (never a real one): the backup only sends GETs, writes a dated folder with the
// library, one file per tournament and a manifest, and fails (exit 1) when a tournament cannot
// be read; the health check passes on the expected version and fails, after its retries, on
// another. (The backup was also run by hand against a local `wrangler dev`, docs/DEPLOYMENT.md.)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const check = (ok, name) => checks.push([ok, name]);

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', GONE = '33333333-3333-4333-8333-333333333333';
const records = {
  [A]: { schemaVersion: '1.2', tournamentId: A, revision: 7, updatedAt: '2026-09-12T20:00:00.000Z', payload: { setup: { tName: 'AHKC' } } },
  [B]: { schemaVersion: '1.2', tournamentId: B, revision: 2, updatedAt: '2026-09-01T20:00:00.000Z', payload: { setup: { tName: 'Practice' } } },
};
let library = [{ id: A, name: 'AHKC', updatedAt: records[A].updatedAt }, { id: B, name: 'Practice', updatedAt: records[B].updatedAt }];
const requests = [];
const server = http.createServer((req, res) => {
  requests.push(`${req.method} ${req.url}`);
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') return send(405, { error: 'read-only test server' });
  if (req.url === '/api/health') return send(200, { ok: true, version: '9.8.7' });
  if (req.url === '/api/tournaments') return send(200, library);
  const id = req.url.match(/^\/api\/tournaments\/([0-9a-f-]+)$/)?.[1];
  if (id && records[id]) return send(200, records[id]);
  return send(404, { error: 'Tournament not found' });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const run = (script, ...args) => new Promise(resolve => {
  const child = spawn(process.execPath, [path.join(root, 'scripts', script), ...args], { cwd: root });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  child.on('close', code => resolve({ code, out }));
});

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ksm-backup-'));
try {
  const ok = await run('backup-tournaments.mjs', base + '/', '--out', out);
  const dirs = fs.readdirSync(out);
  const dir = path.join(out, dirs[0] || 'none');
  const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  check(ok.code === 0, `backup exits 0${ok.code ? ': ' + ok.out : ''}`);
  check(dirs.length === 1 && /^127\.0\.0\.1_\d+-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ(-\d+)?$/.test(dirs[0]), `one dated folder per run (${dirs[0]})`);
  check(JSON.stringify(read(`${A}.json`)) === JSON.stringify(records[A]) && JSON.stringify(read(`${B}.json`)) === JSON.stringify(records[B]),
    'each tournament record saved exactly as the server returned it');
  const manifest = read('manifest.json');
  check(read('library.json').length === 2 && manifest.count === 2 && manifest.failed === 0 && manifest.serverVersion === '9.8.7'
    && manifest.tournaments.map(t => `${t.id}:${t.revision}:${t.file}`).join() === `${A}:7:${A}.json,${B}:2:${B}.json`,
  'library.json and manifest.json (server version, revision and file per tournament)');

  library = [...library, { id: GONE, name: 'Deleted meanwhile' }];
  const partial = await run('backup-tournaments.mjs', base, '--out', out);
  const second = fs.readdirSync(out).find(d => d !== dirs[0]);
  const manifest2 = second ? JSON.parse(fs.readFileSync(path.join(out, second, 'manifest.json'), 'utf8')) : {};
  check(partial.code === 1 && manifest2.failed === 1 && manifest2.tournaments?.find(t => t.id === GONE)?.error?.includes('404'),
    'a tournament that cannot be read fails the run (exit 1) and is named in the manifest; the others are still saved');
  const usage = await run('backup-tournaments.mjs', 'not-a-url');
  check(usage.code === 1 && /usage/.test(usage.out), 'a missing or bad base URL is refused');
  check(requests.length > 0 && requests.every(r => r.startsWith('GET ')), `read-only: only GET requests (${requests.length})`);

  const healthy = await run('health-check.mjs', base, '--version', '9.8.7', '--attempts', '2', '--delay', '10');
  check(healthy.code === 0 && /healthy/.test(healthy.out), 'health check passes on the expected version');
  const stale = await run('health-check.mjs', base, '--version', '9.8.8', '--attempts', '2', '--delay', '10');
  check(stale.code === 1 && /attempt 2\/2/.test(stale.out), 'health check retries, then fails on another version');
} finally {
  server.close();
  fs.rmSync(out, { recursive: true, force: true });
}

let failed = 0;
for (const [ok, name] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
