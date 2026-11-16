"""Awards and grand champions in the store (#15 PR 11, docs/STORE.md section 3 item 11).

`awards` and `grandChampions` are the `tournament` slice's; `state` reads them through getters and every write is one
tournament/… action (app/modules/registration/awards-store.js). No behaviour change. Checked (one offline page, strict
store: a write the conversion missed, a row edited in place included, throws):

  1. The saved snapshot is the same, value for value: after each step (an award added, edited, removed, cleared; a grand
     champion added, renamed, its sources toggled, a second one added, moved and removed; a division rename that touches
     a grand champion's sources; the sources played so the grand champion is drawn, then its name and award edited after
     the draw; four kinds of load (a 4.0-shaped save without grand champions, one with them, one with awards, one with a
     rename); two-device save conflicts on grand champions and awards merged on payload copies and applied), every key of
     `tournamentPayload().state` has the JSON the code before PR 11 saved (EXPECTED_FILE, recorded by running this file
     with `--dump` on next/4.1 at the commit before this PR, whose test API was given only this PR's `KSMTest.app`
     entries, which call the same window functions; random ids, times and the tab id are replaced by marks; keys other
     than the awards', the grand champions' and the divisions' are kept as a hash). The order of the top-level keys may
     differ after a load (docs/STORE.md section 3 item 5 (3)); the order inside each value, rows included, may not.
  2. The grand champion draw's other fields (`singleElimComps`, `allMatches`, `divisionCourts`, …) agree after each step
     (they are part of the hash).
  3. Strict store: writing a list or a row in place throws (rows are store data).
"""
import hashlib
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

DUMP = '--dump' in sys.argv
EXPECTED_FILE = Path(__file__).parent / 'store/fixtures/awards-snapshots-before.json'
checks = 0

SNAPSHOT = r"""() => {
  const p = KSMTest.app.tournamentPayload(), st = p.state;
  if (Array.isArray(st.divisionRenames)) st.divisionRenames = st.divisionRenames.map((r, i) => ({...r, id: `rename ${i}`}));
  // New team / grand champion ids are random (crypto): numbered in the order they first appear.
  // Played bouts carry the time (recordedAt, the court history) and the court history this tab's random id: marks.
  const ids = new Map(), number = text => text.replace(/(team|gc):[0-9a-f]{24,32}/g, id => { if (!ids.has(id)) ids.set(id, `${id.split(':')[0]} #${ids.size}`); return ids.get(id); })
    .replace(/"tabId":"[^"]*"/g, '"tabId":"<tab>"').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/":1[6-9]\d{11}\b/g, '":<ms>');
  const values = {};
  for (const k of Object.keys(st).sort()) values[k] = number(JSON.stringify(st[k]) ?? 'undefined');
  return {teamCourt: p.setup.teamCourt, keys: Object.keys(st), values};
}"""
KEPT = {'awards', 'grandChampions', 'divisions', 'divisionTypes', 'divisionCourts', 'divisionRenames', 'competitors'}


def shrink(snapshot):
    return {**snapshot, 'values': {k: v if k in KEPT else 'sha256:' + hashlib.sha256(v.encode()).hexdigest() for k, v in snapshot['values'].items()}}


SEED = r"""() => { let a = 7; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""


def ev(script, arg=None):
    return lambda pg: pg.evaluate(script, arg)


def entrants(*names):
    return [{'name': n, 'dojo': n + ' Dojo', 'seed': '', 'status': 'Checked'} for n in names]


def load(state_over=None, drop=()):
    """A load of this page's own payload with some fields changed (a 4.0 device saves every field)."""
    return ev(r"""([over, drop]) => {
      const p = KSMTest.app.tournamentPayload();
      for (const k of drop) delete p.state[k];
      Object.assign(p.state, over);
      KSMTest.app.applyTournamentPayload(p, false, {source: 'awards store test'});
    }""", [state_over or {}, list(drop)])


