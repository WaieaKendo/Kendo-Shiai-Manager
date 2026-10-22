"""Golden (snapshot) test of the Pools view (Registration -> Pools, #poolsReg; roadmap M.13).

The Pools view shows a division select (#poolDiv), Regenerate, and #poolOutput: the division's
pools (a card per pool with each player's slot badge, name and dojo; "Team Pool" for a team
division), Edit Pool (not for a team round robin), and next to them the Championship Preview
(or a team round robin's Team Standings); without pools one of three messages. Edit Pool
replaces #poolOutput with the pool editor: Save Pool Changes, Cancel, the instructions, a card
per pool whose players can be dragged onto another pool (appended) or onto a drop zone between
names (inserted there), and the Championship Preview. The approved snapshots in
tests/golden/pools/*.json were recorded from the LEGACY renderer (renderPools() in
app/js/08-engine-generation.js, toggleEditPools() and the drag-and-drop handlers
dragPoolPlayer()/dropPoolPlayer()/insertPoolPlayer() in 16-court-context-and-pool-editing.js,
bracketHtml() in 28-aligned-results-and-brackets.js, the select's options from renderDivisions()
in 02-court-match-order.js), so they pin exactly what the legacy view drew and did (quirks
included, see docs/ROADMAP.md "Pools quirks kept").

One offline copy of the app runs each scenario; after every step the whole #poolsReg view is
serialized (golden_screen.PANEL_JS: elements, attributes, text, visibility, innerText, each
element's page box per platform) and compared with the approved snapshot, together with the
select's value, state.poolViewDivision, every division's pools (players with their slots) and
match counts (pool, championship, done), the courts' positions, state.managementRevision, the
saves the step asked for (scheduleAutoSave(), criticalAutoSave(), saveAuto(), counted by
wrappers the test installs), whether the validation dialog is open (or, in its place,
Regenerate Single Division's contents while it is open: the Pools tab's Regenerate, owner
decision 3), whether the
view is shown, the page's scroll width against the window's, the page errors since the step
before and the dialogs shown. While the view is hidden its innerText is its textContent, so the
text is compared only while it is shown (the tree always).

Buttons get a dispatched click (the mouse does not move, so no hover state moves a box) and
transitions are off. Drag and drop is done two ways: with dispatched drag events sharing one
DataTransfer (dragstart on a player, dragover/dragleave/drop on a pool, a drop zone or a
heading, dragend; a step can show the page mid-drag, e.g. the pool's drop-target class), and
with Playwright's real mouse drag (locator.drag_to) in Chromium.

  pools-empty         Registration -> Pools before anything is generated (the default
                      division), Regenerate with nothing generated (Regenerate Single
                      Division, no division ready: x), phones;
  pools-divisions     eight individual divisions: round robins of 3, 4, 5, 10, 14 (seeded,
                      dojo-mates spread, names and dojos with <, &, quotes), 8 and 20 split, a
                      single elimination of 6; every division chosen with the select; phones;
                      Regenerate (Regenerate Single Division with the select's division
                      chosen) closed, and for Masters continued and confirmed;
  pools-team-rr       a 3-person team round robin (Team Pool, Team Standings, no Edit Pool)
                      next to an individual round robin;
  pools-team-se       a 3-person team single elimination and an individual one (the two
                      bracket messages);
  pools-edit          a drop on the view's pools (opens the editor) and on a heading; Edit
                      Pool on a round robin of 14 and of 3: dragging a player onto
                      another pool, onto drop zones (first, middle, last, same pool down and
                      up), onto a heading and a player (nothing), a real mouse drag; the
                      drop-target class mid-drag; Cancel (the moves are undone: F12); the
                      select, a live update (renderAll()) and Edit Pool again during editing
                      (both cancel the edit); emptying a pool; Save Pool Changes; phones while
                      editing;
  pools-started       a split round robin of 8 with matches played before Edit Pool and Save
                      (F12: a warning first; Cancel keeps the results and the editor, OK
                      rebuilds them away), and played through;
  play-*              whole divisions played through on Courts A and B (the court's next ready
                      match chosen as the golden engine test does, points and Next Match called
                      as the court buttons do; renderPools() redraws the hidden view) with the
                      Pools view opened after every match: RR 14 (pools + quarterfinals), SE 6
                      split, team RR 3, kachinuki RR 3.

Since M.13 #poolOutput is drawn only by React (app/react/features/pools/: one island, the contents of
#poolOutput; app/js/41-react-pools.js publishes its data); the legacy renderer is removed, so
this test pins the React-only view. The division select, Regenerate and #poolOutput's class stay
legacy. React must render every element of the island (and #poolOutput must be its root) and
every kind of Pools content must be covered. Last, the app without the React module script must
show the "Pools could not load" notice instead of the empty #poolOutput (and a working page never
shows it).

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-pools-test.py [scenario ...]
"""
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import (
    ALL_COMPLETE_JS, ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, PREPARE_JS, UPDATE,
    Golden, geometry_recorded, match_points, people, team,
)
from ksm_app import KsmApp
from ksm_browser import DIST, launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'pools'
ROOT = '#poolsReg'
DESKTOP = {'width': 1280, 'height': 720}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390})]
# What a court's buttons call (app/js/10-court-scoring-and-history.js).
POINT_JS = "([side, letter]) => KSMTest.app.point(side, letter)"
NEXT_JS = "() => KSMTest.app.nextMatch()"
# Registration -> Pools as the nav item and the tab do.
SHOW_POOLS_JS = "() => { KSMTest.show('registration'); KSMTest.app.regTab('pools'); }"
VIEW_JS = f"() => !document.querySelector('{ROOT}').classList.contains('hidden') && !document.getElementById('registration').classList.contains('hidden')"
NO_TRANSITIONS = '*, *::before, *::after { transition: none !important; animation: none !important; }'
SCROLL_JS = '() => [document.documentElement.scrollWidth, innerWidth]'
# The saves a step asks for: the app's save functions wrapped after load (global functions,
# looked up at call time).
SAVES_INIT_JS = """() => {
  window.__ksmSaves = [];
  ['scheduleAutoSave', 'criticalAutoSave', 'saveAuto'].forEach(f => {
    const orig = window[f];
    if (typeof orig !== 'function') return;
    window[f] = function (...args) { window.__ksmSaves.push(f); return orig.apply(this, args); };
  });
}"""
SAVES_JS = '() => { const s = window.__ksmSaves; window.__ksmSaves = []; return s; }'
# Every division's pools and matches, the courts and the revision.
STATE_JS = """() => {
  const divs = [...new Set([...(KSMTest.app.state.divisions || []), ...Object.keys(KSMTest.app.state.pools || {}), ...Object.keys(KSMTest.app.state.allMatches || {})])];
  return {
    select: document.getElementById('poolDiv').value,
    poolViewDivision: KSMTest.app.state.poolViewDivision || null,
    divisions: Object.fromEntries(divs.map(d => {
      const ms = KSMTest.app.state.allMatches?.[d] || [];
      return [d, {
        pools: (KSMTest.app.state.pools?.[d] || []).map(p => [p.label, (p.players || []).map(x => `${x.poolSlot || ''}:${x.name}`)]),
        matches: [ms.filter(m => !m.championship).length, ms.filter(m => m.championship).length, ms.filter(m => m.done).length],
      }];
    })),
    courts: ['A', 'B'].map(c => { const s = KSMTest.app.state.courtState?.[c]; return s ? `${s.division}#${s.index}` : null; }),
    revision: KSMTest.app.state.managementRevision || 0,
  };
}"""
VALIDATION_JS = "() => !document.getElementById('validationModal').classList.contains('hidden')"
# Regenerate Single Division while open (the Pools tab's Regenerate opens it since owner decision 3):
# its title and each option's name, status and whether it is chosen; null when closed.
REGENERATE_JS = """() => {
  const modal = document.getElementById('regenerateModal');
  if (!modal || modal.classList.contains('hidden')) return null;
  return {title: modal.querySelector('[data-testid="regenerate-modal-title"]')?.textContent.trim(),
    options: [...modal.querySelectorAll('[data-testid="regenerate-option"]')].map(o => [
      o.querySelector('[data-testid="regenerate-option-name"]').textContent.trim(),
      o.querySelector('[data-testid="regenerate-option-status"]').textContent.trim(),
      o.querySelector('[data-testid="regenerate-option-radio"]').checked])};
}"""

