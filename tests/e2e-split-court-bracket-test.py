"""End-to-end: a division split between the courts after the draw keeps its bracket split.

Bug (reported 2026-11-08): a division split between Court A and Court B ran its pools on both
courts, but once the pools were finished Court B got every elimination bout. The draw saves a
court on each championship node; moving the division to "Split Between Courts" after the draw
moved the bouts but not the nodes, and the next pool result refilled the bracket from the nodes,
putting every bout back on the court of the draw. Now the top half of the bracket is on Court A,
the bottom half on Court B, and the Final on Court A.

Also: ten entrants (pools of 4, 3, 3) get a four-person bracket, A1 v C1 and B1 v A2, instead of
an eight-person one that took the pools' third places.

Against a throwaway `wrangler dev`: the director draws the division on Court B, then splits it in
Setup. Court A and Court B scorekeepers (separate devices) play every bout their court is given
(White wins each by Men) until the Final is done.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

DIV = 'Split Ten'
ENTRANTS = [{'name': f'Player {i:02d}', 'dojo': f'Dojo {i:02d}', 'seed': '', 'status': 'Checked'} for i in range(1, 11)]


def championship(state):
    return sorted((m for m in state['allMatches'][DIV] if m and m.get('championship')),
                  key=lambda m: (m['position'] != 'Semifinal', m.get('bracketSlot', 0)))


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Split Bracket Cup')
        tid = director.create_tournament()
        director.configure([{'name': DIV, 'format': 'Round Robin', 'court': 'B', 'entrants': ENTRANTS}])
        director.save_now('drawn on Court B')
        director.wait_idle()

        state = fetch_record(base, tid)['payload']['state']
        assert [len(p['players']) for p in state['pools'][DIV]] == [4, 3, 3], state['pools'][DIV]
        champ = championship(state)
        assert [(m['position'], m['seedRed'], m['seedWhite']) for m in champ] == [
            ('Semifinal', 'A1', 'C1'), ('Semifinal', 'B1', 'A2'), ('Final', None, None)], \
            f'ten entrants: expected a four-person bracket A1 v C1, B1 v A2; got {[(m["position"], m["seedRed"], m["seedWhite"]) for m in champ]}'
        assert {m['court'] for m in state['allMatches'][DIV]} == {'B'}, 'drawn on Court B'

        # Split after the draw, in Setup.
        director.nav('setup')
        director.setup_division_row(DIV).locator(sel('setup-division-court')).select_option(value='split')
        director.save_now('split between courts')
        director.wait_idle()
        state = fetch_record(base, tid)['payload']['state']
        assert [(m['position'], m['court']) for m in championship(state)] == [
            ('Semifinal', 'A'), ('Semifinal', 'B'), ('Final', 'A')], [(m['position'], m['court']) for m in championship(state)]

        courts = {}
        for c in 'AB':
            court = KsmApp.open_device(browser, base, f'Court {c}', problems, app_path(tid, 'court', c))
            court.wait_generated()
            court.staff_login()
            court.open_court(c)
            courts[c] = court

        # Both courts play whatever their court screen gives them until the Final is done.
        played = {'A': [], 'B': []}
        deadline = time.time() + 150
        while time.time() < deadline:
            moved = False
            for c, court in courts.items():
                m = court.current_match()
                if not m or m['division'] != DIV:
                    continue
                court.score_point('W', 'M')
                court.next_match(settle=True)
                played[c].append(m['meta'].split(' · ')[0])
                moved = True
            if any(x == 'Final' for x in played['A'] + played['B']):
                break
            if not moved:
                for court in courts.values():
                    court.wait_idle(timeout=30)
                time.sleep(0.5)
        for court in courts.values():
            court.wait_idle(timeout=45)

        rounds = {c: [r for r in played[c] if r in ('Semifinal', 'Final')] for c in 'AB'}
        assert rounds == {'A': ['Semifinal', 'Final'], 'B': ['Semifinal']}, \
            f'expected Court A: Semifinal, Final and Court B: Semifinal; played {played}'
        assert any(r.startswith('Pool') for r in played['A']) and any(r.startswith('Pool') for r in played['B']), played

        state = fetch_record(base, tid)['payload']['state']
        final = [(m['position'], m['court'], m['done']) for m in championship(state)]
        assert final == [('Semifinal', 'A', True), ('Semifinal', 'B', True), ('Final', 'A', True)], final
        assert not problems, '\n'.join(problems)
        print(f"PASS split after the draw: Court A played {len(played['A'])} bouts (Semifinal 1 and the Final), "
              f"Court B {len(played['B'])} (Semifinal 2); ten entrants got the A1 v C1, B1 v A2 bracket")
        browser.close()


if __name__ == '__main__':
    main()
