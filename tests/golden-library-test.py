"""Golden (snapshot) test of the Tournament Library, the home page (#home, body.ksm-home; roadmap M.13).

The app boots to the Tournament Library as a read-only spectator (showHomePage()): the KSM
brand, "Your Tournaments" with ＋ New Tournament, and a card per tournament (a 🏆 card and the
name below it, both opening the tournament in Spectator mode). The list comes from the device's
cache (localStorage) first, then from the cloud (GET /api/tournaments with an empty cache, POST
/api/tournaments/discover with the cached IDs otherwise), which replaces it; the empty and error
states say "Loading tournaments…", "No tournaments yet.", "Unable to load the Tournament
Library. Check your connection." or "Offline — no cached tournaments are available.". A failed
request keeps the cached cards. The approved snapshots in tests/golden/library/*.json were
recorded from the LEGACY renderer (paintHomeTournamentLibrary() and libraryCardMarkup() in
app/js/33-staff-session-and-library.js, fed by renderHomeTournamentLibrary() there), so they pin
exactly what the legacy screen drew (quirks included, see docs/ROADMAP.md "Library quirks kept").

Each scenario runs on its own copy of the app whose /api/* requests the test answers itself
(load_app(api=...)): every library request (the list, discover, opening and creating a
tournament) is held until the test answers it, so a step shows the page while a request is
pending and the next step after the answer; nothing depends on a server or on timing. Other
/api/* requests get the offline harness's 503 and are not recorded. Service workers are blocked
and live sockets are answered by the test (never connected). After every step the whole #home
view is serialized (golden_screen.PANEL_JS: elements, attributes but inline on* handlers, text,
visibility, innerText, each element's page box per platform) and compared with the approved
snapshot, together with whether the view is shown, the body's classes, the session role and
read-only banner, the library cache in localStorage, the library requests made since the step
before (method, path, body), the console warnings and errors, the page's scroll width against
the window's, the page errors and the dialogs (with the test's answers). While the library is
hidden its innerText is its textContent, so the text is compared only while it is shown. Buttons
are clicked with a dispatched click (no mouse move, so no :hover lift); transitions are off.

  library-empty      boot with an empty cache: the list requested ("Loading tournaments…"),
                     answered with no tournaments; phones; the list failing (500, a network
                     error, a reply that is not a list, null) with an empty cache; offline
                     with an empty cache; one tournament; offline with it cached;
  library-cards      several tournaments (long names, a long word, <, &, >, quotes, spaces,
                     no name, an ID with quotes, a duplicate ID): requested and answered, the
                     cache shown while discover is pending, phones; discover failing with
                     cards cached (500, a network error, a reply that is not a list, null);
                     opening a tournament from its card and from its name (pending, failing
                     with the alert and the library again, succeeding: Live Scores as a
                     spectator), back to the library; ＋ New Tournament (cancelled at the
                     name, at the password, passwords not matching, too short; created while
                     the cloud is down; then the library from that staff session);
  library-cached-phone  boot on a phone with tournaments cached: the cards at once while
                     discover is pending, then the cloud's list; landscape.

Since M.13 the library is drawn only by React (app/react/library/: one island, the contents of
#home .home-shell; app/js/40-react-library.js publishes its data), and this test pins the island
against the snapshots recorded from the legacy renderer. React must render every element of the
island (and .home-shell must be its root), every kind of library content must be covered, and
before anything is published the island must equal the static markup of app/index.html
(library-static-markup). The legacy renderer is removed (M.13), so this test pins the React-only
library; without the React module script the page must show the "Tournament Library could not
load" notice instead of the empty grid, keeping the static ＋ New Tournament (and a working page
never shows it).

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-library-test.py [scenario ...]
"""
import json
from datetime import datetime, timezone
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, UPDATE, Golden, first_difference, geometry_recorded
from ksm_app import KsmApp, sel
from ksm_browser import DIST, launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'library'
ROOT = '#home'
DESKTOP = {'width': 1280, 'height': 720}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390})]
NO_TRANSITIONS = '*, *::before, *::after { transition: none !important; animation: none !important; }'
VIEW_JS = f"() => !document.querySelector('{ROOT}').classList.contains('hidden')"
SCROLL_JS = '() => [document.documentElement.scrollWidth, innerWidth]'
SESSION_JS = """() => ({
  body: [...document.body.classList].sort(),
  role: ksmSessionRole,
  banner: document.querySelector('.spectator-readonly-banner')?.textContent ?? null,
  staffAuth: document.getElementById('staffAuthButton')?.textContent ?? null,
  cache: localStorage.getItem('ksm.tournament.library.v3_16'),
  visible: [...document.querySelectorAll('main > .view')].filter(v => !v.classList.contains('hidden')).map(v => v.id),
})"""
# The library's requests: the list, discover, opening and creating a tournament.
LIBRARY_API = re.compile(r'^(GET /api/tournaments(/[^/]+)?|POST /api/tournaments(/discover)?)$')
UPDATED_AT = '2026-10-01T09:00:00.000Z'
SECURE_CONTEXT_INIT = "if (!crypto.randomUUID) crypto.randomUUID = () => '00000000-0000-4000-8000-00000000000a';"


