"""The Results awards editor is read-only for spectators (owner decision 8, #29).

Before: a spectator's Results showed the same awards editor as staff (inputs, x, + Add Award), and
their edits changed the spectator's own copy (never saved). Now a spectator sees the awards as
text (award, recipient, dojo) with no inputs or buttons; staff keep the editor.

Offline: staff add two awards, then Staff Logout (a spectator) and Results.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        app.add_award('Fighting Spirit', 'Aki <A>', 'Aiea')
        app.add_award('Best Kote', 'Bo', '')
        assert app.awards() == [('Fighting Spirit', 'Aki <A>', 'Aiea'), ('Best Kote', 'Bo', '')], app.awards()

        app.staff_logout()
        app.nav('results')
        editor = page.locator('#results .results-awards-card')
        app.wait_for(lambda: editor.locator(sel('award-row')).count() == 2, message='the read-only awards')
        assert editor.locator('input').count() == 0, 'a spectator still gets award inputs'
        assert editor.get_by_role('button').count() == 0, 'a spectator still gets + Add Award / x'
        rows = [[c.strip() for c in r.locator('span, b').all_inner_texts()] for r in editor.locator(sel('award-row')).all()]
        assert rows == [['Fighting Spirit', 'Aki <A>', 'Aiea'], ['Best Kote', 'Bo']], rows
        assert app.payload()['state']['awards'] == [
            {'award': 'Fighting Spirit', 'name': 'Aki <A>', 'dojo': 'Aiea'}, {'award': 'Best Kote', 'name': 'Bo', 'dojo': ''}]
        assert not problems, problems
        browser.close()
    print('PASS a spectator sees the special awards read-only (no inputs, + Add Award or x); staff keep the editor')


if __name__ == '__main__':
    main()
