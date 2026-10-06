"""Golden (snapshot) test of Registration part 2: Team Registration, Exhibition and the tab bar
(roadmap M.13).

Team Registration (#teamReg) has + Add Team, + 3 Teams, Load Sample Teams, + Auto Test Team,
Clear Teams (asks first, F8), the filter (#teamFilter) and the team cards (#teamTable: a card per
team with the team name, x, the team format line from Setup, a field per position of the Setup
team format and the status that cycles Registered -> Checked In -> No Show on a click). Exhibition
(#exhibitionReg) has + Add Exhibition Match, + 3 Matches, Clear Exhibitions (asks first, F8) and
the exhibition table (#exhibitionTable: a row per match with the white and red player, the status
and x). The tab bar (Individual Players, Team Registration, Exhibition, Pools, with Generate
Tournament and Regenerate Single Division) is in the toolbar card of #registration; regTab()
switches the tab and the card shown. The approved snapshots in
tests/golden/registration-teams/*.json were recorded from the LEGACY renderer (renderTeams() and
renderExhibitions() in app/js/03-registration-and-validation.js, regTab() in 23-navigation.js; the
toolbars are static markup of app/index.html), so they pin exactly what the legacy screen drew and
did (quirks included, see docs/ROADMAP.md "Registration quirks kept"). The players table is
golden-registration-test.py; Pools is golden-pools-test.py.

One offline copy of the app runs each scenario; after every step the toolbar card, #teamReg and
#exhibitionReg are serialized (golden_screen.PANEL_JS: elements, attributes, text, visibility,
innerText, each element's page box per platform) and compared with the approved snapshot,
together with every field's live value in both cards, which element has the focus (and whether it
is still in the page), the teams and exhibitions in state, the registration tab (state.regMode)
and which Registration card is shown, the Setup team and exhibition settings,
validateTournament(), the view shown, the live updates waiting, the saves the step asked for
(noteLocalMutation(): every scheduleAutoSave()/criticalAutoSave(), also from the document-wide
input/change/click listeners), the scroll width, the page errors since the step before and the
dialogs shown (their answers are part of the scenario).

Buttons and status chips get a dispatched click (the mouse does not move, so no hover state moves
a box), text is typed with the keyboard into the focused field and committed with Tab (the change
event, as a person leaves the field), selects are chosen with select_option(); transitions are
off.

  tabs-empty        Registration as a staff device opens it (nobody registered): every tab by
                    click and from the code (regTab(), openRegistrationTab(), an unknown tab),
                    phones on each card, a spectator (Registration is not offered);
  teams-cards       + Add Team, names typed with special characters per key and committed, the
                    members, every status, + 3 Teams, the Setup team format (3-Person, 5-Person,
                    Kachinuki) and tournament format, the filter, x (also filtered), + Auto Test
                    Team, Load Sample Teams, a typed name dropped by a redraw, Clear Teams
                    (Cancel, OK), phones;
  exhibitions       exhibitions switched on and off in Setup, + Add Exhibition Match, + 3 Matches,
                    players typed with special characters, every status, x, a typed name dropped
                    by a redraw, Clear Exhibitions (Cancel, OK), phones;
  teams-live        a live update arriving while a team name is being typed (deferred), the
                    redraw of a live update (renderAll()) while typing a member and an exhibition
                    player, an applied live update (applyTournamentPayload()) while a team member
                    and an exhibition player have the focus, the filter through a redraw, the test
                    API's configure() with a team division, team statuses after generation (a No
                    Show taken out of the bracket; the alert once the division has started).

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-registration-teams-test.py [scenario ...]
"""
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import ONLY, PANEL_JS, PLATFORM, SPECTATOR_JS, UPDATE, Golden, geometry_recorded, people, team
from ksm_app import KsmApp
from ksm_browser import launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'registration-teams'
TOOLBAR = '#registration > .card:first-child'
TEAMS = '#teamReg'
EXHIBITIONS = '#exhibitionReg'
DESKTOP = {'width': 1280, 'height': 900}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390})]
NO_TRANSITIONS = '*, *::before, *::after { transition: none !important; animation: none !important; }'
SCROLL_JS = '() => [document.documentElement.scrollWidth, innerWidth]'
VIEW_JS = "() => [...document.querySelectorAll('.view')].filter(v => !v.classList.contains('hidden')).map(v => v.id)"
SHOWN_JS = "() => document.querySelector('#registration').checkVisibility()"
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
FIELDS_JS = f"""() => {{
  const name = {NAME_JS};
  const fields = [...document.querySelectorAll('#teamReg input, #teamReg select, #exhibitionReg input, #exhibitionReg select')]
    .map(el => [name(el), el.value]);
  const a = document.activeElement;
  return {{fields, focus: name(a), connected: a ? a.isConnected : null}};
}}"""
STATE_JS = """() => ({
  teams: state.teams,
  exhibitions: state.exhibitions,
  regMode: state.regMode ?? null,
  cards: ['indReg', 'teamReg', 'exhibitionReg', 'poolsReg'].filter(id => !document.getElementById(id).classList.contains('hidden')),
  setup: ['teamEnabled', 'teamFormat', 'teamTournamentFormat', 'exhibitionEnabled'].map(id => document.getElementById(id).value),
  validation: validateTournament(),
  generated: !!state.generated,
  teamMatches: (state.allMatches?.['Team Tournament'] || []).length,
  deferred: [!!ksmDeferredRemoteRecord, !!ksmDeferredSyncRecord],
})"""


