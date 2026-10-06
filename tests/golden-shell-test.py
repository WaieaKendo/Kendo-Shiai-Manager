"""Golden (snapshot) test of the app shell: the top navigation bar and its menus, the header's
staff button and status line, the role banner and the pop-up dialogs (roadmap M.13, the last
legacy screens).

The shell is the page header (header.ksm-topbar): the KSM brand (Tournament Library), the
navigation tiles (Setup, Registration, the Courts menu, Live Scores, the TV menu with the stream
overlay links, Overview, Results, the Export menu, the Save / Load menu) with the tile of the screen
shown marked active, the hidden file inputs of Load Tournament File / Load Recovery File, and the
status row (Staff Login / Logout, the role, the connection status, the devices online, the save
status; a click on the status opens Developer Tools). Above it, the read-only banner of a spectator
(LIVE SPECTATOR VIEW). The dialogs: Fusen-gachi (#fusenDialog on the court screen), the generation
check (#validationModal: Tournament Validation, Generate / Cancel / Close), Regenerate Single
Division (#regenerateModal: the division list, the confirmation, the result) and the cloud modal
(#ksmCloudModal: Tournament Access, Developer Tools, the Load Tournament File confirmation of 0.5).
The approved snapshots in tests/golden/shell/*.json were recorded from the LEGACY shell
(toggleNavMenu() / closeNavMenus() / setNavMenuState() / positionMobileNavMenu() and the resize
listener in app/js/23-navigation.js, setActiveNavForView() in 24, setSessionRole() and
installRoleBanner() in 33, setConnectionStatus() / renderPersistentSaveStatus() /
updateSaveStatus() in 20, renderCloudPresence() and openCloudModal() / cloudDiagnostics() /
confirmTournamentFileLoad() in 21, openTournamentAccess() in 33, openFusenDialog() /
closeFusenDialog() in 22, showValidationDialog() / openRegenerateDivisionDialog() /
continueRegenerateDivision() in 03, regenerateSingleDivision() in 08, the stream overlay menu items
in 33-stream-overlay-links.js; the rest is static markup of app/index.html), so they pin exactly
what the legacy shell drew and did (quirks included, see docs/ROADMAP.md "Shell quirks kept").

One offline copy of the app runs each scenario with Playwright's clock installed and paused (fixed
date, Pacific/Honolulu, en-US), so no timer runs unless a step says so (autosave, the save status
refresh) and every time shown is fixed; requests are answered by the test (the cloud is
unavailable: 503, except the staff login of the spectator scenario), the live socket is answered by
the test (it opens and stays silent), the QR code image is a fixed square. After every step the
header, the body's top-level elements (the banner, the toast, the cloud modal), the three dialogs
and the cloud modal are serialized (golden_screen.PANEL_JS: elements, attributes, text,
visibility, innerText, each element's page box per platform) and compared with the approved
snapshot, together with the role, the body classes, the view shown, the staff session, the
tournament ID, which element has the focus, the toast, the saves the step asked for
(noteLocalMutation(): every scheduleAutoSave()/criticalAutoSave(), also from the document-wide
click listener), the scroll width, the page errors since the step before and the dialogs shown
(their answers are part of the scenario).

Buttons get a dispatched click (the mouse does not move, so no hover state moves a box), keys are
pressed with the keyboard; transitions are off.

  nav-staff       a staff device on desktop: every tile, every menu opened, closed again, switched,
                  closed by Escape and by a click outside, every Export and Save / Load item and
                  the TV and overlay items (offline: their alerts), Developer Tools from the menu and
                  from the status (Close, a click inside, the backdrop), the status line set from
                  the code (every connection mode, devices online, every save status), the brand
                  (click and Enter), Logout;
  nav-spectator   a spectator: the tiles a spectator has, the screens it may open, Staff Login
                  without a tournament, cancelled, with a wrong and the right password (the staff
                  tiles, the banner gone), Logout;
  nav-phones      phone portrait and landscape and two tablet sizes: every menu opened (placed
                  under its tile), a resize while a menu is open, back to desktop with a menu open,
                  a spectator on a phone;
  dialogs         the generation check (nobody registered, issues, Close, Cancel, Generate), the
                  Fusen-gachi dialog (Cancel, Escape, White, Red), Regenerate Single Division
                  (x, Cancel, Continue, Regenerate, OK, a division that fails the check, no
                  division ready);
  cloud-modals    Tournament Access (Copy Link, Close, the backdrop), Developer Tools with work
                  queued (Retry queued save) and as a spectator, Load Tournament File (an invalid
                  file, a recovery file, the open tournament's file: Cancel, the backdrop, Replace;
                  another tournament's file and an older file: Cancel, Load as new tournament; no
                  cloud tournament open), Load Recovery File with an invalid file.

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-shell-test.py [scenario ...]
"""
import datetime
import json
import re
import struct
import tempfile
import time
import zlib
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, UPDATE, Golden, geometry_recorded, people
from ksm_app import KsmApp
from ksm_browser import DIST, launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'shell'
HEADER = 'header.ksm-topbar'
DIALOGS = {'fusen': '#fusenDialog', 'validation': '#validationModal', 'regenerate': '#regenerateModal', 'cloud': '#ksmCloudModal'}
DESKTOP = {'width': 1280, 'height': 900}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390}),
          ('tablet portrait', {'width': 768, 'height': 1024}), ('tablet landscape', {'width': 1024, 'height': 768})]
