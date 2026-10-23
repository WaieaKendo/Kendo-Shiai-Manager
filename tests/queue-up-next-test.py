"""#130: phone court preview uses the TV's next division, cannot start a match."""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp
from ksm_browser import launch_chromium

PEOPLE = [{'name': n, 'dojo': 'Aiea', 'seed': '', 'status': 'Checked'}
          for n in ('Aki', 'Bo', 'Cy')]


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        app = KsmApp.local(page, 'Queue preview', problems=problems)
        app.answers['Create Staff password'] = ''
        app.configure([
            {'name': name, 'format': 'Round Robin', 'court': court, 'entrants': PEOPLE}
            for name, court in [('First', 'A'), ('Other court', 'B'), ('Junior Semifinal', 'A')]
        ])
        app.open_court('A')
        app.switch_division('First')
        preview = page.get_by_test_id('queue-up-next')
        assert preview.count() == 0, 'Own queued matches must take precedence'
        for _ in range(20):
            if app.court_screen()['complete']:
                break
            app.score_point('W', 'M')
            app.score_point('W', 'M')
            app.next_match(settle=True)
        assert app.court_screen()['complete'], 'First division did not finish'
        preview.wait_for()
        assert 'Up next: Junior Semifinal — not started' in preview.inner_text(), preview.inner_text()
        assert preview.get_attribute('aria-disabled') == 'true'
        rows = preview.locator('.queue-row')
        assert rows.count() == 2
        assert preview.locator('button, a, [tabindex], [onclick]').count() == 0
        assert preview.evaluate('''el => {
          const muted = getComputedStyle(el).getPropertyValue('--muted').trim();
          const probe = document.createElement('span'); probe.style.color = muted; el.append(probe);
          const color = getComputedStyle(probe).color; probe.remove();
          return [...el.querySelectorAll('.white, .red, .vs')].every(n => getComputedStyle(n).color === color);
        }'''), 'Preview must use the muted theme token on both sides'
        before = app.final_state()
        rows.first.click()
        assert app.final_state() == before, 'Clicking preview changed saved state'
        # TV uses its next-division footer after completion, and upNext while idle.
        app.render_tv()
        app.wait_for(lambda: 'Junior Semifinal' in page.locator('#tvLive').text_content(), message='TV next division')
        assert page.evaluate("KSMTest.app.ksmUpNext('A', KSMTest.app.state.currentDivision).division") == 'Junior Semifinal'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Phone overflow'
        page.get_by_test_id('court-continue').click()
        app.wait_for(lambda: app.court_screen()['division'] == 'Junior Semifinal', message='continue to next division')
        app.wait_for(lambda: preview.count() == 0, message='preview replaced by normal queue')
        assert page.locator('#queue .queue-row').count() > 0
        assert app.current_match() is not None
        browser.close()
    assert not problems, problems
    print('PASS queue up next: 1 phone scenario, own queue, completed preview, TV parity, inert click, continue')


if __name__ == '__main__':
    main()
