"""The sample loaders ask before they replace a registration (quirk pass).

Load Sample Players, Load Sample Teams and Load Sample Tournament replaced every competitor,
team (and the divisions) at once, without the confirmation Clear Registration / Clear Teams ask
for (F8); the result autosaves, so one mis-tap on a director device replaced the real
registration with sample data. Each now asks first when there is something to replace; Cancel
keeps everything, OK loads the samples as before. With nothing registered they load at once.

Offline, through the UI: one player and one team registered; each loader cancelled (nothing
changes) and then accepted (the samples).
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp
from ksm_browser import launch_chromium


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.enable_test_tools()  # owner decision 20: the sample-data buttons need the test tools on
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        names = lambda: [c['name'] for c in app.payload()['state']['competitors']]
        teams = lambda: [t['team'] for t in app.payload()['state']['teams']]

        app.nav('registration')
        app.click('reg-load-samples')  # nothing registered: no question
        assert len(names()) == 11, names()
        app.expect_dialog('Clear all individual', accept=True)
        app.click('reg-clear')
        app.register('Kana', 'Aiea', "Women’s Open")
        app.register_team('Aiea', {'senpo': 'A1', 'chuken': 'A2', 'taisho': 'A3'})

        app.click('reg-tab-individual')
        seen = 1
        for testid, prefix, kept, loaded in [
            ('reg-load-samples', 'Replace all individual competitors', lambda: names() == ['Kana'], lambda: len(names()) == 11),
            ('team-load-samples', 'Replace all teams', lambda: teams() == ['Aiea'], lambda: len(teams()) == 4),
            ('reg-load-sample-tournament', 'Replace the divisions', lambda: len(names()) == 11 and len(teams()) == 4, lambda: len(names()) == 50),
        ]:
            if testid == 'team-load-samples':
                app.click('reg-tab-team')
            if testid == 'reg-load-sample-tournament':
                app.expect_dialog('Loaded 50', accept=True)
            app.expect_dialog(prefix, accept=False)
            app.click(testid)
            seen += 1
            app.wait_for_dialogs(seen)
            assert kept(), f'{testid}: Cancel replaced the entries ({names()}, {teams()})'
            app.expect_dialog(prefix, accept=True)
            app.click(testid)
            seen += 2 if testid == 'reg-load-sample-tournament' else 1
            app.wait_for_dialogs(seen)
            assert loaded(), f'{testid}: OK did not load the samples ({len(names())}, {len(teams())})'
            if testid == 'team-load-samples':
                app.click('reg-tab-individual')
        assert [d for d in app.seen_dialogs if d.startswith('Replace')] and not problems, problems
        browser.close()
    print('PASS the sample loaders ask before replacing a registration (Cancel keeps it)')


if __name__ == '__main__':
    main()
