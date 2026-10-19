"""Delete a tournament from the app (issue #26, step 2), against a throwaway `wrangler dev`.

A staff device deletes its tournament from Developer Tools:
  * only staff are offered it (a spectator has no Delete tournament);
  * the dialog says it cannot be undone, shows the devices connected right now (live), offers a
    backup download, and keeps Delete disabled until the tournament's name is typed exactly
    (spaces around it ignored, case-sensitive); Enter in the field does nothing until then;
  * a refused delete (session no longer valid) deletes nothing and says so;
  * a delete removes it from the server (410 from then on), from this device's Library, cache,
    outbox and staff session, and shows the Library with "Tournament deleted";
  * another connected device is told ("This tournament was deleted") and returns to its Library;
  * a device that was offline and reconnects later is told the same;
  * a stale staff device that saves afterwards gets the 410 once: same message, nothing queued,
    no retry, nothing recreated.
"""
import json
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

STAFF_SESSION_KEY = 'ksm.staff.session.v3_16'
LIBRARY_KEY = 'ksm.tournament.library.v3_16'


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def status_of(base, path):
    try:
        with urllib.request.urlopen(f'{base}{path}') as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as err:
        return err.code, json.load(err)


def server_library_ids(base):
    return [row['id'] for row in status_of(base, '/api/tournaments')[1]]


def local_library_ids(app):
    return app.page.evaluate("key => JSON.parse(localStorage.getItem(key) || '[]').map(x => x.id)", LIBRARY_KEY)


def devices(n):
    return f'{n} devices are connected right now, this one included.'


def relogin_staff(app):
    """Staff Login again (the dialog stays open): the device is staff with a session the server accepts."""
    # a save sent with the bad token may still be on its way to being refused (which makes the device
    # a spectator when it lands): let it land first, or the login below is undone by it
    app.page.wait_for_function(
        "() => { const r = KSMTest.pendingReason(); return !r.saveInFlight && !r.autosaveTimer && !r.cloudSaveTimer; }")
    app.page.evaluate("() => KSMTest.app.ksmSessionRole !== 'staff' ? KSMTest.app.toggleStaffSession() : null")
    app.page.wait_for_function("() => KSMTest.app.ksmSessionRole === 'staff'", timeout=10000)


