"""End-to-end: two kachinuki team divisions on both courts keep every bout's lineups right.

Bug (reported 2026-11-10, ATKT): with a children's and an adult kachinuki division on both courts,
the court screens showed the first bout of a pairing right but not the next ones: one team's names
with another team's lineups (even the other division's), and bouts went missing or repeated. Every
kachinuki bout of a pairing had the same sync identity, so when the two courts' saves met, a
court's next bout was put on the pairing's first bout (split-court-rebase-test.mjs shows it on
hand-made payloads).

Against a throwaway `wrangler dev`: two kachinuki single-elimination divisions on both courts, with
a team name in both (as "Kenshikan B" was). Court A and Court B scorekeepers (separate devices)
play every bout their court is given at the same time, with a mix of White wins, Red wins and
draws. After every bout, on both devices and on the server, every kachinuki bout must be its own
teams' members at the members it says (white = its lineup at wIndex), with the lineups as
registered in that division, and no pairing may lose its first bout or repeat one.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker


def roster(prefix, names):
    return [{'team': name, 'senpo': f'{prefix} {name} 1', 'chuken': f'{prefix} {name} 2', 'taisho': f'{prefix} {name} 3'} for name in names]


KIDS = roster('Kid', ['Daijingu', 'Seibukan', 'Aiea B', 'Kenshikan A', 'Aiea A', 'Kenshikan B', 'Myohoji'])
ADULT = roster('Adult', ['Waipahu B', 'Aiea', 'Lihue', 'Women A', 'Mililani', 'Myohoji', 'Kenshikan A', 'Wahiawa',
                         'Budogu', 'Daijingu', 'Waipahu A', 'Women B', 'Kenshikan B', 'Men'])


def lineup_of(team):
    return [team['senpo'], team['chuken'], team['taisho']]


def check_matches(where, all_matches, divisions):
    """divisions: {division id: {team name: lineup}}. Returns the problems found."""
    problems = []
    for div, lineups in divisions.items():
        bouts = [m for m in all_matches.get(div) or [] if m and m.get('type') == 'kachinuki']
        seen = set()
        for m in bouts:
            tag = f'{where} {div} {m.get("teamPair")} {m.get("white")} v {m.get("red")}'
            if lineup_of_registered(lineups, m['teamWhite']) != m.get('lineupW') or lineup_of_registered(lineups, m['teamRed']) != m.get('lineupR'):
                problems.append(f'{tag}: lineups {m.get("lineupW")} / {m.get("lineupR")} are not {m["teamWhite"]} / {m["teamRed"]}\'s')
            elif m['white'] != m['lineupW'][m.get('wIndex') or 0] or m['red'] != m['lineupR'][m.get('rIndex') or 0]:
                problems.append(f'{tag}: not the members at {m.get("wIndex")}-{m.get("rIndex")}')
            key = (m.get('teamPair'), m.get('wIndex') or 0, m.get('rIndex') or 0)
            if key in seen:
                problems.append(f'{tag}: bout {key[1]}-{key[2]} twice')
            seen.add(key)
        for pair in {m.get('teamPair') for m in bouts}:
            if (pair, 0, 0) not in seen:
                problems.append(f'{where} {div} {pair}: the first bout is gone')
    return problems


def lineup_of_registered(lineups, team):
    return lineups.get(team)


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Split Teams Cup')
        tid = director.create_tournament()
        director.configure([
            {'team': True, 'format': 'Kachinuki', 'tournament': 'Single Elimination', 'court': 'Both', 'teams': KIDS},
            {'team': True, 'name': 'Adult Team', 'format': 'Kachinuki', 'tournament': 'Single Elimination', 'court': 'Both', 'teams': ADULT},
        ])
        director.save_now('drawn')
        director.wait_idle()
        state = fetch_record(base, tid)['payload']['state']
        ids = [d['id'] for d in sorted(state['teamDivisions'], key=lambda d: d['order'])]
        assert len(ids) == 2, state['teamDivisions']
        divisions = {ids[0]: {t['team']: lineup_of(t) for t in KIDS}, ids[1]: {t['team']: lineup_of(t) for t in ADULT}}
        assert all(state['allMatches'].get(d) for d in ids), 'both team divisions drawn'
        assert not check_matches('drawn', state['allMatches'], divisions)

        courts = {}
        for c in 'AB':
            court = KsmApp.open_device(browser, base, f'Court {c}', problems, app_path(tid, 'court', c))
            court.wait_generated()
            court.staff_login()
            court.open_court(c)
            courts[c] = court

        found = []
        played = {'A': 0, 'B': 0}
        n = 0
        deadline = time.time() + 300
        idle_since = None
        while time.time() < deadline and not found:
            moved = False
            for c, court in courts.items():
                m = court.current_match()
                if not m and 'Adult Team' in court.division_options() and court.court_screen()['division'] != 'Adult Team':
                    # The children's division is done on this court: the scorekeeper moves on to the adults.
                    court.switch_division('Adult Team')
                    court.wait_for(lambda: court.court_screen()['division'] == 'Adult Team', message='the adult division')
                    m = court.current_match()
                if not m:
                    continue
                n += 1
                pick = n % 5
                playoff = 'Playoff' in m['meta'] or 'Representative' in (m['white'] + m['red'])
                if pick in (0, 1) or playoff:
                    court.score_point('W', 'M')
                elif pick in (2, 3):
                    court.score_point('R', 'K')
                court.next_match(settle=True)
                played[c] += 1
                moved = True
                for name, device in courts.items():
                    found += check_matches(f'Court {name} device after {sum(played.values())} bouts', device.all_matches(), divisions)
                if found:
                    break
            if moved:
                idle_since = None
                continue
            idle_since = idle_since or time.time()
            if time.time() - idle_since > 20:
                break
            for court in courts.values():
                court.wait_idle(timeout=30)
            time.sleep(0.5)
        for court in courts.values():
            court.wait_idle(timeout=45)

        state = fetch_record(base, tid)['payload']['state']
        found += check_matches('server', state['allMatches'], divisions)
        assert not found, '\n'.join(found[:12])
        nodes = state.get('teamBracketNodes') or {}
        finals = {d: next((x.get('winner') for x in nodes.get(d, []) if x['round'] == 'Final'), None) for d in ids}
        assert all(finals.values()), f'both divisions finished (Final winners {finals}; played {played})'
        assert not problems, '\n'.join(problems)
        print(f"PASS two kachinuki divisions on both courts: Court A played {played['A']} bouts, Court B {played['B']}; "
              f"every bout's lineups right on both devices and the server")
        browser.close()


if __name__ == '__main__':
    main()