def card(tid, name=None):
    row = {'id': tid, 'updatedAt': UPDATED_AT}
    if name is not None:
        row['name'] = name
    return row


ONE = [card('7d3c1f0e-0000-4000-8000-000000000001', 'Aiea Taiheiji Kendo Tournament')]
SEVERAL = [
    card('7d3c1f0e-0000-4000-8000-000000000002', 'Hawaii Kendo Federation Annual Championship Tournament, Senior and Junior Divisions, Blaisdell Arena Exhibition Hall, Honolulu, Saturday and Sunday'),
    card('7d3c1f0e-0000-4000-8000-000000000003', 'Supercalifragilisticexpialidociouskendotaikaiwithoutanyspaces'),
    card('7d3c1f0e-0000-4000-8000-000000000004', 'Aiea <Taikai> & "Co" \'Kendo\' >'),
    card('7d3c1f0e-0000-4000-8000-000000000005', '  Spaced   Name  '),
    card('7d3c1f0e-0000-4000-8000-000000000006'),
    card('it\'s "odd" <id> & more', 'Odd ID Cup'),
    card('7d3c1f0e-0000-4000-8000-000000000001', 'Aiea Taiheiji Kendo Tournament'),
    card('7d3c1f0e-0000-4000-8000-000000000001', 'Duplicate ID Cup'),
]


def request_body(key, body):
    """A library request's body; creating a tournament: only what the library decides (the whole
    snapshot is the Setup's and the engine's, pinned elsewhere)."""
    if key != 'POST /api/tournaments':
        return body
    data = json.loads(body)
    return json.dumps({'tournamentId': data.get('tournamentId'), 'revision': data.get('revision'),
                       'tName': data.get('payload', {}).get('setup', {}).get('tName'),
                       'staffPassword': data.get('staffPassword')})


# The library island (app/react/library/main.tsx): React renders every element of the home page's
# shell, which is the island's root.
ISLAND = '#home .home-shell'
ROOT_JS = f"() => Object.keys(document.querySelector('{ISLAND}')).some(k => k.startsWith('__reactContainer'))"
# Which kinds of library content the island was given.
VARIANTS_JS = """() => {
  const d = window.ksmLibraryInput, out = [];
  if (!d || d.kind !== 'library') return ['nothing published'];
  if (!d.cards.length) out.push('message: ' + (d.message ? 'text' : 'empty'));
  d.cards.forEach(c => out.push(c.name ? 'card' : 'card without a name'));
  if (new Set(d.cards.map(c => c.id)).size < d.cards.length) out.push('duplicate ID');
  return out;
}"""
VARIANTS_SEEN = set()
ELEMENTS_SEEN = [0]  # most React-rendered elements seen in the island


