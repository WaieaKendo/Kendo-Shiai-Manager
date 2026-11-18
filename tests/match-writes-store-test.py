"""Every write to `allMatches` through one module (#15 PR 13c-1, docs/STORE.md section 3 item 13).

`allMatches` stays a plain field; every write to it, to a division's list or to a bout goes through
app/modules/court/match-writes.js (whole lists, one bout's fields in one write, several bouts' fields, inserts, appends,
removals, sorts, the Undo/Redo and rebase path writes). No behaviour change. Checked:

  1. The saved snapshot is the same, value for value: after each step (a division renamed before the draw; pools with a
     championship, a single elimination with byes (split courts), two round robins and a team bracket drawn; a team's
     No Show in the bracket; a player's No Show in the single elimination and in a pool; a division's court changed
     after the draw; Edit Pool; a single division regenerated; points, hansoku, Fusen-gachi, Undo / Redo across Next
     Match on both courts; a bracket bout that advances its winner undone and redone; bouts drawn into a pool tiebreak,
     the Next Match that drew it undone and redone; play to the end; a remote apply; a 4.0-shaped load (a bout without
     its result snapshot, an invalid entry, a misplaced tiebreak, no teamElimTeams); three save conflicts (both courts
     scoring, then one undoes; an Undo here while the other court's history arrives; a Redo against the other court's
     Next Match); a team round robin with drawn bouts (representative playoffs, their representatives picked) and its
     daihyosen; kachinuki round robin and single elimination (bouts inserted as they go) with Undo / Redo; a grand
     champion drawn, played, undone and cleared), every key of `tournamentPayload().state` has the JSON the code before
     this PR saved (EXPECTED_FILE, recorded by running this file with `--dump` on next/4.1 at 821ad0e; random ids, times
     and the tab id are replaced by marks; keys other than the pointers and the view are kept as a hash).
  2. The same steps on a page as 13c-2 will leave it (tests/lib/match-freeze-hook.js: the map, every list and every bout
     frozen copies, replaced by new frozen copies at each helper write, store notification and app event): no write
     outside the helpers (it would throw), no object held across a write read stale, and every snapshot as recorded.
  4. (this PR's code only) With nothing changed, the read paths (renders, the court island's queue, Live Scores, the TV,
     Director Progress, findNextForCourt()) write nothing (#206 review M1).
  3. (this PR's code only) On the frozen page a division's list assigned or deleted, a list method on it and a field
     written on a bout throw; a point gives its bout a new frozen object and leaves the one held before as it was.
"""
import hashlib
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

DUMP = '--dump' in sys.argv
EXPECTED_FILE = Path(__file__).parent / 'store/fixtures/match-writes-snapshots-before.json'
FREEZE_HOOK = (Path(__file__).parent / 'lib/match-freeze-hook.js').read_text()
checks = 0

SNAPSHOT = r"""() => {
  const p = KSMTest.app.tournamentPayload(), st = p.state;
  if (Array.isArray(st.divisionRenames)) st.divisionRenames = st.divisionRenames.map((r, i) => ({...r, id: `rename ${i}`}));
  const ids = new Map(), number = text => text.replace(/(team|gc):[0-9a-f]{24,32}/g, id => { if (!ids.has(id)) ids.set(id, `${id.split(':')[0]} #${ids.size}`); return ids.get(id); })
    .replace(/"tabId":"[^"]*"/g, '"tabId":"<tab>"').replace(/"clientId":"[^"]*"/g, '"clientId":"<client>"').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/":1[6-9]\d{11}\b/g, '":<ms>');
  const values = {};
  for (const k of Object.keys(st).sort()) values[k] = number(JSON.stringify(st[k]) ?? 'undefined');
  return {keys: Object.keys(st), values};
}"""
KEPT = {'courtState', 'courtActiveDivision', 'currentByDivision', 'currentDivision', 'current', 'score'}


def shrink(snapshot):
    return {**snapshot, 'values': {k: v if k in KEPT else 'sha256:' + hashlib.sha256(v.encode()).hexdigest() for k, v in snapshot['values'].items()}}


