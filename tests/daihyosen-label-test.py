"""A team round-robin daihyosen bout says "Daihyosen — first point wins" (D1, owners' decision on F27).

Before: the court showed the bout as any other ("Team A vs Team B · Daihyosen"), nothing said that
one point decides it. Now the court screen shows the label "Daihyosen — first point wins" with the
bout, and Live Scores and the TV show it as the bout's line. The bout still ends with Next Match
(no automatic end after the point).

Offline: a 3-person team round robin of three teams on Court A played as a circle with the test
API (each pairing decided by one 1-0 bout), so all three are level and the daihyosen round starts;
the court screen, Live Scores and the TV display (drawn in the same page) are read.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

LABEL = 'Daihyosen — first point wins'
CIRCLE = {frozenset(('Team A', 'Team B')): 'Team A', frozenset(('Team B', 'Team C')): 'Team B', frozenset(('Team A', 'Team C')): 'Team C'}


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Court A', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        app.configure([{'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 3, 'court': 'A'}])
        app.open_court('A')
        assert 'Senpo' in app.court_screen()['meta'] and page.locator(f'#score {sel("court-bout-rule")}').count() == 0, 'an ordinary bout has no label'
        for _ in range(9):
            m = page.evaluate("() => { const m = KSMTest.prepareCourt('A'); return {w: m.teamWhite, r: m.teamRed, pos: m.position}; }")
            assert m['pos'] != 'Daihyosen', m
            pts = [['W' if CIRCLE[frozenset((m['w'], m['r']))] == m['w'] else 'R', 'M']] if m['pos'] == 'Senpo' else []
            page.evaluate('pts => KSMTest.play(pts)', pts)

        app.open_court('A')
        assert 'Daihyosen' in app.court_screen()['meta'], app.court_screen()
        rule = page.locator(f'#score {sel("court-bout-rule")}')
        assert rule.count() == 1 and rule.inner_text().strip() == LABEL, f'court label: {rule.all_inner_texts()}'
        app.score_point('W', 'M')
        before = app.court_screen()
        assert before['white_points'] == 'M' and app.current_match(), 'the bout ended by itself after the point'

        app.show_screen('public')
        app.wait_for(lambda: LABEL in ((app.live_court('A') or {}).get('meta') or ''), message='Live Scores shows the label')
        app.render_tv()
        app.wait_for(lambda: app.tv_screen()['meta'] == LABEL, message='the TV shows the label')

        app.open_court('A')
        app.next_match(settle=True)
        nxt = app.current_match()
        assert nxt and (nxt['white'], nxt['red']) != (before['white'], before['red']), 'Next Match ends the daihyosen bout'
        assert not problems, problems
        browser.close()
    print('PASS a team round-robin daihyosen bout is labelled "Daihyosen — first point wins" on the court, Live Scores and the TV; '
          'it ends with Next Match')


if __name__ == '__main__':
    main()
