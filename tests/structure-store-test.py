"""The draw structure in the store (#15 PR 12a, docs/STORE.md section 3 item 12).

`pools`, `teamPools`, `brackets`, `singleElimComps`, `byeWinners`, `generated` and `managementRevision` are the
`tournament` slice's; `state` reads them through getters and every write is one tournament/… action
(app/modules/engine/structure-store.js). No behaviour change. Checked (one offline page, strict store: a write the
conversion missed, a pool or entrant edited in place included, throws):

  1. The saved snapshot is the same, value for value: after each step (a division renamed before the draw; the draw of
     every format: pools with a championship on split courts, single elimination, team round robin, team single
     elimination, kachinuki, exhibitions; Edit Pool saved; a single division regenerated (round robin and single
     elimination); a player's No Show in a pool and in a bracket; a team's No Show in
     a team round robin and a team bracket; a division's court changed after the draw and back to split (the pools' split courts are kept on them again); a bout played; the grand champion
     drawn from finished sources, then cleared; five kinds of load (a 4.0-shaped save without `singleElimComps` /
     `byeWinners` / `teamPools` / `managementRevision`, one with bye winners, one not generated, a file-shaped one, the
     undo-regenerate restore point); three save conflicts merged on payload copies and applied: two devices draw different
     divisions, one regenerates while the other edits another division's pools, and a pool change against a draw of the
     same division (the director is asked; OK re-applies)), every key of `tournamentPayload().state` has the JSON the code
     before PR 12a saved (EXPECTED_FILE, recorded by running this file with `--dump` on next/4.1 at cf8d884, and again at
     1010b95 (the PR 12a code) once court-action patches were compared grouped by key for PR 12b; random ids,
     times and the tab id are replaced by marks; keys other than the structure's and the divisions' are kept as a hash).
     The order of the top-level keys may differ after a load (docs/STORE.md section 3 item 5 (3)); the order inside each
     value may not.
  2. (this PR's code only) A division's draw is one action: during a whole-tournament generate, no store notification
     shows a division whose pools are in the store without its matches in `state.allMatches`, or the other way round.
  3. Strict store: writing a map, an entry or a pool row in place throws (the draw is store data).
"""
import hashlib
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

DUMP = '--dump' in sys.argv
EXPECTED_FILE = Path(__file__).parent / 'store/fixtures/structure-snapshots-before.json'
checks = 0

SNAPSHOT = r"""() => {
  const p = KSMTest.app.tournamentPayload(), st = p.state;
  // Since PR 12b (bracket-nodes-store-test.py): a court action's patches are compared grouped by top-level key, whose
  // order after a load differs once a key is a store getter (docs/STORE.md section 3 item 5 (3)).
  const byKey = v => { if (Array.isArray(v)) return v.map(byKey); if (!v || typeof v !== 'object') return v;
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, byKey(x)]));
    if (Array.isArray(o.patches) && o.patches.every(x => x && Array.isArray(x.path))) o.patches = [...o.patches].sort((x, y) => String(x.path[0]) < String(y.path[0]) ? -1 : String(x.path[0]) > String(y.path[0]) ? 1 : 0);
    return o; };
  for (const k of ['courtActionHistory', 'courtRedoHistory', 'courtUndoLog']) if (st[k] !== undefined) st[k] = byKey(st[k]);
  if (Array.isArray(st.divisionRenames)) st.divisionRenames = st.divisionRenames.map((r, i) => ({...r, id: `rename ${i}`}));
  const ids = new Map(), number = text => text.replace(/(team|gc):[0-9a-f]{24,32}/g, id => { if (!ids.has(id)) ids.set(id, `${id.split(':')[0]} #${ids.size}`); return ids.get(id); })
    .replace(/"tabId":"[^"]*"/g, '"tabId":"<tab>"').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/":1[6-9]\d{11}\b/g, '":<ms>');
  const values = {};
  for (const k of Object.keys(st).sort()) values[k] = number(JSON.stringify(st[k]) ?? 'undefined');
  return {keys: Object.keys(st), values};
}"""
KEPT = {'pools', 'teamPools', 'brackets', 'singleElimComps', 'byeWinners', 'generated', 'managementRevision', 'divisions', 'divisionCourts'}


def shrink(snapshot):
    return {**snapshot, 'values': {k: v if k in KEPT else 'sha256:' + hashlib.sha256(v.encode()).hexdigest() for k, v in snapshot['values'].items()}}


