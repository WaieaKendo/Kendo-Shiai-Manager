"""Live Scores and the TV between matches (owner decision 6, #29).

While a court's division waits (e.g. a split single elimination's final waiting for the
semifinal on the other court), Live Scores said "Waiting for the next match" with no reason and
the TV showed an empty current-match zone and empty Upcoming cards. Now both say "Waiting for the
next match" with the reason when it is known ("Final waits for the semifinal on Court B"), and
show "Up next on this court": the first matches of the next division in the court's running order
(Setup, #31) that has its matches drawn, clearly marked as upcoming.

Offline, one device: a single elimination of 4 split between the courts (Split) and a round
robin (Masters) on Court A, in that order. Court A plays its semifinal; Live Scores and the Court
A TV (drawn in the same page) are read.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def people(prefix, n):
    return [{'name': f'{prefix} {i}', 'dojo': f'{prefix} Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(1, n + 1)]


def inner(page, root, testid):
    el = page.locator(f'{root} {sel(testid)}')
    return ' '.join(el.first.inner_text().split()) if el.count() else None


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Court A', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        app.configure([
            {'name': 'Split', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('S', 4)},
            {'name': 'Masters', 'format': 'Round Robin', 'court': 'A', 'entrants': people('M', 2)},
        ])
        app.open_court('A')
        assert app.court_screen()['division'] == 'Split', app.court_screen()
        while app.current_match() and app.court_screen()['division'] == 'Split':
            app.score_point('W', 'M')
            app.next_match(settle=True)
        assert not app.court_screen()['complete'], 'Split waits for Court B'

        app.show_screen('public')
        card = '[data-testid="live-court-A"]'
        app.wait_for(lambda: inner(page, card, 'live-waiting-reason'), message='Live Scores: the reason')
        assert 'Waiting for the next match' in page.inner_text(card), page.inner_text(card)
        assert inner(page, card, 'live-waiting-reason') == 'Final waits for the semifinal on Court B', inner(page, card, 'live-waiting-reason')
        up = inner(page, card, 'live-up-next')
        # (the Next line's CSS shows it in capitals)
        assert up and up.lower().startswith('up next on this court: masters') and 'm 1 vs m 2' in up.lower(), f'Live Scores up next: {up!r}'

        app.render_tv()
        tv = '[data-testid="tv-display"]'
        app.wait_for(lambda: inner(page, tv, 'tv-waiting'), message='the TV: waiting')
        assert inner(page, tv, 'tv-waiting') == 'Waiting for the next match', inner(page, tv, 'tv-waiting')
        assert inner(page, tv, 'tv-waiting-reason') == 'Final waits for the semifinal on Court B'
        assert app.tv_upcoming_title() == 'Up next on this court: Masters', app.tv_upcoming_title()
        assert app.tv_upcoming()[0] == ['M 1', 'M 2'], app.tv_upcoming()
        assert not problems, problems
        browser.close()
    print('PASS between matches: "Waiting for the next match" with the reason and "Up next on this court" on Live Scores and the TV')


if __name__ == '__main__':
    main()
