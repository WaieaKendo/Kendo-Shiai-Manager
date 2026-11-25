"""Staff password hardening in the app (issue #9), against a throwaway `wrangler dev`:

  * session token: creating a tournament logs the creator in with a session token (no second
    password prompt); Staff Login on another device gets its own token; from then on saves
    (x-ksm-session-key) and the live connection (its `key`) carry the token, never the password;
  * scoring, a reload (with the same staff session) and a second staff device keep working, and both
    devices' points reach the cloud;
  * compatibility for one release: a save that still sends the password (the previous app) is
    accepted;
  * attempt limit: a device that types 5 wrong staff passwords is told how long to wait (the
    server's 429 message); the right password is refused during the wait; logged-in devices
    keep saving and spectators keep their live view meanwhile.
"""
import time
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, DEFAULT_PASSWORD, fetch_record, put_record, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def record_staff_keys(app):
    """Every staff key the device sends: (what, key) for each API request header and live socket URL."""
    sent = []

    def on_request(req):
        if '/api/tournaments' in req.url:
            key = req.headers.get('x-ksm-session-key')
            # Creating the tournament (POST /api/tournaments) is before any login: it carries the
            # new password in its body (and its key header); the server answers with the token.
            if key is not None and urlparse(req.url).path != '/api/tournaments':
                sent.append((f'{req.method} {urlparse(req.url).path}', key))
            # The password goes only to Staff Login (/auth) and to the creation of the tournament.
            if DEFAULT_PASSWORD in (req.post_data or '') and not req.url.endswith('/auth') and urlparse(req.url).path != '/api/tournaments':
                sent.append((f'{req.method} {urlparse(req.url).path} body', DEFAULT_PASSWORD))
    app.page.on('request', on_request)
    app.page.on('websocket', lambda ws: sent.append(('live socket', parse_qs(urlparse(ws.url).query).get('key', [''])[0])))
    return sent


