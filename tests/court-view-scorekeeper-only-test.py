"""#15 PR 6 (docs/STORE.md section 1.2): only a court's scorekeeper moves the court's shared pointer.

Two courts on a throwaway `wrangler dev`: Court A has "Open A"; Court B has "Kids B" and "Open B". Devices: the
director (staff, created the tournament), a Court B tablet that opens the Court B link before Staff Login (the F3 flow),
a second Court B tablet (logged in), a spectator on the Court B link and a TV on Court B.

  1. The spectator and the TV pick Open B on their court screen: each shows Open B, but Court B's shared pointer
     (courtState.B / courtActiveDivision.B) stays on Kids B, on that device and on the server.
  2. The first tablet picks Open B before Staff Login: only its view moves. Staff Login makes it Court B's scorekeeper,
     and the pointer follows its view once (saved): the server, the director and the spectator show Open B (#180 review).
  3. The second tablet (Court B's scorekeeper) picks Kids B, saved. Its view moves to Open B while its role is not staff;
     it is staff again with no login event in between (the role variable alone) and scores a point: the pointer follows
     its view (Open B) with that point, and the next save carries both.
  4. Each device keeps its own court after the live updates; the TV and the spectator never wrote the pointer.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record
from ksm_browser import launch_chromium
from ksm_races import people, state_of
from ksm_server import local_worker

POINTER = "() => { const s = KSMTest.app.state; return {court: s.currentCourt, division: s.currentDivision, B: s.courtState.B && s.courtState.B.division, activeB: s.courtActiveDivision.B}; }"
FOLLOWS = "d => KSMTest.app.state.courtState.B && KSMTest.app.state.courtState.B.division === d && KSMTest.app.state.courtActiveDivision.B === d"


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
        server = lambda: state_of(fetch_record(base, tid))
        server_b = lambda: ((server()['courtState']['B'] or {}).get('division'), server()['courtActiveDivision']['B'])
        assert server_b() == ('Kids B', 'Kids B'), server()['courtState']

        tablet = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'B'))
        tablet.wait_generated()
        second = KsmApp.open_device(browser, base, 'Court B 2', problems, app_path(tid, 'court', 'B'))
        second.wait_generated()
        second.staff_login()
        second.open_court('B')
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid, 'court', 'B'))
        spectator.wait_generated()
        tv = KsmApp.open_device(browser, base, 'TV B', problems, app_path(tid, 'tv', 'B'))
        tv.wait_generated()
        for app in (tablet, spectator):
            assert app.page.evaluate("KSMTest.app.state.currentCourt") == 'B', f'{app.name} is on the Court B link'
            assert not app.staff_session(), f'{app.name} is not logged in'

        # 1. A spectator's and a TV's view choice.
        for app in (spectator, tv):
            app.page.evaluate("KSMTest.app.selectScorekeeperDivision('Open B')")
            mine = app.page.evaluate(POINTER)
            assert mine['division'] == 'Open B', (app.name, mine)
            assert mine['B'] == 'Kids B' and mine['activeB'] == 'Kids B', f'{app.name} moved Court B\'s pointer: {mine}'
        assert server_b() == ('Kids B', 'Kids B'), 'the server is unchanged'

        # 2. Picked before Staff Login, then Staff Login: the pointer follows the tablet's view, once, and is saved.
        revision = director.revision()
        tablet.page.evaluate("KSMTest.app.selectScorekeeperDivision('Open B')")
        mine = tablet.page.evaluate(POINTER)
        assert mine['division'] == 'Open B' and mine['B'] == 'Kids B', f'before login only the view moves: {mine}'
        tablet.staff_login()
        assert tablet.page.evaluate(POINTER) == {'court': 'B', 'division': 'Open B', 'B': 'Open B', 'activeB': 'Open B'}, tablet.page.evaluate(POINTER)
        tablet.wait_idle()
        assert server_b() == ('Open B', 'Open B'), f'the login\'s save carries the pointer: {server()["courtState"]}'
        # (The second tablet is also a Court B scorekeeper: it keeps its own division on a remote apply, v3.17.17, as before.)
        for app in (director, spectator):
            app.page.wait_for_function(FOLLOWS, arg='Open B', timeout=15000)
        assert director.revision() > revision

        # 3. The second tablet, as Court B's scorekeeper, picks Kids B (an ordinary pick: saved). Then its view moves to
        #    Open B while its role is not staff, it is staff again with no login event in between (the role variable
        #    alone) and scores a point: the point's save carries the pointer (Open B).
        second.page.evaluate("KSMTest.app.selectScorekeeperDivision('Kids B')")
        second.wait_idle()
        assert server_b() == ('Kids B', 'Kids B'), f'a scorekeeper\'s pick is saved: {server()["courtState"]}'
        second.page.evaluate("KSMTest.app.ksmSessionRole = 'spectator'")
        second.page.evaluate("KSMTest.app.selectScorekeeperDivision('Open B')")
        assert second.page.evaluate(POINTER)['B'] == 'Kids B', 'not staff: the pick moves only the view'
        second.page.evaluate("KSMTest.app.ksmSessionRole = 'staff'")
        assert second.page.evaluate(POINTER)['B'] == 'Kids B', 'no login event: nothing has run yet'
        second.page.evaluate("KSMTest.app.point('W', 'M')")
        assert second.page.evaluate(POINTER) == {'court': 'B', 'division': 'Open B', 'B': 'Open B', 'activeB': 'Open B'}, second.page.evaluate(POINTER)
        # Setting the role variable by hand skips the app's save path for this point, so save as the app would next.
        second.save_now()
        second.wait_idle()
        assert server_b() == ('Open B', 'Open B'), f'the next save carries the pointer with the point: {server()["courtState"]}'
        assert any(m.get('wp') == ['M'] for m in server()['allMatches']['Open B']), 'the point is on Open B'
        for app in (director, spectator):
            app.page.wait_for_function(FOLLOWS, arg='Open B', timeout=15000)

        # 4. Each device keeps its own court; the TV and the spectator follow the server and never wrote it.
        assert spectator.page.evaluate(POINTER)['court'] == 'B'
        assert director.page.evaluate("KSMTest.app.state.currentCourt") == 'A'
        tv.page.wait_for_function(FOLLOWS, arg='Open B', timeout=15000)
        browser.close()
    assert not problems, problems
    print('PASS court view: only the court\'s scorekeeper moves its shared pointer; a pick before Staff Login follows')


if __name__ == '__main__':
    main()
