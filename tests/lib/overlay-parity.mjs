// Used by tests/overlay-match-parity-test.py (run with --experimental-strip-types):
// reads samples [{court, state, tv}] from the JSON file argv[2], where `tv` is what the
// legacy TV display showed for that state, and prints the samples where the overlay's
// pure selection (app/react/features/overlay/overlay-model.ts) disagrees, as JSON.
import fs from 'node:fs';
import { overlayView } from '../../app/react/features/overlay/overlay-model.ts';

const samples = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mismatches = [];
for (const [i, s] of samples.entries()) {
  const v = overlayView(s.state, s.court);
  const got = v.kind === 'idle' ? null : {
    division: v.division, meta: v.meta, white: v.white.name, red: v.red.name,
    white_points: v.white.points.join(' '), red_points: v.red.points.join(' '), next: v.next,
  };
  const want = s.tv && { ...s.tv, next: s.tv.upcoming[0] || null };
  if (want) delete want.upcoming;
  if (JSON.stringify(got) !== JSON.stringify(want)) mismatches.push({ sample: i, court: s.court, label: s.label, tv: want, overlay: got });
}
console.log(JSON.stringify({ count: samples.length, mismatches: mismatches.slice(0, 5), total: mismatches.length }));
