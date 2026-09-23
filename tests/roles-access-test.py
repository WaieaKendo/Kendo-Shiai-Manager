"""Roles and access: what staff, spectator and TV devices may see and do.

Against a throwaway `wrangler dev`:
  * Home library: a fresh device lists the cloud tournament by name, opens it as a
    spectator on Live Scores, and returns to the library from the menu;
  * spectators see no Setup/Registration/Export/Save/TV menus, may open Court,
    Overview, Results and Live Scores and are sent to Live Scores from anything else;
    their court screen shows the court and its context but no scoring controls;
  * a TV shows only the display, no navigation;
  * spectator and TV devices never write to the cloud (no PUT/POST/DELETE), also
    after clicks, a dropped connection and reconnecting;
  * only staff can pick a team representative; spectators see the choice read-only;
  * Tournament Access shows the spectator link (no key) and a QR code; Copy Link copies it;
  * Staff Logout turns the device into a spectator.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

STAFF_ONLY = ['nav-setup', 'nav-registration', 'nav-export', 'nav-save-load', 'nav-tv']
EVERYONE = ['nav-courts', 'nav-live-scores', 'nav-overview', 'nav-results']
VIEWS = ['setup', 'registration', 'print', 'score', 'public', 'results', 'director']
VISIBLE_VIEW_JS = "() => [...document.querySelectorAll('main > .view')].filter(v => getComputedStyle(v).display !== 'none').map(v => v.id)"


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def record_writes(app):
    writes = []

    def on_request(req):
        if '/api/' in req.url and (req.method in ('PUT', 'DELETE') or (req.method == 'POST' and not req.url.endswith('/discover'))):
            writes.append(f'{req.method} {req.url}')
    app.page.context.on('request', on_request)
    return writes


def visible(app, testid):
    return app.page.is_visible(sel(testid))


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Roles Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'teams': 2, 'court': 'Both'},
        ])
        director.save_now()
        director.wait_idle()
        for testid in STAFF_ONLY + EVERYONE:
            assert visible(director, testid), f'staff cannot see {testid}'

        # --- Home library -> open as spectator -> back to the library ----------------------
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems)
        spectator_writes = record_writes(spectator)
        page = spectator.page
        page.wait_for_selector(f'{sel("home-tournament-name")}:has-text("Roles Cup")')
        assert visible(spectator, 'home-new-tournament'), 'home page has no New Tournament'
        page.click(f'{sel("home-tournament-name")}:has-text("Roles Cup")')
        page.wait_for_selector(f'{sel("live-scores")}', state='visible')
        spectator.wait_generated()
        assert spectator.page.evaluate('KSMTest.role()') == 'spectator'
        assert page.inner_text(sel('staff-auth')).strip() == 'Staff Login'

        # --- Spectator navigation ------------------------------------------------------------
        for testid in STAFF_ONLY:
            assert not visible(spectator, testid), f'spectator can see {testid}'
        for testid in EVERYONE:
            assert visible(spectator, testid), f'spectator cannot see {testid}'
        for view in VIEWS:
            spectator.show_screen(view)
            shown = page.evaluate(VISIBLE_VIEW_JS)
            want = view if view in ('score', 'public', 'results', 'director') else 'public'
            assert shown == [want], f'spectator asked for {view}: shows {shown}, expected {want}'
        spectator.open_court('A')
        assert spectator.court_screen()['white'] not in ('', '—'), 'spectator court screen shows no match'
        assert visible(spectator, 'court-context'), 'spectator court context hidden'
        for testid in ('point-white-M', 'hansoku-red', 'undo', 'next-match', 'fusen-gachi'):
            assert not visible(spectator, testid), f'spectator court screen shows {testid}'
        spectator.nav('results')
        spectator.nav('overview')
        spectator.nav('live-scores')

        # --- TV: display only ----------------------------------------------------------------
        tv = KsmApp.open_device(browser, base, 'TV', problems, f'/?role=spectator&tournament={tid}&court=A&view=tv',
                                viewport={'width': 1600, 'height': 900})
        tv_writes = record_writes(tv)
        tv.wait_generated()
        tv.page.wait_for_selector(sel('tv-display'), state='visible')
        for testid in STAFF_ONLY + EVERYONE + ['staff-auth']:
            assert not visible(tv, testid), f'TV shows {testid}'

        # --- Team representative: staff choose, spectators read -----------------------------
        director.open_court('A')
        director.switch_division('Team Tournament')
        for _ in range(3):  # three drawn bouts: the teams are tied -> representative match
            director.next_match()
        director.wait_for(lambda: director.page.locator(sel('representative-select')).count() == 2,
                          message='representative selectors for staff')
        member = director.page.locator(f'#score {sel("court-white-name")} {sel("representative-select")} option').nth(1).inner_text()
        director.page.select_option(f'#score {sel("court-white-name")} {sel("representative-select")}', label=member)
        director.wait_idle()
        spectator.wait_revision(director.revision())
        spectator.open_court('A')
        spectator.wait_for(lambda: spectator.page.locator(sel('representative-readonly')).count() == 2,
                           message='read-only representatives for the spectator')
        assert spectator.page.locator(sel('representative-select')).count() == 0, 'spectator can pick a representative'
        assert spectator.court_screen()['white'] == member, spectator.court_screen()
        tv.wait_revision(director.revision())

        # --- Read-only devices never write ---------------------------------------------------
        page.context.set_offline(True)
        spectator.nav('results')
        page.context.set_offline(False)
        spectator.nav('live-scores')
        tv.page.context.set_offline(True)
        tv.page.context.set_offline(False)
        director.score_point('W', 'M')
        director.wait_idle()
        spectator.wait_revision(director.revision())
        tv.wait_revision(director.revision())
        time.sleep(3.5)  # longer than the save debounce
        assert not spectator_writes, f'spectator wrote to the cloud: {spectator_writes}'
        assert not tv_writes, f'TV wrote to the cloud: {tv_writes}'

        # --- Tournament Access -----------------------------------------------------------------
        dpage = director.page
        dpage.context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
        director.click('nav-save-load')
        director.click('nav-tournament-access')
        dpage.wait_for_selector(sel('access-link'))
        assert dpage.inner_text(sel('cloud-modal-title')).strip() == 'Tournament Access'
        link = dpage.inner_text(sel('access-link')).strip()
        assert link == f'{base}/?tournament={tid}', f'access link: {link}'
        assert 'key' not in link and 'e2e-staff-pass' not in dpage.inner_text(sel('cloud-modal')), 'access modal shows a key'
        assert tid in (dpage.get_attribute(sel('access-qr'), 'src') or ''), 'QR code does not carry the link'
        director.click('access-copy')
        director.wait_for(lambda: dpage.evaluate('navigator.clipboard.readText()') == link, message='the link on the clipboard')
        director.click('cloud-modal-close')
        assert dpage.locator(sel('cloud-modal')).count() == 0

        # --- Staff Logout / Tournament Library return path ------------------------------------
        director.staff_logout()
        assert director.page.evaluate(VISIBLE_VIEW_JS) == ['public'], 'logout should land on Live Scores'
        for testid in STAFF_ONLY:
            assert not visible(director, testid), f'logged-out staff still sees {testid}'
        director.staff_login()
        director.click('nav-save-load')
        director.click('nav-library')
        dpage.wait_for_selector(f'{sel("home-tournament-name")}:has-text("Roles Cup")', state='visible')
        assert dpage.inner_text(sel('staff-auth')).strip() == 'Staff Login', 'the library should end the staff session'

        assert not problems, '\n'.join(problems)
        print(f'PASS roles and access: library, spectator/TV navigation and screens, no cloud writes, '
              f'representative, Tournament Access, logout ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