SEED = r"""() => { let a = 41; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""
RR, SE, KIDS, JUN = 'Open RR', 'Open SE', 'Kids', 'Juniors'
DRAG_JS = """([player, pool, index]) => {
  const dt = new DataTransfer(), source = document.querySelector(player), target = document.querySelectorAll(pool)[index];
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt}));
  fire(source, 'dragstart'); fire(target, 'dragover'); fire(target, 'drop'); fire(source, 'dragend');
}"""


def ev(script, arg=None):
    return lambda pg: pg.evaluate(script, arg)


def entrants(prefix, n, status='Checked'):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i % 3}', 'seed': '', 'status': status} for i in range(n)]


def configure(team='Single Elimination', kids=3, extra=()):
    divisions = [{'name': RR, 'format': 'Round Robin', 'court': 'split', 'entrants': entrants('R', 8)},
                 {'name': SE, 'format': 'Single Elimination', 'court': 'split', 'entrants': entrants('S', 6)},
                 {'name': KIDS, 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('K', kids)},
                 {'name': JUN, 'format': 'Round Robin', 'court': 'B', 'entrants': entrants('J', 4)}, *extra]
    if team:
        divisions.append({'team': True, 'format': '3-Person Team', 'tournament': team, 'court': 'B', 'teams': 4})
    return ev('entries => KSMTest.configure(entries)', divisions)


def team_only(fmt, tournament, teams, court='Both'):
    return ev('entries => KSMTest.configure(entries)', [{'name': 'Solo', 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('X', 3)},
                                                        {'team': True, 'format': fmt, 'tournament': tournament, 'court': court, 'teams': teams}])


def award_mode(mode):
    """Setup's team award mode changed as its select does (the change listener adds the daihyosen it now needs)."""
    return ev("""mode => { const s = document.getElementById('teamAwardMode'); s.value = mode; s.dispatchEvent(new Event('change', {bubbles: true})); }""", mode)


def on(court, script):
    """`script` on `court` (the court opened as its own buttons would be pressed there)."""
    return ev(f"() => {{ KSMTest.prepareCourt('{court}'); {script} }}")


def edit_pool(div):
    """Registration -> Pools -> Edit Pool: the first player dragged onto the second pool, Save Pool Changes."""
    def run(page):
        page.evaluate("""div => { KSMTest.app.regTab('pools'); const s = document.getElementById('poolDiv'); s.value = div; KSMTest.app.renderPools(); KSMTest.app.toggleEditPools(); }""", div)
        page.wait_for_selector('[data-testid="pool-edit-player"]', state='attached')
        page.evaluate(DRAG_JS, ['[data-testid="pool-edit-player"]', '[data-testid="pool-edit-pool"]', 1])
        page.evaluate("""() => document.querySelector('[data-testid="pool-edit-save"]').click()""")
    return run


def load(drop=(), source='match writes store test', live=False, edit=''):
    """A load of this page's own payload with some fields changed (`edit`: JS on `p`, the payload)."""
    return ev(r"""([drop, source, live, edit]) => {
      const p = KSMTest.app.tournamentPayload();
      for (const k of drop) delete p.state[k];
      (new Function('p', edit))(p);
      if (live) KSMTest.app.applyTournamentPayload(p, false, {pinnedCourt: KSMTest.app.state.currentCourt, preserveLocalDivision: true, source: 'live sync'});
      else KSMTest.app.applyTournamentPayload(p, false, {source});
    }""", [list(drop), source, live, edit])


# A save conflict: `local` is this page's payload after `edit` (the app's own functions) on `base` (this page's payload,
# with its history when `keep_history`); `server` is the same base edited as JSON by `remote`; the rebase merges them on
# payload copies and the result is applied as a load.
def conflict(edit, remote, keep_history=False):
    return ev(r"""async ([edit, remote, keep]) => {
      const base = KSMTest.app.tournamentPayload();
      if (!keep) { base.state.courtActionHistory = {A: [], B: []}; base.state.courtRedoHistory = {A: [], B: []}; }
      KSMTest.app.applyTournamentPayload(structuredClone(base), false, {source: 'match writes store test base'});
      await (new Function('return (async () => {' + edit + '})()'))();
      const local = KSMTest.app.tournamentPayload(), server = structuredClone(base);
      (new Function('p', remote))(server);
      const merged = KSMTest.app.rebaseLocalPayloadOnRecord(local, {payload: server, revision: 1}, 0, base);
      KSMTest.app.applyTournamentPayload(merged, false, {source: 'match writes store test merge'});
    }""", [edit, remote, keep_history])


