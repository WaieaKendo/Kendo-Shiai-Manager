"""The sample-data buttons show only with the test tools on (owner decision 20, #29).

Before: Load Sample Players, Load Sample Teams, Load Sample Tournament and + Auto Test Team were on
every director's Registration screen (since F24 they ask before replacing entries). Now they are
hidden unless this device's test tools are switched on in Developer Tools ("Show test tools", kept
on the device across reloads); "Hide test tools" hides them again. Tests switch them on with the
test API (KsmApp.enable_test_tools()).

Offline, through Registration and Developer Tools.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium, load_app

SAMPLES = [sel('reg-load-samples'), sel('reg-load-sample-tournament'), sel('team-load-samples'), 'button[onclick="addAutoTeam()"]']


def visible(app):
    app.nav('registration')
    app.click('reg-tab-individual')
    out = [app.page.locator(SAMPLES[0]).is_visible(), app.page.locator(SAMPLES[1]).is_visible()]
    app.click('reg-tab-team')
    out += [app.page.locator(SAMPLES[2]).is_visible(), app.page.locator(SAMPLES[3]).is_visible()]
    app.click('reg-tab-individual')
    return out


def developer_tools(app, button):
    app.nav('setup')
    app.click('setup-cloud-diagnostics')
    app.page.wait_for_selector(sel('cloud-modal'))
    toggle = app.page.locator(sel('diagnostics-test-tools'))
    assert toggle.inner_text().strip() == button, toggle.inner_text()
    toggle.click()
    app.page.wait_for_function(f"document.querySelector('[data-testid=\"diagnostics-test-tools\"]')?.textContent.trim() !== {button!r}")
    app.click('cloud-modal-close')


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: saves stay local
        assert visible(app) == [False] * 4, f'sample buttons shown without the test tools: {visible(app)}'
        assert page.locator(sel('reg-add-row')).is_visible(), 'the other buttons stay'

        developer_tools(app, 'Show test tools')
        assert visible(app) == [True] * 4, visible(app)
        app.expect_dialog('Restore autosaved', accept=False)
        load_app(page)  # the page loaded again (a staff session, as at the start)
        assert visible(app) == [True] * 4, 'the test tools were not kept on this device'
        developer_tools(app, 'Hide test tools')
        assert visible(app) == [False] * 4, visible(app)

        app.enable_test_tools()
        assert visible(app) == [True] * 4, 'the test API did not switch them on'
        assert not problems, problems
        browser.close()
    print('PASS the sample-data buttons show only with the test tools on (Developer Tools; kept on the device)')


if __name__ == '__main__':
    main()
