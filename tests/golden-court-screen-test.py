"""Golden (snapshot) test of the court (scorekeeper) screen, drawn by the React islands
(app/react/court/, roadmap M.8).

It replaces court-scoreboard-parity-test.py, which compared the React islands with the legacy
court renderer side by side until that renderer was removed. The approved snapshots in
tests/golden/court/*.json were first recorded from the LEGACY renderer (M.8 step 5, before it
was deleted), with the parity test's serializer, so they pin exactly what the legacy court
screen drew.

One offline copy of the app runs each scenario (the parity test's scenarios, same actions in
the same order); after every step the court screen is serialized and compared with the
approved snapshot:
  * the match display (#score .scoreboard-match) and the header (#score .scoreboard-header:
    logo, tournament name, court title, division select and its options, division title,
    match line): elements, ids, classes, test IDs, src/alt, text and select values;
  * the score buttons (#score .score-controls-grid) and the action row
    (#score .bottom-action-row: Undo, Redo, Fusen-gachi, Next Match): every attribute
    (disabled, the inline SVG) and whether each element is visible;
  * the Fusen-gachi dialog's state;
  * the context panel (#courtContext), the queue panel (#queue) and the division-complete
    panel (.division-complete-panel in #score .scoreboard-card): every attribute, text,
    visibility and innerText, plus each element's page box (see "Geometry");
  * the scoreboard card's classes and children (the .division-complete class, where the
    division-complete panel sits) and the layout classes around the panels
    (setCourtSupportMode());
  * the court screen read-out (KsmApp.court_screen()) and the dialogs shown.
React must render the islands' elements (a React fiber on each, every element in the panels).

Scenarios (one file each):
  individual-rr-actions  points, hansoku (two give the opponent a point), undo, redo (Redo
                         enabled after Undo, disabled again by a new action), Fusen-gachi
                         (cancelled, then confirmed, undone, redone), Next Match, to the end of
                         the division (score buttons and action row hidden: finding F2, kept);
  team-playoff           a 3-person team match with three drawn bouts: the representative
                         playoff and its picker (placeholder, choosing, read-only once scored);
  two-courts-split       three divisions on Court A, Court B and one split across both: the
                         tournament name, switching division with the select (also to a
                         completed one and back), scoring in the split division on both courts,
                         finishing Court B's division;
  spectator              a spectator's court screen (as after Staff Logout): no visible controls;
  play-*                 whole divisions played through on Courts A and B, snapshot after every
                         click and on idle courts (each round Court A, then Court B, moves to
                         the next division with a ready match as the golden engine test does,
                         and plays it with the point buttons and Next Match; outcome from a
                         hash of the names, draws where allowed): individual RR split, RR of
                         draws (pool tiebreaks), SE on one court and split, 3-person team SE on
                         both courts, team RR, kachinuki SE, kachinuki RR, individual RR of 4
                         (pools only) on Court B, 5-person team SE on Court B; each to its
                         division-complete screen on both courts, then the spectator view.

Geometry: element boxes depend on the platform's fonts (system-ui), so they are stored per
platform (sys.platform) next to the platform-independent snapshot and compared only where
they were recorded; elsewhere the test says so and compares everything else.

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-court-screen-test.py [scenario ...]

An update keeps other platforms' geometry only when the rest of the snapshot is unchanged.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp
from ksm_browser import DIST, launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'court'
UPDATE = os.environ.get('KSM_UPDATE_GOLDEN') == '1' or '--update' in sys.argv
PLATFORM = sys.platform
ONLY = [a for a in sys.argv[1:] if not a.startswith('-')]
# M.8 step 5 only, until the legacy court renderer is deleted: record the approved snapshots
# from the legacy renderer (the app without the court module script).
LEGACY = os.environ.get('KSM_GOLDEN_COURT_LEGACY') == '1'
assert not LEGACY or UPDATE, 'KSM_GOLDEN_COURT_LEGACY=1 only records (with KSM_UPDATE_GOLDEN=1)'

SNAPSHOT_JS = """(root) => {
  const walk = n => {
    if (n.nodeType === 3) return n.textContent.trim() ? n.textContent : null;
    if (n.nodeType !== 1) return null;
    const attrs = ['id', 'class', 'data-testid', 'aria-hidden', 'src', 'alt'].map(a => n.getAttribute(a) || '');
    const value = n.tagName === 'SELECT' || n.tagName === 'OPTION' ? n.value : '';
    return [n.tagName, ...attrs, value, ...[...n.childNodes].map(walk).filter(x => x !== null)];
  };
  return walk(document.querySelector(root));
}"""
# Every attribute but inline handlers (legacy onclick= attributes; React attaches onClick
# without one), style as the browser parses it (legacy "transform:scaleX(-1)", React
# "transform: scaleX(-1);"), and checkVisibility() for the CSS rules that hide the controls.
FULL_SNAPSHOT_JS = """(root) => {
  const walk = n => {
    if (n.nodeType === 3) return n.textContent.trim() ? n.textContent : null;
    if (n.nodeType !== 1) return null;
    const attrs = [...n.attributes].filter(a => !a.name.startsWith('on'))
      .map(a => `${a.name}=${a.name === 'style' ? n.style.cssText : a.value}`).sort();
    return [n.tagName, attrs.join(' '), n.checkVisibility() ? 'visible' : 'hidden', ...[...n.childNodes].map(walk).filter(x => x !== null)];
  };
  return walk(document.querySelector(root));
}"""
# The panels: every attribute, visibility and innerText; each element's page box (rounded to
# 1/4 px, '' when hidden) in document order, kept apart as the platform-dependent part.
PANEL_JS = """(root) => {
  const el = document.querySelector(root);
  if (!el) return null;
  const boxes = [];
  const walk = n => {
    if (n.nodeType === 3) return n.textContent.trim() ? n.textContent : null;
    if (n.nodeType !== 1) return null;
    const attrs = [...n.attributes].filter(a => !a.name.startsWith('on')).map(a => `${a.name}=${a.value}`).sort();
    const r = n.getBoundingClientRect(), q = v => Math.round(v * 4) / 4;
    // In page coordinates, not the viewport's.
    const visible = n.checkVisibility();
    boxes.push(visible ? [q(r.x + scrollX), q(r.y + scrollY), q(r.width), q(r.height)].join(',') : '');
    return [n.tagName, attrs.join(' '), visible ? 'visible' : 'hidden', ...[...n.childNodes].map(walk).filter(x => x !== null)];
  };
  return {tree: walk(el), text: el.innerText, boxes};
}"""
TREES = {'scoreboard': '#score .scoreboard-match', 'header': '#score .scoreboard-header'}
FULL_TREES = {'score buttons': '#score .score-controls-grid', 'action row': '#score .bottom-action-row'}
PANELS = {'context': '#score #courtContext', 'queue': '#score #queue',
          'complete panel': '#score .scoreboard-card > .division-complete-panel'}
FUSEN_JS = "() => document.getElementById('fusenDialog').className"
# The scoreboard card: its classes (.division-complete) and its children in order.
CARD_JS = """() => {
  const card = document.querySelector('#score .scoreboard-card');
  return [card.className, ...[...card.children].map(c => `${c.tagName}.${c.className}`)];
}"""
# The layout classes setCourtSupportMode() (legacy) sets around the panels.
SUPPORT_JS = """() => ['.sk-support-grid', '.sk-queue-card'].map(s => document.querySelector('#score ' + s).className)"""
FIBER_JS = "s => Object.keys(document.querySelector(s)).some(k => k.startsWith('__reactFiber'))"
REACT_ELEMENTS = [
    '#scoreTournamentName', '#courtTitle', '#scoreDiv', '#scoreDivisionTitle', '#matchMeta', '#whiteName', '#redPts',
    '#score .white-control-panel', '#score [data-testid="point-white-M"]', '#score [data-testid="point-red-T"] .point-name',
    '#score [data-testid="hansoku-red"]', '#undoBtn', '#undoBtn path', '#redoBtn', '#redoBtn .action-label',
    '#score [data-testid="fusen-gachi"]', '#score [data-testid="next-match"]',
]
# Elements under a panel: [how many, how many with a React fiber].
PANEL_FIBERS_JS = """(root) => {
  const els = [...document.querySelectorAll(root + ' *')];
  return [els.length, els.filter(e => Object.keys(e).some(k => k.startsWith('__reactFiber'))).length];
}"""
# The panels React renders (every element in them has a React fiber).
REACT_PANELS = ['context', 'queue', 'complete panel']
PANELS_SEEN = {name: 0 for name in REACT_PANELS}  # most React-rendered elements seen in each panel
# Which kinds of panel content the React islands were given.
VARIANTS_JS = """() => {
  const out = [], c = window.ksmCourtContextInput, q = window.ksmCourtQueueInput, d = window.ksmCourtCompleteInput;
  if (c) {
    out.push('context: ' + c.kind);
    if (c.bracket) out.push(`context: ${c.kind} with bracket ${c.bracket.kind}`);
    if (JSON.stringify(c).includes('"status":"TIEBREAK"')) out.push('context: pool tiebreak row');
    if ((c.inProgress || []).some(p => p.active)) out.push('context: active pool');
    if ((c.completed || []).length) out.push('context: completed pools');
  }
  if (q) {
    out.push('queue: ' + q.kind);
    (q.groups || []).forEach(g => g.rows.forEach(r => out.push('queue row: ' + (r.kind === 'aligned' ? 'aligned ' + r.status
      : [r.team ? 'team' : 'individual', r.placeholder ? 'placeholder' : 'match', r.tiebreak ? 'tiebreak' : ''].filter(Boolean).join(' ')))));
  }
  if (d && d.complete) out.push('complete: ' + (d.placements.length ? 'placements' : 'no placements'));
  return [...new Set(out)];
}"""
VARIANTS_SEEN = set()
HISTORY_JS = """() => Object.fromEntries(['undo', 'redo'].map(id => {
  const b = document.querySelector(`#score [data-testid="${id}"]`);
  return [id, {enabled: !b.disabled, visible: b.checkVisibility(), label: b.textContent.trim()}];
}))"""
# Dialogs shown depending on timing, not on the court screen: the offline test copy's debounced
# cloud save asks for a staff password (answered with nothing, so the save stops), once per save
# that happens to run. Every other dialog is part of the snapshot.
TIMING_DIALOGS = {'Create Staff password'}
SPECTATOR_JS = "() => { setSessionRole('spectator'); installRoleBanner('spectator'); }"


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i + 1}', 'seed': '', 'status': 'Checked'} for i in range(n)]


def team(fmt, tournament, n, court):
    return {'team': True, 'format': fmt, 'tournament': tournament, 'teams': n, 'court': court}


def fixture_path(name):
    return GOLDEN_DIR / f'{name}.json'


def write_fixture(path, data):
    """One step per line, so a change shows up as a diff of the steps it touches."""
    lines = ['{', f' "scenario": {json.dumps(data["scenario"])},', f' "dialogs": {json.dumps(data["dialogs"], ensure_ascii=False)},', ' "steps": [']
    lines += [f'  {json.dumps(s, ensure_ascii=False, separators=(",", ":"))}' + (',' if i < len(data['steps']) - 1 else '') for i, s in enumerate(data['steps'])]
    lines += [' ],', ' "geometry": {']
    platforms = sorted(data['geometry'])
    for p, platform in enumerate(platforms):
        rows = data['geometry'][platform]
        lines.append(f'  {json.dumps(platform)}: [')
        lines += [f'   {json.dumps(g, separators=(",", ":"))}' + (',' if i < len(rows) - 1 else '') for i, g in enumerate(rows)]
        lines.append('  ]' + (',' if p < len(platforms) - 1 else ''))
    lines += [' }', '}']
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


# Each step is stored as its difference from the step before, so the files stay small and a
# change shows up in the steps it touches: {"=":1} is "same as before", {"~":[...]} a list and
# {"~~":{...}} an object of which only some parts changed (compared item by item).
SAME = {'=': 1}


def delta(new, old):
    if new == old:
        return SAME
    if isinstance(new, list) and isinstance(old, list):
        return {'~': [delta(v, old[i]) if i < len(old) else v for i, v in enumerate(new)]}
    if isinstance(new, dict) and isinstance(old, dict):
        return {'~~': {k: delta(v, old[k]) if k in old else v for k, v in new.items()}}
    return new


def undelta(d, old):
    if d == SAME:
        return old
    if isinstance(d, dict) and list(d) == ['~']:
        return [undelta(v, old[i]) if i < len(old) else v for i, v in enumerate(d['~'])]
    if isinstance(d, dict) and list(d) == ['~~']:
        return {k: undelta(v, old[k]) if k in old else v for k, v in d['~~'].items()}
    return d


def compress(rows):
    out, prev = [], None
    for row in rows:
        out.append(row if prev is None else {k: v if k == 'step' else delta(v, prev[k]) for k, v in row.items()})
        prev = row
    assert expand(out) == rows, 'compress() lost information'
    return out


def expand(rows):
    out, prev = [], None
    for row in rows:
        full = row if prev is None else {k: v if k == 'step' else undelta(v, prev[k]) for k, v in row.items()}
        out.append(full)
        prev = full
    return out


def first_difference(a, b, path=''):
    """(path, a part, b part) of the first place where a and b differ."""
    if isinstance(a, list) and isinstance(b, list):
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                return first_difference(x, y, f'{path}[{i}]')
        return path, a[len(b):] or f'({len(a)} items)', b[len(a):] or f'({len(b)} items)'
    if isinstance(a, dict) and isinstance(b, dict):
        for k in a:
            if a.get(k) != b.get(k):
                return first_difference(a.get(k), b.get(k), f'{path}.{k}')
    return path, a, b


class Golden:
    """Records the court screen after each step and compares it with the approved snapshot."""

    def __init__(self, name, app, errors):
        self.name, self.app, self.errors = name, app, errors
        self.steps, self.geometry, self.dialogs = [], [], []
        path = fixture_path(name)
        self.approved = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
        if not UPDATE:
            assert self.approved, f'{name}: no approved snapshot {path}; record it with KSM_UPDATE_GOLDEN=1'
            self.approved_steps = expand(self.approved['steps'])
            geometry = self.approved['geometry'].get(PLATFORM)
            self.approved_geometry = expand(geometry) if geometry else None
        app.page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
        app.page.on('dialog', lambda d: (d.message in TIMING_DIALOGS or self.dialogs.append(d.message), d.accept()))

    def check(self, step):
        page = self.app.page
        entry = {'step': step, 'screen': self.app.court_screen()}
        boxes = {}
        for name, root in TREES.items():
            entry[name] = page.evaluate(SNAPSHOT_JS, root)
        for name, root in FULL_TREES.items():
            entry[name] = page.evaluate(FULL_SNAPSHOT_JS, root)
        entry['fusen dialog'] = page.evaluate(FUSEN_JS)
        for name, root in PANELS.items():
            panel = page.evaluate(PANEL_JS, root)
            entry[name] = panel and {'tree': panel['tree'], 'text': panel['text']}
            boxes[name] = panel and panel['boxes']
        entry['card'] = page.evaluate(CARD_JS)
        entry['support layout'] = page.evaluate(SUPPORT_JS)
        self.check_react(step)
        index = len(self.steps)
        self.steps.append(entry)
        self.geometry.append(boxes)
        if UPDATE:
            return entry['screen']
        approved = self.approved_steps
        assert index < len(approved), f'{self.name}: step {index + 1} ({step}) is not in the approved snapshot ({len(approved)} steps)'
        want = approved[index]
        assert want['step'] == step, f'{self.name}: step {index + 1} is {step!r}, approved {want["step"]!r}'
        for key in entry:
            if entry[key] != want.get(key):
                path, now, was = first_difference(entry[key], want.get(key))
                raise AssertionError(f'{self.name}: step {index + 1} ({step}): {key} differs from the approved snapshot\n'
                                     f'  first difference at {path or "the top"}:\n'
                                     f'    now:      {json.dumps(now, ensure_ascii=False)[:600]}\n'
                                     f'    approved: {json.dumps(was, ensure_ascii=False)[:600]}')
        if self.approved_geometry:
            want = self.approved_geometry[index]
            for key, got in boxes.items():
                if got != want.get(key):
                    at = next((i for i, (a, b) in enumerate(zip(got or [], want.get(key) or [])) if a != b), None)
                    raise AssertionError(f'{self.name}: {step}: {key} element boxes differ from the approved snapshot '
                                         f'({PLATFORM}; first difference at element {at}: now {got and at is not None and got[at]!r}, '
                                         f'approved {want.get(key) and at is not None and want[key][at]!r}; '
                                         f'{len(got or [])} vs {len(want.get(key) or [])} elements)')
        return entry['screen']

    def check_react(self, step):
        page = self.app.page
        if LEGACY:
            for el in REACT_ELEMENTS:
                assert not page.evaluate(FIBER_JS, el), f'{self.name}: {step}: legacy copy: {el} is rendered by React'
            return
        for el in REACT_ELEMENTS:
            assert page.evaluate(FIBER_JS, el), f'{self.name}: {step}: {el} is not rendered by React'
        for name in REACT_PANELS:
            total, owned = page.evaluate(PANEL_FIBERS_JS, PANELS[name])
            if name == 'complete panel' and total:
                assert page.evaluate(FIBER_JS, PANELS[name]), f'{self.name}: {step}: the division-complete panel is not rendered by React'
            assert total == owned, f'{self.name}: {step}: {total - owned} of {total} elements in the {name} are not rendered by React'
            PANELS_SEEN[name] = max(PANELS_SEEN[name], owned)
        VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))

    def do(self, step, action):
        action(self.app)
        return self.check(step)

    def finish(self):
        path = fixture_path(self.name)
        if UPDATE:
            steps = compress(self.steps)
            geometry = {}
            if self.approved and self.approved['steps'] == steps and self.approved['dialogs'] == self.dialogs:
                geometry = {p: g for p, g in self.approved['geometry'].items() if p != PLATFORM}
            elif self.approved and any(p != PLATFORM for p in self.approved['geometry']):
                print(f'NOTE {self.name}: snapshot changed; dropped the geometry of {sorted(p for p in self.approved["geometry"] if p != PLATFORM)}')
            geometry[PLATFORM] = compress(self.geometry)
            write_fixture(path, {'scenario': self.name, 'dialogs': self.dialogs, 'steps': steps, 'geometry': geometry})
            print(f'UPDATED {path.relative_to(GOLDEN_DIR.parent.parent)} ({len(self.steps)} steps)')
        else:
            assert len(self.steps) == len(self.approved_steps), \
                f'{self.name}: {len(self.steps)} steps, approved {len(self.approved_steps)}'
            assert self.dialogs == self.approved['dialogs'], f'{self.name}: dialogs {self.dialogs}, approved {self.approved["dialogs"]}'
        self.app.page.close()


def legacy_html():
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    court = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert court, 'dist/index.html: no court module script'
    return html.replace(court.group(0), '')


def open_app(browser, name, entries, errors, court='A', tournament_name=None):
    app = KsmApp(browser.new_page(), name)
    load_app(app.page, html=legacy_html() if LEGACY else None)
    golden = Golden(name, app, errors)
    for flag in ('ksmReactScoreboard', 'ksmReactCourtHeader', 'ksmReactCourtActions', 'ksmReactCourtPanels'):
        assert app.page.evaluate(f'window.{flag} === {"undefined" if LEGACY else "true"}'), f'{name}: {flag}'
    if tournament_name:
        app.page.evaluate('name => { tName.value = name; }', tournament_name)
    app.configure(entries)
    app.open_court(court)
    return golden


def history(app):
    """Undo/Redo on the court screen: enabled, visible, label."""
    return app.page.evaluate(HISTORY_JS)


def expect_history(golden, step, undo, redo):
    h = history(golden.app)
    assert (h['undo']['enabled'], h['redo']['enabled']) == (undo, redo), f'{golden.name}: {step}: Undo/Redo enabled {h}, expected {(undo, redo)}'


# ---------------------------------------------------------------------------------- scenarios
def individual_rr_actions(browser, errors):
    g = open_app(browser, 'individual-rr-actions', [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}], errors)
    g.check('first match')
    expect_history(g, 'first match', False, False)
    # (step, action, Undo enabled, Redo enabled); the labels are in the snapshot.
    steps = [
        ('white Men', lambda a: a.score_point('W', 'M'), True, False),
        ('red Kote', lambda a: a.score_point('R', 'K'), True, False),
        ('white hansoku', lambda a: a.hansoku('W'), True, False),
        ('second white hansoku', lambda a: a.hansoku('W'), True, False),
        ('undo', lambda a: a.undo(), True, True),
        ('redo', lambda a: a.redo(), True, False),
        ('undo again', lambda a: a.undo(), True, True),
        ('red hansoku after undo (clears redo)', lambda a: a.hansoku('R'), True, False),
        ('next match', lambda a: a.next_match(), True, False),
        ('red Do', lambda a: a.score_point('R', 'D'), True, False),
        ('open Fusen-gachi', lambda a: a.click('fusen-gachi'), True, False),
        ('cancel Fusen-gachi', lambda a: a.click('fusen-cancel'), True, False),
        ('white Fusen-gachi', lambda a: a.fusen_gachi('W'), True, False),
        ('undo Fusen-gachi', lambda a: a.undo(), True, True),
        ('redo Fusen-gachi', lambda a: a.redo(), True, False),
        ('next match', lambda a: a.next_match(), True, False),
        ('white Kote', lambda a: a.score_point('W', 'K'), True, False),
    ]
    for step, action, undo, redo in steps:
        g.do(step, action)
        expect_history(g, step, undo, redo)
    screen = g.do('last next match', lambda a: a.next_match())
    assert screen['complete'], f'division should be complete: {screen}'
    # Finding F2 (docs/ROADMAP.md), kept for now: Undo is enabled but hidden.
    h = history(g.app)
    assert h['undo']['enabled'] and not h['undo']['visible'], f'division complete: expected Undo enabled but hidden (F2): {h}'
    g.finish()


def team_playoff(browser, errors):
    g = open_app(browser, 'team-playoff', [team('3-Person Team', 'Single Elimination', 2, 'A')], errors)
    page = g.app.page
    g.check('first bout')
    for bout in range(3):
        screen = g.do(f'drawn bout {bout + 1}', lambda a: a.next_match())
    pick = 'court-white-name'
    assert page.locator(f'#score [data-testid="{pick}"] [data-testid="representative-select"]').count() == 1, \
        f'expected a representative playoff with a picker after three drawn bouts: {screen}'
    roster = page.eval_on_selector(f'#score [data-testid="{pick}"] select', 'el => [...el.options].map(o => o.value).filter(Boolean)')
    assert roster, 'representative picker without a roster'
    g.do('white representative', lambda a: a.page.select_option(f'#score [data-testid="{pick}"] select', roster[0]))
    g.do('red representative', lambda a: a.page.select_option('#score [data-testid="court-red-name"] select', index=1))
    g.do('playoff point', lambda a: a.score_point('W', 'M'))
    g.do('playoff undo', lambda a: a.undo())
    expect_history(g, 'playoff undo', True, True)
    g.do('playoff redo', lambda a: a.redo())
    g.finish()


def two_courts_split(browser, errors):
    entries = [
        {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
        {'name': 'Women', 'format': 'Round Robin', 'court': 'B', 'entrants': people('W', 3)},
        {'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('K', 4)},
    ]
    g = open_app(browser, 'two-courts-split', entries, errors, tournament_name='Aloha Taikai')
    screen = g.check('Court A')
    assert screen['court'] == 'A' and screen['options'] == ['Open', 'Kids'], f'Court A header: {screen}'
    name = g.app.page.text_content('#score [data-testid="court-tournament-name"]')
    assert name == 'Aloha Taikai', f'tournament name: {name!r}'
    steps = [
        ('A: white Men', lambda a: a.score_point('W', 'M')),
        ('A: switch to Kids', lambda a: a.switch_division('Kids')),
        ('A: Kids red Kote', lambda a: a.score_point('R', 'K')),
        ('A: Kids red Kote again', lambda a: a.score_point('R', 'K')),
        ('A: Kids next match', lambda a: a.next_match()),
        ('A: back to Open', lambda a: a.switch_division('Open')),
        ('A: undo', lambda a: a.undo()),
        ('Court B', lambda a: a.open_court('B')),
    ]
    for step, action in steps:
        screen = g.do(step, action)
    expect_history(g, 'Court B (own history)', False, False)
    steps = [
        ('B: white Do', lambda a: a.score_point('W', 'D')),
        ('B: switch to Kids', lambda a: a.switch_division('Kids')),
        ('B: Kids white Men', lambda a: a.score_point('W', 'M')),
        ('B: Kids undo', lambda a: a.undo()),
        ('B: back to Women', lambda a: a.switch_division('Women')),
    ]
    for step, action in steps:
        screen = g.do(step, action)
    assert screen['court'] == 'B' and screen['options'] == ['Women', 'Kids'], f'Court B header: {screen}'
    for n in range(8):  # white wins each bout: no tiebreak
        if screen['complete']:
            break
        g.do(f'B: Women white Men {n + 1}', lambda a: a.score_point('W', 'M'))
        screen = g.do(f'B: Women next match {n + 1}', lambda a: a.next_match())
    assert screen['complete'], f'Women should be complete on Court B: {screen}'
    g.do('B: complete, switch to Kids', lambda a: a.switch_division('Kids'))
    screen = g.do('B: back to the complete Women', lambda a: a.switch_division('Women'))
    assert screen['complete'], f'Women should still be complete: {screen}'
    g.do('Court A again', lambda a: a.open_court('A'))
    expect_history(g, 'Court A again (its own history)', True, True)
    g.finish()


def spectator(browser, errors):
    g = open_app(browser, 'spectator', [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}], errors)
    g.do('staff: white Men', lambda a: a.score_point('W', 'M'))
    g.do('staff: undo', lambda a: a.undo())
    g.do('spectator', lambda a: a.page.evaluate(SPECTATOR_JS))
    screen = g.do('spectator court A', lambda a: a.open_court('A'))
    page = g.app.page
    assert page.evaluate("document.body.classList.contains('ksm-spectator')"), 'not a spectator session'
    assert screen['white'] not in ('', '—'), f'spectator court screen shows no match: {screen}'
    shown = page.evaluate("() => ['.score-controls-grid', '.bottom-action-row'].filter(s => document.querySelector('#score ' + s).checkVisibility())")
    assert not shown, f'spectator court screen shows {shown}'
    g.finish()


# Move the court to its next ready match like the golden engine test (tests/golden-engine-test.py).
PREPARE_JS = """(court) => {
  const m = KSMTest.prepareCourt(court);
  return m ? {white: m.white, red: m.red, mustWin: !!KSMTest.mustWin(m)} : null;
}"""
ALL_COMPLETE_JS = "() => Object.keys(state.allMatches).filter(d => (state.allMatches[d] || []).length).every(d => divisionComplete(d))"


def match_points(m, draws):
    """The golden engine test's outcome rule (a hash of the names); draws=True: a draw wherever allowed."""
    h = 7
    for ch in f"{m['white']}|{m['red']}":
        h = (h * 31 + ord(ch)) & 0xffffffff
    outcome = 'tie' if draws else ['tie', 'white', 'white', 'red', 'red'][h % 5]
    if outcome == 'tie' and m['mustWin']:
        outcome = 'white' if h % 2 else 'red'
    if outcome == 'tie':
        return [] if draws else [('W', 'M'), ('R', 'K')]
    if outcome == 'white':
        return [('W', 'M')] if h % 3 else [('W', 'M'), ('R', 'D'), ('W', 'K')]
    return [('R', 'K')] if h % 3 else [('R', 'D'), ('R', 'M')]


