"""Golden (snapshot) test of the Overview screen (#director, nav "Overview"; roadmap M.13).

The Overview shows the tournament name, the overall progress (completed / total matches, the
progress bar, remaining; with a kachinuki division "C / T Matches so far", its bouts known so far
in the total (F15, fixed; was "N Completed • fixed-format total T") and no remaining count) and a card per court (Court A, Court B: the court's division and round, the
division's progress on that court with its bar, remaining, and the Current / On Deck /
Following matches). The approved snapshots in tests/golden/overview/*.json were recorded from
the LEGACY renderer (renderDirector() and directorMatchRow() in
app/js/30-setup-header-and-director.js, fed by tournamentSummary(), courtSummaryFor() and the
directorDivisionProgress() family there), so they pin exactly what the legacy screen drew
(quirks included, see docs/ROADMAP.md "Overview quirks kept").

One offline copy of the app runs each scenario; after every step the whole #director view is
serialized (golden_screen.PANEL_JS: elements, attributes, text, visibility, innerText, each
element's page box per platform) and compared with the approved snapshot, together with
tournamentSummary() (the overall numbers), whether the view is shown, the page's scroll width
against the window's (no sideways scroll on a phone), the page errors since the step before and
the dialogs shown. While the Overview is hidden its innerText is its textContent, so the text is
compared only while it is shown (the tree always).

The Overview is redrawn when it is opened (navigateTo('director') -> show() -> renderAll(), then
startDirectorRefresh()), by renderAll() while it is shown (a live update), and every 5 s while
it is shown (startDirectorRefresh()'s timer). A court action on the same device does not redraw
it. The test page replaces that 5 s timer with one it fires itself ("5 s later"), so a step
never depends on when the timer ran. The progress bar's width has a transition; transitions are
off in the test page.

  overview-rr-4       no tournament yet, the tournament name (with <, & and >), a pool-only
                      round robin of 4 (Court A) generated; phone portrait and landscape; a
                      match finished while the Overview is shown (not redrawn), 5 s later (the
                      timer redraws it), a live update (renderAll()), the timer while the
                      Overview is hidden (nothing); the division played through with the
                      Overview after every match; complete; phones; a spectator's Overview;
  play-*              whole divisions played through on Courts A and B (the court's next ready
                      match chosen as the golden engine test does, points and Next Match called
                      as the court buttons do) with the Overview opened after every match:
                      pool-only RR of 5 on Court B, RR 8 split (pools + championship), RR of
                      draws (tiebreaks), SE on one court and split, three divisions on two
                      courts, 3-person team SE on both courts, team RR, kachinuki SE and RR,
                      5-person team SE on Court B, an individual RR next to a kachinuki SE (the
                      variable overall total); phone portrait and landscape at the end; a
                      spectator's view.

Since M.13 the Overview is drawn only by React (app/react/overview/: one island, the contents
of #director .director-dashboard; app/js/39-react-overview.js publishes its data); the legacy
renderer is removed, so this test pins the React-only screen. React must render every element
of the island (and .director-dashboard must be its root), every kind of Overview content must
be covered, and before the first publish the island must equal the static markup of
app/index.html (overview-static-markup). Last, the app without the React module script must
show the "Overview could not load" notice instead of the empty dashboard (and a working page
never shows it).

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-overview-test.py [scenario ...]
"""
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import (
    ALL_COMPLETE_JS, ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, PREPARE_JS, SPECTATOR_JS, UPDATE,
    Golden, first_difference, geometry_recorded, match_points, people, team,
)
from ksm_app import KsmApp
from ksm_browser import DIST, launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'overview'
ROOT = '#director'
DESKTOP = {'width': 1280, 'height': 720}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390})]
# What a court's buttons call (app/js/10-court-scoring-and-history.js).
POINT_JS = "([side, letter]) => point(side, letter)"
NEXT_JS = "() => nextMatch()"
SHOW_OVERVIEW_JS = "() => KSMTest.show('director')"
VIEW_JS = f"() => !document.querySelector('{ROOT}').classList.contains('hidden')"
NO_TRANSITIONS = '*, *::before, *::after { transition: none !important; animation: none !important; }'
# startDirectorRefresh()'s 5 s timer, fired by the test ("5 s later") instead of by the clock.
# Only the Overview uses a 5000 ms interval (the others are 15 s, 60 s and 10 min).
REFRESH_TIMER_INIT = """(() => {
  const setI = window.setInterval.bind(window), clearI = window.clearInterval.bind(window);
  const timers = new Map();
  window.setInterval = (fn, ms, ...args) => {
    if (ms !== 5000) return setI(fn, ms, ...args);
    const id = setI(() => {}, 2147483647);
    timers.set(id, fn);
    return id;
  };
  window.clearInterval = id => { timers.delete(id); clearI(id); };
  window.__ksmOverviewTick = () => { [...timers.values()].forEach(fn => fn()); return timers.size; };
})();"""
TICK_JS = '() => window.__ksmOverviewTick()'
SUMMARY_JS = '() => tournamentSummary()'
SCROLL_JS = '() => [document.documentElement.scrollWidth, innerWidth]'

