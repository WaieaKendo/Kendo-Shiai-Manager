"""Switching a court away from a division and back keeps the match's points on the score pad.

Before the fix setActiveDivision() reset the pad to empty on every switch, and the next tapped point
overwrote the match's earlier points (syncActiveScoreToMatch). One Court A scorekeeper and a TV
device against a throwaway `wrangler dev`:
  * individual match: score M and K for White, switch to another division and back; the pad shows
    "MK" and the match still has them; one more point (Red D) is added to them, not instead of them;
  * team match (score per bout): the second bout's points survive the same switch;
  * a division whose current match is fresh shows an empty pad;
  * the TV follows the court to the division and shows the match's points (unchanged behaviour).
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

TEAM = 'Team Tournament'


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Pad Switch Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('O', 3)},
            {'name': 'Fresh', 'format': 'Round Robin', 'court': 'A', 'entrants': people('F', 3)},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 2, 'court': 'A'},
        ])
        director.save_now()
        director.wait_idle()
        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        court.wait_generated()
        court.staff_login()
        court.open_court('A')
        tv = KsmApp.open_device(browser, base, 'TV A', problems, app_path(tid, 'tv', 'A'))

        squash = lambda text: ''.join(text.split())
        points = lambda: (squash(court.court_screen()['white_points']), squash(court.court_screen()['red_points']))

        def switch(division):
            court.switch_division(division)
            court.wait_for(lambda: court.court_screen()['selected'] == division, message=f'switched to {division}')

        def stored(division, index):
            m = court.all_matches()[division][index]
            return (''.join(m.get('wp') or []), ''.join(m.get('rp') or []))

        # --- individual match: switch away and back --------------------------------------
        switch('Open')
        court.score_point('W', 'M')
        court.score_point('W', 'K')
        assert points() == ('MK', ''), points()
        switch('Fresh')
        assert points() == ('', ''), f'a fresh match shows an empty pad: {points()}'
        switch('Open')
        assert points() == ('MK', ''), f'the pad shows the match points after switching back: {points()}'
        court.score_point('R', 'D')
        assert points() == ('MK', 'D'), f'the new point is added to the earlier ones: {points()}'
        court.wait_idle()
        idx = next(i for i, m in enumerate(court.all_matches()['Open']) if ''.join(m.get('wp') or []) == 'MK')
        assert stored('Open', idx) == ('MK', 'D'), stored('Open', idx)

        # --- the TV follows the court and shows the match's points -----------------------
        tv.wait_for(lambda: tv.tv_screen()['division'] == 'Open', message='TV on Open')
        tv.wait_for(lambda: tv.tv_screen()['white_score'] == 'M K' and tv.tv_screen()['red_score'] == 'D', message=f'TV shows M K vs D: {tv.tv_screen()}')

        # --- team match: points per bout -------------------------------------------------
        switch(TEAM)
        court.score_point('W', 'M')
        court.next_match(settle=True)
        court.score_point('R', 'K')
        court.score_point('R', 'D')
        assert points() == ('', 'KD'), points()
        switch('Open')
        switch(TEAM)
        assert points() == ('', 'KD'), f'team bout points survive the switch: {points()}'
        court.score_point('W', 'M')
        assert points() == ('M', 'KD'), points()
        court.wait_idle()
        bouts = court.all_matches()[TEAM]
        scored = [(''.join(m.get('wp') or []), ''.join(m.get('rp') or [])) for m in bouts]
        assert scored[0] == ('M', ''), scored
        assert scored[1] == ('M', 'KD'), scored

        assert not problems, '\n'.join(problems)
        browser.close()
    print(f'PASS score pad keeps the match points across a division switch (individual, team bout, fresh match, TV) ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
