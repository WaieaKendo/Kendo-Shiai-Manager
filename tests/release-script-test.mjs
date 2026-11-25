// scripts/release.mjs (`npm run release -- <version>`) on throwaway git repositories:
// it bumps package.json and package-lock.json together, drafts the CHANGELOG section from the
// commit subjects since the last tag (or since the last version change before the first tag),
// and refuses a bad or unchanged version. --skip-tests: the real run ends with `npm test`.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, prVersionProblem } from '../scripts/version-rules.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'release.mjs');
const checks = [];
const check = (ok, name) => checks.push([ok, name]);

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ksm-release-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  const write = (file, text) => fs.writeFileSync(path.join(dir, file), text);
  const commit = (subject, file = 'notes.txt') => { fs.appendFileSync(path.join(dir, file), subject + '\n'); git('add', '-A'); git('commit', '-q', '-m', subject); };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false'); git('config', 'tag.gpgsign', 'false');
  write('package.json', JSON.stringify({ name: 'ksm-release-test', version: '1.0.0', private: true }, null, 2) + '\n');
  write('package-lock.json', JSON.stringify({ name: 'ksm-release-test', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'ksm-release-test', version: '1.0.0' } } }, null, 2) + '\n');
  write('CHANGELOG.md', '## v1.0.0 — First\n\n- Old entry.\n');
  git('add', '-A'); git('commit', '-q', '-m', 'Release 1.0.0');
  return { dir, git, commit, read: file => fs.readFileSync(path.join(dir, file), 'utf8') };
}
const release = (dir, ...args) => spawnSync(process.execPath, [script, ...args, '--skip-tests'], { cwd: dir, encoding: 'utf8' });

// Tagged release: only the commits after the tag, no merge commits.
{
  const r = repo();
  r.git('tag', 'v1.0.0');
  r.commit('Fix the court timer');
  r.git('checkout', '-q', '-b', 'side'); r.commit('Add the program page', 'side.txt'); r.git('checkout', '-q', 'main');
  r.git('merge', '-q', '--no-ff', '-m', 'Merge side into main', 'side');
  const run = release(r.dir, '1.1.0');
  const pkg = JSON.parse(r.read('package.json')), lock = JSON.parse(r.read('package-lock.json'));
  const log = r.read('CHANGELOG.md');
  check(run.status === 0, `release 1.1.0 exits 0${run.status ? ': ' + run.stderr : ''}`);
  check(pkg.version === '1.1.0' && lock.version === '1.1.0' && lock.packages[''].version === '1.1.0', 'package.json and package-lock.json both 1.1.0');
  check(log.startsWith('## v1.1.0 — TITLE\n'), 'CHANGELOG.md starts with the new section (what version-consistency-test needs)');
  check(log.includes('- Fix the court timer\n') && log.includes('- Add the program page\n') && !log.includes('Merge side') && !log.includes('- Release 1.0.0'),
    'the draft lists the commit subjects since v1.0.0, without merges or older commits');
  check(log.includes('since v1.0.0') && log.endsWith('## v1.0.0 — First\n\n- Old entry.\n'), 'the draft names its range; the old sections are kept below');
  check(!r.git('tag').includes('v1.1.0') && r.git('status', '--porcelain').includes('package.json'), 'nothing tagged or committed');
  // A second run for the same version is refused (CHANGELOG already has it / unchanged version).
  const again = release(r.dir, '1.1.0');
  check(again.status !== 0 && /already/.test(again.stderr), 'the same version again is refused');
  fs.rmSync(r.dir, { recursive: true, force: true });
}