# Drag and drop with dispatched events sharing one DataTransfer (window.__ksmDrag).
# [selector, index]: the element of document.querySelectorAll(selector) at index.
DRAG_START_JS = """([selector, index]) => {
  const el = document.querySelectorAll(selector)[index];
  if (!el) throw new Error(`no ${selector} #${index}`);
  window.__ksmDrag = {dt: new DataTransfer(), source: el};
  el.dispatchEvent(new DragEvent('dragstart', {bubbles: true, cancelable: true, dataTransfer: window.__ksmDrag.dt}));
}"""
DRAG_EVENT_JS = """([type, selector, index]) => {
  const el = document.querySelectorAll(selector)[index];
  if (!el) throw new Error(`no ${selector} #${index}`);
  el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: window.__ksmDrag.dt}));
}"""
DRAG_END_JS = """() => {
  const {source, dt} = window.__ksmDrag;
  source.dispatchEvent(new DragEvent('dragend', {bubbles: true, cancelable: true, dataTransfer: dt}));
  window.__ksmDrag = null;
}"""

# The Pools island (app/react/features/pools/main.tsx): React renders every element of #poolOutput, which
# is the island's root.
ISLAND = '#poolsReg #poolOutput'
ROOT_JS = f"() => Object.keys(document.querySelector('{ISLAND}')).some(k => k.startsWith('__reactContainer'))"
# Which kinds of Pools content the island was given.
VARIANTS_JS = """() => {
  const d = window.ksmPoolsInput, out = [];
  if (!d || d.kind === 'empty') return ['nothing published'];
  out.push(d.kind);
  if (d.kind === 'pools') {
    out.push(d.message === null ? 'pools' : 'message: ' + d.message);
    out.push(d.edit ? 'Edit Pool' : 'no Edit Pool');
    out.push(d.rightTitle);
    if (d.pools.some(p => p.title.startsWith('Team Pool'))) out.push('team pools');
  }
  if (d.pools.some(p => !p.players.length)) out.push('empty pool');
  if (d.pools.some(p => p.players.some(x => !x.dojo))) out.push('player without a dojo');
  out.push('bracket: ' + d.bracket.kind);
  return out.map(v => `${d.kind}: ${v}`);
}"""
VARIANTS_SEEN = set()
ELEMENTS_SEEN = [0]  # most React-rendered elements seen in the island


