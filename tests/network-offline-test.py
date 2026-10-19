"""N2: three offline points and Next Match rebase onto another court's saves."""
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        tid, a, b = two_courts(browser, base, problems, 'Network offline')
        first_a, first_b = a.current_match(), b.current_match()
        a.watch_conflicts()
        a.page.context.set_offline(True)
        for side, letter in [('W', 'M'), ('R', 'K'), ('W', 'D')]:
            a.score_point(side, letter)
        a.next_match(settle=True)
        advanced = a.current_match()
        assert (advanced['white'], advanced['red']) != (first_a['white'], first_a['red'])
        a.wait_for(a.outbox, message='offline Next Match to be queued')
        for side, letter in [('R', 'T'), ('W', 'K')]:
            b.score_point(side, letter)
            b.save_now()
            b.wait_idle()
        a.page.context.set_offline(False)
        a.wait_idle()
        payload = converge(base, tid, (a, b))
        assert a.conflicts() >= 1, 'offline save never exercised rebase'
        for copy in (payload, a.payload(), b.payload()):
            assert_points(copy, 'A', first_a, ['M', 'D'], ['K'], done=True)
            assert_points(copy, 'B', first_b, ['K'], ['T'])
        assert (a.current_match()['white'], a.current_match()['red']) == (advanced['white'], advanced['red'])
        # Both devices agree on the advanced court, including its current-match pointer.
        b.open_court('A')
        assert (b.current_match()['white'], b.current_match()['red']) == (advanced['white'], advanced['red'])
        assert not a.outbox()
        assert not problems, '\n'.join(problems)
        browser.close()
    print('PASS N2 offline mid-match: both courts and Next Match survive rebase')


if __name__ == '__main__':
    main()