NOW = datetime.datetime(2026, 11, 21, 18, 30, tzinfo=datetime.timezone.utc)
# The navigation's own transitions are !important (04-navigation.css), so the rule that turns them
# off needs a higher specificity (an id's, through :not()).
NO_TRANSITIONS = (':not(#ksm-no-transitions), :not(#ksm-no-transitions)::before, :not(#ksm-no-transitions)::after '
                  '{ transition: none !important; animation: none !important; }')
# Requests in flight (fetch), so a step that starts one can wait until the app has its answer.
FETCH_INIT = """(() => {
  window.__ksmFetching = 0;
  window.__ksmResizes = 0;
  addEventListener('resize', () => { window.__ksmResizes++; });
  const f = window.fetch.bind(window);
  window.fetch = (...a) => { window.__ksmFetching++; return f(...a).finally(() => { window.__ksmFetching--; }); };
})();"""


def square_png(size=8):
    """A plain square PNG (the QR code image the test answers with)."""
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\x00' + b'\x00\x00\x00' * size for _ in range(size))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))


QR_PNG = square_png()
SCROLL_JS = '() => [document.documentElement.scrollWidth, innerWidth]'
VIEW_JS = "() => [...document.querySelectorAll('.view')].filter(v => !v.classList.contains('hidden')).map(v => v.id)"
SAVES_INIT_JS = """() => {
  window.__ksmSaves = [];
  ['noteLocalMutation', 'scheduleAutoSave', 'criticalAutoSave'].forEach(f => {
    const orig = window[f];
    if (typeof orig !== 'function') return;
    window[f] = function (...args) { window.__ksmSaves.push(f); return orig.apply(this, args); };
  });
}"""
SAVES_JS = '() => { const s = window.__ksmSaves; window.__ksmSaves = []; return s; }'
# An element as the snapshot names it: its id, else its test ID and position among those, else
# its tag and position in the page.
NAME_JS = """el => {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + el.id;
  const t = el.getAttribute('data-testid');
  if (t) return `${t}[${[...document.querySelectorAll(`[data-testid="${t}"]`)].indexOf(el)}]`;
  return `${el.tagName.toLowerCase()}[${[...document.querySelectorAll(el.tagName)].indexOf(el)}]`;
}"""
STATE_JS = f"""() => {{
  const name = {NAME_JS};
  const a = document.activeElement;
  const toast = document.getElementById('ksmToast');
  return {{
    role: ksmSessionRole,
    body: document.body.className,
    // The body's elements (not the scripts): the banner first, the toast and the cloud modal last.
    top: [...document.body.children].filter(e => e.tagName !== 'SCRIPT').map(e => [e.tagName.toLowerCase(), e.id, e.className, e.children.length ? null : e.textContent]),
    staffSession: !!sessionStorage.getItem('ksm.staff.session.v3_16'),
    tournamentId: cloudSession.tournamentId || null,
    revision: Number(cloudSession.revision) || 0,
    toast: toast ? [toast.className, toast.textContent] : null,
    focus: name(a), connected: a ? a.isConnected : null,
  }};
}}"""
SHOWN_JS = "s => { const el = document.querySelector(s); return !!el && el.checkVisibility(); }"
# A staff session again, as load_app() starts one (createNewTournament() minus the cloud).
STAFF = "document.body.classList.remove('ksm-home'); setSessionRole('staff'); installRoleBanner('staff'); navigateTo('setup');"
STAFF_JS = f"() => {{ {STAFF} }}"


def capture(app):
    """The shell: (serialization, element boxes)."""
    page = app.page
    header = page.evaluate(PANEL_JS, HEADER)
    shown = page.evaluate(SHOWN_JS, HEADER)
    errors, app.page_errors[:] = list(app.page_errors), []
    entry = {
        'views': page.evaluate(VIEW_JS),
        'state': page.evaluate(STATE_JS),
        'saves': page.evaluate(SAVES_JS),
        'scroll': page.evaluate(SCROLL_JS),
        'pageErrors': errors,
        # innerText of a hidden element is its textContent (the markup's source formatting).
        'header': {'tree': header['tree'], 'text': header['text'] if shown else None},
    }
    boxes = {'header': header['boxes']}
    for key, root in DIALOGS.items():
        panel = page.evaluate(PANEL_JS, root)
        if panel is None:
            entry[key] = None
            boxes[key] = None
            continue
        visible = page.evaluate(SHOWN_JS, root)
        entry[key] = {'tree': panel['tree'], 'text': panel['text'] if visible else None}
        boxes[key] = panel['boxes']
    return entry, boxes


