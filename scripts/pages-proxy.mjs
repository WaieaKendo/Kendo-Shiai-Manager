#!/usr/bin/env node
// Deploys (or runs locally) the custom-domain pass-through for one site: a Cloudflare Pages
// project whose _worker.js hands every request to that site's KSM Worker (pages-proxy/,
// docs/DEPLOYMENT.md "Custom domains").
//
//   node scripts/pages-proxy.mjs dev|production            create the Pages project if it is
//                                                           missing, then deploy it (CI only)
//   node scripts/pages-proxy.mjs dev --local [--port 8788]  run it locally; start the Worker
//                                                           first: npm run build && npx wrangler dev --env dev
//
// Wrangler runs from a temporary folder outside the repository: inside it, `wrangler pages`
// picks up the repository's own Worker config (the Durable Object binding) instead of the Pages
// one and drops the service binding.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [site, ...args] = process.argv.slice(2);
if (!['dev', 'production'].includes(site)) {
  console.error('usage: node scripts/pages-proxy.mjs dev|production [--local [--port N]]');
  process.exit(2);
}
const local = args.includes('--local');
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '8788';

const config = fs.readFileSync(path.join(root, 'pages-proxy', `${site}.jsonc`), 'utf8');
const project = JSON.parse(config.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (m, str) => str ?? '')).name;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ksm-pages-${site}-`));
fs.mkdirSync(path.join(dir, 'public'));
fs.writeFileSync(path.join(dir, 'wrangler.jsonc'), config);
fs.copyFileSync(path.join(root, 'pages-proxy', '_worker.js'), path.join(dir, 'public', '_worker.js'));

const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
const run = (argv, { allowFail = false } = {}) => {
  console.log(`$ wrangler ${argv.join(' ')}`);
  const result = spawnSync(wrangler, argv, { cwd: dir, stdio: allowFail ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (allowFail) return result;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
};

if (local) {
  run(['pages', 'dev', '--port', port, '--ip', '127.0.0.1']);
} else {
  // The first deploy creates the project; afterwards "already exists" is expected.
  const created = run(['pages', 'project', 'create', project, '--production-branch', 'main'], { allowFail: true });
  const output = `${created.stdout || ''}${created.stderr || ''}`;
  if (created.status !== 0 && !/already exists|8000002/i.test(output)) {
    console.error(output);
    process.exit(created.status ?? 1);
  }
  console.log(created.status === 0 ? `created Pages project ${project}` : `Pages project ${project} exists`);
  run(['pages', 'deploy', '--project-name', project, '--branch', 'main', '--commit-dirty=true']);
}
fs.rmSync(dir, { recursive: true, force: true });
