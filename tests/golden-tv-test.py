"""Golden (snapshot) test of the TV display (?view=tv, body.ksm-tv; roadmap M.13).

A TV device shows one court (the link's &court=, KSM_TV_ASSIGNED_COURT) on a fixed 1920x1080
canvas (#tvLive: tv-canvas with the header, current match and Upcoming Matches zones), follows
the division its court is on and shows a completed division's final results. The approved
snapshots in tests/golden/tv/*.json were recorded from the LEGACY renderer (renderTvDisplay() and
the tv3 renderer in app/js/26-tv-display.js, with tvUpcomingMatches(), tvIndividualSideLabel() and
tvTeamNodeEntries() of 25-live-scores.js), so they pin exactly what the legacy TV drew (quirks
included, see docs/ROADMAP.md "TV quirks kept").

One offline copy of the app per scenario runs as a TV device: body.ksm-tv, show('tv'), and
tvAssignedCourt() from the page URL (?court=A or ?court=B). The court is scored in the same page
(a TV gets the same state from the live update), and the TV is redrawn both ways the app does
it: explicitly, as a live update does (applyRemoteCloudRecord() -> renderTvDisplay()), and by
the court's own render (renderScore() -> renderPublic(), which redraws the TV on a TV device).
After every step the whole #tv view is serialized (golden_screen.PANEL_JS: elements, attributes,
text, visibility, innerText, each element's page box per platform) and compared with the
approved snapshot, together with the TV read-outs (KsmApp.tv_screen(), tv_upcoming()), the
page's scroll size and the dialogs shown. React must render every element in #tvLive (the Tv
island, app/react/tv/; app/js/37-react-tv.js publishes its data), and every kind of TV content
must be covered.

  tv-a-actions        no tournament yet (idle), then a round robin on Court A scored on the court
                      screen (points, hansoku, undo, redo, Fusen-gachi, Next Match), each seen on
                      the TV after the update, to the Final Results; a spectator's TV; other
                      screen sizes (1280x720, 3840x2160) live and on the Final Results;
  tv-a-team-playoff   a 3-person team match with three drawn bouts, the representative playoff;
  tv-*-follow         the court's division changed on the court screen: the TV follows it, also
                      away from and back to a completed division's Final Results;
  play-*              whole divisions played through on Courts A and B with a Court A or Court B
                      TV (the court's next ready match chosen as the golden engine test does,
                      points and Next Match called as the court buttons do): individual RR split,
                      RR of draws (pool tiebreaks), SE on one court and split (bracket
                      placeholders in Upcoming Matches), three divisions on two courts, 3-person
                      team SE on both courts, team RR, kachinuki SE and RR, an RR and a 5-person
                      team SE on Court B only; the first match also at 1280x720 and 3840x2160.

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-tv-test.py [scenario ...]
"""
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import (
    ALL_COMPLETE_JS, FIBER_JS, ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, PREPARE_JS, SPECTATOR_JS, UPDATE,
    Golden, geometry_recorded, match_points, people, team,
)
from ksm_app import KsmApp
from ksm_browser import launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'tv'
ROOT = '#tv'
TV = {'width': 1920, 'height': 1080}
OTHER_SIZES = [('1280x720', {'width': 1280, 'height': 720}), ('3840x2160', {'width': 3840, 'height': 2160})]
# A TV device as initializeCloudRoleFromUrl() (33-) sets it up for ?view=tv.
TV_MODE_JS = "() => { document.body.classList.add('ksm-tv'); renderTvDisplay(); show('tv'); }"
# What a live update does on a TV device (applyRemoteCloudRecord(), 21-): redraw the TV.
TV_UPDATE_JS = "() => { renderTvDisplay(); show('tv'); }"
POINT_JS = "([side, letter]) => point(side, letter)"
NEXT_JS = "() => nextMatch()"
# The court screen's division select (CourtHeader -> selectScorekeeperDivision()).
SWITCH_JS = "([court, division]) => { chooseCourt(court); selectScorekeeperDivision(division); }"
SCROLL_JS = "() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]"
LIVE = '#tv #tvLive'
# Which kinds of TV content the React island was given.
VARIANTS_JS = """() => {
  const d = window.ksmTvInput, out = [];
  if (!d || d.kind !== 'tv') return out;
  const b = d.body;
  out.push(`court ${d.court}: ${b.kind}`);
  if (b.kind === 'idle') out.push(d.division === 'No active match' ? 'idle: no division' : 'idle: division');
  if (b.kind !== 'results') d.upcoming.forEach(c => out.push(c ? (c.whiteSub || c.redSub ? 'upcoming: card with sub' : 'upcoming: card') : 'upcoming: empty'));
  if (b.kind !== 'results' && d.upcoming.some(c => c && /^Winner/.test(c.white + ' ' + c.red))) out.push('upcoming: placeholder');
  if (b.kind === 'results') out.push('results: ' + (b.complete.placements.length ? 'placements' : 'no placements'));
  if (b.points && b.points.W.length + b.points.R.length) out.push(b.kind + ': points');
  if (b.kind === 'team' && b.rows.some(r => r.points.W.length + r.points.R.length)) out.push('team: points');
  if (b.kind === 'team') out.push(`team: ${b.rows.length <= 3 ? 'three' : 'five'} rows`, ...(b.rows.some(r => r.active) ? ['team: active bout'] : []));
  if (b.kind === 'kachinuki' && (b.wIndex || b.rIndex)) out.push('kachinuki: eliminated');
  return out;
}"""
VARIANTS_SEEN = set()
ELEMENTS_SEEN = [0]  # most React-rendered elements seen in #tvLive