def poll(page, js, what, timeout=10):
    """Wait until `js` is true in the page, polling from here (the page's timers and animation
    frames are Playwright's paused clock, so the page cannot poll by itself)."""
    deadline = time.time() + timeout
    while not page.evaluate(js):
        assert time.time() < deadline, f'timed out waiting for {what}'
        page.wait_for_timeout(20)


def settle(page):
    """Wait until the app has the answers to its requests (and a file it reads), then for the
    page's own follow-up work (promise callbacks)."""
    poll(page, '() => window.__ksmFetching === 0', 'the requests')
    page.wait_for_timeout(60)
    poll(page, '() => window.__ksmFetching === 0', 'the requests')


class Api:
    """The cloud as the test answers it: 503 (offline) for everything, except the staff password
    check of `tournament`, which accepts `password`."""

    def __init__(self, tournament=None, password=None):
        self.tournament, self.password = tournament, password

    def __call__(self, route, path):
        if self.tournament and path == f'/api/tournaments/{self.tournament}/auth':
            ok = json.loads(route.request.post_data or '{}').get('password') == self.password
            return route.fulfill(status=200 if ok else 401, content_type='application/json',
                                 body='{"ok":true}' if ok else '{"error":"Invalid staff password"}')
        return route.fulfill(status=503, content_type='application/json', body='{"error":"offline test harness"}')


def open_app(name, browser, react_check=None, viewport=DESKTOP, api=None, session='staff'):
    page = browser.new_page(viewport=viewport, locale='en-US', timezone_id='Pacific/Honolulu')
    page.clock.install(time=NOW)
    page.clock.pause_at(NOW + datetime.timedelta(seconds=1))
    page.add_init_script(FETCH_INIT)
    page.route_web_socket(re.compile(r'.*/api/.*'), lambda ws: None)
    page.route(re.compile(r'https://api\.qrserver\.com/.*'), lambda r: r.fulfill(status=200, content_type='image/png', body=QR_PNG))
    app = KsmApp(page, name)
    app.page_errors = []
    load_app(page, api=api or Api(), session=session)
    page.add_style_tag(content=NO_TRANSITIONS)
    settle(page)
    page.evaluate(SAVES_INIT_JS)
    golden = Golden(name, app, app.page_errors, GOLDEN_DIR, capture, react_check)
    if react_check:
        assert page.evaluate('window.ksmShellMounted === true'), f'{name}: the shell islands did not mount'
        assert page.locator('[data-testid="shell-module-missing"]').count() == 0, f'{name}: a "could not load" notice shown on a working page'
    return golden


def click(page, selector, index=0):
    """A click without moving the mouse (no hover state)."""
    page.locator(selector).nth(index).dispatch_event('click')


def tid(testid):
    return f'[data-testid="{testid}"]'


def nav(g, item, label=None, wait=False):
    def act(a):
        click(a.page, tid(f'nav-{item}'))
        if wait:
            settle(a.page)
    g.do(label or f'nav: {item}', act)


def menu_item(g, menu, item, label, wait=False):
    """Open `menu`, then its item."""
    nav(g, menu, f'{label}: menu opened')
    nav(g, item, label, wait)


def resize(page, size):
    """The window resized, and the app's resize listener run (the browser fires the event with its
    next frame)."""
    before = page.evaluate('() => window.__ksmResizes')
    page.set_viewport_size(size)
    poll(page, f'() => window.__ksmResizes > {before}', 'the resize event')


def leave(page):
    page.evaluate('() => document.activeElement && document.activeElement.blur()')