# The draws shuffle with Math.random: the same seed before every step, so both versions draw the same pools.
SEED = r"""() => { let a = 7; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""
DRAG_JS = """([player, pool, index]) => {
  const dt = new DataTransfer(), source = document.querySelector(player), target = document.querySelectorAll(pool)[index];
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt}));
  fire(source, 'dragstart'); fire(target, 'dragover'); fire(target, 'drop'); fire(source, 'dragend');
}"""
RR, SE, KIDS = 'Open RR', 'Open SE', 'Kids'


def ev(script, arg=None):
    return lambda pg: pg.evaluate(script, arg)


def entrants(prefix, n, status='Checked'):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i % 3}', 'seed': '', 'status': status} for i in range(n)]


def configure(team=None, extra=()):
    divisions = [{'name': RR, 'format': 'Round Robin', 'court': 'split', 'entrants': entrants('R', 8)},
                 {'name': SE, 'format': 'Single Elimination', 'court': 'B', 'entrants': entrants('S', 6)}, *extra]
    if team:
        divisions.append({'team': True, **team})
    return ev('entries => KSMTest.configure(entries)', divisions)


def load(state_over=None, drop=(), source='structure store test'):
    """A load of this page's own payload with some fields changed (a 4.0 device saves every field)."""
    return ev(r"""([over, drop, source]) => {
      const p = KSMTest.app.tournamentPayload();
      for (const k of drop) delete p.state[k];
      Object.assign(p.state, over);
      KSMTest.app.applyTournamentPayload(p, false, {source});
    }""", [state_over or {}, list(drop), source])


# A save conflict: `local` is this page's payload after `edit` (the app's own functions); `server` is the same base
# edited as JSON by `remote`; the rebase merges them on payload copies and the result is applied as a load.
def conflict(edit, remote):
    return ev(r"""([edit, remote]) => {
      const base = KSMTest.app.tournamentPayload();
      base.state.courtActionHistory = {A: [], B: []}; base.state.courtRedoHistory = {A: [], B: []};
      KSMTest.app.applyTournamentPayload(structuredClone(base), false, {source: 'structure store test base'});
      (0, eval)(edit);
      const local = KSMTest.app.tournamentPayload(), server = structuredClone(base);
      (new Function('p', remote))(server);
      const merged = KSMTest.app.rebaseLocalPayloadOnRecord(local, {payload: server, revision: 1}, 0, base);
      KSMTest.app.applyTournamentPayload(merged, false, {source: 'structure store test merge'});
    }""", [edit, remote])


def edit_pool(div):
    """Registration -> Pools -> Edit Pool: the first player dragged onto the second pool, Save Pool Changes."""
    def run(page):
        page.evaluate("""div => { KSMTest.app.regTab('pools'); const s = document.getElementById('poolDiv'); s.value = div; KSMTest.app.renderPools(); KSMTest.app.toggleEditPools(); }""", div)
        page.wait_for_selector('[data-testid="pool-edit-player"]', state='attached')
        page.evaluate(DRAG_JS, ['[data-testid="pool-edit-player"]', '[data-testid="pool-edit-pool"]', 1])
        page.evaluate("""() => document.querySelector('[data-testid="pool-edit-save"]').click()""")
    return run


PLAY = """async court => { const m = KSMTest.prepareCourt(court); if (!m) return null; KSMTest.play([['W', 'M']]); KSMTest.saveNow('played'); await new Promise(r => setTimeout(r, 400)); return m.division; }"""
KEEP_PAYLOAD = "() => { window.__structureRestorePoint = KSMTest.app.tournamentPayload(); }"
RESTORE = """() => KSMTest.app.applyTournamentPayload(window.__structureRestorePoint, false, {pinnedCourt: 'A', preserveLocalDivision: false, source: 'undo regenerate'})"""


