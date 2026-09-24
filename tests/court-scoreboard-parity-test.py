"""The React court islands (app/react/court/, roadmap M.8) draw exactly what the legacy
renderer drew: the scoreboard (step 1) and the header (step 2).

Two offline copies of the app get the same tournament and the same court actions: one with
the React islands (the built app), one without their module script (the legacy renderer).
After every action the match display (#score .scoreboard-match) and the header
(#score .scoreboard-header: logo, tournament name, court title, division select and its
options, division title, match line), compared as elements, ids, classes, test IDs, src/alt,
text and select values, and the court screen read-out must be identical:
  * an individual round robin: points, hansoku (two give the opponent a point), undo, redo,
    Next Match, to the end of the division;
  * a 3-person team match with three drawn bouts: the representative playoff and its picker
    (placeholder, choosing, read-only once scored);
  * three divisions on two courts (Court A, Court B, one split across both): the tournament
    name, switching division with the select (also to a completed one and back), scoring in
    the split division on both courts, finishing Court B's division (the division-complete
    screen keeps the last match line).
The React copy must really render both islands (React fiber on their elements).
"""
import re
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp
from ksm_browser import DIST, launch_chromium, load_app

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
TREES = {'scoreboard': '#score .scoreboard-match', 'header': '#score .scoreboard-header'}
FIBER_JS = "id => Object.keys(document.getElementById(id)).some(k => k.startsWith('__reactFiber'))"


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i + 1}', 'seed': '', 'status': 'Checked'} for i in range(n)]


def legacy_html():
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    court = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert court, 'dist/index.html: no court module script'
    return html.replace(court.group(0), '')


def open_pair(browser, entries, court='A', tournament_name=None):
    react = KsmApp(browser.new_page(), 'React')
    load_app(react.page)
    legacy = KsmApp(browser.new_page(), 'Legacy')
    load_app(legacy.page, html=legacy_html())
    for flag in ('ksmReactScoreboard', 'ksmReactCourtHeader'):
        assert react.page.evaluate(f'window.{flag} === true'), f'React: {flag} not set'
        assert legacy.page.evaluate(f'window.{flag} !== true'), f'Legacy: {flag} set'
    for app in (react, legacy):
        if tournament_name:
            app.page.evaluate('name => { tName.value = name; }', tournament_name)
        app.configure(entries)
        app.open_court(court)
    # React, not the legacy renderer, draws both islands' elements.
    for el in ('scoreTournamentName', 'courtTitle', 'scoreDiv', 'scoreDivisionTitle', 'matchMeta', 'whiteName', 'redPts'):
        assert react.page.evaluate(FIBER_JS, el), f'React: #{el} is not rendered by React'
        assert not legacy.page.evaluate(FIBER_JS, el), f'Legacy: #{el} is rendered by React'
    return react, legacy


def compare(react, legacy, step):
    got = [({name: app.page.evaluate(SNAPSHOT_JS, root) for name, root in TREES.items()}, app.court_screen()) for app in (react, legacy)]
    assert got[0][1] == got[1][1], f'{step}: court screen differs\n  React:  {got[0][1]}\n  Legacy: {got[1][1]}'
    for name in TREES:
        assert got[0][0][name] == got[1][0][name], f'{step}: {name} differs\n  React:  {got[0][0][name]}\n  Legacy: {got[1][0][name]}'
    return got[0][1]


def both(react, legacy, step, action):
    for app in (react, legacy):
        action(app)
    return compare(react, legacy, step)