def capture(app):
    """Registration part 2: (serialization, element boxes)."""
    page = app.page
    toolbar = page.evaluate(PANEL_JS, TOOLBAR)
    teams = page.evaluate(PANEL_JS, TEAMS)
    exhibitions = page.evaluate(PANEL_JS, EXHIBITIONS)
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
        'teams': {'tree': teams['tree'], 'text': teams['text'] if shown else None},
        'exhibitions': {'tree': exhibitions['tree'], 'text': exhibitions['text'] if shown else None},
    }
    return entry, {'toolbar': toolbar['boxes'], 'teams': teams['boxes'], 'exhibitions': exhibitions['boxes']}


def open_app(name, browser, react_check=None):
    app = KsmApp(browser.new_page(viewport=DESKTOP), name)
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


def button(card, text):
    return f'{card} button:text-is("{text}")'


def team_field(testid, index):
    return f'{tid("team-card")} >> nth={index} >> {tid(testid)}'


def ex_field(testid, index):
    return f'{tid("exhibition-row")} >> nth={index} >> {tid(testid)}'


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


def setup_select(g, testid, label):
    g.do(f'Setup: {testid} {label}', lambda a: (click(a.page, tid('nav-setup')), a.page.select_option(tid(testid), label=label)))


SPECIAL = ' <B> & "C" O\'ahu 🏆'


# ---------------------------------------------------------------------------------- scenarios
def tabs_empty(browser, react_check):
    g = open_app('tabs-empty', browser, react_check)
    open_registration(g)
    for t in ['team', 'exhibition', 'pools', 'individual', 'exhibition', 'team']:
        g.do(f'tab: {t}', lambda a, t=t: click(a.page, tid(f'reg-tab-{t}')))
    g.do('the same tab again (team)', lambda a: click(a.page, tid('reg-tab-team')))
    phone_views(g, 'teams')
    g.do('Exhibition from the code (regTab)', lambda a: a.page.evaluate("() => regTab('exhibition')"))
    phone_views(g, 'exhibitions')
    g.do('an unknown tab from the code (regTab)', lambda a: a.page.evaluate("() => regTab('bogus')"))
    g.do('Pools from the code (regTab)', lambda a: a.page.evaluate("() => regTab('pools')"))
    g.do('Setup', lambda a: click(a.page, tid('nav-setup')))
    g.do('Team Registration from the code (openRegistrationTab)', lambda a: a.page.evaluate("() => openRegistrationTab('team')"))
    g.do('Registration from the menu (Individual Players)', lambda a: click(a.page, tid('nav-registration')))
    g.do('tab: team (keyboard Enter on the tab)', lambda a: (a.page.locator(tid('reg-tab-team')).focus(), a.page.keyboard.press('Enter')))
    leave(g.app.page)
    g.do('Setup', lambda a: click(a.page, tid('nav-setup')))
    g.do('spectator', lambda a: a.page.evaluate(SPECTATOR_JS))
    g.do('spectator: Registration from the code (Live Scores instead)', lambda a: a.page.evaluate("() => navigateTo('registration')"))
    g.do('spectator: openRegistrationTab() (nothing)', lambda a: a.page.evaluate("() => openRegistrationTab('team')"))
    g.do('spectator: regTab() from the code', lambda a: a.page.evaluate("() => regTab('exhibition')"))
    g.finish()


