"""The players filter finds a status as it is shown (quirk pass).

The filter matched the stored status word only: "checked" and "registered" found players, but
"no show" and "checked in", the texts on the chips, found nobody ("NoShow"). It now matches the
shown text as well.

Offline, through the UI: three players (Registered, Checked In, No Show); the filter finds each
by the chip's text, any case, and still by the stored word.
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
        app.register('Ann', 'Aiea', "Women’s Open", status='Registered')
        app.register('Bea', 'Hilo', "Women’s Open", status='Checked')
        app.register('Cat', 'Kona', "Women’s Open", status='NoShow')

        def shown(text):
            page.fill(sel('reg-filter'), text)
            return [page.locator(sel('reg-row')).nth(i).locator(sel('reg-name')).input_value()
                    for i in range(page.locator(sel('reg-row')).count())]

        assert shown('No Show') == ['Cat'], shown('No Show')
        assert shown('no show') == ['Cat']
        assert shown('Checked In') == ['Bea'], shown('Checked In')
        assert shown('noshow') == ['Cat'], 'the stored word still matches'
        assert shown('registered') == ['Ann'], shown('registered')
        assert shown('') == ['Ann', 'Bea', 'Cat']
        assert not problems, problems
        browser.close()
    print('PASS registration filter: a status is found by the text its chip shows')


if __name__ == '__main__':
    main()
