"""Golden (snapshot) test of the Setup screen (#setup; roadmap M.13).

Setup shows the tournament details (name, host, date, location, courts, tournament type), the
Individual Divisions table (#divisionSetupRows: a row per preset division and per custom
division, with Use, the name, the format and the court; a custom row has × to remove it) and
Add Custom Division, the Team Tournament settings (enabled, team match format, tournament
format, court, team awards), Exhibition Matches, the referees and each court's red side, and
Save Setup & Continue; the hero repeats the tournament name (#setupTournamentName). The
approved snapshots in tests/golden/setup/*.json were recorded from the LEGACY renderer
(renderDivisionSetup() and divisionSetupRow() in app/js/01-state-and-setup.js,
syncSetupHeader() in 30-setup-header-and-director.js; the rest of Setup is the static markup of
app/index.html, read and written by id by getSetupSnapshot()/applySetupSnapshot() in 20-, the
test API and the engine settings), so they pin exactly what the legacy screen drew and did
(quirks included, see docs/ROADMAP.md "Setup quirks kept").

One offline copy of the app runs each scenario; after every step the whole #setup view is
serialized (golden_screen.PANEL_JS: elements, attributes, text, visibility, innerText, each
element's page box per platform) and compared with the approved snapshot, together with every
field's live value (value, checked, disabled, selected option: properties, which the
attributes do not show), which element has the focus, getSetupSnapshot(), tournamentSettings()
(the engine's reading of it), the divisions in state (list, formats, courts, the team award
mode), whether the page shows the red side on the left, which view is shown, the saves the step
asked for (noteLocalMutation(): every scheduleAutoSave()/criticalAutoSave(), also from the
document-wide input/change/click listeners), the scroll width, the page errors since the step
before and the dialogs shown. While the view is hidden its innerText is its textContent, so
the text is compared only while it is shown (the tree always).

Buttons and the division checkboxes get a dispatched click (the mouse does not move, so no
hover state moves a box), text is typed with the keyboard into the focused field, selects are
chosen with select_option(); transitions are off.

  setup-defaults      Setup as a staff device opens it (the defaults), phones, the
                      spectator (Setup hidden, the menu sends it to Live Scores);
  setup-details       a whole setup typed by hand: name (with <, &, quotes and an emoji; the
                      hero follows each key), host, date, location, courts, tournament type,
                      every team setting and option, exhibitions on and off, referees, both
                      courts' red sides, Save Setup & Continue, back to Setup; phones;
  setup-divisions     presets switched off and on (with the mouse and the keyboard; the
                      focus), every format and court option, Add Custom Division (round
                      robin, single elimination, split; special characters; an empty name;
                      a duplicate; a preset's name), × on a custom division, a custom division
                      switched off (it leaves the table), phones;
  setup-live          a live update while typing: a staff device defers it (the typed text
                      and the focus stay); the redraw of a live update (renderAll()) with the
                      focus in the name, in a division select and in a referees field; an
                      applied live update (applyTournamentPayload()) with other setup values
                      and divisions; the test API's configure() (divisions, team settings).
"""
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import (
    ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, SPECTATOR_JS, UPDATE, Golden, geometry_recorded, people, team,
)
from ksm_app import KsmApp
from ksm_browser import launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'setup'
ROOT = '#setup'
DESKTOP = {'width': 1280, 'height': 900}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390})]
NO_TRANSITIONS = '*, *::before, *::after { transition: none !important; animation: none !important; }'
SCROLL_JS = '() => [document.documentElement.scrollWidth, innerWidth]'
VIEW_JS = "() => [...document.querySelectorAll('.view')].filter(v => !v.classList.contains('hidden')).map(v => v.id)"
SHOWN_JS = f"() => document.querySelector('{ROOT}').checkVisibility()"
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
# its tag and position under #setup.
NAME_JS = """el => {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + el.id;
  const t = el.getAttribute('data-testid');
  if (t) return `${t}[${[...document.querySelectorAll(`[data-testid="${t}"]`)].indexOf(el)}]`;
  return `${el.tagName.toLowerCase()}[${[...document.querySelectorAll('#setup ' + el.tagName)].indexOf(el)}]`;
}"""
# Every field of Setup with its live properties, and the focus.
FIELDS_JS = f"""() => {{
  const name = {NAME_JS};
  const fields = [...document.querySelectorAll('#setup input, #setup select, #setup textarea')].map(el => {{
    const f = [name(el), el.value, el.disabled];
    if (el.type === 'checkbox') f.push(el.checked);
    if (el.tagName === 'SELECT') f.push(el.selectedIndex);
    return f;
  }});
  return {{fields, focus: name(document.activeElement), connected: document.activeElement ? document.activeElement.isConnected : null}};
}}"""
STATE_JS = """() => ({
  setup: getSetupSnapshot(),
  settings: tournamentSettings(),
  divisions: state.divisions,
  types: state.divisionTypes,
  courts: state.divisionCourts,
  teamAwardMode: state.teamAwardMode,
  redLeft: document.body.classList.contains('ksm-red-left'),
})"""