# ---------------------------------------------------------------------------------- scenarios
def nav_staff(browser, react_check):
    g = open_app('nav-staff', browser, react_check)
    page = g.app.page
    g.check('a staff device on Setup')
    for item in ['registration', 'live-scores', 'overview', 'results', 'setup']:
        nav(g, item)
    nav(g, 'courts', 'Courts menu opened')
    nav(g, 'courts', 'Courts again (closed)')
    nav(g, 'courts', 'Courts menu opened again')
    nav(g, 'court-a', 'Courts: Court A')
    menu_item(g, 'courts', 'court-b', 'Courts: Court B')
    nav(g, 'tv', 'TV menu opened')
    nav(g, 'export', 'Export opened while TV is open (TV closes)')
    g.do('Escape closes the menu', lambda a: a.page.keyboard.press('Escape'))
    nav(g, 'save-load', 'Save / Load opened')
    g.do('a click on a menu heading (the menu stays open)', lambda a: click(a.page, '#saveLoadMenu .menu-heading'))
    g.do('a click outside the menus closes them', lambda a: click(a.page, 'main'))
    nav(g, 'courts', 'Courts menu opened (to leave open)')
    nav(g, 'live-scores', 'Live Scores while the Courts menu is open')
    menu_item(g, 'export', 'export-brackets', 'Export: Tournament Brackets')
    menu_item(g, 'export', 'export-results', 'Export: Results & Awards')
    menu_item(g, 'export', 'export-referees', 'Export: Referee Assignments')
    menu_item(g, 'export', 'export-archive', 'Export: Tournament Archive')
    nav(g, 'setup')
    menu_item(g, 'tv', 'tv-a', 'TV: Court A TV (not in the cloud)', wait=True)
    menu_item(g, 'tv', 'overlay-b', 'TV: copy the Court B overlay link (not in the cloud)', wait=True)
    menu_item(g, 'save-load', 'save-now', 'Save / Load: Save Now (offline)', wait=True)
    g.answer = lambda d: d.dismiss()
    menu_item(g, 'save-load', 'new-tournament', 'Save / Load: New Tournament (name cancelled)')
    g.answer = None
    nav(g, 'save-load', 'Save / Load: Download Tournament File: menu opened')
    with page.expect_download():
        g.do('Save / Load: Download Tournament File', lambda a: click(a.page, tid('nav-download-file')))
    nav(g, 'save-load', 'Save / Load: Download Recovery File: menu opened')
    with page.expect_download():
        g.do('Save / Load: Download Recovery File', lambda a: click(a.page, tid('nav-download-recovery')))
    menu_item(g, 'save-load', 'load-file', 'Save / Load: Load Tournament File (no file chosen)')
    menu_item(g, 'save-load', 'load-recovery', 'Save / Load: Load Recovery File (no file chosen)')
    nav(g, 'save-load', 'Save / Load: Copy Tournament ID: menu opened')
    g.do('Save / Load: Copy Tournament ID (offline)', lambda a: (click(a.page, '#saveLoadMenu button:text-is("Copy Tournament ID")'), settle(a.page)))
    menu_item(g, 'save-load', 'tournament-access', 'Save / Load: Tournament Access (offline)', wait=True)
    menu_item(g, 'save-load', 'cloud-diagnostics', 'Save / Load: Cloud Diagnostics')
    g.do('Developer Tools: Close', lambda a: click(a.page, tid('cloud-modal-close')))
    g.do('the status line opens Developer Tools', lambda a: click(a.page, '.cloud-status-wrap > div[role="button"]'))
    g.do('Developer Tools: a click inside (stays open)', lambda a: click(a.page, tid('cloud-modal-title')))
    g.do('Developer Tools: a click on the backdrop closes it', lambda a: click(a.page, '#ksmCloudModal'))
    # The status line as the sync code sets it.
    for mode, text in [('online', 'Live sync'), ('connecting', 'Sync connecting…'), ('error', 'Save <failed> & "x"'),
                       ('local', ''), ('bogus', 'Unknown mode'), ('offline', 'Offline')]:
        g.do(f'connection status: {mode} (code)', lambda a, m=mode, t=text: a.page.evaluate('([t, m]) => setConnectionStatus(t, m)', [t, m]))
    g.do('connection status: no mode (code)', lambda a: a.page.evaluate("() => setConnectionStatus('Plain')"))
    g.do('devices online: 3 (code)', lambda a: a.page.evaluate("() => renderCloudPresence([{}, {}, {}])"))
    g.do('devices online: none (code)', lambda a: a.page.evaluate("() => renderCloudPresence([])"))
    for mode in ['saving', 'syncing', 'offline', 'error']:
        g.do(f'save status: {mode} (code)', lambda a, m=mode: a.page.evaluate('m => { ksmSaveStatusMode = m; renderPersistentSaveStatus(); }', m))
    for label, ago in [('just now', 0), ('5 min ago', 5 * 60000), ('2 hours ago', 2 * 3600000)]:
        g.do(f'save status: saved {label} (code)', lambda a, ms=ago: a.page.evaluate(
            'ms => { ksmSaveStatusMode = "saved"; ksmLastSuccessfulSaveAt = Date.now() - ms; renderPersistentSaveStatus(); }', ms))
    g.do('save status: a message (code)', lambda a: a.page.evaluate("() => updateSaveStatus('Loaded <b>x</b>.ksm')"))
    g.do('a minute passes (the save status refresh, autosave)', lambda a: (a.page.clock.run_for(60000), settle(a.page)))
    menu_item(g, 'save-load', 'library', 'Save / Load: Tournament Library')
    g.do('a staff session again (test)', lambda a: a.page.evaluate(STAFF_JS))
    g.do('the brand clicked (Tournament Library)', lambda a: click(a.page, '.nav-brand'))
    g.do('a staff session again (test) 2', lambda a: a.page.evaluate(STAFF_JS))
    g.do('the brand: Enter (Tournament Library)', lambda a: (a.page.locator('.nav-brand').focus(), a.page.keyboard.press('Enter'), leave(a.page)))
    g.do('a staff session again (test) 3', lambda a: a.page.evaluate(STAFF_JS))
    nav(g, 'overview')
    g.do('Staff Logout', lambda a: (click(a.page, tid('staff-auth')), settle(a.page)))
    g.finish()


