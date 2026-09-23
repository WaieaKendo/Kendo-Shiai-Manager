"""KsmApp: the single place Python browser tests talk to the KSM app.

Tests describe what a person does ("log in as staff", "open Court A", "score
Men for White", "read the Results page"); this module turns that into clicks on
stable `data-testid` controls (see docs/TESTING.md for the naming convention).
When a screen is rewritten (Vite/TypeScript, then React), keep the test IDs and
only this file (plus tests/lib/ksm-test-api.js) may need to change.

Where the app has no UI for something (bulk setup, sync status, engine
snapshots), the helper calls `window.KSMTest`, defined in
tests/lib/ksm-test-api.js: the only code that touches index.html globals.
Methods that do so say "(test API)" in their docstring.
"""
import json
import time
import urllib.request
from pathlib import Path

from ksm_browser import load_app

API_JS = (Path(__file__).resolve().parent / 'lib' / 'ksm-test-api.js').read_text(encoding='utf-8')
SIDE = {'W': 'white', 'R': 'red', 'white': 'white', 'red': 'red'}
STATUS_CLICKS = {'Registered': 0, 'Checked': 1, 'NoShow': 2}  # Registered -> Checked In -> No Show

DEFAULT_PASSWORD = 'e2e-staff-pass'


def sel(testid):
    return f'[data-testid="{testid}"]'


def fetch_record(base, tid):
    """Server copy of a tournament: GET /api/tournaments/{id}."""
    with urllib.request.urlopen(f'{base}/api/tournaments/{tid}') as r:
        return json.load(r)


# Reads the court (scorekeeper) screen through its test IDs only.
_COURT_JS = """() => {
  const q = id => document.querySelector(`#score [data-testid="${id}"]`);
  const text = id => (q(id)?.textContent || '').trim();
  const select = q('court-division-select');
  return {
    court: text('court-title').replace(/^Court\\s*/, ''),
    division: text('court-division-title'),
    selected: select ? select.value : '',
    options: select ? [...select.options].map(o => o.textContent.trim()) : [],
    complete: !!q('division-complete'),
    placements: [...document.querySelectorAll('#score [data-testid="division-complete-row"]')].map(r => r.innerText.trim().split(/\\s*\\n\\s*/)),
    meta: text('court-match-meta'),
    white: text('court-white-name'), red: text('court-red-name'),
    white_points: text('court-white-points'), red_points: text('court-red-points'),
  };
}"""

_RESULTS_JS = """() => Object.fromEntries([...document.querySelectorAll('#results [data-testid="result-card"]')].map(card => [
  card.querySelector('[data-testid="result-card-title"]').textContent.trim(),
  [...card.querySelectorAll('[data-testid="placement-row"]')].map(r => [
    r.querySelector('[data-testid="placement-place"]').textContent.trim(),
    r.querySelector('[data-testid="placement-name"]').textContent.trim()]),
]))"""

_TV_JS = """() => {
  const root = document.querySelector('[data-testid="tv-display"]');
  const text = id => (root?.querySelector(`[data-testid="${id}"]`)?.innerText || '').replace(/\\s+/g, ' ').trim();
  return {
    court: text('tv-court').replace(/^Court\\s*/, ''), division: text('tv-division'), meta: text('tv-meta'),
    live: !!root?.querySelector('[data-testid="tv-current-match"]'),
    complete: !!root?.querySelector('[data-testid="division-complete"]'),
    white: text('tv-white-name'), red: text('tv-red-name'),
    white_team: text('tv-white-team'), red_team: text('tv-red-team'),
  };
}"""

_LIVE_JS = """(court) => {
  const card = document.querySelector(`[data-testid="live-scores"] [data-testid="live-court-${court}"]`);
  const text = id => (card?.querySelector(`[data-testid="${id}"]`)?.textContent || '').trim();
  return card ? {meta: text('live-meta'), white: text('live-white-name'), red: text('live-red-name')} : null;
}"""


