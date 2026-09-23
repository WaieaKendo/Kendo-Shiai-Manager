"""The data-testid contract that tests/ksm_app.py (and so every UI test) relies on.

Screens will be rewritten (Vite/TypeScript, then React); they must keep these
test IDs. Singleton controls must exist exactly once; per-row IDs must appear
once per row. Uses the real app offline, as a staff session.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

SINGLETONS = [
    # header / navigation
    'nav-setup', 'nav-registration', 'nav-courts', 'nav-court-a', 'nav-court-b', 'nav-live-scores',
    'nav-tv', 'nav-tv-a', 'nav-tv-b', 'nav-overview', 'nav-results', 'nav-export', 'nav-save-load',
    'nav-new-tournament', 'nav-save-now', 'nav-library', 'nav-tournament-access',
    'staff-auth', 'connection-status', 'save-status', 'home-new-tournament',
    # setup
    'setup-tournament-name', 'setup-division-rows', 'custom-division-name', 'custom-division-format',
    'custom-division-court', 'custom-division-add', 'team-enabled', 'team-format', 'team-tournament-format',
    'team-court', 'setup-save-continue',
    # registration
    'reg-tab-individual', 'reg-tab-team', 'reg-tab-pools', 'generate-button', 'tournament-status',
    'reg-add-row', 'reg-filter', 'team-add', 'validation-modal',
    # court screen
    'court-title', 'court-division-select', 'court-division-title', 'court-match-meta',
    'court-white-name', 'court-red-name', 'court-white-points', 'court-red-points',
    'court-white-hansoku', 'court-red-hansoku', 'court-context', 'court-queue',
    *[f'point-{side}-{letter}' for side in ('white', 'red') for letter in 'MKDT'],
    'hansoku-white', 'hansoku-red', 'next-match', 'undo', 'redo', 'fusen-gachi',
    'fusen-white', 'fusen-red', 'fusen-cancel',
    # audience screens
    'overview-progress', 'overview-courts', 'live-scores', 'tv-display', 'results',
]
REG_ROW = ['reg-name', 'reg-dojo', 'reg-division', 'reg-seed', 'reg-status', 'reg-remove']
TEAM_CARD = ['team-name', 'team-remove', 'team-status', 'team-member-senpo', 'team-member-chuken', 'team-member-taisho']
SETUP_ROW = ['setup-division-enabled', 'setup-division-name', 'setup-division-format', 'setup-division-court']

COUNT_JS = """(ids) => Object.fromEntries(ids.map(id => [id, document.querySelectorAll(`[data-testid="${id}"]`).length]))"""
PER_ROW_JS = """([row, ids]) => [...document.querySelectorAll(`[data-testid="${row}"]`)].map(r =>
  Object.fromEntries(ids.map(id => [id, r.querySelectorAll(`[data-testid="${id}"]`).length])))"""


def main():
    errors = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        page.on('dialog', lambda d: d.dismiss())
        app = KsmApp.local(page)

        counts = page.evaluate(COUNT_JS, SINGLETONS)
        errors += [f'{k}: found {n}, expected exactly 1' for k, n in counts.items() if n != 1]
        ids = page.evaluate("() => [...document.querySelectorAll('[data-testid]')].map(e => e.dataset.testid)")
        errors += [f'{i}: not kebab-case' for i in sorted(set(ids)) if not all(part.isalnum() for part in i.split('-'))]

        # Generated rows: every row carries its own copy of each per-row ID.
        app.configure([
            {'name': 'Open', 'format': 'Round Robin', 'court': 'A',
             'entrants': [{'name': f'P{i}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(1, 5)]},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'teams': 2, 'court': 'B'},
        ])
        app.nav('registration')
        rows = page.evaluate(PER_ROW_JS, ['reg-row', REG_ROW])
        if len(rows) != 4 or any(set(r.values()) != {1} for r in rows):
            errors.append(f'reg-row children: {rows}')
        app.click('reg-tab-team')
        cards = page.evaluate(PER_ROW_JS, ['team-card', TEAM_CARD])
        if len(cards) != 2 or any(set(c.values()) != {1} for c in cards):
            errors.append(f'team-card children: {cards}')
        app.nav('setup')
        setup_rows = page.evaluate(PER_ROW_JS, ['setup-division-row', SETUP_ROW])
        if not setup_rows or any(set(r.values()) != {1} for r in setup_rows):
            errors.append(f'setup-division-row children: {setup_rows}')

        # Court screen shows the current match through its IDs.
        app.open_court('A')
        m = app.current_match()
        if not m or m['division'] != 'Open' or not m['white'].startswith('P') or not m['meta'].startswith('Pool'):
            errors.append(f'court screen: {m}')
        if 'Open' not in app.division_options():
            errors.append(f'court division options: {app.division_options()}')

        # Live Scores and TV show the current match on Court A.
        app.nav('live-scores')
        live = app.live_court('A')
        if not live or live['white'] != m['white'] or live['red'] != m['red']:
            errors.append(f'live-court-A: {live} (court shows {m})')
        page.evaluate('KSMTest.renderTv()')
        tv = app.tv_screen()
        if not tv['live'] or tv['white'] != m['white'] or tv['red'] != m['red']:
            errors.append(f'tv (court A): {tv}')

        # Finish the individual division; Results then lists its placements.
        app.open_court('A')
        while (cur := app.current_match()) and cur['division'] == 'Open':
            app.score_point('W', 'M')
            app.next_match()
        screen = app.court_screen()
        if not screen['complete'] or not screen['placements']:
            errors.append(f'court division-complete panel: {screen}')
        results = app.placements()
        if [place for place, _ in results.get('Open', [])][:2] != ['1st', '2nd']:
            errors.append(f'results placements: {results}')
        browser.close()

    assert not errors, '\n'.join(errors)
    print(f'PASS {len(SINGLETONS)} singleton test IDs unique; row IDs, court, live, TV and results IDs present')


if __name__ == '__main__':
    main()