def check_react(golden, step):
    """React renders every element of the library island."""
    page = golden.app.page
    total, owned = page.evaluate(PANEL_FIBERS_JS, ISLAND)
    assert total and total == owned, f'{golden.name}: {step}: {total - owned} of {total} elements in {ISLAND} are not rendered by React'
    ELEMENTS_SEEN[0] = max(ELEMENTS_SEEN[0], owned)
    assert page.evaluate(ROOT_JS), f'{golden.name}: {step}: {ISLAND} is not a React root'
    VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))


class Api:
    """Answers the copy's /api/* requests; library requests wait for the test (held)."""

    def __init__(self):
        self.held = []      # library requests not answered yet, in order
        self.requests = []  # library requests since the last step

    def __call__(self, route, path):
        request = route.request
        key = f'{request.method} {path}'
        if not LIBRARY_API.match(key):
            return route.fulfill(status=503, content_type='application/json', body='{"error":"offline test harness"}')
        self.requests.append(key + (f' {request_body(key, request.post_data)}' if request.post_data else ''))
        self.held.append(route)

    def wait(self, page, n=1):
        """Until n library requests are waiting."""
        deadline = time.time() + 10
        while len(self.held) < n:
            assert time.time() < deadline, f'expected {n} library request(s), {len(self.held)} came: {page.evaluate("({transition:ksmTournamentTransition,role:ksmSessionRole,id:cloudSession.tournamentId,online:navigator.onLine,outbox:readOutbox(),view:document.body.className})")}'
            page.wait_for_timeout(10)

    def answer(self, page, *answers):
        """Answer the waiting requests in order: a JSON value (200), (status, value) or 'network error'."""
        self.wait(page, len(answers))
        for reply in answers:
            route = self.held.pop(0)
            if reply == 'network error':
                route.abort('internetdisconnected')
            else:
                status, value = reply if isinstance(reply, tuple) else (200, reply)
                route.fulfill(status=status, content_type='application/json', body=json.dumps(value))
        settle(page)


def settle(page):
    """Let the page finish handling the answers (the fetch chain, the paint)."""
    page.wait_for_timeout(150)
    page.evaluate('() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))')


def capture(app):
    """The library: (serialization, element boxes)."""
    page = app.page
    panel = page.evaluate(PANEL_JS, ROOT)
    errors, app.page_errors[:] = list(app.page_errors), []
    console, app.console[:] = list(app.console), []
    requests, app.api.requests[:] = list(app.api.requests), []
    shown = page.evaluate(VIEW_JS)
    entry = {
        'shown': shown,
        'about': page.locator('[data-testid=library-about]').inner_text() if shown else None,
        'session': page.evaluate(SESSION_JS),
        'requests': requests,
        'pending': len(app.api.held),
        'console': console,
        'scroll': page.evaluate(SCROLL_JS),
        'pageErrors': errors,
        # innerText of a hidden view is its textContent.
        'library': {'tree': panel['tree'], 'text': panel['text'] if shown else None},
    }
    return entry, {'library': panel['boxes']}


