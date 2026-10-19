"""N5: a held tab rebases after many intervening court saves."""
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge
from ksm_app import fetch_record, KsmApp, sel


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        tid, a, b = two_courts(browser, base, problems, 'Stale tab')
        shown_a = a.current_match()
        # Keep the request below its 20-second app timeout while B advances many revisions.
        a.page.clock.install(time=datetime(2026, 10, 18, 12, tzinfo=timezone.utc))
        a.page.clock.pause_at(datetime(2026, 10, 18, 12, 0, 1, tzinfo=timezone.utc))
        a.watch_conflicts(); a.hold_next_save()
        a.score_point('W', 'M'); a.save_now(); a.wait_held_save()
        before = a.revision()
        completed = []
        for _ in range(5):
            shown = b.current_match()
            b.score_point('R', 'K'); b.save_now(); b.wait_idle()
            b.score_point('R', 'D'); b.next_match(settle=True); b.wait_idle()
            completed.append(shown)
        assert fetch_record(base, tid)['revision'] >= before + 10
        assert a.page.evaluate('KSMTest.pendingReason().saveInFlight')
        assert not a.outbox(), 'held request timed out instead of exercising a stale save'
        a.release_save(); a.page.clock.resume(); a.wait_idle()
        payload = converge(base, tid, (a, b))
        assert a.conflicts() >= 1
        for copy in (payload, a.payload(), b.payload()):
            assert_points(copy, 'A', shown_a, ['M'], [])
            for shown in completed:
                assert_points(copy, 'B', shown, [], ['K', 'D'], done=True)
        # F25: an expired token is reported; its staff snapshot survives live updates.
        def expired(route):
            if route.request.method == 'PUT':
                route.fulfill(status=401, content_type='application/json',
                    body='{"error":"Staff session expired. Use Staff Login again.","code":"session-expired"}')
            else: route.continue_()
        a.page.route(KsmApp._SAVE_URL, expired)
        a.score_point('R', 'T'); a.save_now()
        a.wait_for(lambda: a.outbox() and not a.staff_session(), message='expired staff queue')
        assert a.outbox()['role'] == 'staff'
        assert a.page.inner_text(sel('staff-auth')).strip() == 'Staff Login'
        assert a.diagnostics()['stage'] in ('Staff session expired', 'Cloud save failed')
        assert a.page.inner_text(sel('save-status')).strip() == 'Not saved · Changes waiting'
        assert 'Staff session expired' in a.toast()
        b.score_point('W', 'M'); b.save_now(); b.wait_idle()
        a.wait_revision(b.revision())
        assert a.outbox(), 'expired work lost to a live update'
        assert_points(fetch_record(base, tid)['payload'], 'A', shown_a, ['M'], [])
        a.page.unroute(KsmApp._SAVE_URL, expired)
        a.staff_login(); a.wait_idle()
        payload = converge(base, tid, (a, b))
        for copy in (payload, a.payload(), b.payload()):
            assert_points(copy, 'A', shown_a, ['M'], ['T'])
        assert not problems, problems
        browser.close()
    print('PASS N5 stale base')

if __name__ == '__main__': main()