def capture(app):
    """The TV: (serialization, element boxes)."""
    page = app.page
    panel = page.evaluate(PANEL_JS, ROOT)
    entry = {
        'tv': app.tv_screen(),
        'upcoming': app.tv_upcoming(),
        'scroll': page.evaluate(SCROLL_JS),
        'view': {'tree': panel['tree'], 'text': panel['text']},
    }
    return entry, {'tv': panel['boxes']}


def check_react(golden, step):
    """React renders every element of the TV (#tvLive and all in it)."""
    page = golden.app.page
    total, owned = page.evaluate(PANEL_FIBERS_JS, LIVE)
    assert total == owned, f'{golden.name}: {step}: {total - owned} of {total} TV elements are not rendered by React'
    if total:
        assert page.evaluate(FIBER_JS, f'{LIVE} > *'), f'{golden.name}: {step}: the TV is not rendered by React'
    ELEMENTS_SEEN[0] = max(ELEMENTS_SEEN[0], owned)
    VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))


def open_tv(name, browser, errors, court, entries=None, react_check=None):
    app = KsmApp(browser.new_page(viewport=TV), name)
    load_app(app.page, query=f'?court={court}')
    golden = Golden(name, app, errors, GOLDEN_DIR, capture, react_check)
    assert app.page.evaluate('tvAssignedCourt()') == court, f'{name}: the TV is not assigned to Court {court}'
    assert app.page.evaluate('window.ksmTvMounted === true'), f'{name}: the TV island did not mount'
    if entries:
        app.configure(entries)
    return golden


def tv_update(a):
    a.page.evaluate(TV_UPDATE_JS)


def other_sizes(g, label):
    for step, size in OTHER_SIZES:
        g.do(f'{label}: {step}', lambda a, s=size: a.page.set_viewport_size(s))
    g.app.page.set_viewport_size(TV)


def on_court(court, action):
    """Act on the court screen (as the court device does), then the TV's live update."""
    def run(a):
        a.page.evaluate("() => document.body.classList.remove('ksm-tv')")
        a.open_court(court)
        action(a)
        a.page.evaluate("() => document.body.classList.add('ksm-tv')")
        tv_update(a)
    return run


# ---------------------------------------------------------------------------------- scenarios
def tv_a_actions(browser, errors, react_check):
    g = open_tv('tv-a-actions', browser, errors, 'A', react_check=react_check)
    g.do('no tournament yet', lambda a: a.page.evaluate(TV_MODE_JS))
    g.app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
    g.do('generated', tv_update)
    other_sizes(g, 'generated')
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
        g.do(step, on_court('A', action))
    other_sizes(g, 'final results')
    g.do('spectator', lambda a: (a.page.evaluate(SPECTATOR_JS), tv_update(a)))
    g.finish()


