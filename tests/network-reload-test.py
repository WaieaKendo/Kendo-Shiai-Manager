"""N4: reload during a held save keeps staff authorization and the unload outbox."""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        tid, a, b = two_courts(browser, base, problems, 'Reload held save drop')
        shown = a.current_match()
        token = a.staff_session()
        a.hold_next_save()
        a.score_point('W', 'M')
        a.save_now()
        held = a.wait_held_save()
        assert a.page.evaluate('KSMTest.pendingReason().saveInFlight')
        assert not a.outbox(), 'save must still be in flight, not already queued'
        assert_points(held, 'A', shown, ['M'], [])
        assert_points(fetch_record(base, tid)['payload'], 'A', shown, [], [])
        # Block post-reload saves too, so the unload queue is observable before recovery.
        def after_reload(route):
            if route.request.method == 'PUT' and route.request.post_data_json.get('revision') != -1:
                route.abort()
            else:
                route.continue_()
        a.page.route(KsmApp._SAVE_URL, after_reload)
        a.reload()
        a.wait_generated()
        a.wait_for(a.outbox, message='in-flight work restored from unload outbox')
        assert a.outbox()['role'] == 'staff'
        assert a.staff_session() == token
        assert a.page.inner_text(sel('staff-auth')).strip() == 'Logout'
        a.drop_held_save()
        assert_points(fetch_record(base, tid)['payload'], 'A', shown, [], [])
        a.page.unroute(KsmApp._SAVE_URL, after_reload)
        a.wait_idle()
        payload = converge(base, tid, (a, b))
        for copy in (payload, a.payload(), b.payload()):
            assert_points(copy, 'A', shown, ['M'], [])
        assert not a.outbox()
        a.close()
        b.close()
        assert not problems, '\n'.join(problems)
        browser.close()
    print('PASS N4 held save reload: drop, staff session and outbox recovery')


if __name__ == '__main__':
    main()