def print_delete_diagnostics(app, trace):
    """On a failed wait for the Library: what the page was doing (CI logs are all there is to go on)."""
    try:
        state = app.page.evaluate("""() => ({
          body: document.body.className, role: typeof KSMTest.app.ksmSessionRole !== 'undefined' ? KSMTest.app.ksmSessionRole : null,
          staffSession: KSMTest.staffSession(), tournamentId: KSMTest.tournamentId(),
          toasts: KSMTest.toasts ? KSMTest.toasts() : null,
          dialog: document.querySelector('[data-testid="delete-dialog"]')?.innerText || null,
          confirmDisabled: document.querySelector('[data-testid="delete-confirm"]')?.disabled ?? null,
        })""")
    except Exception as err:
        state = f'(state unavailable: {err})'
    print('DELETE DIAGNOSTICS state:', state)
    print('DELETE DIAGNOSTICS trace:')
    for line in trace[-60:]:
        print('   ', line)


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)

        # ------------------------------------------------------------------ the tournaments
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Keep Cup')
        keep_id = director.create_tournament()
        director.go_to_library()
        director.answers['Tournament Name'] = 'Delete Cup'
        tid = director.create_tournament()
        assert tid != keep_id
        director.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
        director.save_now()
        director.wait_idle()
        assert sorted(local_library_ids(director)) == sorted([keep_id, tid]), local_library_ids(director)

        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        spectator.wait_generated()
        later = KsmApp.open_device(browser, base, 'Offline later', problems, app_path(tid))
        later.wait_generated()
        stale = KsmApp.open_device(browser, base, 'Stale staff', problems, app_path(tid, 'court', 'A'), clock=True,
                                   # its live connection goes nowhere: it is never told, it learns from its save
                                   before_load=lambda page: page.route_web_socket(lambda url: '/live' in url, lambda ws: None))
        stale.wait_generated()
        stale.staff_login()
        stale.open_court('A')
        stale.wait_idle()  # whatever opening the court saved is on the server before the delete
        stale_requests = []
        stale.page.on('request', lambda r: stale_requests.append(r.method) if r.method in ('PUT', 'POST') and '/api/tournaments' in r.url else None)

        # ------------------------------------------------ only staff are offered Delete tournament
        assert not spectator.can_delete_tournament(), 'a spectator is offered Delete tournament'
        spectator.page.evaluate('KSMTest.app.ksmOpenDeleteTournament()')  # even the function does nothing for a spectator
        assert spectator.page.locator(sel('delete-dialog')).count() == 0
        assert director.can_delete_tournament(), 'staff are not offered Delete tournament'

        # ------------------------------------------------ the confirmation dialog
        director.open_delete_dialog()
        assert director.delete_dialog()['required'] == 'Delete Cup', director.delete_dialog()
        warning = director.page.inner_text(sel('delete-warning'))
        assert 'cannot be undone' in warning and 'disconnected' in director.page.inner_text(sel('delete-dialog')), warning
        # director, spectator, 'Offline later' are connected (the stale device's connection goes nowhere)
        director.wait_for(lambda: director.delete_dialog()['devices'] == devices(3), message='the devices connected (3)')
        assert not director.delete_enabled(), 'Delete is enabled before anything is typed'
        for wrong in ['Delete', 'delete cup', 'DELETE CUP', 'Delete Cup 2', 'Delete  Cup', 'Keep Cup']:
            director.type_delete_name(wrong)
            assert not director.delete_enabled(), f'Delete is enabled for {wrong!r}'
        director.page.keyboard.press('Enter')  # submitting while disabled does nothing
        assert status_of(base, f'/api/tournaments/{tid}')[0] == 200
        assert director.page.locator(sel('delete-dialog')).count() == 1
        director.type_delete_name('  Delete Cup  ')
        assert director.delete_enabled(), 'the exact name (spaces around it ignored) does not enable Delete'
        director.type_delete_name('Delete Cu')
        assert not director.delete_enabled()

        # the device count follows the devices (a fourth device joins while the dialog is open)
        extra = KsmApp.open_device(browser, base, 'Extra', problems, app_path(tid))
        extra.wait_generated()
        director.wait_for(lambda: director.delete_dialog()['devices'] == devices(4), message='the devices connected (4)')
        extra.close()

        # ------------------------------------------------ the backup download
        name, path = director.download('delete-backup')
        assert name == 'Delete_Cup.ksm', name
        with open(path, encoding='utf-8') as f:
            backup = json.load(f)
        assert backup['setup']['tName'] == 'Delete Cup' and backup['tournamentId'] == tid, backup.get('tournamentId')
        assert backup['state']['divisions'] == ['Open'], backup['state']['divisions']
        assert director.page.locator(sel('delete-dialog')).count() == 1, 'the dialog closed after the backup'
        assert director.page.input_value(sel('delete-name-input')) == 'Delete Cu', 'the typed name was lost'

        # ------------------------------------------------ a refused delete deletes nothing
        trace = []
        director.page.on('console', lambda m: trace.append(f'console.{m.type}: {m.text}'))
        director.page.on('request', lambda r: trace.append(f'request {r.method} {r.url}'))
        director.page.on('response', lambda r: trace.append(f'response {r.status} {r.request.method} {r.url}'))
        try:
            director.wait_idle()  # nothing of the dialog's own is still to be saved before the session is spoiled
            good_token = director.staff_session()
            director.page.evaluate("([key]) => sessionStorage.setItem(key, 'ksmst_not-a-session')", [STAFF_SESSION_KEY])
            director.type_delete_name('Delete Cup')
            # Delete is enabled only once the dialog has drawn the typed name: wait for it, as a person would.
            director.wait_for(director.delete_enabled, message='Delete to be enabled for the typed name')
            director.click('delete-confirm')
            director.wait_for(lambda: director.delete_dialog()['error'], message='the refusal message')
            assert 'Nothing was deleted' in director.delete_dialog()['error'], director.delete_dialog()
            assert status_of(base, f'/api/tournaments/{tid}')[0] == 200, 'a refused delete removed the tournament'
            assert tid in server_library_ids(base)
            assert director.delete_enabled(), 'the dialog stayed locked after a refusal'
            # The bad token is a real 401 for any request this device sends, and a refused save makes the
            # device a spectator (F33; a background save can land at any moment on a slow runner). Delete
            # must still be retryable: log in again as a person would, instead of poking the token back.
            director.page.evaluate("([key, token]) => sessionStorage.setItem(key, token)", [STAFF_SESSION_KEY, good_token])
            relogin_staff(director)

            # a device that stopped being staff while the dialog was open: Delete says so, deletes nothing
            director.page.wait_for_function("() => !KSMTest.pendingReason().saveInFlight")  # the login's save is done
            # what a refused save does to the device (33): the session is dropped, the device is a spectator
            director.page.evaluate("([key]) => { sessionStorage.removeItem(key); KSMTest.app.setSessionRole('spectator'); }", [STAFF_SESSION_KEY])
            director.type_delete_name('Delete Cup')
            director.wait_for(director.delete_enabled, message='Delete to be enabled for the typed name')
            director.click('delete-confirm')
            director.wait_for(lambda: 'no longer logged in' in director.delete_dialog()['error'], message='the not-staff message')
            assert 'Nothing was deleted' in director.delete_dialog()['error'], director.delete_dialog()
            assert status_of(base, f'/api/tournaments/{tid}')[0] == 200 and tid in server_library_ids(base)
            relogin_staff(director)
            director.wait_for(director.delete_enabled, message='Delete to be enabled after logging in again')
        except Exception:
            print_delete_diagnostics(director, trace)
            raise

        # ------------------------------------------------ a TV is showing the tournament
        tv = KsmApp.open_device(browser, base, 'TV', problems, app_path(tid, 'tv', 'A'))
        tv.wait_for(lambda: tv.page.evaluate("document.body.classList.contains('ksm-tv')"), message='the TV in TV mode')

        # ------------------------------------------------ the offline device loses its connection
        later.page.context.set_offline(True)

        # ------------------------------------------------ delete
        director.type_delete_name('Delete Cup')
        # Enter submits only while Delete is enabled (checked above); on a slow runner wait for the
        # dialog to draw the typed name first, or the keypress is (correctly) ignored.
        director.wait_for(director.delete_enabled, message='Delete to be enabled for the typed name')
        director.page.keyboard.press('Enter')  # the keyboard works as the button does
        try:
            director.wait_for_library()
        except Exception:
            print_delete_diagnostics(director, trace)
            raise
        director.wait_toast('Tournament deleted')
        code, gone = status_of(base, f'/api/tournaments/{tid}')
        assert code == 410 and gone['code'] == 'tournament-deleted', (code, gone)
        assert tid not in server_library_ids(base) and keep_id in server_library_ids(base), server_library_ids(base)
        assert director.visible_view() == ['home'], director.visible_view()
        director.wait_for(lambda: director.library_names() == ['Keep Cup'], message='the Library without Delete Cup')
        assert local_library_ids(director) == [keep_id], local_library_ids(director)
        assert director.tournament_id() is None and director.outbox() is None and director.staff_session() == ''
        assert not director.has_autosave()
        assert director.page.locator(sel('delete-dialog')).count() == 0 and director.page.locator(sel('cloud-modal')).count() == 0
        director.reload()
        director.wait_for(lambda: director.library_names() == ['Keep Cup'], message='the Library after a reload')

        # ------------------------------------------------ a connected device is told
        # The TV leaves TV mode too (external review of #39): the Library is shown, not a stale TV screen.
        tv.wait_for_library()
        tv.wait_toast('This tournament was deleted')
        tv.wait_for(lambda: not tv.page.evaluate("document.body.classList.contains('ksm-tv')"), message='the TV to leave TV mode')
        assert tv.visible_view() == ['home'], tv.visible_view()
        assert tv.page.evaluate('location.pathname') == '/', tv.page.evaluate('location.pathname')
        spectator.wait_for_library()
        spectator.wait_toast('This tournament was deleted')
        assert spectator.visible_view() == ['home'] and spectator.tournament_id() is None
        spectator.wait_for(lambda: tid not in local_library_ids(spectator), message="the spectator's cache without it")
        assert 'Delete Cup' not in spectator.library_names()
        spectator.reload()
        spectator.wait_for(lambda: 'Delete Cup' not in spectator.library_names() and spectator.visible_view() == ['home'],
                           message='the spectator Library after a reload')

        # ------------------------------------------------ a device that was offline is told when it reconnects
        later.page.context.set_offline(False)
        later.wait_for_library(timeout=30)
        later.wait_toast('This tournament was deleted')
        assert later.tournament_id() is None and tid not in local_library_ids(later)

        # ------------------------------------------------ a stale staff device: its save meets 410 once
        stale.blur()
        stale.score_point('W', 'M')  # a change that has to be saved
        stale.page.clock.fast_forward(4_000)  # the autosave debounce
        stale.wait_for_library()
        stale.wait_toast('This tournament was deleted')
        assert stale_requests.count('PUT') == 1, f'the stale device should save once, got {stale_requests}'
        assert stale.outbox() is None, 'the refused save was queued'
        assert stale.tournament_id() is None and stale.staff_session() == ''
        # no retry however long it waits (the F35 retry stops only for authorization errors)
        sent = list(stale_requests)
        for _ in range(6):
            stale.page.clock.fast_forward(30_000)
        stale.page.wait_for_timeout(300)
        assert stale_requests == sent, f'requests after the 410: {stale_requests}'
        assert stale.outbox() is None and stale.visible_view() == ['home']
        assert status_of(base, f'/api/tournaments/{tid}')[0] == 410
        assert tid not in server_library_ids(base), 'the tournament came back in the Library'
        assert keep_id in server_library_ids(base)

        assert not problems, problems
        print(f'PASS tournament delete app ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
