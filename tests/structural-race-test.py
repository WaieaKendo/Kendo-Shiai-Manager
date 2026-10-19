"""A structural No Show and a Generate racing a court save (test audit, issue #59, ranks 7 and 15).

Director and the two court scorekeepers against a throwaway `wrangler dev`. Divisions "Kids"
(round robin of 4, Court A) and "Open" (round robin of 4, Court B), generated. Each race holds the
director's save at the network (KsmApp.hold_next_save()) while a court saves first, then releases
it, so it meets a conflict (HTTP 409) and is rebased (F10: structural edits are replayed division
by division). structural-edit-conflict-test.py does the same for Edit Pool; this is the No Show
(the division's pool is rebuilt for its new size, #24) and Generate Tournament:

  1. No Show in Kids vs a point on Court B in Open: replayed silently; the server holds both and
     both courts show them.
  2. No Show in Kids vs a point on Court A in Kids (the F10 question): the director is asked
     whether to re-apply; Cancel keeps the court's version, says the change was not saved, and the
     player's status is back to Checked In on the server and on the director's screen.
  3. The same, OK: the No Show is re-applied, the point is deleted, as the question says.
  4. Generate Tournament vs a point on Court B in Open (Generate rebuilds every division; the
     others come out as they were): asked about Open only. Cancel keeps the point, OK rebuilds Open.
At the end both courts are reloaded and a fresh device opens the tournament: all show the server.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel, app_path
from ksm_browser import launch_chromium
from ksm_races import Races, people, state_of
from ksm_server import local_worker

KIDS, OPEN = 'Kids', 'Open'
QUESTION = 'Re-apply your change to'


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Race Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': KIDS, 'format': 'Round Robin', 'court': 'A', 'entrants': people('K', 4)},
            {'name': OPEN, 'format': 'Round Robin', 'court': 'B', 'entrants': people('O', 4)},
        ])
        director.save_now()
        director.wait_idle()
        court_a = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'a'))
        court_b = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'b'))
        for app, court in ((court_a, 'A'), (court_b, 'B')):
            app.wait_generated()
            app.staff_login()
            app.open_court(court)
        races = Races(base, tid, [director, court_a, court_b])

        def no_show(name):
            director.expect_dialog('Mark ', accept=True)  # owner decision 18: a No Show after generation asks first
            director.nav('registration')
            director.click('reg-tab-individual')
            rows = director.page.locator(sel('reg-row'))
            for i in range(rows.count()):
                if rows.nth(i).locator(sel('reg-name')).input_value() == name:
                    rows.nth(i).locator(sel('reg-status')).click()  # Checked In -> No Show
                    return
            raise AssertionError(f'no registration row for {name}')

        def generate():
            director.nav('registration')
            director.click('generate-button')
            director.page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
            director.click('generate-confirm')

        pools = lambda record, div: [[x['name'] if isinstance(x, dict) else x for x in pool['players']] for pool in state_of(record)['pools'][div]]
        played = lambda record, div: [(m['white'], m['red'], m.get('wp'), m.get('rp')) for m in state_of(record)['allMatches'][div] if m.get('wp') or m.get('rp')]
        count = lambda record, div: len(state_of(record)['allMatches'][div])
        status = lambda payload, name: next(c['status'] for c in payload['state']['competitors'] if c['name'] == name)
        questions = lambda: [d for d in director.seen_dialogs if d.startswith(QUESTION)]
        all_pools = lambda app, div: sorted(sum(app.pools(div).values(), []))

        # 1. A No Show in Kids vs a point in Open: replayed, no question.
        record = races.race(director, lambda: no_show('K 4'), court_b, lambda: court_b.score_point('W', 'M'))
        assert pools(record, KIDS) == [['K 1', 'K 2', 'K 3']] and count(record, KIDS) == 3, f'1: the No Show was lost: {pools(record, KIDS)}'
        assert played(record, OPEN) == [('O 1', 'O 2', ['M'], [])], f'1: the Court B point was lost: {played(record, OPEN)}'
        assert not questions(), f'1: nothing changed in Kids on the other side, so there is nothing to ask: {questions()}'
        assert all_pools(court_a, KIDS) == ['K 1', 'K 2', 'K 3'], '1: Court A still lists K 4'
        court_a.open_court('A')
        court_b.wait_for(lambda: court_b.all_matches()[OPEN][0].get('wp') == ['M'], message='1: the point on Court B')
        assert status(director.payload(), 'K 4') == 'NoShow', '1: the No Show status was lost'

        # 2. A No Show in Kids vs a point in Kids: asked; Cancel keeps the court's version.
        director.expect_dialog(QUESTION, accept=False)
        record = races.race(director, lambda: no_show('K 3'), court_a, lambda: court_a.score_point('W', 'K'))
        assert len(questions()) == 1 and questions()[0].startswith(f'{QUESTION} {KIDS}?'), f'2: {questions()}'
        assert pools(record, KIDS) == [['K 1', 'K 2', 'K 3']] and played(record, KIDS) == [('K 1', 'K 2', ['K'], [])], \
            f'2: Cancel should keep the other device\'s version of Kids: {pools(record, KIDS)} {played(record, KIDS)}'
        notice = director.page.inner_text(sel('toast'))
        assert 'not saved' in notice and KIDS in notice, f'2: no notice that the change was not saved: {notice!r}'
        assert status({'state': state_of(record)}, 'K 3') == 'Checked' and status(director.payload(), 'K 3') == 'Checked', \
            '2: the cancelled No Show is still on the player\'s status'
        assert court_a.court_screen()['white_points'] == 'K', '2: Court A lost its point'

        # 3. The same, OK: the No Show replaces the other device's version, the point is deleted.
        director.expect_dialog(QUESTION, accept=True)
        record = races.race(director, lambda: no_show('K 2'), court_a, lambda: court_a.score_point('R', 'M'))
        assert len(questions()) == 2, f'3: {questions()}'
        assert pools(record, KIDS) == [['K 1', 'K 3']] and count(record, KIDS) == 1, f'3: the No Show was not re-applied: {pools(record, KIDS)}'
        assert played(record, KIDS) == [], f'3: the other device\'s points should be gone: {played(record, KIDS)}'
        assert status({'state': state_of(record)}, 'K 2') == 'NoShow', '3: the status'
        court_a.wait_for(lambda: (court_a.current_match() or {}).get('white') == 'K 1' and court_a.current_match().get('red') == 'K 3',
                         message='3: the rebuilt pool\'s only bout on Court A')

        # 4. Generate Tournament vs a point on Court B in Open: asked about Open only.
        director.expect_dialog(QUESTION, accept=False)
        record = races.race(director, generate, court_b, lambda: court_b.score_point('R', 'K'))
        assert len(questions()) == 3 and questions()[-1].startswith(f'{QUESTION} {OPEN}?'), f'4: {questions()[-1:]}'
        assert played(record, OPEN) == [('O 1', 'O 2', ['M'], ['K'])], \
            f'4: Cancel should keep the Court B point: {played(record, OPEN)}'
        assert 'not saved' in director.page.inner_text(sel('toast')), '4: no notice that Generate was not saved'
        director.expect_dialog(QUESTION, accept=True)
        record = races.race(director, generate, court_b, lambda: court_b.score_point('W', 'D'))
        assert len(questions()) == 4, f'4: {questions()}'
        assert played(record, OPEN) == [] and count(record, OPEN) == 6, f'4: OK should rebuild Open, deleting the points: {played(record, OPEN)}'
        assert pools(record, KIDS) == [['K 1', 'K 3']], f'4: Kids came out differently: {pools(record, KIDS)}'

        # Survives a reload: both courts and a fresh device show the server's copy.
        final = races.settle() and races.server()
        court_a.reload()
        court_b.reload()
        fresh = KsmApp.open_device(browser, base, 'Fresh', problems, app_path(tid))
        for app in (court_a, court_b, fresh):
            app.wait_revision(final['revision'])
            assert app.payload()['state']['allMatches'] == state_of(final)['allMatches'], f'{app.name}: matches differ from the server'
            assert app.payload()['state']['pools'] == state_of(final)['pools'], f'{app.name}: pools differ from the server'
        assert not problems, '\n'.join(problems)
        print(f'PASS structural race: a No Show replayed silently beside a point in another division, asked beside one in its own '
              f'(Cancel keeps theirs, OK re-applies); Generate asked only about the division a court changed ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
