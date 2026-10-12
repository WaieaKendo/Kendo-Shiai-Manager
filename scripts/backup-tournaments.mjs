#!/usr/bin/env node
// Read-only export of every tournament on a KSM server, before any risky production step
// (a deploy with a data change, a Durable Object migration, the production rename).
//
//   npm run backup -- <base URL> [--out <dir>]
//   npm run backup -- https://kendoshiaimanager-cloud-staging.samanthakodamaworkersdev.workers.dev
//
// Only GET requests: /api/health, /api/tournaments (the library), then /api/tournaments/<id> for
// each one. Writes <out>/<host>-<UTC date and time>/ (default <out>: backups/, git-ignored):
//   manifest.json      base URL, time, server version, every tournament with revision and file
//   library.json       the library as the server returned it
//   <id>.json          each tournament record, exactly as GET /api/tournaments/<id> returns it
// The records are what the server hands any client: staff password hashes are never included,
// so a restore needs a new staff password (docs/DEPLOYMENT.md, "Backups").
// Only tournaments in the library are found (every save updates it). Exit code 1 if any fails.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const outRoot = flag('--out') || 'backups';
const base = args.find(a => !a.startsWith('-'))?.replace(/\/+$/, '');
if (!base || !/^https?:\/\/[^/]+$/.test(base)) {
  console.error('usage: npm run backup -- <base URL, e.g. https://host.workers.dev> [--out <dir>]');
  process.exit(1);
}

async function getJson(pathname) {
  const response = await fetch(base + pathname, { method: 'GET', headers: { accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`GET ${pathname}: HTTP ${response.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`GET ${pathname}: not JSON (${text.slice(0, 80)})`); }
}

const takenAt = new Date().toISOString();
const health = await getJson('/api/health');
const library = await getJson('/api/tournaments');
if (!Array.isArray(library)) throw new Error('GET /api/tournaments: expected a list');
let dir = path.join(outRoot, `${new URL(base).host.replace(/[^\w.-]/g, '_')}-${takenAt.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z')}`);
for (let n = 2; fs.existsSync(dir); n++) dir = dir.replace(/(Z)(-\d+)?$/, `$1-${n}`); // two runs in one second
fs.mkdirSync(dir, { recursive: true });
const save = (file, data) => fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2) + '\n');
save('library.json', library);

const tournaments = [];
for (const row of library) {
  const id = String(row?.id || '');
  if (!/^[0-9a-f-]+$/i.test(id)) { tournaments.push({ id, name: row?.name, error: 'not a tournament ID' }); continue; }
  try {
    const record = await getJson(`/api/tournaments/${id}`);
    save(`${id}.json`, record);
    tournaments.push({ id, name: row.name, revision: record.revision, updatedAt: record.updatedAt, file: `${id}.json` });
    console.log(`saved ${id}  rev ${record.revision}  ${row.name}`);
  } catch (error) {
    tournaments.push({ id, name: row.name, error: error.message });
    console.error(`FAILED ${id}  ${row.name}: ${error.message}`);
  }
}
const failed = tournaments.filter(t => t.error);
save('manifest.json', { baseUrl: base, takenAt, serverVersion: health.version, count: tournaments.length, failed: failed.length, tournaments });
console.log(`${tournaments.length - failed.length}/${tournaments.length} tournaments backed up to ${dir} (server ${health.version})`);
if (failed.length) process.exit(1);
