"""Court screen "Configure court" (#38): staff set this court's Red side without going to Setup.

Cloud tournament on a throwaway `wrangler dev`: a staff device and a spectator device.
  * staff see the Configure court button, spectators do not;
  * its panel shows the court's current Red side (Left / Right), in Setup's words;
  * choosing Left flips the court layout, Setup's "Court A — Red side" field and the saved setup,
    and the spectator device follows; it never changes who is Red or White; Court B is untouched;
  * the choice survives a reload; Escape and an outside click close the panel;
  * "More court settings in Setup" opens Setup at that court's field.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

X = """sel => { const r = document.querySelector('#score ' + sel).getBoundingClientRect(); return r.left + r.width / 2; }"""
PEOPLE = [{'name': f'P{i}', 'dojo': f'D{i}', 'seed': '', 'status': 'Checked'} for i in range(1, 4)]


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        app = KsmApp.open_device(browser, base, 'Court', problems, tournament_name='Configure Cup')
        page = app.page
        tid = app.create_tournament()
        app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': PEOPLE}])
        app.save_now()
        app.wait_idle()
        app.open_court('A')
        app.wait_for(app.current_match, message='a match on Court A')
        before = app.current_match()

        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid, 'court', 'A'))
        spectator.wait_generated()
        spectator_court = spectator.page
        spectator.open_court('A')
        assert spectator_court.locator(f'#score {sel("court-configure")}').is_hidden(), 'spectators must not see Configure court'

        button = page.locator(f'#score {sel("court-configure")}')
        panel = page.locator(sel('court-config-panel'))
        assert button.is_visible() and button.get_attribute('aria-label') == 'Configure court'
        field = lambda: page.evaluate('court1RedSide.value')

        # The panel shows the current value, in Setup's words.
        button.click()
        panel.wait_for(state='visible')
        assert 'Red side (as seen from the scoring table)' in panel.inner_text(), panel.inner_text()
        assert page.locator(sel('court-red-side-right')).is_checked() and not page.locator(sel('court-red-side-left')).is_checked()
        assert field() == 'right'
        assert page.evaluate(X, '.scoreboard-white') < page.evaluate(X, '.scoreboard-red')

        # Escape and an outside click close it.
        page.keyboard.press('Escape')
        panel.wait_for(state='hidden')
        button.click()
        panel.wait_for(state='visible')
        page.mouse.click(5, 5)
        panel.wait_for(state='hidden')

        # Choosing Left flips the layout and Setup's field; the fighters' sides are unchanged.
        button.click()
        page.locator(sel('court-red-side-left')).check()
        app.wait_for(lambda: field() == 'left', message="Setup's Court A Red side field follows")
        assert page.evaluate("document.body.classList.contains('ksm-red-left')")
        assert page.evaluate(X, '.scoreboard-red') < page.evaluate(X, '.scoreboard-white'), 'the court layout did not flip'
        after = app.current_match()
        assert (after['white'], after['red']) == (before['white'], before['red']), 'Red/White fighters must not change'
        assert page.evaluate('court2RedSide.value') == 'right', 'Court B untouched'
        assert page.locator(sel('court-red-side-left')).is_checked()

        # Saved with the setup, and the other device follows.
        app.wait_idle()
        assert fetch_record(base, tid)['payload']['setup']['court1RedSide'] == 'left'
        spectator.wait_for(lambda: spectator_court.evaluate("document.body.classList.contains('ksm-red-left')"),
                           timeout=20, message='the spectator device follows the new Red side')

        # Survives a reload.
        app.wait_idle()
        app.goto(app_path(tid, 'court', 'A'))
        app.wait_revision(fetch_record(base, tid)['revision'])
        app.staff_login()
        app.open_court('A')
        app.wait_for(lambda: page.evaluate("document.body.classList.contains('ksm-red-left')"), message='Red side kept after reload')
        assert field() == 'left'
        button.click()
        panel.wait_for(state='visible')
        assert page.locator(sel('court-red-side-left')).is_checked()

        # The link goes to Setup, at this court's field.
        link = page.locator(sel('court-config-setup'))
        link.focus()
        page.keyboard.press('Enter')  # keyboard accessible
        app.wait_for(lambda: app.visible_view() == ['setup'], message='Setup opened')
        app.wait_for(lambda: page.evaluate("document.activeElement && document.activeElement.id") == 'court1RedSide', message="focus on Court A's Red side field")

        assert not problems, problems
        browser.close()
    print('PASS Configure court: Red side panel (staff only), flips the court and Setup field, syncs, survives reload')


if __name__ == '__main__':
    main()
