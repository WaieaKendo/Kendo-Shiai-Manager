"""N10: opposite clock skews preserve each court's history through a conflict."""
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge


def identities(payload, court):
    return [(e['clientId'], e['when'], e['label'])
            for e in payload['state']['courtActionHistory'][court]]


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        tid, a, b = two_courts(browser, base, problems, 'Clock skew')
        for app, hour in ((a, 1), (b, 19)):
            app.page.clock.install(time=datetime(2026, 10, 18, hour, tzinfo=timezone.utc))
        shown_a, shown_b = a.current_match(), b.current_match()
        a.hold_next_save(); a.watch_conflicts()
        a.score_point('W', 'M'); a.score_point('R', 'T'); a.save_now(); a.wait_held_save()
        b.score_point('R', 'K'); b.score_point('W', 'D'); b.save_now(); b.wait_idle()
        expected_a = identities(a.payload(), 'A')
        expected_b = identities(b.payload(), 'B')
        a.release_save(); a.wait_idle()
        payload = converge(base, tid, (a, b))
        assert a.conflicts() >= 1
        for copy in (payload, a.payload(), b.payload()):
            assert_points(copy, 'A', shown_a, ['M'], ['T'])
            assert_points(copy, 'B', shown_b, ['D'], ['K'])
            for court, expected in (('A', expected_a), ('B', expected_b)):
                actual = identities(copy, court)
                assert actual == expected, (court, actual, expected)
                assert len(actual) == len(set(actual))
                assert [x[1] for x in actual] == sorted(x[1] for x in actual)
        assert not problems, problems
        browser.close()
    print('PASS N10 clock skew')

if __name__ == '__main__': main()