def check_react(golden, step):
    """React renders every element of the Pools island."""
    page = golden.app.page
    total, owned = page.evaluate(PANEL_FIBERS_JS, ISLAND)
    assert total and total == owned, f'{golden.name}: {step}: {total - owned} of {total} elements in {ISLAND} are not rendered by React'
    ELEMENTS_SEEN[0] = max(ELEMENTS_SEEN[0], owned)
    assert page.evaluate(ROOT_JS), f'{golden.name}: {step}: {ISLAND} is not a React root'
    VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))


POOL = '#poolOutput .pool'
PLAYER = '#poolOutput .drag-player'
DROP_ZONE = '#poolOutput .drop-zone'


def capture(app):
    """The Pools view: (serialization, element boxes)."""
    page = app.page
    panel = page.evaluate(PANEL_JS, ROOT)
    errors, app.page_errors[:] = list(app.page_errors), []
    shown = page.evaluate(VIEW_JS)
    entry = {
        'shown': shown,
        'state': page.evaluate(STATE_JS),
        'saves': page.evaluate(SAVES_JS),
        'validation': page.evaluate(VALIDATION_JS),
        'scroll': page.evaluate(SCROLL_JS),
        'pageErrors': errors,
        # innerText of a hidden view is its textContent (the templates' source formatting).
        'pools': {'tree': panel['tree'], 'text': panel['text'] if shown else None},
    }
    regenerate = page.evaluate(REGENERATE_JS)
    if regenerate is not None:  # in place of `false`, so the other steps' snapshots are unchanged
        entry['validation'] = entry['validation'] or {'regenerate': regenerate}
    return entry, {'pools': panel['boxes']}


