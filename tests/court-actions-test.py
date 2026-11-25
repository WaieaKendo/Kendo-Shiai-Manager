"""Court screen buttons: Undo, Redo, Hansoku, Fusen-gachi and Next Match, on a cloud tournament.

One scorekeeper device against a throwaway `wrangler dev` presses the court
buttons (test IDs via tests/ksm_app.py) and checks the court screen and the
server copy:
  * Undo/Redo labels stay "Undo"/"Redo"; buttons are enabled only with history;
  * points, hansoku and fusen-gachi are undoable and redoable; a new action clears Redo;
  * two hansoku give the opponent one "H" point (four give two, and win the match);
  * fusen-gachi gives the other side two "F" points; Cancel changes nothing;
  * Next Match is one undoable action (completion + moving on); Undo stays on the
    division-complete screen and reopens the last match (F2, fixed);
  * Court A and Court B keep separate histories, limited to 100 actions each;
  * history is saved as small patches and entries from older versions are dropped on load.
"""
import json
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, put_record, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        app = KsmApp.open_device(browser, base, 'Court', problems, tournament_name='Court Actions Cup')
        page = app.page
        tid = app.create_tournament()
        app.configure([
            {'name': 'Open A', 'format': 'Round Robin', 'court': 'A', 'entrants': people('A', 3)},
            {'name': 'Open B', 'format': 'Round Robin', 'court': 'B', 'entrants': people('B', 3)},
        ])
        app.save_now()
        app.wait_idle()
        app.open_court('A')

        label = lambda testid: page.inner_text(sel(testid)).strip()
        enabled = lambda testid: page.is_enabled(sel(testid))
        squash = lambda text: ''.join(text.split())
        points = lambda: (squash(app.court_screen()['white_points']), squash(app.court_screen()['red_points']))
        hansoku = lambda: (squash(page.inner_text(sel('court-white-hansoku'))), squash(page.inner_text(sel('court-red-hansoku'))))

        def check_labels():
            assert (label('undo'), label('redo')) == ('Undo', 'Redo'), f'labels changed: {label("undo")!r} / {label("redo")!r}'

        # --- Points: Undo / Redo --------------------------------------------------------
        check_labels()
        assert not enabled('undo') and not enabled('redo'), 'Undo/Redo enabled with no history'
        first = app.current_match()
        app.score_point('W', 'M')
        app.score_point('W', 'K')
        assert points() == ('MK', ''), points()
        app.undo()
        assert points() == ('M', '') and enabled('redo'), points()
        check_labels()
        app.undo()
        assert points() == ('', '') and not enabled('undo'), points()
        app.redo()
        app.redo()
        assert points() == ('MK', '') and not enabled('redo'), points()
        check_labels()
        app.undo()
        app.score_point('R', 'D')
        assert points() == ('M', 'D') and not enabled('redo'), 'a new action must clear Redo'
        app.undo()
        app.redo()
        assert points() == ('M', 'D'), points()

        # --- Hansoku: two give the opponent one point --------------------------------------
        app.hansoku('W')
        assert hansoku() == ('△', '') and points() == ('M', 'D'), (hansoku(), points())
        app.hansoku('W')
        assert hansoku() == ('△△', '') and points() == ('M', 'DH'), (hansoku(), points())
        app.undo()
        assert hansoku() == ('△', '') and points() == ('M', 'D'), 'Undo must remove the hansoku and its point'
        app.redo()
        assert points() == ('M', 'DH'), points()

        # --- Next Match is one undoable action ----------------------------------------------
        app.next_match()
        second = app.current_match()
        assert (second['white'], second['red']) != (first['white'], first['red']), 'Next Match did not move on'
        assert points() == ('', '') and hansoku() == ('', ''), 'score not reset for the next match'
        app.undo()
        back = app.current_match()
        assert (back['white'], back['red']) == (first['white'], first['red']) and points() == ('M', 'DH'), \
            f'Undo of Next Match should reopen {first["white"]} vs {first["red"]} with its score, got {back}'
        app.redo()
        assert (app.current_match()['white'], app.current_match()['red']) == (second['white'], second['red'])
        app.wait_idle()
        done = [m for m in fetch_record(base, tid)['payload']['state']['allMatches']['Open A'] if m.get('done')]
        assert len(done) == 1 and done[0]['completedResult']['winner'] == first['red'], \
            f'first match should be done, won by {first["red"]} (D + hansoku point beats M): {done}'

        # --- Four hansoku: two points, the opponent wins ----------------------------------
        for _ in range(4):
            app.hansoku('R')
        assert hansoku() == ('', '△△△△') and points() == ('HH', ''), (hansoku(), points())
        app.next_match()
        third = app.current_match()

        # --- Fusen-gachi ---------------------------------------------------------------------
        app.click('fusen-gachi')
        page.wait_for_selector(sel('fusen-cancel'), state='visible')
        app.click('fusen-cancel')
        page.wait_for_selector(sel('fusen-cancel'), state='hidden')
        assert points() == ('', '') and app.current_match()['white'] == third['white'], 'Cancel changed the match'
        app.score_point('W', 'M')
        app.fusen_gachi('R')  # Red forfeited
        assert points() == ('FF', ''), f'fusen-gachi for White should replace the score with F F, got {points()}'
        app.undo()
        assert points() == ('M', ''), points()
        app.redo()

        # --- Per-court history ---------------------------------------------------------------
        app.open_court('B')
        assert not enabled('undo'), 'Court B shows Court A history'
        app.score_point('R', 'M')
        app.open_court('A')
        assert enabled('undo') and points() == ('FF', ''), 'Court A lost its match or history'
        app.undo()  # Court A's fusen-gachi, not Court B's point
        assert points() == ('M', ''), points()
        app.redo()
        app.open_court('B')
        assert points() == ('', 'M'), points()
        app.open_court('A')

        app.next_match()
        assert app.court_screen()['complete'], 'Open A should be complete after three matches'
        app.wait_idle()
        matches = fetch_record(base, tid)['payload']['state']['allMatches']['Open A']
        by_pair = {(m['white'], m['red']): m for m in matches}
        assert by_pair[(second['white'], second['red'])]['completedResult']['winner'] == second['white'], 'hansoku win not recorded'
        assert by_pair[(third['white'], third['red'])]['wp'] == ['F', 'F'], 'fusen-gachi not recorded'
        # F2 (fixed): Undo stays on the division-complete screen and reopens the last match.
        assert enabled('undo') and page.is_visible(sel('undo')), 'Undo hidden after the last match (F2)'
        assert not page.is_visible(sel('next-match')) and not page.is_visible(sel('fusen-gachi')), 'Next Match/Fusen-gachi shown when complete'
        app.undo()
        assert not app.court_screen()['complete'] and points() == ('FF', ''), 'Undo did not reopen the last match'
        app.redo()
        assert app.court_screen()['complete'], 'Redo did not complete Open A again'
        app.open_court('B')

        # --- History limit: 100 actions per court --------------------------------------------
        for _ in range(105):
            app.score_point('W', 'T')
        undone = 0
        while enabled('undo') and undone < 200:
            app.undo()
            undone += 1
        assert undone == 100, f'expected 100 undoable actions on Court B, got {undone}'
        assert points() == ('TTTTT', 'M'), f'the 6 oldest actions should remain: {points()}'
        app.wait_idle()

        # --- Stored as small patches; entries from older versions are dropped ------------------
        app.open_court('A')
        app.wait_idle()
        record = fetch_record(base, tid)
        history = record['payload']['state']['courtActionHistory']
        entries = history['A'] + history['B']
        assert entries and all(e.get('format') == 'patch-v1' for e in entries), 'history entries are not patches'
        biggest = max(len(json.dumps(e)) for e in entries)
        assert biggest < 20000, f'a history entry is {biggest} bytes: snapshots instead of patches?'
        payload = record['payload']
        payload['state']['courtActionHistory']['A'] = [{'label': 'Legacy', 'before': {'allMatches': {}}, 'after': {}}]
        payload['state']['courtRedoHistory']['A'] = []
        put_record(base, tid, payload, record['revision'])
        app.wait_revision(record['revision'] + 1)
        app.wait_for(lambda: not enabled('undo'), message='legacy history to be dropped on Court A')
        assert app.court_screen()['complete'], 'loading legacy history changed the match state'

        assert not problems, '\n'.join(problems)
        print(f'PASS court actions: undo/redo, hansoku, fusen-gachi, next match, per-court history, limit 100, patches ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
