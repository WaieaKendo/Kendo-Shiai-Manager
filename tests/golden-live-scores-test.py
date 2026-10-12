"""Golden (snapshot) test of the Live Scores screen (#public, nav "Live Scores"; roadmap M.13).

Spectators land on Live Scores. Since M.13 the screen is drawn only by React (the LiveScores
island, app/react/live-scores/; app/js/36-react-live-scores.js publishes its data). The approved
snapshots in tests/golden/live-scores/*.json were recorded from the LEGACY renderer
(renderPublic() and liveScoresCourtCard() in app/js/25-live-scores.js, the division-complete
wrapper in 32-split-court-templates.js) before it was removed, so they pin exactly what the
legacy screen drew (quirks included, see docs/ROADMAP.md "Live Scores quirks kept"), apart from
the intended changes approved since (F16: both courts stay while either plays, a finished
division's placements in its court's card; play-three-divisions, play-rr-4-court-b and
play-team5-se-2-court-b re-recorded).

One offline copy of the app runs each scenario with Live Scores on screen; after every step
the whole #public view is serialized (golden_screen.PANEL_JS: elements, ids, classes, test IDs,
every attribute, text, visibility, innerText, and each element's page box per platform) and
compared with the approved snapshot, together with the Live Scores read-out of both courts
(KsmApp.live_court()) and the dialogs shown. React must render every element in #publicLive
(the LiveScores island, app/react/live-scores/), and every kind of Live Scores content must be
covered. Last, the app without the React module script must show the "Live Scores could not
load" notice instead of an empty screen (and a working page never shows it).

Live Scores is redrawn by every court action (renderScore() calls renderPublic()) and by
opening it (show() runs renderAll()), so the scenarios use both:
  individual-rr-actions  no tournament yet, then a round robin on Court A scored on the court
                         screen (points, hansoku, undo, redo, Fusen-gachi, Next Match) with a
                         look at Live Scores after each action, to the division-complete panel;
                         a spectator's Live Scores;
  team-playoff           a 3-person team match with three drawn bouts, the representative
                         playoff and its point, undo;
  play-*                 whole divisions played through on Courts A and B while Live Scores is
                         on screen (the court's next ready match chosen as the golden engine
                         test does, points and Next Match called as the court buttons do):
                         individual RR split, RR of draws (pool tiebreaks), SE on one court and
                         split, three divisions on two courts at once, 3-person team SE on both
                         courts, team RR, kachinuki SE and RR, an RR on Court B only, 5-person
                         team SE on Court B; phone portrait and landscape during the first
                         match; the division-complete screen, then a spectator's view.
                         On Court B's own divisions also the view as a Court B device has it
                         after a live update (state.publicCourt 'B').

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-live-scores-test.py [scenario ...]
"""
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import (
    ALL_COMPLETE_JS, FIBER_JS, ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, PREPARE_JS, SPECTATOR_JS, UPDATE,
    Golden, geometry_recorded, match_points, people, team,
)
from ksm_app import KsmApp
from ksm_browser import DIST, launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'live-scores'
ROOT = '#public'
DESKTOP = {'width': 1280, 'height': 720}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390})]
# What a court's buttons call (app/js/10-court-scoring-and-history.js), with Live Scores on screen.
POINT_JS = "([side, letter]) => point(side, letter)"
NEXT_JS = "() => nextMatch()"
SHOW_LIVE_JS = "() => KSMTest.show('public')"
# A Court B device keeps its court as the Live Scores court after a live update
# (applyRemoteCloudRecord() in 21-: state.publicCourt from the local court).
PUBLIC_COURT_B_JS = "() => { state.publicCourt = 'B'; KSMTest.show('public'); }"
VIEW_JS = f"() => !document.querySelector('{ROOT}').classList.contains('hidden')"
LIVE = '#public #publicLive'
# Which kinds of Live Scores content the React island was given.
VARIANTS_JS = """() => {
  const d = window.ksmLiveScoresInput, out = [];
  if (!d) return out;
  out.push('live: ' + d.kind);
  if (d.kind === 'complete') out.push('complete: ' + (d.complete.placements.length ? 'placements' : 'no placements'));
  (d.courts || []).forEach(c => {
    out.push(`court ${c.court}: ${c.kind}`);
    if (c.kind !== 'idle') out.push(`${c.kind}: ${c.next ? 'next' : 'no next'}`);
    if (c.kind === 'individual' && c.points.W.length + c.points.R.length) out.push('individual: points');
    if (c.kind === 'team' && c.sheet.rows.length > 3) out.push('team: playoff row');
  });
  return out;
}"""
VARIANTS_SEEN = set()
ELEMENTS_SEEN = [0]  # most React-rendered elements seen in #publicLive


def capture(app):
    """Live Scores: (serialization, element boxes)."""
    page = app.page
    panel = page.evaluate(PANEL_JS, ROOT)
    entry = {
        'courts': {c: app.live_court(c) for c in ('A', 'B')},
        'shown': page.evaluate(VIEW_JS),
        'live': {'tree': panel['tree'], 'text': panel['text']},
    }
    return entry, {'live': panel['boxes']}