def play_through(browser, errors, name, entries, draws=False):
    """Play every division of `entries` to the end on Courts A and B, snapshot after each click."""
    g = open_app(browser, name, entries, errors)
    page = g.app.page
    g.check('start')
    played = 0
    for _ in range(300):
        progressed = False
        for court in ('A', 'B'):
            m = page.evaluate(PREPARE_JS, court)
            g.check(f'Court {court} {"match " + str(played + 1) if m else "idle"}')
            if not m:
                continue
            progressed = True
            step = f"Court {court} match {played + 1} ({m['white']} v {m['red']})"
            for side, letter in match_points(m, draws):
                g.do(f'{step}: {side} {letter}', lambda a: a.score_point(side, letter))
            g.do(f'{step}: next match', lambda a: a.next_match())
            played += 1
        if not progressed:
            break
    assert page.evaluate(ALL_COMPLETE_JS), f'{name}: not every division is complete after {played} matches'
    for court in ('A', 'B'):
        g.do(f'complete, Court {court}', lambda a: a.open_court(court))
    g.do('spectator', lambda a: a.page.evaluate(SPECTATOR_JS))
    for court in ('A', 'B'):
        g.do(f'spectator Court {court}', lambda a: a.open_court(court))
    g.finish()
    return played


PLAY_THROUGHS = [
    ('play-rr-8-split', [{'name': 'Open', 'format': 'Round Robin', 'court': 'split', 'entrants': people('P', 8)}], False),
    ('play-rr-6-draws', [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('D', 6)}], True),
    ('play-se-6-court-a', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('S', 6)}], False),
    ('play-se-8-split', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('E', 8)}], False),
    ('play-team-se-4-both', [team('3-Person Team', 'Single Elimination', 4, 'Both')], False),
    ('play-team-rr-3', [team('3-Person Team', 'Round Robin', 3, 'A')], False),
    ('play-kachinuki-se-4', [team('Kachinuki', 'Single Elimination', 4, 'A')], False),
    ('play-kachinuki-rr-3', [team('Kachinuki', 'Round Robin', 3, 'A')], False),
    ('play-rr-4-court-b', [{'name': 'Juniors', 'format': 'Round Robin', 'court': 'B', 'entrants': people('J', 4)}], False),
    ('play-team5-se-2-court-b', [team('5-Person Team', 'Single Elimination', 2, 'B')], False),
]
SCENARIOS = {
    'individual-rr-actions': individual_rr_actions,
    'team-playoff': team_playoff,
    'two-courts-split': two_courts_split,
    'spectator': spectator,
    **{name: (lambda browser, errors, n=name, e=entries, d=draws: play_through(browser, errors, n, e, d)) for name, entries, draws in PLAY_THROUGHS},
}


