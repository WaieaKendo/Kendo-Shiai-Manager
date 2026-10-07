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

from ksm_browser import load_app, wait_for_react

API_JS = (Path(__file__).resolve().parent / 'lib' / 'ksm-test-api.js').read_text(encoding='utf-8')
SIDE = {'W': 'white', 'R': 'red', 'white': 'white', 'red': 'red'}
STATUS_CLICKS = {'Registered': 0, 'Checked': 1, 'NoShow': 2}  # Registered -> Checked In -> No Show

DEFAULT_PASSWORD = 'e2e-staff-pass'


def app_path(tid, screen=None, court=None):
    """The app's path URL for a tournament (roadmap M.9, the scheme in app/engine/routes.ts).

    app_path(tid) = /t/<id> (Live Scores, the device's court), app_path(tid, 'live'),
    app_path(tid, 'court', 'B') = /t/<id>/court/b (a court device), app_path(tid, 'tv', 'A'),
    app_path(tid, 'overlay', 'A') (the stream overlay page).
    """
    path = f'/t/{tid}'
    if screen:
        path += f'/{screen}'
    if court:
        path += f'/{court.lower()}'
    return path


def sel(testid):
    return f'[data-testid="{testid}"]'


def fetch_record(base, tid):
    """Server copy of a tournament: GET /api/tournaments/{id}."""
    with urllib.request.urlopen(f'{base}/api/tournaments/{tid}') as r:
        return json.load(r)


