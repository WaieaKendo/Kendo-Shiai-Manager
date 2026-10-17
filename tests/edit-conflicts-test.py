"""Two devices editing at the same time: every kind of edit through a save conflict (test audit, issue #19).

Director, Court A, Court B and a registration desk (a second staff device) against a throwaway
`wrangler dev`. Each race is made deterministic: the second device's save is held at the network
(KsmApp.hold_next_save()) while the first device's edit is saved, then released, so it meets a
conflict (HTTP 409) and is rebased onto the first device's save, as when two devices save at the
same moment. After each race the server copy must hold both edits and both devices must show
them; at the end a fresh device and a reloaded court device must still show them.

  1. a court point vs a Setup edit saved first (the reverse of F4's race);
  2. a Registration edit vs a court point saved first;
  3. a court point vs a Registration edit saved first;
  4. two Registration edits (two desks): F29, expected-failure check: the list changed on both
     sides, so the second save's change is dropped with a notice;
  5. a Special Award vs a court point saved first;
  6. a structural edit (Regenerate Single Division) vs a Registration edit saved first;
  7. a Registration edit vs a structural edit saved first;
  8. Undo vs another court's point saved first, then Redo the same way (F30, fixed: the undo
     was lost and the undone point came back, because an undo was not an action the rebase
     replayed): the point stays undone, then comes back once.
  9. Hansoku and Fusen-gachi vs another court's point saved first.
 10. Undo of a Next Match that created playoffs vs another court's point saved first (external
     review of PR #33): pool A of a 6-player round robin ends in a three-way tie, so its playoffs
     are inserted in the middle of the match list, before pool B. Before the fix the rebase
     replayed the Next Match's index patches backwards, leaving playoffs in and overwriting pool B.
 11. Redo and Undo on a court after the other court's playoffs reached it (external review of PR
     #33, no conflict): a split division, pool 1 on Court A before Court B's pool 2. Court B's
     Next Match ends pool 2 in a tie (playoffs), Court B undoes it; Court A's Next Match then
     inserts pool 1's playoffs before pool 2, and the live update reaches Court B. Before the fix
     Court B's Redo and Undo applied their patches at the old indexes and changed the wrong bouts.

Court vs court (both courts scoring) is e2e-two-court-sync-test.py; a Setup edit vs a court point
saved first (F4) is sync-remote-updates-test.py; a structural edit vs a court point is
structural-edit-conflict-test.py.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

OPEN_A, OPEN_B, KIDS, TIE, SPLIT = 'Open A', 'Open B', 'Kids', 'Tie', 'Split'


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Conflict Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': OPEN_A, 'format': 'Round Robin', 'court': 'A', 'entrants': people('A', 4)},
            {'name': OPEN_B, 'format': 'Round Robin', 'court': 'B', 'entrants': people('B', 4)},
            {'name': KIDS, 'format': 'Round Robin', 'court': 'A', 'entrants': people('K', 3)},
            {'name': TIE, 'format': 'Round Robin', 'court': 'A', 'entrants': people('T', 6)},
            {'name': SPLIT, 'format': 'Round Robin', 'court': 'split', 'entrants': people('S', 9)},
        ])
        director.save_now()
        director.wait_idle()
        devices = [director]
        for court in 'AB':
            app = KsmApp.open_device(browser, base, f'Court {court}', problems, app_path(tid, 'court', court))
            app.wait_generated()
            app.staff_login()
            app.open_court(court)
            devices.append(app)
        court_a, court_b = devices[1], devices[2]
        desk = KsmApp.open_device(browser, base, 'Desk', problems, app_path(tid))
        desk.wait_generated()
        desk.staff_login()
        devices.append(desk)
        for app in devices:
            app.watch_conflicts()
            app.socket_barrier()

        def server():
            return fetch_record(base, tid)

        def flush_edit(app):
            # These races test server ordering, not the edit debounce. Start the pending
            # save explicitly so each race does not spend seconds waiting for two timers.
            app.page.evaluate("""() => {
              if (!ksmSaveTimer && !ksmCloudTimer) return;
              clearTimeout(ksmSaveTimer); ksmSaveTimer=null;
              clearTimeout(ksmCloudTimer); ksmCloudTimer=null;
              KSMTest.saveNow('Conflict race');
            }""")

        def settle():
            """Every device idle and on the server's latest revision."""
            for app in devices:
                app.blur()
                flush_edit(app)
                app.wait_idle()
            rev = server()['revision']
            for app in devices:
                app.wait_revision(rev)
            return rev

        def race(second, second_edit, first, first_edit):
            """`second` edits but its save is held; `first` edits and saves; then `second`'s save
            goes on, meets the conflict and is rebased. Returns the server record afterwards."""
            rev = settle()
            seen = second.conflicts()
            second.hold_next_save()
            second_edit()
            flush_edit(second)
            second.wait_held_save()
            first_edit()
            first.blur()
            flush_edit(first)
            first.wait_idle()
            assert server()['revision'] > rev, f'{first.name}: its save did not reach the server first'
            second.release_save()
            second.wait_for(lambda: second.conflicts() > seen, message='the held save to meet the conflict')
            settle()
            return server()

        state = lambda record: record['payload']['state']
        competitor = lambda record, name: next((c for c in state(record)['competitors'] if c['name'] == name), None)
        dojo_on = lambda app, name: next((c['dojo'] for c in app.payload()['state']['competitors'] if c['name'] == name), None)
        scored = lambda record, div, side, letter: any(letter in (m.get(side) or []) for m in state(record)['allMatches'][div])

        # 1. A court point vs a Setup edit saved first.
        def rename():
            director.nav('setup')
            director.page.fill(sel('setup-tournament-name'), 'Renamed Cup')
            director.page.press(sel('setup-tournament-name'), 'Tab')
        record = race(court_a, lambda: court_a.score_point('W', 'M'), director, rename)
        assert record['payload']['setup']['tName'] == 'Renamed Cup', '1: the Setup edit was lost'
        assert scored(record, OPEN_A, 'wp', 'M'), '1: the court point was lost'
        court_a.wait_for(lambda: court_a.page.input_value(sel('setup-tournament-name')) == 'Renamed Cup', message='1: the rename on Court A')
        director.wait_for(lambda: scored({'payload': director.payload()}, OPEN_A, 'wp', 'M'), message='1: the point on the director device')

        # 2. A Registration edit vs a court point saved first.
        record = race(director, lambda: director.register('K 4', 'K Dojo', KIDS), court_b, lambda: court_b.score_point('R', 'K'))
        assert competitor(record, 'K 4'), '2: the new player was lost'
        assert scored(record, OPEN_B, 'rp', 'K'), '2: the court point was lost'
        court_b.wait_for(lambda: dojo_on(court_b, 'K 4') == 'K Dojo', message='2: the new player on Court B')

        # 3. A court point vs a Registration edit saved first.
        desk.nav('registration')
        record = race(court_b, lambda: court_b.score_point('W', 'D'), desk, lambda: desk.set_competitor_field('A 2', 'dojo', 'New Dojo'))
        assert competitor(record, 'A 2')['dojo'] == 'New Dojo', '3: the Registration edit was lost'
        assert scored(record, OPEN_B, 'wp', 'D'), '3: the court point was lost'
        court_b.wait_for(lambda: dojo_on(court_b, 'A 2') == 'New Dojo', message='3: the edit on Court B')

        # 4. Two Registration edits (two desks), different players: the list changed on both sides.
        director.nav('registration')
        record = race(desk, lambda: desk.register('K 5', 'K Dojo', KIDS), director, lambda: director.set_competitor_field('A 3', 'dojo', 'Other Dojo'))
        assert competitor(record, 'A 3')['dojo'] == 'Other Dojo', '4: the edit saved first was lost'
        notice = desk.page.inner_text(sel('toast'))
        # F29 (open): the desk's new player is dropped (the server's list is kept, with a notice).
        # When F29 is fixed (entries merged one by one), K 5 is kept: assert that and mark F29 fixed.
        assert competitor(record, 'K 5') is None, 'F29 fixed? K 5 survived the conflict: assert it is kept and mark F29 fixed'
        assert 'Registration' in notice and 'another device' in notice, f'4: the dropped edit is not reported: {notice!r}'
        desk.wait_for(lambda: dojo_on(desk, 'K 5') is None, message='4: the desk to show the kept list')

        # 5. A Special Award vs a court point saved first.
        record = race(director, lambda: director.add_award('Best Kiai', 'A 1', 'A Dojo'), court_a, lambda: court_a.score_point('R', 'M'))
        assert [(a.get('award'), a.get('name'), a.get('dojo')) for a in state(record).get('awards') or []] == [('Best Kiai', 'A 1', 'A Dojo')], \
            f'5: the award was lost: {state(record).get("awards")}'
        assert scored(record, OPEN_A, 'rp', 'M'), '5: the court point was lost'
        assert director.awards() == [('Best Kiai', 'A 1', 'A Dojo')], director.awards()
        court_a.wait_for(lambda: (court_a.payload()['state'].get('awards') or [{}])[0].get('award') == 'Best Kiai', message='5: the award on Court A')

        # 6. A structural edit (Regenerate Single Division, now with K 4) vs a Registration edit saved first.
        desk.nav('registration')
        record = race(director, lambda: director.regenerate_division(KIDS), desk, lambda: desk.set_competitor_field('B 2', 'dojo', 'Desk Dojo'))
        kids = [x['name'] if isinstance(x, dict) else x for pool in state(record)['pools'][KIDS] for x in pool['players']]
        assert 'K 4' in kids, f'6: the regenerated division was lost: {kids}'
        assert competitor(record, 'B 2')['dojo'] == 'Desk Dojo', '6: the Registration edit was lost'
        assert not director.seen_dialogs, director.seen_dialogs
        desk.wait_for(lambda: any('K 4' in pool['players'] for pool in desk.structure()[KIDS]['pools']),
                      message='6: the regenerated division on the desk')

        # 7. A Registration edit vs a structural edit saved first.
        revision_before = state(record).get('managementRevision', 0)
        record = race(desk, lambda: desk.set_competitor_field('B 3', 'dojo', 'Late Dojo'), director, lambda: director.regenerate_division(KIDS))
        assert competitor(record, 'B 3')['dojo'] == 'Late Dojo', '7: the Registration edit was lost'
        assert state(record).get('managementRevision', 0) > revision_before, '7: the regenerate was lost'

        # 8. Undo vs another court's point saved first, then Redo the same way (F30, fixed).
        court_a.score_point('W', 'K')
        settle()
        assert scored(server(), OPEN_A, 'wp', 'K'), '8: the point to undo was not saved'
        record = race(court_a, court_a.undo, court_b, lambda: court_b.score_point('R', 'D'))
        assert scored(record, OPEN_B, 'rp', 'D'), '8: the other court\'s point was lost'
        # Before F30 was fixed the rebase replayed only new court actions, so the undone K came back.
        assert not scored(record, OPEN_A, 'wp', 'K'), '8: F30: the undone point came back on the server'
        court_a.wait_for(lambda: 'K' not in court_a.court_screen()['white_points'], message='8: the undone point to stay gone on Court A')
        court_b.wait_for(lambda: not scored({'payload': court_b.payload()}, OPEN_A, 'wp', 'K'), message='8: the undo on Court B')
        record = race(court_a, court_a.redo, court_b, lambda: court_b.score_point('W', 'K'))
        assert scored(record, OPEN_B, 'wp', 'K'), '8: the other court\'s point was lost (Redo race)'
        kotes = sum((m.get('wp') or []).count('K') for m in state(record)['allMatches'][OPEN_A])
        assert kotes == 1, f'8: F30: the redone point is not back exactly once on the server ({kotes})'
        court_a.wait_for(lambda: 'K' in court_a.court_screen()['white_points'], message='8: the redone point on Court A')

        # 9. Hansoku and Fusen-gachi vs another court's point saved first.
        def hansoku_and_fusen():
            court_a.hansoku('R')
            court_a.fusen_gachi('R')  # Red forfeits: White gets F F
        record = race(court_a, hansoku_and_fusen, court_b, lambda: court_b.score_point('W', 'T'))
        assert scored(record, OPEN_B, 'wp', 'T'), '9: the other court\'s point was lost'
        assert any(m.get('wp') == ['F', 'F'] and m.get('rt') == 1 and not m.get('done') for m in state(record)['allMatches'][OPEN_A]), \
            f'9: the hansoku or the fusen-gachi was lost: {[(m.get("wp"), m.get("rp"), m.get("rt")) for m in state(record)["allMatches"][OPEN_A]]}'
        court_b.wait_for(lambda: any(m.get('wp') == ['F', 'F'] for m in court_b.all_matches()[OPEN_A]), message='9: the fusen-gachi on Court B')

        # 10. Undo of a Next Match that created playoffs vs another court's point saved first.
        court_a.switch_division(TIE)
        tie_matches = lambda record: [(m.get('pool'), m.get('white'), m.get('red'), bool(m.get('done')), bool(m.get('tiebreak')))
                                      for m in state(record)['allMatches'][TIE]]
        before_tie = tie_matches(server())
        for _ in range(3):  # pool A's three bouts, all drawn: a three-way tie, so the third Next Match adds playoffs
            court_a.next_match(settle=True)
        settle()
        played = tie_matches(server())
        assert [m[0] for m in played if m[4]] == ['A', 'A', 'A'] and played[-4][0] == 'B', f'10: the playoffs were not inserted before pool B: {played}'
        record = race(court_a, court_a.undo, court_b, lambda: court_b.score_point('R', 'T'))
        assert scored(record, OPEN_B, 'rp', 'T'), '10: the other court\'s point was lost'
        expected = [(p, w, r, done or (p == 'A' and i < 2), t) for i, (p, w, r, done, t) in enumerate(before_tie)]
        assert tie_matches(record) == expected, f'10: the undone Next Match left its playoffs or changed pool B:\n{tie_matches(record)}\nexpected\n{expected}'
        court_a.wait_for(lambda: court_a.current_match() and (court_a.current_match()['white'], court_a.current_match()['red']) == ('T 5', 'T 1'),
                         message='10: pool A\'s last bout back on Court A')

        # 11. Redo and Undo on Court B after Court A's playoffs reached it (no conflict).
        court_a.switch_division(SPLIT)
        court_b.switch_division(SPLIT)
        settle()
        split_matches = lambda record: [(m.get('pool'), m.get('white'), m.get('red'), bool(m.get('done')), bool(m.get('tiebreak')))
                                        for m in state(record)['allMatches'][SPLIT]]
        on_court = lambda record, court: [m.get('pool') for m in state(record)['allMatches'][SPLIT] if m.get('court') == court and not m.get('championship')]
        pool_a, pool_b = on_court(server(), 'A')[0], on_court(server(), 'B')[0]
        for _ in range(3):  # Court B's first pool, all drawn: its third Next Match adds the playoffs
            court_b.next_match(settle=True)
        settle()
        with_b_playoffs = split_matches(server())
        b_playoffs = [m for m in with_b_playoffs if m[4] and m[0] == pool_b]
        assert b_playoffs, f'11: no playoffs for Court B\'s pool: {with_b_playoffs}'
        court_b.undo()
        settle()
        assert not any(m[4] for m in split_matches(server())), f'11: the Undo left playoffs: {split_matches(server())}'
        for _ in range(3):  # Court A's pool (before Court B's in the list): its playoffs go in before Court B's bouts
            court_a.next_match(settle=True)
        settle()
        shifted = split_matches(server())
        first_b = next(i for i, m in enumerate(shifted) if m[0] == pool_b)
        assert any(m[4] and m[0] == pool_a for m in shifted[:first_b]), f'11: Court A\'s playoffs are not before Court B\'s pool: {shifted}'
        court_b.wait_revision(server()['revision'])
        court_b.redo()
        settle()
        last_b = max(i for i, m in enumerate(shifted) if m[0] == pool_b and not m[4])
        expected = shifted[:last_b] + [shifted[last_b][:3] + (True, False)] + b_playoffs + shifted[last_b + 1:]
        assert split_matches(server()) == expected, f'11: Court B\'s Redo after the list shifted:\n{split_matches(server())}\nexpected\n{expected}'
        court_b.undo()
        settle()
        assert split_matches(server()) == shifted, f'11: Court B\'s Undo after the list shifted:\n{split_matches(server())}\nexpected\n{shifted}'
        court_b.wait_for(lambda: court_b.current_match() and (court_b.current_match()['white'], court_b.current_match()['red']) == shifted[last_b][1:3],
                         message='11: Court B\'s pool\'s last bout back on Court B')

        # Survives a reload: a fresh device and Court A reloaded show the saved edits.
        final = server()
        fresh = KsmApp.open_device(browser, base, 'Fresh', problems, app_path(tid))
        fresh.wait_revision(final['revision'])
        court_a.reload()
        court_a.wait_revision(final['revision'])
        for app in (fresh, court_a):
            pl = app.payload()
            assert pl['setup']['tName'] == 'Renamed Cup', f'{app.name}: {pl["setup"]["tName"]}'
            got = {c['name']: c['dojo'] for c in pl['state']['competitors']}
            assert (got.get('K 4'), got.get('A 2'), got.get('A 3'), got.get('B 2'), got.get('B 3')) == \
                ('K Dojo', 'New Dojo', 'Other Dojo', 'Desk Dojo', 'Late Dojo'), f'{app.name}: {got}'
            assert (pl['state'].get('awards') or [{}])[0].get('award') == 'Best Kiai', f'{app.name}: awards'
            assert pl['state']['allMatches'] == final['payload']['state']['allMatches'], f'{app.name}: matches differ from the server'

        assert not problems, '\n'.join(problems)
        print(f'PASS edit conflicts: court vs Setup, hansoku/fusen-gachi vs the other court, Registration vs court (both ways), awards vs court, structural vs Registration '
              f'(both ways), Undo and Redo vs another court (F30, also of a Next Match with playoffs) kept both edits; Redo/Undo after the other court\'s playoffs shifted the list; two Registration edits (F29) pinned '
              f'({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
