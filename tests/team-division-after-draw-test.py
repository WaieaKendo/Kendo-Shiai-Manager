"""A division added after generation is drawn on its own (owner request, after #95/#99).

Team divisions were locked as a whole once the tournament was generated, and a division added after
generation (individual or team) could not be drawn without redrawing everything: Regenerate Single
Division refused a division with no draw. Now:
  * a drawn team division is fixed (format, court, removal, its teams); an undrawn one can be added,
    changed and removed; drawn teams cannot move out of their division; new teams go to the first
    team division without a draw;
  * Regenerate Single Division lists divisions not drawn yet ("Not drawn yet") and draws one (Draw),
    for team and individual divisions; the other divisions' draws are unchanged.
"""
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_app import KsmApp, sel

people = lambda p, n: [{'name': f'{p} {i}', 'dojo': f'{p} Dojo', 'seed': '', 'status': 'Checked'} for i in range(1, n + 1)]
ROW = """id => { const row = document.querySelector(`[data-testid=team-division-row][data-division-id="${id}"]`);
  return Object.fromEntries([...row.querySelectorAll('input,select,button')].map(e => [e.dataset.testid, e.disabled])); }"""


def draw(app, division_label):
    app.page.evaluate('KSMTest.openRegenerate()')
    option = app.page.locator(sel('regenerate-option')).filter(has_text=division_label)
    assert option.locator(sel('regenerate-option-status')).inner_text() == 'Not drawn yet', option.inner_text()
    option.locator(sel('regenerate-option-radio')).check()
    app.click('regenerate-continue')
    assert app.page.inner_text(sel('regenerate-confirm')) == 'Draw'
    app.click('regenerate-confirm')
    app.page.wait_for_selector('text=successfully regenerated.')


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        a = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Late Divisions')
        a.create_tournament()
        a.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('O', 3)},
                     {'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'teams': 4, 'court': 'B'}])
        a.save_now(); a.wait_idle()
        before = a.structure()
        a.nav('setup'); a.page.wait_for_selector(sel('team-division-add'))
        assert not a.page.locator(sel('team-division-add')).is_disabled(), 'Add team division is off after generation'
        assert a.page.inner_text(sel('team-division-note')).startswith('Drawn team divisions keep their match format')
        first = a.page.evaluate('KSMTest.teamDivisions()')[0]['id']
        new = a.page.evaluate("KSMTest.addTeamDivision('Late Teams')")
        drawn_row, new_row = a.page.evaluate(ROW, first), a.page.evaluate(ROW, new)
        assert drawn_row['team-division-teamFormat'] and drawn_row['team-division-court'] and drawn_row['team-division-remove'], drawn_row
        assert not new_row['team-division-teamFormat'] and not new_row['team-division-court'] and not new_row['team-division-remove'], new_row
        assert a.page.evaluate(f"KSMTest.updateTeamDivision('{new}', {{court: 'A', teamTournamentFormat: 'Round Robin'}})") is None
        # A drawn team cannot move to the new division (it would change the draw); new teams go there.
        a.expect_dialog('Team A is in the Team Tournament draw')
        assert a.page.evaluate(f"KSMTest.assignTeamDivision(0, '{new}')") is False
        slots = {'senpo': 'L1', 'chuken': 'L2', 'taisho': 'L3', 'status': 'Checked', 'type': '3-Person Team'}
        ids = a.page.evaluate('rows => KSMTest.addTeams(rows)', [{'team': f'Late {c}', **slots} for c in 'XYZ'])
        assert ids == [new] * 3, ids
        draw(a, 'Late Teams')
        after = a.structure()
        assert new in after and len({m['teams'] for m in after[new]['matches']}) == 3, after.get(new)  # a round robin of 3 teams
        assert all(m['court'] == 'A' for m in after[new]['matches']), 'the new division plays on its own court'
        for div, s in before.items():
            assert after[div] == s, f'{div} changed when another division was drawn'
        # Both team divisions are drawn now (the reported case: Children's and Adult's both drawn, a team
        # added later). A new team lands in the first division but is in no draw, so it can move to the
        # second drawn division; Regenerate Single Division then puts it in that bracket. Drawn teams
        # still cannot move, and a division that has started takes no new teams.
        teams_in = lambda div: a.page.evaluate("d => (KSMTest.app.state.teamElimTeams?.[d]||[]).map(t => t.team).concat(((KSMTest.app.state.teamPools?.[d])||[]).flatMap(p => p.players.map(x => x.name)))", div)
        late_index = a.page.evaluate('KSMTest.app.state.teams.length')
        assert a.page.evaluate('rows => KSMTest.addTeams(rows)', [{'team': 'Walk-in', **slots}]) == [first]
        a.expect_dialog('Late Teams is already drawn')
        assert a.page.evaluate(f"KSMTest.assignTeamDivision({late_index}, '{new}')") is True
        assert a.page.evaluate(f"KSMTest.app.state.teams[{late_index}].teamDivisionId") == new
        assert 'Walk-in' not in teams_in(new)
        a.expect_dialog('Late X is in the Late Teams draw')
        late_x = a.page.evaluate("KSMTest.app.state.teams.findIndex(t => t.team === 'Late X')")
        assert a.page.evaluate(f"KSMTest.assignTeamDivision({late_x}, '{first}')") is False
        a.page.evaluate('KSMTest.openRegenerate()')
        option = a.page.locator(sel('regenerate-option')).filter(has_text='Late Teams')
        option.locator(sel('regenerate-option-radio')).check()
        a.click('regenerate-continue'); a.click('regenerate-confirm')
        a.page.wait_for_selector('text=successfully regenerated.')
        a.page.keyboard.press('Escape')
        assert sorted(set(teams_in(new))) == ['Late X', 'Late Y', 'Late Z', 'Walk-in'], teams_in(new)
        assert a.structure()[first] == after[first], 'the first team division changed'
        a.page.evaluate(f"KSMTest.app.state.allMatches['{new}'][0].done = true")
        assert a.page.evaluate('rows => KSMTest.addTeams(rows)', [{'team': 'Too Late', **slots}]) == [first]
        a.expect_dialog('Late Teams has started')
        assert a.page.evaluate(f"KSMTest.assignTeamDivision({late_index + 1}, '{new}')") is False
        a.page.evaluate(f"KSMTest.app.state.allMatches['{new}'][0].done = false")
        after = a.structure()
        # The same for an individual division added after generation.
        a.page.evaluate("KSMTest.addIndividualDivision('Late Open', 'Round Robin', 'A', %s)" % people('L', 3))
        draw(a, 'Late Open')
        final = a.structure()
        assert len(final['Late Open']['matches']) == 3 and all(final[d] == after[d] for d in after), final.keys()
        a.wait_idle()
        assert not problems, problems
        browser.close()
    print('PASS divisions added after generation: team setup per division, new teams, Draw on its own (team and individual), late team into a drawn division')


if __name__ == '__main__':
    main()
