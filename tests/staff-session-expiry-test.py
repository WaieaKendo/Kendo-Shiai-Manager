"""F33: a point scored while the staff session token has expired reaches the cloud after Staff Login,
also when another device saves meanwhile (against a throwaway `wrangler dev`).

The Court A device's token has expired (24 h unused, or revoked): its save is refused (HTTP 401),
the device becomes a spectator and keeps the point queued in the outbox. Court B scores and saves
meanwhile, so Court A receives that newer copy live. The queued point must survive it (the outbox
stays staff work: a spectator-stamped outbox is discarded by the next live update) and reach the
server once Court A logs in again, next to Court B's point.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def match_of(record, division, shown):
    return [m for m in record['payload']['state']['allMatches'][division]
            if m['white'] == shown['white'] and m['red'] == shown['red']][0]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        court_a = KsmApp.open_device(browser, base, 'Court A', problems, tournament_name='Expiry Cup')
        tid = court_a.create_tournament()
        court_a.wait_for(lambda: court_a.staff_session().startswith('ksmst_'), message='Court A to hold a session token')
        court_a.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
                           {'name': 'Kids', 'format': 'Round Robin', 'court': 'B', 'entrants': people('K', 3)}])
        court_a.save_now()
        court_a.wait_idle()
        court_a.open_court('A')
        open_match = court_a.current_match()

        court_b = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'B'))
        court_b.wait_generated()
        court_b.staff_login()
        court_b.open_court('B')
        kids_match = court_b.current_match()

        # Court A's token has expired: its save is refused, the device is logged out, the point queued.
        expired = lambda route: route.fulfill(status=401, content_type='application/json',
                                              body='{"error":"Staff session expired. Use Staff Login again.","code":"session-expired"}') \
            if route.request.method == 'PUT' else route.continue_()
        court_a.page.route('**/api/tournaments/**', expired)
        court_a.score_point('W', 'M')
        court_a.wait_for(lambda: court_a.page.inner_text('[data-testid="staff-auth"]').strip() == 'Staff Login',
                         message='Court A to be logged out by the expired session')
        court_a.wait_for(court_a.outbox, message='the unsaved point to be queued')
        court_a.page.unroute('**/api/tournaments/**', expired)

        # Court B saves meanwhile; Court A (now a spectator) receives that copy live.
        court_b.score_point('R', 'K')
        court_b.wait_idle()
        revision = fetch_record(base, tid)['revision']
        court_a.wait_revision(revision)
        queued = court_a.outbox()
        assert queued, 'the queued point was dropped by the live update (moved to recovery storage)'

        # Staff Login again: the queued point is sent, Court B's is kept.
        court_a.staff_login()
        court_a.wait_for(lambda: not court_a.outbox(), message='the queued point to be sent after login')
        court_a.wait_idle()
        record = court_a.wait_for(lambda: (lambda r: r if match_of(r, 'Open', open_match).get('wp') == ['M'] else None)(fetch_record(base, tid)),
                                  message='the point scored while the session was expired in the cloud')
        assert match_of(record, 'Kids', kids_match).get('rp') == ['K'], \
            f'Court B\'s point saved meanwhile: {match_of(record, "Kids", kids_match).get("rp")}'
        court_b.wait_revision(record['revision'])
        assert court_b.court_screen()['red_points'] == 'K'
        for device in (court_a, court_b):
            device.close()

        assert not problems, '\n'.join(problems)
        print(f'PASS staff session expiry: a point scored with an expired token survives another device\'s save '
              f'and reaches the cloud after Staff Login ({time.time() - started:.1f}s)')


if __name__ == '__main__':
    main()
