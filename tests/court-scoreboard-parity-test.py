"""The React court scoreboard (app/react/court/, roadmap M.8) draws exactly what the legacy
renderer drew.

Two offline copies of the app get the same tournament and the same court actions: one with
the React island (the built app), one without its module script (the legacy renderer). After
every action the match display (#score .scoreboard-match: elements, ids, classes, test IDs,
text, select values) and the court screen read-out must be identical:
  * an individual round robin: points, hansoku (two give the opponent a point), undo, redo,
    Next Match, to the end of the division;
  * a 3-person team match with three drawn bouts: the representative playoff and its picker
    (placeholder, choosing, read-only once scored).
"""
import re
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp
from ksm_browser import DIST, launch_chromium, load_app

SNAPSHOT_JS = """() => {
  const walk = n => {
    if (n.nodeType === 3) return n.textContent.trim() ? n.textContent : null;
    if (n.nodeType !== 1) return null;
    const attrs = ['id', 'class', 'data-testid', 'aria-hidden'].map(a => n.getAttribute(a) || '');
    const value = n.tagName === 'SELECT' || n.tagName === 'OPTION' ? n.value : '';
    return [n.tagName, ...attrs, value, ...[...n.childNodes].map(walk).filter(x => x !== null)];
  };
  return walk(document.querySelector('#score .scoreboard-match'));
}"""


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i + 1}', 'seed': '', 'status': 'Checked'} for i in range(n)]


def legacy_html():
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    court = re.search(r'<script type="module"[^>]*src="/assets/index-[\w-]+\.js"></script>\n?', html)
    assert court, 'dist/index.html: no court module script'
    return html.replace(court.group(0), '')


def open_pair(browser, entries):
    react = KsmApp(browser.new_page(), 'React')
    load_app(react.page)
    legacy = KsmApp(browser.new_page(), 'Legacy')
    load_app(legacy.page, html=legacy_html())
    assert react.page.evaluate('window.ksmReactScoreboard === true'), 'React: scoreboard island not active'
    assert legacy.page.evaluate('window.ksmReactScoreboard !== true'), 'Legacy: scoreboard island active'
    for app in (react, legacy):
        app.configure(entries)
        app.open_court('A')
    return react, legacy


def compare(react, legacy, step):
    got = [(app.page.evaluate(SNAPSHOT_JS), app.court_screen()) for app in (react, legacy)]
    assert got[0][1] == got[1][1], f'{step}: court screen differs\n  React:  {got[0][1]}\n  Legacy: {got[1][1]}'
    assert got[0][0] == got[1][0], f'{step}: scoreboard differs\n  React:  {got[0][0]}\n  Legacy: {got[1][0]}'
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

        assert not errors, '\n'.join(errors)
        print(f'PASS React court scoreboard = legacy renderer (individual RR, team playoff) in {time.time() - started:.0f}s')
        browser.close()


if __name__ == '__main__':
    main()