# The Overview island (app/react/overview/main.tsx): React renders every element of the
# dashboard, which is the island's root.
ISLAND = '#director .director-dashboard'
ROOT_JS = f"() => Object.keys(document.querySelector('{ISLAND}')).some(k => k.startsWith('__reactContainer'))"
# Which kinds of Overview content the island was given.
VARIANTS_JS = """() => {
  const d = window.ksmOverviewInput, out = [];
  if (!d || d.kind !== 'overview') return ['nothing published'];
  out.push('overall: ' + (d.overall.variable ? 'variable' : d.overall.total ? 'fixed' : 'no matches'));
  if (!d.overall.variable && d.overall.total && d.overall.completed === d.overall.total) out.push('overall: complete');
  d.courts.forEach(c => {
    out.push(`court ${c.court}: ` + (c.division === 'No active division' ? 'no division' : c.variable ? 'variable' : c.total ? 'fixed' : 'no matches'));
    if (c.round) out.push('round');
    [c.current, c.onDeck, c.following].forEach(m => {
      out.push(m ? 'match' : 'no match');
      if (m && (m.white === '—' || m.red === '—')) out.push('match without a name');
    });
  });
  return out;
}"""
VARIANTS_SEEN = set()
ELEMENTS_SEEN = [0]  # most React-rendered elements seen in the island


def check_react(golden, step):
    """React renders every element of the Overview island."""
    page = golden.app.page
    total, owned = page.evaluate(PANEL_FIBERS_JS, ISLAND)
    assert total and total == owned, f'{golden.name}: {step}: {total - owned} of {total} elements in {ISLAND} are not rendered by React'
    ELEMENTS_SEEN[0] = max(ELEMENTS_SEEN[0], owned)
    assert page.evaluate(ROOT_JS), f'{golden.name}: {step}: {ISLAND} is not a React root'
    VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))


def capture(app):
    """The Overview: (serialization, element boxes)."""
    page = app.page
    panel = page.evaluate(PANEL_JS, ROOT)
    errors, app.page_errors[:] = list(app.page_errors), []
    shown = page.evaluate(VIEW_JS)
    entry = {
        'shown': shown,
        'summary': page.evaluate(SUMMARY_JS),
        'scroll': page.evaluate(SCROLL_JS),
        'pageErrors': errors,
        # innerText of a hidden view is its textContent (the templates' source formatting).
        'overview': {'tree': panel['tree'], 'text': panel['text'] if shown else None},
    }
    return entry, {'overview': panel['boxes']}


def open_app(name, browser, errors, entries=None, react_check=check_react):
    app = KsmApp(browser.new_page(viewport=DESKTOP), name)
    # Page errors are part of each step's snapshot (capture()), not failures.
    app.page_errors = []
    app.page.add_init_script(REFRESH_TIMER_INIT)
    load_app(app.page)
    app.page.add_style_tag(content=NO_TRANSITIONS)
    golden = Golden(name, app, app.page_errors, GOLDEN_DIR, capture, react_check)
    assert app.page.evaluate('window.ksmOverviewMounted === true'), f'{name}: the Overview island did not mount'
    assert app.page.locator('#overviewModuleMissing').count() == 0, f'{name}: "Overview could not load" shown on a working page'
    if entries:
        app.configure(entries)
    return golden


def phone_views(g, label):
    for step, size in PHONES:
        g.do(f'{label}: {step}', lambda a, s=size: a.page.set_viewport_size(s))
    g.app.page.set_viewport_size(DESKTOP)


def play_match(g, court, m, played, label=''):
    """One match on the court screen (points, Next Match), then the Overview opened."""
    page = g.app.page
    for side, letter in match_points(m, g.draws):
        page.evaluate(POINT_JS, [side, letter])
    # nextMatch() does not redraw the (hidden) Overview.
    g.do(f"{label}Court {court} match {played + 1} ({m['white']} v {m['red']}): next match (Overview hidden)",
         lambda a: a.page.evaluate(NEXT_JS))
    g.do(f'{label}Court {court} match {played + 1}: Overview', lambda a: a.page.evaluate(SHOW_OVERVIEW_JS))


