"""Shared Playwright helpers for the Python browser tests.

Uses Playwright's bundled Chromium by default (`python -m playwright install chromium`).
Set KSM_CHROMIUM_PATH to use a system Chromium instead (e.g. /usr/bin/chromium in CI).

Watch mode: KSM_HEADED=1 opens visible browser windows and KSM_SLOWMO=<ms>
slows every action down (default 250 ms when headed), so a person can follow
a test, e.g. `npm run test:e2e:watch`.
"""
import mimetypes
import os
from ksm_source import DIST, ensure_built

APP_ORIGIN = 'http://ksm.test'


def watch_mode():
    return os.environ.get('KSM_HEADED') == '1'


def launch_chromium(p):
    path = os.environ.get('KSM_CHROMIUM_PATH') or None
    headed = watch_mode()
    slow_mo = float(os.environ.get('KSM_SLOWMO') or (250 if headed else 0))
    return p.chromium.launch(headless=not headed, slow_mo=slow_mo, executable_path=path, args=['--no-sandbox'])


def load_app(page, html=None, wait_until='domcontentloaded', session='staff', query='', api=None, page_path='/'):
    """Open the app on a real http origin so localStorage/sessionStorage work.

    `page.set_content()` leaves the page on about:blank, where storage access throws
    during startup. Requests to APP_ORIGIN are served from the built app in dist/
    (built first if it is stale; `html` replaces index.html when given); /api/*
    returns 503 so the app stays in local/offline mode. `query` (e.g. '?court=B') is
    added to the page URL, for code that reads location.search at start; `page_path` (default /) is
    the page's path, e.g. a path URL /t/<id>/tv/b (served the app, as the host does).

    Since v3.16 the app boots to the Tournament Library as a read-only spectator.
    session='staff' (default) leaves the home page and enables a local staff
    session, as createNewTournament() does minus the cloud round-trip.
    session=None keeps the real boot state (home page, spectator).
    api(route, path), when given, answers the /api/* requests instead (e.g. a test's own
    library responses, tests/golden-library-test.py).
    """
    ensure_built()

    def handle(route):
        path = route.request.url[len(APP_ORIGIN):].split('?', 1)[0].split('#', 1)[0]
        if path.startswith('/api/'):
            if api is not None:
                return api(route, path)
            return route.fulfill(status=503, content_type='application/json', body='{"error":"offline test harness"}')
        # The app's pages, as the host answers them: /, /index.html and the path URLs /t/... (M.9).
        if path in ('', '/', '/index.html', '/t') or path.startswith('/t/'):
            body = html if html is not None else (DIST / 'index.html').read_text(encoding='utf-8')
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=body)
        file = (DIST / path.lstrip('/')).resolve()
        if DIST in file.parents and file.is_file():
            return route.fulfill(status=200, content_type=mimetypes.guess_type(file.name)[0] or 'application/octet-stream', body=file.read_bytes())
        return route.fulfill(status=404, body='')

    page.route(f'{APP_ORIGIN}/**', handle)
    page.goto(f'{APP_ORIGIN}{page_path}{query}', wait_until=wait_until)
    if session == 'staff':
        page.evaluate("""() => {
          document.body.classList.remove('ksm-home');
          setSessionRole('staff');
          installRoleBanner('staff');
          navigateTo('setup');
        }""")
