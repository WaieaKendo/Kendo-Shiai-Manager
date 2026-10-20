"""Issue #71: tab sessions survive reload, stay scoped, and honor server revocation."""
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        a = KsmApp.open_device(browser, base, 'Staff', problems, tournament_name='Refresh A')
        aid = a.create_tournament()
        a.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A',
                      'entrants': [{'name': f'P{i}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(3)]}])
        a.save_now()
        a.wait_idle()
        token = a.staff_session()
        revision = fetch_record(base, aid)['revision']
        for path, view in [(app_path(aid), 'director'), (app_path(aid, 'court', 'A'), 'public'),
                           (app_path(aid, 'setup'), 'setup'), ('/', 'home')]:
            a.goto(path)
            a.reload()
            assert a.page.evaluate('KSMTest.role()') == 'staff', path
            assert a.staff_session() == token, path
            assert a.visible_view() == [view], (path, a.visible_view())
            if path == '/':
                assert a.page.evaluate('KSMTest.app.ksmCloudSocket === null'), 'Library boot kept a live staff socket'
        assert fetch_record(base, aid)['revision'] == revision, 'session checks wrote a snapshot'

        b = KsmApp.open_device(browser, base, 'Other', problems, tournament_name='Refresh B')
        bid = b.create_tournament(); b.wait_idle()
        sent = []
        a.page.on('request', lambda req: sent.append((req.url, req.headers.get('x-ksm-session-key', '')))
                  if '/api/tournaments/' in req.url else None)
        a.page.on('websocket', lambda ws: sent.append((ws.url, parse_qs(urlparse(ws.url).query).get('key', [''])[0])))
        a.page.evaluate('(id)=>KSMTest.app.openTournamentFromHome(id)', bid)
        a.wait_for(lambda: a.tournament_id() == bid, message='B opened from Library')
        assert a.page.evaluate('KSMTest.role()') == 'spectator'
        assert not a.staff_session()
        assert not [url for url, key in sent if key == token], 'A token sent while opening B'
        a.reload()
        assert a.page.evaluate('KSMTest.role()') == 'spectator'

        # Even a direct address change cannot send A's token to B.
        a.goto(app_path(aid)); a.staff_login()
        # A's own live connection (A's key) is reported a moment after Staff Login; let A settle so only
        # what happens after the address change is checked.
        a.page.wait_for_function("KSMTest.pendingReason().socket === 'open'"); a.wait_idle()
        sent.clear()
        a.goto(app_path(bid))
        a.wait_for(lambda: a.tournament_id() == bid, message='B opened by address')
        leaked = [url for url, key in sent if key and (bid in url or key == token)]
        assert not leaked, f'foreign token leaked on direct navigation: {leaked}'
        assert a.page.evaluate('KSMTest.role()') == 'spectator'

        a.goto(app_path(aid)); a.staff_login(); a.staff_logout(); a.reload()
        assert not a.staff_session() and a.page.evaluate('KSMTest.role()') == 'spectator'
        a.staff_login()
        a.page.evaluate('KSMTest.app.showHomePage()')
        a.wait_for(lambda: a.visible_view() == ['home'], message='Browse Library')
        a.reload()
        assert a.staff_session() and a.page.evaluate('KSMTest.role()') == 'staff'
        assert a.visible_view() == ['home'] and a.tournament_id() == aid

        # Old plain tokens have no reliable tab-local tournament identity: require login once.
        a.goto(app_path(aid))
        assert a.page.evaluate('KSMTest.role()') == 'staff'
        a.page.evaluate("sessionStorage.removeItem(KSMTest.app.KSM_STAFF_TOURNAMENT)")
        a.reload()
        assert not a.staff_session() and a.page.evaluate('KSMTest.role()') == 'spectator'

        # Read-only links stay read-only even in a tab that had logged in.
        a.staff_login(); a.goto(app_path(aid, 'tv', 'A')); a.reload()
        assert a.page.evaluate('KSMTest.role()') == 'spectator'
        a.goto(app_path(aid)); a.staff_login()
        a.goto(f'/?spectator={aid}'); a.reload()
        assert a.page.evaluate('KSMTest.role()') == 'spectator'

        # Another device revokes the oldest token via the server's 50-session limit.
        # Password-change revocation is also covered in staff-auth-hardening-test.mjs;
        # the worker exposes no password-change HTTP endpoint.
        a.goto(app_path(aid)); a.staff_login()
        other = KsmApp.open_device(browser, base, 'Password changer', problems, app_path(aid))
        other.staff_login()
        a.page.context.set_offline(True)
        a.page.evaluate("KSMTest.app.state.awards=[{name:'Queued award'}];KSMTest.app.criticalAutoSave('Offline award')")
        a.wait_for(a.outbox, message='offline work queued')
        queued = a.page.evaluate('KSMTest.app.readOutbox().payload.state')
        for _ in range(51):
            response = other.page.request.post(f'{base}/api/tournaments/{aid}/auth',
                        data={'password': 'e2e-staff-pass'})
            assert response.ok, response.text()
        a.page.context.set_offline(False)
        a.reload()
        assert a.page.evaluate('KSMTest.role()') == 'spectator'
        assert not a.staff_session()
        assert a.outbox()['role'] == 'staff' and a.outbox()['tournamentId'] == aid
        assert a.page.evaluate('KSMTest.app.readOutbox().payload.state') == queued, 'revocation lost queued work'
        a.staff_login()
        a.wait_for(lambda: not a.outbox(), message='queued work saved after login')
        assert fetch_record(base, aid)['payload']['state']['awards'][0]['name'] == 'Queued award'
        assert not problems, problems
        browser.close()
    print('PASS refresh keeps staff: screens, scope, logout, switch, legacy token, read-only links, revocation and queue')


if __name__ == '__main__':
    main()