// No release tag yet (KSM today): the range starts at the last commit that changed the version.
{
  const r = repo();
  r.commit('Before the version change');
  const pkg = JSON.parse(r.read('package.json')); pkg.version = '1.0.1';
  fs.writeFileSync(path.join(r.dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  r.git('commit', '-q', '-am', 'Bump to 1.0.1');
  r.commit('After the version change');
  const run = release(r.dir, 'v2.0.0-dev');
  const log = r.read('CHANGELOG.md');
  check(run.status === 0 && JSON.parse(r.read('package.json')).version === '2.0.0-dev', 'no tag: release v2.0.0-dev (leading v accepted) bumps the version');
  check(log.startsWith('## v2.0.0-dev') && log.includes('- After the version change') && !log.includes('Before the version change') && !log.includes('- Bump to 1.0.1'),
    'no tag: the draft starts after the last version change');
  fs.rmSync(r.dir, { recursive: true, force: true });
}

// Bad input changes nothing.
{
  const r = repo();
  const bad = release(r.dir, 'four');
  const none = release(r.dir);
  check(bad.status !== 0 && none.status !== 0 && /usage/.test(bad.stderr) && JSON.parse(r.read('package.json')).version === '1.0.0' && r.git('status', '--porcelain') === '',
    'a missing or non-semver version is refused and changes nothing');
  const same = release(r.dir, '1.0.0');
  check(same.status !== 0 && /already 1\.0\.0/.test(same.stderr), 'the current version is refused');
  fs.rmSync(r.dir, { recursive: true, force: true });
}

// rc phase: `rc` counts up, `final` drops the suffix, both refused outside where they apply.
{
  const r = repo();
  r.git('tag', 'v1.0.0'); // an older tag: rc drafts still start at the last version change
  const notRc = release(r.dir, 'rc');
  check(notRc.status !== 0 && /needs an rc version/.test(notRc.stderr) && r.git('status', '--porcelain') === '', '"rc" on 1.0.0 is refused and changes nothing');
  const noPre = release(r.dir, 'final');
  check(noPre.status !== 0 && /removes a pre-release/.test(noPre.stderr), '"final" on 1.0.0 is refused');
  check(release(r.dir, '1.1.0-rc.1').status === 0, 'an explicit 1.1.0-rc.1 starts the rc phase');
  r.git('commit', '-q', '-am', 'Release 1.1.0-rc.1');
  r.commit('Fix the scoreboard');
  const rc = release(r.dir, 'rc');
  const log = r.read('CHANGELOG.md');
  check(rc.status === 0 && JSON.parse(r.read('package.json')).version === '1.1.0-rc.2' && JSON.parse(r.read('package-lock.json')).version === '1.1.0-rc.2', '"rc": 1.1.0-rc.1 -> 1.1.0-rc.2 in package.json and package-lock.json');
  check(log.startsWith('## v1.1.0-rc.2 — TITLE\n') && log.includes('- Fix the scoreboard') && !log.includes('- Release 1.1.0-rc.1'), '"rc": the draft lists only the commits since rc.1');
  r.git('commit', '-q', '-am', 'Release 1.1.0-rc.2');
  const fin = release(r.dir, 'final');
  check(fin.status === 0 && JSON.parse(r.read('package.json')).version === '1.1.0' && r.read('CHANGELOG.md').startsWith('## v1.1.0 — TITLE\n'), '"final": 1.1.0-rc.2 -> 1.1.0 with a v1.1.0 section');
  fs.rmSync(r.dir, { recursive: true, force: true });
}

// The PR rules CI checks (scripts/version-rules.mjs).
check(compare('4.0.0', '4.0.0-rc.9') > 0 && compare('4.0.0-rc.10', '4.0.0-rc.9') > 0 && compare('4.0.0', '3.17.20-test') > 0 && compare('4.0.1', '4.0.0') > 0, 'semver order: release > rc, rc.10 > rc.9, 4.0.0 > 3.17.20-test');
check(prVersionProblem('main', '3.17.20-test', '4.0.0') === '', 'main: 4.0.0 over 3.17.20-test is allowed');
check(/never gets a pre-release/.test(prVersionProblem('main', '3.17.20-test', '4.0.0-rc.3')), 'main: an rc version is refused');
check(/newer than main/.test(prVersionProblem('main', '4.0.0', '4.0.0')) && /newer than main/.test(prVersionProblem('main', '4.0.1', '4.0.0')), 'main: the same or an older version is refused');
check(prVersionProblem('develop', '4.0.0-rc.1', '4.0.0-rc.2') === '' && prVersionProblem('develop', '4.0.0-rc.1', '4.0.0') === '', 'develop in rc: rc.N+1 or the final version is allowed');
check(/rc phase/.test(prVersionProblem('develop', '4.0.0-rc.1', '4.0.0-rc.1')) && /rc phase/.test(prVersionProblem('develop', '4.0.0-rc.1', '4.0.0-rc.3')) && /rc phase/.test(prVersionProblem('develop', '4.0.0-rc.1', '4.0.1-rc.2')),
  'develop in rc: no bump, a skipped number, or another core version is refused');
check(prVersionProblem('develop', '4.1.0-dev', '4.1.0-dev') === '' && prVersionProblem('next/4.1', '4.0.0-rc.1', '4.0.0-rc.1') === '', 'develop outside rc and next/<version> have no rule');

let failed = 0;
for (const [ok, name] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
