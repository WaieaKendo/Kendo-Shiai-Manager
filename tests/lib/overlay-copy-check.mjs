// Used by tests/match-identity-copy-test.py (run with --experimental-strip-types): reads saved states [{label, state}]
// from the JSON file argv[2] and, for each court, compares the overlay's selection (selectCourtMatch(),
// app/react/features/overlay/court-match.ts) on the state as it is with the same state whose division lists hand out a
// new copy of a match on every read (no Match Object is ever the same object twice: #15, before 13c). Prints
// {count, mismatches} as JSON.
import fs from 'node:fs';
import { selectCourtMatch } from '../../app/react/features/overlay/court-match.ts';

const copyOnRead = list => new Proxy(list, {
  get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    return typeof key === 'string' && /^\d+$/.test(key) && value && typeof value === 'object' ? structuredClone(value) : value;
  },
});
const samples = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mismatches = [];
let count = 0;
for (const { label, state } of samples) {
  const copied = { ...state, allMatches: Object.fromEntries(Object.entries(state.allMatches || {}).map(([d, l]) => [d, Array.isArray(l) ? copyOnRead(l) : l])) };
  for (const court of ['A', 'B']) {
    count++;
    const want = JSON.stringify(selectCourtMatch(structuredClone(state), court)), got = JSON.stringify(selectCourtMatch(copied, court));
    if (got !== want) mismatches.push({ label, court, got: got.slice(0, 400), want: want.slice(0, 400) });
  }
}
console.log(JSON.stringify({ count, mismatches: mismatches.slice(0, 5), total: mismatches.length }));
