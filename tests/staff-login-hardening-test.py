"""Staff password hardening in the app (issue #9), against a throwaway `wrangler dev`:

  * attempt limit: a device that types 5 wrong staff passwords is told how long to wait (the
    server's 429 message); the right password is refused during the wait; spectators keep
    their live view meanwhile.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Hardening Cup')
        tid = director.create_tournament()
        director.wait_idle()

        # ------------------------------------------------------------ attempt limit
        guesser = KsmApp.open_device(browser, base, 'Guesser', problems, app_path(tid))
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        alerts = [guesser.staff_login_attempt(f'wrong-{i}') for i in range(1, 6)]
        assert alerts[:4] == ['Incorrect Staff password.'] * 4, alerts
        assert alerts[4] == 'Too many incorrect Staff passwords. Try again in 30 seconds.', alerts
        refused = guesser.staff_login_attempt('e2e-staff-pass')
        assert refused.startswith('Too many incorrect Staff passwords. Try again in '), refused
        assert guesser.page.inner_text('[data-testid="staff-auth"]').strip() == 'Staff Login'
        # Spectators are unaffected: a new spectator device still opens the tournament live.
        late = KsmApp.open_device(browser, base, 'Late spectator', problems, app_path(tid))
        late.wait_for(lambda: late.tournament_id() == tid, message='spectator opened the tournament')
        for device in (guesser, spectator, late):
            device.close()

        assert not problems, '\n'.join(problems)
        print(f'PASS staff login hardening: attempt limit message, spectators unaffected ({time.time() - started:.1f}s)')


if __name__ == '__main__':
    main()
