from datetime import datetime
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

"""One authoritative controller per court: a second staff device whose timer is mounted but not shown
(a director on Setup) must not turn the TV's stopped-clock border on while the scorer's clock runs."""
import time


def people(prefix):
    return [{'name': f'{prefix} {i}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(1, 5)]


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Controller Cup')
        tid = director.create_tournament()
        director.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('A')}])
        director.save_now('setup')
        director.wait_idle()
        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        tv = KsmApp.open_device(browser, base, 'TV A', problems, app_path(tid, 'tv', 'A'), viewport={'width': 1920, 'height': 1080})
        for app in (court, tv):
            assert app.socket_barrier(), f'{app.name}: socket did not reach its ping/pong barrier'
        court.wait_generated()
        court.staff_login()
        court.open_court('A')
        court.wait_for(court.current_match, message='match')
        director.nav('setup')  # the director's court timer stays mounted behind Setup
        tv.wait_for(tv.tv_clock_stopped, message='stopped border before the clock starts')
        court.click('timer-toggle')
        tv.wait_for(lambda: not tv.tv_clock_stopped(), message='running clock clears the border')
        # The director would report "stopped" within its 5 s repeat if it were allowed to.
        deadline = time.time() + 8
        while time.time() < deadline:
            assert not tv.tv_clock_stopped(), 'a hidden staff device turned the TV border on while the clock runs'
            time.sleep(0.4)
        court.click('timer-toggle')
        tv.wait_for(tv.tv_clock_stopped, message='pausing shows the border again')
        assert not problems, '\n'.join(problems)
        browser.close()
    print('PASS match timer controller: a hidden staff device never reports the court clock')


main()
