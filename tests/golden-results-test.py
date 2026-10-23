"""Golden (snapshot) test of the Results screen (#results, nav "Results"; roadmap M.13).

The Results screen shows a card per generated division (Completed: the placements from
resultPlacements(), the engine's rule, with "View Bracket" / "View Standings"; In Progress:
"Tournament in progress", or a team round robin's pairing count with "View Standings"), the
Special Awards editor (staff-editable inputs, "+ Add Award", "×") and the bracket modal
(#resultsBracketModal: a division's pools and championship bracket, single-elimination bracket,
team bracket or team standings with the pair results). The approved snapshots in
tests/golden/results/*.json were recorded from the LEGACY renderer (renderResultsDashboard(),
resultCardHtml(), awardsEditorHtml(), openResultsBracket() and completedResultDetailHtml() in
app/js/27-results-screen.js, with bracketHtml() and teamResultsBracketHtml() of
28-aligned-results-and-brackets.js), so they pin exactly what the legacy screen drew (quirks
included, see docs/ROADMAP.md "Results quirks kept").

One offline copy of the app runs each scenario; after every step the whole #results view (the
hero, the cards, the awards editor and the bracket modal) is serialized
(golden_screen.PANEL_JS: elements, attributes, text, visibility, innerText, each element's page
box per platform) and compared with the approved snapshot, together with the Results read-out
(KsmApp.placements()'s rows, read without navigating), the awards editor's input values and
which of them has the focus, state.awards, whether the modal is open, the page errors since the
step before and the dialogs shown. (Page errors are part of the snapshot; the awards editor's
handlers used to call an undefined saveAuto(), fixed as F11 on fix/pre-event.) While
Results is hidden its innerText is its textContent, i.e. the legacy templates' source
formatting, so the text is compared only while Results is shown (the tree always).

Since M.13 Results is drawn only by React (app/react/features/results/; app/js/38-react-results.js
publishes its data); the legacy renderer is removed, so this test pins the React-only screen.
React must render every element of the Results islands (app/react/features/results/: #resultsBody,
#resultsBracketBody; #resultsTournamentName and #resultsBracketTitle are React roots), and every
kind of Results content must be covered. awards-typing-stability (no snapshot) redraws Results
while an award is being typed: the input keeps its focus and text, the others show state.awards.
Last, the app without the React module script must show the "Results could not load" notice
instead of an empty screen (and a working page never shows it).

Results is redrawn by opening it (show('results') -> renderResultsDashboard()) and by
renderPools(), which every court action runs (the court's Next Match while Results is hidden),
so the scenarios use both:
  awards-rr-4         no tournament yet (empty Results), the tournament name, a pool-only round
                      robin of 4 (Court A) generated and in progress; the awards editor: + Add
                      Award, typing into each input (no blur: the typed text stays), Tab (the
                      change handler), a second award, × on the first, re-opened; phone
                      portrait and landscape; the division played through (Results after each
                      match), its card and bracket modal (opened by View Bracket, closed with ×
                      and Escape); a spectator's Results (the awards read-only: owner decision 8);
  play-*              whole divisions played through on Courts A and B (the court's next ready
                      match chosen as the golden engine test does, points and Next Match called
                      as the court buttons do) with Results opened after every match: pool-only
                      round robins of 3 and 5, RR 8 split (pools + championship), RR of draws
                      (tiebreaks), SE on one court and split, three divisions on two courts at
                      once, 3-person team SE on both courts (also the team award modes top1 and
                      dual3), team RR (View Standings while in progress), kachinuki SE and RR,
                      5-person team SE on Court B; every division's modal at the start (team
                      round robin), and at the end; phone portrait and landscape at the end;
                      a spectator's view.

Approve an intended change (review the JSON diff, commit it with the code change):

    KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-results-test.py [scenario ...]
"""
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from golden_screen import (
    ALL_COMPLETE_JS, ONLY, PANEL_FIBERS_JS, PANEL_JS, PLATFORM, PREPARE_JS, SPECTATOR_JS, UPDATE,
    Golden, geometry_recorded, match_points, people, team,
)
from ksm_app import KsmApp, _RESULTS_JS
from ksm_browser import DIST, launch_chromium, load_app

