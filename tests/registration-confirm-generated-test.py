"""Ask before No Show after generation and before x removes an entry of a generated division (owner decision 18, #29).

Before: after generation, setting a player (or team) to No Show took them out of the division's
pools (bracket) at once, and x removed an entry of a generated division, both without a question.
Now each asks first; Cancel changes nothing, OK does what it did. Before generation nothing asks.

Offline: a round robin of 4 and a 3-person team round robin of 3, generated with the test API;
Registration through the UI.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def people(n):
    return [{'name': f'P {i}', 'dojo': f'Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(1, n + 1)]


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people(4)},
                       {'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 3, 'court': 'B'}])
        pool_players = lambda: [x['name'] for pool in app.payload()['state']['pools']['Open'] for x in pool['players']]
        competitors = lambda: [(c['name'], c['status']) for c in app.payload()['state']['competitors']]
        app.nav('registration')
        app.click('reg-tab-individual')
        status = lambda i: page.locator(sel('reg-row')).nth(i).locator(sel('reg-status'))

        # P 1 is Checked In: one click is No Show. Cancel keeps P 1 in the pool.
        app.expect_dialog('Mark P 1 as No Show?', accept=False)
        status(0).click()
        assert len(app.wait_for_dialogs(1)) == 1
        assert competitors()[0] == ('P 1', 'Checked') and 'P 1' in pool_players(), 'Cancel changed P 1'
        app.expect_dialog('Mark P 1 as No Show?', accept=True)
        status(0).click()
        app.wait_for_dialogs(2)
        app.wait_for(lambda: competitors()[0] == ('P 1', 'NoShow') and 'P 1' not in pool_players(), message='OK: P 1 No Show, out of the pool')

        # x on P 2 (in the generated pool): Cancel keeps it, OK removes it.
        app.expect_dialog('Remove P 2?', accept=False)
        page.locator(sel('reg-row')).nth(1).locator(sel('reg-remove')).click()
        app.wait_for_dialogs(3)
        assert [n for n, _ in competitors()] == ['P 1', 'P 2', 'P 3', 'P 4'], 'Cancel removed P 2'
        app.expect_dialog('Remove P 2?', accept=True)
        page.locator(sel('reg-row')).nth(1).locator(sel('reg-remove')).click()
        app.wait_for_dialogs(4)
        app.wait_for(lambda: [n for n, _ in competitors()] == ['P 1', 'P 3', 'P 4'], message='OK removed P 2')

        # Teams: No Show of Team A (Cancel, then OK), x on Team B (Cancel).
        app.click('reg-tab-team')
        team_status = lambda: page.locator(sel('team-card')).first.locator(sel('team-status'))
        app.expect_dialog('Mark Team A as No Show?', accept=False)
        team_status().click()
        app.wait_for_dialogs(5)
        assert app.payload()['state']['teams'][0]['status'] == 'Checked'
        app.expect_dialog('Mark Team A as No Show?', accept=True)
        team_status().click()
        app.wait_for_dialogs(6)
        app.wait_for(lambda: app.payload()['state']['teams'][0]['status'] == 'NoShow', message='Team A No Show')
        app.expect_dialog('Remove Team B?', accept=False)
        page.locator(sel('team-card')).nth(1).locator(sel('team-remove')).click()
        app.wait_for_dialogs(7)
        assert [t['team'] for t in app.payload()['state']['teams']] == ['Team A', 'Team B', 'Team C'], 'Cancel removed Team B'

        # Before generation (a new row, not in any division): x asks nothing.
        app.click('reg-tab-individual')
        app.click('reg-add-row')
        page.locator(sel('reg-row')).last.locator(sel('reg-remove')).click()
        app.wait_for(lambda: len(competitors()) == 3, message='the empty row removed without a question')
        assert len(app.seen_dialogs) == 7, app.seen_dialogs
        assert not problems, problems
        browser.close()
    print('PASS No Show after generation and x on an entry of a generated division ask first (Cancel keeps it)')


if __name__ == '__main__':
    main()
