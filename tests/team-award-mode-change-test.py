"""The team award mode changed after a team round robin ended (found in external PR review, #35).

D2: a team round robin's daihyosen decides only the places with an award (Setup's "Team Awards to
Display"). A round robin finished under "Champion only" with three teams level for 2nd gets no
daihyosen; switching to "Champion + Runner-up" afterwards gave 2nd an award, but no daihyosen was
created and Results named the alphabetically first of the level teams runner-up.

A director and a Court A device against a throwaway `wrangler dev`: a 3-person team round robin of
four teams on Court A; Team A beats everyone, B, C and D beat each other in a circle (one 1-0 bout
per pairing), so they are level for 2nd. Played under "Champion only": no daihyosen, Team A 1st.
The director switches Setup to "Champion + Runner-up": the daihyosen for B, C and D appears (on the
director, the server and the court device) and nobody is runner-up until it is played. The court
plays it (Red wins each: C beats B and D, B beats D): Team C is runner-up on both devices and the
server. Offline, a state whose mode names 2nd without its daihyosen (as a device that does not add
it would show it) shows "Tied — daihyosen needed", never a name.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

TEAM = 'Team Tournament'
CIRCLE = {frozenset(('Team B', 'Team C')): 'Team B', frozenset(('Team C', 'Team D')): 'Team C', frozenset(('Team B', 'Team D')): 'Team D'}
TIED = 'Tied — daihyosen needed'


def winner(white, red):
    if 'Team A' in (white, red):
        return 'Team A'
    return CIRCLE[frozenset((white, red))]


def play_round_robin(app):
    """Every pairing on Court A (Senpo decides it 1-0, the rest drawn); returns the next bout (a daihyosen) or None."""
    for _ in range(40):
        m = app.page.evaluate("() => { const m = KSMTest.prepareCourt('A'); return m ? {w: m.teamWhite, r: m.teamRed, pos: m.position, tb: !!m.roundRobinTiebreak} : null; }")
        if not m or m['tb']:
            return m
        pts = [['W' if winner(m['w'], m['r']) == m['w'] else 'R', 'M']] if m['pos'] == 'Senpo' else []
        app.page.evaluate('pts => KSMTest.play(pts)', pts)
    raise AssertionError('the round robin did not end')


def daihyosen(matches):
    return [(m['teamWhite'], m['teamRed'], bool(m.get('done'))) for m in matches if m.get('roundRobinTiebreak')]


def placements(app):
    return app.final_state()[TEAM]['placements']


def offline_tied_check(browser, problems):
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    app = KsmApp.local(page, 'Offline', problems=problems)
    app.answers['Create Staff password'] = ''  # offline harness: saves stay local
    app.nav('setup')
    page.select_option(sel('team-award-mode'), label='Champion only')
    app.configure([{'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 4, 'court': 'A'}])
    assert play_round_robin(app) is None, 'Champion only: a daihyosen for 2nd'
    # The mode names 2nd, but the state has no daihyosen for it (set without the Setup field).
    shown = page.evaluate("() => { KSMTest.app.state.teamAwardMode = 'top2'; return KSMTest.app.resultPlacements('Team Tournament').map(r => [r.place, r.name]); }")
    assert shown == [['1st', 'Team A'], ['2nd', TIED]], f'an awarded place still level was named: {shown}'
    page.close()


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        offline_tied_check(browser, problems)

        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Award Mode Cup')
        tid = director.create_tournament()
        director.nav('setup')
        director.page.select_option(sel('team-award-mode'), label='Champion only')
        director.configure([{'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 4, 'court': 'A'}])
        director.save_now()
        director.wait_idle()
        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        court.wait_generated()
        court.staff_login()
        court.open_court('A')
        court.wait_idle()

        # The round robin under "Champion only": B, C and D level for 2nd, no daihyosen.
        assert play_round_robin(director) is None, 'Champion only: a daihyosen for 2nd'
        director.save_now()
        director.wait_idle()
        assert placements(director) == [{'place': '1st', 'name': 'Team A'}], placements(director)
        assert not daihyosen(fetch_record(base, tid)['payload']['state']['allMatches'][TEAM])

        # Switched to "Champion + Runner-up": the daihyosen for 2nd, nobody runner-up yet.
        director.nav('setup')
        director.page.select_option(sel('team-award-mode'), label='Champion + Runner-up')
        director.wait_for(lambda: daihyosen(director.all_matches()[TEAM]), message='the daihyosen for 2nd on the director')
        expected = [('Team B', 'Team C', False), ('Team D', 'Team C', False), ('Team D', 'Team B', False)]
        assert daihyosen(director.all_matches()[TEAM]) == expected, daihyosen(director.all_matches()[TEAM])
        assert not any(p['place'] == '2nd' for p in placements(director)), f'a runner-up before the daihyosen: {placements(director)}'
        director.wait_idle()
        record = fetch_record(base, tid)
        assert record['payload']['state']['teamAwardMode'] == 'top2'
        assert daihyosen(record['payload']['state']['allMatches'][TEAM]) == expected, 'the daihyosen did not reach the server with the mode'
        court.wait_revision(record['revision'])
        court.wait_for(lambda: daihyosen(court.all_matches()[TEAM]) == expected, message='the daihyosen on the court device')
        assert not any(p['place'] == '2nd' for p in placements(court)), f'court: a runner-up before the daihyosen: {placements(court)}'

        # The court plays it: Red wins each bout (C beats B and D, B beats D): Team C is runner-up.
        for _ in range(3):
            m = court.page.evaluate("() => { const m = KSMTest.prepareCourt('A'); return m ? {tb: !!m.roundRobinTiebreak} : null; }")
            assert m and m['tb'], f'the daihyosen is not on Court A: {m}'
            court.page.evaluate("() => KSMTest.play([['R', 'M']])")
        court.save_now()
        court.wait_idle()
        runner_up = [{'place': '1st', 'name': 'Team A'}, {'place': '2nd', 'name': 'Team C'}]
        assert placements(court) == runner_up, placements(court)
        record = fetch_record(base, tid)
        assert all(done for *_, done in daihyosen(record['payload']['state']['allMatches'][TEAM])), 'the daihyosen results did not reach the server'
        director.wait_revision(record['revision'])
        director.wait_for(lambda: placements(director) == runner_up, message='the director to agree on the runner-up')

        assert not problems, '\n'.join(problems)
        print(f'PASS team award mode changed after the round robin: "Champion only" -> "Champion + Runner-up" adds the '
              f'daihyosen for 2nd (no runner-up until it is played, its winner then on every device); a level awarded '
              f'place shows "{TIED}" ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
