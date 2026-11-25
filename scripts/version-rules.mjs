#!/usr/bin/env node
// The version rules for releases (docs/DEPLOYMENT.md, "Versions and releases"), shared by
// scripts/release.mjs and the "version" check in .github/workflows/test.yml:
//
//   - `develop` in its rc phase (its version is X.Y.Z-rc.N): every PR into it moves the version to
//     X.Y.Z-rc.(N+1) (`npm run release -- rc`), or to X.Y.Z when the candidate is approved
//     (`npm run release -- final`).
//   - `main` (production): never a pre-release, and always newer than what `main` has.
//   - Other bases (`next/<version>`, feature branches) have no rule.
//
// As a script: node scripts/version-rules.mjs <base branch> <base version> <head version>
// exits 1 with the reason when the PR's version breaks the rule for its base branch.
import { fileURLToPath } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parse(version) {
  const m = SEMVER.exec(String(version || '').replace(/^v/, ''));
  if (!m) return null;
  const pre = m[4] || '';
  const rc = /^rc\.(\d+)$/.exec(pre);
  return { core: `${m[1]}.${m[2]}.${m[3]}`, nums: [+m[1], +m[2], +m[3]], pre, rc: rc ? +rc[1] : null };
}

// Semver precedence: core numbers, then a release above any pre-release, then pre-release ids.
export function compare(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  const xs = x.pre.split('.'), ys = y.pre.split('.');
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    if (xs[i] === undefined) return -1;
    if (ys[i] === undefined) return 1;
    const xn = /^\d+$/.test(xs[i]), yn = /^\d+$/.test(ys[i]);
    if (xn && yn && +xs[i] !== +ys[i]) return +xs[i] - +ys[i];
    if (xn !== yn) return xn ? -1 : 1;
    if (xs[i] !== ys[i]) return xs[i] < ys[i] ? -1 : 1;
  }
  return 0;
}

// `npm run release -- rc`: X.Y.Z-rc.N -> X.Y.Z-rc.(N+1). Throws outside the rc phase.
export function nextRc(current) {
  const v = parse(current);
  if (!v || v.rc === null) throw new Error(`"rc" needs an rc version to count up from (package.json is ${current}); start an rc phase with an explicit version, e.g. npm run release -- 4.1.0-rc.1`);
  return `${v.core}-rc.${v.rc + 1}`;
}

// `npm run release -- final`: X.Y.Z-anything -> X.Y.Z. Throws when there is no pre-release.
export function finalOf(current) {
  const v = parse(current);
  if (!v || !v.pre) throw new Error(`"final" removes a pre-release suffix, and package.json is ${current}`);
  return v.core;
}

// The reason a PR with headVersion into baseBranch (at baseVersion) breaks the rules, or ''.
export function prVersionProblem(baseBranch, baseVersion, headVersion) {
  const head = parse(headVersion), base = parse(baseVersion);
  if (!head) return `package.json version ${headVersion} is not semver`;
  if (baseBranch === 'main') {
    if (head.pre) return `main is production and never gets a pre-release: ${headVersion} still has "-${head.pre}". Run \`npm run release -- final\` on develop first (docs/DEPLOYMENT.md).`;
    if (base && compare(headVersion, baseVersion) <= 0) return `a release into main needs a version newer than main's ${baseVersion} (this PR has ${headVersion})`;
    return '';
  }
  if (baseBranch === 'develop' && base && base.rc !== null) {
    const rc = nextRc(baseVersion), final = base.core;
    if (headVersion !== rc && headVersion !== final)
      return `develop is in its rc phase (${baseVersion}): every PR into it moves the version to ${rc} (\`npm run release -- rc\`), or to ${final} for the approved release (\`npm run release -- final\`). This PR has ${headVersion}. If develop moved on since, merge it in and run the command again.`;
  }
  return '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [baseBranch, baseVersion, headVersion] = process.argv.slice(2);
  if (!baseBranch || !headVersion) { console.error('usage: node scripts/version-rules.mjs <base branch> <base version> <head version>'); process.exit(2); }
  const problem = prVersionProblem(baseBranch, baseVersion, headVersion);
  if (problem) { console.error(`::error::${problem}`); process.exit(1); }
  console.log(`version ${headVersion} into ${baseBranch} (at ${baseVersion || 'no version'}): OK`);
}