def check_react(golden, step):
    """React renders every element of Live Scores (#publicLive and all in it)."""
    page = golden.app.page
    total, owned = page.evaluate(PANEL_FIBERS_JS, LIVE)
    assert total == owned, f'{golden.name}: {step}: {total - owned} of {total} Live Scores elements are not rendered by React'
    if total:
        assert page.evaluate(FIBER_JS, f'{LIVE} > *'), f'{golden.name}: {step}: Live Scores is not rendered by React'
    ELEMENTS_SEEN[0] = max(ELEMENTS_SEEN[0], owned)
    VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))


def open_app(name, browser, errors, entries=None):
    app = KsmApp(browser.new_page(viewport=DESKTOP), name)
    load_app(app.page)
    golden = Golden(name, app, errors, GOLDEN_DIR, capture, check_react)
    assert app.page.evaluate('window.ksmLiveScoresMounted === true'), f'{name}: the Live Scores island did not mount'
    assert app.page.locator('#liveScoresModuleMissing').count() == 0, f'{name}: "Live Scores could not load" shown on a working page'
    if entries:
        app.configure(entries)
    return golden


def without_screens_module():
    """dist/index.html without the React screens' module script (as a device whose copy lacks it)."""
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    module = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert module, 'dist/index.html: no module script'
    return html.replace(module.group(0), '')


def live_scores_module_missing(browser, errors):
    """Without the React module nothing draws Live Scores: it says so instead."""
    app = KsmApp(browser.new_page(viewport=DESKTOP), 'no React module')
    page = app.page
    page.on('pageerror', lambda e: errors.append(f'Live Scores module missing: {e}'))
    load_app(page, html=without_screens_module())
    app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
    app.nav('live-scores')
    notice = page.locator('#public [data-testid="live-scores-module-missing"]')
    assert notice.is_visible(), 'no "Live Scores could not load" notice without the React module'
    assert 'Live Scores could not load' in notice.inner_text(), notice.inner_text()
    assert not page.locator('#publicLive').is_visible(), 'the empty Live Scores markup is shown without the React module'
    assert page.evaluate('window.ksmLiveScoresInput.kind') == 'courts', 'renderPublic() did not publish without the island'
    page.close()


def phone_views(g, label):
    for step, size in PHONES:
        g.do(f'{label}: {step}', lambda a, s=size: a.page.set_viewport_size(s))
    g.app.page.set_viewport_size(DESKTOP)


# ---------------------------------------------------------------------------------- scenarios
def individual_rr_actions(browser, errors):
    g = open_app('individual-rr-actions', browser, errors)
    g.do('no tournament yet', lambda a: a.nav('live-scores'))
    g.app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
    g.do('generated', lambda a: a.nav('live-scores'))

    def on_court(action):
        """Act on the Court A screen, then open Live Scores."""
        def run(a):
            a.open_court('A')
            action(a)
            a.nav('live-scores')
        return run

    steps = [
        ('white Men', lambda a: a.score_point('W', 'M')),
        ('red Kote', lambda a: a.score_point('R', 'K')),
        ('white hansoku', lambda a: a.hansoku('W')),
        ('second white hansoku', lambda a: a.hansoku('W')),
        ('undo', lambda a: a.undo()),
        ('redo', lambda a: a.redo()),
        ('next match', lambda a: a.next_match()),
        ('red Do', lambda a: a.score_point('R', 'D')),
        ('white Fusen-gachi', lambda a: a.fusen_gachi('W')),
        ('undo Fusen-gachi', lambda a: a.undo()),
        ('redo Fusen-gachi', lambda a: a.redo()),
        ('next match', lambda a: a.next_match()),
        ('white Kote', lambda a: a.score_point('W', 'K')),
        ('last next match', lambda a: a.next_match()),
        ('undo the last match', lambda a: a.undo()),
        ('last next match again', lambda a: a.next_match()),
    ]
    for step, action in steps:
        g.do(step, on_court(action))
    g.do('spectator', lambda a: (a.page.evaluate(SPECTATOR_JS), a.page.evaluate(SHOW_LIVE_JS)))
    g.finish()


