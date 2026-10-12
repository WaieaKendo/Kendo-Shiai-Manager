"""A failed or unanswered save is retried on its own (F35, test audit N1).

One staff device (Playwright's clock, so the retry and the timeout need no waiting) against a
throwaway `wrangler dev`, its live connection open throughout:
  * a save answered 503 is queued and sent again by itself; the device becomes idle without
    any further action (before F35 it stayed "unsaved" until its next edit: only the socket
    opening, the browser's online event or another save sent the queue);
  * a save that never answers (held at the network) is given up after the save timeout and
    queued, and the save waiting behind it goes on; before, both waited until a reload.
Both pin `KsmApp.wait_idle()`: the device's own "every change confirmed" state, not only the
server copy.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker

SAVE_TIMEOUT_MS = 20_000  # KSM_CLOUD_SAVE_TIMEOUT_MS in app/js/21-cloud-realtime-save-and-load.js
RETRY_MS = 2_000          # the first of KSM_QUEUED_SAVE_RETRY_MS


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def points_on_server(base, tid):
    return [(m.get('wp') or [], m.get('rp') or []) for m in fetch_record(base, tid)['payload']['state']['allMatches']['Open']
            if m.get('wp') or m.get('rp')]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        app = KsmApp.open_device(browser, base, 'Court A', problems, tournament_name='Retry Cup', clock=True)
        page = app.page
        tid = app.create_tournament()
        app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 4)}])
        app.save_now()
        app.wait_idle()
        app.open_court('A')
        app.wait_idle()
        page.wait_for_function("KSMTest.pendingReason().socket === 'open'")

        # --- A 503 is retried by itself ------------------------------------------------------------
        answered = []

        def unavailable_once(route):
            if route.request.method == 'PUT' and not answered:
                answered.append(route.request.url)
                return route.fulfill(status=503, content_type='text/plain', body='Service Unavailable')
            route.continue_()
        page.route(KsmApp._SAVE_URL, unavailable_once)
        app.score_point('W', 'M')
        page.clock.fast_forward(4_000)  # the 2 s + 1.2 s debounce
        app.wait_for(app.outbox, message='the refused save to be queued')
        reason = page.evaluate('KSMTest.pendingReason()')
        assert reason['lastSave']['httpStatus'] == 503 and reason['socket'] == 'open', reason
        page.clock.fast_forward(RETRY_MS + 500)  # nothing else happens on the device
        app.wait_idle(timeout=15)
        page.unroute(KsmApp._SAVE_URL, unavailable_once)
        assert points_on_server(base, tid) == [(['M'], [])], points_on_server(base, tid)

        # --- A save that never answers is given up ---------------------------------------------------
        app.hold_next_save()
        app.score_point('R', 'K')
        page.clock.fast_forward(4_000)
        app.wait_held_save()  # held at the network, never answered
        app.score_point('W', 'K')  # waits behind the hung save
        page.clock.fast_forward(4_000)
        page.wait_for_function('KSMTest.pendingReason().saveInFlight && KSMTest.pendingReason().queuedSave')
        warnings = []
        page.on('console', lambda m: warnings.append(m.text) if m.type == 'warning' else None)
        page.clock.fast_forward(SAVE_TIMEOUT_MS)  # given up: queued, and the save waiting behind it goes
        page.clock.fast_forward(RETRY_MS + 500)
        app.wait_idle(timeout=15)
        assert any('Cloud save timed out' in w for w in warnings), warnings
        assert points_on_server(base, tid) == [(['M', 'K'], ['K'])], points_on_server(base, tid)
        app.drop_held_save()

        assert not problems, '\n'.join(problems)
        print(f'PASS save retry: a 503 and a save that never answers are retried by themselves ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