def open_app(name, browser, errors, entries=None, react_check=None):
    app = KsmApp(browser.new_page(viewport=DESKTOP), name)
    # Page errors are part of each step's snapshot (capture()), not failures.
    app.page_errors = []
    load_app(app.page)
    app.page.add_style_tag(content=NO_TRANSITIONS)
    app.page.evaluate(SAVES_INIT_JS)
    golden = Golden(name, app, app.page_errors, GOLDEN_DIR, capture, react_check)
    assert app.page.evaluate('window.ksmPoolsMounted === true'), f'{name}: the Pools island did not mount'
    assert app.page.locator('#poolsModuleMissing').count() == 0, f'{name}: "Pools could not load" shown on a working page'
    if entries:
        app.configure(entries)
    return golden


def click(page, selector, index=0):
    """A click without moving the mouse (no hover state)."""
    page.locator(selector).nth(index).dispatch_event('click')


def open_pools(a):
    click(a.page, '[data-testid="nav-registration"]')
    click(a.page, '[data-testid="reg-tab-pools"]')


def choose(a, division):
    a.page.select_option('[data-testid="pool-division-select"]', label=division)


def phone_views(g, label):
    for step, size in PHONES:
        g.do(f'{label}: {step}', lambda a, s=size: a.page.set_viewport_size(s))
    g.app.page.set_viewport_size(DESKTOP)


def drag(g, label, source, target, over=True, leave=False):
    """A dispatched drag of a player (PLAYER index `source`) onto `target` ((selector, index)),
    with a step mid-drag (dragover) when `over`, and the drag leaving and coming back when `leave`."""
    page = g.app.page
    page.evaluate(DRAG_START_JS, [PLAYER, source])
    if over:
        g.do(f'{label}: dragging over', lambda a: a.page.evaluate(DRAG_EVENT_JS, ['dragover', *target]))
        if leave:
            g.do(f'{label}: dragleave', lambda a: a.page.evaluate(DRAG_EVENT_JS, ['dragleave', *target]))
            g.do(f'{label}: dragging over again', lambda a: a.page.evaluate(DRAG_EVENT_JS, ['dragover', *target]))
    else:
        page.evaluate(DRAG_EVENT_JS, ['dragover', *target])
    page.evaluate(DRAG_EVENT_JS, ['drop', *target])
    g.do(f'{label}: dropped', lambda a: a.page.evaluate(DRAG_END_JS))


def real_drag(a, source, selector, index):
    """Playwright's mouse drag of a player (PLAYER index `source`) onto the element of `selector`
    at `index`: a pool at its bottom padding (the drop handler needs the pool itself as the
    target), a drop zone at its middle."""
    target = a.page.locator(selector).nth(index)
    # Native scrollIntoView-if-needed ignores the fixed header. Center the target
    # before starting so a top drop zone cannot be covered by the header.
    target.evaluate("el => el.scrollIntoView({block:'center'})")
    box = target.bounding_box()
    position = {'x': box['width'] / 2, 'y': box['height'] - 3 if selector == POOL else box['height'] / 2}
    # In steps, as a hand moves: Chromium needs movement to start a native drag.
    a.page.locator(PLAYER).nth(source).drag_to(target, target_position=position, steps=10)
    # Off the view again: a button that comes under the resting mouse after a redraw would get
    # its :hover lift (depending on when Chromium updates the hover state).
    a.page.mouse.move(0, 0)