GOLDEN_DIR = Path(__file__).resolve().parent / 'golden' / 'results'
ROOT = '#results'
DESKTOP = {'width': 1280, 'height': 720}
PHONES = [('phone portrait', {'width': 390, 'height': 844}), ('phone landscape', {'width': 844, 'height': 390})]
# What a court's buttons call (app/js/10-court-scoring-and-history.js).
POINT_JS = "([side, letter]) => KSMTest.app.point(side, letter)"
NEXT_JS = "() => KSMTest.app.nextMatch()"
SHOW_RESULTS_JS = "() => KSMTest.show('results')"
VIEW_JS = f"() => !document.querySelector('{ROOT}').classList.contains('hidden')"
# The awards editor's inputs (values, which one has the focus), state.awards and the modal.
EDITOR_JS = """() => {
  const inputs = [...document.querySelectorAll('#results input')];
  const focused = inputs.indexOf(document.activeElement);
  return {
    values: inputs.map(i => i.value),
    focus: focused >= 0 ? focused : null,
    awards: JSON.parse(JSON.stringify(KSMTest.app.state.awards || [])),
    modal: !document.getElementById('resultsBracketModal').classList.contains('hidden'),
  };
}"""
AWARD_INPUT = '#results .award-edit-row:nth-child({row}) input[aria-label="{label}"]'
ADD_AWARD = '#results .award-add-row button'
REMOVE_AWARD = '#results .award-edit-row:nth-child({row}) .award-remove'
CARD_BUTTON = '#results [data-testid="result-card"]:has([data-testid="result-card-title"]:text-is("{div}")) .view-bracket-link'
CLOSE_MODAL = '#resultsBracketModal .results-modal-head button'
DIVISIONS_JS = "() => [...document.querySelectorAll('#results [data-testid=\"result-card-title\"]')].map(t => t.textContent)"
NO_TRANSITIONS = '*, *::before, *::after { transition: none !important; animation: none !important; }'
BUTTONS_JS = "() => [...document.querySelectorAll('#results [data-testid=\"result-card\"]')].filter(c => c.querySelector('.view-bracket-link')).map(c => c.querySelector('[data-testid=\"result-card-title\"]').textContent)"


# The Results islands (app/react/features/results/main.tsx): React renders every element of the two
# bodies, and the two text-only islands are React roots.
ISLANDS = ['#results #resultsBody', '#resultsBracketModal #resultsBracketBody']
ROOTS_JS = """() => ['#resultsBody', '#resultsTournamentName', '#resultsBracketTitle', '#resultsBracketBody']
  .filter(s => !Object.keys(document.querySelector(s)).some(k => k.startsWith('__reactContainer')))"""
# Which kinds of Results content the React islands were given.
VARIANTS_JS = """() => {
  const d = window.ksmResultsInput, b = window.ksmResultsBracketInput, out = [];
  if (d && d.kind === 'results') {
    if (d.noDivisions) out.push('results: no divisions');
    [...d.completed, ...d.pending].forEach(c => out.push('card: ' + (c.placements ? `${c.placements.length} placements` : c.roundRobin ? 'round robin in progress' : 'in progress')));
    out.push('awards: ' + (d.awards.length ? 'some' : 'none'));
  }
  if (b && b.kind === 'bracket') {
    out.push('detail: ' + b.detail.kind + ' ' + b.detail.bracket.kind);
    if (b.detail.bracket.kind === 'team-standings') out.push('team standings: ' + (b.detail.bracket.standings.pairs ? 'pairs' : 'no pairs'));
  }
  return out;
}"""
VARIANTS_SEEN = set()
ELEMENTS_SEEN = [0]  # most React-rendered elements seen in the Results islands


def check_react(golden, step):
    """React renders every element of the Results islands."""
    page = golden.app.page
    for island in ISLANDS:
        total, owned = page.evaluate(PANEL_FIBERS_JS, island)
        assert total == owned, f'{golden.name}: {step}: {total - owned} of {total} elements in {island} are not rendered by React'
        ELEMENTS_SEEN[0] = max(ELEMENTS_SEEN[0], owned)
    missing = page.evaluate(ROOTS_JS)
    assert not missing, f'{golden.name}: {step}: not React roots: {missing}'
    VARIANTS_SEEN.update(page.evaluate(VARIANTS_JS))


def capture(app):
    """Results: (serialization, element boxes)."""
    page = app.page
    # A fixed bracket overlay is positioned in the viewport. Browser scroll anchoring
    # after phone resizes must not turn its page-coordinate snapshot into a scroll race.
    panel = page.evaluate('root => { window.scrollTo({top:0,left:0,behavior:"instant"}); return (' + PANEL_JS + ')(root); }', ROOT)
    errors, app.page_errors[:] = list(app.page_errors), []
    shown = page.evaluate(VIEW_JS)
    entry = {
        'placements': page.evaluate(_RESULTS_JS),
        'shown': shown,
        'editor': page.evaluate(EDITOR_JS),
        'pageErrors': errors,
        # innerText of a hidden view is its textContent: the source formatting of the legacy
        # templates (whitespace between tags), not what a page shows. The tree has every text.
        'results': {'tree': panel['tree'], 'text': panel['text'] if shown else None},
    }
    return entry, {'results': panel['boxes']}


