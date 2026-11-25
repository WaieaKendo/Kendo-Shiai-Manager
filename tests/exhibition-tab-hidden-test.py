"""The Exhibition tab is hidden while exhibitions are switched off (owner decision 19, #29).

Before: Registration always offered the Exhibition tab (its card and buttons worked), although
Setup says enabling exhibitions "adds an Exhibition tab" and generation skips them while off. Now
the tab shows only while Setup's Exhibition Matches is Enabled; switching it off while the tab is
open goes back to Individual Players.

Offline, through Setup and Registration.
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
        app.nav('registration')
        assert page.locator(sel('reg-tab-individual')).is_visible()
        assert page.locator(sel('reg-tab-exhibition')).count() == 0, 'the Exhibition tab shows while exhibitions are off'

        app.nav('setup')
        page.select_option(sel('exhibition-enabled'), label='Enabled')
        app.nav('registration')
        app.wait_for(lambda: page.locator(sel('reg-tab-exhibition')).count() == 1, message='the Exhibition tab once enabled')
        app.click('reg-tab-exhibition')
        assert app.visible_view() == ['registration'] and page.locator(sel('exhibition-add')).is_visible()

        app.nav('setup')
        page.select_option(sel('exhibition-enabled'), label='Disabled')
        app.nav('registration')
        app.wait_for(lambda: page.locator(sel('reg-tab-exhibition')).count() == 0, message='the tab hidden again')
        assert not page.locator(sel('exhibition-add')).is_visible(), 'the exhibition card stays open with its tab hidden'
        assert page.locator(sel('reg-add-row')).is_visible(), 'back to Individual Players'
        assert not problems, problems
        browser.close()
    print('PASS the Exhibition tab shows only while exhibitions are enabled in Setup')


if __name__ == '__main__':
    main()
