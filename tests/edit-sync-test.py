"""Setup, Registration and structural edits reach the server and the other devices, and survive a
reload (test audit, issue #19).

A director and a Court B scorekeeper against a throwaway `wrangler dev`. The director makes each
kind of edit through the UI (test IDs) that no other test follows past the editing device:

  * Setup: Court B's red side (the referees' setting), the team awards, a custom division
    (format and court), exhibitions switched on;
  * Registration: Paste from Excel (F31: was never autosaved), × on a player, a status changed,
    an exhibition match added and named, a team member changed;
  * structural no-shows after generation: a player (the pool is rebuilt) and a whole team (its
    pairings removed).

After each edit the director's save must reach the server and Court B must show it (Court B's
court screen mirrors for the red side; its Pools view drops the no-show). At the end Court B is
reloaded and a fresh device opens the tournament: both must show every edit.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

OPEN_A, OPEN_B, LATE, TEAM = 'Open A', 'Open B', 'Late Open', 'Team Tournament'
PASTE_JS = """text => {
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
}"""
# Court B's names from the scorer's table: x of the White and Red name boxes.
NAME_X_JS = """() => ['court-white-name', 'court-red-name'].map(id =>
  document.querySelector(`#score [data-testid="${id}"]`).getBoundingClientRect().left)"""


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Sync Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': OPEN_A, 'format': 'Round Robin', 'court': 'A', 'entrants': people('A', 4)},
            {'name': OPEN_B, 'format': 'Round Robin', 'court': 'B', 'entrants': people('B', 4)},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 3, 'court': 'Both'},
        ])
        director.save_now()
        director.wait_idle()
        court = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'B'))
        court.wait_generated()
        court.staff_login()
        court.open_court('B')
        assert court.page.evaluate(NAME_X_JS)[0] < court.page.evaluate(NAME_X_JS)[1], 'Court B starts with White on the left'

        def saved(check, what):
            """The director's edit is on the server and reaches Court B (check(payload) is true for both)."""
            director.blur()
            director.wait_idle()
            record = fetch_record(base, tid)
            assert check(record['payload']), f'{what}: not on the server'
            court.wait_revision(record['revision'])
            court.wait_for(lambda: check(court.payload()), message=f'{what} on Court B')
            return record['payload']

        players = lambda pl: {c['name']: c for c in pl['state']['competitors']}
        st = lambda pl: pl['state']

        # --- Setup ------------------------------------------------------------------------------
        director.nav('setup')
        director.page.select_option(sel('setup-red-side-b'), value='left')
        saved(lambda pl: pl['setup'].get('court2RedSide') == 'left', 'Court B red side')
        court.open_court('B')
        court.wait_for(lambda: (lambda x: x[1] < x[0])(court.page.evaluate(NAME_X_JS)), message='Court B to mirror (Red on the left)')

        director.page.select_option(sel('team-award-mode'), value='dual3')
        saved(lambda pl: st(pl).get('teamAwardMode') == 'dual3', 'team awards')

        director.page.fill(sel('custom-division-name'), LATE)
        director.page.select_option(sel('custom-division-format'), label='Single Elimination')
        director.page.select_option(sel('custom-division-court'), value='B')
        director.click('custom-division-add')
        saved(lambda pl: LATE in st(pl)['divisions'] and st(pl)['divisionTypes'].get(LATE) == 'Single Elimination'
              and st(pl)['divisionCourts'].get(LATE) == 'B', 'the custom division')

        director.page.select_option(sel('exhibition-enabled'), label='Enabled')
        saved(lambda pl: pl['setup'].get('exhibitionEnabled') == 'Enabled', 'exhibitions on')

        # --- Registration -----------------------------------------------------------------------
        director.nav('registration')
        director.click('reg-tab-individual')
        director.wait_idle()  # the tab clicks' own autosave is done: only the paste is left to save
        director.page.evaluate(PASTE_JS, f'L 1\tL Dojo\t{LATE}\r\nL 2\tL Dojo\t{LATE}\r\nL 3\tL Dojo\t{LATE}\t\tChecked In\r\n')
        director.wait_for(lambda: all(n in players(director.payload()) for n in ('L 1', 'L 2', 'L 3')), message='the pasted rows')
        saved(lambda pl: all(n in players(pl) for n in ('L 1', 'L 2', 'L 3')), 'F31: the pasted players')

        rows = director.page.locator(sel('reg-row'))
        row = lambda name: next(rows.nth(i) for i in range(rows.count()) if rows.nth(i).locator(sel('reg-name')).input_value() == name)
        row('L 3').locator(sel('reg-remove')).click()
        saved(lambda pl: 'L 3' not in players(pl), 'the removed player')

        for _ in range(2):  # Registered -> Checked In -> No Show
            row('L 2').locator(sel('reg-status')).click()
        saved(lambda pl: players(pl).get('L 2', {}).get('status') == 'NoShow', 'the status change')

        director.click('reg-tab-exhibition')
        director.click('exhibition-add')
        ex = director.page.locator(sel('exhibition-row')).last
        for side, person in (('white', 'Sensei Ono'), ('red', 'Sensei Ida')):
            ex.locator(sel(f'exhibition-{side}')).fill(person)
            ex.locator(sel(f'exhibition-{side}')).press('Tab')
        saved(lambda pl: any(e.get('white') == 'Sensei Ono' and e.get('red') == 'Sensei Ida' for e in st(pl).get('exhibitions') or []), 'the exhibition match')

        director.click('reg-tab-team')
        senpo = director.page.locator(sel('team-card')).first.locator(sel('team-member-senpo'))
        senpo.fill('New Senpo')
        senpo.press('Tab')
        saved(lambda pl: st(pl)['teams'][0].get('senpo') == 'New Senpo', 'the team member')

        # --- Structural no-shows after generation (nothing played yet) ----------------------------
        director.expect_dialog('Mark ', accept=True)  # owner decision 18: a No Show after generation asks first
        director.click('reg-tab-individual')
        row('A 4').locator(sel('reg-status')).click()  # Checked In -> No Show: the pool is rebuilt
        in_pools = lambda pl, div, name: any(name == (x['name'] if isinstance(x, dict) else x) for pool in st(pl)['pools'][div] for x in pool['players'])
        in_matches = lambda pl, div, name: any(name in (m.get('white'), m.get('red'), m.get('teamWhite'), m.get('teamRed')) for m in st(pl)['allMatches'][div])
        saved(lambda pl: not in_pools(pl, OPEN_A, 'A 4') and not in_matches(pl, OPEN_A, 'A 4'), 'the player no-show')
        assert 'A 4' not in sum(court.pools(OPEN_A).values(), []), 'Court B Pools view still shows the no-show'

        director.click('reg-tab-team')
        director.page.locator(sel('team-card')).last.locator(sel('team-status')).click()  # Team C: Checked In -> No Show
        saved(lambda pl: not in_matches(pl, TEAM, 'Team C') and in_matches(pl, TEAM, 'Team A'), 'the team no-show')

        # --- Survives a reload: Court B reloaded and a fresh device -------------------------------
        final = fetch_record(base, tid)
        court.reload()
        fresh = KsmApp.open_device(browser, base, 'Fresh', problems, app_path(tid))
        for app in (court, fresh):
            app.wait_revision(final['revision'])
            pl = app.payload()
            assert (pl['setup'].get('court2RedSide'), st(pl).get('teamAwardMode'), pl['setup'].get('exhibitionEnabled')) == ('left', 'dual3', 'Enabled'), \
                f'{app.name}: Setup after reload {pl["setup"]}'
            assert st(pl)['divisionTypes'].get(LATE) == 'Single Elimination' and st(pl)['divisionCourts'].get(LATE) == 'B', f'{app.name}: custom division'
            got = players(pl)
            assert 'L 1' in got and 'L 3' not in got and got['L 2']['status'] == 'NoShow', f'{app.name}: registration {sorted(got)}'
            assert st(pl)['teams'][0].get('senpo') == 'New Senpo', f'{app.name}: team member'
            assert any(e.get('white') == 'Sensei Ono' for e in st(pl).get('exhibitions') or []), f'{app.name}: exhibition'
            assert not in_pools(pl, OPEN_A, 'A 4') and not in_matches(pl, TEAM, 'Team C'), f'{app.name}: no-shows'
            assert st(pl)['allMatches'] == final['payload']['state']['allMatches'], f'{app.name}: matches differ from the server'
        court.open_court('B')
        assert (lambda x: x[1] < x[0])(court.page.evaluate(NAME_X_JS)), 'Court B is not mirrored after the reload'

        assert not problems, '\n'.join(problems)
        print(f'PASS edit sync: Setup (red side, team awards, custom division, exhibitions), Registration (paste, remove, status, '
              f'exhibition, team member) and structural no-shows reach the server and Court B and survive a reload ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
