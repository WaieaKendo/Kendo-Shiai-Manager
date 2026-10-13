"""Golden (snapshot) test of Registration part 1: the individual players table (roadmap M.13).

Registration (#registration) starts with a toolbar card: the tab bar (Individual Players, Team
Registration, Exhibition, Pools), Generate Tournament, Regenerate Single Division, Import CSV,
Export CSV, Paste from Excel, Load Sample Tournament, Clear Registration, and the tournament
status card (#tournamentStatusCard: ready or needs attention, the counts). The Individual
Players card (#indReg) has + Add Row, + 5 Rows, Load Sample Players, the filter (#regFilter) and
the players table (#regTable: a row per competitor with name, dojo, division, seed, the status
that cycles Registered -> Checked In -> No Show on a click, and x to remove it). The approved
snapshots in tests/golden/registration/*.json were recorded from the LEGACY renderer
(renderReg() and renderTournamentStatus() in app/js/03-registration-and-validation.js, regTab()
in 23-navigation.js; the toolbars are static markup of app/index.html), so they pin exactly what
the legacy screen drew and did (quirks included, see docs/ROADMAP.md "Registration quirks
kept"). Teams, exhibitions and Pools are part 2 / their own test (golden-pools-test.py): only
whether their cards are shown is recorded here.

One offline copy of the app runs each scenario; after every step the toolbar card and #indReg
are serialized (golden_screen.PANEL_JS: elements, attributes, text, visibility, innerText, each
element's page box per platform) and compared with the approved snapshot, together with every
field's live value (value, selected option: properties, which the attributes do not show),
which element has the focus (and whether it is still in the page), the competitors and
divisions in state, the registration tab (state.regMode) and which Registration card is shown,
validateTournament(), the validation dialog when it is open, the view shown, the saves the step
asked for (noteLocalMutation(): every scheduleAutoSave()/criticalAutoSave(), also from the
document-wide input/change/click listeners), the scroll width, the page errors since the step
before and the dialogs shown (their answers are part of the scenario).

Buttons and status chips get a dispatched click (the mouse does not move, so no hover state
moves a box), text is typed with the keyboard into the focused field and committed with Tab
(the change event, as a person leaves the field), selects are chosen with select_option();
transitions are off.

  reg-empty        Registration as a staff device opens it (nobody registered), every tab and
                   back, phones, a spectator (Registration is not offered);
  reg-rows         + Add Row, + 5 Rows, names/dojos/seeds typed with special characters, every
                   division option, every status, the filter (name, dojo, division, status, no
                   match, cleared), x (also while filtered), phones;
  reg-validation   what the status card and the validation dialog show for a missing name, a
                   duplicate, invalid and duplicate seeds, too few players, a division switched
                   off in Setup, a split court with too few players, a valid registration;
  reg-samples      Load Sample Players, Clear Registration (Cancel, then OK), Load Sample
                   Tournament, Paste from Excel (tab-separated rows pasted on Registration; CR LF
                   line ends: F18, fixed; rows with an unknown division or status refused with a
                   notice: owner decisions 16/17), a live update with line breaks in a name and a
                   dojo, a live update with a status other than the three;
  reg-live         a live update arriving while a name is being typed (a staff device defers
                   it while a field is edited, then because of unsaved changes), the redraw of a
                   live update (renderAll()) while typing (the typed text is committed, the
                   focus is lost), an applied live update (applyTournamentPayload()) while a
                   field has the focus (F17, fixed: the typed text's player is not in the new
                   list, so the text is dropped with a notice; it used to land in the row now at
                   that place),
                   the filter through a redraw, the test API's configure(), statuses after
                   generation (a No Show taken out of a generated division; the alert once a
                   division has started).

Since M.13 React draws the players table and the status card's contents
(app/react/registration/: two islands, #regTable and #tournamentStatusCard; the card's class
stays legacy; app/js/43-react-registration.js publishes their data). React must render every
element of both islands (and both elements must be the islands' roots), and every kind of
content must be covered. The tab bar, the toolbars and the filter stay legacy markup.
reg-status-markup checks F19 for the players table: a pasted status with markup is escaped.
The legacy renderer is removed, so this test pins the React-only table and card; last, the app
without the React module script must show the "Players could not load" notice instead of the
empty table (and a working page never shows it).

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-registration-test.py [scenario ...]
"""
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, SPECTATOR_JS, UPDATE, Golden, geometry_recorded, people
from ksm_app import KsmApp
from ksm_browser import DIST, launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'registration'
TOOLBAR = '#registration > .card:first-child'
PLAYERS = '#indReg'
DESKTOP = {'width': 1280, 'height': 900}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390})]
NO_TRANSITIONS = '*, *::before, *::after { transition: none !important; animation: none !important; }'
SCROLL_JS = '() => [document.documentElement.scrollWidth, innerWidth]'
VIEW_JS = "() => [...document.querySelectorAll('.view')].filter(v => !v.classList.contains('hidden')).map(v => v.id)"
SHOWN_JS = "() => document.querySelector('#registration').checkVisibility()"
# The saves a step asks for: every scheduleAutoSave()/criticalAutoSave() calls noteLocalMutation()
# (looked up at call time), also when the document-wide listeners call them.
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
# its tag and position under #registration.
NAME_JS = """el => {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + el.id;
  const t = el.getAttribute('data-testid');
  if (t) return `${t}[${[...document.querySelectorAll(`[data-testid="${t}"]`)].indexOf(el)}]`;
  return `${el.tagName.toLowerCase()}[${[...document.querySelectorAll('#registration ' + el.tagName)].indexOf(el)}]`;
}"""
# Every field of the players card with its live properties, and the focus.
FIELDS_JS = f"""() => {{
  const name = {NAME_JS};
  const fields = [...document.querySelectorAll('#indReg input, #indReg select')].map(el => {{
    const f = [name(el), el.value];
    if (el.tagName === 'SELECT') f.push(el.selectedIndex);
    return f;
  }});
  const a = document.activeElement;
  return {{fields, focus: name(a), connected: a ? a.isConnected : null}};
}}"""
STATE_JS = """() => {
  const modal = document.getElementById('validationModal');
  const open = modal && !modal.classList.contains('hidden');
  return {
    competitors: state.competitors,
    divisions: state.divisions,
    regMode: state.regMode ?? null,
    cards: ['indReg', 'teamReg', 'exhibitionReg', 'poolsReg'].filter(id => !document.getElementById(id).classList.contains('hidden')),
    validation: validateTournament(),
    generated: !!state.generated,
    dialog: open ? modal.innerText : null,
    // A live update waiting: while a field is edited (ksmDeferredRemoteRecord) or while this
    // device has unsaved changes (ksmDeferredSyncRecord; always, in this offline copy).
    deferred: [!!ksmDeferredRemoteRecord, !!ksmDeferredSyncRecord],
  };
}"""