# A save conflict: `local` is this page's payload after `edit` (the app's own functions); `server` is the same base
# edited as JSON by `remote`; the rebase merges them on payload copies and the result is applied as a load.
def conflict(edit, remote):
    return ev(r"""([edit, remote]) => {
      const base = KSMTest.app.tournamentPayload();
      base.state.courtActionHistory = {A: [], B: []}; base.state.courtRedoHistory = {A: [], B: []};
      KSMTest.app.applyTournamentPayload(structuredClone(base), false, {source: 'awards store test base'});
      (0, eval)(edit);
      const local = KSMTest.app.tournamentPayload(), server = structuredClone(base);
      (new Function('p', remote))(server);
      const merged = KSMTest.app.rebaseLocalPayloadOnRecord(local, {payload: server, revision: 1}, 0, base);
      KSMTest.app.applyTournamentPayload(merged, false, {source: 'awards store test merge'});
    }""", [edit, remote])


PLAY = """async court => { const m = KSMTest.prepareCourt(court); if (!m) return null; KSMTest.play([['W', 'M']]); KSMTest.saveNow('played'); await new Promise(r => setTimeout(r, 600)); return m.division; }"""


def steps():
    gc_row = {'id': 'gc:fixed', 'name': 'Loaded GC', 'sources': ['Open', 'Women'], 'format': 'Single Elimination', 'court': 'B',
              'awardMode': 'top2', 'order': 0}
    return [
        ('opened', None),
        # Awards (Results' editor)
        ('award added', ev('() => KSMTest.app.addResultAward()')),
        ('award fields', ev("() => { KSMTest.app.ksmSetResultAward(0, 'name', 'Aki'); KSMTest.app.ksmSetResultAward(0, 'dojo', 'Aiea'); KSMTest.app.ksmSetResultAward(0, 'award', 'Best Kote'); }")),
        ('second award', ev("() => { KSMTest.app.addResultAward(); KSMTest.app.ksmSetResultAward(1, 'name', 'Bo'); }")),
        ('first removed', ev('() => KSMTest.app.removeResultAward(0)')),
        ('field the row lacks', ev("() => KSMTest.app.ksmSetResultAward(0, 'note', 'extra')")),
        ('all removed', ev('() => KSMTest.app.removeResultAward(0)')),
        ('award again', ev("() => { KSMTest.app.addResultAward(); KSMTest.app.ksmSetResultAward(0, 'name', 'Cy'); }")),
        # Grand champions
        ('divisions set, not drawn', ev("""() => KSMTest.app.setDivisionLists({divisions: ['Open', 'Women', 'Masters'], divisionTypes: {Open: 'Single Elimination', Women: 'Single Elimination', Masters: 'Single Elimination'},
            divisionCourts: {Open: 'A', Women: 'B', Masters: 'A'}})""")),
        ('grand champion added', ev("() => { KSMTest.addGrandChampion(['Open', 'Women'], {name: 'Grand Champion 2026'}); }")),
        ('renamed, award mode', ev("() => { const id = KSMTest.grandChampions()[0].id; KSMTest.updateGrandChampion(id, {name: ' GC Final '}); KSMTest.updateGrandChampion(id, {awardMode: 'top1'}); }")),
        ('source toggled off and on', ev("() => { const id = KSMTest.grandChampions()[0].id; KSMTest.app.ksmToggleGrandChampionSource(id, 'Women', false); KSMTest.app.ksmToggleGrandChampionSource(id, 'Masters', true); KSMTest.app.ksmToggleGrandChampionSource(id, 'Women', true); KSMTest.app.ksmToggleGrandChampionSource(id, 'Masters', false); }")),
        ('court changed', ev("() => { const id = KSMTest.grandChampions()[0].id; KSMTest.updateGrandChampion(id, {court: 'B'}); }")),
        ('an invalid edit', ev("() => { const id = KSMTest.grandChampions()[0].id; KSMTest.updateGrandChampion(id, {name: '  '}); }")),
        ('second added', ev("() => { KSMTest.addGrandChampion(['Open', 'Masters'], {name: 'Second'}); }")),
        ('second moved up', ev("() => KSMTest.app.ksmMoveGrandChampion(KSMTest.grandChampions()[1].id, 'up')")),
        ('moved down again', ev("() => KSMTest.app.ksmMoveGrandChampion(KSMTest.grandChampions()[0].id, 'down')")),
        ('second removed', ev("() => KSMTest.removeGrandChampion(KSMTest.grandChampions()[1].id)")),
        ('a source renamed', ev("() => KSMTest.app.ksmRenameSetupDivision('Women', 'Wom')")),
        ('divisions drawn', ev("""p => KSMTest.configure([
            {name: 'Open', format: 'Single Elimination', court: 'A', entrants: p[0]},
            {name: 'Wom', format: 'Single Elimination', court: 'B', entrants: p[1]},
            {name: 'Masters', format: 'Single Elimination', court: 'A', entrants: p[2]}])""", [entrants('Aki', 'Ben'), entrants('Cora', 'Dee'), entrants('Eli', 'Fay')])),
        # The sources finish: the grand champion is drawn
        ('Open played', ev(f'() => ({PLAY})("A")')),
        ('Wom played, grand champion drawn', ev(f'() => ({PLAY})("B")')),
        ('name and award after the draw', ev("() => { const id = KSMTest.grandChampions()[0].id; KSMTest.updateGrandChampion(id, {name: 'Drawn GC'}); KSMTest.updateGrandChampion(id, {awardMode: 'top2'}); }")),
        ('a structure edit after the draw', ev("() => { const id = KSMTest.grandChampions()[0].id; KSMTest.updateGrandChampion(id, {court: 'B'}); KSMTest.removeGrandChampion(id); }")),
        ('grand champion played', ev(f'async () => (await ({PLAY})("B")) || (await ({PLAY})("A"))')),
        # Loads
        ('load: 4.0 shape (no grand champions)', load({'awards': []}, drop=('grandChampions',))),
        ('load: grand champions', load({'grandChampions': [gc_row, {**gc_row, 'id': 'gc:second', 'name': 'Second loaded', 'order': 1}]})),
        ('load: awards', load({'awards': [{'award': 'Fighting Spirit', 'name': 'L', 'dojo': 'D'}, {'award': 'Kantosho', 'name': 'M', 'dojo': ''}]})),
        ('load: no awards', load({}, drop=('awards',))),
        ('load: a rename', load({'grandChampions': [{**gc_row, 'sources': ['Kids', 'Women']}],
                                 'divisionRenames': [{'id': 'c1:a', 'from': 'Kids', 'to': 'Under 12'}]})),
        # Save conflicts (merged on payload copies, then applied)
        ('reset for conflicts', load({'grandChampions': [gc_row, {**gc_row, 'id': 'gc:second', 'name': 'Second', 'sources': ['Open', 'Masters'], 'order': 1}],
                                      'awards': [{'award': 'Best Kote', 'name': 'A', 'dojo': ''}, {'award': 'Kantosho', 'name': 'B', 'dojo': ''}]})),
        ('conflict: grand champion edited on both', conflict(
            "KSMTest.updateGrandChampion('gc:fixed', {name: 'Local name'});",
            "p.state.grandChampions[0].awardMode = 'top1'; p.state.grandChampions[1].name = 'Server second';")),
        ('conflict: one edits, the other removes', conflict(
            "KSMTest.updateGrandChampion('gc:second', {name: 'Edited here'});",
            "p.state.grandChampions.splice(1, 1);")),
        ('conflict: both add a grand champion', conflict(
            "KSMTest.addGrandChampion(['Open', 'Masters'], {name: 'Added here'});",
            "p.state.grandChampions.push({id: 'gc:server', name: 'Added there', sources: ['Open', 'Women'], format: 'Single Elimination', court: 'A', awardMode: 'top2', order: 5});")),
        ('conflict: awards on both', conflict(
            "KSMTest.app.ksmSetResultAward(0, 'name', 'Local A'); KSMTest.app.addResultAward();",
            "p.state.awards[1].name = 'Server B'; p.state.awards.push({award: 'Server new', name: 'S', dojo: ''});")),
    ]


