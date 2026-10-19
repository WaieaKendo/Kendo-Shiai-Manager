"""+ Add Division with an empty or spaces-only name does nothing (F13).

addDivision() fell back to an #newDiv field the page no longer has, read as a bare global, so an
empty or spaces-only name threw "newDiv is not defined" (a page error) instead of being ignored.

Offline, Setup -> Add Custom Division through the UI: + Add Division with the name empty, with
spaces only and with a tab and spaces: no page error, no division added (state, the divisions
table, the division selects), no dialog; then a real name (with spaces around it) is added once,
trimmed, with the form's format and court.
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
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.nav('setup')
        divisions = app.payload()['state']['divisions']
        rows = page.locator(sel('setup-division-row')).count()
        for name in ['', '   ', '\t  ']:
            page.fill(sel('custom-division-name'), name)
            assert page.locator(sel('custom-division-add')).is_disabled()
            # The direct legacy operation also remains safe for callers and old integrations.
            page.evaluate('addCustomDivision()')
            assert not problems, f'+ Add Division with the name {name!r} (F13): {problems}'
            assert app.payload()['state']['divisions'] == divisions, f'a division was added for {name!r}: {app.payload()["state"]["divisions"]}'
            assert page.locator(sel('setup-division-row')).count() == rows
        page.fill(sel('custom-division-name'), '  Kids Open  ')
        page.select_option(sel('custom-division-format'), label='Single Elimination')
        page.select_option(sel('custom-division-court'), value='B')
        app.click('custom-division-add')
        state = app.payload()['state']
        assert state['divisions'] == divisions + ['Kids Open'], state['divisions']
        assert state['divisionTypes']['Kids Open'] == 'Single Elimination' and state['divisionCourts']['Kids Open'] == 'B'
        assert page.locator(sel('setup-division-row')).count() == rows + 1
        assert page.input_value(sel('custom-division-name')) == ''
        assert not problems, problems
        browser.close()
    print('PASS setup add division: an empty or spaces-only name does nothing, a name is added trimmed (F13)')


if __name__ == '__main__':
    main()
