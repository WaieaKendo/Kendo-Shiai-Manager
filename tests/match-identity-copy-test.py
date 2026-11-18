"""Match Object identity: nothing relies on a match staying the same object (#15, the PR before 13c; docs/STORE.md 13c).

When PR 13c moves `allMatches` into the store, a write gives the matches it changes new objects, so code that holds a
match and later compares it with `===` / `indexOf`, or writes through it, would show or score the wrong bout. This test
is the guard 13c relies on. Two offline pages run the same scripted tournaments with the same random seed:

  - control: as the app runs today;
  - copied:  every Match Object in `allMatches` is replaced by a structural copy (same values, a new object) at every
             store notification (any dispatch), every app event (`window.dispatchEvent`: the render signals), every
             assignment of a division's list (`allMatches[div] = ...`, through a Proxy), just before a court action's
             body and right after Next Match's result write (two test-only hooks in court-scoring-and-history.js,
             `globalThis.KSMTestBeforeCourtAction`, unset in the app), and after every step. Those are where 13c
             dispatches; it is harsher than 13c (where only the matches a write changes get new objects). At the
             second hook the objects copied at the first are put back to their values from then, so a match held across
             the result write is as stale as in 13c (the old object, without the write).

Since #15 PR 13c-1 every write to `allMatches` goes through app/modules/court/match-writes.js, and each helper call is a
copy point too (globalThis.KSMTestMatchWrite: the objects read before the write are put back to their values from then,
so a match held across any write, not only Next Match's result, is as stale as in 13c-2). A third page, `frozen`
(tests/lib/match-freeze-hook.js), is the page as 13c-2 will leave it: the map, every list and every match frozen copies,
new ones at each helper write, store notification and app event, so a write that misses the helpers throws and an object
held across a write keeps its old values. On next/4.1 (before 13c-1) the frozen page throws at the first draw (Generate
Tournament's `state.allMatches[div] = …` on the frozen map) in each scenario; the copied page passes there since #205.

After every step the pages must show and score the same bouts: the saved state (every match's points and result, the
court pointers, the Undo/Redo lists), this device's view (division, index, live score), the court screen's inputs
(scoreboard, queue, context, header, actions), Live Scores, the TV (its view model for both courts and the TV island's
input), and Director Progress (both courts and the tournament). The overlay (its own bundle) is checked in Node on each
step's saved state (tests/lib/overlay-copy-check.mjs: its selection with every read of a match a new object). Steps:
points, hansoku, Fusen-gachi, Undo/Redo, Next Match through pools with pool tiebreaks, a split single elimination, round
robins on both courts, a 3-person team bracket, a team round robin with drawn bouts (the representative playoff, its
representative picked) and kachinuki (round robin and single elimination).

What it catches (each converted site reverted alone; the PR lists them): nextMatch()'s and setRepresentative()'s
look-up inside the action, tvUpcomingMatches(), ksmTeamSheet(), the split single elimination's queue and the overlay's
upcoming bouts; nextMatch()'s look-up after the result write together with the kachinuki insertion (either alone is
not: the other still finds the bout, and the stale match lacks only done / completedResult, which nothing after the
write reads from it). On next/4.1 (the code before) it fails in four of those: the TV's Upcoming
Matches, the overlay's upcoming bouts and the split single elimination's queue list the bout being played, and Live
Scores' team sheet loses its NOW row (the hooks are new, so next/4.1's nextMatch() never sees a copy). The other sites compare objects from one read
with no write between, where a new object per write cannot separate them; they are converted so 13c need not check.
`--all` lists every divergence instead of stopping at the first.

It also counts, in the copied page, divisions holding two matches with the same `matchSyncIdentity()` (printed, not an
error): a kachinuki pairing's bouts share one, which is why KSMEngine.matchIndexIn() breaks a tie by the held index.
"""
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