# The Registration islands (app/react/registration/main.tsx): React renders every element of the
# players table (#regTable, the island's root) and of the status card (#tournamentStatusCard).
ISLANDS = ['#indReg #regTable', '#registration #tournamentStatusCard']
ROOT_JS = "s => Object.keys(document.querySelector(s)).some(k => k.startsWith('__reactContainer'))"
# Which kinds of content the islands were given.
VARIANTS_JS = """() => {
  const p = window.ksmRegistrationPlayersInput, st = window.ksmRegistrationStatusInput, out = [];
  if (!p) out.push('players: nothing published');
  else {
    if (!p.rows.length) out.push('players: no rows');
    if (p.divisions.some(d => d.includes('\\n'))) out.push('text: a line break');
    p.rows.forEach(r => {
      out.push('status: ' + (r.checked ? 'Checked' : r.noShow ? 'NoShow' : r.status === 'Registered' ? 'Registered' : 'other'));
      out.push(r.selected.length ? 'division: offered' : 'division: not offered');
      if (/[<>&"']/.test(r.name + r.dojo)) out.push('text: special characters');
      if (r.name.includes('\\n') || r.status.includes('\\n')) out.push('text: a line break');
    });
  }
  if (!st) out.push('status card: nothing published');
  else out.push(st.valid ? 'status card: ready' : 'status card: needs attention');
  return out;
}"""
VARIANTS_SEEN = set()
ELEMENTS_SEEN = [0]  # most React-rendered elements seen in the players table


