"""Results: a card for every division of the event once it is generated (owner request).

Before: Results listed only divisions with matches, so a division added after the draw (and a grand
champion before it fills in, grand-champion-test.py) had no card. Offline: two divisions generated,
then a third added in Setup after the draw, with players: Results shows it under In Progress as
"Not drawn yet" (no bracket to open), in Setup's running order. The default team division, with no
teams, gets no card. Before Generate the page still says to generate.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def cards(app):
    app.nav('results')
    return app.page.evaluate("""() => [...document.querySelectorAll('#results [data-testid="result-card"]')].map(c => ({
      title: c.querySelector('[data-testid="result-card-title"]').textContent.trim(),
      message: c.querySelector('.result-progress-message')?.textContent.trim() ?? null,
      placeholder: c.classList.contains('result-placeholder-card'),
      button: !!c.querySelector('.view-bracket-link')}))""")


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.setup_divisions([('First', 'Round Robin', 'A'), ('Second', 'Round Robin', 'B')])
        app.nav('results')
        generate_text = 'Generate tournament matches to display results.'
        assert generate_text in page.inner_text('#results') and cards(app) == [], 'before Generate: the generate message, no cards'
        for i in range(3):
            app.register(f'First {i + 1}', 'Aiea', 'First')
            app.register(f'Second {i + 1}', 'Hilo', 'Second')
        app.generate()
        app.wait_generated()
        app.nav('setup')
        page.fill(sel('custom-division-name'), 'Later')
        page.select_option(sel('custom-division-format'), label='Round Robin')
        page.select_option(sel('custom-division-court'), value='A')
        app.click('custom-division-add')
        page.wait_for_function("KSMTest.app.state.divisions.includes('Later')")
        app.register('Later 1', 'Kona', 'Later')
        app.register('Later 2', 'Maui', 'Later')
        got = cards(app)
        assert [c['title'] for c in got] == ['First', 'Second', 'Later'], got
        later = got[2]
        assert later['message'] == 'Not drawn yet' and later['placeholder'] and not later['button'], later
        assert all(not c['placeholder'] and c['message'] == 'Tournament in progress' for c in got[:2]), got
        assert generate_text not in page.inner_text('#results')
        assert not problems, problems
        browser.close()
    print('PASS Results: a division added after the draw has a "Not drawn yet" card, in running order; none before Generate')


if __name__ == '__main__':
    main()
