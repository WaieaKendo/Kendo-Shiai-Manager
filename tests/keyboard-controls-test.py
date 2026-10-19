"""Controls that act as buttons work from the keyboard (quirk pass).

The status chips (Registration: a player's, a team's and an exhibition match's status) and the
header's status row (opens Developer Tools) were clickable spans/divs: the chips had no tab stop
and no keyboard at all, the status row had role="button" and a tab stop but Enter and Space did
nothing. Each now has role="button" and a tab stop, and Enter or Space presses it (the same
click, so the same handlers and autosave run).

Offline, through the UI: each chip can take the focus, Enter and Space cycle it (Registered ->
Checked In -> No Show) like clicks, in state too; the status row opens Developer Tools on Enter
and on Space.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def focusable(page, locator):
    locator.evaluate('el => el.focus()')
    return locator.evaluate('el => document.activeElement === el')


def press_chip(page, row_testid, chip_testid, key):
    chip = page.locator(sel(row_testid)).last.locator(sel(chip_testid))
    assert chip.get_attribute('role') == 'button', f'{chip_testid}: role {chip.get_attribute("role")!r}'
    assert focusable(page, chip), f'{chip_testid} takes no focus (no tab stop)'
    page.keyboard.press(key)
    return page.locator(sel(row_testid)).last.locator(sel(chip_testid)).inner_text()


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        page.select_option(sel('exhibition-enabled'), label='Enabled')

        app.register('Kana', 'Aiea', "Women’s Open", status='Registered')
        assert press_chip(page, 'reg-row', 'reg-status', 'Enter') == '● Checked In'
        assert app.payload()['state']['competitors'][-1]['status'] == 'Checked'
        assert press_chip(page, 'reg-row', 'reg-status', ' ') == '● No Show'
        assert app.payload()['state']['competitors'][-1]['status'] == 'NoShow'

        app.register_team('Aiea', {'senpo': 'A1', 'chuken': 'A2', 'taisho': 'A3'}, status='Registered')
        assert press_chip(page, 'team-card', 'team-status', 'Enter') == '● Checked In'
        assert press_chip(page, 'team-card', 'team-status', ' ') == '● No Show'
        assert app.payload()['state']['teams'][-1]['status'] == 'NoShow'

        app.click('reg-tab-exhibition')
        app.click('exhibition-add')
        before = page.locator(sel('exhibition-row')).last.locator(sel('exhibition-status')).inner_text()
        assert press_chip(page, 'exhibition-row', 'exhibition-status', 'Enter') != before
        assert app.payload()['state']['exhibitions'][-1]['status'] == 'Checked'

        status_row = page.locator(sel('connection-status'))
        for key in ('Enter', ' '):
            assert focusable(page, status_row), 'the status row takes no focus'
            page.keyboard.press(key)
            page.wait_for_selector(sel('cloud-modal'))
            assert 'Developer Tools' in page.inner_text(sel('cloud-modal')), f'{key!r} on the status row did not open Developer Tools'
            app.click('cloud-modal-close')
            page.wait_for_selector(sel('cloud-modal'), state='detached')
        assert not problems, problems
        browser.close()
    print('PASS keyboard controls: status chips and the status row work with Enter and Space')


if __name__ == '__main__':
    main()