def main():
    started = time.time()
    with sync_playwright() as p:
        browser = launch_chromium(p)
        errors = []

        # --- Individual round robin: every court action, to the end of the division ---------
        react, legacy = open_pair(browser, [{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
        for app in (react, legacy):
            app.page.on('pageerror', lambda e, n=app.name: errors.append(f'{n}: {e}'))
        compare(react, legacy, 'first match')
        steps = [
            ('white Men', lambda a: a.score_point('W', 'M')),
            ('red Kote', lambda a: a.score_point('R', 'K')),
            ('white hansoku', lambda a: a.hansoku('W')),
            ('second white hansoku', lambda a: a.hansoku('W')),
            ('undo', lambda a: a.undo()),
            ('redo', lambda a: a.redo()),
            ('next match', lambda a: a.next_match()),
            ('red Do', lambda a: a.score_point('R', 'D')),
            ('red Tsuki', lambda a: a.score_point('R', 'T')),
            ('next match', lambda a: a.next_match()),
            ('white Kote', lambda a: a.score_point('W', 'K')),
        ]
        for step, action in steps:
            both(react, legacy, step, action)
        screen = both(react, legacy, 'last next match', lambda a: a.next_match())
        assert screen['complete'], f'division should be complete: {screen}'

        # --- Team match with three drawn bouts: representative playoff ----------------------
        react, legacy = open_pair(browser, [{'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'teams': 2, 'court': 'A'}])
        for app in (react, legacy):
            app.page.on('pageerror', lambda e, n=app.name: errors.append(f'{n}: {e}'))
        compare(react, legacy, 'first bout')
        for bout in range(3):
            screen = both(react, legacy, f'drawn bout {bout + 1}', lambda a: a.next_match())
        pick = 'court-white-name'
        assert react.page.locator(f'#score [data-testid="{pick}"] [data-testid="representative-select"]').count() == 1, \
            f'expected a representative playoff with a picker after three drawn bouts: {screen}'
        roster = react.page.eval_on_selector(f'#score [data-testid="{pick}"] select', 'el => [...el.options].map(o => o.value).filter(Boolean)')
        assert roster, 'representative picker without a roster'
        both(react, legacy, 'white representative',
             lambda a: a.page.select_option(f'#score [data-testid="{pick}"] select', roster[0]))
        both(react, legacy, 'red representative',
             lambda a: a.page.select_option('#score [data-testid="court-red-name"] select', index=1))
        both(react, legacy, 'playoff point', lambda a: a.score_point('W', 'M'))
        both(react, legacy, 'playoff undo', lambda a: a.undo())

        # --- Three divisions on two courts: header, division select, split division --------
        entries = [
            {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
            {'name': 'Women', 'format': 'Round Robin', 'court': 'B', 'entrants': people('W', 3)},
            {'name': 'Kids', 'format': 'Single Elimination', 'court': 'split', 'entrants': people('K', 4)},
        ]
        react, legacy = open_pair(browser, entries, tournament_name='Aloha Taikai')
        for app in (react, legacy):
            app.page.on('pageerror', lambda e, n=app.name: errors.append(f'{n}: {e}'))
        screen = compare(react, legacy, 'Court A')
        assert screen['court'] == 'A' and screen['options'] == ['Open', 'Kids'], f'Court A header: {screen}'
        name = react.page.text_content('#score [data-testid="court-tournament-name"]')
        assert name == 'Aloha Taikai', f'tournament name: {name!r}'
        steps = [
            ('A: white Men', lambda a: a.score_point('W', 'M')),
            ('A: switch to Kids', lambda a: a.switch_division('Kids')),
            ('A: Kids red Kote', lambda a: a.score_point('R', 'K')),
            ('A: Kids red Kote again', lambda a: a.score_point('R', 'K')),
            ('A: Kids next match', lambda a: a.next_match()),
            ('A: back to Open', lambda a: a.switch_division('Open')),
            ('Court B', lambda a: a.open_court('B')),
            ('B: white Do', lambda a: a.score_point('W', 'D')),
            ('B: switch to Kids', lambda a: a.switch_division('Kids')),
            ('B: Kids white Men', lambda a: a.score_point('W', 'M')),
            ('B: Kids undo', lambda a: a.undo()),
            ('B: back to Women', lambda a: a.switch_division('Women')),
        ]
        for step, action in steps:
            screen = both(react, legacy, step, action)
        assert screen['court'] == 'B' and screen['options'] == ['Women', 'Kids'], f'Court B header: {screen}'
        for n in range(8):  # white wins each bout: no tiebreak
            if screen['complete']:
                break
            both(react, legacy, f'B: Women white Men {n + 1}', lambda a: a.score_point('W', 'M'))
            screen = both(react, legacy, f'B: Women next match {n + 1}', lambda a: a.next_match())
        assert screen['complete'], f'Women should be complete on Court B: {screen}'
        both(react, legacy, 'B: complete, switch to Kids', lambda a: a.switch_division('Kids'))
        screen = both(react, legacy, 'B: back to the complete Women', lambda a: a.switch_division('Women'))
        assert screen['complete'], f'Women should still be complete: {screen}'
        both(react, legacy, 'Court A again', lambda a: a.open_court('A'))

        assert not errors, '\n'.join(errors)
        print(f'PASS React court scoreboard + header = legacy renderer (individual RR, team playoff, two courts + split division) in {time.time() - started:.0f}s')
        browser.close()


if __name__ == '__main__':
    main()
