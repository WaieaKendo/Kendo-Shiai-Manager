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
import re
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeout

from ksm_browser import API_JS, install_test_api, load_app, wait_for_react

SIDE = {'W': 'white', 'R': 'red', 'white': 'white', 'red': 'red'}
STATUS_CLICKS = {'Registered': 0, 'Checked': 1, 'NoShow': 2}  # Registered -> Checked In -> No Show

DEFAULT_PASSWORD = 'e2e-staff-pass'


# The saved format the app understands (KSM_CLIENT_SCHEMA, app/js/01-team-divisions.js): the server refuses
# saves without it (src-worker.js MIN_CLIENT_SCHEMA), as from an app loaded before an update.
CLIENT_SCHEMA = {'x-ksm-client-schema': '2'}


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


_STAFF_TOKENS = {}


def staff_token(base, tid, password=DEFAULT_PASSWORD):
    """Staff Login over the API (POST /api/tournaments/{id}/auth): the session token it returns."""
    key = (base, tid, password)
    if key not in _STAFF_TOKENS:
        req = urllib.request.Request(f'{base}/api/tournaments/{tid}/auth', data=json.dumps({'password': password}).encode(),
                                     method='POST', headers={'content-type': 'application/json', **CLIENT_SCHEMA})
        with urllib.request.urlopen(req) as r:
            _STAFF_TOKENS[key] = json.load(r)['token']
    return _STAFF_TOKENS[key]