def assert_tokens_only(name, sent, token):
    staff = [(what, key) for what, key in sent if key]
    assert staff, f'{name}: sent no staff key at all'
    leaked = [what for what, key in staff if DEFAULT_PASSWORD in key]
    assert not leaked, f'{name}: the password was sent after login: {leaked}'
    wrong = [(what, key[:12]) for what, key in staff if key != token]
    assert not wrong, f'{name}: keys other than its session token: {wrong}'
    assert any(what == 'live socket' for what, _ in staff), f'{name}: no staff live connection with the token'
    assert any(what.startswith('PUT ') for what, _ in staff), f'{name}: no save with the token'


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)

        # ------------------------------------------------- creator: logged in by the creation
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Hardening Cup')
        director_keys = record_staff_keys(director)
        password_prompts = []
        director.page.on('dialog', lambda d: password_prompts.append(d.message) if 'Staff password' in d.message else None)
        tid = director.create_tournament()
        director.wait_for(lambda: director.staff_session().startswith('ksmst_'), message='the creator to hold a session token')
        token = director.staff_session()
        director.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)}])
        director.save_now()
        director.wait_idle()
        assert password_prompts == ['Create Staff password', 'Confirm Staff password'], f'creator asked: {password_prompts}'
        assert director.staff_session() == token
        director.open_court('A')
        first = director.current_match()
        director.score_point('W', 'M')
        director.wait_idle()
        director.wait_for(lambda: any(what == 'live socket' and key for what, key in director_keys), message='the staff live connection')
        assert_tokens_only('Director', director_keys, token)

        # ------------------------------------- second staff device: Staff Login gets its own token
        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        court_keys = record_staff_keys(court)
        court.wait_generated()
        court.staff_login()
        court_token = court.staff_session()
        assert court_token.startswith('ksmst_') and court_token != token, 'Court A: no session token of its own'
        court.open_court('A')
        court.score_point('R', 'K')
        court.wait_idle()
        court.wait_for(lambda: any(what == 'live socket' and key for what, key in court_keys), message='Court A staff live connection')
        assert_tokens_only('Court A', court_keys, court_token)
        director.wait_for(lambda: director.court_screen()['red_points'] == 'K', message='the director to see Court A\'s point')

        # ------------------------------------------------- reload: staff stays logged in, scoring works
        before_reload = len(court_keys)
        court.reload()
        court.wait_generated()
        court_token_2 = court.staff_session()
        assert court_token_2.startswith('ksmst_') and court_token_2 == court_token
        court.open_court('A')
        court.score_point('W', 'K')
        court.wait_idle()
        assert_tokens_only('Court A after reload', court_keys[before_reload:], court_token_2)
        record = court.wait_for(lambda: (lambda r: r if [m for m in r['payload']['state']['allMatches']['Open']
                                                        if m['white'] == first['white'] and m['red'] == first['red']][0].get('wp') == ['M', 'K'] else None)(fetch_record(base, tid)),
                                message='both devices\' points in the cloud')
        got = [m for m in record['payload']['state']['allMatches']['Open'] if m['white'] == first['white'] and m['red'] == first['red']][0]
        assert (got.get('wp'), got.get('rp')) == (['M', 'K'], ['K']), (got.get('wp'), got.get('rp'))

        # --------------------------------------- compatibility: the previous app's password key
        record = fetch_record(base, tid)
        saved = put_record(base, tid, record['payload'], record['revision'], legacy_password=True, name='Previous app')
        assert saved['revision'] == record['revision'] + 1
        court.wait_revision(saved['revision'])

        # ------------- an expired session (401): the device becomes a spectator, its work waits for login
        expired = lambda route: route.fulfill(status=401, content_type='application/json',
                                              body='{"error":"Staff session expired. Use Staff Login again.","code":"session-expired"}') \
            if route.request.method == 'PUT' else route.continue_()
        director.page.route('**/api/tournaments/**', expired)
        director.score_point('R', 'K')
        director.wait_for(lambda: director.page.inner_text('[data-testid="staff-auth"]').strip() == 'Staff Login',
                          message='the director to be logged out by the expired session')
        assert director.staff_session() == '', 'the expired token is forgotten'
        director.wait_for(director.outbox, message='the unsaved point to be queued')
        director.page.unroute('**/api/tournaments/**', expired)
        director.staff_login()
        assert director.staff_session().startswith('ksmst_') and director.staff_session() != token
        director.wait_for(lambda: not director.outbox(), message='the queued point to be sent after login')
        director.wait_idle()
        got = [m for m in fetch_record(base, tid)['payload']['state']['allMatches']['Open'] if m['white'] == first['white'] and m['red'] == first['red']][0]
        assert got.get('rp') == ['K', 'K'], f'the point scored while the session was expired: {got.get("rp")}'
        court.wait_revision(fetch_record(base, tid)['revision'])

        # ------------------------------------------------------------------- attempt limit
        guesser = KsmApp.open_device(browser, base, 'Guesser', problems, app_path(tid))
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        alerts = [guesser.staff_login_attempt(f'wrong-{i}') for i in range(1, 6)]
        assert alerts[:4] == ['Incorrect Staff password.'] * 4, alerts
        assert alerts[4] == 'Too many incorrect Staff passwords. Try again in 30 seconds.', alerts
        refused = guesser.staff_login_attempt(DEFAULT_PASSWORD)
        assert refused.startswith('Too many incorrect Staff passwords. Try again in '), refused
        assert guesser.page.inner_text('[data-testid="staff-auth"]').strip() == 'Staff Login'
        # Logged-in devices keep scoring during the wait (their token is no password attempt).
        court.score_point('R', 'M')
        court.wait_idle()
        spectator.wait_for(lambda: spectator.revision() >= court.revision(), message='the spectator to follow the court')
        # Spectators are unaffected: a new spectator device still opens the tournament live.
        late = KsmApp.open_device(browser, base, 'Late spectator', problems, app_path(tid))
        late.wait_for(lambda: late.tournament_id() == tid, message='spectator opened the tournament')
        for device in (guesser, spectator, late, court, director):
            device.close()

        assert not problems, '\n'.join(problems)
        print(f'PASS staff login hardening: session tokens only after login (creator, second device, reload), '
              f'password key still accepted, attempt limit message, spectators unaffected ({time.time() - started:.1f}s)')


if __name__ == '__main__':
    main()
