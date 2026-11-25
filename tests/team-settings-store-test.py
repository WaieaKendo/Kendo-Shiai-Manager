"""The team award mode and the team court read the Setup (#15 PR 8b, docs/STORE.md section 3 item 8).

`state.teamAwardMode` is a getter over `settings.teamAwardMode`, and `divisionCourts['Team Tournament']` follows
`settings.teamCourt` through one helper (ksmSetTeamCourt()). Checked (one offline page):

  1. Loads keep the saved format: for each payload (the 4.0 fixture, a 4.0-shaped save with only the top-level copies,
     one with only the Setup copies, a team division list without the 'Team Tournament' one, the team event disabled, a
     'Team Tournament' division whose values differ from both copies), each loaded after a tournament with other values,
     the four saved values (`setup.teamAwardMode`, `setup.teamCourt`, `state.teamAwardMode`,
     `state.divisionCourts['Team Tournament']`) are the ones the code before PR 8b saved (EXPECTED below, recorded by
     running this file with `--dump` on next/4.1 at 146c555; one difference, noted there), and each Setup field
     agrees with its copy.
  2. Save conflicts (the three-way merge of a rebase, mergeLocalEditsThreeWay(), then the load of its result): one device
     changes the award mode while the other changes the court, both change the award mode, both change the court; with
     and without the 'Team Tournament' team division. The winner is the one before PR 8b (server on the same field), and
     each Setup field and its copy agree after the load.
  3. The app's writers: a team division's award mode / court (ksmUpdateTeamDivision), the legacy Setup selects, the
     removal of the 'Team Tournament' division, a stray `state.teamAwardMode = …` (throws: the browser tests run strict).
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

TT = 'Team Tournament'
DUMP = '--dump' in sys.argv
checks = 0

FIXTURE = json.loads((Path(__file__).parent / 'store/fixtures/setup-4.0-save.json').read_text())

# What the code before PR 8b saved after each load and its render (setup.teamAwardMode, setup.teamCourt,
# state.teamAwardMode, state.divisionCourts['Team Tournament']), recorded with `--dump` on next/4.1 (146c555). One
# difference, 'no copies at all' (an empty Setup team court, no 'Team Tournament' team division): the old load's first
# save had '' in divisionCourts while the Setup field showed 'Both' (they agreed only after the next render); now both
# are 'Both' at once.
EXPECTED = {
    'the 4.0 fixture': ['dual3', 'B', 'dual3', 'B'],
    '4.0 shape: top-level copies only': ['dual3', 'A', 'dual3', 'A'],
    'Setup copies only': ['top1', 'B', 'top1', 'B'],
    'team divisions without Team Tournament': ['dual3', 'A', 'dual3', 'A'],
    'no copies at all': ['top2', 'Both', 'top2', 'Both'],
    'team event disabled': ['top1', 'B', 'top1', 'B'],
    'Team Tournament division wins': ['top1', 'A', 'top1', 'A'],
}

READ = r"""() => {
  const p = KSMTest.app.tournamentPayload();
  return [p.setup.teamAwardMode ?? null, p.setup.teamCourt ?? null, p.state.teamAwardMode ?? null, p.state.divisionCourts?.['Team Tournament'] ?? null];
}"""
LOAD = r"""p => { KSMTest.app.applyTournamentPayload(p, false, {source: 'team settings test'}); }"""


def payloads(page):
    """The loads of check 1, built from the 4.0 fixture and from this page's own payload."""
    own = page.evaluate('() => KSMTest.app.tournamentPayload()')

    def variant(setup_over=None, setup_drop=(), state_over=None, state_drop=()):
        p = json.loads(json.dumps(own))
        p['state'].pop('teamDivisions', None)
        for k in setup_drop:
            p['setup'].pop(k, None)
        for k in state_drop:
            p['state'].pop(k, None)
        p['setup'].update(setup_over or {})
        p['state'].update(state_over or {})
        return p

    custom = [{'id': 'team:custom', 'name': 'Juniors', 'teamFormat': '3-Person Team', 'teamTournamentFormat': 'Single Elimination',
               'court': 'A', 'awardMode': 'top2', 'order': 0}]
    courts = lambda **c: {k: v for k, v in {'Women’s Open': 'B', **c}.items()}
    return [
        # The fixture's state holds only the fields that test needs: over a full one.
        ('the 4.0 fixture', {**FIXTURE, 'state': {**variant()['state'], **FIXTURE['state']}}),
        ('4.0 shape: top-level copies only', variant(setup_drop=('teamAwardMode', 'teamCourt'),
                                                     state_over={'teamAwardMode': 'dual3', 'divisionCourts': courts(**{TT: 'A'})})),
        ('Setup copies only', variant(setup_over={'teamAwardMode': 'top1', 'teamCourt': 'B'}, state_drop=('teamAwardMode',),
                                      state_over={'divisionCourts': courts()})),
        ('team divisions without Team Tournament', variant(setup_over={'teamAwardMode': 'dual3', 'teamCourt': 'A'},
                                                           state_over={'teamAwardMode': 'top1', 'teamDivisions': custom,
                                                                       'divisionCourts': courts(**{TT: 'B', 'team:custom': 'A'})})),
        ('no copies at all', variant(setup_over={'teamAwardMode': '', 'teamCourt': ''}, state_drop=('teamAwardMode',),
                                     state_over={'teamDivisions': custom, 'divisionCourts': courts(**{'team:custom': 'A'})})),
        ('team event disabled', variant(setup_over={'teamEnabled': 'Disabled', 'teamAwardMode': 'top1', 'teamCourt': 'B'},
                                        state_over={'teamAwardMode': 'dual3', 'divisionCourts': courts(**{TT: 'A'})})),
        ('Team Tournament division wins', variant(setup_over={'teamAwardMode': 'dual3', 'teamCourt': 'B'},
                                                  state_over={'teamAwardMode': 'dual3', 'divisionCourts': courts(**{TT: 'B'}),
                                                              'teamDivisions': [{**custom[0], 'id': TT, 'name': TT, 'awardMode': 'top1', 'court': 'A'}]})),
    ]