def open_app(name, browser, viewport=DESKTOP, cached=None, react_check=check_react):
    """A copy of the app on its home page (the real boot: spectator), its library list held."""
    context = browser.new_context(viewport=viewport, service_workers='block')
    page = context.new_page()
    page.clock.set_fixed_time(datetime(2026, 10, 1, 9, tzinfo=timezone.utc))
    app = KsmApp(page, name)
    app.page_errors, app.console, app.api = [], [], Api()
    # The message's first line (a stack trace names positions in the built bundle).
    page.on('console', lambda m: m.type in ('warning', 'error') and app.console.append(f'{m.type}: {m.text.splitlines()[0]}'))
    # Live sockets (after a tournament is opened or created) stay with the test: never connected.
    page.route_web_socket(re.compile(r'.*/api/.*'), lambda ws: None)
    # The test origin (http://ksm.test) is not a secure context, which has no crypto.randomUUID();
    # the deployed app (https) has it, so boot runs as it does there (initializeCloudRoleFromUrl()).
    page.add_init_script(SECURE_CONTEXT_INIT)
    if cached is not None:
        # A device that already has tournaments cached (past the one-time v3.17.3 reset).
        page.add_init_script(f"localStorage.setItem('ksm.local.reset.v3_17_3', 'done'); "
                             f"localStorage.setItem('ksm.tournament.library.v3_16', {json.dumps(json.dumps(cached))});")
    golden = Golden(name, app, app.page_errors, GOLDEN_DIR, capture, react_check)
    # The staff password prompts are part of New Tournament here, not of a timed autosave.
    golden.timing_dialogs = set()
    load_app(page, session=None, api=app.api)
    page.add_style_tag(content=NO_TRANSITIONS)
    page.wait_for_function('window.KSMTest && KSMTest.booted()')
    assert page.evaluate('window.ksmLibraryMounted === true'), f'{name}: the library island did not mount'
    assert page.locator('#libraryModuleMissing').count() == 0, f'{name}: "Tournament Library could not load" shown on a working page'
    return golden


def answers(golden, replies):
    """Answer prompts and confirms by their message's start: a text, True (OK) or None (Cancel)."""
    def answer(d):
        for prefix, reply in replies.items():
            if d.message.startswith(prefix):
                return d.dismiss() if reply is None else d.accept(reply if isinstance(reply, str) else '')
        d.accept(d.default_value) if d.message.startswith('Tournament short name') else d.accept()
    golden.answer = answer


def click(testid, nth=0):
    """A dispatched click on the nth control with this test ID (no mouse move, so no :hover)."""
    return lambda a: a.page.locator(sel(testid)).nth(nth).dispatch_event('click')


def click_card(app, nth):
    """A dispatched click on the nth tournament's card (the 🏆 button above its name)."""
    app.page.locator(f'{sel("home-tournament")} .home-tournament-card').nth(nth).dispatch_event('click')


def phone_views(g, label):
    for step, size in PHONES:
        g.do(f'{label}: {step}', lambda a, s=size: a.page.set_viewport_size(s))
    g.app.page.set_viewport_size(DESKTOP)


def library_opened(g, label, *replies):
    """The library opened again (the brand, nav "Tournament Library": showHomePage()): pending, then answered."""
    api = g.app.api
    g.do(f'{label}: requested', lambda a: (a.page.evaluate('() => showHomePage()'), api.wait(a.page)))
    g.do(f'{label}: answered', lambda a: api.answer(a.page, *replies))


# ---------------------------------------------------------------------------------- scenarios
def library_empty(browser, errors):
    g = open_app('library-empty', browser)
    api, page = g.app.api, g.app.page
    g.do('boot: library requested', lambda a: api.wait(a.page))
    g.do('boot: no tournaments', lambda a: api.answer(a.page, []))
    phone_views(g, 'no tournaments')
    library_opened(g, 'list fails (500)', (500, {'error': 'Library unavailable'}))
    library_opened(g, 'network error', 'network error')
    library_opened(g, 'reply not a list', {'error': 'not a list'})
    library_opened(g, 'reply null', None)
    phone_views(g, 'unable to load')
    g.do('offline: library opened', lambda a: (a.page.context.set_offline(True), a.page.evaluate('() => showHomePage()'), settle(a.page)))
    phone_views(g, 'offline')
    page.context.set_offline(False)
    library_opened(g, 'one tournament', ONE)
    g.do('offline with one cached', lambda a: (a.page.context.set_offline(True), a.page.evaluate('() => showHomePage()'), settle(a.page)))
    page.context.set_offline(False)
    library_opened(g, 'online again: discover', [])
    g.finish()


