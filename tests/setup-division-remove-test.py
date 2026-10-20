"""Every division can be removed before its draw (owner request, 4.0): presets too, not only custom ones.

A removed preset is hidden for this tournament (state.hiddenPresets) until "Restore standard
divisions". Removing a division with registered players asks first (they stay in Registration).
A drawn division's × is disabled, with the reason as its tooltip.
"""
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_app import KsmApp, sel

ROWS = "[...document.querySelectorAll('[data-testid=setup-division-name]')].map(e => e.textContent)"


def row(app, name):
    return app.page.locator(sel('setup-division-row')).filter(has=app.page.locator(sel('setup-division-name')).get_by_text(name, exact=True))


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        a = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Division Cleanup')
        a.create_tournament(); a.wait_idle()
        a.nav('setup'); a.page.wait_for_selector(sel('setup-division-row'))
        names = a.page.evaluate(ROWS)
        preset = next(n for n in names if n.startswith('Yonenbu'))
        assert row(a, preset).locator(sel('setup-division-remove')).count() == 1, 'a preset row has no ×'
        # A preset with a registered player: asked first, then hidden; the player stays.
        a.page.evaluate("d => { KSMTest.app.state.competitors.push({name: 'Kid One', dojo: 'D', division: d, seed: '', status: 'Checked'}); }", preset)
        a.expect_dialog(f'Remove {preset}?', True)
        row(a, preset).locator(sel('setup-division-remove')).click()
        a.wait_for(lambda: preset not in a.page.evaluate(ROWS), message='the preset to be removed')
        assert any(m.startswith(f'Remove {preset}? Its 1 registered player') for m in a.seen_dialogs), a.seen_dialogs
        assert a.page.evaluate("KSMTest.app.state.competitors.some(c => c.name === 'Kid One')")
        assert a.page.evaluate("KSMTest.app.state.hiddenPresets") == [preset]
        # Start blank: every other division can go too.
        for n in a.page.evaluate(ROWS):
            row(a, n).locator(sel('setup-division-remove')).click()
        a.wait_for(lambda: a.page.evaluate(ROWS) == [], message='an empty divisions list')
        a.wait_idle()
        saved = a.payload()['state']
        assert saved['divisions'] == [] and len(saved['hiddenPresets']) == len(names), saved.get('hiddenPresets')
        # Restore brings the standard divisions back (switched off).
        assert a.page.inner_text(sel('setup-division-restore')).startswith('Restore standard divisions')
        a.click('setup-division-restore')
        a.wait_for(lambda: preset in a.page.evaluate(ROWS), message='the presets to come back')
        assert not a.page.locator(sel('setup-division-restore')).count()
        # A drawn division cannot be removed: × disabled, with the reason as its tooltip.
        a.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A',
                      'entrants': [{'name': f'P{i}', 'dojo': 'D', 'seed': '', 'status': 'Checked'} for i in range(3)]}])
        a.nav('setup'); a.page.wait_for_selector(sel('setup-division-row'))
        remove = row(a, 'Open').locator(sel('setup-division-remove'))
        assert remove.is_disabled() and 'is drawn' in remove.get_attribute('title'), remove.get_attribute('title')
        assert not problems, problems
        browser.close()
    print('PASS divisions: presets removable before the draw, start blank, restore, players kept, drawn ones locked')


if __name__ == '__main__':
    main()
