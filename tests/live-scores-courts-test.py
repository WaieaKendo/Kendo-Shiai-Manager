"""Live Scores with one court's division finished while the other court still plays (F16).

Director, Court A and Court B scorekeepers and a spectator against a throwaway `wrangler dev`:
Open and Kids (round robins of 3) on Court A, Women (round robin of 4) on Court B. On every
device (the spectator, the Court A device and the Court B device) Live Scores must show:

  1. Court A finishes Open while Court B is in the middle of a match: both courts, Court A's
     card with Open's placements, Court B's card with its live match. (Before F16 the Live
     Scores court's finished division replaced the whole screen and hid Court B's match.)
  2. Court A moves on to Kids and starts a match, Court B finishes Women: both courts, Court B's
     card with Women's placements. (Before F16 a division finished on Court B only never showed
     its placements on a device whose Live Scores court is A: "No active match".)
  3. Court A finishes Kids: neither court has a match, so the whole screen shows the placements
     of the Live Scores court's finished division (Kids).

Every device here has Court A as its Live Scores court (state.publicCourt; nothing in the UI
changes it except a TV link). A device whose Live Scores court is B is pinned by
golden-live-scores-test.py ("complete, as a Court B device").
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def play_out(court):
    """Score White Men and press Next Match until the court has nothing left to play."""
    for _ in range(20):
        if not court.current_match():
            return
        court.score_point('W', 'M')
        court.next_match(settle=True)
    raise AssertionError(f'{court.name}: the division did not finish')


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Live Courts Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
            {'name': 'Women', 'format': 'Round Robin', 'court': 'B', 'entrants': people('W', 4)},
            {'name': 'Kids', 'format': 'Round Robin', 'court': 'A', 'entrants': people('K', 3)},
        ])
        director.save_now()
        director.wait_idle()
        courts = {}
        for c in 'AB':
            court = KsmApp.open_device(browser, base, f'Court {c}', problems, app_path(tid, 'court', c))
            court.wait_generated()
            court.staff_login()
            court.open_court(c)
            court.wait_for(court.current_match, message=f'a match on Court {c}')
            courts[c] = court
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        spectator.wait_generated()
        devices = [spectator, courts['A'], courts['B']]

        def catch_up(revision):
            for device in devices:
                device.wait_revision(revision)
                device.nav('live-scores')

        def check_courts(phase, finished_court, places, division, playing_court, match):
            """Every device: both courts; `finished_court`'s card with `places`, `playing_court`'s with `match`."""
            catch_up(max(courts[c].revision() for c in 'AB'))
            for device in devices:
                def shown(d=device):
                    done, live = d.live_court(finished_court), d.live_court(playing_court)
                    return (done and live and done.get('placements') == places and 'placements' not in live
                            and live['white'] == match['white'] and live['red'] == match['red'] and d.live_placements() is None)
                try:
                    device.wait_for(shown, timeout=10, message=phase)
                except AssertionError:
                    raise AssertionError(f'F16: {device.name}: {phase}: Live Scores should keep both courts, with the finished '
                                         f"division's placements in Court {finished_court}'s card; got A={device.live_court('A')}, "
                                         f'B={device.live_court("B")}, full-screen placements={device.live_placements()}')
                meta = device.live_court(finished_court)['meta']
                assert meta == f'{division} • Final Results', f'{device.name}: {phase}: Court {finished_court} meta {meta!r}'

        # 1. Court B is mid-match while Court A plays Open to the end.
        b_match = courts['B'].current_match()
        courts['B'].score_point('R', 'K')
        courts['B'].wait_idle()
        play_out(courts['A'])
        courts['A'].wait_idle()
        open_places = courts['A'].court_screen()['placements']
        assert courts['A'].court_screen()['complete'] and len(open_places) >= 3, courts['A'].court_screen()
        check_courts('Open finished on Court A while Court B plays', 'A', open_places, 'Open', 'B', b_match)

        # 2. Court A moves on to Kids and starts a match; Court B finishes Women.
        courts['A'].open_court('A')
        courts['A'].switch_division('Kids')
        courts['A'].wait_for(courts['A'].current_match, message='a Kids match on Court A')
        a_match = courts['A'].current_match()
        courts['A'].score_point('W', 'K')
        courts['A'].wait_idle()
        courts['B'].open_court('B')
        play_out(courts['B'])
        courts['B'].wait_idle()
        women_places = courts['B'].court_screen()['placements']
        assert courts['B'].court_screen()['complete'] and len(women_places) >= 3, courts['B'].court_screen()
        check_courts('Women finished on Court B while Court A plays', 'B', women_places, 'Women', 'A', a_match)

        # 3. Court A finishes Kids: neither court has a match, the Live Scores court's placements fill the screen.
        courts['A'].open_court('A')
        play_out(courts['A'])
        courts['A'].wait_idle()
        kids_places = courts['A'].court_screen()['placements']
        assert courts['A'].court_screen()['complete'] and len(kids_places) >= 3, courts['A'].court_screen()
        catch_up(courts['A'].revision())
        for device in devices:
            device.wait_for(lambda d=device: d.live_placements() == kids_places, timeout=10,
                            message=f'the full-screen placements of Kids ({kids_places})')

        assert not problems, '\n'.join(problems)
        print(f"PASS Live Scores keeps both courts while one plays, a finished division's placements in its court's card "
              f'on every device, the full-screen placements once neither court plays ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