def main():
    started = time.time()
    chosen = [n for n in SCENARIOS if not ONLY or any(q in n for q in ONLY)]
    assert chosen, f'no scenario matches {ONLY}'
    missing_geometry = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        errors = []
        for name in chosen:
            if not UPDATE:
                approved = json.loads(fixture_path(name).read_text(encoding='utf-8')) if fixture_path(name).exists() else {}
                if PLATFORM not in approved.get('geometry', {}):
                    missing_geometry.append(name)
            SCENARIOS[name](browser, errors)
            print(f'  {name}: ok')
        if not ONLY and not UPDATE:
            for kind, seen in PANELS_SEEN.items():
                assert seen, f'React never rendered anything in the {kind}'
            # (Not reachable from these runs: the queue's final results (the division is
            # complete by then, so the queue is empty), championship placeholder queue rows
            # (the frozen templates create every championship match at generation) and
            # "No division selected.", and a complete division without placements.)
            expected = {
                'context: pools', 'context: active pool', 'context: completed pools', 'context: pool tiebreak row',
                'context: pools with bracket cards', 'context: pools with bracket message', 'context: pools with bracket team-standings',
                'context: single-elim', 'context: split-single-elim', 'context: team-sheet', 'context: kachinuki',
                'context: bracket with bracket team-bracket', 'context: bracket with bracket message',
                'queue: empty', 'queue: message', 'queue: groups', 'queue row: individual match', 'queue row: individual match tiebreak',
                'queue row: team match', 'queue row: team placeholder', 'queue row: aligned awaiting',
                'complete: placements',
            }
            assert expected <= VARIANTS_SEEN, f'panel variants not covered: {sorted(expected - VARIANTS_SEEN)}'
        assert not errors, '\n'.join(errors)
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} court screen = approved snapshots ({", ".join(chosen)}){note} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