def nav_spectator(browser, react_check):
    g = open_app('nav-spectator', browser, react_check, api=Api('golden-cup', 'golden-pass'))
    g.do('a spectator (code)', lambda a: a.page.evaluate("() => { setSessionRole('spectator'); installRoleBanner('spectator'); navigateTo('public'); }"))
    for item in ['results', 'overview', 'live-scores']:
        nav(g, item, f'spectator: {item}')
    nav(g, 'courts', 'spectator: Courts menu opened')
    nav(g, 'court-a', 'spectator: Court A')
    g.do('spectator: Setup from the code (Live Scores instead)', lambda a: a.page.evaluate("() => navigateTo('setup')"))
    g.do('spectator: Staff Login without a tournament', lambda a: (click(a.page, tid('staff-auth')), settle(a.page)))
    g.do('a cloud tournament is open (code)', lambda a: a.page.evaluate("() => { cloudSession.tournamentId = 'golden-cup'; cloudSession.revision = 3; }"))
    g.answer = lambda d: d.dismiss()
    g.do('spectator: Staff Login cancelled', lambda a: (click(a.page, tid('staff-auth')), settle(a.page)))
    g.answer = lambda d: d.accept('wrong') if d.type == 'prompt' else d.accept()
    g.do('spectator: Staff Login with a wrong password', lambda a: (click(a.page, tid('staff-auth')), settle(a.page)))
    g.answer = lambda d: d.accept('golden-pass') if d.type == 'prompt' else d.accept()
    g.do('spectator: Staff Login with the right password', lambda a: (
        click(a.page, tid('staff-auth')), settle(a.page),
        poll(a.page, "() => ksmCloudSocket && ksmCloudSocket.readyState === 1", 'the live socket'), settle(a.page)))
    g.answer = None
    nav(g, 'setup', 'staff: Setup')
    nav(g, 'registration', 'staff: Registration')
    g.do('staff: Logout', lambda a: (click(a.page, tid('staff-auth')), settle(a.page)))
    g.do('the live socket opens again', lambda a: (poll(a.page, "() => ksmCloudSocket && ksmCloudSocket.readyState === 1", 'the live socket'), settle(a.page)))
    g.do('spectator: the status line (Developer Tools)', lambda a: click(a.page, '.cloud-status-wrap > div[role="button"]'))
    g.do('spectator: Developer Tools closed', lambda a: click(a.page, tid('cloud-modal-close')))
    g.finish()


def nav_phones(browser, react_check):
    g = open_app('nav-phones', browser, react_check)
    page = g.app.page
    for label, size in PHONES:
        g.do(f'{label}', lambda a, s=size: resize(a.page, s))
        for item in ['courts', 'tv', 'export', 'save-load']:
            nav(g, item, f'{label}: {item} menu opened')
        g.do(f'{label}: Escape', lambda a: a.page.keyboard.press('Escape'))
        nav(g, 'courts', f'{label}: Courts menu opened again')
        nav(g, 'court-b', f'{label}: Court B')
    resize(page, PHONES[0][1])
    nav(g, 'save-load', 'phone: Save / Load opened')
    g.do('phone: turned to landscape with the menu open', lambda a: resize(a.page, PHONES[1][1]))
    g.do('phone: back to portrait with the menu open', lambda a: resize(a.page, PHONES[0][1]))
    g.do('desktop with the menu open', lambda a: resize(a.page, DESKTOP))
    nav(g, 'save-load', 'desktop: Save / Load clicked (closed)')
    nav(g, 'export', 'desktop: Export opened')
    g.do('phone with the Export menu open (placed again)', lambda a: resize(a.page, PHONES[0][1]))
    nav(g, 'export', 'phone: Export clicked (closed)')
    nav(g, 'tv', 'phone: TV opened')
    g.do('phone: a click outside closes it', lambda a: click(a.page, 'main'))
    g.do('phone: spectator (code)', lambda a: a.page.evaluate("() => { setSessionRole('spectator'); installRoleBanner('spectator'); navigateTo('public'); }"))
    nav(g, 'courts', 'phone spectator: Courts menu opened')
    g.do('phone spectator: landscape', lambda a: resize(a.page, PHONES[1][1]))
    nav(g, 'court-a', 'phone spectator: Court A')
    g.finish()


