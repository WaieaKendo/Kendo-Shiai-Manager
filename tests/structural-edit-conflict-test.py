"""A structural director edit survives a save conflict (F10).

Director and a Court B scorekeeper against a throwaway `wrangler dev`: "Pools Open" (round robin
of 8, two pools, Court A) and "Court B Open" (round robin of 3, Court B). Each time the director
moves a player in Edit Pool and saves (Save Pool Changes); before that save reaches the server,
another device saves first, so the director's save conflicts (409) and is rebased:

  1. the other save changed another division (a point on Court B): the pool edit is replayed
     onto the server copy, without a question; both reach the server and the court device;
  2. the other save changed the same division (a point in Pools Open): the director is asked
     "Re-apply your change to Pools Open?"; Cancel keeps the other device's version (the point)
     and says the change was not saved;
  3. the same, OK: the director's pools replace the other device's version (the point is gone,
     as the question says).

Before F10 the rebase kept the server's pools and matches in all three, without a word.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, put_record, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

DIV, OTHER = 'Pools Open', 'Court B Open'
QUESTION = 'Re-apply your change to'


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def names(pools):
    """Pool player names from a server payload's pools, or from KsmApp.structure()."""
    return [[p if isinstance(p, str) else p['name'] for p in pool['players']] for pool in pools]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Structural Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': DIV, 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 8)},
            {'name': OTHER, 'format': 'Round Robin', 'court': 'B', 'entrants': people('B', 3)},
        ])
        director.save_now()
        director.wait_idle()
        court = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'B'))
        court.wait_generated()
        court.staff_login()
        court.open_court('B')
        court.wait_idle()

        def race(server_edit):
            """Director: Edit Pool, move a player, Save; another device saves `server_edit` first."""
            director.wait_idle()
            director.wait_revision(fetch_record(base, tid)['revision'])
            director.pools(DIV)
            director.click('pool-edit')
            director.pool_edit_move(1)
            director.click('pool-edit-save')
            edited = names(director.structure()[DIV]['pools'])
            record = fetch_record(base, tid)
            before = names(record['payload']['state']['pools'][DIV])
            assert edited != before, 'the pool edit changed nothing'
            server_edit(record['payload']['state']['allMatches'])
            put_record(base, tid, record['payload'], record['revision'])
            time.sleep(4)
            director.wait_idle()
            assert director.diagnostics().get('rebaseAttempt', 0) >= 1, 'the director save did not conflict: the test no longer races'
            return before, edited, fetch_record(base, tid)

        def first_open(matches, div):
            return next(m for m in matches[div] if not m.get('done'))

        # 1. Another division changed meanwhile: replayed, no question.
        point = lambda all_matches: first_open(all_matches, OTHER).update(wp=['M'])
        _, edited, record = race(point)
        server = record['payload']['state']
        assert names(server['pools'][DIV]) == edited, f'F10: the pool edit was lost in the conflict: server {names(server["pools"][DIV])}, edited {edited}'
        assert any(m.get('wp') == ['M'] for m in server['allMatches'][OTHER]), 'the Court B point was lost'
        assert names(director.structure()[DIV]['pools']) == edited, 'the director screen lost the pool edit'
        assert not director.seen_dialogs, director.seen_dialogs
        court.wait_revision(record['revision'])
        court.wait_for(lambda: names(court.structure()[DIV]['pools']) == edited, message='the pool edit to reach Court B')

        # 2. The same division changed meanwhile: asked; Cancel keeps the other device's version.
        director.expect_dialog(QUESTION, accept=False)
        same_division = lambda all_matches: first_open(all_matches, DIV).update(rp=['K'])
        before, edited, record = race(same_division)
        assert director.seen_dialogs and director.seen_dialogs[-1].startswith(f'{QUESTION} {DIV}?'), director.seen_dialogs
        server = record['payload']['state']
        assert names(server['pools'][DIV]) == before and any(m.get('rp') == ['K'] for m in server['allMatches'][DIV]), \
            'Cancel: the other device\'s version of the division should be kept'
        notice = director.page.inner_text(sel('toast'))
        assert 'not saved' in notice and DIV in notice, f'Cancel: no notice that the change was not saved: {notice!r}'
        director.wait_for(lambda: names(director.structure()[DIV]['pools']) == before, message='the director screen to show the kept version')

        # 3. The same, OK: the director's pools replace the other device's version.
        director.expect_dialog(QUESTION, accept=True)
        asked = len(director.seen_dialogs)
        _, edited, record = race(lambda all_matches: first_open(all_matches, DIV).update(wp=['D']))  # a new point (the K of 2. is on the server)
        assert len(director.seen_dialogs) == asked + 1, director.seen_dialogs
        server = record['payload']['state']
        assert names(server['pools'][DIV]) == edited, f'OK: the pool edit was not re-applied: server {names(server["pools"][DIV])}, edited {edited}'
        assert not any(m.get('rp') or m.get('wp') for m in server['allMatches'][DIV]), 'OK: the other device\'s points in the rebuilt division should be gone'
        assert any(m.get('wp') == ['M'] for m in server['allMatches'][OTHER]), 'OK: the other division keeps its point'
        court.wait_revision(record['revision'])
        court.wait_for(lambda: names(court.structure()[DIV]['pools']) == edited, message='the re-applied edit to reach Court B')

        assert not problems, '\n'.join(problems)
        print(f'PASS structural edit on a save conflict: replayed when the other save changed another division; '
              f'asked when it changed the same one (Cancel keeps theirs with a notice, OK re-applies) ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
