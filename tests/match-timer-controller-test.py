from datetime import datetime
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

"""Court clock reports never override each other: a second staff device, hidden (a director on Setup) or even
showing the same court with an idle clock, must not turn the TV's stopped-clock border on while the scorer's
clock runs. The TV shows the border only when no reporting device is running."""
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
        second = KsmApp.open_device(browser, base, 'Second scorer', problems, app_path(tid, 'court', 'A'))
        assert second.socket_barrier()
        second.wait_generated()
        second.staff_login()
        second.open_court('A')  # a second device showing the same court with its own, idle, clock
        second.wait_for(second.current_match, message='second match')
        tv.wait_for(tv.tv_clock_stopped, message='stopped border before the clock starts')
        court.click('timer-toggle')
        tv.wait_for(lambda: not tv.tv_clock_stopped(), message='running clock clears the border')
        # The director would report "stopped" within its 5 s repeat if it were allowed to.
        deadline = time.time() + 8
        while time.time() < deadline:
            assert not tv.tv_clock_stopped(), 'another staff device turned the TV border on while the scorer clock runs'
            time.sleep(0.4)
        court.click('timer-toggle')
        tv.wait_for(tv.tv_clock_stopped, message='pausing shows the border again (every device is stopped)')
        second.page.close()
        tv.wait_for(tv.tv_clock_stopped, message='a closed device does not break the border')
        assert not problems, '\n'.join(problems)
        browser.close()
    print('PASS match timer controller: no other staff device overrides a running court clock')


main()
