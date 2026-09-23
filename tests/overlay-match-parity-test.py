"""The stream overlay picks the same current and next match as the TV display.

The overlay (app/react/overlay/court-match.ts) ports the TV's match selection
(courtCurrentMatch / findNextForCourt / tvUpcomingMatches) to a pure function. This
test plays a set of the golden-engine tournaments to the end in the real app
(offline), and before every step records, for Court A and Court B, the tournament
state and what the legacy TV view model shows: division, round/pool line, names,
points and the first upcoming match. Node then runs the overlay's function on each
recorded state (tests/lib/overlay-parity.mjs) and every answer must match.
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_app import KsmApp

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location('golden_engine', Path(__file__).resolve().parent / 'golden-engine-test.py')
golden = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(golden)

SCENARIOS = ['individual-and-team', 'multi-division-two-courts', 'rr-12-split', 'rr-08-seeded', 'se-10-noshows',
             'se-08-split', 'team3-se-5', 'team5-rr-3', 'kachinuki-se-4', 'kachinuki-rr-3', 'team3-se-4-courtA',
             'rr-16-split', 'se-16-courtA', 'se-05-courtA', 'se-12-seeded', 'team5-se-6', 'team3-rr-5', 'kachinuki-se-5']

# State first (as the TV would receive it), then the legacy TV view model, which may
# sort match lists and move the court position in place, as it does on the TV.
TV_JS = """(court) => {
  const snap = JSON.parse(JSON.stringify({...state, courtActionHistory: undefined, courtRedoHistory: undefined, history: undefined, matches: undefined}));
  const vm = buildTV3ViewModel(court);
  let tv = null;
  if (!vm.empty && vm.format !== 'results') {
    const m = vm.match;
    tv = {division: m.division, meta: vm.meta.line,
          white: vm.teamMode ? (m.white || 'TBD') : tvIndividualSideLabel(m, 'white'),
          red: vm.teamMode ? (m.red || 'TBD') : tvIndividualSideLabel(m, 'red'),
          white_points: (m.wp || []).join(' '), red_points: (m.rp || []).join(' '),
          upcoming: vm.upcoming.filter(Boolean).map(u => `${u.left} vs ${u.right}`)};
  }
  return {court, state: snap, tv};
}"""


def run(browser, name):
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.on('dialog', lambda d: d.dismiss() if d.message.startswith('Create Staff password') else d.accept())
    app = KsmApp.local(page)
    app.configure(golden.SCENARIOS[name])
    samples = []
    for step in range(600):
        for court in 'AB':
            s = page.evaluate(TV_JS, court)
            s['label'] = f'{name} step {step}'
            samples.append(s)
        progressed = False
        for court in 'AB':
            if page.evaluate(golden.STEP_JS, court):
                progressed = True
        if not progressed:
            break
    page.close()
    return samples


def main():
    failures, total, live = [], 0, 0
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for name in SCENARIOS:
            samples = run(browser, name)
            with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
                json.dump(samples, f)
            try:
                out = subprocess.run([
                    'node', '--experimental-strip-types', '--disable-warning=ExperimentalWarning',
                    str(ROOT / 'tests' / 'lib' / 'overlay-parity.mjs'), f.name], capture_output=True, text=True, cwd=ROOT)
            finally:
                os.unlink(f.name)
            if out.returncode != 0:
                failures.append(f'{name}: parity script failed\n{out.stdout}{out.stderr}')
                continue
            result = json.loads(out.stdout)
            total += result['count']
            live += sum(1 for s in samples if s['tv'])
            if result['total']:
                failures.append(f"{name}: {result['total']}/{result['count']} states differ, e.g.\n" +
                                '\n'.join(json.dumps(m) for m in result['mismatches']))
        browser.close()
    for f in failures:
        print(f'FAIL {f}')
    if failures:
        sys.exit(1)
    print(f'PASS overlay picks the TV\'s current and next match in {total} court states '
          f'({live} with a match, {len(SCENARIOS)} tournaments)')


if __name__ == '__main__':
    main()