def dialogs(browser, react_check):
    g = open_app('dialogs', browser, react_check)
    page = g.app.page
    nav(g, 'registration')
    g.do('Generate with nobody registered (the check passes)', lambda a: click(a.page, tid('generate-button')))
    g.do('the check: Cancel', lambda a: click(a.page, tid('generate-cancel')))
    g.do('Generate again', lambda a: click(a.page, tid('generate-button')))
    g.do('the check: Generate (nothing to generate: the alert)', lambda a: click(a.page, tid('generate-confirm')))
    g.do('registration with issues (code)', lambda a: a.page.evaluate("""() => {
      state.competitors = [
        {name: 'Ann <A>', dojo: 'Hilo & Co', division: state.divisions[0], seed: 'x', status: 'Checked'},
        {name: 'Ann <A>', dojo: 'Hilo & Co', division: state.divisions[0], seed: '', status: 'Checked'},
        {name: '', dojo: 'Kona', division: state.divisions[0], seed: '', status: 'Registered'}];
      renderReg(); renderTournamentStatus();
    }"""))
    g.do('Generate with issues', lambda a: click(a.page, tid('generate-button')))
    g.do('the check: Close', lambda a: click(a.page, tid('validation-close')))
    g.do('Generate with issues again', lambda a: click(a.page, tid('generate-button')))
    g.do('the check: Escape (stays open)', lambda a: a.page.keyboard.press('Escape'))
    g.do('the check: Close again', lambda a: click(a.page, tid('validation-close')))
    g.do('a tournament generated (test API configure())', lambda a: a.configure([
        {'name': 'Open <A>', 'format': 'Round Robin', 'court': 'A', 'entrants': people('O', 4)},
        {'name': 'Women & "B"', 'format': 'Round Robin', 'court': 'B', 'entrants': people('W', 3)},
        {'name': 'Kids', 'format': 'Round Robin', 'court': 'A', 'entrants': []}]))
    g.do('Generate (the check passes)', lambda a: click(a.page, tid('generate-button')))
    g.do('the check: Generate', lambda a: click(a.page, tid('generate-confirm')))
    nav(g, 'courts', 'Courts menu opened')
    nav(g, 'court-a', 'Court A')
    g.do('Fusen-gachi opened', lambda a: click(a.page, tid('fusen-gachi')))
    g.do('Fusen-gachi: Cancel', lambda a: click(a.page, tid('fusen-cancel')))
    g.do('Fusen-gachi opened again', lambda a: click(a.page, tid('fusen-gachi')))
    g.do('Fusen-gachi: Escape', lambda a: a.page.keyboard.press('Escape'))
    g.do('Fusen-gachi opened (White)', lambda a: click(a.page, tid('fusen-gachi')))
    g.do('Fusen-gachi: White', lambda a: click(a.page, tid('fusen-white')))
    g.do('Next Match', lambda a: click(a.page, tid('next-match')))
    g.do('Fusen-gachi opened (Red)', lambda a: click(a.page, tid('fusen-gachi')))
    g.do('Fusen-gachi: Red', lambda a: click(a.page, tid('fusen-red')))
    g.do('Fusen-gachi opened from the code with no match (nothing)', lambda a: a.page.evaluate(
        "() => { const c = state.current; state.current = 999; openFusenDialog(); state.current = c; }"))
    nav(g, 'registration')
    g.do('Regenerate Single Division opened', lambda a: click(a.page, tid('regenerate-division-button')))
    g.do('Regenerate: x', lambda a: click(a.page, tid('regenerate-modal-close')))
    g.do('Regenerate opened again', lambda a: click(a.page, tid('regenerate-division-button')))
    g.do('Regenerate: Continue (the first ready division)', lambda a: click(a.page, tid('regenerate-continue')))
    g.do('Regenerate: Cancel', lambda a: click(a.page, '#regenerateModalActions button:text-is("Cancel")'))
    g.do('Regenerate opened (to regenerate)', lambda a: click(a.page, tid('regenerate-division-button')))
    g.do('Regenerate: Continue', lambda a: click(a.page, tid('regenerate-continue')))
    g.do('Regenerate: Regenerate', lambda a: click(a.page, tid('regenerate-confirm')))
    g.do('Regenerate: OK', lambda a: click(a.page, '#regenerateModalActions button:text-is("OK")'))
    g.do('Women down to one player (code)', lambda a: a.page.evaluate(
        "() => { state.competitors = state.competitors.filter(c => !c.division.startsWith('Women') || c.name === 'W 1'); }"))
    g.do('Regenerate opened (Women fails the check)', lambda a: click(a.page, tid('regenerate-division-button')))
    g.do('Regenerate: Continue (Women)', lambda a: click(a.page, tid('regenerate-continue')))
    g.do('Regenerate: Regenerate (the check fails)', lambda a: click(a.page, tid('regenerate-confirm')))
    g.do('the check: Close (after Regenerate)', lambda a: click(a.page, tid('validation-close')))
    g.do('every division started (code)', lambda a: a.page.evaluate(
        "() => Object.values(state.allMatches).forEach(ms => { if (ms[0]) ms[0].done = true; })"))
    g.do('Regenerate opened (no division ready)', lambda a: click(a.page, tid('regenerate-division-button')))
    g.do('Regenerate: Continue (nothing chosen: the alert)', lambda a: click(a.page, tid('regenerate-continue')))
    g.do('Regenerate: x (end)', lambda a: click(a.page, tid('regenerate-modal-close')))
    g.finish()