# A court plays up to n bouts: points (a draw every `draw_every` bout where ties are allowed), a team playoff's
# representatives picked as the select does, then Next Match.
PLAY = r"""async ([court, n, drawEvery]) => {
  for (let i = 0; i < n; i++) {
    const m = KSMTest.prepareCourt(court); if (!m) break;
    if (m.type === 'teamPlayoff' && /Representative/.test(m.white || '')) {
      const w = KSMTest.app.teamRoster(m.teamWhite, m.division)[0], r = KSMTest.app.teamRoster(m.teamRed, m.division)[0];
      if (w) KSMTest.app.setRepresentative('W', w); if (r) KSMTest.app.setRepresentative('R', r);
    }
    const draw = drawEvery && i % drawEvery === 0 && !KSMTest.mustWin(m);
    if (!draw) { point(i % 3 ? 'W' : 'R', 'M'); if (i % 4 === 1) point('W', 'K'); }
    // A bout that already had points (a load, a remote apply) can be level: one more where a winner is needed.
    const s = KSMTest.app.state.score; if (s.W.length === s.R.length && KSMTest.app.matchRequiresWinner(m)) point('W', 'D');
    const at = [KSMTest.app.state.currentDivision, KSMTest.app.state.current];
    nextMatch();
    if (KSMTest.app.state.currentDivision === at[0] && KSMTest.app.state.current === at[1] && !KSMTest.app.state.matches[at[1]]?.done) { window.__stuck = (window.__stuck || 0) + 1; break; }
  }
  KSMTest.saveNow('played'); await new Promise(r => setTimeout(r, 200));
}"""


def play(court, n, draw_every=0):
    return ev(PLAY, [court, n, draw_every])


# Court B's Next Match in a server copy (the other court's save), with the court action entry its device recorded.
REMOTE_B_NEXT = r"""const st = p.state, d = st.courtState.B && st.courtState.B.division, arr = st.allMatches[d] || [];
  const i = arr.findIndex((m, k) => k >= (st.courtState.B.index || 0) && !m.done && m.court === 'B' && m.white && m.red);
  if (i >= 0) { const was = JSON.parse(JSON.stringify(arr[i])); arr[i].wp = ['M']; arr[i].done = true; const n = arr.findIndex((m, k) => k > i && !m.done && m.court === 'B');
    st.courtState.B = {division: d, index: n < 0 ? arr.length : n}; st.courtActiveDivision.B = d; st.currentByDivision[d] = st.courtState.B.index;
    st.courtActionHistory = st.courtActionHistory || {A: [], B: []}; st.courtActionHistory.B = st.courtActionHistory.B || [];
    st.courtActionHistory.B.push({format: 'patch-v1', label: 'Next Match: remote', court: 'B', when: '2030-01-01T00:00:00.000Z', clientId: 'other-device', tabId: 'other-tab', revision: 1,
      patches: [{path: ['allMatches', d, i, 'wp'], before: was.wp || [], after: ['M']}, {path: ['allMatches', d, i, 'done'], before: Boolean(was.done), after: true}], identityStamps: 1}); }"""

# A 4.0-shaped save: a finished bout without its result snapshot (the load's result repair), an invalid entry (removed by
# the load), Kids' pool bouts after its championship (none: kept as is) and no teamElimTeams.
OLD_SAVE = r"""const all = p.state.allMatches;
  for (const d of Object.keys(all)) { const m = all[d].find(x => x && x.done && x.completedResult); if (m) { delete m.completedResult; break; } }
  const d = Object.keys(all).find(k => all[k].length > 2); if (d) all[d].splice(1, 0, null);
  delete p.state.teamElimTeams;"""


