"""Undo after a division's last match (finding F2), on the offline app (staff session).

For a round-robin pool division (Court A) and a single-elimination final (Court B):
  * after Next Match on the last match the division-complete panel shows, with Undo
    and Redo still visible in the action row (where it always is: under the header, above the
    panel); Fusen-gachi and Next Match are hidden;
  * Undo reopens that last match with its score, the division is no longer complete and
    its placements are withdrawn; the court screen is back to scoring it;
  * Redo completes it again with the same placements;
  * a wrong final result can be corrected: Undo, Undo the point, score the other side,
    Next Match -> the other competitor wins (and, in the final, becomes champion).
"""
import re
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

POOL, ELIM = 'Pool Div', 'Elim Div'


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def number(name):
    return int(re.search(r'(\d+)$', name).group(1))


def main():
    started = time.time()
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: d.dismiss())
        app = KsmApp.local(page)
        app.configure([
            {'name': POOL, 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
            {'name': ELIM, 'format': 'Single Elimination', 'court': 'B', 'entrants': people('E', 4)},
        ])
        visible = lambda testid: page.is_visible(f'#score {sel(testid)}')
        enabled = lambda testid: page.is_enabled(f'#score {sel(testid)}')
        squash = lambda text: ''.join(text.split())

        def finish(division):
            """Lower number always wins by Men; returns the last match played."""
            last = None
            for _ in range(12):
                m = app.current_match()
                if m is None:
                    break
                assert m['division'] == division or division in m['meta'], (division, m)
                app.score_point('W' if number(m['white']) < number(m['red']) else 'R', 'M')
                last = m
                app.next_match()
            assert app.court_screen()['complete'], f'{division} did not complete'
            return last

        def check_complete_screen(division):
            s = app.court_screen()
            assert s['complete'] and s['placements'], f'{division}: no division-complete panel: {s}'
            assert visible('undo') and enabled('undo'), f'{division}: Undo hidden or disabled after the last match (F2)'
            assert visible('redo') and not enabled('redo'), f'{division}: Redo should be visible and disabled'
            assert not visible('next-match') and not visible('fusen-gachi'), f'{division}: Next Match/Fusen-gachi shown when complete'
            panel = page.locator(f'#score {sel("division-complete")}').bounding_box()
            undo = page.locator(f'#score {sel("undo")}').bounding_box()
            assert undo['y'] + undo['height'] <= panel['y'] + 1, f'{division}: Undo should sit above the results panel'
            return s['placements']

        for court, division in (('A', POOL), ('B', ELIM)):
            app.open_court(court)
            last = finish(division)
            placements = check_complete_screen(division)
            before = app.final_state()[division]
            assert before['complete'] and before['placements'], before

            # Undo reopens the last match with its score and withdraws the placements.
            app.undo()
            m = app.current_match()
            assert m and (m['white'], m['red']) == (last['white'], last['red']), f'{division}: Undo did not reopen the last match: {m}'
            winner_side = 'white' if number(last['white']) < number(last['red']) else 'red'
            loser_side = 'red' if winner_side == 'white' else 'white'
            assert squash(m[f'{winner_side}_points']) == 'M' and squash(m[f'{loser_side}_points']) == '', m
            assert visible('next-match') and visible('fusen-gachi') and enabled('redo'), f'{division}: court screen not back to scoring'
            after = app.final_state()[division]
            assert not after['complete'] and after['placements'] != before['placements'], f'{division}: placements not withdrawn: {after}'
            reopened = [x for x in after['matches'] if not x.get('done')]
            assert len(reopened) == 1, f'{division}: exactly the last match should be open again: {reopened}'

            # Redo completes it again.
            app.redo()
            assert check_complete_screen(division) == placements
            assert app.final_state()[division]['placements'] == before['placements']

            # Correct a wrong result: the other side wins the last match instead.
            app.undo()
            app.undo()  # the point
            assert squash(app.current_match()[f'{winner_side}_points']) == '', 'point not undone'
            app.score_point('W' if loser_side == 'white' else 'R', 'K')
            app.next_match()
            played = [x for x in app.final_state()[division]['matches'] if (x['white'], x['red']) == (last['white'], last['red']) and not x['tiebreak']]
            assert played and played[0]['winner'] == last[loser_side], f'{division}: corrected result not recorded: {played}'
            if division == POOL:
                finish(division)  # a three-way tie now adds tiebreak matches
            corrected = check_complete_screen(division)
            if division == ELIM:
                assert corrected != placements and corrected[0][1] == last[loser_side], \
                    f'final corrected: {last[loser_side]} should now be first, got {corrected}'

        assert not errors, errors
        print(f'PASS undo after division complete: pool and elimination final undo/redo/correct ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