def open_app(name, browser, errors, entries=None):
    app = KsmApp(browser.new_page(viewport=DESKTOP), name)
    # Page errors are part of each step's snapshot (capture()), not failures.
    app.page_errors = []
    load_app(app.page)
    # Buttons lift on hover with a transition (01-base.css); without transitions a box is where
    # the mouse left it, not somewhere in between.
    app.page.add_style_tag(content=NO_TRANSITIONS)
    golden = Golden(name, app, app.page_errors, GOLDEN_DIR, capture, check_react)
    app.wait_for(lambda: app.page.evaluate('window.ksmResultsMounted === true'), message=f'{name}: Results islands mounted')
    assert app.page.locator('#resultsModuleMissing').count() == 0, f'{name}: "Results could not load" shown on a working page'
    if entries:
        app.configure(entries)
    return golden


def press(app, selector):
    """Click a button as a tap does, without moving the mouse: a button under the mouse lifts on
    :hover, and Chromium updates the hover state on a timer after the page changes."""
    app.page.locator(selector).evaluate('e => e.click()')


def phone_views(g, label):
    for step, size in PHONES:
        g.do(f'{label}: {step}', lambda a, s=size: a.page.set_viewport_size(s))
    g.app.page.set_viewport_size(DESKTOP)


def open_modal(g, div, label=''):
    """View Bracket / View Standings on the division's card, then close it (× and Escape)."""
    g.do(f'{label}{div}: open the bracket', lambda a: press(a, CARD_BUTTON.format(div=div)))
    g.do(f'{label}{div}: close with ×', lambda a: press(a, CLOSE_MODAL))


def type_award(g, row, label, text):
    g.do(f'award {row}: type {label}', lambda a: a.page.fill(AWARD_INPUT.format(row=row, label=label), text))
    g.do(f'award {row}: Tab out of {label}', lambda a: a.page.press(AWARD_INPUT.format(row=row, label=label), 'Tab'))


def play_all(g, name, draws=False, label=''):
    """Every division to the end on Courts A and B, Results opened after every match."""
    page = g.app.page
    played = 0
    for _ in range(300):
        progressed = False
        for court in ('A', 'B'):
            m = page.evaluate(PREPARE_JS, court)  # opens the court screen
            if not m:
                continue
            progressed = True
            for side, letter in match_points(m, draws):
                page.evaluate(POINT_JS, [side, letter])
            # nextMatch() runs renderPools(), which redraws Results (hidden).
            g.do(f"{label}Court {court} match {played + 1} ({m['white']} v {m['red']}): next match (Results hidden)",
                 lambda a: a.page.evaluate(NEXT_JS))
            g.do(f'{label}Court {court} match {played + 1}: Results', lambda a: a.page.evaluate(SHOW_RESULTS_JS))
            played += 1
        if not progressed:
            break
    assert page.evaluate(ALL_COMPLETE_JS), f'{name}: not every division is complete after {played} matches'
    return played