def check_react(golden, step):
    """React renders every element of the Registration islands."""
    page = golden.app.page
    for island in ISLANDS:
        total, owned = page.evaluate(PANEL_FIBERS_JS, island)
        assert total == owned, f'{golden.name}: {step}: {total - owned} of {total} elements in {island} are not rendered by React'
        assert page.evaluate(ROOT_JS, island), f'{golden.name}: {step}: {island} is not a React root'
        if island == ISLANDS[0]:
            assert total, f'{golden.name}: {step}: nothing in {island}'
            ELEMENTS_SEEN[0] = max(ELEMENTS_SEEN[0], owned)
    VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))


def capture(app):
    """Registration part 1: (serialization, element boxes)."""
    page = app.page
    toolbar = page.evaluate(PANEL_JS, TOOLBAR)
    players = page.evaluate(PANEL_JS, PLAYERS)
    errors, app.page_errors[:] = list(app.page_errors), []
    shown = page.evaluate(SHOWN_JS)
    entry = {
        'shown': shown,
        'views': page.evaluate(VIEW_JS),
        'fields': page.evaluate(FIELDS_JS),
        'state': page.evaluate(STATE_JS),
        'saves': page.evaluate(SAVES_JS),
        'scroll': page.evaluate(SCROLL_JS),
        'pageErrors': errors,
        # innerText of a hidden view is its textContent (the markup's source formatting).
        'toolbar': {'tree': toolbar['tree'], 'text': toolbar['text'] if shown else None},
        'players': {'tree': players['tree'], 'text': players['text'] if shown else None},
    }
    return entry, {'toolbar': toolbar['boxes'], 'players': players['boxes']}


def open_app(name, browser, react_check=None):
    app = KsmApp(browser.new_page(viewport=DESKTOP), name)
    # Page errors are part of each step's snapshot (capture()), not failures.
    app.page_errors = []
    load_app(app.page)  # a staff session on Setup
    app.enable_test_tools()  # owner decision 20: the sample-data buttons need the test tools on (pressed below)
    app.page.add_style_tag(content=NO_TRANSITIONS)
    app.page.evaluate(SAVES_INIT_JS)
    golden = Golden(name, app, app.page_errors, GOLDEN_DIR, capture, react_check)
    assert app.page.evaluate('window.ksmRegistrationMounted === true'), f'{name}: the Registration islands did not mount'
    assert app.page.locator('#registrationModuleMissing').count() == 0, f'{name}: "Players could not load" shown on a working page'
    return golden


def click(page, selector, index=0):
    """A click without moving the mouse (no hover state)."""
    page.locator(selector).nth(index).dispatch_event('click')


def tid(testid):
    return f'[data-testid="{testid}"]'


def button(text):
    return f'#registration button:text-is("{text}")'


def field(testid, index):
    return f'{tid("reg-row")} >> nth={index} >> {tid(testid)}'


def type_into(page, selector, text, clear=True):
    """Typed with the keyboard into the field, which keeps the focus."""
    el = page.locator(selector)
    el.focus()
    if clear:
        page.keyboard.press('ControlOrMeta+a')
        page.keyboard.press('Backspace')
    page.keyboard.type(text)


def leave(page):
    """The focus leaves the field without a change event of its own (the active element is blurred)."""
    page.evaluate('() => document.activeElement && document.activeElement.blur()')


def phone_views(g, label):
    for step, size in PHONES:
        g.do(f'{label}: {step}', lambda a, s=size: a.page.set_viewport_size(s))
    g.app.page.set_viewport_size(DESKTOP)


def open_registration(g):
    g.do('Registration from the menu', lambda a: click(a.page, tid('nav-registration')))


YONENBU = 'Yonenbu (11 years and under)'
WOMEN = 'Women’s Open'
YUDANSHA = 'Yudansha 1–3 Dan'
DIVISIONS = ['Yonenbu (11 years and under)', 'Shonenbu (12–14 years old)', 'Seinenbu (15+ years without dan)', WOMEN,
             YUDANSHA, 'Yudansha 4 Dan+', 'Masters Open (50+ years old)']


