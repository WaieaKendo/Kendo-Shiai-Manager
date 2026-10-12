"""Saving on a scorekeeper device: statuses, offline queue, Save Now, recovery file, diagnostics.

One staff device (with Playwright's clock, so minutes can pass) against a
throwaway `wrangler dev`:
  * a point is saved to the cloud after the 2 s + 1.2 s debounce, not at once;
  * save status wording: "✓ Saved just now", "✓ Saved 1 min ago", offline
    "Saved locally · 1 change waiting"; connection "🟢 Online" / "🟠 Offline";
  * scoring offline queues the change and it reaches the cloud when back online;
  * Save Now saves at once ("✓ Tournament saved"); offline it says "Saved locally · Waiting to sync";
  * the 10-minute safety autosave saves to the cloud without any action;
  * a rejected save is shown in Cloud Diagnostics (stage, HTTP status, server response)
    and "Retry queued save" sends it;
  * Cloud Diagnostics shows pinned court, snapshot and action-history analysis;
  * the Recovery file downloads the device's latest snapshot, and loading it on a
    fresh device restores that snapshot into a new cloud tournament;
  * the court a device chose comes back after a reload (F3, fixed): a plain tournament link
    and a Court B link both return on Court B; an explicit /court/a in the link wins over
    the stored choice; a TV link keeps its own court whatever the device chose for scoring.
"""
import json
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        app = KsmApp.open_device(browser, base, 'Court B', problems, tournament_name='Saving Cup', clock=True)
        page = app.page
        tid = app.create_tournament()
        app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'B', 'entrants': people('P', 4)}])
        app.save_now()
        app.wait_idle()
        app.open_court('B')
        app.wait_idle()

        status = lambda: page.inner_text(sel('save-status')).strip()
        connection = lambda: page.inner_text(sel('connection-status')).strip()
        toast = lambda: page.inner_text(sel('toast')).strip() if page.locator(sel('toast')).count() else ''
        server = lambda: fetch_record(base, tid)

        # --- Debounced save and wording ---------------------------------------------------------
        app.wait_for(lambda: status() == '✓ Saved just now' and connection() == '🟢 Online', message='saved/online status')
        rev = server()['revision']
        clicked = time.time()
        with page.expect_request(lambda r: r.method == 'PUT', timeout=10000):
            app.score_point('W', 'M')
        delay = time.time() - clicked
        assert 2.5 < delay < 6, f'save should follow the 2 s + 1.2 s debounce, came after {delay:.1f}s'
        app.wait_idle()
        assert server()['revision'] == rev + 1
        page.clock.fast_forward(61_000)
        app.wait_for(lambda: status() == '✓ Saved 1 min ago', message=f'"1 min ago" status (shows {status()!r})')

        # --- 10-minute safety autosave ----------------------------------------------------------
        rev = server()['revision']
        page.clock.fast_forward(600_000)
        app.wait_for(lambda: server()['revision'] > rev, message='the 10-minute safety autosave')
        app.wait_idle()

        # --- Offline scoring, then back online -------------------------------------------------
        page.context.set_offline(True)
        app.wait_for(lambda: connection() == '🟠 Offline', message='offline status')
        app.score_point('R', 'K')
        app.wait_for(lambda: status() == 'Saved locally · 1 change waiting', message=f'offline save status (shows {status()!r})')
        app.click('nav-save-load')
        app.click('nav-save-now')
        app.wait_for(lambda: toast() == 'Saved locally · Waiting to sync', message=f'offline Save Now toast (shows {toast()!r})')
        rev = server()['revision']
        page.context.set_offline(False)
        app.wait_for(lambda: server()['revision'] > rev, message='the offline change to reach the cloud')
        app.wait_idle()
        first = [m for m in server()['payload']['state']['allMatches']['Open'] if m.get('wp') or m.get('rp')]
        assert len(first) == 1 and (first[0]['wp'], first[0]['rp']) == (['M'], ['K']), first
        app.wait_for(lambda: connection() == '🟢 Online', message='online again')

        # --- Save Now -----------------------------------------------------------------------------
        rev = server()['revision']
        app.click('nav-save-load')
        app.click('nav-save-now')
        app.wait_for(lambda: toast() == '✓ Tournament saved', message=f'Save Now toast (shows {toast()!r})')
        assert server()['revision'] == rev + 1, 'Save Now did not save'

        # --- Rejected save in Cloud Diagnostics, then Retry queued save --------------------------
        reject = lambda route: route.fulfill(status=500, content_type='application/json', body='{"error":"Disk on fire"}') \
            if route.request.method == 'PUT' else route.continue_()
        page.route('**/api/tournaments/**', reject)
        app.score_point('W', 'D')
        app.wait_for(app.outbox, message='the rejected save to be queued')
        page.unroute('**/api/tournaments/**', reject)
        app.click('save-status')  # the status area opens Cloud Diagnostics
        page.wait_for_selector(sel('cloud-modal'))
        text = page.inner_text(sel('cloud-modal'))
        assert page.inner_text(sel('cloud-modal-title')).strip() == 'Developer Tools', text[:200]
        for needle in ('Cloud save rejected', '500', 'Disk on fire', 'Pending offline changes\n1 queued snapshot',
                       'Pinned court\nB', 'Snapshot Analysis', 'State breakdown', 'Largest nested paths', 'Action History Analysis',
                       'Download snapshot analysis', 'Download action history sample'):
            assert needle.lower() in text.lower(), f'Cloud Diagnostics lacks {needle!r}:\n{text[:1500]}'
        rev = server()['revision']
        app.click('diagnostics-retry')
        app.wait_for(lambda: not app.outbox() and server()['revision'] > rev, message='the retried save')
        page.wait_for_selector(sel('cloud-modal'))
        text = page.inner_text(sel('cloud-modal'))
        assert 'Save completed' in text and 'Pending offline changes\nNone' in text, text[:1500]
        app.click('cloud-modal-close')
        app.wait_idle()
        assert [m['wp'] for m in server()['payload']['state']['allMatches']['Open'] if m.get('wp')] == [['M', 'D']]

        # --- Recovery file: download, then load on a fresh device ----------------------------------
        page.context.set_offline(True)
        app.score_point('R', 'T')
        app.click('nav-save-load')
        with page.expect_download() as dl:
            app.click('nav-download-recovery')
        pack = json.loads(open(dl.value.path()).read())
        page.context.set_offline(False)
        assert pack['fileType'] == 'KSM_RECOVERY' and pack['tournamentId'] == tid and pack['assignedCourt'] == 'B', \
            {k: pack.get(k) for k in ('fileType', 'tournamentId', 'assignedCourt')}
        assert pack['outbox'] and pack['latestLocalSnapshot']['state']['allMatches']['Open'], 'recovery file without the offline change'
        recovered = [m for m in pack['latestLocalSnapshot']['state']['allMatches']['Open'] if m.get('rp') == ['K', 'T']]
        assert recovered, 'recovery file lacks the latest local point'
        dl.value.save_as(str(dl.value.path()) + '.ksm')

        fresh = KsmApp.open_device(browser, base, 'Replacement device', problems, password='new-pass')
        fresh.create_tournament()  # a replacement device needs a staff session to see the menu
        # That tournament is open, so loading the recovery file asks first (F7) and leaves it unchanged.
        fresh.expect_dialog('Load this recovery file as a new tournament?', accept=True)
        fresh.click('nav-save-load')
        fresh.click('nav-load-recovery')
        fresh.page.set_input_files(sel('recovery-file-input'), str(dl.value.path()) + '.ksm')
        fresh.wait_for(lambda: fresh.page.inner_text(sel('save-status')).strip() == 'Recovery file loaded', message='the recovery file to load')
        fresh.save_now()
        fresh.wait_idle()
        new_tid = fresh.tournament_id()
        assert new_tid and new_tid != tid, f'recovery should create a new cloud tournament, got {new_tid}'
        copy = fetch_record(base, new_tid)['payload']['state']['allMatches']['Open']
        assert [m for m in copy if m.get('rp') == ['K', 'T']], 'the recovered snapshot did not reach the cloud'
        fresh.open_court('B')
        assert ''.join(fresh.court_screen()['red_points'].split()) == 'KT', fresh.court_screen()
        fresh.close()

        # --- Court restored after reload ----------------------------------------------------------
        keeper = KsmApp.open_device(browser, base, 'Court B keeper', problems, app_path(tid))
        keeper.wait_generated()
        keeper.staff_login()
        keeper.open_court('B')
        keeper.reload()
        keeper.wait_generated()
        keeper.show_screen('score')
        assert keeper.court_screen()['court'] == 'B', f'F3: a plain link lost the chosen Court B after reload: {keeper.court_screen()}'

        def goto(app, path):
            app.page.goto(f'{base}{path}', wait_until='domcontentloaded')
            app.page.wait_for_function('window.KSMTest && KSMTest.booted()')
            app.wait_generated()

        # An explicit court in the link wins over the court stored on the device.
        goto(keeper, app_path(tid, 'court', 'A'))
        keeper.show_screen('score')
        assert keeper.court_screen()['court'] == 'A', f'&court=A did not override the stored Court B: {keeper.court_screen()}'
        # A TV link keeps its fixed court, before and after a reload, whatever the device chose for scoring.
        keeper.staff_login()
        keeper.open_court('B')
        goto(keeper, app_path(tid, 'tv', 'A'))
        keeper.wait_for(lambda: keeper.tv_screen()['court'] == 'A', message='the Court A TV display')
        keeper.reload()
        keeper.wait_for(lambda: keeper.tv_screen()['court'] == 'A', message='the Court A TV display after reload')
        goto(keeper, app_path(tid))
        keeper.show_screen('score')
        assert keeper.court_screen()['court'] == 'B', f'the TV link changed the scoring court: {keeper.court_screen()}'
        keeper.close()
        link_keeper = KsmApp.open_device(browser, base, 'Court B link', problems, app_path(tid, 'court', 'B'))
        link_keeper.wait_generated()
        link_keeper.staff_login()
        link_keeper.open_court('B')
        link_keeper.reload()
        link_keeper.wait_generated()
        link_keeper.show_screen('score')
        assert link_keeper.court_screen()['court'] == 'B', f'a Court B link lost its court: {link_keeper.court_screen()}'

        assert not problems, '\n'.join(problems)
        print(f'PASS saving: debounce, statuses, offline queue, Save Now, 10-minute autosave, diagnostics + retry, '
              f'recovery file, court after reload ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