def play_all(g, name, label=''):
    """Every division to the end on Courts A and B, the Overview opened after every match."""
    page = g.app.page
    played = 0
    for _ in range(300):
        progressed = False
        for court in ('A', 'B'):
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


# ---------------------------------------------------------------------------------- scenarios
def overview_rr_4(browser, errors):
    g = open_app('overview-rr-4', browser, errors)
    g.draws = False
    page = g.app.page
    g.do('no tournament yet', lambda a: a.nav('overview'))
    g.do('5 s later (no tournament)', lambda a: a.page.evaluate(TICK_JS))
    phone_views(g, 'no tournament')
    g.do('tournament name', lambda a: a.page.evaluate("() => { tName.value = 'Aiea <Taikai> & Co'; KSMTest.show('director'); }"))
    g.app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 4)}])
    g.do('generated (Overview hidden by Generate)', lambda a: None)
    g.do('generated: Overview opened', lambda a: a.nav('overview'))
    phone_views(g, 'generated')
    # A match finished while the Overview is shown: nothing redraws it until the timer or a live update.
    m = page.evaluate(PREPARE_JS, 'A')
    g.do('match 1 on the court screen', lambda a: None)
    g.do('Overview during match 1', lambda a: a.page.evaluate(SHOW_OVERVIEW_JS))
    for side, letter in match_points(m, False):
        page.evaluate(POINT_JS, [side, letter])
    g.do('match 1: points scored (Overview shown)', lambda a: None)
    g.do('match 1: next match while the Overview is shown', lambda a: a.page.evaluate(NEXT_JS))
    g.do('5 s later', lambda a: a.page.evaluate(TICK_JS))
    m = page.evaluate("() => { const m = state.matches[state.current]; return m ? {white: m.white, red: m.red, mustWin: !!KSMTest.mustWin(m)} : null; }")
    for side, letter in match_points(m, False):
        page.evaluate(POINT_JS, [side, letter])
    g.do('match 2: next match while the Overview is shown', lambda a: a.page.evaluate(NEXT_JS))
    g.do('match 2: a live update (renderAll())', lambda a: a.page.evaluate('() => renderAll()'))
    g.do('Live Scores opened', lambda a: a.nav('live-scores'))
    g.do('5 s later with the Overview hidden', lambda a: a.page.evaluate(TICK_JS))
    g.do('Overview opened again', lambda a: a.nav('overview'))
    play_all(g, 'overview-rr-4')
    g.do('complete', lambda a: a.page.evaluate(SHOW_OVERVIEW_JS))
    g.do('complete: 5 s later', lambda a: a.page.evaluate(TICK_JS))
    phone_views(g, 'complete')
    g.do('spectator', lambda a: (a.page.evaluate(SPECTATOR_JS), a.page.evaluate(SHOW_OVERVIEW_JS)))
    g.do('spectator: nav Overview', lambda a: a.nav('overview'))
    g.finish()


def play_through(browser, errors, name, entries, draws=False):
    """Play every division to the end with the Overview opened after every match."""
    g = open_app(name, browser, errors, entries)
    g.draws = draws
    g.do('start', lambda a: a.nav('overview'))
    play_all(g, name)
    g.do('complete', lambda a: a.page.evaluate(SHOW_OVERVIEW_JS))
    phone_views(g, 'complete')
    g.do('spectator', lambda a: (a.page.evaluate(SPECTATOR_JS), a.page.evaluate(SHOW_OVERVIEW_JS)))
    g.finish()