def steps():
    return [
        ('opened', None),
        ('a division renamed before the draw', ev("""() => { KSMTest.app.setDivisionLists({divisions: ['Juniors', 'Masters'], divisionTypes: {Juniors: 'Single Elimination', Masters: 'Round Robin'}, divisionCourts: {Juniors: 'A', Masters: 'B'}}); KSMTest.app.ksmRenameSetupDivision('Juniors', 'Juniors U15'); }""")),
        ('generated: pools + championship (split), single elimination with byes (split), two round robins, a team bracket', configure()),
        ('a team No Show in the team bracket', ev("() => KSMTest.app.cycleTeamStatus(1)")),
        ('a player No Show in the single elimination', ev(f"() => KSMTest.app.applyIndividualNoShow('{SE}', 'S 3')")),
        ('a player No Show in a pool', ev(f"() => KSMTest.app.applyIndividualNoShow('{JUN}', 'J 2')")),
        ('a division\'s court changed after the draw', ev(f"() => KSMTest.app.setDivisionCourtNow('{JUN}', 'A')")),
        ('Edit Pool saved', edit_pool(RR)),
        ('a single division regenerated', ev(f"() => KSMTest.app.regenerateSingleDivision('{KIDS}')")),
        ('court A: points, a hansoku pair, a point', on('A', "point('W', 'M'); hansoku('R'); hansoku('R'); point('R', 'K');")),
        ('court A: two undone, one redone', on('A', 'undo(); undo(); redo();')),
        ('court A: Next Match', on('A', 'nextMatch();')),
        ('court A: Next Match undone and redone', on('A', 'undo(); redo();')),
        ('court A: undone across Next Match', on('A', 'undo(); undo();')),
        ('court A: redone twice', on('A', 'redo(); redo();')),
        ('court B: Fusen-gachi and Next Match', on('B', "confirmFusen('W'); nextMatch();")),
        ('court B: 4 bouts', play('B', 4)),
        ('court B: undone twice, redone once', on('B', 'undo(); undo(); redo();')),
        ('court A: the single elimination picked', ev(f"() => {{ KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('{SE}'); }}")),
        ('court A: bracket bouts (a winner advances)', play('A', 3)),
        ('court A: the advancing bout undone and redone', on('A', 'undo(); redo();')),
        ('court A: Kids picked, bouts drawn into a tiebreak', ev(f"""async () => {{ KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('{KIDS}');
            for (let i = 0; i < 3; i++) {{ const m = KSMTest.prepareCourt('A'); if (!m || m.division !== '{KIDS}') break; nextMatch(); }} }}""")),
        ('court A: the Next Match that drew the tiebreak undone and redone', on('A', 'undo(); redo();')),
        ('court A: undone before a remote apply', on('A', 'undo();')),
        ('a remote apply (court B\'s Next Match elsewhere)', load(live=True, edit=REMOTE_B_NEXT)),
        ('court A: redone after the remote apply', on('A', 'redo();')),
        ('conflict: two courts score, then Court A undoes', conflict("KSMTest.prepareCourt('A'); KSMTest.play([['W', 'M']]); undo();", REMOTE_B_NEXT)),
        ('conflict: an Undo here while the other court\'s history arrives', conflict("KSMTest.prepareCourt('A'); undo(); undo();", REMOTE_B_NEXT, keep_history=True)),
        ('conflict: a Redo here against the other court\'s Next Match', conflict("KSMTest.prepareCourt('A'); redo();", REMOTE_B_NEXT, keep_history=True)),
        ('court A: 8 bouts', play('A', 8, 5)),
        ('court B: 8 bouts', play('B', 8, 5)),
        ('load: a 4.0-shaped save', load(edit=OLD_SAVE)),
        ('court A: the rest', play('A', 90, 7)),
        ('court B: the rest', play('B', 90, 7)),
        ('court B: undone and redone at the end', on('B', 'undo(); redo(); undo();')),
        ('a load of the finished tournament', load(source='file')),
        # A team round robin with drawn bouts: representative playoffs (their representatives picked) and a daihyosen
        ('generated: a team round robin on both courts (champion only awarded)', award_mode('top1')),
        ('the team round robin drawn', team_only('3-Person Team', 'Round Robin', 4)),
        ('team RR A: drawn team bouts', play('A', 30, 1)),
        ('team RR B: drawn team bouts', play('B', 30, 1)),
        ('team RR A: undone twice, redone twice', on('A', 'undo(); undo(); redo(); redo();')),
        ('team RR: the rest', ev(f'async () => {{ await ({PLAY})(["A", 80, 2]); await ({PLAY})(["B", 80, 2]); }}')),
        ('team RR: the award mode widened (daihyosen for the places now awarded)', award_mode('dual3')),
        # Kachinuki: the next bout inserted after each one
        ('generated: kachinuki round robin', team_only('Kachinuki', 'Round Robin', 3)),
        ('kachinuki RR A: 5 bouts', play('A', 5)),
        ('kachinuki RR A: undone and redone across Next Match', on('A', 'undo(); undo(); redo();')),
        ('kachinuki RR: the rest', ev(f'async () => {{ await ({PLAY})(["A", 80, 3]); await ({PLAY})(["B", 80, 3]); }}')),
        ('generated: kachinuki single elimination', team_only('Kachinuki', 'Single Elimination', 4)),
        ('kachinuki SE: 6 bouts on each court', ev(f'async () => {{ await ({PLAY})(["A", 6, 0]); await ({PLAY})(["B", 6, 0]); }}')),
        ('kachinuki SE B: undone and redone', on('B', 'undo(); redo();')),
        ('kachinuki SE: the rest', ev(f'async () => {{ await ({PLAY})(["A", 80, 0]); await ({PLAY})(["B", 80, 0]); }}')),
        # The grand champion: drawn from finished sources, played, undone, then cleared
        ('two single eliminations drawn', ev("""p => KSMTest.configure([
            {name: 'GC A', format: 'Single Elimination', court: 'A', entrants: p[0]},
            {name: 'GC B', format: 'Single Elimination', court: 'B', entrants: p[1]}])""", [entrants('GA', 2), entrants('GB', 2)])),
        ('grand champion added', ev("() => { KSMTest.addGrandChampion(['GC A', 'GC B'], {name: 'Grand Champion', court: 'A'}); }")),
        ('GC A played', play('A', 1)),
        ('GC B played, the grand champion drawn', play('B', 1)),
        ('court B: the Next Match that drew it undone and redone', on('B', 'undo(); redo();')),
        ('the grand champion: a point, undone', on('A', "point('W', 'M'); undo();")),
        ('a source reopened on a load: the draw cleared', ev("""() => { const p = KSMTest.app.tournamentPayload();
            p.state.allMatches['GC B'].forEach(m => { m.done = false; m.wp = []; m.rp = []; delete m.completedResult; });
            KSMTest.app.applyTournamentPayload(p, false, {source: 'match writes store test'}); KSMTest.app.renderAll(); }""")),
        ('the tournament closed', ev("() => KSMTest.app.ksmResetTournament()")),
    ]


