"""TV display (tv3 renderer) on real TV links, against a throwaway `wrangler dev`.

  * individual match: court, division, round; point letters as they are scored;
    two Upcoming Matches cards with specific placeholders ("Winner …", never TBD);
    no White/Red labels;
  * team match: team names, current bout, Wins/Points per team as bouts finish;
    Upcoming Matches show team names and later bracket rounds;
  * kachinuki: current bout above both three-fighter lineups, each fighter marked
    active / waiting / eliminated;
  * self-healing: a missed live update (revision gap) triggers a full refresh; with
    the live socket silent, the TV catches up when it becomes visible and every 15 s;
  * layout: a fixed 1920×1080 canvas at the top left with header (210 px), current match
    (610 px) and upcoming (260 px) zones stacked inside it, large names, no page chrome.
"""
import re
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

TV_SIZE = {'width': 1920, 'height': 1080}


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


ZONES_JS = """() => { const box = id => { const e = document.querySelector(`[data-testid="${id}"]`); if (!e) return null;
  const r = e.getBoundingClientRect(); return {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)}; };
  return {canvas: box('tv-canvas'), header: box('tv-header'), match: box('tv-current-match'), upcoming: box('tv-upcoming'),
          name: parseFloat(getComputedStyle(document.querySelector('[data-testid="tv-white-name"]') || document.body).fontSize),
          chrome: [...document.querySelectorAll('header, nav, .spectator-readonly-banner')].filter(e => e.offsetParent !== null).length,
          scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight]}; }"""


def check_tv_layout(tv, label, name_px=60):
    z = tv.page.evaluate(ZONES_JS)
    inside = lambda b: b and b['x'] >= z['canvas']['x'] and b['y'] >= z['canvas']['y'] and \
        b['x'] + b['w'] <= z['canvas']['x'] + 1920 and b['y'] + b['h'] <= z['canvas']['y'] + 1080
    assert z['canvas'] == {'x': 0, 'y': 0, 'w': 1920, 'h': 1080}, f'{label}: canvas {z["canvas"]}'
    assert z['header']['h'] == 210 and z['upcoming']['y'] == 820 and z['upcoming']['h'] == 260, f'{label}: zones {z}'
    assert all(inside(z[k]) for k in ('header', 'match', 'upcoming')), f'{label}: a zone leaves the canvas: {z}'
    assert z['header']['y'] + z['header']['h'] <= z['match']['y'] and z['match']['y'] + z['match']['h'] <= z['upcoming']['y'], \
        f'{label}: zones overlap: {z}'
    assert z['name'] >= name_px and z['chrome'] == 0 and z['scroll'] == [1920, 1080], f'{label}: {z}'