# ---------------------------------------------------------------------------------- scenarios
def reg_empty(browser, react_check):
    g = open_app('reg-empty', browser, react_check)
    g.do('Setup (Registration hidden)', lambda a: None)
    open_registration(g)
    # Owner decision 19 (#29): no Exhibition tab while exhibitions are off (the default); the tab is
    # golden-registration-teams-test.py's.
    for t in ['team', 'pools', 'individual']:
        g.do(f'tab: {t}', lambda a, t=t: click(a.page, tid(f'reg-tab-{t}')))
    g.do('Team Registration from the code (regTab)', lambda a: a.page.evaluate("() => regTab('team')"))
    g.do('Registration from the menu again (Individual Players)', lambda a: click(a.page, tid('nav-registration')))
    phone_views(g, 'empty')
    g.do('Setup', lambda a: click(a.page, tid('nav-setup')))
    g.do('spectator', lambda a: a.page.evaluate(SPECTATOR_JS))
    g.do('spectator: Registration from the code (Live Scores instead)', lambda a: a.page.evaluate("() => navigateTo('registration')"))
    g.do('spectator: openRegistrationTab() (nothing)', lambda a: a.page.evaluate("() => openRegistrationTab('individual')"))
    g.finish()


def reg_rows(browser, react_check):
    g = open_app('reg-rows', browser, react_check)
    page = g.app.page
    open_registration(g)
    g.do('+ Add Row', lambda a: click(a.page, tid('reg-add-row')))
    g.do('row 1: name focused', lambda a: a.page.locator(field('reg-name', 0)).focus())
    for part in ['Ann', ' <Bo> & "Cy"', " O'ahu 🏆"]:
        g.do(f'row 1: name typed {part!r}', lambda a, p=part: a.page.keyboard.type(p))
    g.do('row 1: Tab to the dojo (change)', lambda a: a.page.keyboard.press('Tab'))
    g.do('row 1: dojo typed', lambda a: a.page.keyboard.type('Hilo & <Kendo> "Club"'))
    g.do('row 1: Tab to the division (change)', lambda a: a.page.keyboard.press('Tab'))
    for d in DIVISIONS[1:] + DIVISIONS[:1]:
        g.do(f'row 1: division {d}', lambda a, d=d: a.page.select_option(field('reg-division', 0), label=d))
    g.do('row 1: seed typed', lambda a: type_into(a.page, field('reg-seed', 0), '1'))
    g.do('row 1: seed Tab (change)', lambda a: a.page.keyboard.press('Tab'))
    leave(page)
    for s in ['Checked In', 'No Show', 'Registered']:
        g.do(f'row 1: status click ({s})', lambda a: click(a.page, field('reg-status', 0)))
    g.do('+ 5 Rows', lambda a: click(a.page, button('+ 5 Rows')))
    names = [('Ben Tanaka', 'Aiea', WOMEN, '2'), ('Cara Ito', 'Maui', WOMEN, ''), ('Dai Mori', 'Aiea', YUDANSHA, 'x'),
             ('Emi Sato', 'Kailua', YUDANSHA, '0')]
    for i, (n, dojo, div, seed) in enumerate(names, start=1):
        g.do(f'row {i + 1}: {n} typed, Tab', lambda a, i=i, n=n: (type_into(a.page, field('reg-name', i), n), a.page.keyboard.press('Tab')))
        g.do(f'row {i + 1}: dojo, division, seed', lambda a, i=i, dojo=dojo, div=div, seed=seed: (
            a.page.keyboard.type(dojo), a.page.keyboard.press('Tab'),
            a.page.select_option(field('reg-division', i), label=div),
            type_into(a.page, field('reg-seed', i), seed), a.page.keyboard.press('Tab')))
    leave(page)
    g.do('row 2: Checked In', lambda a: click(a.page, field('reg-status', 1)))
    g.do('row 3: Checked In, No Show', lambda a: (click(a.page, field('reg-status', 2)), click(a.page, field('reg-status', 2))))
    g.do('a name typed (no change event yet), then a status click without a blur (the redraw drops the text)', lambda a: (
        type_into(a.page, field('reg-name', 3), 'Uncommitted'), click(a.page, field('reg-status', 3))))
    # The filter (each key redraws the table).
    for text in ['ai', 'aiea', 'women', 'checked', 'no show', 'registered', 'zzz']:
        g.do(f'filter: {text!r}', lambda a, t=text: type_into(a.page, tid('reg-filter'), t))
    g.do('filter: typed on with the table redrawn per key', lambda a: (type_into(a.page, tid('reg-filter'), 'm'), a.page.keyboard.type('a')))
    g.do('filter: Aiea (2 rows)', lambda a: type_into(a.page, tid('reg-filter'), 'Aiea'))
    g.do('filtered: × on the second shown row', lambda a: click(a.page, field('reg-remove', 1)))
    g.do('filtered: + Add Row (clears the filter: owner decision 14)', lambda a: click(a.page, tid('reg-add-row')))
    g.do('filter cleared', lambda a: type_into(a.page, tid('reg-filter'), ''))
    leave(page)
    phone_views(g, 'rows')
    g.do('× on row 1', lambda a: click(a.page, field('reg-remove', 0)))
    g.do('× on the last row (focused first)', lambda a: (a.page.locator(field('reg-remove', 4)).focus(), click(a.page, field('reg-remove', 4))))
    g.do('Setup', lambda a: click(a.page, tid('nav-setup')))
    open_registration(g)
    g.finish()