# ---------------------------------------------------------------------------------- scenarios
def awards_rr_4(browser, errors):
    g = open_app('awards-rr-4', browser, errors)
    page = g.app.page
    g.do('no tournament yet', lambda a: a.nav('results'))
    g.do('tournament name', lambda a: a.page.evaluate("() => { tName.value = 'Aiea Taikai'; KSMTest.show('results'); }"))
    g.app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 4)}])
    g.do('generated', lambda a: a.nav('results'))
    # The awards editor.
    g.do('+ Add Award', lambda a: press(a, ADD_AWARD))
    g.do('Results opened again', lambda a: a.nav('results'))
    type_award(g, 1, 'Award name', 'Best Kiai')
    type_award(g, 1, 'Recipient name', 'P 2')
    type_award(g, 1, 'Dojo', 'P Dojo 2')
    g.do('type without leaving the input', lambda a: a.page.fill(AWARD_INPUT.format(row=1, label='Award name'), 'Best Kiai <&>'))
    g.do('leave the input', lambda a: a.page.evaluate('() => document.activeElement.blur()'))
    g.do('+ Add Award again', lambda a: press(a, ADD_AWARD))
    g.do('Results opened again (two awards)', lambda a: a.nav('results'))
    type_award(g, 2, 'Recipient name', 'P 3')
    phone_views(g, 'two awards')
    g.do('× on the first award', lambda a: press(a, REMOVE_AWARD.format(row=1)))
    g.do('Results opened again (one award)', lambda a: a.nav('results'))
    # The division played through, Results after every match.
    play_all(g, 'awards-rr-4')
    g.do('complete', lambda a: a.page.evaluate(SHOW_RESULTS_JS))
    g.do('Open: open the bracket', lambda a: press(a, CARD_BUTTON.format(div='Open')))
    g.do('Open: close with ×', lambda a: press(a, CLOSE_MODAL))
    g.do('Open: open the bracket again', lambda a: press(a, CARD_BUTTON.format(div='Open')))
    g.do('Open: bracket on a phone', lambda a: a.page.set_viewport_size(PHONES[0][1]))
    page.set_viewport_size(DESKTOP)
    g.do('Open: close with Escape', lambda a: a.page.keyboard.press('Escape'))
    phone_views(g, 'complete')
    # Owner decision 8 (#29): a spectator sees the awards read-only (the steps that typed into a
    # spectator's award input and pressed + Add Award have nothing to press any more).
    g.do('spectator (the awards read-only)', lambda a: (a.page.evaluate(SPECTATOR_JS), a.page.evaluate(SHOW_RESULTS_JS)))
    g.do('spectator: Results opened again', lambda a: a.page.evaluate(SHOW_RESULTS_JS))
    g.do('spectator: Open: open the bracket', lambda a: press(a, CARD_BUTTON.format(div='Open')))
    g.do('spectator: Open: close with ×', lambda a: press(a, CLOSE_MODAL))
    g.finish()


def play_through(browser, errors, name, entries, draws=False, award_modes=False):
    """Play every division to the end with Results opened after every match."""
    g = open_app(name, browser, errors, entries)
    page = g.app.page
    g.do('start', lambda a: a.nav('results'))
    for div in page.evaluate(BUTTONS_JS):  # in progress: only a team round robin has a button
        open_modal(g, div, 'start: ')
    play_all(g, name, draws)
    g.do('complete', lambda a: a.page.evaluate(SHOW_RESULTS_JS))
    for div in page.evaluate(DIVISIONS_JS):
        open_modal(g, div, 'complete: ')
    if award_modes:
        for mode in ('top1', 'dual3', 'top2'):
            # The division awards operation used by Setup, then Results.
            g.do(f'team award mode {mode}', lambda a, m=mode: a.page.evaluate("mode => { KSMTest.updateTeamDivision('Team Tournament',{awardMode:mode}); KSMTest.show('results'); }", m))
    phone_views(g, 'complete')
    g.do('spectator', lambda a: (a.page.evaluate(SPECTATOR_JS), a.page.evaluate(SHOW_RESULTS_JS)))
    g.finish()


