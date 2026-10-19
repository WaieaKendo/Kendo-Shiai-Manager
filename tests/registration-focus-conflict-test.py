"""A Registration field being edited while a save conflict or another desk's update is applied
(test audit, issue #59, rank 3).

Two staff devices (the director and a desk) against a throwaway `wrangler dev`, Registration ->
Individual Players on both. registration-live-edit-test.py checks the field logic offline with
injected updates (F17); this follows the real triggers end to end, with the typed text still in the
focused field (not yet committed by a blur):

  1. The desk's own save is held, the director removes a player and saves first, the desk then
     types into another player's Dojo field and its held save is released: it meets the conflict
     (409) and is rebased while the field is being edited.
  2. The director types into a Dojo field and does not leave it; the desk removes a player and
     saves: the update reaches the director while the field is being edited (staff devices hold
     it until the field is left), then the director leaves the field.

The typed text must end up with the player it was typed for, on both screens and on the server,
and never with another player.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel, app_path
from ksm_browser import launch_chromium
from ksm_races import Races, people, state_of
from ksm_server import local_worker

DIV = 'Open'


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Focus Cup')
        tid = director.create_tournament()
        director.configure([{'name': DIV, 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 5)}])
        director.save_now()
        director.wait_idle()
        desk = KsmApp.open_device(browser, base, 'Desk', problems, app_path(tid))
        desk.wait_generated()
        desk.staff_login()
        for app in (director, desk):
            app.nav('registration')
            app.click('reg-tab-individual')
        races = Races(base, tid, [director, desk])

        dojos = lambda record: {c['name']: c['dojo'] for c in state_of(record)['competitors']}
        shown = lambda app: {c['name']: c['dojo'] for c in app.payload()['state']['competitors']}

        def row_of(app, name):
            page = app.page
            return page.locator(sel('reg-row')).filter(has=page.locator(f'{sel("reg-name")}[value="{name}"]'))

        def type_without_leaving(app, name, text):
            field = row_of(app, name).locator(sel('reg-dojo'))
            field.focus()
            app.page.keyboard.press('ControlOrMeta+a')
            app.page.keyboard.type(text)

        def remove(app, name):
            app.expect_dialog(f'Remove {name}?', accept=True)  # × on a player of a generated division asks first
            row_of(app, name).locator(sel('reg-remove')).click()
            app.wait_for_dialogs(1)

        def field_values(app):
            return {row.locator(sel('reg-name')).input_value(): row.locator(sel('reg-dojo')).input_value()
                    for row in (app.page.locator(sel('reg-row')).nth(i) for i in range(app.page.locator(sel('reg-row')).count()))}

        # 1. The desk's own held save conflicts while it types into a Dojo field.
        def rename_on_desk():
            desk.nav('setup')
            desk.page.fill(sel('setup-tournament-name'), 'Desk Cup')
            desk.page.press(sel('setup-tournament-name'), 'Tab')
            desk.nav('registration')
            desk.click('reg-tab-individual')

        before = {f'P {i}': 'P Dojo' for i in range(1, 6)}
        seen = desk.conflicts()
        races.race(desk, rename_on_desk, director, lambda: remove(director, 'P 2'),
                   between=lambda: type_without_leaving(desk, 'P 4', 'Typed on Desk'), settle_after=False)
        assert desk.conflicts() > seen, '1: the desk\'s save did not meet a conflict'
        # Rebased onto the director's save while the field is still being edited: the removal is in
        # and the typed text is in P 4's field, not in the player now at P 4's old row (P 5).
        expected = {'P 1': 'P Dojo', 'P 3': 'P Dojo', 'P 4': 'Typed on Desk', 'P 5': 'P Dojo'}
        desk.wait_for(lambda: field_values(desk) == expected, message='1: the rebased table to show the removal and the typed text on P 4')
        races.settle()
        record = races.server()
        assert dojos(record) == expected, f'1: server: {dojos(record)}'
        assert record['payload']['setup']['tName'] == 'Desk Cup', '1: the desk\'s own save (the rename) was lost'
        for app in (director, desk):
            assert shown(app) == expected and field_values(app) == expected, f'1: {app.name}: {shown(app)} / {field_values(app)}'

        # 2. The director types and does not leave the field; the desk removes a player and saves.
        type_without_leaving(director, 'P 5', 'Typed on Director')
        remove(desk, 'P 1')
        desk.blur()
        races.flush_edit(desk)
        desk.wait_idle()
        # The director holds the update while its field is being edited: P 1 is still listed, the
        # typed text is still in P 5's field.
        director.wait_for(lambda: director.page.evaluate('!!(KSMTest.app.ksmDeferredSyncRecord || KSMTest.app.ksmDeferredRemoteRecord)'),
                          message='2: the update to be held while the field is edited')
        held = field_values(director)
        assert held['P 5'] == 'Typed on Director' and 'P 1' in held, f'2: the update was applied while the field was edited: {held}'
        director.blur()
        races.settle()
        record = races.server()
        assert 'P 1' not in dojos(record) and 'P 1' not in shown(director) and 'P 1' not in shown(desk), '2: the desk\'s removal was lost'
        # F29 (open): the director's edit and the desk's removal both changed the player list, so the
        # director's edit is dropped, with a notice. When F29 is fixed, the typed text is kept: it
        # must then be on P 5 (assert that and mark F29 fixed). Either way it is never on another player.
        typed = [n for n, d in dojos(record).items() if d == 'Typed on Director']
        assert typed == [], f'F29 fixed? the typed text survived the conflict, on {typed}: assert it is on P 5 and mark F29 fixed'
        notice = director.page.inner_text(sel('toast'))
        assert 'another device' in notice and 'Registration' in notice, f'2: the dropped edit is not reported: {notice!r}'
        assert dojos(record)['P 4'] == 'Typed on Desk' and dojos(record)['P 5'] == 'P Dojo', f'2: {dojos(record)}'
        for app in (director, desk):
            assert shown(app) == dojos(record), f'2: {app.name}: {shown(app)}'
        fresh = KsmApp.open_device(browser, base, 'Fresh', problems, app_path(tid))
        fresh.wait_revision(record['revision'])
        assert shown(fresh) == dojos(record), f'a fresh device: {shown(fresh)}'
        assert not problems, '\n'.join(problems)
        print(f'PASS registration field being edited: a rebase on the editing device and a held update from another desk keep the typed text '
              f'with its player (the second dropped with a notice, F29) ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
