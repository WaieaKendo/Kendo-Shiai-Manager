"""Court state and drawn bouts through a save conflict (test audit, issue #59, ranks 8, 9 and 10).

Director and the two court scorekeepers against a throwaway `wrangler dev`: Court A has "Kids A",
"Open A" and a team event; Court B has "Kids B" and "Open B". Each race holds one court's save at
the network (KsmApp.hold_next_save()) while the other court saves first, then releases it, so it
meets a conflict (HTTP 409) and is rebased:

  10. Hikiwake: Court A ends its first Kids A bout 0-0 with Next Match, Court B ends its first Kids B
      bout 1-1 and saves first. Both bouts stay drawn and finished (a draw is no points, so it is
      the easiest result to replay as "unfinished"), both courts move on to their next bout.
   9. Court division select: Court A moves to Open A and scores, Court B moves to Open B and scores
      first. After the rebase and after a reload, each court is on its own division, and both
      points are on the server.
   8. Team representative: Court A's team event is tied after three drawn bouts; Court A picks
      White's representative while Court B saves a point first. The pick is on the server and on
      Court A after the rebase and after a reload.
   6. Setup: a division's format and court changed (per-field merge) while Court B saves first.
  11. Undo after a reload: the court's history survives, so a saved point is taken back.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel, app_path
from ksm_browser import launch_chromium
from ksm_races import Races, people, state_of
from ksm_server import local_worker

TEAM = 'Team Tournament'


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Court State Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Kids A', 'format': 'Round Robin', 'court': 'A', 'entrants': people('KA', 3)},
            {'name': 'Open A', 'format': 'Round Robin', 'court': 'A', 'entrants': people('OA', 3)},
            {'name': 'Kids B', 'format': 'Round Robin', 'court': 'B', 'entrants': people('KB', 3)},
            {'name': 'Open B', 'format': 'Round Robin', 'court': 'B', 'entrants': people('OB', 3)},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'teams': 2, 'court': 'A'},
        ])
        director.save_now()
        director.wait_idle()
        courts = {}
        for c in 'AB':
            app = KsmApp.open_device(browser, base, f'Court {c}', problems, app_path(tid, 'court', c))
            app.wait_generated()
            app.staff_login()
            app.open_court(c)
            courts[c] = app
        a, b = courts['A'], courts['B']
        races = Races(base, tid, [director, a, b])
        division_of = lambda record, c: (state_of(record)['courtState'].get(c) or {}).get('division')
        bouts = lambda record, div: [(m['white'], m['red'], bool(m.get('done')), m.get('wp') or [], m.get('rp') or [])
                                     for m in state_of(record)['allMatches'][div] if m.get('type') != 'teamPlayoff']

        def reload(app, court):
            app.reload()
            app.wait_idle()
            app.open_court(court)
            app.watch_conflicts()
            app.socket_barrier()

        # 10. Hikiwake on both courts through a conflict.
        assert a.court_screen()['division'] == 'Kids A' and b.court_screen()['division'] == 'Kids B'
        first_a, first_b = bouts(races.server(), 'Kids A')[0], bouts(races.server(), 'Kids B')[0]
        second_a, second_b = bouts(races.server(), 'Kids A')[1], bouts(races.server(), 'Kids B')[1]
        record = races.race(a, a.next_match, b, lambda: (b.score_point('W', 'M'), b.score_point('R', 'K'), b.next_match()))
        assert bouts(record, 'Kids A')[0] == (first_a[0], first_a[1], True, [], []), f'10: Court A\'s 0-0 draw was lost or replayed unfinished: {bouts(record, "Kids A")[0]}'
        assert bouts(record, 'Kids B')[0] == (first_b[0], first_b[1], True, ['M'], ['K']), f'10: Court B\'s 1-1 draw: {bouts(record, "Kids B")[0]}'
        for app, nxt in ((a, second_a), (b, second_b)):
            app.wait_for(lambda app=app, nxt=nxt: (app.court_screen()['white'], app.court_screen()['red']) == nxt[:2],
                         message=f'10: {app.name} on its next bout')
        for app in (a, b):
            assert [m[2] for m in bouts({'payload': app.payload()}, 'Kids A')[:2]] == [True, False], f'10: {app.name} shows Kids A differently from the server'
        reload(a, 'A')
        reload(b, 'B')
        assert (a.court_screen()['white'], a.court_screen()['red']) == second_a[:2] and (b.court_screen()['white'], b.court_screen()['red']) == second_b[:2], \
            '10: after a reload a court is not on its next bout'

        # 9. Both courts switch division while the other saves.
        record = races.race(a, lambda: (a.switch_division('Open A'), a.score_point('W', 'M')),
                            b, lambda: (b.switch_division('Open B'), b.score_point('R', 'K')))
        assert (division_of(record, 'A'), division_of(record, 'B')) == ('Open A', 'Open B'), f'9: courts on {division_of(record, "A")}, {division_of(record, "B")}'
        assert bouts(record, 'Open A')[0][3] == ['M'] and bouts(record, 'Open B')[0][4] == ['K'], '9: a court point was lost'
        assert (a.court_screen()['division'], b.court_screen()['division']) == ('Open A', 'Open B'), '9: a court jumped to another division after the rebase'
        reload(a, 'A')
        reload(b, 'B')
        assert (a.court_screen()['division'], b.court_screen()['division']) == ('Open A', 'Open B'), '9: a court jumped to another division after a reload'
        assert a.court_screen()['white_points'] == 'M' and b.court_screen()['red_points'] == 'K', '9: a court lost its point after a reload'

        # 8. Team representative while the other court saves first.
        a.switch_division(TEAM)
        for _ in range(3):  # three drawn bouts: the teams are tied, so the representative match follows
            a.next_match()
        races.settle()
        select = f'#score {sel("court-white-name")} {sel("representative-select")}'
        a.page.wait_for_function(f"document.querySelectorAll('{sel('representative-select')}').length === 2")
        member = a.page.locator(f'{select} option').nth(1).inner_text()
        playoff = lambda record: next(m for m in state_of(record)['allMatches'][TEAM] if m.get('type') == 'teamPlayoff')
        assert playoff(races.server())['white'] != member, '8: the representative is picked before the test picks it'
        record = races.race(a, lambda: a.page.select_option(select, label=member), b, lambda: b.score_point('W', 'M'))
        assert playoff(record)['white'] == member, f'8: the representative pick was lost in the conflict: {playoff(record)["white"]!r}'
        assert bouts(record, 'Open B')[0][3:] == (['M'], ['K']), '8: Court B\'s point was lost'
        picked = lambda: a.page.eval_on_selector(select, 'el => el.value')
        assert picked() == member, f'8: Court A does not show its pick: {picked()!r}'
        reload(a, 'A')
        assert picked() == member, f'8: Court A lost the pick after a reload: {picked()!r}'

        # 6. A division's format and court changed in Setup (a per-field merge) while Court B saves first.
        director.nav('setup')
        row = director.setup_division_row('Kids A')
        kids_before = (state_of(races.server())['divisionTypes']['Kids A'], state_of(races.server())['divisionCourts']['Kids A'])
        assert kids_before == ('Round Robin', 'A'), kids_before

        def change_kids():
            row.locator(sel('setup-division-format')).select_option(label='Single Elimination')
            row.locator(sel('setup-division-court')).select_option('B')
            row.locator(sel('setup-division-court')).blur()
        record = races.race(director, change_kids, b, lambda: b.score_point('W', 'T'))
        assert (state_of(record)['divisionTypes']['Kids A'], state_of(record)['divisionCourts']['Kids A']) == ('Single Elimination', 'B'), \
            f'6: the Setup edit was lost: {state_of(record)["divisionTypes"]["Kids A"]}, {state_of(record)["divisionCourts"]["Kids A"]}'
        assert any('T' in m[3] for m in bouts(record, 'Open B')), '6: Court B\'s point was lost'
        for app in (a, b):
            app.wait_for(lambda app=app: app.payload()['state']['divisionCourts']['Kids A'] == 'B', message=f'6: the Setup edit on {app.name}')

        # 11. Undo after a reload (the history survives a reload): Court B's point is taken back.
        b.score_point('R', 'D')
        races.settle()
        assert any('D' in m[4] for m in bouts(races.server(), 'Open B')), '11: the point to undo was not saved'
        reload(b, 'B')
        b.undo()
        races.settle()
        assert not any('D' in m[4] for m in bouts(races.server(), 'Open B')), '11: Undo after a reload did not take the point back'
        assert b.court_screen()['red_points'] != 'D' and 'D' not in b.court_screen()['red_points'], '11: Court B still shows the undone point'

        assert not problems, '\n'.join(problems)
        print(f'PASS court state through conflicts: drawn bouts on both courts, each court keeps its own division, the representative pick '
              f'survive a rebase and a reload; a Setup division edit merges; Undo works after a reload ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