def tv_a_team_playoff(browser, errors, react_check):
    g = open_tv('tv-a-team-playoff', browser, errors, 'A', [team('3-Person Team', 'Single Elimination', 2, 'A')], react_check)
    g.do('first bout', lambda a: a.page.evaluate(TV_MODE_JS))
    for bout in range(3):
        g.do(f'drawn bout {bout + 1}', on_court('A', lambda a: a.next_match()))
    page = g.app.page
    pick = '#score [data-testid="court-white-name"] select'

    def representative(side, index=None):
        def act(a):
            if side == 'white':
                roster = a.page.eval_on_selector(pick, 'el => [...el.options].map(o => o.value).filter(Boolean)')
                a.page.select_option(pick, roster[0])
            else:
                a.page.select_option('#score [data-testid="court-red-name"] select', index=index)
        return act

    g.do('white representative', on_court('A', representative('white')))
    assert page.evaluate("() => (state.allMatches['Team Tournament'] || []).some(m => m.type === 'teamPlayoff')"), \
        'expected a representative playoff after three drawn bouts'
    g.do('red representative', on_court('A', representative('red', 1)))
    g.do('playoff point', on_court('A', lambda a: a.score_point('W', 'M')))
    g.do('playoff undo', on_court('A', lambda a: a.undo()))
    g.do('playoff point again', on_court('A', lambda a: a.score_point('W', 'M')))
    g.do('playoff next match', on_court('A', lambda a: a.next_match()))
    g.finish()


def play_through(browser, errors, react_check, name, court, entries, draws=False, follow=()):
    """Play every division to the end on Courts A and B with the TV of `court` on screen.

    follow: (after match n, court, division) switches of a court's division on the court
    screen, each followed by the TV's update."""
    g = open_tv(name, browser, errors, court, entries, react_check)
    page = g.app.page
    g.do('start', lambda a: a.page.evaluate(TV_MODE_JS))
    played = 0
    pending = list(follow)
    for _ in range(300):
        progressed = False
        for c in ('A', 'B'):
            while pending and pending[0][0] == played:
                _, fc, division = pending.pop(0)
                g.do(f'Court {fc} switched to {division}', lambda a, x=[fc, division]: (a.page.evaluate(SWITCH_JS, x), tv_update(a)))
            m = page.evaluate(PREPARE_JS, c)  # opens the court screen (hidden on a TV)
            g.do(f'Court {c} {"match " + str(played + 1) if m else "idle"}', tv_update)
            if not m:
                continue
            progressed = True
            step = f"Court {c} match {played + 1} ({m['white']} v {m['red']})"
            for i, (side, letter) in enumerate(match_points(m, draws)):
                g.do(f'{step}: {side} {letter}', lambda a: a.page.evaluate(POINT_JS, [side, letter]))
                if played == 0 and i == 0:
                    other_sizes(g, step)
            g.do(f'{step}: next match', lambda a: a.page.evaluate(NEXT_JS))
            played += 1
        if not progressed:
            break
    assert page.evaluate(ALL_COMPLETE_JS), f'{name}: not every division is complete after {played} matches'
    g.do('complete', tv_update)
    g.do('spectator', lambda a: (a.page.evaluate(SPECTATOR_JS), tv_update(a)))
    g.finish()
    return played


