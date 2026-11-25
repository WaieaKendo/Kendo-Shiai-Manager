// Reads a file at an older commit for legacy-equivalence tests. Returns null (and
// prints SKIP) when that commit is not in the clone (e.g. a shallow CI checkout), so
// the caller can skip instead of failing. CI checks out with fetch-depth: 0.
import { execFileSync } from 'node:child_process';

export function gitShow(rev, file) {
  try {
    return execFileSync('git', ['show', `${rev}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });
  } catch {
    console.log(`SKIP ${rev}:${file} is not available (shallow clone?); legacy equivalence not checked`);
    return null;
  }
}

// The app/js file names at an older commit (sorted), or null (and SKIP) when that commit
// is not in the clone. Legacy-equivalence tests that read every app/js file must list
// them at that commit: files added since (e.g. the 3N-react-*.js publishers) never
// existed there, and reading them made those tests skip in every clone (F23).
export function gitListAppJs(rev) {
  try {
    const out = execFileSync('git', ['ls-tree', '--name-only', `${rev}:app/js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(f => f.endsWith('.js')).sort();
  } catch {
    console.log(`SKIP ${rev}:app/js is not available (shallow clone?); legacy equivalence not checked`);
    return null;
  }
}
