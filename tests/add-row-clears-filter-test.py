"""+ Add Row and + Add Team clear the active filter, so the new row is visible (owner decision 14, #29).

Before: with a filter typed, + Add Row (and + Add Team) added an empty entry that the filter hid
(its empty name does not match), so the button seemed to do nothing. Now the button clears the
filter: every row shows, the new one last.

Offline, through the Registration screen.
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
        app.register('Kana', 'Aiea', 'Women’s Open')
        app.register('Mio', 'Hilo', 'Women’s Open')
        page.fill(sel('reg-filter'), 'Kana')
        app.wait_for(lambda: page.locator(sel('reg-row')).count() == 1, message='the filter shows one row')
        app.click('reg-add-row')
        app.wait_for(lambda: page.locator(sel('reg-row')).count() == 3, message='+ Add Row shows every row (the filter cleared)')
        assert page.input_value(sel('reg-filter')) == '', 'the filter still holds text'
        assert page.locator(sel('reg-row')).last.locator(sel('reg-name')).input_value() == '', 'the new row is last'

        app.register_team('Aiea', {'senpo': 'A1', 'chuken': 'A2', 'taisho': 'A3'})
        app.register_team('Hilo', {'senpo': 'H1', 'chuken': 'H2', 'taisho': 'H3'})
        team_filter = '#teamReg input[placeholder="Filter teams..."]'
        page.fill(team_filter, 'Aiea')
        app.wait_for(lambda: page.locator(sel('team-card')).count() == 1, message='the team filter shows one card')
        app.click('team-add')
        app.wait_for(lambda: page.locator(sel('team-card')).count() == 3, message='+ Add Team shows every card (the filter cleared)')
        assert page.input_value(team_filter) == ''
        assert not problems, problems
        browser.close()
    print('PASS + Add Row and + Add Team clear the filter: the new entry shows')


if __name__ == '__main__':
    main()
