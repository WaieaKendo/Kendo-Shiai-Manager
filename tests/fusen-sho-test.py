"""Fusen-gachi is shown as "Fusen-sho", and is disabled without a match (owner decision 4, #29).

Display text only: the court button and its dialog say "Fusen-sho" (the dialog asks who won, #38), and so does Developer Tools'
action history; the stored values are unchanged (the action label "Red Fusen-gachi" in the court
history, the F F points, the button's test ID), so saved tournaments are unaffected. Before, the
button stayed enabled on a court with no match (it then did nothing); now it is disabled there.

Offline: a round robin of 3 on Court A; Court B has nothing to play.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Court', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': [
            {'name': n, 'dojo': d, 'seed': '', 'status': 'Checked'} for n, d in (('Aki', 'Aiea'), ('Bo', 'Hilo'), ('Cy', 'Kona'))]}])
        button = page.locator(f'#score {sel("fusen-gachi")}')

        app.open_court('B')
        assert app.current_match() is None, app.court_screen()
        app.wait_for(lambda: button.is_disabled(), message='Fusen-sho disabled on a court with no match')
        assert button.inner_text().strip().endswith('Fusen-sho'), button.inner_text()

        app.open_court('A')
        assert app.current_match(), 'Court A has a match'
        app.wait_for(lambda: button.is_enabled(), message='Fusen-sho enabled with a match')
        assert 'Fusen-gachi' not in button.inner_text(), button.inner_text()
        button.click()
        page.wait_for_selector(sel('fusen-cancel'), state='visible')
        title = page.inner_text('#fusenTitle').strip()
        assert title == 'Fusen-sho — who won?', f'dialog title {title!r}'

        # #38: the dialog asks who WON. Two side buttons (White/Red over the fighter's name, with the
        # court's White/Red look) in the court's left/right order; Cancel is separate and quieter.
        match = app.current_match()
        white, red = page.locator(sel('fusen-white')), page.locator(sel('fusen-red'))
        assert white.inner_text().split() == ['White'] + match['white'].split(), white.inner_text()
        assert red.inner_text().split() == ['Red'] + match['red'].split(), red.inner_text()
        assert 'fusen-side-white' in white.get_attribute('class') and 'fusen-side-red' in red.get_attribute('class')
        cancel = page.locator(sel('fusen-cancel'))
        assert 'fusen-side' not in cancel.get_attribute('class') and cancel.locator('xpath=ancestor::*[contains(@class,"fusen-sides")]').count() == 0, 'Cancel must not sit among the side buttons'
        x = lambda loc: loc.bounding_box()['x']
        assert x(white) < x(red), 'default court: White on the left'
        assert cancel.bounding_box()['y'] > white.bounding_box()['y'] + white.bounding_box()['height'] - 1, 'Cancel is on its own row below'
        app.click('fusen-cancel')
        page.wait_for_selector(sel('fusen-cancel'), state='hidden')

        # Court A set to Red on the left: the buttons follow the court's order.
        page.evaluate("court1RedSide.value='left'; court1RedSide.dispatchEvent(new Event('change'))")
        app.click('fusen-gachi')
        page.wait_for_selector(sel('fusen-cancel'), state='visible')
        assert x(page.locator(sel('fusen-red'))) < x(page.locator(sel('fusen-white'))), 'Red on the left: the Red button is on the left'
        app.click('fusen-cancel')
        page.wait_for_selector(sel('fusen-cancel'), state='hidden')
        page.evaluate("court1RedSide.value='right'; court1RedSide.dispatchEvent(new Event('change'))")
        app.click('fusen-gachi')
        page.wait_for_selector(sel('fusen-cancel'), state='visible')

        # "White — <name>" records White as the winner: the stored result is the same as before
        # (the Red forfeit: label "Red Fusen-gachi", White gets F F), and the match is won by White.
        app.click('fusen-white')
        page.wait_for_selector(sel('fusen-cancel'), state='hidden')
        assert app.court_screen()['white_points'].replace(' ', '') == 'FF', app.court_screen()
        assert app.court_screen()['red_points'].strip() == '', app.court_screen()

        history = app.payload()['state']['courtActionHistory']['A']
        assert history[-1]['label'] == 'Red Fusen-gachi', f'the stored label changed: {history[-1]["label"]}'
        app.next_match()
        done = [m for m in app.payload()['state']['allMatches']['Open'] if m.get('done')]
        assert done and done[0]['completedResult']['winner'] == match['white'], f'White should be the winner: {done}'
        app.click('nav-save-load')
        app.click('nav-cloud-diagnostics')
        page.wait_for_selector(sel('cloud-modal'))
        text = page.inner_text(sel('cloud-modal'))
        assert 'Red Fusen-sho' in text and 'Fusen-gachi' not in text, f'Developer Tools history: {text}'
        app.click('cloud-modal-close')
        assert not problems, problems
        browser.close()
    print('PASS "Fusen-sho" on the court button, its dialog and Developer Tools (stored label unchanged); disabled without a match')


if __name__ == '__main__':
    main()
