"""A division added after generation is drawn on its own (owner request, after #95/#99).

Team divisions were locked as a whole once the tournament was generated, and a division added after
generation (individual or team) could not be drawn without redrawing everything: Regenerate Single
Division refused a division with no draw. Now:
  * a drawn team division is fixed (format, court, removal, its teams); an undrawn one can be added,
    changed and removed; teams cannot move into or out of a drawn division; new teams go to the first
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
        assert a.page.inner_text(sel('team-division-note')).startswith('Drawn team divisions are fixed')
        first = a.page.evaluate('KSMTest.teamDivisions()')[0]['id']
        new = a.page.evaluate("KSMTest.addTeamDivision('Late Teams')")
        drawn_row, new_row = a.page.evaluate(ROW, first), a.page.evaluate(ROW, new)
        assert drawn_row['team-division-teamFormat'] and drawn_row['team-division-court'] and drawn_row['team-division-remove'], drawn_row
        assert not new_row['team-division-teamFormat'] and not new_row['team-division-court'] and not new_row['team-division-remove'], new_row
        assert a.page.evaluate(f"KSMTest.updateTeamDivision('{new}', {{court: 'A', teamTournamentFormat: 'Round Robin'}})") is None
        # A drawn team cannot move to the new division (it would change the draw); new teams go there.
        a.expect_dialog('Team Tournament is drawn')
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
        # The same for an individual division added after generation.
        a.page.evaluate("KSMTest.addIndividualDivision('Late Open', 'Round Robin', 'A', %s)" % people('L', 3))
        draw(a, 'Late Open')
        final = a.structure()
        assert len(final['Late Open']['matches']) == 3 and all(final[d] == after[d] for d in after), final.keys()
        a.wait_idle()
        assert not problems, problems
        browser.close()
    print('PASS divisions added after generation: team setup per division, new teams, Draw on its own (team and individual)')


if __name__ == '__main__':
    main()
