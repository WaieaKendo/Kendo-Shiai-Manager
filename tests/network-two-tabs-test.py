"""N8: tabs sharing storage must preserve both courts' queued work."""
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points
from ksm_app import KsmApp, app_path, fetch_record


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        tid, a, observer = two_courts(browser, base, problems, 'Two tabs')
        page = a.page.context.new_page()
        b = KsmApp(page, 'Second tab', problems)
        b.answers = dict(a.answers)
        page.on('dialog', b._on_dialog)
        page.on('pageerror', lambda error: problems.append(str(error)))
        page.goto(base + app_path(tid, 'court', 'B'), wait_until='domcontentloaded')
        page.wait_for_function('window.KSMTest && KSMTest.booted()')
        b.wait_generated(); b.staff_login(); b.open_court('B'); b.wait_idle()
        shown_a, shown_b = a.current_match(), b.current_match()
        # Refuse only tab A's writes; tab B remains online in the shared context.
        def refuse(route):
            if route.request.method == 'PUT': route.abort()
            else: route.continue_()
        a.page.route(KsmApp._SAVE_URL, refuse)
        a.score_point('W', 'M'); a.save_now()
        a.wait_for(a.outbox, message='tab A queue')
        b.score_point('R', 'K'); b.save_now()
        b.page.wait_for_function('''() => { const p=KSMTest.pendingReason();
            return !p.saveInFlight && !p.autosaveTimer && !p.cloudSaveTimer && !p.queuedSave; }''')
        b.socket_barrier()
        # F36 expected failure, pinned like edit-conflicts case 4. When fixed,
        # require the queue to survive until both points reach the server automatically.
        assert not a.outbox(), 'F36 fixed? Queue survived: require automatic recovery and mark F36 fixed'
        assert_points(fetch_record(base, tid)['payload'], 'A', shown_a, [], [])
        assert_points(a.payload(), 'A', shown_a, ['M'], [])
        assert a.page.evaluate('KSMTest.pending()'), 'F36 no longer leaves tab A unconfirmed'
        a.page.wait_for_function('!KSMTest.pendingReason().saveInFlight')
        a.page.unroute(KsmApp._SAVE_URL, refuse)
        # The other court's save succeeds, but A cannot flush an outbox that B removed.
        payload = fetch_record(base, tid)['payload']
        assert_points(payload, 'A', shown_a, [], [])
        assert_points(payload, 'B', shown_b, [], ['K'])
        assert_points(b.payload(), 'B', shown_b, [], ['K'])
        autosave = a.page.evaluate('KSMTest.autosavePayload()')
        assert_points(autosave, 'A', shown_a, [], [])
        assert_points(autosave, 'B', shown_b, [], ['K'])
        assert not problems, problems
        browser.close()
    print('PASS N8 F36 pinned: shared outbox cleared; A remains local while B reaches the server')

if __name__ == '__main__': main()
