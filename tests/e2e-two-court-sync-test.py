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
import json
import time
import urllib.request

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker

PASSWORD = 'e2e-staff-pass'
DIVS = {'A': 'Court A Open', 'B': 'Court B Open'}
PLAYERS = {
    'A': ['Aoki Ken', 'Baba Jun', 'Chiba Rei', 'Doi Sho'],
    'B': ['Endo Yui', 'Fujii Mao', 'Goto Ryo', 'Hara Aki'],
}
# Point sequence per match on each court (all ippon to White, then a Red point on odd matches).
POINTS = [('W', 'M'), ('R', 'K'), ('W', 'D')]


def fetch_record(base, tid):
    with urllib.request.urlopen(f'{base}/api/tournaments/{tid}') as r:
        return json.load(r)


def dialog_handler(name, problems):
    answers = {
        'Tournament Name': 'E2E Two Court Cup',
        'Create Staff password': PASSWORD,
        'Confirm Staff password': PASSWORD,
        'Enter Staff password': PASSWORD,
        'Name this device': name,
    }

    def handle(d):
        for prefix, answer in answers.items():
            if d.message.startswith(prefix):
                return d.accept(answer)
        problems.append(f'{name}: unexpected {d.type}: {d.message}')
        d.accept()
    return handle


def open_device(browser, base, name, problems, path='/'):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, service_workers='block')
    page = ctx.new_page()
    page.on('dialog', dialog_handler(name, problems))
    page.on('pageerror', lambda e: problems.append(f'{name}: page error: {e}'))
    page.goto(base + path, wait_until='domcontentloaded')
    page.wait_for_function('typeof state==="object" && typeof cloudSession==="object"')
    return page


def wait_idle(page, timeout=30):
    page.wait_for_function('!localChangesPending()', timeout=timeout * 1000)


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)

        # --- Director creates and generates the tournament --------------------------
        director = open_device(browser, base, 'Director', problems)
        director.evaluate('createNewTournament()')
        director.wait_for_function('Boolean(cloudSession.tournamentId)', timeout=20000)
        tid = director.evaluate('cloudSession.tournamentId')
        director.evaluate("""([divs, players]) => {
          state.divisions = [divs.A, divs.B];
          state.divisionTypes = {[divs.A]: 'Round Robin', [divs.B]: 'Round Robin'};
          state.divisionCourts = {[divs.A]: 'A', [divs.B]: 'B'};
          state.competitors = ['A', 'B'].flatMap(c => players[c].map((name, i) =>
            ({name, dojo: `Dojo ${c}${i}`, division: divs[c], seed: '', status: 'Checked'})));
          state.teams = []; state.exhibitions = [];
          generatePools({validated: true});
          criticalAutoSave('E2E generate');
        }""", [DIVS, PLAYERS])
        wait_idle(director)
        record = fetch_record(base, tid)
        planned = {c: [m for m in record['payload']['state']['allMatches'][DIVS[c]] if not m.get('championship') and not m.get('tiebreak')] for c in 'AB'}
        assert all(planned[c] for c in 'AB'), 'generation produced no pool matches'
        assert all(m.get('court', 'A') == c for c in 'AB' for m in planned[c]), 'matches not assigned to their court'

        # --- Spectator + two scorekeeper devices join over the cloud ---------------
        spectator = open_device(browser, base, 'Spectator', problems, f'/?tournament={tid}')
        courts = {}
        for c in 'AB':
            page = open_device(browser, base, f'Court {c}', problems, f'/?tournament={tid}&court={c}')
            page.wait_for_function('cloudSession.tournamentId && Object.keys(state.allMatches||{}).length > 0', timeout=20000)
            page.evaluate('toggleStaffSession()')
            page.wait_for_function('ksmSessionRole === "staff"', timeout=10000)
            page.evaluate(f"chooseCourt('{c}')")
            page.wait_for_function(f"state.currentCourt === '{c}' && state.matches[state.current] && state.matches[state.current].court === '{c}'")
            courts[c] = page

        # --- Both courts play every match simultaneously ---------------------------
        # Pool matches only: championship brackets are not part of this scenario.
        played = {c: [] for c in 'AB'}
        rounds = max(len(planned['A']), len(planned['B']))
        for i in range(rounds):
            for c in 'AB':
                page = courts[c]
                if i >= len(planned[c]):
                    continue
                m = page.evaluate('(() => { const m = state.matches[state.current]; return m && !m.championship && !m.tiebreak ? {white: m.white, red: m.red} : null })()')
                if not m:
                    continue
                pts = POINTS if i % 2 else POINTS[:1]  # alternate 1-0 and 2-1 wins for White
                for side, letter in pts:
                    page.click(f"#score button[onclick=\"point('{side}','{letter}')\"]")
                page.click('#score button.next-match-btn')
                played[c].append({**m, 'wp': len([x for x in pts if x[0] == 'W']), 'rp': len([x for x in pts if x[0] == 'R'])})

        for c in 'AB':
            assert len(played[c]) == len(planned[c]), f'Court {c} played {len(played[c])}/{len(planned[c])} pool matches'

        # --- Let every device finish syncing -------------------------------------
        for page in [courts['A'], courts['B']]:
            wait_idle(page, timeout=45)
        time.sleep(2)  # allow final live broadcasts to land
        for page in [courts['A'], courts['B']]:
            wait_idle(page, timeout=45)

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
        for name, page in [('Court A', courts['A']), ('Court B', courts['B']), ('Spectator', spectator), ('Director', director)]:
            try:
                page.wait_for_function('rev => Number(cloudSession.revision) >= rev', arg=record['revision'], timeout=15000)
            except Exception:
                problems.append(f"{name} stuck at revision {page.evaluate('cloudSession.revision')} (server {record['revision']})")
                continue
            got = summary(page.evaluate('state.allMatches'))
            if got != expected:
                problems.append(f'{name} diverged from server:\n  device={got}\n  server={expected}')

        assert not problems, '\n'.join(problems)
        conflicts = [page.evaluate('readCloudDiagnosticsState()') for page in courts.values()]
        rebases = sum(1 for d in conflicts if d.get('rebaseAttempt'))
        print(f"PASS two courts played {len(played['A'])}+{len(played['B'])} matches concurrently; "
              f"server revision {record['revision']}; devices converged (rebased saves seen on {rebases} court device(s))")
        browser.close()


if __name__ == '__main__':
    main()
