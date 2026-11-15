"""The division lists in the store (#15 PR 9, docs/STORE.md section 3 item 9).

`divisions`, `divisionTypes`, `divisionCourts`, `hiddenPresets` and `divisionRenames` are the `tournament` slice's;
`state` reads them through getters and every write is one tournament/division… action. No behaviour change except the
#185 review's L1. Checked (one offline page, strict store: a write the conversion missed throws):

  1. The saved snapshot is the same, value for value: after each step of a Setup session (presets off and on, Add
     division, format, court, move, rename with registered players, remove a preset and a custom division, restore the
     presets, the sample tournament, the team court's Setup select) and after each load (a 4.0-shaped save with 'Both'
     courts and no division lists' extras, a save with renames and hidden presets, a save with team divisions and a
     grand champion, a 4.0 save with an individual division named 'Team Tournament'), every key of
     `tournamentPayload().state` has the JSON the code before PR 9 saved (EXPECTED_FILE, recorded by running this file
     with `--dump` on next/4.1 at 4d63849; the rename records' and new teams' random ids are numbered). The order of the top-level keys
     may differ after a load (docs/STORE.md section 3 item 5 (3)); the order inside each value may not.
  2. The team court: `divisionCourts['Team Tournament']` equals the Setup field after every step.
  3. L1: Add division refuses 'Team Tournament' and 'Exhibition Matches' (any case) with a toast; nothing changes.
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

TT = 'Team Tournament'
DUMP = '--dump' in sys.argv
EXPECTED_FILE = Path(__file__).parent / 'store/fixtures/divisions-snapshots-before.json'
checks = 0

SNAPSHOT = r"""() => {
  const p = KSMTest.app.tournamentPayload(), st = p.state;
  if (Array.isArray(st.divisionRenames)) st.divisionRenames = st.divisionRenames.map((r, i) => ({...r, id: `rename ${i}`}));
  // New team ids are random too (crypto): numbered in the order they first appear, keys taken in sorted order.
  const ids = new Map(), number = text => text.replace(/team:[0-9a-f]{32}/g, id => { if (!ids.has(id)) ids.set(id, `team #${ids.size}`); return ids.get(id); });
  const values = {};
  for (const k of Object.keys(st).sort()) values[k] = number(JSON.stringify(st[k]) ?? 'undefined');
  return {teamCourt: p.setup.teamCourt, keys: Object.keys(st), values};
}"""

# A seeded Math.random for the sample tournament (its players are drawn at random).
SEED = r"""() => { let a = 7; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""

YONENBU = 'Yonenbu (11 years and under)'
WOMEN = 'Women’s Open'


def add_custom(page, name, fmt='Single Elimination', court='split'):
    page.fill('#customDivName', name)
    page.select_option('#customDivFormat', fmt)
    page.select_option('#customDivCourt', court)
    page.evaluate('() => KSMTest.app.addCustomDivision()')


def load(state_over=None, setup_over=None, drop=()):
    """A load of this page's own payload with some fields changed (a 4.0 device saves every field)."""
    return r"""([over, setup, drop]) => {
      const p = KSMTest.app.tournamentPayload();
      for (const k of drop) delete p.state[k];
      Object.assign(p.state, over); Object.assign(p.setup, setup);
      KSMTest.app.applyTournamentPayload(p, false, {source: 'divisions store test'});
    }""", [state_over or {}, setup_over or {}, list(drop)]


def steps():
    team = {'id': 'team:fixed', 'name': 'Juniors', 'teamFormat': '3-Person Team', 'teamTournamentFormat': 'Single Elimination',
            'court': 'A', 'awardMode': 'top2', 'order': 1}
    legacy = {**team, 'id': TT, 'name': TT, 'court': 'B', 'order': 0}
    gc = {'id': 'gc:fixed', 'name': 'Grand Champion', 'sources': [YONENBU, WOMEN], 'format': 'Single Elimination', 'court': 'B',
          'awardMode': 'top2', 'order': 0}
    return [
        ('opened', None),
        ('preset off', lambda pg: pg.evaluate(f'() => KSMTest.app.toggleDivision({json.dumps(WOMEN)}, false)')),
        ('preset on again', lambda pg: pg.evaluate(f'() => KSMTest.app.toggleDivision({json.dumps(WOMEN)}, true)')),
        ('add division', lambda pg: add_custom(pg, 'Kids')),
        ('add it again', lambda pg: add_custom(pg, 'Kids', 'Round Robin', 'A')),
        ('format', lambda pg: pg.evaluate("() => KSMTest.app.setDivisionFormat('Kids', 'Round Robin')")),
        ('court', lambda pg: pg.evaluate("() => KSMTest.app.setDivisionCourtNow('Kids', 'B')")),
        ('move up', lambda pg: pg.evaluate("() => KSMTest.app.ksmMoveSetupDivision('Kids', 'up')")),
        ('move first up (nothing)', lambda pg: pg.evaluate(f"() => KSMTest.app.ksmMoveSetupDivision({json.dumps(YONENBU)}, 'up')")),
        ('players registered', lambda pg: pg.evaluate("""() => { KSMTest.app.setPeople({competitors: [...KSMTest.app.state.competitors,
            {name: 'K 1', dojo: 'D', division: 'Kids', seed: '', status: 'Registered'},
            {name: 'Y 1', dojo: 'D', division: 'Yonenbu (11 years and under)', seed: '', status: 'Registered'}]}); }""")),
        ('rename custom', lambda pg: pg.evaluate("() => KSMTest.app.ksmRenameSetupDivision('Kids', 'Under 12')")),
        ('rename preset', lambda pg: pg.evaluate(f"() => KSMTest.app.ksmRenameSetupDivision({json.dumps(YONENBU)}, 'Youth')")),
        ('rename refused (team event)', lambda pg: pg.evaluate("() => KSMTest.app.ksmRenameSetupDivision('Under 12', 'team tournament')")),
        ('remove preset', lambda pg: pg.evaluate(f"() => KSMTest.app.ksmRemoveSetupDivision({json.dumps(WOMEN)})")),
        ('remove renamed preset', lambda pg: pg.evaluate("() => KSMTest.app.ksmRemoveSetupDivision('Youth')")),
        ('restore presets', lambda pg: pg.evaluate('() => KSMTest.app.ksmRestoreStandardDivisions()')),
        ('remove custom (players stay)', lambda pg: pg.evaluate("() => KSMTest.app.ksmRemoveSetupDivision('Under 12')")),
        # The legacy select is in a collapsed card: its change event, as a pick fires it (the capture listener, then saveSetup()).
        ('team court select', lambda pg: pg.evaluate("""() => { const el = document.getElementById('teamCourt'); el.value = 'A';
            el.dispatchEvent(new Event('change', {bubbles: true})); KSMTest.app.renderAll(); }""")),
        ('sample tournament', lambda pg: (pg.evaluate(SEED), pg.evaluate('() => KSMTest.app.loadFullTournament()'))),
        ('load: 4.0 shape, Both courts', lambda pg: pg.evaluate(*load(
            {'divisions': ['Open', 'Kids'], 'divisionTypes': {'Open': 'Round Robin', 'Kids': 'Single Elimination', TT: 'Team'},
             'divisionCourts': {'Open': 'Both', TT: 'Both', 'Kids': 'A'}}, {'teamCourt': 'Both'},
            drop=('teamDivisions', 'hiddenPresets', 'divisionRenames', 'grandChampions')))),
        ('load: renames and hidden presets', lambda pg: pg.evaluate(*load(
            {'divisions': ['Under 12', WOMEN], 'divisionTypes': {'Under 12': 'Round Robin', WOMEN: 'Round Robin'},
             'divisionCourts': {'Under 12': 'split', WOMEN: 'B', TT: 'B'}, 'hiddenPresets': [YONENBU],
             'divisionRenames': [{'id': 'c1:a', 'from': 'Kids', 'to': 'Under 12'}]}, {'teamCourt': 'B'}))),
        ('load: team divisions and a grand champion', lambda pg: pg.evaluate(*load(
            {'divisions': [YONENBU, WOMEN], 'divisionTypes': {YONENBU: 'Round Robin', WOMEN: 'Round Robin'},
             'divisionCourts': {YONENBU: 'A', WOMEN: 'Both', TT: 'A', 'team:fixed': 'B', 'gc:fixed': 'A'},
             'teamDivisions': [legacy, team], 'grandChampions': [gc]}, {'teamCourt': 'A'}))),
        ('load: no divisionCourts at all', lambda pg: pg.evaluate(*load({}, {'teamCourt': 'B'}, drop=('divisionCourts',)))),
        ('load: an individual "Team Tournament" division (4.0)', lambda pg: pg.evaluate(*load(
            {'divisions': ['Open', TT], 'divisionTypes': {'Open': 'Round Robin', TT: 'Round Robin'},
             'divisionCourts': {'Open': 'A', TT: 'A'}}, {'teamCourt': 'B'}, drop=('teamDivisions',)))),
        ('its court changed', lambda pg: pg.evaluate(f"() => KSMTest.app.setDivisionCourtNow({json.dumps(TT)}, 'B')")),
        ('a team division court', lambda pg: pg.evaluate("() => KSMTest.updateTeamDivision('Team Tournament', {court: 'A'})")),
    ]


def team_court_agrees(page, name):
    global checks
    got = page.evaluate("() => [KSMTest.app.ksmSetting('teamCourt'), KSMTest.app.state.divisionCourts?.['Team Tournament']]")
    assert got[0] == got[1], f'{name}: the team court {got}'; checks += 1


def compare(name, got, want):
    global checks
    assert sorted(got['keys']) == sorted(want['keys']), f'{name}: keys {sorted(set(got["keys"]) ^ set(want["keys"]))}'; checks += 1
    for key in want['keys']:
        assert got['values'][key] == want['values'][key], f'{name}: state.{key}\n  now    {got["values"][key][:400]}\n  before {want["values"][key][:400]}'
        checks += 1
    assert got['teamCourt'] == want['teamCourt'], f'{name}: setup.teamCourt {got["teamCourt"]} / {want["teamCourt"]}'; checks += 1


def l1(page):
    """Add division refuses the team event's and the exhibitions' names; nothing changes, a toast says why."""
    global checks
    # A fresh state without any "Team Tournament" division (the earlier steps loaded one, which would make "nothing was
    # added" pass on old code too).
    page.evaluate(*load({'divisions': ['Open'], 'divisionTypes': {'Open': 'Round Robin'}, 'divisionCourts': {'Open': 'A'}},
                        {'teamCourt': 'B'}, drop=('teamDivisions',)))
    before = page.evaluate(SNAPSHOT)
    assert page.evaluate('() => KSMTest.app.state.divisions') == ['Open']; checks += 1
    for name in ('Team Tournament', 'team tournament', 'Exhibition Matches'):
        add_custom(page, name, 'Round Robin', 'A')
        assert page.evaluate(SNAPSHOT) == before, f'{name} was added'; checks += 1
        assert page.evaluate('() => KSMTest.app.state.divisions') == ['Open'], f'{name} was added'; checks += 1
        assert page.input_value('#customDivName') == name, 'the field keeps the text'; checks += 1
        toasts = page.evaluate('() => KSMTest.toasts()')
        assert any('is reserved for' in t and 'choose another name' in t for t in toasts[-1:]), toasts; checks += 1
    team_court_agrees(page, 'L1')


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
        page.evaluate('() => KSMTest.teamDivisions()')
        expected = None if DUMP else json.loads(EXPECTED_FILE.read_text())
        seen = {}
        for name, run in steps():
            if run:
                run(page)
            seen[name] = page.evaluate(SNAPSHOT)
            if not DUMP:
                compare(name, seen[name], expected[name])
                team_court_agrees(page, name)
        if DUMP:
            print(json.dumps(seen, indent=1, ensure_ascii=False))
        else:
            assert list(seen) == list(expected), 'the same steps as recorded'; checks += 1
            l1(page)
        assert not errors, errors
        browser.close()
    if not DUMP:
        print(f'PASS divisions store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
