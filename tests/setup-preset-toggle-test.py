"""A preset division switched off and on again keeps its format and court (quirk pass).

Switching a preset division off leaves its format and court in state, but switching it on again
reset both to the preset's, so a division set to Single Elimination on Court B (or split) went
back to its preset silently, and was generated that way. toggleDivision() now keeps what the
division had; a preset switched on for the first time still gets the preset's.

Offline, Setup's divisions table through the UI: the first preset set to Single Elimination,
Court B; Use off and on: the row and state keep Single Elimination / B. A custom division
behaves as before (added with the form's format and court).
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
        row = lambda: page.locator(sel('setup-division-row')).first
        name = row().locator(sel('setup-division-name')).inner_text().strip()
        assert row().locator(sel('setup-division-enabled')).is_checked(), f'{name} starts switched on'
        row().locator(sel('setup-division-format')).select_option(label='Single Elimination')
        row().locator(sel('setup-division-court')).select_option(value='B')
        state = app.payload()['state']
        assert (state['divisionTypes'][name], state['divisionCourts'][name]) == ('Single Elimination', 'B'), state['divisionCourts']

        row().locator(sel('setup-division-enabled')).uncheck()
        assert name not in app.payload()['state']['divisions']
        row().locator(sel('setup-division-enabled')).check()
        state = app.payload()['state']
        assert name in state['divisions']
        assert (state['divisionTypes'][name], state['divisionCourts'][name]) == ('Single Elimination', 'B'), \
            f'{name} switched on again: {state["divisionTypes"][name]} / {state["divisionCourts"][name]} (the preset\'s, the choice was lost)'
        assert row().locator(sel('setup-division-format')).input_value() == 'Single Elimination'
        assert row().locator(sel('setup-division-court')).input_value() == 'B'
        assert not problems, problems
        browser.close()
    print('PASS a preset division switched off and on keeps its format and court')


if __name__ == '__main__':
    main()