def put_record(base, tid, payload, revision, password=DEFAULT_PASSWORD, client_id='test-harness', name='Test harness',
               legacy_password=False):
    """Save a tournament payload straight to the server, as another staff device would: logged in
    (its session token), or with legacy_password=True as the app before issue #9's hardening did
    (the password itself as the key, accepted for one release)."""
    body = json.dumps({'tournamentId': tid, 'revision': revision, 'payload': payload}).encode()
    key = password if legacy_password else staff_token(base, tid, password)
    req = urllib.request.Request(f'{base}/api/tournaments/{tid}', data=body, method='PUT', headers={
        'content-type': 'application/json', 'x-ksm-role': 'staff', 'x-ksm-session-key': key,
        'x-ksm-client-id': client_id, 'x-ksm-client-name': name, **CLIENT_SCHEMA})
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
        install_test_api(page)

    # ------------------------------------------------------------------ devices
    @classmethod
    def local(cls, page, name='local', session='staff', problems=None, query=''):
        """Offline app on the fake http://ksm.test origin (see ksm_browser.load_app).

        With a `problems` list, dialogs and page errors are handled as on open_device()
        (expect_dialog() answers documented ones, anything else is recorded).
        """
        app = cls(page, name, problems)
        if problems is not None:
            page.on('dialog', app._on_dialog)
            page.on('pageerror', lambda e: problems.append(f'{name}: page error: {e}'))
        load_app(page, session=session, query=query)
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
        if d.message.startswith('Tournament short name') and not any(d.message.startswith(key) for key in self.answers):
            d.accept(d.default_value)
            return
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

    def staff_session(self):
        """(test API) What this device sends as its staff key: a session token once logged in, '' when not."""
        return self.page.evaluate('KSMTest.staffSession()')

    def wait_idle(self, timeout=30):
        """(test API) Wait until every local change is confirmed by the server.

        On a timeout the error says why the device is still unsaved (KSMTest.pendingReason():
        timers, a save in flight or queued, the outbox, the last save attempt), so a flake on CI
        can be diagnosed from the log alone.
        """
        try:
            self.page.wait_for_function('!KSMTest.pending()', timeout=timeout * 1000)
        except PlaywrightTimeout:
            reason = self.page.evaluate('KSMTest.pendingReason()')
            raise AssertionError(f'{self.name}: still unsaved after {timeout}s: {json.dumps(reason)}') from None

    def wait_revision(self, rev, timeout=15):
        """(test API) Wait until this device has caught up with server revision `rev`."""
        try:
            self.page.wait_for_function('rev => KSMTest.revision() >= rev', arg=rev, timeout=timeout * 1000)
        except PlaywrightTimeout:
            details = self.page.evaluate("""() => ({revision:KSMTest.revision(),pending:KSMTest.pendingReason(),
              focus:document.activeElement?.id,socket:ksmCloudSocket?.readyState,
              deferred:ksmDeferredRemoteRecord?.revision,sync:ksmDeferredSyncRecord?.revision})""")
            raise AssertionError(f'{self.name}: waiting for revision {rev}: {json.dumps(details)}') from None

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

    def socket_barrier(self, timeout=5):
        """(test API) Wait for the cloud worker's pong after all prior socket messages."""
        self.wait_for(lambda: self.page.evaluate("typeof ksmCloudSocket === 'object' && ksmCloudSocket?.readyState === WebSocket.OPEN"), timeout=timeout, message='the live socket to open before ping/pong')
        return self.page.evaluate('timeout => KSMTest.socketBarrier(timeout)', timeout * 1000)

    def send_socket_message(self, message):
        """(test API) Send a raw test message through this device's live socket."""
        return self.page.evaluate('message => KSMTest.sendSocketMessage(message)', message)

    def send_tie_flash(self):
        """(test API) Exercise the transport used by automatic timer expiry."""
        self.page.evaluate("() => KSMTest.sendTieFlash()")

    def dispatch_tie_flash(self, message):
        """(test API) Deliver a tie-flash event directly to exercise receiver validation."""
        self.page.evaluate('message => KSMTest.dispatchTieFlash(message)', message)

    def disconnect_socket(self):
        """(test API) Close this device's live socket without reconnecting."""
        self.page.evaluate('() => KSMTest.disconnectSocket()')

    def tie_flash_button(self):
        """Court's tie-flash control: its text and disabled state, or None when hidden."""
        return self.page.evaluate("""() => {
          const el = document.querySelector('#score [data-testid="tie-flash-button"]');
          return el ? {text: el.innerText.replace(/\\s+/g, ' ').trim(), disabled: el.disabled} : null;
        }""")

    def tie_flash_banner(self):
        """Visible tie-flash banner: its class, text, and inline SVG test ID, or None."""
        return self.page.evaluate("""() => {
          const root = document.querySelector('[data-testid="tv-canvas"]');
          const el = root?.querySelector('[data-testid="tie-flash-banner"]');
          return el ? {className: el.className, text: el.innerText.trim(),
            icon: el.querySelector('svg')?.getAttribute('data-testid') || null,
            id: el.getAttribute('data-flash-id')} : null;
        }""")

    def live_tie_flash_banner(self, court):
        """Tie-flash banner in one Live Scores court card, or None."""
        return self.page.evaluate("""court => {
          const root = document.querySelector(`[data-testid="live-court-${court}"]`);
          const el = root?.querySelector('[data-testid="tie-flash-banner"]');
          return el ? {className: el.className, text: el.innerText.trim(),
            icon: el.querySelector('svg')?.getAttribute('data-testid') || null,
            id: el.getAttribute('data-flash-id')} : null;
        }""", court)

    def client_id(self):
        """(test API) This device's client ID (shared by its tabs; presence and history entries)."""
        return self.page.evaluate('KSMTest.clientId()')

    def writer_id(self):
        """(test API) What this tab's saves record as updatedBy.clientId: clientId/tab id (F36)."""
        return self.page.evaluate('KSMTest.writerId()')

    def diagnostics(self):
        """(test API) Cloud diagnostics state (rebase attempts etc.)."""
        return self.page.evaluate('KSMTest.diagnostics()')

    def watch_conflicts(self):
        """(test API) Start counting the save conflicts (HTTP 409 answers) this device meets (see conflicts)."""
        self.page.evaluate('KSMTest.watchConflicts()')

    def conflicts(self):
        """(test API) Save conflicts (409 answers, each followed by a rebase) since watch_conflicts()."""
        return self.page.evaluate('KSMTest.conflicts()')

    _SAVE_URL = '**/api/tournaments/*'

    def hold_next_save(self):
        """Hold this device's next save (PUT /api/tournaments/<id>) at the network until release_save().

        Makes a save race deterministic: hold it, let another device save first, release it, and
        it meets a conflict (409) and is rebased, as when two devices save at the same moment.
        Other requests pass; later saves wait in the app's own queue while this one is in flight.
        """
        self._held, self._hold_done = [], False

        def hold(route):
            if route.request.method == 'PUT' and not self._held and not self._hold_done:
                self._held.append(route)
                return
            try:
                route.continue_()
            except Exception as err:
                # The page may have ended the request meanwhile (a closed tab, an aborted fetch):
                # nothing is left to pass on. Anything else is a real failure.
                if 'already handled' not in str(err) and 'closed' not in str(err).lower():
                    raise
        self._hold_handler = hold
        self.page.route(self._SAVE_URL, hold)

    def wait_held_save(self, timeout=15):
        """Wait until the save held by hold_next_save() was sent; returns the payload it carries."""
        deadline = time.time() + timeout
        while not self._held:
            if time.time() > deadline:
                raise AssertionError(f'{self.name}: no save was sent to hold')
            self.page.wait_for_timeout(50)
        return json.loads(self._held[0].request.post_data)['payload']

    def release_save(self):
        """Send the held save on (it now meets whatever the server got meanwhile) and stop holding."""
        self._hold_done = True
        self._held.pop().continue_()
        self.page.unroute(self._SAVE_URL, self._hold_handler)

    def drop_held_save(self):
        """Stop holding and never answer the held save (a request lost on the network; the app
        gives up on it by itself, F35). Ends the held request so Playwright does not report it."""
        self._hold_done = True
        for route in self._held:
            try:
                route.abort()
            except Exception:
                pass  # the page already gave up on the request
        self._held.clear()
        self.page.unroute(self._SAVE_URL, self._hold_handler)

    def blur(self):
        """Leave the field that has the focus (as a tap elsewhere does); a staff device applies
        live updates held while a field was being edited."""
        self.page.evaluate('() => document.activeElement && document.activeElement.blur()')

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
        if testid.startswith('nav-') and testid != 'nav-toggle':
            if self.page.evaluate("document.body.classList.contains('ksm-home')") and self.page.locator(sel('library-return')).is_visible():
                self.page.locator(sel('library-return')).click()
            toggle = self.page.locator(sel('nav-toggle'))
            if toggle.is_visible() and toggle.get_attribute('aria-expanded') == 'false':
                toggle.click()
        if testid in ('setup-cloud-diagnostics','setup-download-file','setup-download-recovery','setup-load-recovery','setup-export-brackets','setup-export-results'):
            self.page.locator('#setup-tournament-actions details').evaluate('(el) => { el.open = true }')
        self.page.click(sel(testid))

    def nav(self, item):
        """Main navigation: setup, registration, live-scores, overview, results."""
        self.click(f'nav-{item}')

    def create_tournament(self, timeout=20):
        """Home page '+ New Tournament' (answers name/password prompts); waits for the cloud ID."""
        previous = self.tournament_id()
        self.click('home-new-tournament')
        self.page.wait_for_function('(previous) => KSMTest.tournamentId() && KSMTest.tournamentId() !== previous', arg=previous, timeout=timeout * 1000)
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

    # ------------------------------------------------------- Delete tournament (issue #26)
    def open_developer_tools(self):
        """Developer Tools, opened by a click on the header's connection status (every role has it); waits for the dialog."""
        self.page.dispatch_event(sel('connection-status'), 'click')  # the nav bar overlaps the status row at some widths
        self.page.wait_for_selector(sel('cloud-modal'))

    def can_delete_tournament(self):
        """Whether Developer Tools offers 'Delete tournament' on this device (opens and closes it)."""
        self.open_developer_tools()
        offered = self.page.locator(sel('diagnostics-delete')).count() == 1
        self.page.keyboard.press('Escape')
        self.page.wait_for_selector(sel('cloud-modal'), state='detached')
        return offered

    def open_delete_dialog(self):
        """Developer Tools -> Delete tournament: the confirmation dialog (nothing is deleted yet)."""
        self.open_developer_tools()
        self.click('diagnostics-delete')
        self.page.wait_for_selector(sel('delete-dialog'))

    def type_delete_name(self, text):
        """Type into the delete dialog's name field (replacing what is there)."""
        self.page.fill(sel('delete-name-input'), text)

    def delete_enabled(self):
        """Whether the delete dialog's 'Delete tournament' button can be pressed."""
        return self.page.locator(sel('delete-confirm')).is_enabled()

    def delete_dialog(self):
        """What the delete dialog shows: {required, devices, error}."""
        return self.page.evaluate("""() => ({
          required: document.querySelector('[data-testid="delete-required-name"]')?.textContent || null,
          devices: document.querySelector('[data-testid="delete-devices"]')?.textContent || null,
          error: document.querySelector('[data-testid="delete-error"]')?.textContent || '',
        })""")

    def delete_tournament(self, name):
        """Developer Tools -> Delete tournament, type `name`, Delete: waits for the Library."""
        self.open_delete_dialog()
        self.type_delete_name(name)
        self.page.wait_for_function("() => !document.querySelector('[data-testid=\"delete-confirm\"]').disabled")
        self.click('delete-confirm')
        self.wait_for_library()

    def go_to_library(self):
        """Header logo -> Tournament Library."""
        if not self.page.evaluate("document.body.classList.contains('ksm-home')"):
            self.page.locator('.nav-brand').click()
        self.wait_for_library()

    def wait_for_library(self, timeout=15):
        """Wait for the Tournament Library (the home screen) to be shown."""
        self.page.wait_for_function("() => document.body.classList.contains('ksm-home')", timeout=timeout * 1000)

    def toast(self):
        """The toast's text ('' when none)."""
        return self.page.evaluate("() => document.querySelector('[data-testid=\"toast\"]')?.textContent || ''")

    def wait_toast(self, text, timeout=15):
        """Wait until the toast `text` has been shown (at least once since the page opened).

        Toasts are transient: the next one replaces the text, and a slow machine can miss a
        fleeting one if the test only polls the element. KSMTest.toasts() is the history of
        every toast the page showed, so this cannot miss one that came and went.
        """
        self.page.wait_for_function("t => KSMTest.toasts().includes(t)", arg=text, timeout=timeout * 1000)

    def library_names(self):
        """The Tournament Library's cards, by name (the cards the Library shows right now)."""
        return self.page.evaluate("() => [...document.querySelectorAll('[data-testid=\"home-tournament-name\"]')].map(e => e.textContent.trim())")

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
        # Rows move when a division is switched off (the running order first, #31): find each by name.
        for name in self.setup_division_names():
            row = self.setup_division_row(name)
            box = row.locator(sel('setup-division-enabled'))
            if name not in wanted and box.is_checked():
                box.uncheck()
        for name, (fmt, court) in wanted.items():
            row = self.setup_division_row(name)
            if row.count() == 0:
                page.fill(sel('custom-division-name'), name)
                page.select_option(sel('custom-division-format'), label=fmt)
                page.select_option(sel('custom-division-court'), value=court)
                self.click('custom-division-add')
                row = self.setup_division_row(name)
            box = row.locator(sel('setup-division-enabled'))
            if not box.is_checked():
                box.check()
            row.locator(sel('setup-division-format')).select_option(label=fmt)
            row.locator(sel('setup-division-court')).select_option(value=court)

    def setup_division_names(self):
        """Setup screen: the divisions table's names, in the order shown (the running order first, #31)."""
        return [x.strip() for x in self.page.locator(f'{sel("setup-division-row")} {sel("setup-division-name")}').all_inner_texts()]

    def setup_division_row(self, name):
        """Setup screen: the divisions table row whose name is exactly `name`."""
        exact = re.compile('^' + re.escape(name) + '$')
        return self.page.locator(sel('setup-division-row'), has=self.page.locator(sel('setup-division-name'), has_text=exact))

    def move_division(self, name, direction):
        """Setup screen: the row of `name`'s move button, direction 'up' or 'down' (#31)."""
        row = self.setup_division_row(name)
        before = self.setup_division_names()
        row.locator(sel(f'setup-division-{direction}')).click()
        self.wait_for(lambda: self.setup_division_names() != before, message=f'{name} to move {direction}')

    def rename_division(self, name, new_name, key=None):
        """Setup screen: the row of `name`'s Rename, `new_name` typed into the field, then Save (or
        the `key`, e.g. 'Enter') (#25). Returns the refusal the row shows ('' once renamed); a
        refused rename leaves the field open (cancel_rename()). Refused outright (after the draw):
        the message, and no field opens."""
        page = self.page
        field, error = page.locator(sel('setup-division-rename-input')), page.locator(sel('setup-division-rename-error'))
        self.setup_division_row(name).locator(sel('setup-division-rename')).click()
        self.wait_for(lambda: field.count() or error.count(), message=f'the rename field of {name} or a refusal')
        if not field.count():
            return error.inner_text().strip()
        field.fill(new_name)
        if key:
            field.press(key)
        else:
            self.click('setup-division-rename-save')
        self.wait_for(lambda: not field.count() or error.count(), message=f'{name} to be renamed or refused')
        return error.inner_text().strip() if field.count() else ''

    def cancel_rename(self):
        """Setup screen: Cancel of the open rename field (#25)."""
        self.click('setup-division-rename-cancel')
        self.wait_for(lambda: not self.page.locator(sel('setup-division-rename-input')).count(), message='the rename field to close')

    def registration_division(self, name):
        """Registration -> Individual: (the division shown for the player `name`, the division options of the row)."""
        page = self.page
        if not page.is_visible(sel('reg-add-row')):
            self.nav('registration')
            self.click('reg-tab-individual')
        rows = page.locator(sel('reg-row'))
        for i in range(rows.count()):
            if rows.nth(i).locator(sel('reg-name')).input_value() == name:
                return rows.nth(i).locator(sel('reg-division')).evaluate(
                    "s => [s.selectedOptions[0]?.textContent.trim() ?? '', [...s.options].map(o => o.textContent.trim())]")
        raise AssertionError(f'{self.name}: no registration row for {name!r}')

    def setup_team_event(self,fmt='3-Person Team', tournament='Single Elimination', court='Both', enabled=True):
        """Setup screen: team tournament settings. court: 'A' | 'B' | 'Both'."""
        page = self.page
        self.nav('setup')
        page.select_option(sel('team-enabled'), label='Enabled' if enabled else 'Disabled')
        if enabled:
            if not page.locator(sel('team-division-row')).count():
                self.click('team-division-add')
            page.select_option(sel('team-division-teamFormat'), label=fmt)
            page.select_option(sel('team-division-teamTournamentFormat'), label=tournament)
            page.select_option(sel('team-division-court'), label=court)

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

    def set_competitor_field(self, name, field, value):
        """Registration -> Individual: change `field` ('name', 'dojo', 'seed') of the row of `name`."""
        page = self.page
        if not page.is_visible(sel('reg-add-row')):
            self.nav('registration')
            self.click('reg-tab-individual')
        rows = page.locator(sel('reg-row'))
        for i in range(rows.count()):
            if rows.nth(i).locator(sel('reg-name')).input_value() == name:
                box = rows.nth(i).locator(sel(f'reg-{field}'))
                box.fill(str(value))
                box.press('Tab')
                return
        raise AssertionError(f'{self.name}: no registration row for {name!r}')

    def regenerate_division(self, division):
        """Registration -> Regenerate Single Division -> `division` -> Continue -> Regenerate -> Close."""
        page = self.page
        self.nav('registration')
        self.click('regenerate-division-button')
        page.wait_for_selector(f'{sel("regenerate-modal")}:not(.hidden)')
        page.locator(sel('regenerate-option'), has=page.locator(sel('regenerate-option-name'), has_text=division)) \
            .locator(sel('regenerate-option-radio')).check()
        self.click('regenerate-continue')
        self.click('regenerate-confirm')
        page.wait_for_function(f"document.querySelector('{sel('regenerate-modal-title')}')?.textContent.trim() === 'Division Regenerated'")
        self.click('regenerate-modal-close')

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

    def pool_slots(self, division):
        """Registration -> Pools for `division`: {pool label: [[slot letter, player name], ...]}."""
        self.pools(division)
        return self.page.evaluate("""() => Object.fromEntries([...document.querySelectorAll('[data-testid="pool"]')].map(p => [
          p.querySelector('[data-testid="pool-title"]').textContent.replace(/^(Team )?Pool\\s*/, '').trim(),
          [...p.querySelectorAll('[data-testid="pool-slot"]')].map(x => [x.textContent.trim(),
            x.parentElement.querySelector('[data-testid="pool-player"]').textContent.trim()])]))""")

    def court_pool_bouts(self):
        """Court screen, the pool cards beside the scoreboard: {pool card title: [[white, red], ...]}
        in the order the court plays them."""
        return self.page.evaluate("""() => Object.fromEntries([...document.querySelectorAll('#courtContext [data-testid="context-pool"]')].map(card => [
          card.querySelector('[data-testid="context-pool-title"]').textContent.trim(),
          [...card.querySelectorAll('.match-name.white')].map(w => [w.textContent.trim(),
            w.parentElement.querySelector('.match-name.red').textContent.trim()])]))""")

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

    def set_timer_lengths(self, **values):
        """Edit the tournament-wide Match timer fields through Setup."""
        self.nav('setup')
        for name, value in values.items():
            field = self.page.locator(sel(f'setup-{name}'))
            field.fill(value)
            field.press('Tab')
        wait_for_react(self.page)

    def wait_timer_mounted(self):
        """(test API) Wait for the timer island to catch up with the current court input."""
        self.wait_for(lambda: self.page.evaluate('KSMTest.timerMounted()'), message='timer island matches court')

    def timer(self):
        """Court timer's rendered display and controls (None if not visible)."""
        # Read one DOM snapshot: React can replace the timer between separate
        # locator count/visibility/text calls, especially on a paused clock.
        return self.page.evaluate("""() => {
          const timer=document.querySelector('[data-testid="match-timer"]');
          if(!timer || !timer.checkVisibility())return null;
          const text=id=>timer.querySelector(`[data-testid="${id}"]`)?.innerText || '';
          return {display:text('timer-display'),status:text('timer-status'),
                  encho:!!timer.querySelector('[data-testid="timer-encho"]')};
        }""")

    @staticmethod
    def install_timer_probes(page):
        """Instrument sound and wake lock before the app loads."""
        page.add_init_script('KSMTest.installTimerProbes()')

    def timer_probes(self):
        return self.page.evaluate('KSMTest.timerProbes()')

    def timer_visibility(self, visible):
        self.page.evaluate('visible => KSMTest.timerVisibility(visible)', visible)

    def configure_timer_enabled(self, court, enabled):
        self.open_court(court)
        self.click('court-configure')
        self.page.locator(sel('court-timer-enabled')).select_option('On' if enabled else 'Off')
        self.page.keyboard.press('Escape')

    def configure_timer_sound(self, court, sound):
        self.open_court(court)
        self.click('court-configure')
        self.page.locator(sel('court-timer-sound')).select_option(sound)
        self.page.keyboard.press('Escape')

    def timer_layout(self):
        """Visible timer and scoring-panel bounds, including every timer control."""
        return self.page.evaluate("""() => {
          const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height};};
          const q=s=>document.querySelector(s);
          return {width:innerWidth,timer:box(q('[data-testid=match-timer]')),
            white:box(q('#score .white-control-panel')),red:box(q('#score .red-control-panel')),
            buttons:[...q('[data-testid=match-timer]').querySelectorAll('button')].map(box),
            animation:getComputedStyle(q('[data-testid=timer-display]')).animationName,
            encho:q('[data-testid=match-timer]').classList.contains('match-timer--encho')};
        }""")

    def timer_control(self, testid):
        """Rendered timer control state, including its accessible label and disabled reason."""
        button = self.page.locator(sel('match-timer')).locator(sel(testid))
        return {'disabled': button.is_disabled(), 'label': button.get_attribute('aria-label'),
                'title': button.get_attribute('title')}

    def tv_clock_stopped(self):
        """Whether the audience TV shows its stopped-clock screen-edge border."""
        return self.page.locator('body').evaluate("el => el.classList.contains('ksm-clock-stopped')")

    def timer_storage(self):
        """Device-only persisted timer records, via the test API."""
        return self.page.evaluate('KSMTest.timerStorage()')

    def reset_timer(self, accept=True):
        self.expect_dialog('Reset this match timer?', accept=accept)
        self.click('timer-reset')

    def score_point(self, side, letter):
        """side: 'W'/'R' (or 'white'/'red'); letter: M, K, D, T."""
        self.click(f'point-{SIDE[side]}-{letter}')

    def hansoku(self, side):
        self.click(f'hansoku-{SIDE[side]}')

    def next_match(self, settle=False):
        """Court screen -> Next Match. settle=True waits until the screen has moved on from the
        match just finished: the court screen is React and redraws just after the click, so a
        test that reads the screen right away could still see (and re-log) the old match.

        It waits for another match (division, match line or names), not just any redraw: the
        screen may still be drawing the last point when Next Match is clicked, and that redraw
        alone once let an e2e run log the finished match twice ("played 28, server has 27")."""
        ident = lambda s: (s['division'], s['meta'], s['white'], s['red'], s['complete'])
        before = ident(self.court_screen()) if settle else None
        self.click('next-match')
        if settle:
            self.wait_for(lambda: ident(self.court_screen()) != before, timeout=15,
                          message='the court screen to move on from the finished match')

    def undo(self):
        self.click('undo')

    def redo(self):
        self.click('redo')

    def fusen_sho(self, winning_side):
        """Fusen-sho, answering "who won?" (#38): the winning side's button."""
        self.click('fusen-gachi')
        self.click(f'fusen-{SIDE[winning_side]}')

    def fusen_gachi(self, forfeiting_side):
        """Fusen-sho, from the forfeiting side's point of view: presses the OTHER side's (winner's) button."""
        self.fusen_sho('R' if forfeiting_side in ('W', 'white') else 'W')

    def division_options(self):
        """Divisions offered by the court's division selector."""
        return self.court_screen()['options']

    def switch_division(self, division):
        """Court screen division selector (what a scorekeeper does when a division ends)."""
        self.page.select_option(f'#score {sel("court-division-select")}', label=division)

    # ------------------------------------------------------------------ files
    def download(self, testid, menu=None):
        """Click a control that downloads a file (opening the action's screen first, e.g. 'nav-setup').

        Returns (suggested file name, local path of the downloaded file).
        """
        if menu:
            self.click(menu)
        with self.page.expect_download() as dl:
            self.click(testid)
        return dl.value.suggested_filename, dl.value.path()

    def download_tournament_file(self):
        """Setup -> Download Tournament File: (the parsed .ksm file, its local path)."""
        view = self.visible_view()[0]
        _, path = self.download('setup-download-file', menu='nav-setup')
        self.show_screen(view)
        return json.loads(Path(path).read_text(encoding='utf-8')), path

    def _choose_file(self, testid, path):
        self.nav('setup') if testid == 'setup-load-recovery' else self.go_to_library()
        with self.page.expect_file_chooser() as chooser:
            self.click(testid)
        chooser.value.set_files(str(path))

    def load_tournament_file(self, path):
        """Library -> Load Tournament File, picking `path` in the file chooser."""
        self._choose_file('library-load-file', path)

    def load_recovery_file(self, path):
        """Setup -> Load Recovery File, picking `path` in the file chooser."""
        self._choose_file('setup-load-recovery', path)

    # ------------------------------------------------------------ audience views
    def placements(self):
        """Results page: {division: [(place, name), ...]} for every division card."""
        self.nav('results')
        return {div: [tuple(r) for r in rows] for div, rows in self.page.evaluate(_RESULTS_JS).items()}

    def add_award(self, award, name='', dojo=''):
        """Results -> Special Awards: + Add Award and fill in the new row (each field committed by Tab)."""
        self.nav('results')
        editor = self.page.locator('#results .results-awards-card')
        rows = editor.get_by_role('textbox', name='Award name')
        before = rows.count()
        editor.get_by_role('button', name='+ Add Award').click()
        self.wait_for(lambda: rows.count() == before + 1, message='the new award row')
        for label, value in (('Award name', award), ('Recipient name', name), ('Dojo', dojo)):
            field = editor.get_by_role('textbox', name=label).nth(before)
            field.fill(value)
            field.press('Tab')

    def awards(self):
        """Results -> Special Awards: [(award, recipient, dojo)] as the editor shows them."""
        self.nav('results')
        editor = self.page.locator('#results .results-awards-card')
        col = lambda label: [x.input_value() for x in editor.get_by_role('textbox', name=label).all()]
        return list(zip(col('Award name'), col('Recipient name'), col('Dojo')))

    def enable_test_tools(self, on=True):
        """(test API) This device's test tools (the sample-data buttons, owner decision 20) on or off."""
        self.page.evaluate('on => KSMTest.testTools(on)', on)

    def render_tv(self):
        """(test API) Render the TV display inside this page (offline tests; a TV device uses tv_link())."""
        self.page.evaluate('KSMTest.renderTv()')

    def tv_screen(self):
        """TV display (/t/<id>/tv/a|b): court, division, meta, current names or completion, scores, team summaries."""
        return self.page.evaluate(_TV_JS)

    def set_tv_red_side(self, court, side):
        """Setup's audience orientation, using its real change handler."""
        self.nav('setup')
        self.page.locator(sel(f'setup-tv-red-side-{court.lower()}')).select_option(side)
        wait_for_react(self.page)

    def configure_tv_red_side(self, court, side):
        """Configure court's audience orientation control."""
        self.open_court(court)
        self.click('court-configure')
        self.page.locator(sel(f'court-tv-red-side-{side}')).check()
        wait_for_react(self.page)
        self.page.keyboard.press('Escape')

    def set_table_red_side(self, court, side):
        """Setup's scoring-table orientation, independent of its TV setting."""
        self.nav('setup')
        self.page.locator(sel(f'setup-red-side-{court.lower()}')).select_option(side)
        wait_for_react(self.page)

    def tv_layout(self):
        """Visible side geometry, including team sheets and every upcoming card."""
        return self.page.evaluate("""() => {
          const box = e => { const r=e.getBoundingClientRect(); return [r.x,r.y,r.width,r.height].map(v=>Math.round(v)); };
          const pair = (w,r) => { const a=document.querySelector(w),b=document.querySelector(r); return a&&b?[box(a),box(b)]:null; };
          const id = s => `[data-testid="tv-${s}"]`;
          return {
            players:pair(id('white-name'),id('red-name')),
            scores:pair(id('white-score'),id('red-score')),
            hansoku:pair(id('white-hansoku'),id('red-hansoku')),
            teams:pair(id('white-team'),id('red-team')),
            summaries:pair(id('white-summary'),id('red-summary')),
            lineups:pair('.tv3-k-team:not(.red)', '.tv3-k-team.red'),
            rows:[...document.querySelectorAll('.tv3-team-col:not(.red) .tv3-team-row')].map((w,i)=>[box(w),box(document.querySelectorAll('.tv3-team-col.red .tv3-team-row')[i])]),
            upcoming:[...document.querySelectorAll('[data-testid="tv-upcoming-card"]')].filter(e=>e.querySelector(id('upcoming-white'))).map(e=>[box(e.querySelector(id('upcoming-white'))),box(e.querySelector(id('upcoming-red')))])
          };
        }""")

    def tv_upcoming(self):
        """TV Upcoming Matches cards: [(white, red)] or None for an empty card."""
        return self.page.evaluate("""() => [...document.querySelectorAll('[data-testid="tv-upcoming-card"]')].map(c => {
          const w = c.querySelector('[data-testid="tv-upcoming-white"]'), r = c.querySelector('[data-testid="tv-upcoming-red"]');
          return w ? [w.innerText.trim(), r.innerText.trim()] : null; })""")

    def tv_upcoming_title(self):
        """TV: the Upcoming zone's title ('Upcoming Matches', or 'Up next on this court: <division>')."""
        return self.page.evaluate("""() => document.querySelector('[data-testid="tv-upcoming"] .tv3-upcoming-title')?.textContent.trim() ?? null""")

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