def compare(name, got, want):
    global checks
    assert sorted(got['keys']) == sorted(want['keys']), f'{name}: keys {sorted(set(got["keys"]) ^ set(want["keys"]))}'; checks += 1
    for key in want['keys']:
        assert got['values'][key] == want['values'][key], f'{name}: state.{key}\n  now    {got["values"][key][:700]}\n  before {want["values"][key][:700]}'
        checks += 1
    assert got['teamCourt'] == want['teamCourt'], f'{name}: setup.teamCourt {got["teamCourt"]} / {want["teamCourt"]}'; checks += 1


def strict_rows(page):
    """3: a list or row written in place throws in the browser tests (the store runs strict there)."""
    global checks
    page.evaluate("() => KSMTest.app.setAwards([{award: 'A', name: 'n', dojo: ''}])")
    page.evaluate("() => { KSMTest.addGrandChampion(['Open', 'Wom'], {name: 'Strict'}); }")
    for write in ("KSMTest.app.state.awards = []", "KSMTest.app.state.awards.push({})", "KSMTest.app.state.awards[0].name = 'x'",
                  "KSMTest.app.state.grandChampions = []", "KSMTest.app.state.grandChampions[0].name = 'x'",
                  "KSMTest.app.state.grandChampions[0].order = 5"):
        # Strict-mode code, as every app module is (sloppy code would fail silently on a frozen row).
        threw = page.evaluate(f"() => {{ 'use strict'; try {{ {write}; return false; }} catch (e) {{ return e instanceof TypeError; }} }}")
        assert threw, f'{write} did not throw'; checks += 1


