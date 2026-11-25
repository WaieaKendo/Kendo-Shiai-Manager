"""Generate refuses with nobody registered (owner decision 2, issue #29).

Before: the generation check passed with nobody registered ("No blocking issues found. Generate
Tournament?") and Generate then showed the "No registered or checked-in competitors..." alert.
Now the check lists "No competitors registered" as an error, so Generate cannot proceed (only
Close), and the registration status card says Needs Attention. Two teams (no individuals) or two
players are enough: the error is gone.

Offline, through the UI.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def open_check(app):
    app.nav('registration')
    app.click('generate-button')
    app.page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
    text = app.page.inner_text(sel('validation-modal'))
    return text, app.page.locator(sel('generate-confirm')).count()


def close_check(app):
    for testid in ('validation-close', 'generate-cancel'):
        if app.page.locator(sel(testid)).count():
            app.click(testid)
            break
    app.page.wait_for_selector(f'{sel("validation-modal")}.hidden', state='attached')


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)

        text, can_generate = open_check(app)
        assert 'No competitors registered' in text, f'the check does not refuse an empty registration:\n{text}'
        assert can_generate == 0, 'Generate is offered with nobody registered'
        card = page.inner_text(sel('tournament-status'))
        assert 'Needs Attention' in card, f'status card with nobody registered: {card}'
        close_check(app)
        assert not app.page.evaluate('KSMTest.generated()'), 'generated with nobody registered'

        # Two teams and no individual player: the team event is enough.
        app.register_team('Aiea', {'senpo': 'A1', 'chuken': 'A2', 'taisho': 'A3'})
        app.register_team('Hilo', {'senpo': 'H1', 'chuken': 'H2', 'taisho': 'H3'})
        text, _ = open_check(app)
        assert 'No competitors registered' not in text, f'teams registered, still refused:\n{text}'
        close_check(app)

        # Two players: valid, Generate offered.
        app.click('reg-tab-team')
        app.expect_dialog('Clear all teams', accept=True)
        app.click('team-clear')
        app.register('Kana', 'Aiea', 'Women’s Open')
        app.register('Mio', 'Hilo', 'Women’s Open')
        text, can_generate = open_check(app)
        assert 'No competitors registered' not in text and can_generate == 1, f'two players:\n{text}'
        close_check(app)
        assert not problems, problems
        browser.close()
    print('PASS Generate refuses with nobody registered (the check lists "No competitors registered"); teams or players lift it')


if __name__ == '__main__':
    main()