PLAY_THROUGHS = [
    ('play-rr-3', [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}], False, False),
    ('play-rr-5-court-b', [{'name': 'Juniors', 'format': 'Round Robin', 'court': 'B', 'entrants': people('J', 5)}], False, False),
    ('play-rr-8-split', [{'name': 'Open', 'format': 'Round Robin', 'court': 'split', 'entrants': people('P', 8)}], False, False),
    ('play-rr-6-draws', [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('D', 6)}], True, False),
    ('play-se-6-court-a', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('S', 6)}], False, False),
    ('play-se-8-split', [{'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('E', 8)}], False, False),
    ('play-three-divisions', [
        {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
        {'name': 'Women', 'format': 'Round Robin', 'court': 'B', 'entrants': people('W', 3)},
        {'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('K', 4)},
    ], False, False),
    ('play-team-se-4-both', [team('3-Person Team', 'Single Elimination', 4, 'Both')], False, True),
    ('play-team-rr-3', [team('3-Person Team', 'Round Robin', 3, 'A')], False, False),
    ('play-kachinuki-se-4', [team('Kachinuki', 'Single Elimination', 4, 'A')], False, False),
    ('play-kachinuki-rr-3', [team('Kachinuki', 'Round Robin', 3, 'A')], False, False),
    ('play-team5-se-2-court-b', [team('5-Person Team', 'Single Elimination', 2, 'B')], False, False),
]
SCENARIOS = {
    'awards-rr-4': awards_rr_4,
    **{name: (lambda browser, errors, n=name, e=entries, d=draws, m=modes: play_through(browser, errors, n, e, d, m))
       for name, entries, draws, modes in PLAY_THROUGHS},
}
def awards_typing_stability(browser, errors):
    """Results drawn again while an award is being typed: the input keeps its focus and text.

    The legacy screen redrew #resultsBody with innerHTML, so a redraw (e.g. a spectator's live
    update) replaced the input being typed in: focus and text were lost. (A staff device defers
    live updates while an input has the focus, and nothing else redraws Results meanwhile.) The
    React inputs are kept; the others show state.awards as a redrawn legacy input did.
    """
    app = KsmApp(browser.new_page(viewport=DESKTOP), 'awards typing')
    page = app.page
    page_errors = []
    page.on('pageerror', lambda e: page_errors.append(str(e)))
    load_app(page)
    app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
    page.evaluate("() => { KSMTest.app.state.awards = [{award: 'Fighting Spirit', name: 'P 1', dojo: 'D 1'}, {award: 'Kantosho', name: '', dojo: ''}]; }")
    app.nav('results')
    award = AWARD_INPUT.format(row=1, label='Award name')
    page.fill(award, 'Best Ki')
    page.evaluate("() => { KSMTest.app.state.awards[0].name = 'P 2'; KSMTest.app.state.awards[1].dojo = 'Other Dojo'; KSMTest.app.renderResultsDashboard(); }")
    got = page.evaluate(EDITOR_JS)
    assert got['focus'] == 0 and got['values'][:3] == ['Best Ki', 'P 2', 'D 1'] and got['values'][5] == 'Other Dojo', \
        f'a redraw while typing: {got}'
    page.type(award, 'ai')
    page.press(award, 'Tab')
    got = page.evaluate(EDITOR_JS)
    assert got['awards'][0]['award'] == 'Best Kiai' and got['focus'] == 1, f'the typed award after Tab: {got}'
    # A redraw with nothing typed shows state.awards again (no stale text kept).
    page.evaluate("() => { KSMTest.app.state.awards[0].award = 'Changed elsewhere'; document.activeElement.blur(); KSMTest.app.renderResultsDashboard(); }")
    got = page.evaluate(EDITOR_JS)
    assert got['values'][0] == 'Changed elsewhere' and got['focus'] is None, f'a redraw without focus: {got}'
    assert page_errors == [], f'page errors in the awards editor (F11 fixed: saveAuto() is defined): {page_errors}'
    page.close()


def without_screens_module():
    """dist/index.html without the React screens' module script (as a device whose copy lacks it)."""
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    module = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert module, 'dist/index.html: no module script'
    return html.replace(module.group(0), '')


def results_module_missing(browser, errors):
    """Without the React module nothing draws Results: it says so instead."""
    app = KsmApp(browser.new_page(viewport=DESKTOP), 'no React module')
    page = app.page
    page.on('pageerror', lambda e: errors.append(f'Results module missing: {e}'))
    load_app(page, html=without_screens_module())
    app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
    app.nav('results')
    notice = page.locator('#results [data-testid="results-module-missing"]')
    assert notice.is_visible(), 'no "Results could not load" notice without the React module'
    assert 'Results could not load' in notice.inner_text(), notice.inner_text()
    assert not page.locator('#resultsBody').is_visible(), 'the empty Results body is shown without the React module'
    assert page.evaluate('window.ksmResultsInput.kind') == 'results', 'renderResultsDashboard() did not publish without the islands'
    page.close()


# Checks without a snapshot file.
CHECKS = {'awards-typing-stability': awards_typing_stability, 'results-module-missing': results_module_missing}


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
            assert ELEMENTS_SEEN[0], 'React never rendered anything on Results'
            expected = {
                'results: no divisions', 'card: in progress', 'card: round robin in progress',
                'card: 1 placements', 'card: 2 placements', 'card: 3 placements', 'card: 4 placements',
                'awards: none', 'awards: some',
                'detail: pools cards', 'detail: pools message', 'detail: bracket cards', 'detail: bracket team-bracket',
                'detail: bracket team-standings', 'team standings: pairs',
            }
            assert expected <= VARIANTS_SEEN, f'Results variants not covered: {sorted(expected - VARIANTS_SEEN)}; seen {sorted(VARIANTS_SEEN)}'
        assert not errors, '\n'.join(errors)
        browser.close()
    note = f'; element boxes not recorded for {PLATFORM} in {len(missing_geometry)} scenario(s), compared without them' if missing_geometry else ''
    verb = 'UPDATED' if UPDATE else 'PASS'
    print(f'{verb} Results = approved snapshots ({", ".join(chosen)}){note}'
          f'{"; " + ", ".join(checks) if checks else ""} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