def play_match(g, court, m, played, label=''):
    """One match on the court screen (points, Next Match), then the Pools view opened."""
    page = g.app.page
    for side, letter in match_points(m, g.draws):
        page.evaluate(POINT_JS, [side, letter])
    # nextMatch() runs renderPools() (the hidden view is redrawn).
    g.do(f"{label}Court {court} match {played + 1} ({m['white']} v {m['red']}): next match (Pools hidden)",
         lambda a: a.page.evaluate(NEXT_JS))
    g.do(f'{label}Court {court} match {played + 1}: Pools', lambda a: a.page.evaluate(SHOW_POOLS_JS))


def play_all(g, name, limit=None, label=''):
    """Divisions to the end on Courts A and B (or `limit` matches), the Pools view opened after every match."""
    page = g.app.page
    played = 0
    for _ in range(300):
        progressed = False
        for court in ('A', 'B'):
            if limit is not None and played >= limit:
                return played
            m = page.evaluate(PREPARE_JS, court)  # opens the court screen
            if not m:
                continue
            progressed = True
            play_match(g, court, m, played, label)
            played += 1
        if not progressed:
            break
    assert page.evaluate(ALL_COMPLETE_JS), f'{name}: not every division is complete after {played} matches'
    return played


def entrant(name, dojo, seed=''):
    return {'name': name, 'dojo': dojo, 'seed': seed, 'status': 'Checked'}


# A round robin of 14: four seeds, dojo-mates (Aiea and Waipahu count as one dojo), names and
# dojos with <, &, quotes.
OPEN_14 = [
    entrant('Seed One', 'Aiea', '1'), entrant('Seed Two', 'Hilo', '2'), entrant('Seed Three', 'Waipahu', '3'),
    entrant('Seed Four', 'Kona', '4'), entrant('Ann & <Bo>', 'Aiea'), entrant('Cy "Quote"', "O'ahu Dojo"),
    entrant('Dee', 'Aiea'), entrant('Eli', 'Waipahu'), entrant('Fay', 'Hilo'), entrant('Gus', 'Hilo'),
    entrant('Hal', 'Kona'), entrant('Ivy', 'Aiea'), entrant('Jo', ''), entrant('Kai', 'Maui & Co'),
]


def individual(name, fmt, court, entrants):
    return {'name': name, 'format': fmt, 'court': court, 'entrants': entrants}


# ---------------------------------------------------------------------------------- scenarios
def pools_empty(browser, errors, react_check):
    g = open_app('pools-empty', browser, errors, react_check=react_check)
    g.do('Registration -> Pools, nothing generated', open_pools)
    phone_views(g, 'nothing generated')
    # Owner decision 3 (#29): Regenerate opens Regenerate Single Division for the select's division
    # (before: the generation check for the whole tournament); nothing generated, nothing ready.
    g.do('Regenerate with nothing generated (Regenerate Single Division, none ready)', lambda a: click(a.page, '[data-testid="pools-regenerate"]'))
    g.do('Regenerate: x', lambda a: click(a.page, '[data-testid="regenerate-modal-close"]'))
    g.finish()


DIVISIONS = [
    individual('Open', 'Round Robin', 'A', OPEN_14),
    individual('Kids', 'Round Robin', 'A', people('K', 3)),
    individual('Women', 'Round Robin', 'B', people('W', 4)),
    individual('Juniors', 'Round Robin', 'B', people('J', 5)),
    individual('Seniors', 'Round Robin', 'split', people('S', 8)),
    individual('Masters', 'Round Robin', 'A', people('M', 10)),
    individual('Big', 'Round Robin', 'split', people('B', 20)),
    individual('Novice', 'Single Elimination', 'A', people('N', 6)),
]