def reg_validation(browser, react_check):
    g = open_app('reg-validation', browser, react_check)
    page = g.app.page
    open_registration(g)

    def enter(i, name, dojo='', div=None, seed=''):
        def act(a):
            click(a.page, tid('reg-add-row'))
            if name:
                type_into(a.page, field('reg-name', i), name)
                a.page.keyboard.press('Tab')
            if dojo:
                type_into(a.page, field('reg-dojo', i), dojo)
                a.page.keyboard.press('Tab')
            if div:
                a.page.select_option(field('reg-division', i), label=div)
            if seed:
                type_into(a.page, field('reg-seed', i), seed)
                a.page.keyboard.press('Tab')
            leave(a.page)
        return act

    g.do('a row with a dojo only (missing name)', enter(0, '', 'Dojo Only'))
    g.do('Generate Tournament (the issues)', lambda a: click(a.page, tid('generate-button')))
    g.do('Close', lambda a: click(a.page, tid('validation-close')))
    g.do('the name entered', lambda a: (type_into(a.page, field('reg-name', 0), 'Solo One'), a.page.keyboard.press('Tab'), leave(a.page)))
    g.do('a second player (duplicate name, same division)', enter(1, 'Solo One', 'Other', None, '1'))
    g.do('the same name in another division', enter(2, 'Solo One', 'Third', WOMEN))
    g.do('a seed 0 and a seed "1.5"', lambda a: (enter(3, 'Kai Lee', 'K', None, '0')(a), enter(4, 'Lei Ono', 'L', None, '1.5')(a)))
    g.do('a duplicate seed', enter(5, 'Mo Ida', 'M', None, '1'))
    g.do('Generate Tournament (the issues)', lambda a: click(a.page, tid('generate-button')))
    g.do('Close', lambda a: click(a.page, tid('validation-close')))
    g.do('Setup: Women’s Open split between courts', lambda a: (
        click(a.page, tid('nav-setup')),
        a.page.select_option(f'xpath=//tr[@data-testid="setup-division-row"][.//b[.="{WOMEN}"]]//*[@data-testid="setup-division-court"]', value='split')))
    g.do('Setup: Yonenbu switched off', lambda a: click(
        a.page, f'xpath=//tr[@data-testid="setup-division-row"][.//b[.="{YONENBU}"]]//*[@data-testid="setup-division-enabled"]'))
    open_registration(g)
    g.do('Generate Tournament (the issues)', lambda a: click(a.page, tid('generate-button')))
    g.do('Close', lambda a: click(a.page, tid('validation-close')))
    g.do('the Yonenbu rows moved to Women’s Open', lambda a: [a.page.select_option(field('reg-division', i), label=WOMEN) for i in range(6)])
    g.do('duplicates and seeds fixed', lambda a: (
        type_into(a.page, field('reg-name', 1), 'Solo Two'), a.page.keyboard.press('Tab'),
        type_into(a.page, field('reg-name', 2), 'Solo Three'), a.page.keyboard.press('Tab'),
        type_into(a.page, field('reg-seed', 3), '2'), a.page.keyboard.press('Tab'),
        type_into(a.page, field('reg-seed', 4), '3'), a.page.keyboard.press('Tab'),
        type_into(a.page, field('reg-seed', 5), '4'), a.page.keyboard.press('Tab'), leave(a.page)))
    g.do('a No Show (not counted)', lambda a: (click(a.page, field('reg-status', 5)), click(a.page, field('reg-status', 5))))
    g.do('Generate Tournament (valid)', lambda a: click(a.page, tid('generate-button')))
    g.do('Cancel', lambda a: click(a.page, tid('generate-cancel')))
    g.do('Generate Tournament, Generate', lambda a: (click(a.page, tid('generate-button')), click(a.page, tid('generate-confirm'))))
    g.do('back to Registration', lambda a: click(a.page, tid('nav-registration')))
    g.finish()