def compare(name, got, want, label):
    global checks
    assert sorted(got['keys']) == sorted(want['keys']), f'{label}: {name}: keys {sorted(set(got["keys"]) ^ set(want["keys"]))}'; checks += 1
    for key in want['keys']:
        assert got['values'][key] == want['values'][key], f'{label}: {name}: state.{key}\n  now    {got["values"][key][:900]}\n  before {want["values"][key][:900]}'
        checks += 1


def strict_writes(page):
    """3: on the frozen page a write that does not go through match-writes.js throws; the helpers write."""
    global checks
    configure()(page)
    # (`state.allMatches = …` itself stays a plain assignment until 13c-2 makes it a getter: replaceState() assigns it on
    # a load; tests/store/match-writes.test.mjs finds such a write in the sources.)
    for write in (f"KSMTest.app.state.allMatches['{KIDS}'] = []", f"delete KSMTest.app.state.allMatches['{KIDS}']",
                  f"KSMTest.app.state.allMatches['{KIDS}'].push({{}})", f"KSMTest.app.state.allMatches['{KIDS}'].splice(0, 1)",
                  f"KSMTest.app.state.allMatches['{KIDS}'].sort(() => 0)", f"KSMTest.app.state.allMatches['{KIDS}'][0].done = true",
                  f"KSMTest.app.state.allMatches['{KIDS}'][0].wp.push('M')", "KSMTest.app.state.matches.push({})"):
        threw = page.evaluate(f"() => {{ 'use strict'; try {{ {write}; return false; }} catch (e) {{ return e instanceof TypeError; }} }}")
        assert threw, f'{write} did not throw on the frozen page'; checks += 1
    held = page.evaluate(f"""() => {{ const div = '{KIDS}', before = KSMTest.app.state.allMatches[div][0];
        KSMTest.prepareCourt('A'); KSMTest.app.selectScorekeeperDivision(div); KSMTest.app.point('W', 'M');
        const after = KSMTest.app.state.allMatches[div][0];
        return [before === after, (before.wp || []).length, (after.wp || []).length, Object.isFrozen(after)]; }}""")
    assert held == [False, 0, 1, True], f'a point gives the bout a new frozen object and leaves the held one as it was: {held}'; checks += 1


