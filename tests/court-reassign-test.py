"""A division's court changed after the draw moves its unplayed matches; Generate starts each court
on its own first division.

Before: every match kept the court it was drawn with, so moving a division to the other court in
Setup changed only the setting (the court screens, Overview and TV still ran it on the old court).
And Generate pointed the scorekeeper's court (A) at whatever division the Generated Pools dropdown
showed, even one with no matches on Court A ("0 / 0 Matches, No match scheduled").

Offline, through the UI: Pools (Round Robin, Court A, 9 players) and Elim (Single Elimination,
Court B, 6 players). Generate with the dropdown on Elim: Court A runs Pools. Elim moved to Court A:
all its matches are on A and Court B no longer shows it. Pools set to split: its pools are shared
between A and B by the draw's own rule.
"""
from collections import Counter
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

POOLS, ELIM = 'Pools Test', 'Elim Test'


def courts(state, div):
    return Counter(m['court'] for m in state['allMatches'][div] if m and not m.get('done'))


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.setup_divisions([(POOLS, 'Round Robin', 'A'), (ELIM, 'Single Elimination', 'B')])
        dojos = ['Aiea', 'Hilo', 'Kona', 'Maui']
        for i in range(9):
            app.register(f'Pool Player {i + 1}', dojos[i % 4], POOLS)
        for i in range(6):
            app.register(f'Elim Player {i + 1}', dojos[i % 4], ELIM)
        app.generate()
        app.wait_generated()

        # Regenerate with the Generated Pools dropdown on Elim (a Court B division).
        app.nav('registration')
        app.click('reg-tab-pools')
        page.select_option(sel('pool-division-select'), label=ELIM)
        app.answers['Regenerate'] = True
        app.generate()
        state = app.payload()['state']
        assert state['courtState']['A']['division'] == POOLS, state['courtState']
        assert state['courtState']['B']['division'] == ELIM, state['courtState']
        assert courts(state, POOLS) == {'A': len(state['allMatches'][POOLS])}, courts(state, POOLS)

        # Elim moved to Court A after the draw: its matches follow, Court B lets it go.
        app.nav('setup')
        app.setup_division_row(ELIM).locator(sel('setup-division-court')).select_option(value='A')
        state = app.payload()['state']
        assert set(courts(state, ELIM)) == {'A'}, courts(state, ELIM)
        assert state['courtState']['B']['division'] != ELIM or \
            state['courtState']['B']['index'] >= len(state['allMatches'][ELIM]), state['courtState']

        # Pools split between the courts: both courts get pool matches.
        app.setup_division_row(POOLS).locator(sel('setup-division-court')).select_option(value='split')
        state = app.payload()['state']
        pool_courts = Counter(m['court'] for m in state['allMatches'][POOLS] if m and not m.get('championship'))
        assert set(pool_courts) == {'A', 'B'}, pool_courts

        # And back to one court: everything unplayed on B, the split's pool courts forgotten.
        app.setup_division_row(POOLS).locator(sel('setup-division-court')).select_option(value='B')
        state = app.payload()['state']
        assert set(courts(state, POOLS)) == {'B'}, courts(state, POOLS)
        assert not any('court' in p for p in state['pools'][POOLS]), state['pools'][POOLS]
        assert not problems, problems
        browser.close()
    print('PASS a court change after the draw moves the unplayed matches; Generate starts each court on its own division')


if __name__ == '__main__':
    main()