PASTE_JS = """text => {
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
}"""


def reg_samples(browser, react_check):
    g = open_app('reg-samples', browser, react_check)
    open_registration(g)
    g.do('Load Sample Players', lambda a: click(a.page, button('Load Sample Players')))
    g.answer = lambda d: d.dismiss() if d.type == 'confirm' else d.accept()
    g.do('Clear Registration: Cancel', lambda a: click(a.page, tid('reg-clear')))
    g.answer = None
    g.do('Clear Registration: OK', lambda a: click(a.page, tid('reg-clear')))
    g.do('Load Sample Tournament', lambda a: click(a.page, button('Load Sample Tournament')))
    g.do('filter: Masters', lambda a: type_into(a.page, tid('reg-filter'), 'Masters'))
    g.do('filter cleared', lambda a: type_into(a.page, tid('reg-filter'), ''))
    leave(g.app.page)
    g.do('Clear Registration: OK', lambda a: click(a.page, tid('reg-clear')))
    g.do('Paste from Excel: rows with tabs', lambda a: a.page.evaluate(
        PASTE_JS, f'Ann <A>\tAiea & Co\t{WOMEN}\t1\tChecked In\nBo "B"\tMaui\n\tNo name\t{WOMEN}\nCy\tHilo\tPasted Division\t\tNoShow\nDee\tKona\t{WOMEN}\t2\tLate\n'))
    g.do('Paste from Excel: Excel line ends (CR LF)', lambda a: a.page.evaluate(PASTE_JS, f'Eve\tKauai\t{WOMEN}\r\nFay\tLanai\t{WOMEN}\t3\tChecked In\r\n'))
    g.do('Paste without tabs (ignored)', lambda a: a.page.evaluate(PASTE_JS, 'Just a name'))
    g.do('Team Registration: a paste there (ignored)', lambda a: (click(a.page, tid('reg-tab-team')), a.page.evaluate(PASTE_JS, 'Gus\tOahu')))
    g.do('Individual Players', lambda a: click(a.page, tid('reg-tab-individual')))
    phone_views(g, 'pasted')
    # Since F18 a paste no longer leaves a CR in a cell; synced data still can (another device, a file).
    g.do('a live update with line breaks in a name and a dojo (CR LF, CR)', lambda a: a.page.evaluate(LINE_BREAK_JS))
    # Owner decisions 16/17: a paste refuses an unknown status (the pasted "Late" row above is not
    # added), so a status other than the three now arrives only from another device or a file.
    g.do('a live update with a status other than the three ("Late")', lambda a: a.page.evaluate(OTHER_STATUS_JS))
    g.finish()


OTHER_STATUS_JS = """() => {
  const p = tournamentPayload();
  p.state.competitors.push({name: 'Dee', dojo: 'Kona', division: 'Women’s Open', seed: '2', status: 'Late'});
  ksmApplyingRemoteSnapshot = true;
  try { applyTournamentPayload(p, false, {source: 'live sync'}); } finally { ksmApplyingRemoteSnapshot = false; }
}"""


LINE_BREAK_JS = """() => {
  const p = tournamentPayload();
  p.state.competitors.push({name: 'Line\\r\\nBreak', dojo: 'Cr\\rDojo', division: 'Women’s Open', seed: '', status: 'Checked'});
  ksmApplyingRemoteSnapshot = true;
  try { applyTournamentPayload(p, false, {source: 'live sync'}); } finally { ksmApplyingRemoteSnapshot = false; }
}"""