THREE_DIVISIONS = [
    {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
    {'name': 'Women', 'format': 'Round Robin', 'court': 'B', 'entrants': people('W', 3)},
    {'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('K', 4)},
]
# name, TV court, entries, draws, follow
PLAY_THROUGHS = [
    ('play-rr-8-split-a', 'A', [{'name': 'Open', 'format': 'Round Robin', 'court': 'split', 'entrants': people('P', 8)}], False, ()),
    ('play-rr-8-split-b', 'B', [{'name': 'Open', 'format': 'Round Robin', 'court': 'split', 'entrants': people('P', 8)}], False, ()),
    ('play-rr-6-draws-a', 'A', [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('D', 6)}], True, ()),
    ('play-se-6-court-a', 'A', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('S', 6)}], False, ()),
    ('play-se-8-split-a', 'A', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('E', 8)}], False, ()),
    ('play-se-8-split-b', 'B', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('E', 8)}], False, ()),
    ('play-three-divisions-a', 'A', THREE_DIVISIONS, False, ()),
    ('play-three-divisions-b', 'B', THREE_DIVISIONS, False, ()),
    # The TV follows its court's division: Court A switched to Kids before Open is played out,
    # back to Open, and (after Open's last match) away from its Final Results and back.
    ('tv-a-follow', 'A', THREE_DIVISIONS, False, ((1, 'A', 'Kids'), (2, 'A', 'Open'), (5, 'A', 'Kids'), (5, 'A', 'Open'))),
    ('tv-b-follow', 'B', THREE_DIVISIONS, False, ((1, 'B', 'Kids'), (2, 'B', 'Women'), (6, 'B', 'Kids'), (6, 'B', 'Women'))),
    ('play-team-se-4-both-a', 'A', [team('3-Person Team', 'Single Elimination', 4, 'Both')], False, ()),
    ('play-team-se-4-both-b', 'B', [team('3-Person Team', 'Single Elimination', 4, 'Both')], False, ()),
    ('play-team-rr-3-a', 'A', [team('3-Person Team', 'Round Robin', 3, 'A')], False, ()),
    ('play-kachinuki-se-4-a', 'A', [team('Kachinuki', 'Single Elimination', 4, 'A')], False, ()),
    ('play-kachinuki-rr-3-a', 'A', [team('Kachinuki', 'Round Robin', 3, 'A')], False, ()),
    ('play-rr-4-court-b', 'B', [{'name': 'Juniors', 'format': 'Round Robin', 'court': 'B', 'entrants': people('J', 4)}], False, ()),
    ('play-team5-se-2-court-b', 'B', [team('5-Person Team', 'Single Elimination', 2, 'B')], False, ()),
]
SCENARIOS = {
    'tv-a-actions': tv_a_actions,
    'tv-a-team-playoff': tv_a_team_playoff,
    **{name: (lambda browser, errors, react_check, n=name, c=court, e=entries, d=draws, f=follow:
              play_through(browser, errors, react_check, n, c, e, d, f))
       for name, court, entries, draws, follow in PLAY_THROUGHS},
}


def covered():
    """Every kind of TV content was drawn by React."""
    assert ELEMENTS_SEEN[0], 'React never rendered anything on the TV'
    # (Not reachable from these runs: Final Results without placements, which the TV shows only
    # when the division has placements; an idle TV without a division, since even before a
    # tournament exists the court has the default setup's division; an Upcoming card without a
    # dojo or round under a name; a current match with a bracket placeholder, since a court only
    # plays ready matches.)
    expected = {
        'court A: idle', 'court B: idle', 'court A: individual', 'court B: individual', 'court A: team', 'court B: team',
        'court A: kachinuki', 'court A: results', 'court B: results', 'idle: division',
        'upcoming: card with sub', 'upcoming: placeholder', 'upcoming: empty', 'results: placements',
        'individual: points', 'team: points', 'kachinuki: points',
        'team: three rows', 'team: five rows', 'team: active bout', 'kachinuki: eliminated',
    }
    assert expected <= VARIANTS_SEEN, f'TV variants not covered: {sorted(expected - VARIANTS_SEEN)}; seen {sorted(VARIANTS_SEEN)}'


def main(react_check=check_react, checks=None, after=covered):
    started = time.time()
    chosen = [n for n in SCENARIOS if not ONLY or any(q in n for q in ONLY)]
    checks = {n: f for n, f in (checks or {}).items() if not UPDATE and (not ONLY or any(q in n for q in ONLY))}
    assert chosen or checks, f'no scenario matches {ONLY}'
    missing_geometry = [n for n in chosen if not UPDATE and not geometry_recorded(GOLDEN_DIR, n)]
    with sync_playwright() as p:
        browser = launch_chromium(p)
        errors = []
        for name in chosen:
            SCENARIOS[name](browser, errors, react_check)
            print(f'  {name}: ok')
        for name, check in checks.items():
            check(browser, errors)
            print(f'  {name}: ok')
        if after and not ONLY and not UPDATE:
            after()
        assert not errors, '\n'.join(errors)
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} TV display = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
