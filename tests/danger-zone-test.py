"""#129 part 2: Setup's Danger zone, the Registration toolbar after the draw, Clear and Replace say what is lost.

  * Setup -> Advanced ends with a Danger zone: Regenerate Tournament and Delete tournament for staff,
    neither for a spectator; Regenerate is off until the tournament is drawn;
  * after Generate the Registration toolbar has no Generate / Regenerate Tournament button, and
    Regenerate Single Division stays;
  * Regenerate Tournament from the Danger zone with results still shows the typed warning (#137);
  * Clear Registration / Teams / Exhibitions state how many entries go; after the draw they also say
    drawn divisions keep their matches and results (and they do: nothing in a drawn division changes);
  * Load Tournament File -> Replace shows the finished matches of the open tournament and of the file.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

people = lambda p, n: [{'name': f'{p} {i}', 'dojo': f'{p} Dojo', 'seed': '', 'status': 'Checked'} for i in range(1, n + 1)]
finished = lambda matches: sum(bool(m.get('done')) for ms in matches.values() for m in ms)


def visible(app, testid):
    return app.page.locator(sel(testid)).is_visible()


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)

        # ---- before the draw: Generate Tournament in the toolbar, Regenerate off, Clear states its count
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        local = KsmApp.local(page, 'Local', problems=problems)
        local.answers['Create Staff password'] = ''
        local.nav('registration')
        assert visible(local, 'generate-button') and visible(local, 'regenerate-division-button')
        page.evaluate("() => { const a = KSMTest.app; a.state.competitors = ['A', 'B', 'C'].map(n => ({ name: n, dojo: 'D', division: a.state.divisions[0], seed: '', status: 'Registered' })); a.renderReg(); }")
        count = page.locator(sel('reg-row')).count()
        assert count == 3, count
        local.expect_dialog('Clear ', accept=False)
        local.seen_dialogs.clear()
        local.click('reg-clear')
        seen = local.wait_for_dialogs()
        assert seen == [f'Clear all {count} individual competitors? This cannot be undone.'], seen
        local.nav('setup')
        local.page.locator('#setup-tournament-actions details').evaluate('el => { el.open = true }')
        assert page.locator(sel('setup-regenerate-tournament')).is_disabled()
        assert 'once the tournament has been generated' in page.inner_text(sel('setup-danger-reason'))
        assert page.locator(sel('setup-delete-tournament')).is_disabled(), 'a local tournament is not in the cloud'
        page.close()

        # ---- a cloud tournament with a draw, teams, exhibitions and results
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Danger Cup')
        tid = director.create_tournament()
        director.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('O', 4)},
                            {'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'teams': 4, 'court': 'B'}])
        director.wait_generated()
        page = director.page
        director.page.evaluate("() => { KSMTest.prepareCourt('A'); KSMTest.play([['W','M'],['W','M']]); }")
        director.save_now()
        director.wait_idle()
        open_count = finished(director.payload()['state']['allMatches'])
        assert open_count > 0

        # The Registration toolbar: no Generate / Regenerate Tournament, Regenerate Single Division stays.
        director.nav('registration')
        assert page.locator(sel('regenerate-division-button')).is_visible()
        assert page.locator(sel('generate-button')).count() == 0, 'Generate / Regenerate Tournament is still in the toolbar'
        assert 'Regenerate Tournament' not in page.inner_text('#registration')

        # The Danger zone: staff see both.
        director.nav('setup')
        director.page.locator('#setup-tournament-actions details').evaluate('el => { el.open = true }')
        zone = page.locator(sel('setup-danger-zone'))
        assert zone.is_visible() and zone.locator('h3').text_content() == 'Danger zone'
        assert 'typed confirmation' in zone.inner_text()
        regen, delete = page.locator(sel('setup-regenerate-tournament')), page.locator(sel('setup-delete-tournament'))
        assert regen.is_visible() and regen.is_enabled() and delete.is_visible() and delete.is_enabled()
        assert 'danger' in regen.get_attribute('class') and 'danger' in delete.get_attribute('class')
        assert not page.locator(sel('setup-danger-reason')).is_visible()
        assert zone.evaluate('el => el.parentElement.lastElementChild === el'), 'the Danger zone is not the last group of Advanced'

        # Regenerate from the Danger zone, with results: the validation check, then the typed warning.
        before = director.payload()['state']['allMatches']
        director.click('setup-regenerate-tournament')
        page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
        director.click('generate-confirm')
        warning = page.locator(sel('regenerate-warning'))
        warning.wait_for()
        assert f"{open_count} finished {'match' if open_count == 1 else 'matches'}" in warning.inner_text()
        assert page.locator(sel('regenerate-warning-confirm')).is_disabled()
        director.click('regenerate-warning-cancel')
        assert director.payload()['state']['allMatches'] == before

        # Delete tournament: the existing dialog (and it stays in Cloud Diagnostics too).
        director.click('setup-delete-tournament')
        page.wait_for_selector(sel('delete-dialog'))
        director.click('delete-cancel')
        assert director.can_delete_tournament(), 'Delete tournament left Cloud Diagnostics'

        # A spectator sees neither.
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        spectator.wait_generated()
        spectator.show_screen('setup')
        spectator.page.locator('#setup-tournament-actions details').evaluate('el => { el.open = true }')
        assert not visible(spectator, 'setup-regenerate-tournament') and not visible(spectator, 'setup-delete-tournament')
        assert not visible(spectator, 'setup-danger-zone')

        # ---- Load Tournament File -> Replace: both finished-match counts
        saved, path = director.download_tournament_file()
        assert finished(saved['state']['allMatches']) == open_count
        director.page.evaluate("() => { KSMTest.play([['W','M']]); }")
        director.save_now()
        director.wait_idle()
        now = finished(director.payload()['state']['allMatches'])
        director.load_tournament_file(path)
        page.wait_for_selector(sel('file-load-replace'))
        word = lambda n: f"{n} finished {'match' if n == 1 else 'matches'}"
        message = page.inner_text(sel('file-load-message'))
        assert f'The open tournament has {word(now)}; the file has {open_count}.' in message, message
        director.click('file-load-cancel')

        # ---- Clear after the draw: the count, the note, and nothing drawn changes
        director.wait_idle()
        director.nav('registration')
        snapshot = lambda: page.evaluate("() => { const s = KSMTest.app.state; return JSON.stringify([s.allMatches, s.pools]); }")
        results = lambda: (director.show_screen('results'), page.wait_for_timeout(300), page.inner_text('#results'))[2]
        drawn, results_before = snapshot(), results()
        director.nav('registration')
        page.evaluate("() => { const s = KSMTest.app.state; s.exhibitions = [{white: 'X', red: 'Y', division: 'Exhibition Matches', status: 'Registered'}]; KSMTest.app.renderExhibitions(); }")
        teams = page.evaluate('KSMTest.app.state.teams.length')
        counts = {'reg-clear': f'Clear all 4 individual competitors? This cannot be undone.',
                  'team-clear': f'Clear all {teams} teams? This cannot be undone.',
                  'exhibition-clear': 'Clear the 1 exhibition match? This cannot be undone.'}
        note = 'Drawn divisions keep their matches and results.'
        for button, question in counts.items():
            director.expect_dialog('Clear ', accept=True)
            director.seen_dialogs.clear()
            page.evaluate(f'() => document.querySelector(\'{sel(button)}\').click()')
            seen = director.wait_for_dialogs()
            assert len(seen) == 1 and seen[0].startswith(question) and note in seen[0], seen
        assert page.evaluate('() => [KSMTest.app.state.competitors.length, KSMTest.app.state.teams.length, KSMTest.app.state.exhibitions.length]') == [0, 0, 0]
        assert snapshot() == drawn, 'Clear changed a drawn division'
        assert results() == results_before, 'Clear changed Results'
        director.show_screen('score')
        page.wait_for_timeout(300)
        assert 'O 1' in page.inner_text('#score') or 'O 3' in page.inner_text('#score')
        assert not problems, problems
        browser.close()
    print('PASS danger zone, toolbar after the draw, Clear counts, Replace counts')


if __name__ == '__main__':
    main()