def library_cards(browser, errors):
    g = open_app('library-cards', browser)
    api, page = g.app.api, g.app.page
    g.do('boot: library requested', lambda a: api.wait(a.page))
    g.do('boot: several tournaments', lambda a: api.answer(a.page, SEVERAL))
    phone_views(g, 'several')
    g.do('opened again: cached while discover is pending', lambda a: (a.page.evaluate('() => showHomePage()'), api.wait(a.page)))
    g.do('opened again: discover answered', lambda a: api.answer(a.page, SEVERAL[:5]))
    library_opened(g, 'discover fails (500)', (500, {'error': 'Library unavailable'}))
    library_opened(g, 'discover network error', 'network error')
    library_opened(g, 'discover reply not a list', {'error': 'not a list'})
    library_opened(g, 'discover reply null', None)
    library_opened(g, 'library again', SEVERAL)

    # Opening a tournament (Spectator mode): from its card, failing; from its name, succeeding.
    g.do('card clicked: opening', lambda a: (click_card(a, 5), api.wait(a.page)))
    g.do('card: tournament not found', lambda a: api.answer(a.page, (404, {'error': 'Tournament not found'})))
    g.do('card: library again', lambda a: api.answer(a.page, SEVERAL))
    payload = page.evaluate("() => { const p = tournamentPayload(); p.setup = {...p.setup, tName: 'Aiea <Taikai> & \"Co\" \\'Kendo\\' >'}; return p; }")
    record = {'tournamentId': SEVERAL[2]['id'], 'revision': 3, 'updatedAt': UPDATED_AT, 'payload': payload}
    g.do('name clicked: opening', lambda a: (click('home-tournament-name', 2)(a), api.wait(a.page)))
    g.do('name: opened (Live Scores)', lambda a: api.answer(a.page, record))
    library_opened(g, 'back to the library', SEVERAL)

    # ＋ New Tournament: the prompts (meeting decision: kept as they are).
    answers(g, {'Tournament Name': None})
    g.do('new tournament: name cancelled', lambda a: (click('home-new-tournament')(a), settle(a.page)))
    answers(g, {'Tournament Name': 'Library Cup', 'Create Staff password': None})
    g.do('new tournament: password cancelled', lambda a: (click('home-new-tournament')(a), settle(a.page)))
    answers(g, {'Tournament Name': 'Library Cup', 'Create Staff password': 'abc'})
    g.do('new tournament: password too short', lambda a: (click('home-new-tournament')(a), settle(a.page)))
    answers(g, {'Tournament Name': 'Library Cup', 'Create Staff password': 'abcd', 'Confirm Staff password': 'abce'})
    g.do('new tournament: passwords differ', lambda a: (click('home-new-tournament')(a), settle(a.page)))
    answers(g, {'Tournament Name': 'Library Cup', 'Create Staff password': 'abcd', 'Confirm Staff password': 'abcd'})
    g.do('new tournament: creating', lambda a: (click('home-new-tournament')(a), api.wait(a.page)))
    g.do('new tournament: cloud down', lambda a: api.answer(a.page, (503, {'error': 'Cloud unavailable'})))
    g.do('browse Library with unsaved staff work', lambda a: (a.page.evaluate('() => { void showHomePage(); }'), api.wait(a.page)))
    g.do('browse: discover answered, staff work preserved', lambda a: api.answer(a.page, SEVERAL))
    g.finish()


def library_cached_phone(browser, errors):
    g = open_app('library-cached-phone', browser, viewport=PHONES[0][1], cached=SEVERAL[:4])
    api = g.app.api
    g.do('boot: cached cards, discover pending', lambda a: api.wait(a.page))
    g.do('boot: discover answered', lambda a: api.answer(a.page, ONE + SEVERAL[:2]))
    g.do('landscape', lambda a: a.page.set_viewport_size(PHONES[1][1]))
    g.finish()


def without_screens_module():
    """dist/index.html without the React screens' module script (as a device whose copy lacks it)."""
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    module = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert module, 'dist/index.html: no module script'
    return html.replace(module.group(0), '')


