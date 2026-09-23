"""Shared Playwright helpers for the Python browser tests.

Uses Playwright's bundled Chromium by default (`python -m playwright install chromium`).
Set KSM_CHROMIUM_PATH to use a system Chromium instead (e.g. /usr/bin/chromium in CI).
"""
import mimetypes
import os
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / 'public'
APP_ORIGIN = 'http://ksm.test'


def launch_chromium(p):
    path = os.environ.get('KSM_CHROMIUM_PATH') or None
    return p.chromium.launch(headless=True, executable_path=path, args=['--no-sandbox'])


def load_app(page, html=None, wait_until='domcontentloaded', session='staff'):
    """Open the app on a real http origin so localStorage/sessionStorage work.

    `page.set_content()` leaves the page on about:blank, where storage access throws
    during startup. Requests to APP_ORIGIN are served from public/ (with `html`
    replacing index.html when given); /api/* returns 503 so the app stays in
    local/offline mode.

    Since v3.16 the app boots to the Tournament Library as a read-only spectator.
    session='staff' (default) leaves the home page and enables a local staff
    session, as createNewTournament() does minus the cloud round-trip.
    session=None keeps the real boot state (home page, spectator).
    """
    def handle(route):
        path = route.request.url[len(APP_ORIGIN):].split('?', 1)[0].split('#', 1)[0]
        if path.startswith('/api/'):
            return route.fulfill(status=503, content_type='application/json', body='{"error":"offline test harness"}')
        if path in ('', '/', '/index.html'):
            body = html if html is not None else (PUBLIC / 'index.html').read_text(encoding='utf-8')
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=body)
        file = (PUBLIC / path.lstrip('/')).resolve()
        if PUBLIC in file.parents and file.is_file():
            return route.fulfill(status=200, content_type=mimetypes.guess_type(file.name)[0] or 'application/octet-stream', body=file.read_bytes())
        return route.fulfill(status=404, body='')

    page.route(f'{APP_ORIGIN}/**', handle)
    page.goto(f'{APP_ORIGIN}/', wait_until=wait_until)
    if session == 'staff':
        page.evaluate("""() => {
          document.body.classList.remove('ksm-home');
          setSessionRole('staff');
          installRoleBanner('staff');
          navigateTo('setup');
        }""")