def teams_cards(browser, react_check):
    g = open_app('teams-cards', browser, react_check)
    page = g.app.page
    open_registration(g)
    g.do('tab: team', lambda a: click(a.page, tid('reg-tab-team')))
    g.do('+ Add Team', lambda a: click(a.page, tid('team-add')))
    g.do('team 1: name focused', lambda a: a.page.locator(team_field('team-name', 0)).focus())
    for part in ['Aiea', ' <B> & "C"', " O'ahu 🏆"]:
        g.do(f'team 1: name typed {part!r}', lambda a, p=part: a.page.keyboard.type(p))
    g.do('team 1: Tab (change)', lambda a: a.page.keyboard.press('Tab'))
    for k, who in [('senpo', 'Sen <po>'), ('chuken', 'Chu & ken'), ('taisho', 'Tai "sho"')]:
        g.do(f'team 1: {k} typed, Tab', lambda a, k=k, who=who: (type_into(a.page, team_field(f'team-member-{k}', 0), who), a.page.keyboard.press('Tab')))
    leave(page)
    for s in ['Checked In', 'No Show', 'Registered', 'Checked In']:
        g.do(f'team 1: status click ({s})', lambda a: click(a.page, team_field('team-status', 0)))
    g.do('+ 3 Teams', lambda a: click(a.page, button(TEAMS, '+ 3 Teams')))
    for i, n in enumerate(['Hilo Kendo', 'Maui & Co', 'Kona'], start=1):
        g.do(f'team {i + 1}: {n} typed, Tab', lambda a, i=i, n=n: (type_into(a.page, team_field('team-name', i), n), a.page.keyboard.press('Tab')))
    g.do('team 2: senpo typed, Tab', lambda a: (type_into(a.page, team_field('team-member-senpo', 1), 'Hana'), a.page.keyboard.press('Tab')))
    leave(page)
    setup_select(g, 'team-format', '5-Person Team')
    open_registration(g)
    g.do('tab: team (5-Person)', lambda a: click(a.page, tid('reg-tab-team')))
    g.do('team 1: jiho and fukusho typed', lambda a: (
        type_into(a.page, team_field('team-member-jiho', 0), 'Ji ho'), a.page.keyboard.press('Tab'),
        type_into(a.page, team_field('team-member-fukusho', 0), 'Fuku'), a.page.keyboard.press('Tab')))
    leave(page)
    setup_select(g, 'team-format', 'Kachinuki')
    g.do('Setup: team tournament format Round Robin', lambda a: a.page.select_option(tid('team-tournament-format'), label='Round Robin'))
    open_registration(g)
    g.do('tab: team (Kachinuki, Round Robin)', lambda a: click(a.page, tid('reg-tab-team')))
    g.do('Setup: team format 3-Person Team (Registration hidden)', lambda a: (
        click(a.page, tid('nav-setup')), a.page.select_option(tid('team-format'), label='3-Person Team'),
        a.page.select_option(tid('team-tournament-format'), label='Single Elimination')))
    open_registration(g)
    g.do('tab: team (3-Person, Single Elimination)', lambda a: click(a.page, tid('reg-tab-team')))
    for text in ['hilo', 'hana', '5-person', '3-person', 'zzz']:
        g.do(f'filter: {text!r}', lambda a, t=text: type_into(a.page, '#teamFilter', t))
    g.do('filter: typed on with the cards redrawn per key', lambda a: (type_into(a.page, '#teamFilter', 'k'), a.page.keyboard.type('o')))
    g.do("filter: 'o' (several)", lambda a: type_into(a.page, '#teamFilter', 'o'))
    g.do('filtered: × on the second shown card', lambda a: click(a.page, team_field('team-remove', 1)))
    g.do('filtered: + Add Team (the new card does not match)', lambda a: click(a.page, tid('team-add')))
    g.do('filter cleared', lambda a: type_into(a.page, '#teamFilter', ''))
    leave(page)
    g.do('+ Auto Test Team', lambda a: click(a.page, button(TEAMS, '+ Auto Test Team')))
    g.do('+ Auto Test Team again', lambda a: click(a.page, button(TEAMS, '+ Auto Test Team')))
    g.do('a name typed (no change event yet), then a status click without a blur (the redraw)', lambda a: (
        type_into(a.page, team_field('team-name', 1), 'Uncommitted'), click(a.page, team_field('team-status', 1))))
    leave(page)
    g.do('a member typed (no change event yet), then + Add Team (the redraw)', lambda a: (
        type_into(a.page, team_field('team-member-chuken', 0), 'Pending'), click(a.page, tid('team-add'))))
    leave(page)
    phone_views(g, 'cards')
    g.do('× on team 1', lambda a: click(a.page, team_field('team-remove', 0)))
    g.do('× on the last team (focused first)', lambda a: (a.page.locator(team_field('team-remove', 4)).focus(), click(a.page, team_field('team-remove', 4))))
    leave(page)
    g.do('Load Sample Teams', lambda a: click(a.page, button(TEAMS, 'Load Sample Teams')))
    g.do('sample team 4: status click (Checked -> No Show)', lambda a: click(a.page, team_field('team-status', 3)))
    g.answer = lambda d: d.dismiss() if d.type == 'confirm' else d.accept()
    g.do('Clear Teams: Cancel', lambda a: click(a.page, tid('team-clear')))
    g.answer = None
    g.do('Clear Teams: OK', lambda a: click(a.page, tid('team-clear')))
    g.do('+ Add Team after Clear', lambda a: click(a.page, tid('team-add')))
    g.do('Setup', lambda a: click(a.page, tid('nav-setup')))
    open_registration(g)
    g.finish()


