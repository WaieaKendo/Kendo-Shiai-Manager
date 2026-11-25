"""The Pools tab's Regenerate regenerates the division in the dropdown (owner decision 3, #29).

Before: the small "Regenerate" button next to the Pools division select regenerated the whole
tournament (every division, after the generation check). Now it opens Regenerate Single Division
with the select's division chosen, with that dialog's checks and confirmations (Continue, then
Regenerate); the other divisions are untouched. A division that has started is not chosen (its
option is disabled), so Continue says no division is ready. Regenerating the whole tournament
stays with Generate Tournament.

Offline, through the UI (the tournament set up with the test API).
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def people(prefix, n):
    return [{'name': f'{prefix} Player {i}', 'dojo': f'Dojo {i % 3}', 'seed': '', 'status': 'Checked'} for i in range(1, n + 1)]


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        app.configure([
            {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('O', 4)},
            {'name': 'Kids', 'format': 'Round Robin', 'court': 'B', 'entrants': people('K', 3)},
        ])
        open_before = app.structure()['Open']
        app.nav('registration')
        app.click('reg-tab-pools')
        page.select_option(sel('pool-division-select'), label='Kids')

        page.locator('#poolsReg button', has_text='Regenerate').click()  # data-testid pools-regenerate
        page.wait_for_selector(f'{sel("regenerate-modal")}:not(.hidden)', timeout=5000)
        title = page.inner_text(sel('regenerate-modal-title'))
        assert title == 'Regenerate Division', f'Pools Regenerate did not open Regenerate Single Division: {title!r}'
        chosen = page.evaluate("""() => [...document.querySelectorAll('[data-testid="regenerate-option"]')]
          .filter(o => o.querySelector('[data-testid="regenerate-option-radio"]').checked)
          .map(o => o.querySelector('[data-testid="regenerate-option-name"]').textContent.trim())""")
        assert chosen == ['Kids'], f'the dropdown division is not preselected: {chosen}'
        app.click('regenerate-continue')
        assert page.inner_text(sel('regenerate-modal-title')) == 'Regenerate Kids?'
        app.click('regenerate-confirm')
        page.wait_for_function(f"document.querySelector('{sel('regenerate-modal-title')}')?.textContent.trim() === 'Division Regenerated'")
        app.click('regenerate-modal-close')
        assert app.structure()['Open'] == open_before, 'regenerating Kids changed Open'

        # A started division in the dropdown is not chosen: Continue refuses.
        app.page.evaluate("() => { KSMTest.prepareCourt('A'); KSMTest.play([['W','M'],['W','M']]); }")
        app.nav('registration')
        app.click('reg-tab-pools')
        page.select_option(sel('pool-division-select'), label='Open')
        app.click('pools-regenerate')
        page.wait_for_selector(f'{sel("regenerate-modal")}:not(.hidden)')
        chosen = page.evaluate("""() => [...document.querySelectorAll('[data-testid="regenerate-option-radio"]')].filter(r => r.checked).length""")
        assert chosen == 0, 'a started division (or another one) was preselected'
        app.expect_dialog('No division is ready', accept=True)
        app.click('regenerate-continue')
        app.wait_for_dialogs(1)
        assert app.structure()['Open']['matches'][0]['done'], 'the started division was regenerated'
        assert not problems, problems
        browser.close()
    print('PASS the Pools tab\'s Regenerate opens Regenerate Single Division with the dropdown\'s division chosen (a started one is not)')


if __name__ == '__main__':
    main()