def capture(app):
    """The Setup screen: (serialization, element boxes)."""
    page = app.page
    panel = page.evaluate(PANEL_JS, ROOT)
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
        'setup': {'tree': panel['tree'], 'text': panel['text'] if shown else None},
    }
    return entry, {'setup': panel['boxes']}


def open_app(name, browser, react_check=None):
    app = KsmApp(browser.new_page(viewport=DESKTOP), name)
    # Page errors are part of each step's snapshot (capture()), not failures.
    app.page_errors = []
    load_app(app.page)  # a staff session on Setup
    app.page.add_style_tag(content=NO_TRANSITIONS)
    app.page.evaluate(SAVES_INIT_JS)
    return Golden(name, app, app.page_errors, GOLDEN_DIR, capture, react_check)


def click(page, selector, index=0):
    """A click without moving the mouse (no hover state)."""
    page.locator(selector).nth(index).dispatch_event('click')


def tid(testid):
    return f'[data-testid="{testid}"]'


def type_into(page, selector, text, clear=True):
    """Typed with the keyboard into the field, which keeps the focus."""
    field = page.locator(selector)
    field.focus()
    if clear:
        page.keyboard.press('ControlOrMeta+a')
        page.keyboard.press('Backspace')
    page.keyboard.type(text)


def leave(page):
    """The focus leaves the field (as Tab to nowhere: the active element is blurred)."""
    page.evaluate('() => document.activeElement && document.activeElement.blur()')


def row(name):
    """The division row whose name is `name` (a CSS selector is not enough: names repeat text)."""
    return f'xpath=//tr[@data-testid="setup-division-row"][.//b[@data-testid="setup-division-name"][.={xpath_literal(name)}]]'


def xpath_literal(s):
    if "'" not in s:
        return f"'{s}'"
    if '"' not in s:
        return f'"{s}"'
    return 'concat(' + ', "\'", '.join(f"'{p}'" for p in s.split("'")) + ')'


def in_row(name, testid):
    return f'{row(name)}//*[@data-testid="{testid}"]'


def phone_views(g, label):
    for step, size in PHONES:
        g.do(f'{label}: {step}', lambda a, s=size: a.page.set_viewport_size(s))
    g.app.page.set_viewport_size(DESKTOP)


YONENBU = 'Yonenbu (11 years and under)'
SHONENBU = 'Shonenbu (12–14 years old)'
WOMEN = 'Women’s Open'
MASTERS = 'Masters Open (50+ years old)'


# ---------------------------------------------------------------------------------- scenarios
def setup_defaults(browser, react_check):
    g = open_app('setup-defaults', browser, react_check)
    g.do('Setup (staff, the defaults)', lambda a: None)
    phone_views(g, 'defaults')
    g.do('Registration', lambda a: click(a.page, tid('nav-registration')))
    g.do('Setup from the menu', lambda a: click(a.page, tid('nav-setup')))
    g.do('spectator (Setup hidden)', lambda a: a.page.evaluate(SPECTATOR_JS))
    g.do('spectator: Setup from the menu (Live Scores instead)', lambda a: a.page.evaluate("() => navigateTo('setup')"))
    g.finish()