def exhibitions(browser, react_check):
    g = open_app('exhibitions', browser, react_check)
    page = g.app.page
    setup_select(g, 'exhibition-enabled', 'Enabled')
    open_registration(g)
    g.do('tab: exhibition', lambda a: click(a.page, tid('reg-tab-exhibition')))
    g.do('+ Add Exhibition Match', lambda a: click(a.page, tid('exhibition-add')))
    g.do('match 1: white focused', lambda a: a.page.locator(ex_field('exhibition-white', 0)).focus())
    for part in ['Ann', SPECIAL]:
        g.do(f'match 1: white typed {part!r}', lambda a, p=part: a.page.keyboard.type(p))
    g.do('match 1: Tab to red (change)', lambda a: a.page.keyboard.press('Tab'))
    g.do('match 1: red typed', lambda a: a.page.keyboard.type('Bo & <Red> "Dojo"'))
    g.do('match 1: Tab (change)', lambda a: a.page.keyboard.press('Tab'))
    leave(page)
    for s in ['Checked In', 'No Show', 'Registered', 'Checked In']:
        g.do(f'match 1: status click ({s})', lambda a: click(a.page, ex_field('exhibition-status', 0)))
    g.do('+ 3 Matches', lambda a: click(a.page, tid('exhibition-add-3')))
    for i, (w, r) in enumerate([('Cy', 'Dee'), ('Eve', 'Fay'), ('Gus', 'Hal')], start=1):
        g.do(f'match {i + 1}: {w} vs {r}', lambda a, i=i, w=w, r=r: (
            type_into(a.page, ex_field('exhibition-white', i), w), a.page.keyboard.press('Tab'),
            a.page.keyboard.type(r), a.page.keyboard.press('Tab')))
    leave(page)
    g.do('match 3: status click (Checked In)', lambda a: click(a.page, ex_field('exhibition-status', 2)))
    g.do('a name typed (no change event yet), then a status click without a blur (the redraw)', lambda a: (
        type_into(a.page, ex_field('exhibition-red', 3), 'Uncommitted'), click(a.page, ex_field('exhibition-status', 3))))
    leave(page)
    g.do('× on match 2', lambda a: click(a.page, ex_field('exhibition-remove', 1)))
    g.do('a name typed (no change event yet), then × on another match (the redraw)', lambda a: (
        type_into(a.page, ex_field('exhibition-white', 0), 'Pending'), click(a.page, ex_field('exhibition-remove', 2))))
    leave(page)
    phone_views(g, 'matches')
    setup_select(g, 'exhibition-enabled', 'Disabled')
    open_registration(g)
    g.do('tab: exhibition (switched off in Setup)', lambda a: click(a.page, tid('reg-tab-exhibition')))
    g.do('+ Add Exhibition Match (switched off)', lambda a: click(a.page, tid('exhibition-add')))
    g.answer = lambda d: d.dismiss() if d.type == 'confirm' else d.accept()
    g.do('Clear Exhibitions: Cancel', lambda a: click(a.page, tid('exhibition-clear')))
    g.answer = None
    g.do('Clear Exhibitions: OK', lambda a: click(a.page, tid('exhibition-clear')))
    g.do('+ 3 Matches after Clear', lambda a: click(a.page, tid('exhibition-add-3')))
    g.do('× on the last match (focused first)', lambda a: (a.page.locator(ex_field('exhibition-remove', 2)).focus(), click(a.page, ex_field('exhibition-remove', 2))))
    leave(page)
    g.finish()