def put_record(base, tid, payload, revision, password=DEFAULT_PASSWORD, client_id='test-harness', name='Test harness'):
    """Save a tournament payload straight to the server, as another staff device (or an older app version) would."""
    body = json.dumps({'tournamentId': tid, 'revision': revision, 'payload': payload}).encode()
    req = urllib.request.Request(f'{base}/api/tournaments/{tid}', data=body, method='PUT', headers={
        'content-type': 'application/json', 'x-ksm-role': 'staff', 'x-ksm-session-key': password,
        'x-ksm-client-id': client_id, 'x-ksm-client-name': name})
    with urllib.request.urlopen(req) as r:
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
    court: text('tv-court').replace(/^Court\\s*/i, ''), division: text('tv-division'), meta: text('tv-meta'),
    live: !!root?.querySelector('[data-testid="tv-current-match"]'),
    complete: !!root?.querySelector('[data-testid="division-complete"]'),
    white: text('tv-white-name'), red: text('tv-red-name'),
    white_team: text('tv-white-team'), red_team: text('tv-red-team'),
    white_score: text('tv-white-score'), red_score: text('tv-red-score'),
    white_summary: text('tv-white-summary'), red_summary: text('tv-red-summary'),
  };
}"""

_LIVE_JS = """(court) => {
  const card = document.querySelector(`[data-testid="live-scores"] [data-testid="live-court-${court}"]`);
  const text = id => (card?.querySelector(`[data-testid="${id}"]`)?.textContent || '').trim();
  // Team matches show a team sheet; its current bout carries the names.
  if (!card) return null;
  const out = {meta: text('live-meta'), white: text('live-white-name') || text('current-bout-white-name'),
               red: text('live-red-name') || text('current-bout-red-name')};
  // A court whose division is complete shows its placements in the card (F16).
  const rows = [...card.querySelectorAll('[data-testid="division-complete-row"]')];
  if (card.querySelector('[data-testid="division-complete"]')) out.placements = rows.map(r => r.innerText.trim().split(/\\s*\\n\\s*/));
  return out;
}"""

_POOL_DRAG_JS = """([player, pool, index]) => {
  const dt = new DataTransfer(), source = document.querySelector(player), target = document.querySelectorAll(pool)[index];
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt}));
  fire(source, 'dragstart'); fire(target, 'dragover'); fire(target, 'drop'); fire(source, 'dragend');
}"""

# Live Scores showing one division's placements instead of the courts: the rows, or None.
_LIVE_PLACEMENTS_JS = """() => {
  const live = document.querySelector('[data-testid="live-scores"]');
  if (!live || live.querySelector('[data-testid^="live-court-"]')) return null;
  const panel = live.querySelector('[data-testid="division-complete"]');
  return panel ? [...panel.querySelectorAll('[data-testid="division-complete-row"]')].map(r => r.innerText.trim().split(/\\s*\\n\\s*/)) : null;
}"""


class KsmApp:
    def __init__(self, page, name='device', problems=None):
        self.page = page
        self.name = name
        self.problems = problems if problems is not None else []
        self.answers, self.expected, self.seen_dialogs = {}, {}, []
        page.add_init_script(API_JS)

    # ------------------------------------------------------------------ devices
    @classmethod
    def local(cls, page, name='local', session='staff', problems=None):
        """Offline app on the fake http://ksm.test origin (see ksm_browser.load_app).

        With a `problems` list, dialogs and page errors are handled as on open_device()
        (expect_dialog() answers documented ones, anything else is recorded).
        """
        app = cls(page, name, problems)
        if problems is not None:
            page.on('dialog', app._on_dialog)
            page.on('pageerror', lambda e: problems.append(f'{name}: page error: {e}'))
        load_app(page, session=session)
        return app

    @classmethod
    def open_device(cls, browser, base, name, problems, path='/', password=DEFAULT_PASSWORD,
                    tournament_name='KSM E2E Cup', viewport=None, clock=False, before_load=None, service_workers='block'):
        """A separate device (own browser context) opening `path` on a live backend.

        Answers the app's prompts (tournament name, staff password, device name);
        any other dialog, or a page error, is recorded in `problems`.
        clock=True installs Playwright's clock first, so a test can fast-forward time;
        before_load(page) runs before the page opens (e.g. to route its live socket).
        service_workers='allow' lets the app's service worker run (the offline checks).
        """
        ctx = browser.new_context(viewport=viewport or {'width': 1280, 'height': 900}, service_workers=service_workers)
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
        if clock:
            page.clock.install()
        if before_load:
            before_load(page)
        page.goto(base + path, wait_until='domcontentloaded')
        page.wait_for_function('window.KSMTest && KSMTest.booted()')
        wait_for_react(page)
        return app

    def expect_dialog(self, prefix, accept=False):
        """Answer a dialog that is a known (documented) app behaviour instead of flagging it.

        Seen messages are collected in `self.seen_dialogs`, so a test can assert the
        behaviour still happens (an expected-failure check for a recorded finding).
        """
        self.expected[prefix] = accept

    def wait_for_dialogs(self, count=1, timeout=10):
        """Wait until `count` expected dialogs have been seen (see expect_dialog); returns them.

        Polls through the page, so Playwright delivers the dialog events meanwhile.
        """
        deadline = time.time() + timeout
        while len(self.seen_dialogs) < count:
            if time.time() > deadline:
                raise AssertionError(f'{self.name}: expected {count} dialog(s), saw {self.seen_dialogs}')
            self.page.wait_for_timeout(50)
        return self.seen_dialogs

    def _on_dialog(self, d):
        for prefix, accept in self.expected.items():
            if d.message.startswith(prefix):
                self.seen_dialogs.append(d.message)
                return d.accept() if accept else d.dismiss()
        for prefix, answer in self.answers.items():
            if d.message.startswith(prefix):
                return d.accept(answer)
        self.problems.append(f'{self.name}: unexpected {d.type}: {d.message}')
        d.accept()

    def close(self):
        self.page.context.close()

    def reload(self):
        """Reload the page (power cut, browser restart) and wait for the app to boot again."""
        self.page.reload(wait_until='domcontentloaded')
        self.page.wait_for_function('window.KSMTest && KSMTest.booted()')
        wait_for_react(self.page)

    def goto(self, path):
        """Open `path` (e.g. app_path(tid, 'tv', 'B'), or an old ?tournament= link) in this device's page."""
        origin = self.page.url.split('/', 3)[:3]
        self.page.goto('/'.join(origin) + path, wait_until='domcontentloaded')
        self.page.wait_for_function('window.KSMTest && KSMTest.booted()')
        wait_for_react(self.page)

    def address(self):
        """The page's address without the origin: path, query and hash (e.g. /t/<id>/court/b)."""
        return '/' + self.page.url.split('/', 3)[3]

    def visible_view(self):
        """The screens (main > .view ids) shown: ['public'] for Live Scores, ['home'], ['tv'], ..."""
        return self.page.evaluate("() => [...document.querySelectorAll('main > .view')].filter(v => getComputedStyle(v).display !== 'none').map(v => v.id)")

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

    def outbox(self):
        """(test API) The snapshot queued for the cloud, or None: {tournamentId, role, baseRevision, reason}."""
        return self.page.evaluate('KSMTest.outbox()')

    def has_autosave(self):
        """(test API) Whether this browser holds a local autosave (what the restore prompt offers)."""
        return self.page.evaluate('KSMTest.hasAutosave()')

    def receive(self, record):
        """(test API) Deliver a server record as if it came over the live socket; True if applied."""
        return self.page.evaluate('r => KSMTest.receive(r)', record)

    def payload(self):
        """(test API) This device's tournament as it would be saved (a copy, as a dict)."""
        return self.page.evaluate('KSMTest.payload()')

    def apply_live_update(self, payload):
        """(test API) Apply a tournament copy as an applied live update does (state replaced, redrawn)."""
        self.page.evaluate('p => KSMTest.applyLiveUpdate(p)', payload)

    def watch_saves(self):
        """(test API) Start counting the saves this device asks for (see saves_asked)."""
        self.page.evaluate('KSMTest.watchSaves()')

    def saves_asked(self):
        """(test API) Saves asked for (scheduled or immediate) since the last call."""
        return self.page.evaluate('KSMTest.savesAsked()')

    def client_id(self):
        """(test API) This device's client ID (sent with every save)."""
        return self.page.evaluate('KSMTest.clientId()')

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

    def staff_login_attempt(self, password, timeout=10):
        """Staff Login answered with `password` (this attempt only): returns the alert the app shows
        ('Incorrect Staff password.', or the server's attempt-limit message), or '' once logged in."""
        alerts = ('Incorrect Staff password', 'Too many incorrect Staff passwords')
        for prefix in alerts:
            self.expect_dialog(prefix)
        seen, answer = len(self.seen_dialogs), self.answers.get('Enter Staff password')
        self.answers['Enter Staff password'] = password
        try:
            self.click('staff-auth')
            deadline = time.time() + timeout
            while len(self.seen_dialogs) == seen:
                if self.page.evaluate(f"document.querySelector('{sel('staff-auth')}').textContent.trim() === 'Logout'"):
                    return ''
                if time.time() > deadline:
                    raise AssertionError(f'{self.name}: Staff Login neither logged in nor alerted')
                self.page.wait_for_timeout(50)
            return self.seen_dialogs[seen]
        finally:
            self.answers['Enter Staff password'] = answer
            for prefix in alerts:
                self.expected.pop(prefix, None)

    def staff_logout(self):
        self.click('staff-auth')
        self.page.wait_for_function(f"document.querySelector('{sel('staff-auth')}').textContent.trim() === 'Staff Login'", timeout=10000)

    def open_court(self, court):
        """Courts menu -> Court A/B."""
        self.click('nav-courts')
        self.click(f'nav-court-{court.lower()}')
        self.page.wait_for_selector(f'#score {sel("court-title")}:has-text("Court {court.upper()}")')

    def tv_link(self, court):
        """TV menu -> Court A/B TV: returns the link the app opens for the TV display.

        The new window's request is answered with an empty page, so the TV app does
        not run inside this device's browser profile; open the link on its own device.
        """
        ctx, captured = self.page.context, []

        def grab(route):
            captured.append(route.request.url)
            route.fulfill(status=200, content_type='text/html', body='')
        is_tv = lambda url: '/tv/' in url
        ctx.route(is_tv, grab)
        try:
            self.click('nav-tv')
            with ctx.expect_page() as popup:
                self.click(f'nav-tv-{court.lower()}')
            popup.value.wait_for_load_state()
            popup.value.close()
        finally:
            ctx.unroute(is_tv, grab)
        assert captured, f'{self.name}: TV menu did not open a TV link'
        return captured[0]

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

    def pools(self, division):
        """Registration -> Pools for `division`: {pool label: [player names]}."""
        page = self.page
        self.nav('registration')
        self.click('reg-tab-pools')
        page.select_option(sel('pool-division-select'), label=division)
        return page.evaluate("""() => Object.fromEntries([...document.querySelectorAll('[data-testid="pool"]')].map(p => [
          p.querySelector('[data-testid="pool-title"]').textContent.replace(/^(Team )?Pool\\s*/, '').trim(),
          [...p.querySelectorAll('[data-testid="pool-player"]')].map(x => x.textContent.trim())]))""")

    def pool_edit_move(self, to_pool=1):
        """Edit Pool (open on the Pools view): drag the editor's first player onto pool `to_pool`.

        The drag events a mouse drag fires, sharing one DataTransfer, dispatched (Chromium's
        headless mouse drag is unreliable here); as pool-edit-safety-test.py does."""
        self.page.evaluate(_POOL_DRAG_JS, [sel('pool-edit-player'), sel('pool-edit-pool'), to_pool])

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

    def next_match(self, settle=False):
        """Court screen -> Next Match. settle=True waits until the screen has moved on from the
        match just finished: the court screen is React and redraws just after the click, so a
        test that reads the screen right away could still see (and re-log) the old match."""
        before = self.court_screen() if settle else None
        self.click('next-match')
        if settle:
            self.wait_for(lambda: self.court_screen() != before, timeout=15,
                          message='the court screen to move on from the finished match')

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

    # ------------------------------------------------------------------ files
    def download(self, testid, menu=None):
        """Click a control that downloads a file (opening `menu` first, e.g. 'nav-save-load').

        Returns (suggested file name, local path of the downloaded file).
        """
        if menu:
            self.click(menu)
        with self.page.expect_download() as dl:
            self.click(testid)
        return dl.value.suggested_filename, dl.value.path()

    def download_tournament_file(self):
        """Save / Load -> Download Tournament File: (the parsed .ksm file, its local path)."""
        _, path = self.download('nav-download-file', menu='nav-save-load')
        return json.loads(Path(path).read_text(encoding='utf-8')), path

    def _choose_file(self, testid, path):
        self.click('nav-save-load')
        with self.page.expect_file_chooser() as chooser:
            self.click(testid)
        chooser.value.set_files(str(path))

    def load_tournament_file(self, path):
        """Save / Load -> Load Tournament File, picking `path` in the file chooser."""
        self._choose_file('nav-load-file', path)

    def load_recovery_file(self, path):
        """Save / Load -> Load Recovery File, picking `path` in the file chooser."""
        self._choose_file('nav-load-recovery', path)

    # ------------------------------------------------------------ audience views
    def placements(self):
        """Results page: {division: [(place, name), ...]} for every division card."""
        self.nav('results')
        return {div: [tuple(r) for r in rows] for div, rows in self.page.evaluate(_RESULTS_JS).items()}

    def render_tv(self):
        """(test API) Render the TV display inside this page (offline tests; a TV device uses tv_link())."""
        self.page.evaluate('KSMTest.renderTv()')

    def tv_screen(self):
        """TV display (/t/<id>/tv/a|b): court, division, meta, current names or completion, scores, team summaries."""
        return self.page.evaluate(_TV_JS)

    def tv_upcoming(self):
        """TV Upcoming Matches cards: [(white, red)] or None for an empty card."""
        return self.page.evaluate("""() => [...document.querySelectorAll('[data-testid="tv-upcoming-card"]')].map(c => {
          const w = c.querySelector('[data-testid="tv-upcoming-white"]'), r = c.querySelector('[data-testid="tv-upcoming-red"]');
          return w ? [w.innerText.trim(), r.innerText.trim()] : null; })""")

    def live_court(self, court):
        """Live Scores card for a court: {meta, white, red}, plus `placements` [[place, name]] when the
        card shows its finished division's placements (the page must be showing Live Scores)."""
        return self.page.evaluate(_LIVE_JS, court)

    def live_placements(self):
        """Live Scores showing a division's placements instead of the courts: [[place, name]], else None."""
        return self.page.evaluate(_LIVE_PLACEMENTS_JS)

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