def setup_details(browser, react_check):
    g = open_app('setup-details', browser, react_check)
    page = g.app.page
    g.do('Setup', lambda a: None)
    # The hero follows each key of the name.
    g.do('name: focused', lambda a: a.page.locator('#tName').focus())
    g.do('name: cleared', lambda a: (a.page.keyboard.press('ControlOrMeta+a'), a.page.keyboard.press('Backspace')))
    for part in ['Ann', ' & <Bo>', ' "Cup"', " O'ahu 🏆"]:
        g.do(f'name: typed {part!r}', lambda a, p=part: a.page.keyboard.type(p))
    g.do('name: Tab to the host', lambda a: a.page.keyboard.press('Tab'))
    g.do('host typed', lambda a: type_into(a.page, '#tHost', 'Hilo Kendo & Iaido <Club>'))
    g.do('date filled', lambda a: a.page.locator('#tDate').fill('2026-11-14'))
    g.do('location typed', lambda a: type_into(a.page, '#tLocation', 'Kalakaua "Gym", Honolulu'))
    g.do('courts typed', lambda a: type_into(a.page, '#tCourts', '3'))
    for opt in ['Individual', 'Team', 'Individual + Team']:
        g.do(f'tournament type: {opt}', lambda a, o=opt: a.page.select_option('#tType', label=o))
    leave(page)
    g.do('team: Disabled', lambda a: a.page.select_option(tid('team-enabled'), label='Disabled'))
    g.do('team: Enabled', lambda a: a.page.select_option(tid('team-enabled'), label='Enabled'))
    for opt in ['5-Person Team', 'Kachinuki', '3-Person Team']:
        g.do(f'team format: {opt}', lambda a, o=opt: a.page.select_option(tid('team-format'), label=o))
    for opt in ['Round Robin', 'Single Elimination']:
        g.do(f'team tournament format: {opt}', lambda a, o=opt: a.page.select_option(tid('team-tournament-format'), label=o))
    for opt in ['A', 'B', 'Both']:
        g.do(f'team court: {opt}', lambda a, o=opt: a.page.select_option(tid('team-court'), label=o))
    for opt in ['top1', 'dual3', 'top2']:
        g.do(f'team awards: {opt}', lambda a, o=opt: a.page.select_option('#teamAwardMode', value=o))
    g.do('exhibitions: Enabled', lambda a: a.page.select_option(tid('exhibition-enabled'), label='Enabled'))
    g.do('exhibitions: Disabled', lambda a: a.page.select_option(tid('exhibition-enabled'), label='Disabled'))
    g.do('exhibitions: Enabled again', lambda a: a.page.select_option(tid('exhibition-enabled'), label='Enabled'))
    g.do('Court A referees typed', lambda a: type_into(a.page, '#court1Refs', 'Sensei A\nSensei <B> & "C"'))
    g.do('Court B referees typed', lambda a: type_into(a.page, '#court2Refs', 'Sensei D'))
    leave(page)
    g.do('Court A: red on the left', lambda a: a.page.select_option('#court1RedSide', value='left'))
    g.do('Court B: red on the left', lambda a: a.page.select_option('#court2RedSide', value='left'))
    g.do('Court A: red on the right', lambda a: a.page.select_option('#court1RedSide', value='right'))
    phone_views(g, 'filled in')
    leave(page)
    g.do('Save Setup & Continue', lambda a: click(a.page, tid('setup-save-continue')))
    g.do('back to Setup', lambda a: click(a.page, tid('nav-setup')))
    g.do('name emptied (the hero falls back)', lambda a: type_into(a.page, '#tName', ''))
    g.do('name typed again', lambda a: a.page.keyboard.type('Spring Taikai'))
    g.finish()


