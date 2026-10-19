"""N6: real worker restart preserves revisions and reconnects both scoring devices."""
from playwright.sync_api import sync_playwright
from ksm_app import fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge


def main():
    problems = []
    with local_worker(restartable=True) as base, sync_playwright() as p:
        browser = launch_chromium(p)
        tid, a, b = two_courts(browser, base, problems, 'Worker restart')
        first_a, first_b = a.current_match(), b.current_match()
        a.score_point('W', 'M')
        a.save_now()
        a.wait_idle()
        before = fetch_record(base, tid)
        b.wait_revision(before['revision'])
        base.stop()
        for app in (a, b):
            app.page.wait_for_function("KSMTest.pendingReason().socket !== 'open'")
        a.score_point('R', 'K')
        a.wait_for(a.outbox, message='point during worker outage to be queued')
        a.page.wait_for_function('''() => { const p = KSMTest.pendingReason();
            return !p.saveInFlight && !p.autosaveTimer && !p.cloudSaveTimer && !p.queuedSave;
        }''')
        base.start()
        # The restarted Durable Object has the same revision and saved point, before the queue.
        restored = fetch_record(base, tid)
        assert restored['revision'] >= before['revision'], (before['revision'], restored['revision'])
        assert_points(restored['payload'], 'A', first_a, ['M'],
                      ['K'] if restored['revision'] > before['revision'] else [])
        for app in (a, b):
            app.page.wait_for_function("KSMTest.pendingReason().socket === 'open'")
            app.socket_barrier()
        a.wait_idle()
        flushed = fetch_record(base, tid)
        assert flushed['revision'] > before['revision']
        b.wait_revision(flushed['revision'])
        b.score_point('R', 'D')
        b.save_now()
        b.wait_idle()
        payload = converge(base, tid, (a, b))
        assert fetch_record(base, tid)['revision'] > flushed['revision']
        for copy in (payload, a.payload(), b.payload()):
            assert_points(copy, 'A', first_a, ['M'], ['K'])
            assert_points(copy, 'B', first_b, [], ['D'])
        assert not a.outbox()
        assert not problems, '\n'.join(problems)
        browser.close()
    print('PASS N6 worker restart: persisted revision, sockets reconnect, queue flushes once')


if __name__ == '__main__':
    main()
