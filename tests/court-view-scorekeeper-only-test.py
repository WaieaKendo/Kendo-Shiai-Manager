"""#15 PR 6 (docs/STORE.md section 1.2): only a court's scorekeeper moves the court's shared pointer.

Two courts on a throwaway `wrangler dev`: Court A has "Open A"; Court B has "Kids B" and "Open B". Devices: the
director (staff, created the tournament), Court B's scorekeeper (staff, pinned to Court B) and a spectator on the
Court B link (not logged in).

  1. The spectator picks Open B on its court screen: its own screen shows Open B, but Court B's shared pointer
     (courtState.B / courtActiveDivision.B) stays on Kids B, on the spectator itself (its Live Scores still shows
     what Court B is really running) and on the server. Before PR 6 the spectator's own copy moved to Open B.
  2. Court B's scorekeeper picks Open B: the server's courtState.B is Open B, and the spectator follows it after the
     live update; the director's copy shows it too.
  3. A load keeps each device's own court view: after the update the spectator still shows its court B, and the
     director's own court (A) is untouched.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record
from ksm_browser import launch_chromium
from ksm_races import people, state_of
from ksm_server import local_worker

POINTER = "() => { const s = KSMTest.app.state; return {court: s.currentCourt, division: s.currentDivision, B: s.courtState.B && s.courtState.B.division, activeB: s.courtActiveDivision.B}; }"


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Court View Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open A', 'format': 'Round Robin', 'court': 'A', 'entrants': people('OA', 3)},
            {'name': 'Kids B', 'format': 'Round Robin', 'court': 'B', 'entrants': people('KB', 3)},
            {'name': 'Open B', 'format': 'Round Robin', 'court': 'B', 'entrants': people('OB', 3)},
        ])
        director.save_now()
        director.wait_idle()
        keeper = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'B'))
        keeper.wait_generated()
        keeper.staff_login()
        keeper.open_court('B')
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid, 'court', 'B'))
        spectator.wait_generated()
        assert spectator.page.evaluate("KSMTest.app.state.currentCourt") == 'B', 'the spectator is on the Court B link'
        assert not spectator.staff_session(), 'the spectator is not logged in'

        server = lambda: state_of(fetch_record(base, tid))
        start = server()
        assert (start['courtState']['B'] or {}).get('division') == 'Kids B', start['courtState']
        revision = keeper.revision()

        # 1. The spectator's view choice.
        spectator.page.evaluate("KSMTest.app.selectScorekeeperDivision('Open B')")
        mine = spectator.page.evaluate(POINTER)
        assert mine['division'] == 'Open B' and mine['court'] == 'B', mine
        assert mine['B'] == 'Kids B' and mine['activeB'] == 'Kids B', f'the spectator moved Court B\'s pointer: {mine}'
        assert (server()['courtState']['B'] or {}).get('division') == 'Kids B', 'the server is unchanged'

        # 2. Court B's scorekeeper picks Open B: the shared pointer moves, and the other devices follow.
        keeper.page.evaluate("KSMTest.app.selectScorekeeperDivision('Open B')")
        keeper.wait_idle()
        keeper.wait_revision(revision + 1)
        assert (server()['courtState']['B'] or {}).get('division') == 'Open B', server()['courtState']
        assert server()['courtActiveDivision']['B'] == 'Open B', server()['courtActiveDivision']
        spectator.page.wait_for_function("KSMTest.app.state.courtState.B && KSMTest.app.state.courtState.B.division === 'Open B'", timeout=15000)
        director.page.wait_for_function("KSMTest.app.state.courtState.B && KSMTest.app.state.courtState.B.division === 'Open B'", timeout=15000)

        # 3. Each device keeps its own court after the load.
        assert spectator.page.evaluate(POINTER)['court'] == 'B'
        assert director.page.evaluate("KSMTest.app.state.currentCourt") == 'A'
        assert keeper.page.evaluate(POINTER) == {'court': 'B', 'division': 'Open B', 'B': 'Open B', 'activeB': 'Open B'}
        browser.close()
    assert not problems, problems
    print('PASS court view: only the court\'s scorekeeper moves its shared pointer')


if __name__ == '__main__':
    main()
