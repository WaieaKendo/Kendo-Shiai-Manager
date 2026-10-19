"""N7: delayed records, duplicates, held-save delivery and tournament deletion."""
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge
from ksm_app import fetch_record


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        tid, a, b = two_courts(browser, base, problems, 'Socket order')
        old = fetch_record(base, tid)
        shown_a, shown_b = a.current_match(), b.current_match()
        a.hold_next_save(); a.watch_conflicts()
        a.score_point('W', 'M'); a.save_now(); a.wait_held_save()
        b.score_point('R', 'K'); b.save_now(); b.wait_idle()
        newer = fetch_record(base, tid)
        a.receive(newer); a.receive(old); a.receive(newer)
        a.release_save(); a.wait_idle()
        payload = converge(base, tid, (a, b))
        assert a.conflicts() >= 1
        revision = a.revision()
        assert a.receive(newer) is False
        assert a.receive(old) is False
        assert a.revision() == revision
        for copy in (payload, a.payload(), b.payload()):
            assert_points(copy, 'A', shown_a, ['M'], [])
            assert_points(copy, 'B', shown_b, [], ['K'])
            for court in ('A', 'B'):
                assert len(copy['state']['courtActionHistory'][court]) == 1, 'socket delivery duplicated history'
        a.delete_tournament('Socket order')
        b.wait_for_library()
        assert b.tournament_id() is None
        for app in (a, b):
            assert app.page.evaluate('KSMTest.autosaveOrigin()') is None
        assert b.page.evaluate("KSMTest.pendingReason().socket") != 'open'
        assert not problems, problems
        browser.close()
    print('PASS N7 socket ordering and delete')

if __name__ == '__main__': main()
