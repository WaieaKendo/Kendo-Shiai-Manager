"""The tournament status card follows every registration change (quirk pass).

+ Add Row, + 5 Rows, Load Sample Players, Clear Registration, a paste, and on Team Registration
and Exhibition + Add Team, Load Sample Teams, Clear Teams, a team or exhibition edit redrew the table or
cards but not the status card, so it could say "Ready to Generate" with the wrong counts while
the registration had issues. renderReg(), renderTeams() and renderExhibitions() now refresh it.

Offline, through the UI: after each of those actions the card (verdict and counts) equals what
validateTournament() and the registration say at that moment.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def card(page):
    return page.inner_text(sel('tournament-status'))


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.setup_team_event()
        app.register('Kana', 'Aiea', "Women’s Open")
        app.register('Mei', 'Hilo', "Women’s Open")
        assert 'Ready to Generate' in card(page) and '2 competitors' in card(page), card(page)

        app.click('reg-add-row')  # a row without a name: a validation issue
        assert 'Needs Attention' in card(page), f'+ Add Row: the card is stale: {card(page)!r}'
        app.click('reg-load-samples')
        assert 'Ready to Generate' in card(page) and '11 competitors' in card(page), f'Load Sample Players: {card(page)!r}'
        app.expect_dialog('Clear all individual', accept=True)
        app.click('reg-clear')
        app.wait_for_dialogs(1)
        assert '0 competitors' in card(page), f'Clear Registration: {card(page)!r}'

        app.click('reg-tab-team')
        app.click('team-load-samples')
        assert '1 division' in card(page) and '0 competitors' in card(page), f'Load Sample Teams: {card(page)!r}'
        app.expect_dialog('Clear all teams', accept=True)
        app.click('team-clear')
        app.wait_for_dialogs(2)
        assert '0 divisions' in card(page), f'Clear Teams: {card(page)!r}'
        assert not problems, problems
        browser.close()
    print('PASS registration status card: refreshed by + Add Row, samples, Clear and team changes')


if __name__ == '__main__':
    main()