def write_files(folder, page):
    """Tournament files: this tournament's, another's, an older one without an ID, a recovery file
    and one that is not JSON."""
    base = page.evaluate('() => tournamentFilePayload()')
    same = {**base, 'setup': {**(base.get('setup') or {}), 'tName': 'Same <Cup> & "Co"'}, 'savedAt': '2026-11-20T09:15:00.000Z', 'revision': 5}
    other = {**same, 'tournamentId': 'other-cup', 'revision': 12, 'setup': {**same['setup'], 'tName': 'Other Cup'}}
    older = {k: v for k, v in same.items() if k not in ('tournamentId', 'revision', 'savedAt')}
    files = {
        'same.ksm': json.dumps(same), 'other.ksm': json.dumps(other), 'older.ksm': json.dumps(older),
        'recovery.ksm': json.dumps({'fileType': 'KSM_RECOVERY', 'latestLocalSnapshot': base}),
        'broken.ksm': '{not json',
    }
    for name, text in files.items():
        (folder / name).write_text(text, encoding='utf-8')
    return {name: folder / name for name in files}


def choose(page, selector, path):
    page.set_input_files(selector, str(path))
    settle(page)


def cloud_modals(browser, react_check):
    g = open_app('cloud-modals', browser, react_check)
    page = g.app.page
    g.do('a cloud tournament is open (code)', lambda a: a.page.evaluate("() => { cloudSession.tournamentId = 'golden-cup'; cloudSession.revision = 4; }"))
    menu_item(g, 'save-load', 'tournament-access', 'Save / Load: Tournament Access')
    g.do('Tournament Access: the QR code loaded', lambda a: poll(
        a.page, "() => [...document.querySelectorAll('#ksmCloudModal img')].every(i => i.complete && i.naturalWidth)", 'the QR code'))
    g.do('Tournament Access: Copy Link', lambda a: (click(a.page, tid('access-copy')), settle(a.page)))
    g.do('Tournament Access: Close', lambda a: click(a.page, tid('cloud-modal-close')))
    menu_item(g, 'save-load', 'tournament-access', 'Save / Load: Tournament Access again')
    g.do('Tournament Access: the backdrop', lambda a: click(a.page, '#ksmCloudModal'))
    g.do('work queued for the cloud (code)', lambda a: a.page.evaluate("() => writeOutbox(tournamentPayload(), 'Golden queued work')"))
    menu_item(g, 'save-load', 'cloud-diagnostics', 'Developer Tools with work queued')
    g.do('Developer Tools: Close (queued)', lambda a: click(a.page, tid('cloud-modal-close')))
    g.do('a spectator (code)', lambda a: a.page.evaluate("() => { setSessionRole('spectator'); installRoleBanner('spectator'); }"))
    g.do('spectator: Developer Tools from the status line', lambda a: click(a.page, '.cloud-status-wrap > div[role="button"]'))
    g.do('spectator: Developer Tools closed', lambda a: click(a.page, tid('cloud-modal-close')))
    g.do('a staff session again (test)', lambda a: a.page.evaluate(f"() => {{ clearOutbox(); {STAFF} }}"))
    with tempfile.TemporaryDirectory() as tmp:
        files = write_files(Path(tmp), page)
        menu_item(g, 'save-load', 'load-file', 'Load Tournament File: the menu item')
        g.do('Load Tournament File: not a tournament file', lambda a: choose(a.page, '#ksmLoadFile', files['broken.ksm']))
        g.do('Load Tournament File: a recovery file', lambda a: choose(a.page, '#ksmLoadFile', files['recovery.ksm']))
        g.do('Load Tournament File: this tournament (same ID)', lambda a: choose(a.page, '#ksmLoadFile', files['same.ksm']))
        g.do('file: Cancel', lambda a: click(a.page, tid('file-load-cancel')))
        g.do('Load Tournament File: this tournament again', lambda a: choose(a.page, '#ksmLoadFile', files['same.ksm']))
        g.do('file: the backdrop', lambda a: click(a.page, '#ksmCloudModal'))
        g.do('Load Tournament File: this tournament (to replace)', lambda a: choose(a.page, '#ksmLoadFile', files['same.ksm']))
        g.do('file: Replace open tournament', lambda a: (click(a.page, tid('file-load-replace')), settle(a.page)))
        g.do('Load Tournament File: another tournament', lambda a: choose(a.page, '#ksmLoadFile', files['other.ksm']))
        g.do('file: Cancel (another)', lambda a: click(a.page, tid('file-load-cancel')))
        g.do('Load Tournament File: an older file without an ID', lambda a: choose(a.page, '#ksmLoadFile', files['older.ksm']))
        g.do('file: Load as new tournament (unsaved work: the alert)', lambda a: (click(a.page, tid('file-load-new')), settle(a.page)))
        g.do('file: Cancel (older)', lambda a: click(a.page, tid('file-load-cancel')))
        g.do('no cloud tournament open (code)', lambda a: a.page.evaluate("() => { cloudSession.tournamentId = null; cloudSession.revision = 0; }"))
        g.do('Load Tournament File: another tournament (none open)', lambda a: choose(a.page, '#ksmLoadFile', files['other.ksm']))
        g.answer = lambda d: d.dismiss() if d.type == 'prompt' else d.accept()
        g.do('file: Load as new tournament (password prompt cancelled)', lambda a: (click(a.page, tid('file-load-new')), settle(a.page)))
        g.answer = None
        g.do('file: Cancel (none open)', lambda a: click(a.page, tid('file-load-cancel')))
        g.do('Load Recovery File: not a recovery file', lambda a: choose(a.page, '#ksmRecoveryFile', files['broken.ksm']))
    g.finish()