def steps():
    team_rr = {'format': '3-Person Team', 'tournament': 'Round Robin', 'court': 'A', 'teams': 4}
    team_se = {'format': '3-Person Team', 'tournament': 'Single Elimination', 'court': 'B', 'teams': 5}
    kachinuki = {'format': 'Kachinuki', 'tournament': 'Single Elimination', 'court': 'A', 'teams': 4}
    return [
        ('opened', None),
        ('a division renamed before the draw', ev("""() => { KSMTest.app.setDivisionLists({divisions: ['Juniors', 'Masters'], divisionTypes: {Juniors: 'Round Robin', Masters: 'Round Robin'}, divisionCourts: {Juniors: 'A', Masters: 'B'}}); KSMTest.app.ksmRenameSetupDivision('Juniors', 'Juniors U15'); }""")),
        ('generated: pools + championship, single elimination, team round robin', configure(team_rr, [{'name': KIDS, 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('K', 3)}])),
        ('pool edit saved', edit_pool(RR)),
        ('single division regenerated: single elimination', ev(f"() => KSMTest.app.regenerateSingleDivision('{SE}')")),
        ('single division regenerated: round robin', ev(f"() => KSMTest.app.regenerateSingleDivision('{RR}')")),
        ('a player No Show in a pool', ev(f"() => KSMTest.app.applyIndividualNoShow('{KIDS}', 'K 2')")),
        ('a player No Show in a bracket', ev(f"() => KSMTest.app.applyIndividualNoShow('{SE}', 'S 3')")),
        ('a team No Show in a team round robin', ev("() => KSMTest.app.cycleTeamStatus(1)")),
        ('a division court changed after the draw', ev(f"() => KSMTest.app.setDivisionCourtNow('{RR}', 'A')")),
        ('the court back to split: the pools get their split courts again', ev(f"() => KSMTest.app.setDivisionCourtNow('{RR}', 'split')")),
        ('a bout played', ev(f'() => ({PLAY})("A")')),
        ('kept for the restore point', ev(KEEP_PAYLOAD)),
        ('regenerated: team single elimination', configure(team_se)),
        ('a team No Show in a team bracket', ev("() => KSMTest.app.cycleTeamStatus(2)")),
        ('regenerated: kachinuki', configure(kachinuki)),
        ('regenerated: exhibitions', ev("""() => { KSMTest.app.ksmSetSetting('exhibitionEnabled', 'Enabled');
            KSMTest.app.setPeople({exhibitions: [{white: 'X 1', red: 'Y 1', division: 'Exhibition', status: 'Checked'}, {white: 'X 2', red: 'Y 2', division: 'Exhibition', status: 'Checked'}]});
            KSMTest.app.generatePools({validated: true}); }""")),
        ('undo regenerate: the restore point applied', ev(RESTORE)),
        # The grand champion: drawn from finished sources, then cleared
        ('two single eliminations drawn', ev("""p => KSMTest.configure([
            {name: 'GC A', format: 'Single Elimination', court: 'A', entrants: p[0]},
            {name: 'GC B', format: 'Single Elimination', court: 'B', entrants: p[1]}])""", [entrants('GA', 2), entrants('GB', 2)])),
        ('grand champion added', ev("() => { KSMTest.addGrandChampion(['GC A', 'GC B'], {name: 'Grand Champion'}); }")),
        ('GC A played', ev(f'() => ({PLAY})("A")')),
        ('GC B played, the grand champion drawn', ev(f'() => ({PLAY})("B")')),
        ('a source reopened on a load: the draw cleared', ev("""() => { const p = KSMTest.app.tournamentPayload();
            p.state.allMatches['GC B'].forEach(m => { m.done = false; m.wp = []; m.rp = []; delete m.completedResult; });
            KSMTest.app.applyTournamentPayload(p, false, {source: 'structure store test'}); }""")),
        # Loads
        ('generated again for the loads', configure(team_rr, [{'name': KIDS, 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('K', 5)}])),
        ('load: 4.0 shape', load({}, drop=('singleElimComps', 'byeWinners', 'teamPools', 'managementRevision'))),
        ('load: bye winners', load({'byeWinners': {RR: [{'slot': 1, 'name': 'R 1', 'dojo': 'R Dojo 1'}]}, 'managementRevision': 7})),
        ('load: not generated', load({'generated': False, 'pools': {}, 'teamPools': {}, 'brackets': {}, 'singleElimComps': {}, 'byeWinners': {}, 'allMatches': {}})),
        ('generated for the conflicts', configure(team_rr, [{'name': KIDS, 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('K', 5)}])),
        ('load: a file', load({}, source='file')),
        # Save conflicts (merged on payload copies, then applied)
        ('conflict: two devices draw different divisions', conflict(
            f"KSMTest.app.regenerateSingleDivision('{SE}');",
            f"const d = '{KIDS}'; p.state.pools[d] = [{{label: 'A', size: 2, players: p.state.pools[d][0].players.slice(0, 2)}}]; p.state.managementRevision += 1;")),
        ('conflict: a regenerate against a pool edit of another division', conflict(
            f"KSMTest.app.regenerateSingleDivision('{KIDS}');",
            f"const d = '{RR}'; const a = p.state.pools[d][0].players, b = p.state.pools[d][1].players; [a[0], b[0]] = [b[0], a[0]]; p.state.managementRevision += 1;")),
        ('conflict: a pool change against a draw of the same division', conflict(
            f"KSMTest.app.applyIndividualNoShow('{RR}', KSMTest.app.state.pools['{RR}'][0].players[0].name);",
            f"const d = '{RR}'; p.state.pools[d] = p.state.pools[d].map(x => ({{...x, players: [...x.players].reverse()}})); p.state.allMatches[d] = p.state.allMatches[d].slice(1); p.state.managementRevision += 2;")),
    ]