# A tournament with other values, loaded before each case (a value kept from the previous tournament would show).
NOISE = r"""() => {
  const p = KSMTest.app.tournamentPayload();
  p.setup = {...p.setup, teamAwardMode: 'top1', teamCourt: 'A'};
  p.state.teamAwardMode = 'top1';
  p.state.divisionCourts = {...p.state.divisionCourts, 'Team Tournament': 'A'};
  p.state.teamDivisions = (p.state.teamDivisions || []).map(d => d.id === 'Team Tournament' ? {...d, awardMode: 'top1', court: 'A'} : d);
  KSMTest.app.applyTournamentPayload(p, false, {source: 'team settings test'});
}"""


def agree(page, name):
    """Each Setup field and its copy on this device (the live state, not a payload)."""
    global checks
    got = page.evaluate("""() => ({award: [KSMTest.app.ksmSetting('teamAwardMode'), KSMTest.app.state.teamAwardMode],
      court: [KSMTest.app.ksmSetting('teamCourt'), KSMTest.app.state.divisionCourts['Team Tournament']]})""")
    assert got['award'][0] == got['award'][1], f'{name}: award mode {got}'; checks += 1
    if got['court'][1] is not None:
        assert got['court'][0] == got['court'][1], f'{name}: team court {got}'; checks += 1
    return got


def loads(page):
    global checks
    seen = {}
    for name, payload in payloads(page):
        page.evaluate(NOISE)
        page.evaluate(LOAD, payload)
        seen[name] = page.evaluate(READ)
        # A second save of the same tournament (after another render) keeps them too.
        page.evaluate('() => KSMTest.app.renderAll()')
        if DUMP:
            seen[name] = [seen[name], page.evaluate(READ)]
            continue
        assert page.evaluate(READ) == seen[name], f'{name}: changed after a render'; checks += 1
        if not DUMP:
            assert seen[name] == EXPECTED[name], f'{name}: saved {seen[name]}, before PR 8b {EXPECTED[name]}'; checks += 1
            agree(page, name)
    return seen


# Payload copies as each device saves them after its edit: the Setup field, its top-level copy and, when there is one,
# the 'Team Tournament' team division's record.
EDIT = r"""([p, award, court]) => {
  p = JSON.parse(JSON.stringify(p));
  const d = (p.state.teamDivisions || []).find(x => x.id === 'Team Tournament');
  if (award) { p.setup.teamAwardMode = award; p.state.teamAwardMode = award; if (d) d.awardMode = award; }
  if (court) { p.setup.teamCourt = court; p.state.divisionCourts['Team Tournament'] = court; if (d) d.court = court; }
  return p;
}"""
MERGE = r"""([server, local, base]) => {
  const rebased = JSON.parse(JSON.stringify(server));
  const conflicts = KSMTest.app.mergeLocalEditsThreeWay(rebased, local, base);
  KSMTest.app.applyTournamentPayload(rebased, false, {source: 'team settings test'});
  return conflicts;
}"""


