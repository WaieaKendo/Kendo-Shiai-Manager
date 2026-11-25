"""Hansoku shown on Live Scores and the TV like the court screen (owner decision 5, #29).

Before: Live Scores and the TV showed only the point an opponent gets for the second hansoku;
the hansoku triangles were on the court screen only. Now each side's hansoku (one triangle each)
show next to the fighter on Live Scores and the TV for an individual match, on the TV's team
sheet rows and on a Live Scores team card's current bout, as the court screen shows them, live
while the match is scored and kept for finished bouts.

Offline: an individual round robin and (a second device) a 3-person team round robin, each on
Court A, scored from the court screen; Live Scores and the TV display (drawn in the same page) read.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def text(page, testid, root):
    el = page.locator(f'{root} {sel(testid)}')
    return el.first.text_content().replace(' ', '') if el.count() else ''


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Court', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': [
            {'name': n, 'dojo': d, 'seed': '', 'status': 'Checked'} for n, d in (('Aki', 'Aiea'), ('Bo', 'Hilo'), ('Cy', 'Kona'))]}])
        live, tv = '[data-testid="live-court-A"]', '[data-testid="tv-display"]'

        app.open_court('A')
        app.hansoku('W')
        app.hansoku('W')
        app.hansoku('R')
        court = (text(page, 'court-white-hansoku', '#score'), text(page, 'court-red-hansoku', '#score'))
        assert court == ('△△', '△'), court
        app.show_screen('public')
        app.wait_for(lambda: text(page, 'live-white-hansoku', live) == '△△', message='Live Scores: two white hansoku')
        assert text(page, 'live-red-hansoku', live) == '△', 'Live Scores: one red hansoku'
        app.render_tv()
        app.wait_for(lambda: text(page, 'tv-white-hansoku', tv) == '△△', message='TV: two white hansoku')
        assert text(page, 'tv-red-hansoku', tv) == '△', 'TV: one red hansoku'

        # A team bout (a second offline device): the TV's sheet row and the Live Scores card's current bout.
        page2 = browser.new_page(viewport={'width': 1280, 'height': 900})
        team = KsmApp.local(page2, 'Team court', problems=problems)
        team.answers['Create Staff password'] = ''
        team.configure([{'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 3, 'court': 'A'}])
        team.open_court('A')
        team.hansoku('R')
        team.show_screen('public')
        team.wait_for(lambda: text(page2, 'live-red-hansoku', live) == '△', message='Live Scores team card: one red hansoku')
        assert text(page2, 'live-white-hansoku', live) == '', 'no white hansoku on the team card'
        team.render_tv()
        team.wait_for(lambda: text(page2, 'tv-red-hansoku', tv) == '△', message='TV team sheet: one red hansoku on the bout')
        assert not problems, problems
        browser.close()
    print('PASS hansoku on Live Scores and the TV (individual match and team bout), as on the court screen')


if __name__ == '__main__':
    main()