def compare(name, got, want):
    global checks
    assert sorted(got['keys']) == sorted(want['keys']), f'{name}: keys {sorted(set(got["keys"]) ^ set(want["keys"]))}'; checks += 1
    for key in want['keys']:
        assert got['values'][key] == want['values'][key], f'{name}: state.{key}\n  now    {got["values"][key][:900]}\n  before {want["values"][key][:900]}'
        checks += 1


def strict_writes(page):
    """3: a map, an entry or a row written in place throws in the browser tests (the store runs strict there)."""
    global checks
    page.evaluate(f"""() => {{ const d = '{RR}'; if (!(KSMTest.app.state.pools[d] || []).length) throw new Error('no pools to write'); }}""")
    for write in ("KSMTest.app.state.pools = {}", f"KSMTest.app.state.pools['{RR}'] = []", f"KSMTest.app.state.pools['{RR}'][0].players = []",
                  f"KSMTest.app.state.pools['{RR}'][0].players[0].name = 'x'", f"delete KSMTest.app.state.pools['{RR}']",
                  "KSMTest.app.state.brackets = {}", f"KSMTest.app.state.brackets['{RR}'].push(['A1', 'B2'])",
                  "KSMTest.app.state.teamPools = {}", "KSMTest.app.state.singleElimComps = {}", f"KSMTest.app.state.singleElimComps['{SE}'][0] = null",
                  "KSMTest.app.state.byeWinners = {}", "KSMTest.app.state.generated = false", "KSMTest.app.state.managementRevision++"):
        threw = page.evaluate(f"() => {{ 'use strict'; try {{ {write}; return false; }} catch (e) {{ return e instanceof TypeError; }} }}")
        assert threw, f'{write} did not throw'; checks += 1


def one_action_per_division(page):
    """2: every store notification during a generate shows each division's pools and matches together."""
    global checks
    load_app(page)
    page.evaluate(SEED)
    got = page.evaluate(r"""p => {
      const store = window.KSMStore, a = KSMTest.app, types = [];
      const dispatch = store.dispatch;
      store.dispatch = action => { types.push(action.type); return dispatch(action); };
      const bad = [];
      const off = store.subscribe(() => {
        if (!types.includes('tournament/drawReset')) return; // from Generate's own first write on
        const t = store.getState().tournament, pools = Object.keys(t.pools || {}).sort().join('|'), matches = Object.keys(a.state.allMatches || {}).sort().join('|');
        if (pools !== matches) bad.push([types[types.length - 1], pools, matches]);
      });
      KSMTest.configure(p);
      off(); store.dispatch = dispatch;
      return {bad, generated: types.filter(t => t === 'tournament/divisionGenerated').length, divisions: Object.keys(a.state.allMatches).length, rev: a.state.managementRevision};
    }""", [{'name': RR, 'format': 'Round Robin', 'court': 'split', 'entrants': entrants('R', 8)},
           {'name': SE, 'format': 'Single Elimination', 'court': 'B', 'entrants': entrants('S', 6)},
           {'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'court': 'A', 'teams': 4}])
    assert not got['bad'], got; checks += 1
    assert got['generated'] == got['divisions'] == 3 and got['rev'] == 1, got; checks += 1


def main():
    global checks
    started = time.time()
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: d.accept())
        load_app(page)
        expected = None if DUMP else json.loads(EXPECTED_FILE.read_text())
        seen = {}
        for name, run in steps():
            page.evaluate(SEED)
            if run:
                run(page)
            seen[name] = shrink(page.evaluate(SNAPSHOT))
            assert not errors, f'{name}: {errors}'
            if not DUMP:
                compare(name, seen[name], expected[name])
        if DUMP:
            sys.stderr.write('grand champion drawn: %s\n' % json.dumps(seen['GC B played, the grand champion drawn']['values'].get('singleElimComps', ''))[:300])
            print(json.dumps(seen, indent=1, ensure_ascii=False))
        else:
            assert list(seen) == list(expected), 'the same steps as recorded'; checks += 1
            strict_writes(page)
            one_action_per_division(browser.new_page())
            assert not errors, errors
        browser.close()
    if not DUMP:
        print(f'PASS structure store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
