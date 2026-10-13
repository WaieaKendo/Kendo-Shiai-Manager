"""A switched-off custom division keeps its Setup row, like a preset (owner decision 12, #29).

Before: switching a custom division off removed its row from the divisions table; it came back
only through Add Custom Division, with the form's format and court instead of its own. Now the
row stays (unchecked, its selects disabled, after the enabled divisions), switching it on again
keeps its format and court, and × still removes it (only it).

Offline, through the Setup screen.
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
        app.nav('setup')
        page.fill(sel('custom-division-name'), 'Kids')
        page.select_option(sel('custom-division-format'), label='Single Elimination')
        page.select_option(sel('custom-division-court'), value='split')
        app.click('custom-division-add')
        app.wait_for(lambda: 'Kids' in app.setup_division_names(), message='Kids added')
        before = app.setup_division_names()

        app.setup_division_row('Kids').locator(sel('setup-division-enabled')).click()  # off
        app.wait_for(lambda: 'Kids' not in app.payload()['state']['divisions'], message='Kids switched off')
        assert app.setup_division_row('Kids').count() == 1, f'the switched-off custom division left the table: {app.setup_division_names()}'
        row = app.setup_division_row('Kids')
        assert not row.locator(sel('setup-division-enabled')).is_checked()
        assert row.locator(sel('setup-division-format')).is_disabled() and row.locator(sel('setup-division-court')).is_disabled()
        assert row.locator(sel('setup-division-up')).count() == 0, 'a switched-off division has no move buttons'
        assert sorted(app.setup_division_names()) == sorted(before), app.setup_division_names()

        app.setup_division_row('Kids').locator(sel('setup-division-enabled')).click()  # on
        app.wait_for(lambda: 'Kids' in app.payload()['state']['divisions'], message='Kids switched on')
        row = app.setup_division_row('Kids')
        assert row.locator(sel('setup-division-format')).input_value() == 'Single Elimination'
        assert row.locator(sel('setup-division-court')).input_value() == 'split'

        # Off again, then x: only Kids goes (the last division in state.divisions stays).
        row.locator(sel('setup-division-enabled')).click()  # off
        app.wait_for(lambda: 'Kids' not in app.payload()['state']['divisions'], message='Kids switched off again')
        divisions = app.payload()['state']['divisions']
        app.setup_division_row('Kids').locator(sel('setup-division-remove')).click()
        app.wait_for(lambda: app.setup_division_row('Kids').count() == 0, message='x removed Kids')
        state = app.payload()['state']
        assert state['divisions'] == divisions, f'x on a switched-off division removed another one: {state["divisions"]}'
        assert 'Kids' not in state['divisionTypes'] and 'Kids' not in state['divisionCourts']
        assert not problems, problems
        browser.close()
    print('PASS a switched-off custom division keeps its Setup row (on again with its format and court; x removes only it)')


if __name__ == '__main__':
    main()
