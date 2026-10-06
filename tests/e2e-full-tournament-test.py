"""End-to-end: a whole tournament day, run the way people run it, against a real backend.

Devices (separate browser contexts) against a throwaway `wrangler dev`:
  * Director: creates the tournament in the cloud, sets it up in Setup, registers
    everyone in Registration (one no-show), generates, and later reads Results.
  * Court A and Court B scorekeepers: join from the tournament link, log in as
    staff, open their court from the Courts menu and score every match with the
    point / Next Match buttons, both courts interleaved. When their division is
    finished they pick the next one in the court's division selector (the app
    has no auto-advance yet).
  * Spectator (Live Scores) and a Court A TV (the link from the TV menu) follow
    along; they are checked at checkpoints, and each drops off and catches up
    (the spectator goes offline, both are reloaded; neither may show a prompt).

Divisions: individual round robin on Court A (8 registered, 1 no-show; a scripted
pool draw forces a tiebreak), individual single elimination on Court B (6), and a
3-person team event on both courts (4 teams). Every result is scripted: the
stronger entrant (earlier in the lists below) wins, so the expected placements
follow from what was played.

Only user-visible controls (test IDs via tests/ksm_app.py) drive the app; the
server record (GET /api/tournaments/{id}) and each device's synced copy are
compared at the end.

Watch it run: `npm run test:e2e:watch` (KSM_HEADED=1, KSM_SLOWMO=ms).
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record
from ksm_browser import launch_chromium, watch_mode
from ksm_server import local_worker

RR, SE, TEAM = 'Mens Individual', 'Womens Individual', 'Team Tournament'
# Strongest first.
MEN = ['Abe Taro', 'Baba Jiro', 'Chiba Saburo', 'Doi Shiro', 'Endo Goro', 'Fujii Rokuro', 'Goto Shichiro', 'Hara Hachiro']
NO_SHOW = 'Goto Shichiro'
WOMEN = ['Ito Hana', 'Kato Yui', 'Mori Aya', 'Noda Rin', 'Ono Mei', 'Sato Emi']
TEAMS = {
    'Team Aiea': ['Ikeda Ryo', 'Ueda Ken', 'Oda Jun'],
    'Team Hilo': ['Kubo Sho', 'Kudo Dai', 'Kimura Ren'],
    'Team Kona': ['Sano Kai', 'Seki Yu', 'Sugi Tomo'],
    'Team Lihue': ['Tani Gen', 'Toda Rei', 'Tsuji Hiro'],
}
DOJOS = ['Aiea', 'Hilo', 'Kona', 'Lihue', 'Maui']
COURT_PLAN = {'A': [RR, TEAM], 'B': [SE, TEAM]}

RANK = {name: i for i, name in enumerate(MEN)} | {name: i for i, name in enumerate(WOMEN)}
TEAM_OF = {member: team for team, members in TEAMS.items() for member in members}
TEAM_RANK = {team: i for i, team in enumerate(TEAMS)}


def stronger(a, b):
    return a if RANK[a] < RANK[b] else b


class Scorekeeper:
    """Plays one court from its court screen and logs every scripted result."""

    def __init__(self, app, court, draw_pair, log):
        self.app, self.court, self.draw_pair, self.log = app, court, draw_pair, log
        self.plan = list(COURT_PLAN[court])
        self.division = self.plan[0]
        self.done = False

    def outcome(self, m):
        white, red = m['white'], m['red']
        if m['division'] == TEAM:
            position = m['meta'].rsplit('·', 1)[-1].strip()
            teams = (TEAM_OF[white], TEAM_OF[red])
            if position == 'Chuken':
                return None, [('W', 'M'), ('R', 'K')]  # every team match has one drawn bout
            winner_side = 'W' if TEAM_RANK[teams[0]] < TEAM_RANK[teams[1]] else 'R'
            return (white if winner_side == 'W' else red), [(winner_side, 'D')]
        pair = frozenset((white, red))
        if pair == self.draw_pair and not any(frozenset((e['white'], e['red'])) == pair for e in self.log):
            return None, [('W', 'M'), ('R', 'K')]  # hikiwake: forces a tiebreak for 2nd place in the pool
        winner = stronger(white, red)
        side, other = ('W', 'R') if winner == white else ('R', 'W')
        if m['meta'].startswith('Final'):
            return winner, [(side, 'M'), (other, 'K'), (side, 'K')]  # 2-1 final
        return winner, [(side, 'M' if len(self.log) % 2 else 'K')]

    def step(self):
        """Score one match, or move to the next division. Returns True if anything happened."""
        if self.done:
            return False
        m = self.app.current_match()
        if m and m['division'] == self.division:
            winner, pts = self.outcome(m)
            for side, letter in pts:
                self.app.score_point(side, letter)
            self.app.next_match(settle=True)
            self.log.append({'court': self.court, 'division': m['division'], 'meta': m['meta'],
                             'white': m['white'], 'red': m['red'], 'winner': winner, 'points': pts})
            return True
        screen = self.app.court_screen()
        if not screen['complete']:
            return False  # waiting for the other court (team final) or for sync
        # This division is finished on this court: switch like a scorekeeper does.
        rest = self.plan[self.plan.index(self.division) + 1:]
        if not rest:
            self.done = True
            return True
        assert rest[0] in screen['options'], f'Court {self.court}: {rest[0]} not offered in {screen["options"]}'
        self.division = rest[0]
        self.app.switch_division(self.division)
        return True


def expected_placements(log, division):
    """1st/2nd from the final, 3rd from semifinal losers, as scripted."""
    games = [e for e in log if e['division'] == division]
    if division == TEAM:
        # The last team pairing is the final; its stronger team won 2 bouts to 0.
        final = games[-1]
        teams = sorted({TEAM_OF[final['white']], TEAM_OF[final['red']]}, key=TEAM_RANK.get)
        return [('1st', teams[0]), ('2nd', teams[1])]
    final = [e for e in games if e['meta'].startswith('Final')]
    assert len(final) == 1, f'{division}: expected one final, played {[e["meta"] for e in games]}'
    final = final[0]
    loser = lambda e: e['red'] if e['winner'] == e['white'] else e['white']
    thirds = [('3rd', loser(e)) for e in games if e['meta'].startswith('Semifinal')]
    return [('1st', final['winner']), ('2nd', loser(final))] + thirds


def match_summary(all_matches):
    return {d: sorted((m.get('white') or '', m.get('red') or '', m.get('pool') or '', m.get('position') or '', bool(m.get('tiebreak')),
                       bool(m.get('done')), tuple(m.get('wp') or []), tuple(m.get('rp') or []))
                      for m in all_matches.get(d, []) if isinstance(m, dict))
            for d in (RR, SE, TEAM)}


def check_followers(courts, spectator, tv, problems, label):
    """Spectator Live Scores (both courts) and Court A TV show each court's current match."""
    for c, keeper in courts.items():
        m = keeper.app.current_match()
        if not m:
            continue
        try:
            spectator.wait_for(lambda: (lambda live: live and live['white'] == m['white'] and live['red'] == m['red'])(spectator.live_court(c)),
                               timeout=15, message=f'Live Scores Court {c} to show {m["white"]} vs {m["red"]}')
        except AssertionError as e:
            problems.append(f'{label}: {e}; shows {spectator.live_court(c)}')
        if c == 'A':
            def tv_ok():
                s = tv.tv_screen()
                if m['division'] == TEAM:
                    return s['live'] and TEAM_OF[m['white']] == s['white_team'] and s['white'].endswith(m['white'])
                return s['live'] and s['white'] == m['white'] and s['red'] == m['red']
            try:
                tv.wait_for(tv_ok, timeout=15, message=f'TV Court A to show {m["white"]} vs {m["red"]}')
            except AssertionError as e:
                problems.append(f'{label}: {e}; shows {tv.tv_screen()}')


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)

        # --- Director: create, set up, register, generate -------------------------------
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='E2E Full Tournament')
        tid = director.create_tournament()
        director.setup_divisions([(RR, 'Round Robin', 'A'), (SE, 'Single Elimination', 'B')])
        director.setup_team_event('3-Person Team', 'Single Elimination', 'Both')
        for i, name in enumerate(MEN):
            director.register(name, f'{DOJOS[i % len(DOJOS)]} Kendo', RR, status='NoShow' if name == NO_SHOW else 'Checked')
        for i, name in enumerate(WOMEN):
            director.register(name, f'{DOJOS[(i + 2) % len(DOJOS)]} Kendo', SE)
        for team, members in TEAMS.items():
            director.register_team(team, dict(zip(['senpo', 'chuken', 'taisho'], members)))
        director.generate()
        director.wait_generated()
        director.wait_idle()

        pools = director.pools(RR)
        assert NO_SHOW not in sum(pools.values(), []), f'no-show {NO_SHOW} was placed in a pool: {pools}'
        assert sorted(sum(pools.values(), [])) == sorted(n for n in MEN if n != NO_SHOW), f'pools: {pools}'
        four = [sorted(players, key=RANK.get) for players in pools.values() if len(players) == 4]
        assert four, f'expected a pool of 4 in {RR}: {pools}'
        draw_pair = frozenset(four[0][1:3])  # the pool's middle two draw -> tied for 2nd -> tiebreak

        # --- Followers: spectator link and Court A TV link -------------------------------
        tv_url = director.tv_link('A')
        assert 'view=tv' in tv_url and tid in tv_url, tv_url
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, f'/?tournament={tid}')
        spectator.wait_generated()
        tv = KsmApp.open_device(browser, base, 'TV Court A', problems, tv_url[tv_url.index('/', 8):],
                                viewport={'width': 1600, 'height': 900})
        tv.wait_generated()

        # --- Scorekeepers join from the tournament link ----------------------------------
        log, courts = [], {}
        for c in 'AB':
            app = KsmApp.open_device(browser, base, f'Court {c}', problems, f'/?tournament={tid}&court={c}')
            app.wait_generated()
            app.staff_login()
            app.open_court(c)
            app.wait_for(app.current_match, message=f'a match on Court {c}')
            keeper = Scorekeeper(app, c, draw_pair, log)
            first = app.current_match()['division']
            if first != keeper.division:
                app.switch_division(keeper.division)
            courts[c] = keeper
        check_followers(courts, spectator, tv, problems, 'start')

        # --- Both courts play, interleaved --------------------------------------------------
        steps, idle_since, dropped, checkpoints = 0, None, False, [4, 16, 26]
        while not all(k.done for k in courts.values()):
            progressed = [k.step() for k in courts.values()]
            steps += sum(progressed)
            if any(progressed):
                idle_since = None
            else:
                idle_since = idle_since or time.time()
                assert time.time() - idle_since < 30, f'courts stuck: ' + '; '.join(
                    f'Court {c} on {k.division}: {k.app.court_screen()}' for c, k in courts.items())
                time.sleep(0.2)
            if checkpoints and steps >= checkpoints[0]:
                check_followers(courts, spectator, tv, problems, f'after {checkpoints.pop(0)} steps')
            if steps >= 8 and not dropped:
                # Spectator loses its connection and the TV is power-cycled mid-tournament.
                spectator.page.context.set_offline(True)
                # Nobody is at a TV to answer a prompt: a reloaded link device must not ask
                # "Restore autosaved tournament?" (finding F1, fixed); record it if it does.
                tv.expect_dialog('Restore autosaved tournament?', accept=False)
                tv.page.reload(wait_until='domcontentloaded')
                dropped = True
            if dropped is True and steps >= 12:
                spectator.page.context.set_offline(False)
                # The spectator is power-cycled too, once it is back online.
                spectator.expect_dialog('Restore autosaved tournament?', accept=False)
                spectator.page.reload(wait_until='domcontentloaded')
                spectator.page.wait_for_function('window.KSMTest && KSMTest.booted()')
                dropped = 'restored'
                check_followers(courts, spectator, tv, problems, 'after reconnect')

        # --- Everything saved and synced ---------------------------------------------------
        for keeper in courts.values():
            keeper.app.wait_idle(timeout=45)
        time.sleep(1)
        for keeper in courts.values():
            keeper.app.wait_idle(timeout=45)
        record = fetch_record(base, tid)
        server = record['payload']['state']['allMatches']

        # Every division complete, with the scripted tiebreak and without the no-show.
        # Known quirk (docs/ROADMAP.md): a 5-6 player single elimination keeps one empty,
        # never-played bye slot. Tolerate exactly that, nothing else.
        empty_slots = [m for m in server[SE] if isinstance(m, dict) and not m.get('white') and not m.get('red') and not m.get('done')]
        assert len(empty_slots) <= 1, f'{SE}: {len(empty_slots)} empty bracket slots'
        for div in (RR, SE, TEAM):
            arr = [m for m in server.get(div, []) if isinstance(m, dict) and not any(m is e for e in empty_slots)]
            assert arr and all(m.get('done') for m in arr), f'{div}: unfinished matches on server: ' + str(
                [(m.get('white'), m.get('red'), m.get('position')) for m in arr if not m.get('done')])
            assert not any(NO_SHOW in (m.get('white'), m.get('red')) for m in arr), f'{div}: no-show {NO_SHOW} was scheduled'
        tiebreaks = [m for m in server[RR] if m.get('tiebreak')]
        assert [frozenset((m['white'], m['red'])) for m in tiebreaks] == [draw_pair], \
            f'expected one tiebreak between {sorted(draw_pair)}, got {[(m["white"], m["red"]) for m in tiebreaks]}'
        assert (tiebreaks[0].get('completedResult') or {}).get('winner') == stronger(*draw_pair), f'tiebreak result: {tiebreaks[0]}'
        scheduled = sum(len(server[d]) for d in (RR, SE, TEAM)) - len(empty_slots)
        assert len(log) == scheduled, f'played {len(log)} matches, server has {scheduled}'

        # Results page placements follow from the scripted results.
        expected = {div: expected_placements(log, div) for div in (RR, SE, TEAM)}
        assert expected[RR][0] == ('1st', MEN[0]) and expected[SE][0] == ('1st', WOMEN[0]) and expected[TEAM][0] == ('1st', 'Team Aiea'), expected
        for device in (director, spectator):
            shown = device.placements()
            for div, rows in expected.items():
                if sorted(shown.get(div, [])) != sorted(rows):
                    problems.append(f'{device.name} Results {div}: shows {shown.get(div)}, expected {rows}')

        # Every device converges on the server copy.
        want = match_summary(server)
        for device in [courts['A'].app, courts['B'].app, spectator, tv, director]:
            try:
                device.wait_revision(record['revision'])
            except Exception:
                problems.append(f"{device.name} stuck at revision {device.revision()} (server {record['revision']})")
                continue
            if match_summary(device.all_matches()) != want:
                problems.append(f'{device.name} diverged from the server copy')
        tv_final = tv.tv_screen()
        if not tv_final['complete']:
            problems.append(f'TV Court A does not show final results at the end: {tv_final}')

        # Finding F1 (fixed): reloaded TV and spectator load the cloud copy without a prompt.
        for device in (tv, spectator):
            if device.seen_dialogs:
                problems.append(f'{device.name} reload asked: {device.seen_dialogs}')

        if watch_mode():
            time.sleep(3)
        assert not problems, '\n'.join(problems)
        print(f'PASS full tournament: {len(log)} matches ({sum(e["court"] == "A" for e in log)} on A, '
              f'{sum(e["court"] == "B" for e in log)} on B) incl. tiebreak and team bouts; '
              f'placements {expected}; server revision {record["revision"]}; {time.time() - started:.0f}s')
        browser.close()


if __name__ == '__main__':
    main()