# The shell islands (app/react/shell/main.tsx): React renders every element of the navigation
# (nav.minimal-nav, the island's root), the status row (.cloud-status-wrap) and the dialogs' cards.
ISLANDS = ['header.ksm-topbar nav.minimal-nav', 'header.ksm-topbar .cloud-status-wrap',
           '#fusenDialog', '#validationModal > .management-modal-card', '#regenerateModal > .management-modal-card']
ROOT_JS = "s => Object.keys(document.querySelector(s)).some(k => k.startsWith('__reactContainer'))"
# Which kinds of content the islands were given.
VARIANTS_JS = """() => {
  const out = [], n = window.ksmShellNavInput, h = window.ksmShellHeaderInput, d = window.ksmShellDialogsInput;
  if (n) {
    out.push('menu: ' + (n.open || 'none'));
    if (n.style) out.push('menu placed');
    out.push('active: ' + (n.active || 'none'));
  }
  if (h) {
    out.push('staff button: ' + h.staffLabel);
    if (h.connection) out.push('connection: ' + h.connection.mode);
    if (h.presence) out.push('devices online');
  }
  if (d) {
    if (d.fusen) out.push('fusen');
    if (d.validation) out.push('validation: ' + (d.validation.valid ? 'valid' : 'issues'));
    if (d.regenerate) out.push('regenerate: ' + d.regenerate.view);
    if (d.cloud) out.push('cloud: ' + d.cloud.kind + (d.cloud.kind === 'file' ? (d.cloud.same ? ' replace' : ' new') : '') + (d.cloud.retry ? ' retry' : ''));
  }
  return out;
}"""
VARIANTS_SEEN = set()


def check_react(golden, step):
    """React renders every element of the shell islands (and the cloud modal, a portal)."""
    page = golden.app.page
    for island in ISLANDS:
        total, owned = page.evaluate(PANEL_FIBERS_JS, island)
        assert total == owned, f'{golden.name}: {step}: {total - owned} of {total} elements in {island} are not rendered by React'
        assert page.evaluate(ROOT_JS, island), f'{golden.name}: {step}: {island} is not a React root'
        assert total, f'{golden.name}: {step}: nothing in {island}'
    if page.locator('#ksmCloudModal').count():
        total, owned = page.evaluate(PANEL_FIBERS_JS, '#ksmCloudModal')
        assert total == owned and page.evaluate("() => Object.keys(document.querySelector('#ksmCloudModal')).some(k => k.startsWith('__reactFiber'))"), \
            f'{golden.name}: {step}: the cloud modal is not rendered by React'
    VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))


def without_screens_module():
    """dist/index.html without the React screens' module script (as a device whose copy lacks it)."""
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    module = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert module, 'dist/index.html: no module script'
    return html.replace(module.group(0), '')


SCENARIOS = {
    'nav-staff': nav_staff,
    'nav-spectator': nav_spectator,
    'nav-phones': nav_phones,
    'dialogs': dialogs,
    'cloud-modals': cloud_modals,
}
CHECKS = {}
# Recorded from the legacy shell: no React islands yet.
REACT_CHECK = None


def main():
    started = time.time()
    chosen = [n for n in SCENARIOS if not ONLY or any(q in n for q in ONLY)]
    checks = [n for n in CHECKS if not UPDATE and (not ONLY or any(q in n for q in ONLY))]
    assert chosen or checks, f'no scenario matches {ONLY}'
    missing_geometry = [n for n in chosen if not UPDATE and not geometry_recorded(GOLDEN_DIR, n)]
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for name in chosen:
            SCENARIOS[name](browser, REACT_CHECK)
            print(f'  {name}: ok')
        for name in checks:
            CHECKS[name](browser)
            print(f'  {name}: ok')
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} the shell (navigation, header, dialogs) = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
