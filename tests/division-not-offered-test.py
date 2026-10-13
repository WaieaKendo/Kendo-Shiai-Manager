"""A competitor whose division is no longer offered shows "<division> (not offered)" (owner decision 15, #29).

Before: when a competitor's division was switched off in Setup, the row's division select showed
the first division although the competitor kept the old one (only the status card and the
generation check reported it). Now the select shows an extra, selected option "<division> (not
offered)"; the competitor keeps the division until another is chosen, and then the extra option
is gone.

Offline, through Setup and Registration.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

WOMEN = 'Women’s Open'


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        app.register('Kana', 'Aiea', WOMEN)
        app.nav('setup')
        app.setup_division_row(WOMEN).locator(sel('setup-division-enabled')).click()
        app.wait_for(lambda: WOMEN not in app.payload()['state']['divisions'], message='Women’s Open switched off')

        app.nav('registration')
        app.click('reg-tab-individual')
        select = page.locator(sel('reg-row')).first.locator(sel('reg-division'))
        shown = select.evaluate('s => s.options[s.selectedIndex].textContent')
        assert shown == f'{WOMEN} (not offered)', f'the row shows {shown!r}'
        assert app.payload()['state']['competitors'][0]['division'] == WOMEN
        options = select.evaluate('s => [...s.options].map(o => o.textContent)')
        assert options.count(f'{WOMEN} (not offered)') == 1 and WOMEN not in options, options

        select.select_option(label='Yudansha 1–3 Dan')
        app.wait_for(lambda: app.payload()['state']['competitors'][0]['division'] == 'Yudansha 1–3 Dan', message='a new division chosen')
        select = page.locator(sel('reg-row')).first.locator(sel('reg-division'))
        app.wait_for(lambda: not any('not offered' in o for o in select.evaluate('s => [...s.options].map(o => o.textContent)')),
                     message='the not-offered option gone')
        assert not problems, problems
        browser.close()
    print('PASS a division no longer offered shows as "<division> (not offered)" in the row until another is chosen')


if __name__ == '__main__':
    main()
