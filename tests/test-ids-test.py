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
    'nav-tv', 'nav-tv-a', 'nav-tv-b', 'nav-overlay-a', 'nav-overlay-b', 'nav-overview', 'nav-results', 'nav-export', 'nav-save-load',
    'nav-new-tournament', 'nav-save-now', 'nav-library', 'nav-tournament-access',
    'nav-export-brackets', 'nav-cloud-diagnostics', 'nav-download-recovery', 'nav-load-recovery', 'recovery-file-input',
    'nav-download-file', 'nav-load-file', 'load-file-input', 'nav-export-results', 'nav-export-referees', 'nav-export-archive',
    'staff-auth', 'connection-status', 'save-status', 'home-new-tournament',
    # setup
    'setup-tournament-name', 'setup-division-rows', 'custom-division-name', 'custom-division-format',
    'custom-division-court', 'custom-division-add', 'team-enabled', 'team-format', 'team-tournament-format',
    'team-court', 'setup-save-continue', 'exhibition-enabled',
    # registration
    'reg-tab-individual', 'reg-tab-team', 'reg-tab-pools', 'generate-button', 'tournament-status',
    'reg-add-row', 'reg-filter', 'team-add', 'validation-modal', 'pool-division-select',
    'reg-tab-exhibition', 'regenerate-division-button', 'reg-import-csv', 'reg-export-csv', 'reg-paste-excel',
    'reg-clear', 'team-clear', 'exhibition-add', 'exhibition-add-3', 'exhibition-clear',
    'regenerate-modal', 'regenerate-modal-title', 'regenerate-modal-close',
    # print / export
    'print-full-packet', 'print-body',
    # court screen
    'court-title', 'court-tournament-name', 'court-division-select', 'court-division-title', 'court-match-meta',
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
EXHIBITION_ROW = ['exhibition-white', 'exhibition-red', 'exhibition-status', 'exhibition-remove']
REGENERATE_OPTION = ['regenerate-option-name', 'regenerate-option-radio', 'regenerate-option-status']
# Rendered only in a given state; checked where the flow below reaches that state.
POOLS_VIEW = {'pool-edit': 1, 'pool-slot': 4}
POOL_EDIT = {'pool-edit-pool': 1, 'pool-edit-player': 4, 'pool-edit-drop': 5, 'pool-edit-save': 1}  # a drop slot around each player
COURT_POOL_CONTEXT = ['context-pool', 'context-pool-title']
TV_SCREEN = ['tv-canvas', 'tv-header', 'tv-upcoming', 'tv-upcoming-card', 'tv-upcoming-white', 'tv-upcoming-red']
# Also in the contract, exercised by the feature tests that need their state (docs/TESTING.md):
# access-link/-copy/-qr, cloud-modal(-title/-close), diagnostics-retry, home-tournament(-name),
# file-load-name/-saved/-revision/-id/-open/-message/-cancel/-replace/-new (file-import-export-test),
# regenerate-confirm (registration-screen-test),
# print-pool(-player), print-slot, representative-select/-readonly, team-round-head,
# context-bracket, context-pool-complete, tv-kachinuki-*, tv-white-/tv-red-summary.

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
        pools = app.pools('Open')
        if sorted(sum(pools.values(), [])) != ['P1', 'P2', 'P3', 'P4']:
            errors.append(f'pools view: {pools}')
        if (found := page.evaluate(COUNT_JS, list(POOLS_VIEW))) != POOLS_VIEW:
            errors.append(f'pools view IDs: {found}, expected {POOLS_VIEW}')
        app.click('pool-edit')
        if (found := page.evaluate(COUNT_JS, list(POOL_EDIT))) != POOL_EDIT:
            errors.append(f'pool editor IDs: {found}, expected {POOL_EDIT}')
        app.pools('Open')  # leave the editor without saving
        app.nav('setup')
        page.select_option(sel('exhibition-enabled'), label='Enabled')
        app.nav('registration')
        app.click('reg-tab-exhibition')
        app.click('exhibition-add-3')
        exhibitions = page.evaluate(PER_ROW_JS, ['exhibition-row', EXHIBITION_ROW])
        if len(exhibitions) != 3 or any(set(r.values()) != {1} for r in exhibitions):
            errors.append(f'exhibition-row children: {exhibitions}')
        app.click('exhibition-clear')
        app.click('regenerate-division-button')
        options = page.evaluate(PER_ROW_JS, ['regenerate-option', REGENERATE_OPTION])
        if len(options) < 2 or any(set(r.values()) != {1} for r in options):
            errors.append(f'regenerate-option children: {options}')
        if page.evaluate(COUNT_JS, ['regenerate-continue']) != {'regenerate-continue': 1}:
            errors.append('regenerate-continue: not shown once')
        app.click('regenerate-modal-close')
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
        errors += [f'court context {k}: not shown' for k, n in page.evaluate(COUNT_JS, COURT_POOL_CONTEXT).items() if n < 1]

        # Live Scores and TV show the current match on Court A.
        app.nav('live-scores')
        live = app.live_court('A')
        if not live or live['white'] != m['white'] or live['red'] != m['red']:
            errors.append(f'live-court-A: {live} (court shows {m})')
        app.render_tv()
        tv = app.tv_screen()
        if not tv['live'] or tv['white'] != m['white'] or tv['red'] != m['red']:
            errors.append(f'tv (court A): {tv}')
        errors += [f'tv {k}: not shown' for k, n in page.evaluate(COUNT_JS, TV_SCREEN).items() if n < 1]

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