def one_rename_action(page):
    """A division rename is one tournament/divisionRenamed: the sources and the players move together (a fresh page: a drawn division cannot be renamed)."""
    global checks
    load_app(page)
    got = page.evaluate(r"""() => {
      const a = KSMTest.app, store = window.KSMStore;
      const seen = [];
      const off = store.subscribe(() => { const t = store.getState().tournament; seen.push([(t.grandChampions || []).map(g => g.sources.join('+')).join('|'), t.divisions.join('|')]); });
      a.setDivisionLists({divisions: ['Open', 'Wom', 'Masters'], divisionTypes: {Open: 'Single Elimination', Wom: 'Single Elimination', Masters: 'Single Elimination'}, divisionCourts: {Open: 'A', Wom: 'B', Masters: 'A'}});
      KSMTest.addGrandChampion(['Open', 'Wom'], {name: 'Renamed'});
      a.setPeople({competitors: [{name: 'P', dojo: '', division: 'Wom', seed: '', status: 'Registered'}]});
      seen.length = 0;
      const error = a.ksmRenameSetupDivision('Wom', 'Women');
      off();
      return {error, seen, gc: KSMTest.grandChampions().map(g => g.sources), players: a.state.competitors.map(c => c.division)};
    }""")
    assert got['error'] is None, got; checks += 1
    assert got['gc'] == [['Open', 'Women']] and got['players'] == ['Women'], got; checks += 1
    # Every notification already shows the rename in the grand champion's sources and the divisions together.
    assert all(('Women' in s[0]) == ('Women' in s[1].split('|')) for s in got['seen']) and got['seen'], got; checks += 1


def no_empty_history_patches(page):
    """A court action's history entry has no patch for a store key that is undefined (grandChampions, hiddenPresets, …)."""
    global checks
    load_app(page)
    paths = page.evaluate("""() => { KSMTest.configure([{name: 'Open', format: 'Single Elimination', court: 'A', entrants: [{name: 'A1', dojo: 'D', seed: '', status: 'Checked'}, {name: 'B1', dojo: 'D', seed: '', status: 'Checked'}]}]);
      const had = KSMTest.app.state.grandChampions !== undefined || KSMTest.app.state.hiddenPresets !== undefined;
      KSMTest.prepareCourt('A'); KSMTest.play([['W', 'M']]);
      return [had, KSMTest.app.state.courtActionHistory.A.flatMap(e => e.patches.filter(p => p.path.length === 1).map(p => p.path[0]))]; }""")
    assert paths[0] is False, paths; checks += 1
    assert not set(paths[1]) & {'grandChampions', 'hiddenPresets', 'divisionRenames', 'teamDivisions'}, paths; checks += 1


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
            if run:
                run(page)
            seen[name] = shrink(page.evaluate(SNAPSHOT))
            assert not errors, f'{name}: {errors}'
            if not DUMP and name == 'Wom played, grand champion drawn':
                assert page.evaluate("() => KSMTest.grandChampions().map(g => (KSMTest.app.state.allMatches[g.id] || []).length)") == [1], 'the grand champion was not drawn'; checks += 1
            if not DUMP:
                compare(name, seen[name], expected[name])
        if DUMP:
            sys.stderr.write('drawn: %s\n' % page.evaluate("() => KSMTest.grandChampions().map(g => (KSMTest.app.state.allMatches[g.id] || []).length)"))
            print(json.dumps(seen, indent=1, ensure_ascii=False))
        else:
            assert list(seen) == list(expected), 'the same steps as recorded'; checks += 1
            strict_rows(page)
            one_rename_action(browser.new_page())
            no_empty_history_patches(browser.new_page())
            assert not errors, errors
        browser.close()
    if not DUMP:
        print(f'PASS awards store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
