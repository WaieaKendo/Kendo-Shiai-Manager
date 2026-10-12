"""Golden (snapshot) regression test for the tournament engine.

For a matrix of tournament setups, this test:
  1. generates the tournament exactly as the Setup screen does,
  2. plays every match to the end through the scorekeeper functions the buttons
     call (point(), nextMatch()), alternating Court A and Court B,
  3. records pools, the generated match list, the order matches were played on
     each court, every result, pool standings, placements/medals and any alerts,
and compares that record with the approved copy in tests/golden/engine/.

Match outcomes come from a fixed rule (a hash of the two names), so some pool
matches end in hikiwake and force tiebreaks, and runs are fully repeatable.

Any difference fails the test and prints what changed. If the change is
intended, approve it by regenerating the golden files and committing them:

    npm run test:golden:update
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_app import KsmApp

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'engine'
UPDATE = os.environ.get('KSM_UPDATE_GOLDEN') == '1' or '--update' in sys.argv


def people(n, prefix='P', seeds=0, no_shows=()):
    # Dojo repeats every 3 entrants so same-dojo separation logic is exercised.
    return [{'name': f'{prefix}{i + 1:02d}', 'dojo': f'Dojo {chr(65 + i % 3)}',
             'seed': str(i + 1) if i < seeds else '',
             'status': 'NoShow' if i + 1 in no_shows else 'Checked'} for i in range(n)]


def division(name, fmt, court, entrants):
    return {'name': name, 'format': fmt, 'court': court, 'entrants': entrants}


def team_event(fmt, tournament, n, court='Both'):
    # fmt: '3-Person Team' | '5-Person Team' | 'Kachinuki'; tournament: 'Single Elimination' | 'Round Robin'
    return {'team': True, 'format': fmt, 'tournament': tournament, 'teams': n, 'court': court}


SCENARIOS = {}
for n in range(3, 17):
    SCENARIOS[f'rr-{n:02d}-courtA'] = [division('Open', 'Round Robin', 'A', people(n))]
for n in range(6, 17):
    SCENARIOS[f'rr-{n:02d}-split'] = [division('Open', 'Round Robin', 'split', people(n))]
for n in range(2, 17):
    SCENARIOS[f'se-{n:02d}-courtA'] = [division('Open', 'Single Elimination', 'A', people(n))]
for n in range(6, 17):
    SCENARIOS[f'se-{n:02d}-split'] = [division('Open', 'Single Elimination', 'split', people(n))]
for n in (8, 12):
    SCENARIOS[f'rr-{n:02d}-seeded'] = [division('Open', 'Round Robin', 'A', people(n, seeds=4))]
    SCENARIOS[f'se-{n:02d}-seeded'] = [division('Open', 'Single Elimination', 'A', people(n, seeds=4))]
SCENARIOS['rr-09-noshows'] = [division('Open', 'Round Robin', 'A', people(9, no_shows=(3, 7)))]
SCENARIOS['se-10-noshows'] = [division('Open', 'Single Elimination', 'split', people(10, no_shows=(1, 6)))]
for n in (2, 3, 4, 5, 8):
    SCENARIOS[f'team3-se-{n}'] = [team_event('3-Person Team', 'Single Elimination', n)]
for n in (4, 6):
    SCENARIOS[f'team5-se-{n}'] = [team_event('5-Person Team', 'Single Elimination', n)]
for n in (3, 4, 5):
    SCENARIOS[f'team3-rr-{n}'] = [team_event('3-Person Team', 'Round Robin', n)]
    SCENARIOS[f'team5-rr-{n}'] = [team_event('5-Person Team', 'Round Robin', n)]
for n in (4, 5):
    SCENARIOS[f'kachinuki-se-{n}'] = [team_event('Kachinuki', 'Single Elimination', n)]
SCENARIOS['kachinuki-rr-3'] = [team_event('Kachinuki', 'Round Robin', 3)]
SCENARIOS['team3-se-4-courtA'] = [team_event('3-Person Team', 'Single Elimination', 4, 'A')]
SCENARIOS['individual-and-team'] = [
    division('Open', 'Round Robin', 'A', people(6)),
    team_event('3-Person Team', 'Single Elimination', 4, 'B'),
]
SCENARIOS['multi-division-two-courts'] = [
    division('Mens Open', 'Round Robin', 'A', people(7, 'M')),
    division('Womens Open', 'Single Elimination', 'B', people(6, 'W')),
    division('Youth', 'Round Robin', 'split', people(10, 'Y', seeds=2)),
]

# One scorekeeper step on a court: open the court like the Courts menu does; if it has
# nothing to play in its current division, move to the next division with a ready match
# (KSMTest.prepareCourt). The outcome comes from a hash of the two names.
STEP_JS = """(court) => {
  const m = KSMTest.prepareCourt(court);
  if (!m) return null;
  const mustWin = KSMTest.mustWin(m);
  const h = [...(m.white + '|' + m.red)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  let outcome = ['tie', 'white', 'white', 'red', 'red'][h % 5];
  if (outcome === 'tie' && mustWin) outcome = h % 2 ? 'white' : 'red';
  const pts = outcome === 'tie' ? [['W','M'],['R','K']] : outcome === 'white' ? (h % 3 ? [['W','M']] : [['W','M'],['R','D'],['W','K']]) : (h % 3 ? [['R','K']] : [['R','D'],['R','M']]);
  const label = {division: m.division, pool: m.pool || null, position: m.position || null, tiebreak: !!m.tiebreak, white: m.white, red: m.red};
  KSMTest.play(pts);
  return {court, ...label, outcome, score: pts.map(p => p.join('')).join(' ')};
}"""


# For these scenarios, also record the visible text of the main screens after the
# tournament finishes, so display regressions (Results, Live Scores, Overview) are caught.
SCREEN_SCENARIOS = {'multi-division-two-courts', 'individual-and-team', 'se-08-split', 'rr-12-split', 'team5-rr-3', 'kachinuki-se-4'}
SCREENS = {'results': 'results', 'public': 'public', 'director': 'director', 'score': 'score'}


def capture_screens(app):
    import re
    page = app.page
    out = {}
    for view, element_id in SCREENS.items():
        app.show_screen(view)
        page.wait_for_timeout(50)
        text = page.inner_text(f'#{element_id}')
        # Drop clock times / dates that change between runs.
        text = re.sub(r'\b\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM|am|pm)?', '<time>', text)
        out[view] = [line.strip() for line in text.splitlines() if line.strip()]
    return out


def run_scenario(browser, divisions, name=''):
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    events = []
    def on_dialog(d):
        # Saving offline tries to create a cloud tournament and asks for a staff
        # password; decline it (the test harness has no backend). Record anything else.
        if d.message.startswith('Create Staff password'):
            return d.dismiss()
        events.append(f'{d.type}: {d.message}')
        d.accept()
    page.on('dialog', on_dialog)
    page.on('pageerror', lambda e: events.append(f'page error: {e}'))
    app = KsmApp.local(page)
    app.configure(divisions)
    generated = app.structure()
    log = []
    for _ in range(600):
        progressed = False
        for court in ('A', 'B'):
            step = page.evaluate(STEP_JS, court)
            if step:
                log.append(step)
                progressed = True
        if not progressed:
            break
    final = app.final_state()
    screens = capture_screens(app) if name in SCREEN_SCENARIOS else None
    page.close()
    return {
        'setup': divisions,
        'generated': generated,
        'play_order': [f"{s['court']} | {s['division']} | {s['position'] or s['pool']}{' TB' if s['tiebreak'] else ''} | "
                       f"{s['white']} v {s['red']} | {s['outcome']} {s['score']}" for s in log],
        'final': final,
        **({'screens': screens} if screens else {}),
        'events': events,
    }


def diff(a, b, path='', out=None, limit=12):
    out = [] if out is None else out
    if len(out) >= limit:
        return out
    if type(a) is not type(b):
        out.append(f'{path or "/"}: {json.dumps(a)[:120]} -> {json.dumps(b)[:120]}')
    elif isinstance(a, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a:
                out.append(f'{path}/{k}: added {json.dumps(b[k])[:120]}')
            elif k not in b:
                out.append(f'{path}/{k}: removed')
            else:
                diff(a[k], b[k], f'{path}/{k}', out, limit)
    elif isinstance(a, list):
        for i in range(max(len(a), len(b))):
            if i >= len(a):
                out.append(f'{path}[{i}]: added {json.dumps(b[i])[:120]}')
            elif i >= len(b):
                out.append(f'{path}[{i}]: removed {json.dumps(a[i])[:120]}')
            else:
                diff(a[i], b[i], f'{path}[{i}]', out, limit)
            if len(out) >= limit:
                break
    elif a != b:
        out.append(f'{path}: {json.dumps(a)[:120]} -> {json.dumps(b)[:120]}')
    return out


def main():
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    failures, written, stale = [], 0, []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for name, divisions in SCENARIOS.items():
            if only and not any(q in name for q in only):
                continue
            actual = run_scenario(browser, divisions, name)
            path = GOLDEN_DIR / f'{name}.json'
            text = json.dumps(actual, indent=1, ensure_ascii=False) + '\n'
            if UPDATE:
                if not path.exists() or path.read_text(encoding='utf-8') != text:
                    path.write_text(text, encoding='utf-8')
                    written += 1
                continue
            if not path.exists():
                failures.append(f'{name}: no golden file (run npm run test:golden:update)')
                continue
            expected = json.loads(path.read_text(encoding='utf-8'))
            if expected != actual:
                changes = diff(expected, actual)
                failures.append(f'{name}: engine output changed\n' + '\n'.join(f'    {c}' for c in changes))
            else:
                print(f'PASS {name} ({len(actual["play_order"])} matches played)')
        browser.close()
    if not only:
        stale = [f.stem for f in GOLDEN_DIR.glob('*.json') if f.stem not in SCENARIOS]
        if UPDATE:
            for s in stale:
                (GOLDEN_DIR / f'{s}.json').unlink()
        elif stale:
            failures.append(f'golden files with no scenario: {", ".join(stale)}')
    if UPDATE:
        print(f'Updated {written} golden file(s){f", removed {len(stale)} stale" if stale else ""} in {GOLDEN_DIR}')
        return
    for f in failures:
        print(f'FAIL {f}')
    if failures:
        print('\nIf these changes are intended, run `npm run test:golden:update` and commit the updated golden files.')
        sys.exit(1)


if __name__ == '__main__':
    main()