READ_PATHS = r"""async () => {
  const app = KSMTest.app;
  app.renderAll(); app.renderPublic(); app.renderTvDisplay(); app.renderQueue(); app.renderContext();
  // (KSMTest.prepareCourt() finds the court's next bout when its bout is not ready.)
  // (The court island's queue dedupes the split single elimination shown on Court A when it publishes; Live Scores and
  // the TV sort their upcoming bouts.)
  for (const c of ['B', 'A']) { KSMTest.prepareCourt(c); app.buildTV3ViewModel(c); app.courtSummaryFor(c); }
  window.dispatchEvent(new Event('ksm:state-changed'));
  await new Promise(r => setTimeout(r, 250));
}"""


def read_paths(page):
    """4 (#206 review M1): the read paths (renders, the court island's queue and dedupe, Live Scores, the TV, Director
    Progress, findNextForCourt()) write no bout list once it is as they want it: a second round writes nothing."""
    global checks
    for court in ('A', 'B'):
        play(court, 6, 3)(page)
    page.evaluate(f"() => {{ KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('{SE}'); }}")
    page.evaluate(READ_PATHS)
    first = page.evaluate('() => window.__matchWrites || 0')
    page.evaluate(READ_PATHS)
    second = page.evaluate('() => window.__matchWrites || 0')
    assert second == first, f'the read paths wrote {second - first} times with nothing changed'; checks += 1
    return first


def run_steps(page, errors, label, expected):
    seen = {}
    for name, run in steps():
        page.evaluate(SEED)
        if run:
            run(page)
        seen[name] = shrink(page.evaluate(SNAPSHOT))
        counts = page.evaluate('() => [Object.values(KSMTest.app.state.allMatches || {}).flat().filter(m => m && m.done).length, Object.keys(KSMTest.app.state.allMatches || {}).length, JSON.stringify(KSMTest.app.state.courtState), window.__stuck || 0]')
        if DUMP:
            sys.stderr.write(f'{name}: {counts}\n')
        assert not errors, f'{label}: {name}: {errors}'
        if not DUMP:
            compare(name, seen[name], expected[name], label)
    return seen


def new_page(browser, errors):
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    load_app(page)
    return page


def main():
    global checks
    started = time.time()
    assert len({n for n, _ in steps()}) == len(steps()), 'step names are unique'
    with sync_playwright() as p:
        browser = launch_chromium(p)
        expected = None if DUMP else json.loads(EXPECTED_FILE.read_text())
        errors = []
        seen = run_steps(new_page(browser, errors), errors, 'app', expected)
        if DUMP:
            print(json.dumps(seen, indent=1, ensure_ascii=False))
        else:
            assert list(seen) == list(expected), 'the same steps as recorded'; checks += 1
            # 2: the same steps with every match frozen between the helpers' writes
            frozen_errors = []
            frozen = new_page(browser, frozen_errors)
            frozen.evaluate(FREEZE_HOOK)
            run_steps(frozen, frozen_errors, 'frozen', expected)
            writes = frozen.evaluate('() => window.__matchWrites || 0')
            assert writes > len(steps()), f'the frozen page wrote through match-writes.js ({writes})'; checks += 1
            # 3
            strict_errors = []
            strict = new_page(browser, strict_errors)
            strict.evaluate(FREEZE_HOOK)
            strict_writes(strict)
            before = strict.evaluate('() => window.__matchWrites || 0')
            settled = read_paths(strict)
            sys.stderr.write(f'read paths: {settled - before} writes while playing and in the first round, none in the second\n')
            assert not strict_errors, strict_errors
        browser.close()
    if not DUMP:
        print(f'PASS match writes store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
