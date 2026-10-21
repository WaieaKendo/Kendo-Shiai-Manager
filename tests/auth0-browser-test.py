"""Real SPA SDK redirect/PKCE against a local OAuth/JWKS mock; real Worker checks all roles."""
import json
import subprocess
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from ksm_browser import launch_chromium, install_test_api
from ksm_server import local_worker

ROOT = Path(__file__).resolve().parents[1]


def main():
    mock = subprocess.Popen(['node', str(ROOT / 'tests/lib/mock-auth0.mjs')], cwd=ROOT, stdout=subprocess.PIPE, text=True)
    try:
        config = json.loads(mock.stdout.readline())
        variables = {'AUTH0_DOMAIN': config['issuer'], 'AUTH0_AUDIENCE': config['audience'], 'AUTH0_CLIENT_ID': config['clientId'], 'ADMIN_EMAILS': 'admin@example.com'}
        def token(email):
            with urllib.request.urlopen(config['issuer'] + 'test/token?email=' + email) as r:
                return json.load(r)['token']
        admin_token = token('admin@example.com')
        with local_worker(variables=variables) as base, sync_playwright() as p:
            browser = launch_chromium(p)
            api = p.request.new_context(base_url=base, extra_http_headers={'authorization': 'Bearer ' + admin_token, 'x-ksm-client-schema': '3', 'x-ksm-role': 'staff'})
            seed = browser.new_page()
            install_test_api(seed)
            seed.goto(base)
            seed.wait_for_function('!!window.ksmAuthBridge')
            payload = seed.evaluate('KSMTest.payload()')
            seed.close()
            def create(name):
                payload['setup']['tName'] = name
                response = api.post('/api/tournaments', data={'staffPassword': 'fallback-pass', 'payload': payload, 'revision': 0})
                assert response.ok, response.text()
                return response.json()['tournamentId']
            a, b = create('Auth A'), create('Auth B')
            assert api.post(f'/api/tournaments/{a}/directors', data={'email': 'director@example.com'}).ok
            guest = browser.new_context()
            landing = guest.new_page()
            held = []
            landing.route('**/api/auth/config', lambda route: held.append(route))
            landing.goto(base, wait_until='domcontentloaded')
            landing.wait_for_timeout(100)
            assert held, 'configuration request was not held'
            assert not landing.get_by_test_id('home-new-tournament').is_visible(), 'startup leaked management controls'
            assert not landing.locator('header.ksm-topbar').is_visible(), 'startup flashed the tournament header'
            held[0].fulfill(response=guest.request.get(base + '/api/auth/config'))
            landing.unroute('**/api/auth/config')
            expect(landing.get_by_test_id('library-sign-in')).to_be_visible()
            button_box = landing.get_by_test_id('library-sign-in').bounding_box()
            brand_box = landing.locator('#home .home-brand').bounding_box()
            assert abs(button_box['x'] + button_box['width'] - brand_box['x'] - brand_box['width']) < 2
            landing.get_by_test_id('library-sign-in').click()
            landing.get_by_label('Email').fill('denied@example.com')
            landing.get_by_role('button', name='Continue', exact=True).click()
            expect(landing.get_by_test_id('auth0-error')).to_contain_text('Service not found')
            landing.wait_for_url(base + '/')
            expect(landing.get_by_test_id('home-new-tournament')).to_have_count(0)
            expect(landing.get_by_test_id('library-return')).to_have_count(0)
            expect(landing.get_by_test_id('library-load-file')).to_have_count(0)
            expect(landing.get_by_test_id('home-tournament')).to_have_count(0)
            landing.goto(base + f'/t/{a}/overview')
            expect(landing.get_by_test_id('tournament-not-viewable')).to_contain_text('Tournament not viewable')
            expect(landing.get_by_test_id('tournament-not-viewable')).to_contain_text('Sign in')
            assert guest.request.get(base + f'/api/tournaments/{a}').status == 403
            guest.close()
            def signed_device(email, tid, width=1280):
                context = browser.new_context(viewport={'width': width, 'height': 850})
                page = context.new_page()
                install_test_api(page)
                page.goto(base + f'/t/{tid}/overview')
                page.get_by_test_id('auth0-sign-in').wait_for()
                page.get_by_test_id('auth0-sign-in').click()
                page.get_by_label('Email').fill(email)
                page.get_by_role('button', name='Continue', exact=True).click()
                page.wait_for_url(base + f'/t/{tid}/overview')
                expect(page.get_by_test_id('account-role')).to_be_visible(timeout=15000)
                return context, page
            director_context, director = signed_device('director@example.com', a, 390)
            director.reload()
            expect(director.get_by_test_id('account-role')).to_contain_text('Director · Auth A')
            assert director.get_by_test_id('account-role').evaluate('(el) => getComputedStyle(el).backgroundColor') == 'rgb(254, 243, 199)'
            assert director.get_by_test_id('account-role').evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)') <= 12
            assert director.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'phone overflows'
            assert director.evaluate("sessionStorage.getItem('ksm.staff.session.v3_16')") is None
            # Calls use the same real access token the SDK obtained, not client-supplied roles.
            def write_status(page, tid, method='PUT'):
                return page.evaluate('''async ({id,method}) => {
                  const h=window.ksmAuthBridge.headers();
                  const response=await fetch('/api/tournaments/'+id,{method,headers:h,...(method==='PUT'?{body:JSON.stringify({revision:-1})}:{})});return response.status;
                }''', {'id': tid, 'method': method})
            assert write_status(director, a) == 409
            assert write_status(director, b) == 403
            assert write_status(director, a, 'DELETE') == 403
            assert director.get_by_test_id('directors-management').count() == 0
            admin_context, admin = signed_device('admin@example.com', a)
            admin.reload()
            expect(admin.get_by_test_id('account-role')).to_contain_text('Admin')
            expect(admin.get_by_test_id('library-account')).to_contain_text('admin@example.com')
            assert admin.get_by_test_id('account-role').evaluate('(el) => getComputedStyle(el).backgroundColor') == 'rgb(237, 233, 254)'
            assert write_status(admin, a) == 409 and write_status(admin, b) == 409
            admin.evaluate("KSMTest.show('setup')")
            expect(admin.get_by_test_id('directors-management')).to_be_visible()
            toggle = admin.get_by_test_id('tournament-visibility').get_by_role('checkbox')
            expect(toggle).not_to_be_checked()
            toggle.check()
            expect(toggle).to_be_checked()
            expect(admin.get_by_test_id('library-manage')).to_have_count(2)
            expect(admin.get_by_test_id('tournament-visibility')).to_contain_text('Anyone can find')
            admin.get_by_test_id('director-email').fill('second@example.com')
            admin.get_by_role('button', name='Add director', exact=True).click()
            expect(admin.get_by_role('button', name='Remove second@example.com')).to_be_visible()
            admin.get_by_role('button', name='Remove second@example.com').click()
            expect(admin.get_by_role('button', name='Remove second@example.com')).to_have_count(0)
            # On an authenticated browser a TV link is still read-only and shows no header/strip.
            admin.goto(base + f'/t/{a}/tv/a')
            expect(admin.locator('body')).to_have_class(__import__('re').compile('ksm-tv'))
            assert not admin.locator('header.ksm-topbar').is_visible()
            assert admin.get_by_test_id('account-role').count() == 0
            spectator_context = browser.new_context()
            spectator = spectator_context.new_page()
            install_test_api(spectator)
            writes = []
            spectator.on('request', lambda req: writes.append(req.url) if '/api/' in req.url and req.method in ('PUT','DELETE') else None)
            spectator.goto(base + f'/t/{a}/overview')
            expect(spectator.get_by_test_id('auth0-sign-in')).to_have_text('Sign in')
            assert spectator.get_by_test_id('account-role').count() == 0
            assert spectator.get_by_test_id('directors-management').count() == 0
            assert spectator.evaluate("KSMTest.role() === 'spectator'")
            assert not writes
            # A live public spectator is removed when the tournament becomes private.
            spectator.wait_for_function("KSMTest.pendingReason().socket === 'open'")
            assert api.put(f'/api/tournaments/{a}/visibility', data={'isPublic':False}).ok
            expect(spectator.get_by_test_id('tournament-not-viewable')).to_be_visible(timeout=15000)
            assert spectator_context.request.get(base + f'/api/tournaments/{a}').status == 403
            # Removing a director immediately revokes new writes even with a valid signed JWT.
            assert api.delete(f'/api/tournaments/{a}/directors', data={'email':'director@example.com'}).ok
            assert write_status(director, a) == 403
            # The tab cache survives reload but explicit sign-out clears it.
            admin.goto(base)
            expect(admin.get_by_test_id('library-account')).to_contain_text('Admin')
            account_box = admin.get_by_test_id('library-account').bounding_box()
            signout_box = admin.get_by_test_id('library-sign-in').bounding_box()
            assert account_box['x'] > admin.viewport_size['width'] / 2
            assert abs(account_box['y'] + account_box['height'] / 2 - signout_box['y'] - signout_box['height'] / 2) < 3
            expect(admin.get_by_role('heading', name='Tournaments', exact=True)).to_be_visible()
            admin.get_by_test_id('library-sign-in').click()
            expect(admin.get_by_test_id('library-sign-in')).to_have_text('Sign in')
            assert admin.evaluate("Object.keys(sessionStorage).filter(k => k.startsWith('ksm.auth0.')).length") == 0
            admin.reload()
            expect(admin.get_by_test_id('library-sign-in')).to_have_text('Sign in')
            admin.get_by_test_id('library-sign-in').click()
            admin.get_by_label('Email').fill('outsider@example.com')
            admin.get_by_role('button', name='Continue', exact=True).click()
            expect(admin.get_by_test_id('library-account')).to_contain_text('outsider@example.com')
            expect(admin.get_by_test_id('library-account')).to_contain_text('No management access')
            expect(admin.get_by_test_id('home-new-tournament')).to_have_count(0)
            for context in [director_context, admin_context, spectator_context]:
                context.close()
            api.dispose()
            browser.close()
        print('PASS Auth0 PKCE sign-in, per-tournament roles, director management, role palette, phones and public TV')
    finally:
        mock.terminate()
        mock.wait(timeout=10)


if __name__ == '__main__':
    main()