def setup_divisions(browser, react_check):
    g = open_app('setup-divisions', browser, react_check)
    page = g.app.page
    g.do('Setup', lambda a: None)
    # Off and on with a dispatched click (no focus), with the focus first, with the keyboard.
    g.do('Yonenbu off', lambda a: click(a.page, in_row(YONENBU, 'setup-division-enabled')))
    g.do('Shonenbu off (focused first)', lambda a: (a.page.locator(in_row(SHONENBU, 'setup-division-enabled')).focus(),
                                                   click(a.page, in_row(SHONENBU, 'setup-division-enabled'))))
    g.do('Masters off with the keyboard (Space)', lambda a: (a.page.locator(in_row(MASTERS, 'setup-division-enabled')).focus(),
                                                            a.page.keyboard.press('Space')))
    leave(page)
    g.do('Yonenbu on again', lambda a: click(a.page, in_row(YONENBU, 'setup-division-enabled')))
    # Every format and court option.
    g.do("Women's Open: Single Elimination", lambda a: a.page.select_option(in_row(WOMEN, 'setup-division-format'), label='Single Elimination'))
    for value in ['A', 'split', 'B']:
        g.do(f"Women's Open: court {value}", lambda a, v=value: a.page.select_option(in_row(WOMEN, 'setup-division-court'), value=v))
    g.do("Women's Open: Round Robin", lambda a: a.page.select_option(in_row(WOMEN, 'setup-division-format'), label='Round Robin'))
    g.do('Yonenbu: Single Elimination, split', lambda a: (a.page.select_option(in_row(YONENBU, 'setup-division-format'), label='Single Elimination'),
                                                         a.page.select_option(in_row(YONENBU, 'setup-division-court'), value='split')))
    leave(page)
    g.do('Yonenbu off (its format and court kept in state)', lambda a: click(a.page, in_row(YONENBU, 'setup-division-enabled')))
    g.do('Yonenbu on (the preset format and court again)', lambda a: click(a.page, in_row(YONENBU, 'setup-division-enabled')))
    # Add Custom Division.
    g.do('custom: name typed', lambda a: type_into(a.page, tid('custom-division-name'), 'Open <A> & "B"'))
    g.do('custom: Single Elimination', lambda a: a.page.select_option(tid('custom-division-format'), label='Single Elimination'))
    g.do('custom: split', lambda a: a.page.select_option(tid('custom-division-court'), value='split'))
    g.do('custom: + Add Division', lambda a: click(a.page, tid('custom-division-add')))
    g.do('custom: + Add Division with no name (nothing)', lambda a: click(a.page, tid('custom-division-add')))
    g.do('custom: spaces only (nothing)', lambda a: (type_into(a.page, tid('custom-division-name'), '   '), click(a.page, tid('custom-division-add'))))
    g.do("custom 2: O'ahu Juniors, Round Robin, Court B", lambda a: (
        type_into(a.page, tid('custom-division-name'), "  O'ahu Juniors  "),
        a.page.select_option(tid('custom-division-format'), label='Round Robin'),
        a.page.select_option(tid('custom-division-court'), value='B'),
        click(a.page, tid('custom-division-add'))))
    g.do('custom: a duplicate name (cleared, nothing added)', lambda a: (type_into(a.page, tid('custom-division-name'), "O'ahu Juniors"),
                                                                      click(a.page, tid('custom-division-add'))))
    g.do("custom: a switched-off preset's name (Shonenbu on, custom format and court)", lambda a: (
        type_into(a.page, tid('custom-division-name'), SHONENBU),
        a.page.select_option(tid('custom-division-format'), label='Single Elimination'),
        a.page.select_option(tid('custom-division-court'), value='split'),
        click(a.page, tid('custom-division-add'))))
    g.do('custom 3: Kids, Enter in the name does nothing', lambda a: (type_into(a.page, tid('custom-division-name'), 'Kids'), a.page.keyboard.press('Enter')))
    g.do('custom 3: + Add Division', lambda a: click(a.page, tid('custom-division-add')))
    leave(page)
    g.do("custom 2: court A", lambda a: a.page.select_option(in_row("O'ahu Juniors", 'setup-division-court'), value='A'))
    g.do("custom 2: Single Elimination", lambda a: a.page.select_option(in_row("O'ahu Juniors", 'setup-division-format'), label='Single Elimination'))
    phone_views(g, 'custom divisions')
    leave(page)
    g.do('× on the first custom division', lambda a: click(a.page, f'{row("Open <A> & \"B\"")}//button'))
    g.do("custom 2 switched off (it leaves the table)", lambda a: click(a.page, in_row("O'ahu Juniors", 'setup-division-enabled')))
    g.do("custom 2 added again (its old format and court are not reused)", lambda a: (
        type_into(a.page, tid('custom-division-name'), "O'ahu Juniors"),
        click(a.page, tid('custom-division-add'))))
    leave(page)
    g.do('× on Kids (focused first)', lambda a: (a.page.locator(f'{row("Kids")}//button').focus(), click(a.page, f'{row("Kids")}//button')))
    g.do('Save Setup & Continue', lambda a: click(a.page, tid('setup-save-continue')))
    g.do('back to Setup', lambda a: click(a.page, tid('nav-setup')))
    g.finish()


