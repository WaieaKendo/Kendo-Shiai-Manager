"""A No Show before a pool starts gives the pool the standard bout order for its new size (#24).

Product owner request (issue #24): when a No Show shrinks a pool of 4 to 3 before any of its bouts
was played, the pool plays the standard 3-player order A-B, C-B, C-A (nobody changes tasuki between
consecutive bouts), the remaining players keep their pool slots, and the other pool and the
championship template are unchanged. Before the fix the pool kept the 4-player order minus the
no-show's bouts (without slot C: A-B, B-D, D-A, so B went from red to white).

A director and a Court A scorekeeper against a throwaway `wrangler dev`: the director marks the
slot-C player of Pool A No Show in Registration; the server copy, the director's Pools view and
Court A's pool card show the new order, and Court A plays it in that order (B stays red, D stays
white). A reloaded Court A and a fresh device agree with the server.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

OPEN = 'Open'


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='No Show Cup')
        tid = director.create_tournament()
        director.configure([{'name': OPEN, 'format': 'Round Robin', 'court': 'A',
                             'entrants': [{'name': f'O {i + 1}', 'dojo': f'Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(8)]}])
        director.save_now()
        director.wait_idle()
        before = director.structure()[OPEN]
        pool_a = before['pools'][0]['players']
        assert [len(pool['players']) for pool in before['pools']] == [4, 4], before['pools']
        a, b, c, d = pool_a
        others = [m for m in before['matches'] if m['pool'] != before['pools'][0]['label']]

        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        court.wait_generated()
        court.staff_login()
        court.open_court('A')
        title = next(t for t in court.court_pool_bouts() if t.endswith(' A') or t == 'Pool A')
        assert court.court_pool_bouts()[title][:3] == [[a, b], [c, d], [c, a]], 'the pool of 4 starts in the 4-player order'

        # The director marks slot C No Show (Checked In -> No Show): nothing in Pool A was played.
        director.nav('registration')
        director.click('reg-tab-individual')
        rows = director.page.locator(sel('reg-row'))
        next(rows.nth(i) for i in range(rows.count()) if rows.nth(i).locator(sel('reg-name')).input_value() == c) \
            .locator(sel('reg-status')).click()
        director.blur()
        director.wait_idle()
        record = fetch_record(base, tid)
        st = record['payload']['state']
        expected = [[a, b], [d, b], [d, a]]  # the 3-player order over A, B, D: B stays red, D stays white
        bouts = [m for m in st['allMatches'][OPEN] if m.get('pool') == 'A' and not m.get('championship')]
        assert [[m['white'], m['red']] for m in bouts] == expected, f'server: {[[m["white"], m["red"]] for m in bouts]}'
        assert [[m['whitePoolSlot'], m['redPoolSlot']] for m in bouts] == [['A', 'B'], ['D', 'B'], ['D', 'A']], 'slots kept'
        after = director.structure()[OPEN]
        assert [m for m in after['matches'] if m['pool'] != 'A'] == others, 'the other pool or the championship changed'
        assert director.pool_slots(OPEN)['A'] == [['A', a], ['B', b], ['D', d]], director.pool_slots(OPEN)

        # Court A follows: its pool card and its queue play the new order.
        court.wait_revision(record['revision'])
        court.wait_for(lambda: court.court_pool_bouts().get(title) == expected, message='the new order on Court A')
        for white, red in expected:
            court.wait_for(lambda: (court.court_screen()['white'], court.court_screen()['red']) == (white, red),
                           message=f'Court A to show {white} vs {red}')
            court.score_point('W', 'M')
            court.next_match(settle=True)
        court.wait_idle()

        # A reloaded court and a fresh device agree with the server.
        final = fetch_record(base, tid)
        played = [[m['white'], m['red'], m['done']] for m in final['payload']['state']['allMatches'][OPEN] if m.get('pool') == 'A']
        assert played == [x + [True] for x in expected], played
        court.reload()
        fresh = KsmApp.open_device(browser, base, 'Fresh', problems, app_path(tid))
        for app in (court, fresh):
            app.wait_revision(final['revision'])
            assert app.payload()['state']['allMatches'] == final['payload']['state']['allMatches'], f'{app.name}: matches differ from the server'
            assert app.structure()[OPEN]['pools'][0]['players'] == [a, b, d], f'{app.name}: {app.structure()[OPEN]["pools"]}'
        court.staff_login()
        court.open_court('A')
        court.wait_for(lambda: court.court_pool_bouts().get(title) == expected, message='the played order on the reloaded Court A')

        assert not problems, '\n'.join(problems)
        print(f'PASS no-show pool order (#24): a pool of 4 shrunk to 3 plays A-B, C-B, C-A with its slots kept, on the server, '
              f'the director, Court A (played in that order), a reload and a fresh device ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