# #15 PR 13c-1: the third page, as 13c-2 will leave it (every match, list and the map frozen between the helpers' writes).
FREEZE_HOOK = (Path(__file__).parent / 'lib/match-freeze-hook.js').read_text()

checks = 0
# --all: report every divergence (one line each) instead of stopping at the first; exits 1 if any.
ALL = '--all' in sys.argv
diverged = []

SEED = r"""() => { let a = 29; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""

# The copied page: every Match Object replaced by a copy at every store notification, and on demand.
COPY_HOOK = r"""() => {
  const copyAll = () => {
    const all = KSMTest.app.state.allMatches || {};
    for (const d of Object.keys(all)) { const arr = all[d]; if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) if (arr[i] && typeof arr[i] === 'object') arr[i] = structuredClone(arr[i]); }
    window.__matchCopies = (window.__matchCopies || 0) + 1;
  };
  window.__copyAllMatches = copyAll;
  // A division's list assigned (13c's dispatch points): copied right after. Re-wrapped
  // after a load replaces allMatches.
  const wrapped = new WeakSet();
  const wrap = () => {
    const st = KSMTest.app.state, all = st.allMatches;
    if (!all || typeof all !== 'object' || wrapped.has(all)) return;
    const proxy = new Proxy(all, {set(t, k, v) { t[k] = v; copyAll(); return true; }});
    wrapped.add(proxy); st.allMatches = proxy;
  };
  wrap();
  window.KSMStore.subscribe(() => { wrap(); copyAll(); });
  // Just before a court action's body and right after Next Match's result write (two test-only
  // hooks, where 13c dispatches): code that read a match before and writes or compares it after must look it up again.
  // At the second hook the objects copied at the first one (the ones the action read, then wrote) are put back to their
  // values from then: a held match is as stale as in 13c, where a write gives the list a new object and leaves the old one
  // as it was.
  let held = [];
  const live = () => Object.values(KSMTest.app.state.allMatches || {}).filter(Array.isArray).flat().filter(m => m && typeof m === 'object');
  window.KSMTestBeforeCourtAction = where => {
    copyAll();
    if (where === 'action') { held = live().map(m => [m, structuredClone(m)]); return; }
    for (const [m, was] of held) { for (const k of Object.keys(m)) delete m[k]; Object.assign(m, was); }
    held = [];
    window.__staleRestores = (window.__staleRestores || 0) + 1;
  };
  // #15 PR 13c-1: every write through app/modules/court/match-writes.js (13c-2's dispatch points; the 'result' point
  // above was Next Match's result write, now one of them): the matches copied after it, and the objects read before it
  // put back to their values from then, so a match held across any write is as stale as in 13c-2.
  let before = [];
  window.KSMTestMatchWrite = where => {
    if (where === 'before') { before = live().map(m => [m, structuredClone(m)]); return; }
    copyAll();
    for (const [m, was] of before) { for (const k of Object.keys(m)) delete m[k]; Object.assign(m, was); }
    before = [];
    window.__staleRestores = (window.__staleRestores || 0) + 1;
  };
  const dispatch = window.dispatchEvent;
  window.dispatchEvent = function (event) { copyAll(); return dispatch.call(this, event); };
}"""

OBSERVE = r"""() => {
  const app = KSMTest.app, st = app.tournamentPayload().state;
  const ids = new Map();
  const norm = v => JSON.stringify(v ?? null).replace(/(team|gc):[0-9a-f]{24,32}/g, id => { if (!ids.has(id)) ids.set(id, `${id.split(':')[0]} #${ids.size}`); return ids.get(id); })
    .replace(/"tabId":"[^"]*"/g, '"tabId":"<tab>"').replace(/"clientId":"[^"]*"/g, '"clientId":"<client>"')
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/":1[6-9]\d{11}\b/g, '":<ms>');
  const out = {};
  out.saved = norm({allMatches: st.allMatches, courtState: st.courtState, courtActiveDivision: st.courtActiveDivision, currentByDivision: st.currentByDivision,
    courtActionHistory: st.courtActionHistory, courtRedoHistory: st.courtRedoHistory, courtUndoLog: st.courtUndoLog});
  out.view = norm({division: app.state.currentDivision, court: app.state.currentCourt, current: app.state.current, score: app.state.score});
  out.court = norm(['ksmCourtScoreboardInput', 'ksmCourtQueueInput', 'ksmCourtContextInput', 'ksmCourtHeaderInput', 'ksmCourtActionsInput'].map(k => window[k]));
  out.liveScores = norm(window.ksmLiveScoresInput);
  out.tvModel = norm(['A', 'B'].map(c => KSMTest.app.buildTV3ViewModel(c)));
  KSMTest.app.renderTvDisplay(); out.tvInput = norm(window.ksmTvInput);
  out.director = norm({A: KSMTest.app.courtSummaryFor('A'), B: KSMTest.app.courtSummaryFor('B'), total: KSMTest.app.tournamentSummary()});
  return out;
}"""

DUPLICATES = r"""() => { const out = [];
  for (const [d, arr] of Object.entries(KSMTest.app.state.allMatches || {})) { const seen = new Map();
    (arr || []).forEach(m => { const k = KSMTest.app.matchSyncIdentity(m); if (!k) return; seen.set(k, (seen.get(k) || 0) + 1); });
    for (const [k, n] of seen) if (n > 1) out.push(`${d}: ${k.split(':').slice(0, 1)}-identity x${n}`); }
  return out; }"""

# A court plays up to n bouts: points (a draw every `draw_every` bout where ties are allowed), a team playoff's
# representatives picked as the select does, then Next Match.
PLAY = r"""async ([court, n, drawEvery]) => {
  for (let i = 0; i < n; i++) {
    const m = KSMTest.prepareCourt(court); if (!m) break;
    if (m.type === 'teamPlayoff' && /Representative/.test(m.white || '')) {
      const w = KSMTest.app.teamRoster(m.teamWhite, m.division)[0], r = KSMTest.app.teamRoster(m.teamRed, m.division)[0];
      if (w) KSMTest.app.setRepresentative('W', w); if (r) KSMTest.app.setRepresentative('R', r);
      window.__representativesPicked = (window.__representativesPicked || 0) + 1;
    }
    const draw = drawEvery && i % drawEvery === 0 && !KSMTest.mustWin(m);
    if (!draw) { point(i % 3 ? 'W' : 'R', 'M'); if (i % 4 === 1) point('W', 'K'); }
    nextMatch();
  }
  await new Promise(r => setTimeout(r, 50));
}"""


def ev(script, arg=None):
    return lambda pg: pg.evaluate(script, arg)


def on(court, script):
    return ev(f"() => {{ KSMTest.prepareCourt('{court}'); {script} }}")


def play(court, n, draw_every=0):
    return ev(PLAY, [court, n, draw_every])


def entrants(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i % 3}', 'seed': '', 'status': 'Checked'} for i in range(n)]


def configure(divisions):
    return ev('entries => KSMTest.configure(entries)', divisions)


def individual_and_team():
    return [
        ('generated: pools (split), SE (split), two RRs, a 3-person team bracket', configure([
            {'name': 'Open RR', 'format': 'Round Robin', 'court': 'split', 'entrants': entrants('R', 8)},
            {'name': 'Open SE', 'format': 'Single Elimination', 'court': 'split', 'entrants': entrants('S', 6)},
            {'name': 'Kids', 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('K', 3)},
            {'name': 'Juniors', 'format': 'Round Robin', 'court': 'B', 'entrants': entrants('J', 4)},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'court': 'B', 'teams': 4}])),
        ('A: points and a hansoku pair', on('A', "point('W', 'M'); hansoku('R'); hansoku('R'); point('R', 'K');")),
        ('A: undo twice, redo once', on('A', 'undo(); undo(); redo();')),
        ('A: Next Match', on('A', 'nextMatch();')),
        ('A: Next Match undone and redone', on('A', 'undo(); redo();')),
        ('A: undone across Next Match', on('A', 'undo(); undo();')),
        ('A: a point, Next Match', on('A', "point('W', 'K'); nextMatch();")),
        ('B: Fusen-gachi and Next Match', on('B', "confirmFusen('W'); nextMatch();")),
        ('B: 4 bouts', play('B', 4)),
        ('B: undone twice, redone once', on('B', 'undo(); undo(); redo();')),
        ('A: the single elimination picked', ev("() => { KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('Open SE'); }")),
        ('A: 3 bracket bouts', play('A', 3)),
        ('A: the advancing bout undone and redone', on('A', 'undo(); redo();')),
        ('A: Kids picked, drawn into a tiebreak', ev("""async () => { KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('Kids');
            for (let i = 0; i < 3; i++) { const m = KSMTest.prepareCourt('A'); if (!m || m.division !== 'Kids') break; nextMatch(); } }""")),
        ('A: the Next Match that drew the tiebreak undone and redone', on('A', 'undo(); redo();')),
        ('A: 12 bouts', play('A', 12, 5)),
        ('B: 12 bouts', play('B', 12, 5)),
        ('A: undo, a point, redo (nothing to redo)', on('A', "undo(); point('R', 'D'); redo();")),
        ('A: the rest', play('A', 80, 7)),
        ('B: the rest', play('B', 80, 7)),
        ('B: undone and redone at the end', on('B', 'undo(); redo(); undo();')),
    ]


def team_round_robin():
    return [
        ('generated: a 3-person team round robin on both courts', configure([
            {'name': 'Solo', 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('X', 3)},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'court': 'Both', 'teams': 4}])),
        ('A: drawn team bouts (representative playoffs)', play('A', 30, 1)),
        ('B: drawn team bouts', play('B', 30, 1)),
        ('A: undone twice, redone twice', on('A', 'undo(); undo(); redo(); redo();')),
        ('A: the rest', play('A', 80, 2)),
        ('B: the rest', play('B', 80, 2)),
    ]


def kachinuki(tournament, teams):
    name = tournament.lower().replace(' ', '-')
    return [
        (f'generated: kachinuki {name}', configure([
            {'name': 'Solo', 'format': 'Round Robin', 'court': 'B', 'entrants': entrants('Y', 3)},
            {'team': True, 'format': 'Kachinuki', 'tournament': tournament, 'court': 'Both', 'teams': teams}])),
        (f'{name} A: 5 kachinuki bouts', play('A', 5)),
        (f'{name} A: undone and redone across Next Match', on('A', 'undo(); undo(); redo();')),
        (f'{name} B: 5 bouts', play('B', 5)),
        (f'{name} A: the rest', play('A', 80, 3)),
        (f'{name} B: the rest', play('B', 80, 3)),
    ]


def scenarios():
    return [('individual and team bracket', individual_and_team()), ('team round robin', team_round_robin()),
            ('kachinuki round robin', kachinuki('Round Robin', 3)), ('kachinuki single elimination', kachinuki('Single Elimination', 4))]


def open_page(browser, errors, mode):
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    load_app(page)
    if mode == 'copied':
        page.evaluate(COPY_HOOK)
    elif mode == 'frozen':
        page.evaluate(FREEZE_HOOK)
    return page


def main():
    global checks
    started = time.time()
    duplicates = set()
    overlay_states = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for scenario, steps in scenarios():
            errors = {'control': [], 'copied': [], 'frozen': []}
            pages = {mode: open_page(browser, errors[mode], mode) for mode in ('control', 'copied', 'frozen')}
            control, copied, frozen = pages['control'], pages['copied'], pages['frozen']
            failed = set()
            for name, run in steps:
                seen = {}
                for label, page in pages.items():
                    if label in failed:
                        continue
                    page.evaluate(SEED)
                    try:
                        run(page)
                        if label == 'copied':
                            page.evaluate('() => window.__copyAllMatches()')
                        seen[label] = page.evaluate(OBSERVE)
                    except Exception as e:  # a frozen page's write that missed the helpers throws inside the step
                        errors[label].append(str(e).split('\n')[0])
                    if errors[label]:
                        message = f'{scenario}: {name}: {label} page errors {errors[label][:3]}'
                        if not ALL:
                            raise AssertionError(message)
                        diverged.append(message)
                        failed.add(label)
                for label in ('copied', 'frozen'):
                    if label not in seen:
                        continue
                    for key, want in seen['control'].items():
                        got = seen[label][key]
                        if got != want:
                            at = next((i for i, (a, b) in enumerate(zip(got, want)) if a != b), min(len(got), len(want)))
                            if ALL:
                                diverged.append(f'{scenario}: {name}: {key} at {at}: {label} ...{got[max(0, at - 160):at + 120]}')
                                continue
                            raise AssertionError(f'{scenario}: {name}: {key} differs when matches are new objects ({label} page, at character {at})\n'
                                                 f'  {label}  ...{got[max(0, at - 300):at + 300]}\n  control ...{want[max(0, at - 300):at + 300]}')
                        checks += 1
                duplicates.update(copied.evaluate(DUPLICATES))
                overlay_states.append({'label': f'{scenario}: {name}', 'state': copied.evaluate('() => KSMTest.app.tournamentPayload().state')})
            stale = copied.evaluate('() => window.__staleRestores || 0')
            assert stale > 0 or ALL, f'{scenario}: held matches were made stale after a result write ({stale})'
            checks += 1
            if 'frozen' not in failed:
                writes = frozen.evaluate('() => window.__matchWrites || 0')
                assert writes > len(steps), f'{scenario}: the frozen page wrote through match-writes.js ({writes})'
                checks += 1
            copies = copied.evaluate('() => window.__matchCopies')
            assert copies > len(steps), f'{scenario}: the matches were copied ({copies} times)'
            checks += 1
            if scenario == 'team round robin':
                picked = copied.evaluate('() => window.__representativesPicked || 0')
                if picked == 0 and ALL:
                    diverged.append(f'{scenario}: no representative was picked (no playoff reached in the copied page)')
                else:
                    assert picked > 0, f'{scenario}: a representative was picked ({picked})'
                checks += 1
            played = control.evaluate('() => Object.values(KSMTest.app.state.allMatches).flat().filter(m => m.done).length')
            assert played > 5, f'{scenario}: bouts were played ({played})'
            checks += 1
            control.close(); copied.close(); frozen.close()
        browser.close()
    # The overlay (its own bundle, not in the app page): its selection on each step's saved state, with every read of a
    # match a new object, must be the same as on the state as it is.
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump(overlay_states, f)
    out = subprocess.run(['node', '--experimental-strip-types', '--disable-warning=ExperimentalWarning', str(Path(__file__).parent / 'lib/overlay-copy-check.mjs'), f.name],
                         capture_output=True, text=True, check=True)
    Path(f.name).unlink()
    result = json.loads(out.stdout)
    assert result['count'] == 2 * len(overlay_states), result
    for m in result['mismatches']:
        message = f"{m['label']}: overlay court {m['court']} differs when matches are new objects\n  copied  {m['got']}\n  control {m['want']}"
        if not ALL:
            raise AssertionError(message)
        diverged.append(message.replace('\n', ' '))
    if ALL and result['total'] > len(result['mismatches']):
        diverged.append(f"... {result['total'] - len(result['mismatches'])} more overlay mismatches")
    checks += result['count']
    if diverged:
        print('\n'.join(diverged))
        print(f'FAIL match identity copy: {len(diverged)} divergences')
        sys.exit(1)
    print(f'Shared sync identities seen: {sorted(duplicates) or "none"}')
    print(f'PASS match identity copy: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