PLAY_THROUGHS = [
    ('play-rr-5-court-b', [{'name': 'Juniors', 'format': 'Round Robin', 'court': 'B', 'entrants': people('J', 5)}], False),
    ('play-rr-8-split', [{'name': 'Open', 'format': 'Round Robin', 'court': 'split', 'entrants': people('P', 8)}], False),
    ('play-rr-6-draws', [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('D', 6)}], True),
    ('play-se-6-court-a', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('S', 6)}], False),
    ('play-se-8-split', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('E', 8)}], False),
    ('play-three-divisions', [
        {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
        {'name': 'Women', 'format': 'Round Robin', 'court': 'B', 'entrants': people('W', 3)},
        {'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('K', 4)},
    ], False),
    ('play-team-se-4-both', [team('3-Person Team', 'Single Elimination', 4, 'Both')], False),
    ('play-team-rr-3', [team('3-Person Team', 'Round Robin', 3, 'A')], False),
    ('play-kachinuki-se-4', [team('Kachinuki', 'Single Elimination', 4, 'A')], False),
    ('play-kachinuki-rr-3', [team('Kachinuki', 'Round Robin', 3, 'Both')], False),
    ('play-team5-se-2-court-b', [team('5-Person Team', 'Single Elimination', 2, 'B')], False),
    ('play-rr-and-kachinuki', [
        {'name': 'Open', 'format': 'Round Robin', 'court': 'B', 'entrants': people('P', 3)},
        team('Kachinuki', 'Single Elimination', 4, 'A'),
    ], False),
]
SCENARIOS = {
    'overview-rr-4': overview_rr_4,
    **{name: (lambda browser, errors, n=name, e=entries, d=draws: play_through(browser, errors, n, e, d))
       for name, entries, draws in PLAY_THROUGHS},
}
def without_screens_module():
    """dist/index.html without the React screens' module script (as a device whose copy lacks it)."""
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    module = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert module, 'dist/index.html: no module script'
    return html.replace(module.group(0), '')


# The Overview shown without drawing it (no renderDirector()): what the page has before the
# first publish.
UNDRAWN_JS = "() => { document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); document.getElementById('director').classList.remove('hidden'); }"


def overview_static_markup(browser, errors):
    """Before renderDirector() first runs, the island draws the static markup of app/index.html."""
    seen = []
    for label, html in (('static markup', without_screens_module()), ('island', None)):
        page = browser.new_page(viewport=DESKTOP)
        page.on('pageerror', lambda e, l=label: errors.append(f'{l}: {e}'))
        page.add_init_script(REFRESH_TIMER_INIT)
        if html is not None:
            # Without the module the notice would replace the dashboard (and, since the shell is React
            # too, another one would sit in the header above it); keep the static markup.
            page.add_init_script('window.ksmOverviewMounted = true; window.ksmShellMounted = true;')
        load_app(page, html=html)
        page.add_style_tag(content=NO_TRANSITIONS)
        page.evaluate(UNDRAWN_JS)
        assert page.evaluate('window.ksmOverviewInput === undefined'), f'{label}: the Overview was published before it was opened'
        seen.append(page.evaluate(PANEL_JS, ROOT))
        if html is None:
            total, owned = page.evaluate(PANEL_FIBERS_JS, ISLAND)
            assert total and total == owned, f'island before the first publish: {total - owned} of {total} elements not rendered by React'
            VARIANTS_SEEN.add('nothing published')
        page.close()
    assert seen[0] == seen[1], f'the island before the first publish differs from the static markup: {first_difference(seen[1], seen[0])}'


def overview_module_missing(browser, errors):
    """Without the React module nothing draws the Overview: it says so instead."""
    app = KsmApp(browser.new_page(viewport=DESKTOP), 'no React module')
    page = app.page
    page.on('pageerror', lambda e: errors.append(f'Overview module missing: {e}'))
    page.add_init_script(REFRESH_TIMER_INIT)
    load_app(page, html=without_screens_module())
    app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
    app.nav('overview')
    notice = page.locator('#director [data-testid="overview-module-missing"]')
    assert notice.is_visible(), 'no "Overview could not load" notice without the React module'
    assert 'Overview could not load' in notice.inner_text(), notice.inner_text()
    assert not page.locator('#director .director-dashboard').is_visible(), 'the empty Overview dashboard is shown without the React module'
    assert page.evaluate('window.ksmOverviewInput.kind') == 'overview', 'renderDirector() did not publish without the island'
    page.close()


# Checks without a snapshot file.
CHECKS = {'overview-static-markup': overview_static_markup, 'overview-module-missing': overview_module_missing}


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
            assert ELEMENTS_SEEN[0], 'React never rendered anything on the Overview'
            expected = {
                'nothing published', 'overall: no matches', 'overall: fixed', 'overall: complete', 'overall: variable',
                'court A: fixed', 'court B: fixed', 'court A: variable', 'court B: variable', 'court A: no matches', 'court B: no matches',
                'round', 'match', 'no match', 'match without a name',
            }
            assert expected <= VARIANTS_SEEN, f'Overview variants not covered: {sorted(expected - VARIANTS_SEEN)}; seen {sorted(VARIANTS_SEEN)}'
        assert not errors, '\n'.join(errors)
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} Overview = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
