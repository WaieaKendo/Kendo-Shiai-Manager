"""A live update applied while a registration field is being edited never writes the typed text
into another player (F17).

The players table's redraw commits the field being edited (its change event) after the new list
is in place; the field used to name its competitor by row number, so the text landed in whichever
competitor the new list had at that row, and was saved and synced. Staff devices defer ordinary
live updates while a field is edited, so it takes an update that is applied anyway (a 409 rebase,
the cloud copy loaded, Staff Login with queued work): applied here through the test API.

Offline, Registration -> Individual Players with players typed in through the UI; a dojo (or a
name) is typed without leaving the field, then a live update is applied that
  * reorders the list and inserts a player before the one being edited: the text goes to the
    same player (found in the new list by what the row showed), in the field and in state, and
    no other player changes;
  * also changed that player on the other device, or removed them: the text goes nowhere and a
    notice says the edit was not saved;
  * leaves the list as it was (the same players): the edit is kept, as without an update.
No page error or unexpected dialog may occur.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

DIV = 'Women’s Open'
PLAYERS = [('Ann Aoki', 'Aiea'), ('Bo Baba', 'Maui'), ('Cy Chiba', 'Hilo'), ('Dee Doi', 'Kona')]


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        for name, dojo in PLAYERS:
            app.register(name, dojo, DIV)
        competitors = lambda: [(c['name'], c['dojo']) for c in app.payload()['state']['competitors']]
        row_of = lambda name: page.locator(sel('reg-row')).filter(has=page.locator(f'{sel("reg-name")}[value="{name}"]'))
        toast = lambda: page.locator(sel('toast')).inner_text() if page.locator(sel('toast')).count() else ''

        def type_without_leaving(name, field, text):
            el = row_of(name).locator(sel(field))
            el.focus()
            page.keyboard.press('ControlOrMeta+a')
            page.keyboard.type(text)

        def live_update(change):
            payload = app.payload()
            payload['state']['competitors'] = change(payload['state']['competitors'])
            app.apply_live_update(payload)
            page.wait_for_timeout(100)

        def reorder_insert(cs):
            return [{'name': 'Eve Eto', 'dojo': 'Kauai', 'division': DIV, 'seed': '', 'status': 'Checked'}] + cs[::-1]

        # 1. Reordered, a player inserted before: Bo Baba keeps the typed dojo.
        type_without_leaving('Bo Baba', 'reg-dojo', 'Maui West')
        live_update(reorder_insert)
        expected = [('Eve Eto', 'Kauai'), ('Dee Doi', 'Kona'), ('Cy Chiba', 'Hilo'), ('Bo Baba', 'Maui West'), ('Ann Aoki', 'Aiea')]
        assert competitors() == expected, f'the typed dojo went to the wrong player (F17): {competitors()}'
        assert row_of('Bo Baba').locator(sel('reg-dojo')).input_value() == 'Maui West', 'the table does not show the kept edit'
        assert [page.locator(sel('reg-dojo')).nth(i).input_value() for i in range(5)] == [d for _, d in expected], 'the table and state differ'

        # 2. A name typed, the list reordered again: the renamed player is still found.
        type_without_leaving('Cy Chiba', 'reg-name', 'Cy Chiba-Ono')
        live_update(lambda cs: cs[::-1])
        expected = [('Ann Aoki', 'Aiea'), ('Bo Baba', 'Maui West'), ('Cy Chiba-Ono', 'Hilo'), ('Dee Doi', 'Kona'), ('Eve Eto', 'Kauai')]
        assert competitors() == expected, f'the typed name went to the wrong player (F17): {competitors()}'
        assert not toast(), toast()

        # 3. The other device changed the same player: the edit is not saved, with a notice.
        type_without_leaving('Dee Doi', 'reg-dojo', 'Kona Typed')

        def changed_remotely(cs):
            cs = reorder_insert(cs)[1:]
            next(c for c in cs if c['name'] == 'Dee Doi')['seed'] = '3'
            return cs
        live_update(changed_remotely)
        assert 'Kona Typed' not in [d for _, d in competitors()], f'an edit of a player changed elsewhere was written (F17): {competitors()}'
        assert ('Dee Doi', 'Kona') in competitors(), competitors()
        assert 'not saved' in toast(), f'no notice that the edit was not saved: {toast()!r}'

        # 4. The player was removed on the other device: the edit is not saved, with a notice.
        page.evaluate("() => { const t = document.querySelector('[data-testid=\"toast\"]'); if (t) t.textContent = ''; }")
        type_without_leaving('Ann Aoki', 'reg-dojo', 'Aiea Typed')
        live_update(lambda cs: [c for c in cs if c['name'] != 'Ann Aoki'])
        assert 'Aiea Typed' not in [d for _, d in competitors()], f'an edit of a removed player was written (F17): {competitors()}'
        assert 'not saved' in toast(), f'no notice that the edit was not saved: {toast()!r}'

        # 5. The same list again (nothing moved): the edit is kept, as without an update.
        page.evaluate("() => { const t = document.querySelector('[data-testid=\"toast\"]'); if (t) t.textContent = ''; }")
        before = competitors()
        type_without_leaving('Bo Baba', 'reg-dojo', 'Maui East')
        live_update(lambda cs: cs)
        assert competitors() == [(n, 'Maui East' if n == 'Bo Baba' else d) for n, d in before], competitors()
        assert not toast(), toast()
        assert not problems, problems
        browser.close()
    print('PASS registration live edit: a field edited during an applied live update stays with its player or is dropped with a notice (F17)')


if __name__ == '__main__':
    main()