# A live update: the cloud copy with other setup values and divisions (built from this page's own
# payload), as applyRemoteCloudRecord() receives it.
REMOTE_JS = """() => {
  const p = tournamentPayload();
  p.setup = {...p.setup, tName: 'Remote <Cup> & Co', tHost: 'Remote Host', tLocation: 'Remote Hall', teamFormat: '5-Person Team',
             teamCourt: 'A', teamAwardMode: 'dual3', court2RedSide: 'left', exhibitionEnabled: 'Enabled', court1Refs: 'Remote Ref'};
  p.state.divisions = ['Women’s Open', 'Remote Kids'];
  p.state.divisionTypes['Remote Kids'] = 'Single Elimination';
  p.state.divisionCourts['Remote Kids'] = 'split';
  p.state.divisionCourts['Team Tournament'] = 'A';
  p.state.teamAwardMode = 'dual3';
  return p;
}"""
DEFER_JS = f"""() => {{
  const payload = ({REMOTE_JS})();
  const record = {{tournamentId: cloudSession.tournamentId, revision: Number(cloudSession.revision || 0) + 5,
                  updatedAt: new Date().toISOString(), updatedBy: {{clientId: 'another-device', name: 'Director 2'}}, payload}};
  window.__ksmDeferred = applyRemoteCloudRecord(record);
}}"""
APPLY_JS = f"""() => {{
  const payload = ({REMOTE_JS})();
  ksmApplyingRemoteSnapshot = true;
  try {{ applyTournamentPayload(payload, false, {{source: 'live sync'}}); }} finally {{ ksmApplyingRemoteSnapshot = false; }}
}}"""


def setup_live(browser, react_check):
    g = open_app('setup-live', browser, react_check)
    page = g.app.page
    g.do('Setup', lambda a: None)
    g.do('name: typing', lambda a: type_into(a.page, '#tName', 'Half typ'))
    g.do('a live update arrives while typing (deferred)', lambda a: a.page.evaluate(DEFER_JS))
    assert page.evaluate('window.__ksmDeferred') is False, 'the live update was not deferred while typing'
    g.do('name: typing on', lambda a: a.page.keyboard.type('ed Name'))
    g.do("a live update's redraw (renderAll()) while typing in the name", lambda a: a.page.evaluate('() => renderAll()'))
    g.do('name: typing on after the redraw', lambda a: a.page.keyboard.type('!'))
    g.do("a live update's redraw with the focus in a division's format", lambda a: (
        a.page.locator(in_row(WOMEN, 'setup-division-format')).focus(), a.page.evaluate('() => renderAll()')))
    g.do("a live update's redraw with the focus on a division's Use box", lambda a: (
        a.page.locator(in_row(WOMEN, 'setup-division-enabled')).focus(), a.page.evaluate('() => renderAll()')))
    g.do('referees: typing', lambda a: type_into(a.page, '#court2Refs', 'Ref One\nRef T'))
    g.do("a live update's redraw while typing referees", lambda a: a.page.evaluate('() => renderAll()'))
    g.do('referees: typing on', lambda a: a.page.keyboard.type('wo'))
    g.do('a live update applied while the name has the focus (it replaces the typed name)', lambda a: (
        a.page.locator('#tName').focus(), a.page.evaluate(APPLY_JS)))
    leave(page)
    g.do('the test API configure(): divisions and a team event', lambda a: a.configure([
        {'name': 'Open & <Co>', 'format': 'Round Robin', 'court': 'split', 'entrants': people('P', 4)},
        {'name': YONENBU, 'format': 'Single Elimination', 'court': 'B', 'entrants': people('Y', 3)},
        team('Kachinuki', 'Round Robin', 3, 'B')]))
    g.do('Setup after configure()', lambda a: click(a.page, tid('nav-setup')))
    g.finish()


SCENARIOS = {
    'setup-defaults': setup_defaults,
    'setup-details': setup_details,
    'setup-divisions': setup_divisions,
    'setup-live': setup_live,
}
REACT_CHECK = None


def main():
    started = time.time()
    chosen = [n for n in SCENARIOS if not ONLY or any(q in n for q in ONLY)]
    assert chosen, f'no scenario matches {ONLY}'
    missing_geometry = [n for n in chosen if not UPDATE and not geometry_recorded(GOLDEN_DIR, n)]
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for name in chosen:
            SCENARIOS[name](browser, REACT_CHECK)
            print(f'  {name}: ok')
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} Setup = approved snapshots ({", ".join(chosen)}){note} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