def tv_text(tv):
    return tv.page.inner_text(sel('tv-display'))


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='TV Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Elim', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('E', 4)},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'teams': 8, 'court': 'Both'},
        ])
        director.save_now()
        director.wait_idle()

        # Court A TV with its live socket routed through the test (to drop or hold updates).
        mode = {'m': 'forward'}

        def route_socket(page):
            def handler(ws):
                server = ws.connect_to_server()

                def from_server(message):
                    if mode['m'] == 'hold' or (mode['m'] == 'drop' and '"snapshot"' in str(message)):
                        if mode['m'] == 'drop':
                            mode['m'] = 'forward'
                        return
                    ws.send(message)
                server.on_message(from_server)
            page.route_web_socket(lambda url: '/live' in url, handler)

        tv_a = KsmApp.open_device(browser, base, 'TV A', problems, f'/?role=spectator&tournament={tid}&court=A&view=tv',
                                  viewport=TV_SIZE, clock=True, before_load=route_socket)
        tv_a.wait_generated()
        tv_a.wait_for(lambda: tv_a.tv_screen()['live'], message='a live match')

        # --- Individual match ----------------------------------------------------------------
        director.open_court('A')
        m = director.current_match()
        s = tv_a.tv_screen()
        assert (s['court'], s['division'], s['white'], s['red']) == ('A', 'Elim', m['white'], m['red']), s
        assert s['meta'].startswith('Semifinal'), s
        assert (s['white_score'], s['red_score']) == ('—', '—'), s
        director.score_point('W', 'M')
        director.score_point('W', 'K')
        director.score_point('R', 'D')
        tv_a.wait_for(lambda: (tv_a.tv_screen()['white_score'], tv_a.tv_screen()['red_score']) == ('M K', 'D'),
                      message=f'point letters M K / D (shows {tv_a.tv_screen()})')
        upcoming = tv_a.tv_upcoming()
        assert len(upcoming) == 2 and all(upcoming), f'two upcoming matches expected: {upcoming}'
        other_semi, final = upcoming
        assert 'TBD' not in other_semi + final and all(side.startswith('Winner') for side in final), \
            f'the final should name where its players come from: {upcoming}'
        assert not re.search(r'\b(White|Red)\b', tv_text(tv_a)), f'TV shows White/Red labels:\n{tv_text(tv_a)}'
        check_tv_layout(tv_a, 'individual')

        # --- Self-healing: revision gap, visibility, periodic check -----------------------------
        director.open_court('A')
        # Stop the TV's timers so its 15-second check cannot stand in for the refresh under test.
        tv_a.page.clock.pause_at(tv_a.page.evaluate('Date.now()') + 1000)
        mode['m'] = 'drop'
        director.score_point('W', 'T')
        director.wait_idle()
        # Snapshots are complete, so the next one alone would catch up; the gap must also
        # trigger a full refresh from the server.
        with tv_a.page.expect_request(lambda r: 'tvRefresh' in r.url, timeout=8000):
            director.score_point('R', 'M')
        tv_a.wait_for(lambda: (tv_a.tv_screen()['white_score'], tv_a.tv_screen()['red_score']) == ('M K T', 'D M'),
                      timeout=8, message=f'refresh after a revision gap (shows {tv_a.tv_screen()})')
        mode['m'] = 'hold'
        director.next_match()
        director.wait_idle()
        time.sleep(1)
        assert tv_a.tv_screen()['white'] == m['white'], 'the held socket still delivered the update'
        tv_a.page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        nxt = director.current_match()
        tv_a.wait_for(lambda: tv_a.tv_screen()['white'] == nxt['white'], timeout=8, message='refresh when the TV becomes visible')
        director.score_point('R', 'K')
        director.wait_idle()
        time.sleep(1)
        assert tv_a.tv_screen()['red_score'] == '—', 'the held socket still delivered the update'
        tv_a.page.clock.run_for(16_000)
        tv_a.wait_for(lambda: tv_a.tv_screen()['red_score'] == 'K', timeout=8, message='the 15-second verification refresh')
        tv_a.page.clock.resume()
        mode['m'] = 'forward'

        # --- Team match ------------------------------------------------------------------------
        director.open_court('A')
        director.switch_division('Team Tournament')
        tm = director.current_match()
        tv_a.wait_for(lambda: tv_a.tv_screen()['white'].endswith(tm['white']), message='TV B to show the current bout')
        s = tv_a.tv_screen()
        teams = tm['meta'].split('·')[0].strip()
        assert f"{s['white_team']} vs {s['red_team']}" == teams, (s, tm['meta'])
        assert (s['white_summary'].upper(), s['red_summary'].upper()) == ('WINS 0 POINTS 0', 'WINS 0 POINTS 0'), s
        up = tv_a.tv_upcoming()
        assert up[0] and all(x.startswith('Team ') for x in up[0]), f'next team match should show team names: {up}'
        assert up[1] and 'TBD' not in up[1], f'the later final should be listed with its sources: {up}'
        director.score_point('W', 'M')
        director.score_point('W', 'K')
        director.next_match()
        tv_a.wait_for(lambda: tv_a.tv_screen()['white_summary'].upper() == 'WINS 1 POINTS 2', message=f'team wins/points (shows {tv_a.tv_screen()})')
        assert tv_a.tv_screen()['red_summary'].upper() == 'WINS 0 POINTS 0'
        check_tv_layout(tv_a, 'team', name_px=30)

        # --- Kachinuki ---------------------------------------------------------------------------
        k_dir = KsmApp.open_device(browser, base, 'Kachinuki director', problems, tournament_name='Kachinuki Cup')
        k_tid = k_dir.create_tournament()
        k_dir.setup_team_event('Kachinuki', 'Single Elimination', 'A')
        k_dir.configure([{'team': True, 'format': 'Kachinuki', 'tournament': 'Single Elimination', 'teams': 2, 'court': 'A'}])
        k_dir.save_now()
        k_dir.wait_idle()
        k_tv = KsmApp.open_device(browser, base, 'Kachinuki TV', problems, f'/?role=spectator&tournament={k_tid}&court=A&view=tv',
                                  viewport=TV_SIZE)
        k_tv.wait_generated()
        lineups = lambda: k_tv.page.evaluate("""() => [...document.querySelectorAll('[data-testid="tv-kachinuki-lineup"]')].map(l =>
          [...l.querySelectorAll('[data-testid="tv-kachinuki-row"]')].map(r => r.innerText.replace(/\\s+/g, ' ').trim().toLowerCase()))""")
        k_tv.wait_for(lambda: len(lineups()) == 2, message='two kachinuki lineups')
        k_dir.open_court('A')
        km = k_dir.current_match()
        white, red = lineups()
        assert [r.split()[-1] for r in white] == ['active', 'waiting', 'waiting'] and white[0].startswith(km['white'].lower()), white
        assert [r.split()[-1] for r in red] == ['active', 'waiting', 'waiting'] and red[0].startswith(km['red'].lower()), red
        current_box = k_tv.page.locator(sel('tv-kachinuki-current')).bounding_box()
        lineup_box = k_tv.page.locator(sel('tv-kachinuki-lineup')).first.bounding_box()
        assert current_box['y'] + current_box['height'] <= lineup_box['y'] + 1, 'the current bout should sit above the lineups'
        check_tv_layout(k_tv, 'kachinuki')
        k_dir.score_point('W', 'M')
        k_dir.next_match()
        k_tv.wait_for(lambda: [r.split()[-1] for r in lineups()[1]] == ['eliminated', 'active', 'waiting'],
                      message=f'the beaten fighter marked eliminated (shows {lineups()})')
        assert k_tv.tv_screen()['white'] == km['white'] and [r.split()[-1] for r in lineups()[0]][0] == 'active', 'the winner stays in'

        assert not problems, '\n'.join(problems)
        print(f'PASS TV display: individual, team, kachinuki, upcoming, self-healing ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
