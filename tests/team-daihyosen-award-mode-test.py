"""A team round robin's daihyosen only for places that get an award (D2, owner decision on F27).

F27 gave a daihyosen to teams level for any of 1st-3rd. Now the places that count follow Setup's
team award mode ("Team Awards to Display"): Champion only -> 1st; Champion + Runner-up (the
default) -> 1st-2nd; Champion + Runner-up + 3rd place(s) -> 1st-3rd. Teams level for a place
without an award share the rank (no daihyosen).

Offline: a 3-person team round robin of four teams on Court A: Team A beats everyone; B, C and D
beat each other in a circle (one 1-0 bout per pairing), so B, C and D are level for 2nd. Played
from the court with the test API under each award mode (set in Setup).
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

CIRCLE = {frozenset(('Team B', 'Team C')): 'Team B', frozenset(('Team C', 'Team D')): 'Team C', frozenset(('Team B', 'Team D')): 'Team D'}
MODES = {'top1': 'Champion only', 'top2': 'Champion + Runner-up', 'dual3': 'Champion + Runner-up + 3rd place(s)'}


def winner(white, red):
    if 'Team A' in (white, red):
        return 'Team A'
    return CIRCLE[frozenset((white, red))]


def play(app):
    """Every round-robin pairing on Court A: the Senpo bout decides it 1-0, the others are drawn."""
    for _ in range(40):
        m = app.page.evaluate("() => { const m = KSMTest.prepareCourt('A'); return m ? {w: m.teamWhite, r: m.teamRed, pos: m.position, tb: !!m.roundRobinTiebreak} : null; }")
        if not m or m['tb']:
            return m
        pts = [['W' if winner(m['w'], m['r']) == m['w'] else 'R', 'M']] if m['pos'] == 'Senpo' else []
        app.page.evaluate('pts => KSMTest.play(pts)', pts)
    raise AssertionError('the round robin did not end')


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        results = {}
        for mode, label in MODES.items():
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            app = KsmApp.local(page, f'Director {mode}', problems=problems)
            app.answers['Create Staff password'] = ''  # offline harness: saves stay local
            app.nav('setup')
            page.select_option(sel('team-division-awardMode'), label=label)
            app.configure([{'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 4, 'court': 'A'}])
            next_bout = play(app)
            standings = app.final_state()['Team Tournament']['standings']['team']
            results[mode] = (next_bout, [r['name'] for r in standings])
            page.close()
        # B, C and D are level for 2nd: a daihyosen once 2nd has an award.
        assert results['top1'][0] is None, f'Champion only: a daihyosen for 2nd: {results["top1"]}'
        for mode in ('top2', 'dual3'):
            bout = results[mode][0]
            assert bout and bout['tb'] and {bout['w'], bout['r']} <= {'Team B', 'Team C', 'Team D'}, f'{mode}: no daihyosen for 2nd: {results[mode]}'
        assert results['top1'][1][0] == 'Team A'
        assert not problems, problems
        browser.close()
    print('PASS team round-robin daihyosen only for places with an award: none for 2nd with "Champion only", '
          'one with "Champion + Runner-up" and with 3rd places')


if __name__ == '__main__':
    main()