def pools_divisions(browser, errors, react_check):
    g = open_app('pools-divisions', browser, errors, DIVISIONS, react_check)
    g.do('generated (Pools shown by Generate)', lambda a: None)
    for d in DIVISIONS:
        g.do(f'select {d["name"]}', lambda a, n=d['name']: choose(a, n))
        if d['name'] in ('Open', 'Big', 'Novice'):
            phone_views(g, d['name'])
    g.do('select Open again', lambda a: choose(a, 'Open'))
    g.do('Overview, then Pools again', lambda a: (a.page.evaluate("() => KSMTest.show('director')"), open_pools(a)))
    # Owner decision 3 (#29): Regenerate Single Division with the select's division chosen.
    g.do('Regenerate (Open chosen)', lambda a: click(a.page, '[data-testid="pools-regenerate"]'))
    g.do('Regenerate: x', lambda a: click(a.page, '[data-testid="regenerate-modal-close"]'))
    choose(g.app, 'Masters')
    g.do('Masters: Regenerate (Masters chosen)', lambda a: click(a.page, '[data-testid="pools-regenerate"]'))
    g.do('Masters: Regenerate: Continue', lambda a: click(a.page, '[data-testid="regenerate-continue"]'))
    g.do('Masters: Regenerate: Regenerate', lambda a: click(a.page, '[data-testid="regenerate-confirm"]'))
    g.do('Masters: Regenerate: OK', lambda a: click(a.page, '[data-testid="regenerate-modal-close"]'))
    g.finish()


def pools_team_rr(browser, errors, react_check):
    g = open_app('pools-team-rr', browser, errors, [individual('Open', 'Round Robin', 'A', people('P', 4)), team('3-Person Team', 'Round Robin', 3, 'A')], react_check)
    g.do('generated', lambda a: None)
    g.do('select Team Tournament', lambda a: choose(a, 'Team Tournament'))
    phone_views(g, 'team round robin')
    g.do('select Open', lambda a: choose(a, 'Open'))
    g.finish()


def pools_team_se(browser, errors, react_check):
    g = open_app('pools-team-se', browser, errors, [individual('Kids', 'Single Elimination', 'split', people('K', 5)), team('3-Person Team', 'Single Elimination', 4, 'Both')], react_check)
    g.do('generated', lambda a: None)
    g.do('select Team Tournament', lambda a: choose(a, 'Team Tournament'))
    g.do('select Kids', lambda a: choose(a, 'Kids'))
    g.finish()