# A live update: the cloud copy with other teams and exhibitions (built from this page's own
# payload), as applyRemoteCloudRecord() receives it.
REMOTE_JS = """() => {
  const p = tournamentPayload();
  p.state.teams = [
    {team: 'Remote <One>', division: 'Team Tournament', type: '3-Person Team', senpo: 'R & 1', jiho: '', chuken: 'R2', fukusho: '', taisho: 'R3', status: 'Checked'},
    {team: 'Remote Two', division: 'Team Tournament', type: '5-Person Team', senpo: 'S1', jiho: 'S2', chuken: 'S3', fukusho: 'S4', taisho: 'S5', status: 'NoShow'}];
  p.state.exhibitions = [{white: 'Remote "W"', red: 'Remote R', division: 'Exhibition Matches', status: 'Checked'}];
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


def teams_live(browser, react_check):
    g = open_app('teams-live', browser, react_check)
    page = g.app.page
    setup_select(g, 'exhibition-enabled', 'Enabled')
    open_registration(g)
    g.do('tab: team', lambda a: click(a.page, tid('reg-tab-team')))
    g.do('Load Sample Teams', lambda a: click(a.page, button(TEAMS, 'Load Sample Teams')))
    g.do('team 2: name being typed', lambda a: type_into(a.page, team_field('team-name', 1), 'Waipahu Tea'))
    g.do('a live update arrives while typing (deferred)', lambda a: (a.page.evaluate(CONFIRMED_JS), a.page.evaluate(DEFER_JS)))
    assert page.evaluate('window.__ksmDeferred') is False, 'the live update was not deferred while typing'
    g.do('team 2: typing on', lambda a: a.page.keyboard.type('m B'))
    g.do('team 2: Tab (change)', lambda a: a.page.keyboard.press('Tab'))
    leave(page)
    g.do('editing ended: the update still waits (unsaved changes)', lambda a: a.page.wait_for_timeout(3600))
    g.do('Load Sample Teams again', lambda a: click(a.page, button(TEAMS, 'Load Sample Teams')))
    g.do('team 3: chuken being typed', lambda a: type_into(a.page, team_field('team-member-chuken', 2), 'Maed'))
    g.do("a live update's redraw (renderAll()) while typing", lambda a: a.page.evaluate('() => renderAll()'))
    g.do('typing on after the redraw', lambda a: a.page.keyboard.type('a!'))
    leave(page)
    g.do('a live update applied while a team member has the focus', lambda a: (
        type_into(a.page, team_field('team-member-taisho', 0), 'Half'), a.page.evaluate(APPLY_JS)))
    leave(page)
    g.do('the filter typed, then a redraw (the filter keeps its text and focus)', lambda a: (
        type_into(a.page, '#teamFilter', 'remote'), a.page.evaluate('() => renderAll()')))
    g.do('filter cleared', lambda a: type_into(a.page, '#teamFilter', ''))
    leave(page)
    g.do('tab: exhibition', lambda a: click(a.page, tid('reg-tab-exhibition')))
    g.do('+ 3 Matches', lambda a: click(a.page, tid('exhibition-add-3')))
    g.do('match 2: white being typed', lambda a: type_into(a.page, ex_field('exhibition-white', 1), 'Kai'))
    g.do("a live update's redraw (renderAll()) while typing a player", lambda a: a.page.evaluate('() => renderAll()'))
    g.do('typing on after the redraw (exhibition)', lambda a: a.page.keyboard.type('!'))
    leave(page)
    g.do('a live update applied while a player has the focus', lambda a: (
        type_into(a.page, ex_field('exhibition-red', 2), 'Late'), a.page.evaluate(APPLY_JS)))
    leave(page)
    g.do('the test API configure(): a team single elimination, generated', lambda a: a.configure([
        {'name': 'Women’s Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('W', 3)},
        team('3-Person Team', 'Single Elimination', 4, 'B')]))
    open_registration(g)
    g.do('tab: team (generated)', lambda a: click(a.page, tid('reg-tab-team')))
    g.do('generated: a team to No Show (taken out of the bracket)', lambda a: click(a.page, team_field('team-status', 0)))
    g.do('generated: on to Registered (not added again)', lambda a: click(a.page, team_field('team-status', 0)))
    g.do('a team match done (the division has started)', lambda a: a.page.evaluate(
        "() => { state.allMatches['Team Tournament'][0].done = true; renderTeams(); }"))
    g.do('started: a team to No Show (the alert, nothing changed)', lambda a: click(a.page, team_field('team-status', 1)))
    g.finish()


SCENARIOS = {
    'tabs-empty': tabs_empty,
    'teams-cards': teams_cards,
    'exhibitions': exhibitions,
    'teams-live': teams_live,
}
CHECKS = {}
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
    print(f'{verb} Registration teams, exhibitions and tabs = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
