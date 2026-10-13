"""Division complete: "Continue to <next division>" on the court screen (owner decision 7, issue #31).

When a court's division completes, the court screen shows a box: "<Division> is complete. Final
results are showing on the Court A TV." with [Continue to <next division> →] and [Keep showing
results]. The next division is the next one in the court's division list (Setup's running order,
filtered to the court like the court dropdown) that has a match ready on this court: finished
divisions, divisions not generated yet and divisions waiting on the other court are skipped.
Continue is the court's existing "choose division" action (no new shared state), so the TV and
Live Scores follow. Keep showing results leaves the Final Results on the TV and keeps a "Close TV
results" control on the court screen that does the same move-on; no timer. With nothing left:
"All divisions on Court A are done."

Against a throwaway `wrangler dev`: a director, a Court A scorekeeper, a Court B scorekeeper, the
Court A TV and a Live Scores device. Running order (Setup): Kids, Done, Split, Late, Masters on
Court A (Split is a single elimination split between the courts; Late is added after generation).
Done is played first (finished), Split's Court A matches next (it then waits for Court B), then
Kids: its box offers Masters. Masters done: all done; once Court B plays Split's other match,
Court A is offered Split.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, n):
    return [{'name': f'{prefix} {i}', 'dojo': f'{prefix} Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(1, n + 1)]


def box(app):
    """The court screen's division-complete box: its message and buttons."""
    return app.page.evaluate("""() => {
      const root = document.querySelector('#score [data-testid="court-continue-box"]');
      if (!root) return null;
      const t = id => root.querySelector(`[data-testid="${id}"]`)?.textContent.trim() || null;
      return {message: t('court-continue-message'), next: t('court-continue'), keep: t('court-keep-results'),
              close: t('court-close-results'), done: t('court-all-done')};
    }""")


def play_ready_on_court(app, division):
    """Play every match of `division` ready on the court (White wins each by Men)."""
    played = 0
    while True:
        m = app.current_match()
        if not m or app.court_screen()['division'] != division:
            return played
        app.score_point('W', 'M')
        app.next_match(settle=True)
        played += 1


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Continue Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Kids', 'format': 'Round Robin', 'court': 'A', 'entrants': people('K', 2)},
            {'name': 'Done', 'format': 'Round Robin', 'court': 'A', 'entrants': people('D', 2)},
            {'name': 'Split', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('S', 4)},
            {'name': 'Masters', 'format': 'Round Robin', 'court': 'A', 'entrants': people('M', 2)},
        ])
        # Late: switched on after generation (not generated), moved before Masters in the running order.
        director.nav('setup')
        director.page.fill(sel('custom-division-name'), 'Late')
        director.page.select_option(sel('custom-division-court'), value='A')
        director.click('custom-division-add')
        director.wait_for(lambda: 'Late' in director.setup_division_names(), message='Late added')
        director.move_division('Late', 'up')
        assert director.setup_division_names()[:5] == ['Kids', 'Done', 'Split', 'Late', 'Masters'], director.setup_division_names()
        director.save_now()
        director.wait_idle()

        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        court.wait_generated()
        court.staff_login()
        court.open_court('A')
        tv = KsmApp.open_device(browser, base, 'TV A', problems, app_path(tid, 'tv', 'A'))
        live = KsmApp.open_device(browser, base, 'Live', problems, app_path(tid, 'live'))

        court.switch_division('Done')
        assert play_ready_on_court(court, 'Done') == 1
        court.wait_for(lambda: court.court_screen()['complete'], message='Done complete')
        court.switch_division('Split')
        assert play_ready_on_court(court, 'Split') >= 1, 'Split has a Court A match'
        assert not court.court_screen()['complete'], 'Split waits for Court B (not complete)'
        court.switch_division('Kids')
        assert play_ready_on_court(court, 'Kids') == 1
        court.wait_for(lambda: court.court_screen()['complete'], message='Kids complete')
        b = court.wait_for(lambda: box(court), message='the division-complete box')
        assert b['message'] == 'Kids is complete. Final results are showing on the Court A TV.', b
        assert b['next'] == 'Continue to Masters →', f'next division (skips Done, Split waiting on Court B, Late not generated): {b}'
        assert b['keep'] == 'Keep showing results' and b['close'] is None, b
        court.wait_idle()
        tv.wait_for(lambda: tv.tv_screen()['complete'] and tv.tv_screen()['division'] == 'Kids', message='the TV shows the Kids results')

        # Keep showing results: the TV keeps the results; "Close TV results" stays on the court screen.
        court.click('court-keep-results')
        b = court.wait_for(lambda: (box(court) or {}).get('close') and box(court), message='Close TV results')
        assert b['close'] == 'Close TV results' and b['next'] is None, b
        assert tv.tv_screen()['complete'] and tv.tv_screen()['division'] == 'Kids', 'Keep showing results changed the TV'
        court.click('court-close-results')
        court.wait_for(lambda: court.court_screen()['division'] == 'Masters' and court.current_match(), message='the court moved on to Masters')
        assert court.court_screen()['selected'] == 'Masters'
        court.wait_idle()
        tv.wait_for(lambda: tv.tv_screen()['division'] == 'Masters' and tv.tv_screen()['live'], message='the TV follows to Masters')
        live.wait_for(lambda: (live.live_court('A') or {}).get('meta', '').startswith('Masters'), message='Live Scores follows to Masters')

        # Masters done: nothing ready on Court A (Split waits for Court B): all done.
        assert play_ready_on_court(court, 'Masters') == 1
        b = court.wait_for(lambda: box(court), message='the Masters box')
        assert b['done'] == 'All divisions on Court A are done.' and b['next'] is None and b['keep'] is None, b
        court.wait_idle()

        # Court B plays Split's other match: Court A's box now offers Split, and Continue moves there.
        court_b = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'B'))
        court_b.wait_generated()
        court_b.staff_login()
        court_b.open_court('B')
        court_b.switch_division('Split')
        assert play_ready_on_court(court_b, 'Split') >= 1
        court_b.wait_idle()
        b = court.wait_for(lambda: (box(court) or {}).get('next') and box(court), message='Split offered once Court B played', timeout=20)
        assert b['next'] == 'Continue to Split →', b
        court.click('court-continue')
        court.wait_for(lambda: court.court_screen()['division'] == 'Split' and court.current_match(), message='Continue moved to Split')
        court.wait_idle()
        tv.wait_for(lambda: tv.tv_screen()['division'] == 'Split' and tv.tv_screen()['live'], message='the TV follows to Split')
        assert not problems, '\n'.join(problems)
        browser.close()
    print(f'PASS division complete: Continue to the next division in the running order (skips finished, not generated and '
          f'waiting divisions), Keep showing results / Close TV results, all done; the TV and Live Scores follow ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
