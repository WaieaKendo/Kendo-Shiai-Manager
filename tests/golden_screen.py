"""Shared parts of the golden (snapshot) tests of whole screens: golden-court-screen-test.py
(tests/golden/court/), golden-live-scores-test.py (tests/golden/live-scores/),
golden-tv-test.py (tests/golden/tv/), golden-results-test.py (tests/golden/results/),
golden-overview-test.py (tests/golden/overview/), golden-library-test.py (tests/golden/library/),
golden-pools-test.py (tests/golden/pools/), golden-setup-test.py (tests/golden/setup/) and
golden-registration-test.py (tests/golden/registration/).

A screen test runs scenarios on one offline copy of the app and, after every step, serializes
the screen (elements, attributes, visible text, visibility) and compares it with an approved
snapshot. Element boxes depend on the platform's fonts (system-ui), so they are stored per
platform (sys.platform) next to the platform-independent snapshot and compared only where they
were recorded. Each step is stored as its difference from the step before, one step per line.

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-<screen>-test.py [scenario ...]

re-records (review the JSON diff and commit it with the code change). An update keeps other
platforms' geometry only when the rest of the snapshot is unchanged.
"""
import json
import os
import sys

UPDATE = os.environ.get('KSM_UPDATE_GOLDEN') == '1' or '--update' in sys.argv
PLATFORM = sys.platform
ONLY = [a for a in sys.argv[1:] if not a.startswith('-')]

# A subtree with every attribute (but inline on* handlers), visibility and innerText; each
# element's page box (rounded to 1/4 px, '' when hidden) in document order, kept apart as the
# platform-dependent part. Whitespace-only text nodes are left out.
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
FIBER_JS = "s => Object.keys(document.querySelector(s)).some(k => k.startsWith('__reactFiber'))"
# Elements under a root: [how many, how many with a React fiber].
PANEL_FIBERS_JS = """(root) => {
  const els = [...document.querySelectorAll(root + ' *')];
  return [els.length, els.filter(e => Object.keys(e).some(k => k.startsWith('__reactFiber'))).length];
}"""
# Dialogs shown depending on timing, not on the screen: the offline test copy's debounced cloud
# save asks for a staff password (answered with nothing, so the save stops), once per save that
# happens to run. Every other dialog is part of the snapshot.
TIMING_DIALOGS = {'Create Staff password'}
SPECTATOR_JS = "() => { setSessionRole('spectator'); installRoleBanner('spectator'); }"
# Move the court to its next ready match like the golden engine test (tests/golden-engine-test.py).
PREPARE_JS = """(court) => {
  const m = KSMTest.prepareCourt(court);
  return m ? {white: m.white, red: m.red, mustWin: !!KSMTest.mustWin(m)} : null;
}"""
ALL_COMPLETE_JS = "() => Object.keys(state.allMatches).filter(d => (state.allMatches[d] || []).length).every(d => divisionComplete(d))"


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i + 1}', 'seed': '', 'status': 'Checked'} for i in range(n)]


def team(fmt, tournament, n, court):
    return {'team': True, 'format': fmt, 'tournament': tournament, 'teams': n, 'court': court}


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


def geometry_recorded(golden_dir, name):
    """Whether the approved snapshot `name` has element boxes for this platform."""
    path = golden_dir / f'{name}.json'
    return path.exists() and PLATFORM in json.loads(path.read_text(encoding='utf-8')).get('geometry', {})


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
    """Records a screen after each step and compares it with the approved snapshot.

    capture(app) returns (entry, boxes): the platform-independent serialization (a dict) and
    the element boxes per panel (a dict). react_check(golden, step), when given, runs after each
    capture. check() and do() return entry[result] (the whole entry without `result`).
    """

    def __init__(self, name, app, errors, golden_dir, capture, react_check=None, result=None):
        self.name, self.app, self.errors = name, app, errors
        self.golden_dir, self.capture, self.react_check, self.result = golden_dir, capture, react_check, result
        self.steps, self.geometry, self.dialogs = [], [], []
        path = self.path()
        self.approved = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
        if not UPDATE:
            assert self.approved, f'{name}: no approved snapshot {path}; record it with KSM_UPDATE_GOLDEN=1'
            self.approved_steps = expand(self.approved['steps'])
            geometry = self.approved['geometry'].get(PLATFORM)
            self.approved_geometry = expand(geometry) if geometry else None
        app.page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
        # answer(dialog), when set, answers the dialogs (a test's own prompt answers); otherwise accepted.
        self.answer = None
        self.timing_dialogs = TIMING_DIALOGS
        app.page.on('dialog', lambda d: (d.message in self.timing_dialogs or self.dialogs.append(d.message),
                                         self.answer(d) if self.answer else d.accept()))

    def path(self):
        return self.golden_dir / f'{self.name}.json'

    def check(self, step):
        entry, boxes = self.capture(self.app)
        entry = {'step': step, **entry}
        if self.react_check:
            self.react_check(self, step)
        index = len(self.steps)
        self.steps.append(entry)
        self.geometry.append(boxes)
        out = entry[self.result] if self.result else entry
        if UPDATE:
            return out
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
        return out

    def do(self, step, action):
        action(self.app)
        return self.check(step)

    def finish(self):
        path = self.path()
        if UPDATE:
            steps = compress(self.steps)
            geometry = {}
            if self.approved and self.approved['steps'] == steps and self.approved['dialogs'] == self.dialogs:
                geometry = {p: g for p, g in self.approved['geometry'].items() if p != PLATFORM}
            elif self.approved and any(p != PLATFORM for p in self.approved['geometry']):
                print(f'NOTE {self.name}: snapshot changed; dropped the geometry of {sorted(p for p in self.approved["geometry"] if p != PLATFORM)}')
            geometry[PLATFORM] = compress(self.geometry)
            write_fixture(path, {'scenario': self.name, 'dialogs': self.dialogs, 'steps': steps, 'geometry': geometry})
            print(f'UPDATED {path.relative_to(self.golden_dir.parent.parent)} ({len(self.steps)} steps)')
        else:
            assert len(self.steps) == len(self.approved_steps), \
                f'{self.name}: {len(self.steps)} steps, approved {len(self.approved_steps)}'
            assert self.dialogs == self.approved['dialogs'], f'{self.name}: dialogs {self.dialogs}, approved {self.approved["dialogs"]}'
        self.app.page.close()