def team_playoff(browser, errors):
    g = open_app('team-playoff', browser, errors, [team('3-Person Team', 'Single Elimination', 2, 'A')])
    g.do('first bout', lambda a: a.nav('live-scores'))

    def on_court(action):
        def run(a):
            a.open_court('A')
            action(a)
            a.nav('live-scores')
        return run

    for bout in range(3):
        g.do(f'drawn bout {bout + 1}', on_court(lambda a: a.next_match()))
    page = g.app.page
    pick = '#score [data-testid="court-white-name"] select'
    assert page.locator(pick).count() == 1, 'expected a representative playoff after three drawn bouts'
    roster = page.eval_on_selector(pick, 'el => [...el.options].map(o => o.value).filter(Boolean)')
    g.do('white representative', on_court(lambda a: a.page.select_option(pick, roster[0])))
    g.do('red representative', on_court(lambda a: a.page.select_option('#score [data-testid="court-red-name"] select', index=1)))
    g.do('playoff point', on_court(lambda a: a.score_point('W', 'M')))
    g.do('playoff undo', on_court(lambda a: a.undo()))
    g.do('playoff point again', on_court(lambda a: a.score_point('W', 'M')))
    g.do('playoff next match', on_court(lambda a: a.next_match()))
    g.finish()


def play_through(browser, errors, name, entries, draws=False, court_b_view=False):
    """Play every division to the end on Courts A and B with Live Scores on screen."""
    g = open_app(name, browser, errors, entries)
    page = g.app.page
    g.do('start', lambda a: a.nav('live-scores'))
    played = 0
    for _ in range(300):
        progressed = False
        for court in ('A', 'B'):
            m = page.evaluate(PREPARE_JS, court)  # opens the court screen
            g.do(f'Court {court} {"match " + str(played + 1) if m else "idle"}', lambda a: a.page.evaluate(SHOW_LIVE_JS))
            if not m:
                continue
            progressed = True
            step = f"Court {court} match {played + 1} ({m['white']} v {m['red']})"
            for i, (side, letter) in enumerate(match_points(m, draws)):
                g.do(f'{step}: {side} {letter}', lambda a: a.page.evaluate(POINT_JS, [side, letter]))
                if played == 0 and i == 0:
                    phone_views(g, step)
            g.do(f'{step}: next match', lambda a: a.page.evaluate(NEXT_JS))
            played += 1
        if not progressed:
            break
    assert page.evaluate(ALL_COMPLETE_JS), f'{name}: not every division is complete after {played} matches'
    g.do('complete', lambda a: a.page.evaluate(SHOW_LIVE_JS))
    phone_views(g, 'complete')
    if court_b_view:
        g.do('complete, as a Court B device', lambda a: a.page.evaluate(PUBLIC_COURT_B_JS))
    g.do('spectator', lambda a: (a.page.evaluate(SPECTATOR_JS), a.page.evaluate(SHOW_LIVE_JS)))
    g.finish()
    return played


PLAY_THROUGHS = [
    ('play-rr-8-split', [{'name': 'Open', 'format': 'Round Robin', 'court': 'split', 'entrants': people('P', 8)}], False, False),
    ('play-rr-6-draws', [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('D', 6)}], True, False),
    ('play-se-6-court-a', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('S', 6)}], False, False),
    ('play-se-8-split', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('E', 8)}], False, False),
    ('play-three-divisions', [
        {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
        {'name': 'Women', 'format': 'Round Robin', 'court': 'B', 'entrants': people('W', 3)},
        {'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('K', 4)},
    ], False, True),
    ('play-team-se-4-both', [team('3-Person Team', 'Single Elimination', 4, 'Both')], False, False),
    ('play-team-rr-3', [team('3-Person Team', 'Round Robin', 3, 'A')], False, False),
    ('play-kachinuki-se-4', [team('Kachinuki', 'Single Elimination', 4, 'A')], False, False),
    ('play-kachinuki-rr-3', [team('Kachinuki', 'Round Robin', 3, 'A')], False, False),
    ('play-rr-4-court-b', [{'name': 'Juniors', 'format': 'Round Robin', 'court': 'B', 'entrants': people('J', 4)}], False, True),
    ('play-team5-se-2-court-b', [team('5-Person Team', 'Single Elimination', 2, 'B')], False, True),
]
SCENARIOS = {
    'individual-rr-actions': individual_rr_actions,
    'team-playoff': team_playoff,
    **{name: (lambda browser, errors, n=name, e=entries, d=draws, b=court_b: play_through(browser, errors, n, e, d, b))
       for name, entries, draws, court_b in PLAY_THROUGHS},
}
# Checks without a snapshot file.
CHECKS = {'live-scores-module-missing': live_scores_module_missing}


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
            assert ELEMENTS_SEEN[0], 'React never rendered anything on Live Scores'
            # (Not reachable from these runs: a complete division without placements.)
            expected = {
                'live: courts', 'live: complete', 'complete: placements',
                'court A: idle', 'court B: idle', 'court A: individual', 'court B: individual', 'court A: team', 'court B: team',
                'court A: kachinuki', 'court B: kachinuki',
                'individual: next', 'individual: no next', 'individual: points', 'team: next', 'team: no next', 'team: playoff row',
                'kachinuki: next', 'kachinuki: no next',
                'court A: complete',  # F16: a finished division's placements in its court's card
            }
            assert expected <= VARIANTS_SEEN, f'Live Scores variants not covered: {sorted(expected - VARIANTS_SEEN)}'
        assert not errors, '\n'.join(errors)
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} Live Scores = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
