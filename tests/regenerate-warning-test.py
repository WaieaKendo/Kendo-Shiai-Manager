"""Whole-tournament regeneration: count, typed confirmation and download before redraw."""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def main():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for width in (1280, 375):
            page = browser.new_page(viewport={'width': width, 'height': 900})
            problems = []
            app = KsmApp.local(page, 'Director', problems=problems)
            app.answers['Create Staff password'] = ''
            app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': [
                {'name': f'Player {i}', 'dojo': f'Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(4)]}])

            def request():
                app.nav('registration')
                app.click('generate-button')
                page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
                app.click('generate-confirm')

            request()
            assert page.locator(sel('regenerate-warning')).count() == 0
            page.evaluate("() => { KSMTest.prepareCourt('A'); KSMTest.play([['W','M'],['W','M']]); }")
            before = app.payload()['state']['allMatches']
            count = sum(bool(m.get('done')) for ms in before.values() for m in ms)
            assert count > 0
            request()
            warning = page.locator(sel('regenerate-warning'))
            warning.wait_for()
            assert f'{count} finished matches' in warning.inner_text()
            assert '1 division (Open)' in warning.inner_text()
            button = page.locator(sel('regenerate-warning-confirm'))
            field = page.locator(sel('regenerate-warning-input'))
            assert button.is_disabled()
            field.fill('REGENERAT')
            field.press('Enter')
            assert button.is_disabled() and app.payload()['state']['allMatches'] == before
            app.click('regenerate-warning-cancel')
            assert app.payload()['state']['allMatches'] == before
            request()
            field.press('Escape')
            assert page.locator(sel('regenerate-warning')).count() == 0
            assert app.payload()['state']['allMatches'] == before
            request()
            field.fill(' regenerate ')
            assert button.is_enabled()
            box = warning.bounding_box()
            assert box['x'] >= 0 and box['x'] + box['width'] <= width
            # A failed backup must keep all results and display the error.
            page.evaluate("() => { window.originalCreateURL = URL.createObjectURL; URL.createObjectURL = () => { throw new Error('Backup failed'); }; }")
            button.click()
            warning.locator('[role=alert]').wait_for()
            assert app.payload()['state']['allMatches'] == before
            page.evaluate('() => { URL.createObjectURL = window.originalCreateURL; }')
            with page.expect_download() as download:
                field.press('Enter')
            import json
            with open(download.value.path()) as f:
                assert json.load(f)['state']['allMatches'] == before
            app.wait_for(lambda: not any(m.get('done') for ms in app.payload()['state']['allMatches'].values() for m in ms), message='redrawn after backup')
            assert not problems, problems
            page.close()
        browser.close()
    print('PASS regenerate warning at desktop and phone widths')


if __name__ == '__main__':
    main()
