#!/usr/bin/env node
// Prepares a release: the version is written only in package.json (the build and the worker read
// it from there; see scripts/app-sources.mjs), so a release is
//
//   npm run release -- <version>        e.g. npm run release -- 4.0.0
//
// 1. `npm version <version> --no-git-tag-version`: package.json and package-lock.json.
// 2. Drafts a CHANGELOG.md section at the top from the commit subjects (merges left out) since the
//    last release tag (v*), or, before the first tag, since the last commit that changed the version.
// 3. Runs the full test suite (`npm test`), which includes version-consistency-test.
//
// Nothing is committed, tagged or deployed: edit the CHANGELOG draft (title and wording), commit,
// and after the merge to `main` tag it (`git tag v<version>`) and run "Deploy production"
// (docs/DEPLOYMENT.md). --skip-tests leaves step 3 out (used by tests/release-script-test.mjs).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const version = args.find(a => !a.startsWith('-'))?.replace(/^v/, '');
const cwd = process.cwd();
const fail = message => { console.error(`release: ${message}`); process.exit(1); };

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) fail('usage: npm run release -- <version>   (semver, e.g. 4.0.0 or 4.1.0-dev)');
const pkgFile = path.join(cwd, 'package.json'), changelogFile = path.join(cwd, 'CHANGELOG.md');
const current = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).version;
if (version === current) fail(`package.json is already ${version}`);
const changelog = fs.existsSync(changelogFile) ? fs.readFileSync(changelogFile, 'utf8') : '';
if (changelog.startsWith(`## v${version}`) || changelog.includes(`\n## v${version} `)) fail(`CHANGELOG.md already has a v${version} section`);

const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return ''; } };
// The last release tag, or before the first one the last commit that changed the version.
const since = tryGit('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*')
  || tryGit('log', '-1', '--format=%H', '-G', '"version":', '--', 'package.json');
const subjects = (since ? tryGit('log', '--no-merges', '--format=%s', `${since}..HEAD`) : tryGit('log', '--no-merges', '--format=%s'))
  .split('\n').filter(Boolean);

execFileSync('npm', ['version', version, '--no-git-tag-version'], { cwd, stdio: 'inherit' });

const sinceLabel = since ? (/^[0-9a-f]{40}$/.test(since) ? since.slice(0, 7) : since) : 'the first commit';
const section = [
  `## v${version} — TITLE`,
  '',
  `<!-- Drafted by npm run release from ${subjects.length} commit subjects since ${sinceLabel}. Edit: a title, user-facing wording, drop internal entries. -->`,
  ...(subjects.length ? subjects.map(s => `- ${s}`) : ['- (no commits since the last release)']),
  '', '',
].join('\n');
fs.writeFileSync(changelogFile, section + changelog);
console.log(`release: package.json ${current} -> ${version}; CHANGELOG.md has a draft v${version} section (${subjects.length} commits since ${sinceLabel}).`);

if (skipTests) { console.log('release: tests skipped (--skip-tests).'); process.exit(0); }
try {
  execFileSync('npm', ['test'], { cwd, stdio: 'inherit' });
} catch {
  fail('the tests failed; the version and CHANGELOG changes are left in place for you to fix or revert.');
}
console.log(`release: tests passed. Next: edit the CHANGELOG draft, commit, merge to main, tag v${version}, run "Deploy production".`);
