"""Escape closes every pop-up (quirk pass).

Escape closed the open menu, Fusen-gachi and the Results bracket, but not the generation check,
Regenerate Single Division or the cloud modal (Tournament Access, Developer Tools, the Load
Tournament File confirmation), which closed only by their buttons (the cloud modal also by its
backdrop). Escape now closes those too, as their Close / Cancel does: nothing is generated or
regenerated.

Offline, through the UI: the generation check (Generate Tournament), Regenerate Single Division
(the list and the confirmation step) and Developer Tools (the status row) each close on Escape;
nothing was generated, no dialog or page error.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        for i in range(3):
            app.register(f'P{i}', 'Aiea', "Women’s Open")
        hidden = lambda testid: page.locator(sel(testid)).evaluate("el => el.classList.contains('hidden')")

        app.click('generate-button')
        page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
        page.keyboard.press('Escape')
        app.wait_for(lambda: hidden('validation-modal'), message='the generation check closed by Escape')
        assert not app.payload()['state'].get('generated'), 'Escape on the generation check generated the tournament'

        app.generate()
        app.wait_for(lambda: app.payload()['state'].get('generated'), message='generated')
        revision = app.structure()
        app.click('regenerate-division-button')
        page.wait_for_selector(f'{sel("regenerate-modal")}:not(.hidden)')
        page.keyboard.press('Escape')
        app.wait_for(lambda: hidden('regenerate-modal'), message='Regenerate Single Division closed by Escape')
        app.click('regenerate-division-button')
        app.click('regenerate-continue')
        page.wait_for_selector(sel('regenerate-confirm'))
        page.keyboard.press('Escape')
        app.wait_for(lambda: hidden('regenerate-modal'), message='the Regenerate confirmation closed by Escape')
        assert app.structure() == revision, 'Escape regenerated the division'

        page.locator(sel('connection-status')).click()
        page.wait_for_selector(sel('cloud-modal'))
        page.keyboard.press('Escape')
        page.wait_for_selector(sel('cloud-modal'), state='detached')
        assert not problems, problems
        browser.close()
    print('PASS Escape closes the generation check, Regenerate Single Division and the cloud modal')


if __name__ == '__main__':
    main()
