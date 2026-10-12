"""End-to-end: two courts scoring at the same time through the real app + backend.

This is the baseline for the cloud sync / conflict-merge code. It runs the real
index.html in three browser sessions against a local `wrangler dev` backend:

  * Director creates the tournament: two round-robin divisions, one per court.
  * Court A and Court B scorekeepers (separate devices) log in as staff and play
    every match on their court at the same time, clicking the real buttons,
    without waiting for saves in between, so their saves conflict (HTTP 409)
    and must be rebased/merged by the client.
  * A spectator device watches over WebSocket.

After everything settles, the server copy and every device must agree, and
no point, completed match or winner from either court may be lost.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker

DIVS = {'A': 'Court A Open', 'B': 'Court B Open'}
PLAYERS = {
    'A': ['Aoki Ken', 'Baba Jun', 'Chiba Rei', 'Doi Sho'],
    'B': ['Endo Yui', 'Fujii Mao', 'Goto Ryo', 'Hara Aki'],
}
# Point sequence per match on each court (all ippon to White, then a Red point on odd matches).
POINTS = [('W', 'M'), ('R', 'K'), ('W', 'D')]


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)

        # --- Director creates and generates the tournament --------------------------
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='E2E Two Court Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': DIVS[c], 'format': 'Round Robin', 'court': c,
             'entrants': [{'name': name, 'dojo': f'Dojo {c}{i}', 'seed': '', 'status': 'Checked'} for i, name in enumerate(PLAYERS[c])]}
            for c in 'AB'])
        director.save_now('E2E generate')
        director.wait_idle()
        record = fetch_record(base, tid)
        planned = {c: [m for m in record['payload']['state']['allMatches'][DIVS[c]] if not m.get('championship') and not m.get('tiebreak')] for c in 'AB'}
        assert all(planned[c] for c in 'AB'), 'generation produced no pool matches'
        assert all(m.get('court', 'A') == c for c in 'AB' for m in planned[c]), 'matches not assigned to their court'

        # --- Spectator + two scorekeeper devices join over the cloud ---------------
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, f'/?tournament={tid}')
        courts = {}
        for c in 'AB':
            court = KsmApp.open_device(browser, base, f'Court {c}', problems, f'/?tournament={tid}&court={c}')
            court.wait_generated()
            court.staff_login()
            court.open_court(c)
            court.wait_for(court.current_match, message=f'a match on Court {c}')
            courts[c] = court

        # --- Both courts play every match simultaneously ---------------------------
        # Pool matches only: championship brackets are not part of this scenario.
        played = {c: [] for c in 'AB'}
        rounds = max(len(planned['A']), len(planned['B']))
        for i in range(rounds):
            for c in 'AB':
                court = courts[c]
                if i >= len(planned[c]):
                    continue
                m = court.current_match()
                if not m or not m['meta'].startswith('Pool'):
                    continue
                pts = POINTS if i % 2 else POINTS[:1]  # alternate 1-0 and 2-1 wins for White
                for side, letter in pts:
                    court.score_point(side, letter)
                court.next_match()
                played[c].append({'white': m['white'], 'red': m['red'], 'wp': len([x for x in pts if x[0] == 'W']), 'rp': len([x for x in pts if x[0] == 'R'])})

        for c in 'AB':
            assert len(played[c]) == len(planned[c]), f'Court {c} played {len(played[c])}/{len(planned[c])} pool matches'

        # --- Let every device finish syncing -------------------------------------
        for court in courts.values():
            court.wait_idle(timeout=45)
        time.sleep(2)  # allow final live broadcasts to land
        for court in courts.values():
            court.wait_idle(timeout=45)

        record = fetch_record(base, tid)
        server = record['payload']['state']['allMatches']

        # --- Server copy has every result from both courts -----------------------
        for c in 'AB':
            arr = server[DIVS[c]]
            assert all(isinstance(m, dict) for m in arr), f'{DIVS[c]}: null/invalid match entries on server'
            for exp in played[c]:
                found = [m for m in arr if m.get('white') == exp['white'] and m.get('red') == exp['red'] and not m.get('championship') and not m.get('tiebreak')]
                assert len(found) == 1, f"{DIVS[c]} {exp['white']} vs {exp['red']}: expected 1 match, found {len(found)}"
                m = found[0]
                assert m.get('done') is True, f"Court {c} lost completion of {exp['white']} vs {exp['red']}: {m}"
                assert len(m.get('wp') or []) == exp['wp'] and len(m.get('rp') or []) == exp['rp'], \
                    f"Court {c} lost points in {exp['white']} vs {exp['red']}: wp={m.get('wp')} rp={m.get('rp')}, expected {exp['wp']}-{exp['rp']}"
                winner = (m.get('completedResult') or {}).get('winner')
                assert winner == exp['white'], f"{exp['white']} vs {exp['red']}: winner {winner!r}, expected {exp['white']!r}"

        # --- Every device converges on the server copy ---------------------------
        def summary(allm):
            return {d: sorted((m.get('white'), m.get('red'), bool(m.get('tiebreak')), bool(m.get('done')), len(m.get('wp') or []), len(m.get('rp') or []))
                              for m in allm.get(d, []) if not m.get('championship')) for d in DIVS.values()}
        expected = summary(server)
        for device in [courts['A'], courts['B'], spectator, director]:
            name = device.name
            try:
                device.wait_revision(record['revision'])
            except Exception:
                problems.append(f"{name} stuck at revision {device.revision()} (server {record['revision']})")
                continue
            got = summary(device.all_matches())
            if got != expected:
                problems.append(f'{name} diverged from server:\n  device={got}\n  server={expected}')

        assert not problems, '\n'.join(problems)
        conflicts = [court.diagnostics() for court in courts.values()]
        rebases = sum(1 for d in conflicts if d.get('rebaseAttempt'))
        print(f"PASS two courts played {len(played['A'])}+{len(played['B'])} matches concurrently; "
              f"server revision {record['revision']}; devices converged (rebased saves seen on {rebases} court device(s))")
        browser.close()


if __name__ == '__main__':
    main()