# A live update: the cloud copy with another competitor list (built from this page's own payload),
# as applyRemoteCloudRecord() receives it.
REMOTE_JS = """() => {
  const p = tournamentPayload();
  p.state.competitors = [{name: 'Remote <One>', dojo: 'Remote & Dojo', division: 'Women’s Open', seed: '1', status: 'Checked'},
                         {name: 'Remote Two', dojo: 'Hilo', division: 'Remote Division', seed: '', status: 'NoShow'}];
  return p;
}"""
DEFER_JS = f"""() => {{
  const payload = ({REMOTE_JS})();
  const record = {{tournamentId: cloudSession.tournamentId, revision: Number(cloudSession.revision || 0) + 5,
                  updatedAt: new Date().toISOString(), updatedBy: {{clientId: 'another-device', name: 'Director 2'}}, payload}};
  window.__ksmDeferred = applyRemoteCloudRecord(record);
}}"""
CONFIRMED_JS = '() => { clearTimeout(ksmSaveTimer); ksmSaveTimer = null; clearTimeout(ksmCloudTimer); ksmCloudTimer = null; ksmConfirmedMutationVersion = ksmLocalMutationVersion; }'
APPLY_JS = f"""() => {{
  const payload = ({REMOTE_JS})();
  ksmApplyingRemoteSnapshot = true;
  try {{ applyTournamentPayload(payload, false, {{source: 'live sync'}}); }} finally {{ ksmApplyingRemoteSnapshot = false; }}
}}"""


def reg_live(browser, react_check):
    g = open_app('reg-live', browser, react_check)
    page = g.app.page
    open_registration(g)
    g.do('Load Sample Players', lambda a: click(a.page, button('Load Sample Players')))
    g.do('row 2: name being typed', lambda a: type_into(a.page, field('reg-name', 1), 'Hana Sat'))
    # As if this device's saves had reached the cloud (this offline copy never confirms them), so
    # the update is deferred because a field is being edited, not because of unsaved changes.
    g.do('a live update arrives while typing (deferred)', lambda a: (a.page.evaluate(CONFIRMED_JS), a.page.evaluate(DEFER_JS)))
    assert page.evaluate('window.__ksmDeferred') is False, 'the live update was not deferred while typing'
    g.do('row 2: typing on', lambda a: a.page.keyboard.type('ou'))
    g.do('row 2: Tab (change)', lambda a: a.page.keyboard.press('Tab'))
    g.do('row 2: dojo typed', lambda a: a.page.keyboard.type(' West'))
    leave(page)
    # Editing ended (no focus, no typing for 3 s): the update still waits, because this offline
    # copy never confirms its saves (localChangesPending()).
    g.do('editing ended: the update still waits (unsaved changes)', lambda a: a.page.wait_for_timeout(3600))
    g.do('Load Sample Players again', lambda a: click(a.page, button('Load Sample Players')))
    g.do('row 3: name being typed', lambda a: type_into(a.page, field('reg-name', 2), 'Mika It'))
    g.do("a live update's redraw (renderAll()) while typing", lambda a: a.page.evaluate('() => renderAll()'))
    g.do('typing on after the redraw', lambda a: a.page.keyboard.type('o!'))
    g.do("a live update's redraw with the focus in a division select", lambda a: (
        a.page.locator(field('reg-division', 0)).focus(), a.page.evaluate('() => renderAll()')))
    g.do('a live update applied while a dojo has the focus', lambda a: (
        type_into(a.page, field('reg-dojo', 0), 'Half'), a.page.evaluate(APPLY_JS)))
    leave(page)
    g.do('the filter typed, then a redraw (the filter keeps its text and focus)', lambda a: (
        type_into(a.page, tid('reg-filter'), 'remote'), a.page.evaluate('() => renderAll()')))
    g.do('filter cleared', lambda a: type_into(a.page, tid('reg-filter'), ''))
    leave(page)
    g.do('the test API configure(): two divisions, generated', lambda a: a.configure([
        {'name': WOMEN, 'format': 'Round Robin', 'court': 'A', 'entrants': people('W', 4)},
        {'name': 'Open & <Co>', 'format': 'Single Elimination', 'court': 'B', 'entrants': people('O', 3)}]))
    open_registration(g)
    g.do('generated: a player to No Show (taken out of the division)', lambda a: (
        click(a.page, field('reg-status', 0)), click(a.page, field('reg-status', 0)), click(a.page, field('reg-status', 0))))
    g.do('a match of Open & <Co> done (the division has started)', lambda a: a.page.evaluate(
        "() => { state.allMatches['Open & <Co>'][0].done = true; renderReg(); }"))
    g.do('started: a player to No Show (the alert, nothing changed)', lambda a: (
        click(a.page, field('reg-status', 4)), click(a.page, field('reg-status', 4)), click(a.page, field('reg-status', 4))))
    g.finish()