class KsmApp:
    def __init__(self, page, name='device', problems=None):
        self.page = page
        self.name = name
        self.problems = problems if problems is not None else []
        page.add_init_script(API_JS)

    # ------------------------------------------------------------------ devices
    @classmethod
    def local(cls, page, name='local', session='staff'):
        """Offline app on the fake http://ksm.test origin (see ksm_browser.load_app)."""
        app = cls(page, name)
        load_app(page, session=session)
        return app

    @classmethod
    def open_device(cls, browser, base, name, problems, path='/', password=DEFAULT_PASSWORD,
                    tournament_name='KSM E2E Cup', viewport=None):
        """A separate device (own browser context) opening `path` on a live backend.

        Answers the app's prompts (tournament name, staff password, device name);
        any other dialog, or a page error, is recorded in `problems`.
        """
        ctx = browser.new_context(viewport=viewport or {'width': 1280, 'height': 900}, service_workers='block')
        page = ctx.new_page()
        app = cls(page, name, problems)
        app.answers = {
            'Tournament Name': tournament_name,
            'Create Staff password': password,
            'Confirm Staff password': password,
            'Enter Staff password': password,
            'Name this device': name,
        }
        page.on('dialog', app._on_dialog)
        page.on('pageerror', lambda e: problems.append(f'{name}: page error: {e}'))
        page.goto(base + path, wait_until='domcontentloaded')
        page.wait_for_function('window.KSMTest && KSMTest.booted()')
        return app

    def _on_dialog(self, d):
        for prefix, answer in self.answers.items():
            if d.message.startswith(prefix):
                return d.accept(answer)
        self.problems.append(f'{self.name}: unexpected {d.type}: {d.message}')
        d.accept()

    def close(self):
        self.page.context.close()

    # --------------------------------------------------------- cloud / sync status
    def tournament_id(self):
        """(test API) Cloud tournament ID of this device."""
        return self.page.evaluate('KSMTest.tournamentId()')

    def revision(self):
        """(test API) Last cloud revision this device has seen."""
        return self.page.evaluate('KSMTest.revision()')

    def wait_idle(self, timeout=30):
        """(test API) Wait until every local change is confirmed by the server."""
        self.page.wait_for_function('!KSMTest.pending()', timeout=timeout * 1000)

    def wait_revision(self, rev, timeout=15):
        """(test API) Wait until this device has caught up with server revision `rev`."""
        self.page.wait_for_function('rev => KSMTest.revision() >= rev', arg=rev, timeout=timeout * 1000)

    def wait_generated(self, timeout=20):
        """(test API) Wait until this device has a generated tournament."""
        self.page.wait_for_function('KSMTest.generated()', timeout=timeout * 1000)

    def all_matches(self):
        """(test API) The device's copy of every division's match list."""
        return self.page.evaluate('KSMTest.allMatches()')

    def diagnostics(self):
        """(test API) Cloud diagnostics state (rebase attempts etc.)."""
        return self.page.evaluate('KSMTest.diagnostics()')

    # ----------------------------------------------------------- engine (test API)
    def configure(self, entries):
        """(test API) Set up divisions/competitors/teams and generate, without the UI.

        entries: [{'name', 'format', 'court', 'entrants': [{name, dojo, seed, status}]},
                  {'team': True, 'format', 'tournament', 'teams', 'court'}]
        """
        self.page.evaluate('entries => KSMTest.configure(entries)', entries)

    def save_now(self, label='test save'):
        """(test API) Save immediately (what a completed action does)."""
        self.page.evaluate('label => KSMTest.saveNow(label)', label)

    def structure(self):
        """(test API) Pools and match list of every generated division."""
        return self.page.evaluate('KSMTest.structure()')

    def final_state(self):
        """(test API) Matches, standings, completion and placements per division."""
        return self.page.evaluate('KSMTest.finalState()')

    def standings(self, division):
        """(test API) Pool standings {pool label: [{name, wins, pts}]}."""
        return self.page.evaluate('div => KSMTest.standings(div)', division)

    # -------------------------------------------------------------- navigation
    def show_screen(self, view):
        """(test API) Switch to a screen: setup, registration, score, public, director, results."""
        self.page.evaluate('view => KSMTest.show(view)', view)

    def click(self, testid):
        self.page.click(sel(testid))

    def nav(self, item):
        """Main navigation: setup, registration, live-scores, overview, results."""
        self.click(f'nav-{item}')

    def create_tournament(self, timeout=20):
        """Home page '+ New Tournament' (answers name/password prompts); waits for the cloud ID."""
        self.click('home-new-tournament')
        self.page.wait_for_function('KSMTest.tournamentId()', timeout=timeout * 1000)
        return self.tournament_id()

    def staff_login(self):
        self.click('staff-auth')
        self.page.wait_for_function(f"document.querySelector('{sel('staff-auth')}').textContent.trim() === 'Logout'", timeout=10000)

    def staff_logout(self):
        self.click('staff-auth')
        self.page.wait_for_function(f"document.querySelector('{sel('staff-auth')}').textContent.trim() === 'Staff Login'", timeout=10000)

    def open_court(self, court):
        """Courts menu -> Court A/B."""
        self.click('nav-courts')
        self.click(f'nav-court-{court.lower()}')
        self.page.wait_for_selector(f'#score {sel("court-title")}:has-text("Court {court.upper()}")')

    def tv_link(self, court):
        """TV menu -> Court A/B TV opens the TV display in a new window; returns its URL."""
        self.click('nav-tv')
        with self.page.context.expect_page() as popup:
            self.click(f'nav-tv-{court.lower()}')
        tv = popup.value
        url = tv.url
        tv.close()
        return url

    # -------------------------------------------------------------------- setup
    def setup_divisions(self, divisions):
        """Setup screen: enable exactly `divisions` [(name, format, court)].

        Preset divisions not listed are switched off; others are added as custom divisions.
        court: 'A' | 'B' | 'split'.
        """
        page = self.page
        self.nav('setup')
        wanted = {name: (fmt, court) for name, fmt, court in divisions}
        rows = page.locator(sel('setup-division-row'))
        for i in range(rows.count()):
            row = rows.nth(i)
            name = row.locator(sel('setup-division-name')).inner_text().strip()
            box = row.locator(sel('setup-division-enabled'))
            if name not in wanted and box.is_checked():
                box.uncheck()
        for name, (fmt, court) in wanted.items():
            row = page.locator(sel('setup-division-row'), has=page.locator(sel('setup-division-name'), has_text=name))
            if row.count() == 0:
                page.fill(sel('custom-division-name'), name)
                page.select_option(sel('custom-division-format'), label=fmt)
                page.select_option(sel('custom-division-court'), value=court)
                self.click('custom-division-add')
                row = page.locator(sel('setup-division-row'), has=page.locator(sel('setup-division-name'), has_text=name))
            box = row.locator(sel('setup-division-enabled'))
            if not box.is_checked():
                box.check()
            row.locator(sel('setup-division-format')).select_option(label=fmt)
            row.locator(sel('setup-division-court')).select_option(value=court)

    def setup_team_event(self, fmt='3-Person Team', tournament='Single Elimination', court='Both', enabled=True):
        """Setup screen: team tournament settings. court: 'A' | 'B' | 'Both'."""
        page = self.page
        self.nav('setup')
        page.select_option(sel('team-enabled'), label='Enabled' if enabled else 'Disabled')
        if enabled:
            page.select_option(sel('team-format'), label=fmt)
            page.select_option(sel('team-tournament-format'), label=tournament)
            page.select_option(sel('team-court'), label=court)

    # ------------------------------------------------------------- registration
    def register(self, name, dojo, division, seed='', status='Checked'):
        """Registration -> Individual: add a row and fill it in like a person would."""
        page = self.page
        if not page.is_visible(sel('reg-add-row')):
            self.nav('registration')
            self.click('reg-tab-individual')
        self.click('reg-add-row')
        row = page.locator(sel('reg-row')).last
        row.locator(sel('reg-name')).fill(name)
        row.locator(sel('reg-name')).press('Tab')
        row.locator(sel('reg-dojo')).fill(dojo)
        row.locator(sel('reg-dojo')).press('Tab')
        row.locator(sel('reg-division')).select_option(label=division)
        if seed:
            row.locator(sel('reg-seed')).fill(str(seed))
            row.locator(sel('reg-seed')).press('Tab')
        for _ in range(STATUS_CLICKS[status]):
            page.locator(sel('reg-row')).last.locator(sel('reg-status')).click()

    def register_team(self, team, members, status='Checked'):
        """Registration -> Team: add a team card; members = {'senpo': ..., 'chuken': ..., 'taisho': ...}."""
        page = self.page
        if not page.is_visible(sel('team-add')):
            self.nav('registration')
            self.click('reg-tab-team')
        self.click('team-add')
        card = page.locator(sel('team-card')).last
        card.locator(sel('team-name')).fill(team)
        card.locator(sel('team-name')).press('Tab')
        for slot, person in members.items():
            field = card.locator(sel(f'team-member-{slot}'))
            field.fill(person)
            field.press('Tab')
        for _ in range(STATUS_CLICKS[status]):
            page.locator(sel('team-card')).last.locator(sel('team-status')).click()

    def generate(self):
        """Registration -> Generate Tournament -> confirm in the validation dialog."""
        page = self.page
        self.nav('registration')
        self.click('generate-button')
        page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
        confirm = page.locator(sel('generate-confirm'))
        if confirm.count() == 0:
            raise AssertionError('Tournament validation failed:\n' + page.inner_text(sel('validation-modal')))
        confirm.click()

    # ---------------------------------------------------------- court (scorekeeper)
    def court_screen(self):
        """What the court screen shows: division, match meta, names, points, completion."""
        return self.page.evaluate(_COURT_JS)

    def current_match(self):
        """The match on the court screen, or None when there is nothing to score."""
        s = self.court_screen()
        if s['complete'] or s['meta'] in ('', 'No active match') or s['white'] in ('', '—'):
            return None
        return s

    def score_point(self, side, letter):
        """side: 'W'/'R' (or 'white'/'red'); letter: M, K, D, T."""
        self.click(f'point-{SIDE[side]}-{letter}')

    def hansoku(self, side):
        self.click(f'hansoku-{SIDE[side]}')

    def next_match(self):
        self.click('next-match')

    def undo(self):
        self.click('undo')

    def redo(self):
        self.click('redo')

    def fusen_gachi(self, forfeiting_side):
        self.click('fusen-gachi')
        self.click(f'fusen-{SIDE[forfeiting_side]}')

    def division_options(self):
        """Divisions offered by the court's division selector."""
        return self.court_screen()['options']

    def switch_division(self, division):
        """Court screen division selector (what a scorekeeper does when a division ends)."""
        self.page.select_option(f'#score {sel("court-division-select")}', label=division)

    # ------------------------------------------------------------ audience views
    def placements(self):
        """Results page: {division: [(place, name), ...]} for every division card."""
        self.nav('results')
        return {div: [tuple(r) for r in rows] for div, rows in self.page.evaluate(_RESULTS_JS).items()}

    def tv_screen(self):
        """TV display (?view=tv): court, division, meta, current names or completion."""
        return self.page.evaluate(_TV_JS)

    def live_court(self, court):
        """Live Scores card for a court: {meta, white, red} (the page must be showing Live Scores)."""
        return self.page.evaluate(_LIVE_JS, court)

    def wait_for(self, predicate, timeout=15, interval=0.1, message='condition'):
        """Poll a Python predicate (e.g. lambda: app.tv_screen()['white'] == 'X')."""
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            last = predicate()
            if last:
                return last
            time.sleep(interval)
        raise AssertionError(f'{self.name}: timed out waiting for {message}')
