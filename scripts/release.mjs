#!/usr/bin/env node
// Prepares a release: the version is written only in package.json (the build and the worker read
// it from there; see scripts/app-sources.mjs), so a release is
//
//   npm run release -- <version>        e.g. npm run release -- 4.1.0-rc.1   (starts an rc phase)
//   npm run release -- rc               X.Y.Z-rc.N -> X.Y.Z-rc.(N+1)   (every PR into develop in its rc phase)
//   npm run release -- final            X.Y.Z-rc.N -> X.Y.Z            (the approved release, before develop -> main)
//
// The rules these follow are in scripts/version-rules.mjs, which CI also checks on every PR.
// 1. `npm version <version> --no-git-tag-version`: package.json and package-lock.json.
// 2. Drafts a CHANGELOG.md section at the top from the commit subjects (merges left out) since the
//    later of the last release tag (v*) and the last commit that changed the version.
// 3. Runs the full test suite (`npm test`), which includes version-consistency-test.
//
// Nothing is committed, tagged or deployed: edit the CHANGELOG draft (title and wording), commit,
// and after the merge to `main` tag it (`git tag v<version>`) and run "Deploy production"
// (docs/DEPLOYMENT.md). --skip-tests leaves step 3 out (used by tests/release-script-test.mjs).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { finalOf, nextRc } from './version-rules.mjs';

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const requested = args.find(a => !a.startsWith('-'))?.replace(/^v/, '');
const cwd = process.cwd();
const fail = message => { console.error(`release: ${message}`); process.exit(1); };

const pkgFile = path.join(cwd, 'package.json'), changelogFile = path.join(cwd, 'CHANGELOG.md');
const current = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).version;
let version = requested;
try {
  if (requested === 'rc') version = nextRc(current);
  else if (requested === 'final') version = finalOf(current);
} catch (error) { fail(error.message); }
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) fail('usage: npm run release -- <version> | rc | final   (semver, e.g. 4.1.0-rc.1; see docs/DEPLOYMENT.md)');
if (version === current) fail(`package.json is already ${version}`);
const changelog = fs.existsSync(changelogFile) ? fs.readFileSync(changelogFile, 'utf8') : '';
// The exact heading ("## v4.0.0 — …"), not a longer version that starts the same ("## v4.0.0-rc.2").
if (changelog.split('\n').some(line => line === `## v${version}` || line.startsWith(`## v${version} `))) fail(`CHANGELOG.md already has a v${version} section`);

const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return ''; } };
// Whichever is later: the last release tag, or the last commit that changed the version (an rc
// bump is not tagged, so the next rc lists only what came after it).
const lastTag = tryGit('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
const lastBump = tryGit('log', '-1', '--format=%H', '-G', '"version":', '--', 'package.json');
const tagIsOlder = lastTag && lastBump && (() => { try { git('merge-base', '--is-ancestor', lastTag, lastBump); return git('rev-parse', `${lastTag}^{commit}`) !== lastBump; } catch { return false; } })();
const since = tagIsOlder ? lastBump : (lastTag || lastBump);
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