def reg_status_markup(browser):
    """F19: the legacy row printed the status into its class unescaped, so a pasted status with
    markup ran code. The React players table escapes it: the class holds the text, nothing runs.
    Since owner decision 16/17 a paste refuses an unknown status, so the status arrives the other
    way it can: a live update from another device (KsmApp.apply_live_update())."""
    app = KsmApp(browser.new_page(viewport=DESKTOP), 'status markup')
    page = app.page
    errors = []
    page.on('pageerror', lambda e: errors.append(f'status markup: {e}'))
    load_app(page)
    page.evaluate("() => { window.__pwned = 0; openRegistrationTab('individual'); }")
    evil = 'x"><img src=x onerror="window.__pwned=1">'
    page.evaluate(PASTE_JS, f'Evil\tDojo\t{WOMEN}\t\t{evil}')  # refused (an unknown status; the notice dismissed)
    assert app.payload()['state']['competitors'] == [], 'a paste added a row with an unknown status'
    payload = app.payload()
    payload['state']['competitors'] = [{'name': 'Evil', 'dojo': 'Dojo', 'division': WOMEN, 'seed': '', 'status': evil}]
    app.apply_live_update(payload)
    page.wait_for_selector(tid('reg-status'))
    assert page.evaluate('window.__pwned') == 0, 'a pasted status ran code (F19)'
    assert page.locator('#regTable img').count() == 0, 'a pasted status injected markup into the players table (F19)'
    assert page.locator(tid('reg-status')).get_attribute('class') == f'status {evil}', 'the status class is not the pasted text'
    assert page.locator(tid('reg-status')).inner_text() == '○ Registered'
    assert not errors, errors
    page.close()


def without_screens_module():
    """dist/index.html without the React screens' module script (as a device whose copy lacks it)."""
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    module = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert module, 'dist/index.html: no module script'
    return html.replace(module.group(0), '')


def reg_module_missing(browser):
    """Without the React module nothing draws the players table: Registration says so instead; the
    toolbars still work and the legacy code still publishes."""
    app = KsmApp(browser.new_page(viewport=DESKTOP), 'no React module')
    page = app.page
    errors = []
    page.on('pageerror', lambda e: errors.append(f'Registration module missing: {e}'))
    load_app(page, html=without_screens_module())
    page.evaluate("() => openRegistrationTab('individual')")
    notice = page.locator('#indReg [data-testid="registration-module-missing"]')
    assert notice.is_visible(), 'no "Players could not load" notice without the React module'
    assert 'Players could not load' in notice.inner_text(), notice.inner_text()
    assert not page.locator('#regTable').is_visible(), 'the empty players table is shown without the React module'
    assert not page.locator('#tournamentStatusCard').is_visible(), 'the empty status card is shown without the React module'
    page.locator(tid('reg-add-row')).dispatch_event('click')
    assert page.locator('#regTable *').count() == 0, 'something drew the players table without the React module'
    assert page.evaluate('window.ksmRegistrationPlayersInput.rows.length') == 1, 'renderReg() did not publish without the island'
    assert page.evaluate('window.ksmRegistrationStatusInput') is not None, 'renderTournamentStatus() did not publish without the island'
    assert page.locator(tid('reg-tab-team')).is_visible(), 'the tab bar is gone without the React module'
    assert not errors, errors
    page.close()


SCENARIOS = {
    'reg-empty': reg_empty,
    'reg-rows': reg_rows,
    'reg-validation': reg_validation,
    'reg-samples': reg_samples,
    'reg-live': reg_live,
}
CHECKS = {'reg-status-markup': reg_status_markup, 'reg-module-missing': reg_module_missing}
REACT_CHECK = check_react


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
        if not ONLY and not UPDATE:
            assert ELEMENTS_SEEN[0], 'React never rendered anything in the players table'
            expected = {
                'players: no rows', 'status: Checked', 'status: NoShow', 'status: Registered', 'status: other',
                'division: offered', 'division: not offered', 'text: special characters', 'text: a line break',
                'status card: ready', 'status card: needs attention',
            }
            assert expected <= VARIANTS_SEEN, f'Registration variants not covered: {sorted(expected - VARIANTS_SEEN)}; seen {sorted(VARIANTS_SEEN)}'
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} Registration players = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
