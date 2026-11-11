"""End-to-end: a pool decided with players still level below the advancing places fills its seeds.

Bug (reported 2026-11-10, ATKT, Yudansha 4 Dan+ split between the courts): pool B finished with one
winner and three players tied for second. Their tiebreak bouts gave second place to one of them
(one win; the other two bouts were draws), leaving the other two level for third, which does not
advance. The pool never counted as decided, so the bracket kept "B1" and "B2" and the division could
not be finished.

Against a throwaway `wrangler dev`: the director draws Braxton's 14-player division (pools of 4, 4,
3, 3) split between the courts. Court A and Court B scorekeepers (separate devices) play every bout
their court is given at the same time. Every pool of four ends as pool B did: its first player wins
every bout, the other three beat one another in a circle (one win, one point each), and in their
tiebreak the second player beats the third and the other two bouts are draws. The bracket must get
every seed and be played to the Final.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker

DIV = 'Yudansha 4 Dan+'
ENTRANTS = [{'name': f'Player {i:02d}', 'dojo': f'Dojo {i:02d}', 'seed': '', 'status': 'Checked'} for i in range(1, 15)]
MATCH_JS = """() => { const st = KSMTest.app.state, m = st.matches?.[st.current];
  return m ? {pool: m.pool, white: m.white, red: m.red, tiebreak: !!m.tiebreak, championship: !!m.championship, division: m.division, done: !!m.done} : null }"""


def outcome(m, rank):
    """'W', 'R' or None (a draw) for a bout, by the players' places in their pool's player list (0 = first)."""
    if m['championship']:
        return 'W'
    w, r = rank[m['white']], rank[m['red']]
    if m['tiebreak']:
        return ('W' if w < r else 'R') if {w, r} == {1, 2} else None
    if 0 in (w, r):
        return 'W' if w == 0 else 'R'
    beats = {(1, 2), (2, 3), (3, 1)}  # the other three beat one another in a circle
    return 'W' if (w, r) in beats else 'R'


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Split Pools Cup')
        tid = director.create_tournament()
        director.configure([{'name': DIV, 'format': 'Round Robin', 'court': 'split', 'entrants': ENTRANTS}])
        director.save_now('drawn split')
        director.wait_idle()
        state = fetch_record(base, tid)['payload']['state']
        pools = state['pools'][DIV]
        assert [(p['label'], p.get('court'), len(p['players'])) for p in pools] == [('A', 'A', 4), ('B', 'A', 4), ('C', 'B', 3), ('D', 'B', 3)], pools
        rank = {pl['name']: i for p in pools for i, pl in enumerate(p['players'])}

        courts = {}
        for c in 'AB':
            court = KsmApp.open_device(browser, base, f'Court {c}', problems, app_path(tid, 'court', c))
            court.wait_generated()
            court.staff_login()
            court.open_court(c)
            courts[c] = court

        played = {'A': [], 'B': []}
        deadline = time.time() + 240
        idle_since = None
        final = False
        while time.time() < deadline and not final:
            moved = False
            for c, court in courts.items():
                if not court.current_match():
                    continue
                m = court.page.evaluate(MATCH_JS)
                if not m or m['division'] != DIV or m['done']:
                    continue
                side = outcome(m, rank)
                if side:
                    court.score_point(side, 'M' if side == 'W' else 'K')
                court.next_match(settle=True)
                played[c].append('Tiebreak' if m['tiebreak'] else m['pool'])
                moved = True
            state = fetch_record(base, tid)['payload']['state']
            final = any(x.get('position') == 'Final' and x.get('done') for x in state['allMatches'][DIV])
            if moved:
                idle_since = None
                continue
            idle_since = idle_since or time.time()
            if time.time() - idle_since > 25:
                break
            for court in courts.values():
                court.wait_idle(timeout=30)
            time.sleep(0.5)
        for court in courts.values():
            court.wait_idle(timeout=45)

        state = fetch_record(base, tid)['payload']['state']
        pool_bouts = [m for m in state['allMatches'][DIV] if not m.get('championship')]
        champ = [m for m in state['allMatches'][DIV] if m.get('championship')]
        assert all(m.get('done') for m in pool_bouts), f'pool bouts left: {[(m["pool"], m["white"], m["red"]) for m in pool_bouts if not m.get("done")]}'
        tiebreaks = [m for m in pool_bouts if m.get('tiebreak')]
        assert sorted({m['pool'] for m in tiebreaks}) == ['A', 'B'] and len(tiebreaks) == 6, \
            f'each pool of four went to a three-player tiebreak: {[(m["pool"], m["white"], m["red"], m["wp"], m["rp"]) for m in tiebreaks]}'
        first = [m for m in champ if m.get('position') == 'Quarterfinal']
        unfilled = [(m.get('seedWhite'), m['white'], m.get('seedRed'), m['red']) for m in first if not m['white'] or not m['red']]
        assert not unfilled, f'quarterfinals still waiting for their seeds: {unfilled} (played {played})'
        seconds = {m['seedWhite']: m['white'] for m in first} | {m['seedRed']: m['red'] for m in first}
        for label in ('A2', 'B2'):
            pool = next(p for p in pools if p['label'] == label[0])
            assert seconds[label] == pool['players'][1]['name'], f'{label} is the tiebreak winner: {seconds[label]}'
        assert final, f'the Final was played (played {played})'
        assert not problems, '\n'.join(problems)
        print(f"PASS split pools with a three-player tie for second: every seed filled, Court A played {len(played['A'])} bouts, "
              f"Court B {len(played['B'])}, Final done")
        browser.close()


if __name__ == '__main__':
    main()
