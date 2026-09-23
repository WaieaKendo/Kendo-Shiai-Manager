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