def pools_edit(browser, errors, react_check):
    g = open_app('pools-edit', browser, errors, [individual('Open', 'Round Robin', 'A', OPEN_14), individual('Kids', 'Round Robin', 'B', people('K', 3))], react_check)
    page = g.app.page
    g.do('generated', lambda a: None)
    g.do('select Open', lambda a: choose(a, 'Open'))
    # The pools of the view take drops too: a drop moves the player and opens the editor.
    drag(g, 'view: pool A\'s second player onto pool B (opens the editor)', 1, (POOL, 1))
    g.do('view: Cancel', lambda a: click(a.page, f'{ROOT} #poolOutput .toolbar button', 1))
    drag(g, 'view: onto pool A\'s heading (nothing)', 0, (f'{POOL} h3', 0), over=False)
    g.do('Edit Pool', lambda a: click(a.page, '[data-testid="pool-edit"]'))
    phone_views(g, 'editing')
    # Pool A: players 0-3, B: 4-7, C: 8-10, D: 11-13 (four seeds, then 4, 4, 3, 3).
    drag(g, 'A1 onto pool B', 0, (POOL, 1), leave=True)
    drag(g, 'pool B\'s last (Seed One) back onto pool A\'s first drop zone', 7, (DROP_ZONE, 0))
    drag(g, 'last of pool D into the middle of pool B', 13, (DROP_ZONE, 7))
    drag(g, 'pool A: first player to the end (same pool)', 0, (DROP_ZONE, 3), over=False)
    drag(g, 'pool A: third player up to the top', 2, (DROP_ZONE, 0), over=False)
    drag(g, 'onto pool C\'s heading (nothing)', 1, (f'{POOL} h3', 2))
    drag(g, 'onto a player of pool D (nothing)', 1, (PLAYER, 12), over=False)
    # Source and target near each other: Chromium does not start a drag whose target has to be
    # scrolled into view first.
    g.do('real mouse drag: pool D\'s first player onto pool C', lambda a: real_drag(a, 12, POOL, 2))
    g.do('real mouse drag: pool C\'s last player onto pool C\'s first drop zone', lambda a: real_drag(a, 12, DROP_ZONE, 11))
    g.do('Cancel (the moves are undone)', lambda a: click(a.page, f'{ROOT} #poolOutput .toolbar button', 1))
    g.do('Edit Pool again', lambda a: click(a.page, '[data-testid="pool-edit"]'))
    drag(g, 'pool C\'s third player onto pool A', 11, (POOL, 0), over=False)
    g.do('a live update while editing (renderAll())', lambda a: a.page.evaluate('() => KSMTest.app.renderAll()'))
    g.do('Edit Pool again (2)', lambda a: click(a.page, '[data-testid="pool-edit"]'))
    g.do('select Kids while editing', lambda a: choose(a, 'Kids'))
    g.do('Kids: Edit Pool', lambda a: click(a.page, '[data-testid="pool-edit"]'))
    drag(g, 'Kids: last player to the top', 2, (DROP_ZONE, 0), over=False)
    g.do('Kids: Save Pool Changes', lambda a: click(a.page, '[data-testid="pool-edit-save"]'))
    g.do('select Open', lambda a: choose(a, 'Open'))
    g.do('Open: Edit Pool', lambda a: click(a.page, '[data-testid="pool-edit"]'))
    # Empty pool D: its players go onto pool C one by one (always the first of pool D).
    for i in range(10):
        count = page.evaluate(f"() => document.querySelectorAll('{POOL}')[3].querySelectorAll('.drag-player').length")
        if not count:
            break
        first = page.evaluate(f"() => [...document.querySelectorAll('{PLAYER}')].indexOf(document.querySelectorAll('{POOL}')[3].querySelector('.drag-player'))")
        drag(g, f'pool D player onto pool C ({i + 1})', first, (POOL, 2), over=False)
    g.do('Open: Save Pool Changes (pool D empty)', lambda a: click(a.page, '[data-testid="pool-edit-save"]'))
    phone_views(g, 'saved')
    g.do('Open: Edit Pool (after the save)', lambda a: click(a.page, '[data-testid="pool-edit"]'))
    g.do('Open: Cancel', lambda a: click(a.page, f'{ROOT} #poolOutput .toolbar button', 1))
    g.finish()


def pools_started(browser, errors, react_check):
    g = open_app('pools-started', browser, errors, [individual('Seniors', 'Round Robin', 'split', people('S', 8))], react_check)
    g.draws = False
    g.do('generated', lambda a: None)
    play_all(g, 'pools-started', limit=4)
    g.do('Edit Pool after matches started', lambda a: click(a.page, '[data-testid="pool-edit"]'))
    drag(g, 'A1 onto pool B', 0, (POOL, 1), over=False)
    # F12: the app asks before deleting the played results; Cancel keeps them and the editor.
    g.answer = lambda d: d.dismiss() if d.type == 'confirm' else d.accept()
    g.do('Save Pool Changes after matches started: the warning, Cancel', lambda a: click(a.page, '[data-testid="pool-edit-save"]'))
    g.answer = None
    g.do('Save Pool Changes after matches started: the warning, OK', lambda a: click(a.page, '[data-testid="pool-edit-save"]'))
    play_all(g, 'pools-started', label='after the edit: ')
    g.do('complete', lambda a: a.page.evaluate(SHOW_POOLS_JS))
    g.do('complete: Edit Pool', lambda a: click(a.page, '[data-testid="pool-edit"]'))
    g.finish()


