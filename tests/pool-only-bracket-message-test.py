"""A pool-only round robin does not promise a championship bracket (quirk pass).

A round robin of 3-5 players is one pool with no championship (its places come from the pool
standings, roadmap 0.2), but its bracket area (court screen context, Pools view, Results bracket
modal: all drawn from ksmBracket()) said "Championship bracket will appear after pools are
generated.", although the pools were generated and no bracket would ever appear. It now says
"No championship bracket: places come from the pool standings."; a division before generation
and a round robin with a championship are unchanged.

Offline: round robins of 4 (pool only) and 8 (pools + championship) generated through the test
API; Court A's context shows each one's bracket area.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

OLD = 'Championship bracket will appear after pools are generated.'
NEW = 'No championship bracket: places come from the pool standings.'


def people(prefix, n):
    return [{'name': f'{prefix}{i}', 'dojo': f'Dojo {i % 3}', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.configure([
            {'name': 'Small', 'format': 'Round Robin', 'court': 'A', 'entrants': people('S', 4)},
            {'name': 'Large', 'format': 'Round Robin', 'court': 'A', 'entrants': people('L', 8)},
        ])
        app.open_court('A')
        for division, expected in (('Small', NEW), ('Large', None)):
            app.switch_division(division)
            context = page.inner_text(sel('court-context'))
            assert OLD not in context, f'{division}: {context!r}'
            if expected:
                assert expected in context, f'{division}: {context!r}'
            else:
                assert NEW not in context, f'{division}: {context!r}'
        assert not problems, problems
        browser.close()
    print('PASS a pool-only round robin says it has no championship bracket')


if __name__ == '__main__':
    main()