# The library as if nothing had been published (the island before the first publish).
UNPUBLISHED_JS = "() => { delete window.ksmLibraryInput; window.dispatchEvent(new CustomEvent('ksm:library')); }"


def library_static_markup(browser, errors):
    """Before anything is published, the island draws the static markup of app/index.html."""
    seen = []
    for label, html in (('static markup', without_screens_module()), ('island', None)):
        context = browser.new_context(viewport=DESKTOP, service_workers='block')
        page = context.new_page()
        page.on('pageerror', lambda e, l=label: errors.append(f'{l}: {e}'))
        page.add_init_script(SECURE_CONTEXT_INIT)
        if html is not None:
            # Without the module nothing may touch the static markup (no legacy drawing, no notice).
            page.add_init_script('window.ksmLibraryMounted = true;')
        api = Api()
        load_app(page, html=html, session=None, api=api)
        api.wait(page)  # the boot's library request: left pending, so nothing is drawn from it
        page.add_style_tag(content=NO_TRANSITIONS)
        if html is None:
            page.evaluate(UNPUBLISHED_JS)
            total, owned = page.evaluate(PANEL_FIBERS_JS, ISLAND)
            assert total and total == owned, f'island before the first publish: {total - owned} of {total} elements not rendered by React'
            VARIANTS_SEEN.add('nothing published')
        seen.append(page.evaluate(PANEL_JS, ROOT))
        for route in api.held:
            route.abort()
        context.close()
    assert seen[0] == seen[1], f'the island before the first publish differs from the static markup: {first_difference(seen[1], seen[0])}'


def library_module_missing(browser, errors):
    """Without the React module nothing draws the library: it says so instead."""
    context = browser.new_context(viewport=DESKTOP, service_workers='block')
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(f'library module missing: {e}'))
    page.add_init_script(SECURE_CONTEXT_INIT)
    api = Api()
    load_app(page, html=without_screens_module(), session=None, api=api)
    api.answer(page, SEVERAL)
    notice = page.locator('#home [data-testid="library-module-missing"]')
    assert notice.is_visible(), 'no "Tournament Library could not load" notice without the React module'
    assert 'Tournament Library could not load' in notice.inner_text(), notice.inner_text()
    assert not page.locator('#homeTournamentLibrary').is_visible(), 'the empty library grid is shown without the React module'
    assert page.locator(sel('home-new-tournament')).is_visible(), 'the static ＋ New Tournament is hidden without the React module'
    assert page.evaluate('window.ksmLibraryInput.cards.length') == len(SEVERAL), 'the library was not published without the island'
    context.close()


# Checks without a snapshot file.
CHECKS = {'library-static-markup': library_static_markup, 'library-module-missing': library_module_missing}

SCENARIOS = {
    'library-empty': library_empty,
    'library-cards': library_cards,
    'library-cached-phone': library_cached_phone,
}


def main():
    started = time.time()
    chosen = [n for n in SCENARIOS if not ONLY or any(q in n for q in ONLY)]
    checks = [n for n in CHECKS if not UPDATE and (not ONLY or any(q in n for q in ONLY))]
    assert chosen or checks, f'no scenario matches {ONLY}'
    missing_geometry = [n for n in chosen if not UPDATE and not geometry_recorded(GOLDEN_DIR, n)]
    with sync_playwright() as p:
        browser = launch_chromium(p)
        errors = []
        for name in chosen:
            SCENARIOS[name](browser, errors)
            print(f'  {name}: ok')
        for name in checks:
            CHECKS[name](browser, errors)
            print(f'  {name}: ok')
        if not ONLY and not UPDATE:
            assert ELEMENTS_SEEN[0], 'React never rendered anything on the library'
            expected = {'nothing published', 'message: text', 'card', 'card without a name', 'duplicate ID'}
            assert expected <= VARIANTS_SEEN, f'library variants not covered: {sorted(expected - VARIANTS_SEEN)}; seen {sorted(VARIANTS_SEEN)}'
        assert not errors, '\n'.join(errors)
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} Tournament Library = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