def play_through(browser, errors, react_check, name, entries, draws=False):
    """Play every division to the end with the Pools view opened after every match."""
    g = open_app(name, browser, errors, entries, react_check)
    g.draws = draws
    g.do('start', lambda a: a.page.evaluate(SHOW_POOLS_JS))
    play_all(g, name)
    g.do('complete', lambda a: a.page.evaluate(SHOW_POOLS_JS))
    phone_views(g, 'complete')
    g.finish()


PLAY_THROUGHS = [
    ('play-rr-14', [individual('Open', 'Round Robin', 'A', OPEN_14)], False),
    ('play-se-6-split', [individual('Kids', 'Single Elimination', 'split', people('E', 6))], False),
    ('play-team-rr-3', [team('3-Person Team', 'Round Robin', 3, 'A')], False),
    ('play-kachinuki-rr-3', [team('Kachinuki', 'Round Robin', 3, 'B')], False),
]
SCENARIOS = {
    'pools-empty': pools_empty,
    'pools-divisions': pools_divisions,
    'pools-team-rr': pools_team_rr,
    'pools-team-se': pools_team_se,
    'pools-edit': pools_edit,
    'pools-started': pools_started,
    **{name: (lambda browser, errors, react_check, n=name, e=entries, d=draws: play_through(browser, errors, react_check, n, e, d))
       for name, entries, draws in PLAY_THROUGHS},
}
def without_screens_module():
    """dist/index.html without the React screens' module script (as a device whose copy lacks it)."""
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    module = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert module, 'dist/index.html: no module script'
    return html.replace(module.group(0), '')


def pools_module_missing(browser, errors):
    """Without the React module nothing draws #poolOutput: the Pools view says so instead."""
    app = KsmApp(browser.new_page(viewport=DESKTOP), 'no React module')
    page = app.page
    page.on('pageerror', lambda e: errors.append(f'Pools module missing: {e}'))
    load_app(page, html=without_screens_module())
    app.configure([individual('Open', 'Round Robin', 'A', people('P', 4))])
    open_pools(app)
    notice = page.locator('#poolsReg [data-testid="pools-module-missing"]')
    assert notice.is_visible(), 'no "Pools could not load" notice without the React module'
    assert 'Pools could not load' in notice.inner_text(), notice.inner_text()
    assert not page.locator('#poolOutput').is_visible(), 'the empty #poolOutput is shown without the React module'
    assert page.locator('#poolOutput *').count() == 0, 'something drew #poolOutput without the React module'
    assert page.locator('[data-testid="pool-division-select"]').is_visible(), 'the division select is gone without the React module'
    assert page.evaluate('window.ksmPoolsInput.kind') == 'pools', 'renderPools() did not publish without the island'
    page.close()


# Checks without a snapshot file.
CHECKS = {'pools-module-missing': pools_module_missing}
REACT_CHECK = check_react


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
            SCENARIOS[name](browser, errors, REACT_CHECK)
            print(f'  {name}: ok')
        for name in checks:
            CHECKS[name](browser, errors)
            print(f'  {name}: ok')
        if not ONLY and not UPDATE:
            assert ELEMENTS_SEEN[0], 'React never rendered anything in the Pools view'
            expected = {
                'pools: pools', 'pools: message: No pools generated yet.',
                'pools: message: Single-elimination bracket created. Matches are available in the Court queue.',
                'pools: message: Single-elimination team bracket created. Team position matches are available in the Court queue.',
                'pools: Edit Pool', 'pools: no Edit Pool', 'pools: Championship Preview', 'pools: Team Standings', 'pools: team pools',
                'pools: bracket: cards', 'pools: bracket: message', 'pools: bracket: team-standings', 'pools: empty pool',
                'editor: editor', 'editor: empty pool', 'editor: bracket: cards',
            }
            assert expected <= VARIANTS_SEEN, f'Pools variants not covered: {sorted(expected - VARIANTS_SEEN)}; seen {sorted(VARIANTS_SEEN)}'
        assert not errors, '\n'.join(errors)
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} Pools = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