def conflicts(page):
    global checks
    seen = {}
    for with_tt in (True, False):
        page.evaluate(NOISE)
        base = page.evaluate('() => KSMTest.app.tournamentPayload()')
        if not with_tt:
            base['state']['teamDivisions'] = [{'id': 'team:custom', 'name': 'Juniors', 'teamFormat': '3-Person Team',
                                              'teamTournamentFormat': 'Single Elimination', 'court': 'B', 'awardMode': 'top2', 'order': 0}]
            base['state']['divisionCourts']['team:custom'] = 'B'
            page.evaluate(LOAD, base)
            base = page.evaluate('() => KSMTest.app.tournamentPayload()')
        assert any(d['id'] == TT for d in base['state']['teamDivisions']) == with_tt; checks += 1
        cases = [
            ('award here, court there', ('dual3', None), (None, 'B'), ['dual3', 'B']),
            ('both change the award mode', ('dual3', None), ('top2', None), ['top2', 'A']),
            ('both change the court', (None, 'B'), (None, 'Both'), ['top1', 'Both']),
        ]
        for name, mine, theirs, want in cases:
            label = f"{name} ({'with' if with_tt else 'without'} the Team Tournament division)"
            local = page.evaluate(EDIT, [base, *mine])
            server = page.evaluate(EDIT, [base, *theirs])
            page.evaluate(LOAD, base)
            page.evaluate(MERGE, [server, local, base])
            got = page.evaluate(READ)
            seen[label] = got
            if not DUMP:
                assert got == [want[0], want[1], want[0], want[1]], f'{label}: saved {got}, want {want}'; checks += 1
                agree(page, label)
    return seen


def writers(page):
    global checks
    # A tournament whose team divisions are migrated from the Setup: the 'Team Tournament' one.
    page.evaluate("() => { const p = KSMTest.app.tournamentPayload(); delete p.state.teamDivisions; p.state.teams = []; KSMTest.app.applyTournamentPayload(p, false, {source: 'team settings test'}); }")
    page.evaluate(NOISE)
    assert any(d['id'] == TT for d in page.evaluate('() => KSMTest.teamDivisions()')); checks += 1
    page.evaluate("() => KSMTest.updateTeamDivision('Team Tournament', {awardMode: 'dual3'})")
    assert agree(page, 'team division award mode')['award'] == ['dual3', 'dual3']
    page.evaluate("() => KSMTest.updateTeamDivision('Team Tournament', {court: 'B'})")
    assert agree(page, 'team division court')['court'] == ['B', 'B']
    # The legacy Setup selects: the 'Team Tournament' division's own values win, as before (saveSetup() syncs from it).
    page.evaluate("() => KSMTest.show('setup')")
    for sel_id, value in (('teamAwardMode', 'top1'), ('teamCourt', 'A')):
        page.evaluate("([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', {bubbles: true})); }", [sel_id, value])
    assert agree(page, 'legacy Setup selects') == {'award': ['dual3', 'dual3'], 'court': ['B', 'B']}; checks += 1
    # Without that division the legacy selects are the value.
    assert page.evaluate("() => KSMTest.removeTeamDivision('Team Tournament')"); checks += 1
    # Its divisionCourts entry stays the Setup's team court (before PR 8b it was deleted, and the next render's saveSetup() wrote it back).
    assert agree(page, 'Team Tournament division removed')['court'] == ['B', 'B']; checks += 1
    for sel_id, value in (('teamAwardMode', 'top1'), ('teamCourt', 'A')):
        page.evaluate("([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', {bubbles: true})); }", [sel_id, value])
    assert agree(page, 'legacy Setup selects, no Team Tournament division') == {'award': ['top1', 'top1'], 'court': ['A', 'A']}; checks += 1
    # A stray write: the browser tests run strict, so it throws (production logs and applies it: tests/store/team-settings.test.mjs).
    err = page.evaluate("() => { try { KSMTest.app.state.teamAwardMode = 'dual3'; return null; } catch (e) { return String(e.message); } }")
    assert err and 'tournament.settings.teamAwardMode' in err, err; checks += 1
    assert page.evaluate("() => KSMTest.app.ksmSetting('teamAwardMode')") == 'top1'; checks += 1


def main():
    started = time.time()
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: d.accept())
        load_app(page)
        page.evaluate('() => KSMTest.teamDivisions()')
        seen = {'loads': loads(page), 'conflicts': conflicts(page)}
        if DUMP:
            print(json.dumps(seen, indent=1))
        else:
            writers(page)
        assert not errors, errors
        browser.close()
    print(f'PASS team settings store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
