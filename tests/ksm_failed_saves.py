"""N3: refused saves remain queued and recover; five consecutive 409s exhaust rebasing."""
import json
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge


def main(status=500):
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        for status in (status,):
            print(f'N3 {status}: starting', flush=True)
            tid, a, b = two_courts(browser, base, problems, f'Failed save {status}')
            shown = a.current_match()
            a.page.clock.install()
            a.page.clock.pause_at(datetime.now(timezone.utc)+timedelta(seconds=1))
            answered = []
            record = fetch_record(base, tid)

            def refuse(route):
                if route.request.method != 'PUT':
                    return route.continue_()
                answered.append(route.request.post_data_json['revision'])
                route.fulfill(status=status, content_type='application/json',
                              body=json.dumps({'error': f'Injected {status}', 'record': record}))

            a.page.route(KsmApp._SAVE_URL, refuse)
            a.watch_conflicts()
            a.score_point('W', 'M')
            a.page.clock.fast_forward(2_100)  # local autosave debounce
            a.page.clock.fast_forward(1_300)  # cloud debounce scheduled by that autosave
            a.wait_for(lambda: a.outbox() and a.diagnostics().get('httpStatus') == status,
                       message=f'{status}: refused work queued')
            a.page.wait_for_function('''() => { const p = KSMTest.pendingReason();
                return !p.saveInFlight && !p.autosaveTimer && !p.cloudSaveTimer && !p.queuedSave;
            }''')
            assert a.outbox()['role'] == 'staff', a.outbox()
            wording = a.page.inner_text(sel('save-status')).strip()
            assert wording == 'Not saved · Changes waiting', (status, wording)
            assert_points(a.payload(), 'A', shown, ['M'], [])
            assert_points(fetch_record(base, tid)['payload'], 'A', shown, [], [])
            if status == 409:
                assert len(answered) == 5 and a.conflicts() == 5, answered
                assert a.diagnostics()['rebaseAttempt'] == 4, a.diagnostics()
            if status == 401:
                assert not a.staff_session()
                assert a.page.inner_text(sel('staff-auth')).strip() == 'Staff Login'
            print(f'N3 {status}: queued ({wording}); recovering', flush=True)
            a.page.unroute(KsmApp._SAVE_URL, refuse)
            if status != 403:
                a.page.clock.resume()
            if status == 401:
                a.staff_login()
            elif status == 403:
                # Authorization refusals deliberately suppress automatic retries.
                a.click('connection-status')
                a.click('diagnostics-retry')
                a.wait_for(lambda: not a.outbox(), message='403: Retry queued save to flush the queue')
                a.page.clock.resume()
            # Recover the existing queue without scoring again or asking for a new save.
            a.wait_idle()
            payload = converge(base, tid, (a, b))
            for copy in (payload, a.payload(), b.payload()):
                assert_points(copy, 'A', shown, ['M'], [])
            assert not a.outbox()
            print(f'N3 {status}: recovered', flush=True)
            a.close()
            b.close()
        assert not problems, '\n'.join(problems)
        browser.close()
    print(f'PASS N3 {status}: queue, exact status and recovery')


if __name__ == '__main__':
    main()
