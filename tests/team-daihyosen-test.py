"""A tied team round robin is decided by a daihyosen (F27, the owners' rule, WKC style).

Teams are ranked by team match wins, then individual bout wins, then points; teams still level for
a counted place (1st-3rd) play a one-point daihyosen (representative bout) and its winner takes the
place. Before the fix the name decided (Team A, Team B, Team C) and no daihyosen was made.

A director and a Court A scorekeeper against a throwaway `wrangler dev`: a 3-person team round robin
of three teams on Court A is played on the court screen as a circle (A beats B, B beats C, C beats A,
each by one 1-0 bout, the other bouts drawn), so the three are level on all three counts. Court A
then gets the daihyosen round (A-B, C-B, C-A, as the 3-player order), the representatives fight it
(B wins both, A beats C), and the court's division-complete panel, the server copy, the director
and a fresh device all show Team B 1st and Team A 2nd.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

TEAM = 'Team Tournament'
CIRCLE = {frozenset(('Team A', 'Team B')): 'Team A', frozenset(('Team B', 'Team C')): 'Team B', frozenset(('Team A', 'Team C')): 'Team C'}
DAIHYOSEN = {frozenset(('Team A', 'Team B')): 'Team B', frozenset(('Team B', 'Team C')): 'Team B', frozenset(('Team A', 'Team C')): 'Team A'}


def teams_of(meta):
    """The court's match line 'Team A vs Team B · Senpo' -> ('Team A', 'Team B') (White, Red)."""
    white, red = meta.split(' · ')[0].split(' vs ')
    return white.strip(), red.strip()


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Daihyosen Cup')
        tid = director.create_tournament()
        director.configure([{'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 3, 'court': 'A'}])
        director.save_now()
        director.wait_idle()
        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        court.wait_generated()
        court.staff_login()
        court.open_court('A')

        # The round robin: 3 pairings x 3 bouts; each pairing's Senpo decides it 1-0, the rest are draws.
        for bout in range(9):
            m = court.current_match()
            assert m and 'Daihyosen' not in m['meta'], f'bout {bout + 1}: {m}'
            white, red = teams_of(m['meta'])
            if 'Senpo' in m['meta']:
                court.score_point('W' if CIRCLE[frozenset((white, red))] == white else 'R', 'M')
            court.next_match(settle=True)
        court.wait_idle()
        record = fetch_record(base, tid)
        bouts = [m for m in record['payload']['state']['allMatches'][TEAM] if m.get('roundRobinTiebreak')]
        assert [(m['teamWhite'], m['teamRed'], m['position']) for m in bouts] == [
            ('Team A', 'Team B', 'Daihyosen'), ('Team C', 'Team B', 'Daihyosen'), ('Team C', 'Team A', 'Daihyosen')], \
            f'F27: no daihyosen round for three teams level on wins, bout wins and points: {bouts}'
        assert all(m['dynamicType'] == 'TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK' and m['origin'] == 'TIEBREAK' for m in bouts), bouts
        assert not court.court_screen()['complete'], 'the division is not complete before the daihyosen'
        director.wait_revision(record['revision'])
        assert director.final_state()[TEAM]['placements'] == [], 'no placements before the daihyosen'

        # The daihyosen round on Court A: one point decides each bout.
        for bout in range(3):
            m = court.current_match()
            assert m and 'Daihyosen' in m['meta'], f'daihyosen {bout + 1}: {m}'
            white, red = teams_of(m['meta'])
            court.score_point('W' if DAIHYOSEN[frozenset((white, red))] == white else 'R', 'K')
            court.next_match(settle=True)
        court.wait_for(lambda: court.court_screen()['complete'], message='the division-complete panel')
        court.wait_idle()
        places = [row[:2] for row in court.court_screen()['placements']]
        assert any('Team B' in ' '.join(r) for r in places[:1]) and any('Team A' in ' '.join(r) for r in places[1:2]), places

        final = fetch_record(base, tid)
        fresh = KsmApp.open_device(browser, base, 'Fresh', problems, app_path(tid))
        for app in (director, court, fresh):
            app.wait_revision(final['revision'])
            got = app.final_state()[TEAM]
            assert got['complete'], f'{app.name}: not complete'
            assert [p['name'] for p in got['placements']][:2] == ['Team B', 'Team A'], f'{app.name}: {got["placements"]}'
            assert [r['name'] for r in got['standings']['team']] == ['Team B', 'Team A', 'Team C'], f'{app.name}: {got["standings"]}'
            assert app.payload()['state']['allMatches'] == final['payload']['state']['allMatches'], f'{app.name}: matches differ from the server'

        assert not problems, '\n'.join(problems)
        print(f'PASS team daihyosen (F27): a team round robin level on wins, bout wins and points gets a daihyosen round on '
              f'its court; its winners take the places on the court, the server, the director and a fresh device ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
