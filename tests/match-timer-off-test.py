"""Per-court timer preferences, saved clocks, and manual whistle/TV behavior with timing off."""
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker


def assert_off(app):
    app.wait_for(lambda: app.page.locator('.match-timer--off').count() == 1, message='timer Off card')
    for control in ('timer-display', 'timer-status', 'timer-toggle', 'timer-encho', 'timer-reset'):
        assert app.page.locator(sel(control)).count() == 0, control
    assert app.page.locator('[data-testid^="timer-adjust-"]').count() == 0
    assert not app.timer_control('timer-replay')['disabled']


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems)
        tid = director.create_tournament()
        director.configure([{'name': 'Final', 'format': 'Single Elimination', 'court': 'A',
            'entrants': [{'name': n, 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for n in ('Aki', 'Bo')]}])
        director.save_now()
        director.wait_idle()
        court = KsmApp.open_device(browser, base, 'Court', problems, app_path(tid, 'court', 'A'),
                                   clock=True, before_load=KsmApp.install_timer_probes)
        tv = KsmApp.open_device(browser, base, 'TV', problems, app_path(tid, 'tv', 'A'), clock=True)
        court.wait_generated()
        court.staff_login()
        court.open_court('A')
        court.wait_for(court.timer, message='timer mounted')
        for app in (court, tv):
            assert app.socket_barrier()
        # Freeze only Date on the scorer; rendering and event delivery remain live.
        epoch = datetime.now()
        court.page.clock.set_fixed_time(epoch)
        tv.page.clock.pause_at(datetime.now() + timedelta(milliseconds=100))
        tv.wait_for(tv.tv_clock_stopped, message='initial stopped border')
        court.click('timer-adjust--10')
        assert court.timer()['display'] == '2:50'
        saved = court.timer_storage()
        court.configure_timer_enabled('A', False)
        assert_off(court)
        assert court.page.locator(sel('court-rule-tag')).inner_text() == 'Encho — winner needed'
        assert court.page.locator(sel('setup-court1TimerEnabled')).input_value() == 'Off'
        assert court.page.locator(sel('setup-court2TimerEnabled')).input_value() == 'On'
        tv.wait_for(lambda: not tv.tv_clock_stopped(), message='Off clears TV border')
        court.wait_idle()
        director.wait_for(lambda: director.payload()['setup']['court1TimerEnabled'] == 'Off', message='Off synced to director')
        court.page.clock.fast_forward(240000)
        assert court.timer_probes()['buzzers'] == 0, 'Disabled timer sounded automatically'
        assert tv.tie_flash_banner() is None, 'Disabled timer sent automatic banner'
        assert court.timer_storage() == saved
        assert not tv.tv_clock_stopped()
        assert not court.timer_control('timer-show-tv')['disabled']
        court.click('timer-replay')
        court.wait_for(lambda: court.timer_probes()['buzzers'] == 1, message='Off whistle')
        tv.wait_for(tv.tie_flash_banner, message='Off tied whistle sends Encho')
        banner = tv.tie_flash_banner()
        assert banner['text'] == 'ENCHO'
        assert court.timer_control('timer-show-tv')['disabled']
        court.click('timer-replay')
        court.wait_for(lambda: court.timer_probes()['buzzers'] == 2, message='Off whistle during banner')
        assert court.socket_barrier()
        assert tv.socket_barrier()
        assert tv.tie_flash_banner()['id'] == banner['id'], 'Repeated whistle resent active banner'
        tv.page.clock.fast_forward(5000)
        court.page.clock.set_fixed_time(epoch + timedelta(seconds=5))
        court.page.clock.run_for(300)
        court.wait_for(lambda: not court.timer_control('timer-show-tv')['disabled'], message='Off TV cooldown expires')
        court.score_point('W', 'M')
        assert court.timer_control('timer-show-tv')['disabled']
        court.click('timer-replay')
        court.wait_for(lambda: court.timer_probes()['buzzers'] == 3, message='Untied whistle still plays')
        assert court.socket_barrier() and tv.socket_barrier()
        assert tv.tie_flash_banner() is None, 'Untied whistle sent a banner'
        court.undo()
        court.click('timer-show-tv')
        tv.wait_for(tv.tie_flash_banner, message='Off manual TV control')
        court.wait_idle()
        court.reload()
        court.wait_generated()
        assert court.page.evaluate('KSMTest.role()') == 'staff'
        court.open_court('A')
        assert_off(court)
        assert court.timer_storage() == saved
        # Setup -> Configure menu is the reverse synchronization direction.
        director.nav('setup')
        director.page.locator(sel('setup-court1TimerEnabled')).select_option('On')
        director.wait_idle()
        court.wait_for(lambda: court.payload()['setup']['court1TimerEnabled'] == 'On', message='On synced from Setup')
        court.wait_for(lambda: court.timer() and court.timer()['display'] == '2:50', message='saved clock restored')
        court.click('court-configure')
        assert court.page.locator(sel('court-timer-enabled')).input_value() == 'On'
        court.page.keyboard.press('Escape')
        assert court.timer_control('timer-replay')['disabled']
        tv.wait_for(tv.tv_clock_stopped, message='On restores stopped TV border')
        assert not problems, problems
        browser.close()
    print('PASS timer Off: per-court settings sync/reload, clock restoration, manual whistle/TV, cooldown, and border')


if __name__ == '__main__':
    main()
