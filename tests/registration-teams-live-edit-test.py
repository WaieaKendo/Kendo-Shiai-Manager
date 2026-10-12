"""A live update applied while a team or exhibition field is being edited never writes the typed
text into another team or match (F20, F17 on the team cards and exhibition rows).

The team cards' and exhibition table's redraw commits the field being edited (its change event)
after the new list is in place; the fields used to name their entry by position, so the text
landed in whichever team or match the new list had at that place (or threw "Cannot set properties
of undefined" for a shorter list), and was saved and synced. Staff devices defer ordinary live
updates while a field is edited, so it takes an update that is applied anyway (a 409 rebase, the
cloud copy loaded, Staff Login with queued work): applied here through the test API.

Offline, Registration -> Team Registration with teams typed in through the UI, then Exhibition
with matches; a field is typed without leaving it, then a live update is applied that
  * reorders the list and inserts an entry before the one being edited: the text goes to the same
    team / match (found in the new list by every field as shown), in the field and in state, and
    nothing else changes;
  * also changed that entry on the other device, or removed it (also a shorter list): the text
    goes nowhere, a notice says the edit was not saved, no page error;
  * leaves the list as it was: the edit is kept, as without an update.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

TEAMS = [('Aiea A', {'senpo': 'A1', 'chuken': 'A2', 'taisho': 'A3'}), ('Hilo B', {'senpo': 'B1', 'chuken': 'B2', 'taisho': 'B3'}),
         ('Maui C', {'senpo': 'C1', 'chuken': 'C2', 'taisho': 'C3'})]
MATCHES = [('Ann', 'Bo'), ('Cy', 'Dee'), ('Eve', 'Fay')]


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        for team, members in TEAMS:
            app.register_team(team, members)
        state = lambda key: app.payload()['state'][key]
        teams = lambda: [(t['team'], t['taisho']) for t in state('teams')]
        toast = lambda: page.locator(sel('toast')).inner_text() if page.locator(sel('toast')).count() else ''
        clear_toast = lambda: page.evaluate("() => { const t = document.querySelector('[data-testid=\"toast\"]'); if (t) t.textContent = ''; }")
        card_of = lambda team: page.locator(sel('team-card')).filter(has=page.locator(f'{sel("team-name")}[value="{team}"]'))

        def type_without_leaving(locator, text):
            locator.focus()
            page.keyboard.press('ControlOrMeta+a')
            page.keyboard.type(text)

        def live_update(key, change):
            payload = app.payload()
            payload['state'][key] = change(payload['state'][key])
            app.apply_live_update(payload)
            page.wait_for_timeout(100)

        new_team = {'team': 'Kona D', 'division': 'Team Tournament', 'type': '3-Person Team', 'senpo': 'D1', 'jiho': '', 'chuken': 'D2',
                    'fukusho': '', 'taisho': 'D3', 'status': 'Checked'}

        # 1. Teams reordered, one inserted before: Hilo B keeps the typed taisho.
        type_without_leaving(card_of('Hilo B').locator(sel('team-member-taisho')), 'B3 typed')
        live_update('teams', lambda ts: [new_team] + ts[::-1])
        expected = [('Kona D', 'D3'), ('Maui C', 'C3'), ('Hilo B', 'B3 typed'), ('Aiea A', 'A3')]
        assert teams() == expected, f'the typed member went to the wrong team (F20): {teams()}'
        assert card_of('Hilo B').locator(sel('team-member-taisho')).input_value() == 'B3 typed', 'the card does not show the kept edit'
        assert not toast(), toast()

        # 2. A team name typed, the list reordered again: the renamed team is still found.
        type_without_leaving(card_of('Maui C').locator(sel('team-name')), 'Maui C2')
        live_update('teams', lambda ts: ts[::-1])
        assert [t for t, _ in teams()] == ['Aiea A', 'Hilo B', 'Maui C2', 'Kona D'], f'the typed name went to the wrong team (F20): {teams()}'

        # 3. The other device changed the same team: not saved, with a notice.
        type_without_leaving(card_of('Aiea A').locator(sel('team-member-senpo')), 'A1 typed')

        def changed_remotely(ts):
            ts = ts[::-1]
            next(t for t in ts if t['team'] == 'Aiea A')['status'] = 'NoShow'
            return ts
        live_update('teams', changed_remotely)
        assert 'A1 typed' not in [t['senpo'] for t in state('teams')], f'an edit of a team changed elsewhere was written (F20): {state("teams")}'
        assert 'not saved' in toast() and 'Aiea A' in toast(), f'no notice that the edit was not saved: {toast()!r}'

        # 4. The team was removed and the list is shorter: not saved, with a notice, no page error.
        clear_toast()
        type_without_leaving(page.locator(sel('team-member-taisho')).last, 'Last typed')
        last = state('teams')[-1]['team']
        live_update('teams', lambda ts: ts[:1])
        assert 'Last typed' not in [t['taisho'] for t in state('teams')], f'an edit of a removed team was written (F20): {state("teams")}'
        assert 'not saved' in toast() and last in toast(), f'no notice that the edit was not saved: {toast()!r}'

        # 5. The same list again: the edit is kept.
        clear_toast()
        type_without_leaving(page.locator(sel('team-member-chuken')).first, 'Kept')
        live_update('teams', lambda ts: ts)
        assert state('teams')[0]['chuken'] == 'Kept', state('teams')
        assert not toast(), toast()
        page.evaluate('() => document.activeElement && document.activeElement.blur()')

        # Exhibition: the same rules for a match.
        app.click('reg-tab-exhibition')
        app.click('exhibition-add-3')
        rows = page.locator(sel('exhibition-row'))
        for i, (white, red) in enumerate(MATCHES):
            rows.nth(i).locator(sel('exhibition-white')).fill(white)
            rows.nth(i).locator(sel('exhibition-white')).press('Tab')
            rows.nth(i).locator(sel('exhibition-red')).fill(red)
            rows.nth(i).locator(sel('exhibition-red')).press('Tab')
        matches = lambda: [(x['white'], x['red']) for x in state('exhibitions')]
        assert matches() == MATCHES, matches()
        new_match = {'white': 'Gus', 'red': 'Hal', 'division': 'Exhibition Matches', 'status': 'Registered'}

        # 6. Reordered, one inserted before: Cy vs Dee keeps the typed red player.
        clear_toast()
        type_without_leaving(rows.nth(1).locator(sel('exhibition-red')), 'Dee typed')
        live_update('exhibitions', lambda xs: [new_match] + xs[::-1])
        assert matches() == [('Gus', 'Hal'), ('Eve', 'Fay'), ('Cy', 'Dee typed'), ('Ann', 'Bo')], f'the typed player went to the wrong match (F20): {matches()}'
        assert rows.nth(2).locator(sel('exhibition-red')).input_value() == 'Dee typed', 'the table does not show the kept edit'
        assert not toast(), toast()

        # 7. A shorter list without that match: not saved, with a notice, no page error (it threw).
        type_without_leaving(rows.nth(3).locator(sel('exhibition-white')), 'Ann typed')
        live_update('exhibitions', lambda xs: xs[:1])
        assert matches() == [('Gus', 'Hal')], f'an edit of a removed match was written (F20): {matches()}'
        assert 'not saved' in toast() and 'Ann vs Bo' in toast(), f'no notice that the edit was not saved: {toast()!r}'
        assert not problems, problems
        browser.close()
    print('PASS registration teams live edit: a team or exhibition field edited during an applied live update stays with its entry or is dropped with a notice (F20)')


if __name__ == '__main__':
    main()
