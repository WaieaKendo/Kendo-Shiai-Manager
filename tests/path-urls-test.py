"""Path URLs (roadmap M.9): every screen's path, every old query link, the links the app makes,
the hosting and the offline app, against a throwaway `wrangler dev`.

  * new paths: /t/<id> and /t/<id>/live open Live Scores as a spectator, /t/<id>/court/b too
    with Court B assigned (the court screen shows Court B), /t/<id>/tv/a|b the TV for that court,
    each also after a reload (the address and the screen stay); /t/<id>/TV/B and /t/<id>/tv are
    tidied to /t/<id>/tv/b and /t/<id>/tv/a;
  * every old link form is replaced by its path (history.replaceState) and behaves as before:
    ?tournament=, ?spectator=, /index.html?tournament=, &court=B, the TV menu's
    ?role=spectator&...&court=A&view=tv, &view=tv without a court, a key= kept as a query
    parameter, /overlay?tournament=&court=B&red=left (the overlay page, options kept);
  * an unknown tournament and a malformed /t/ path fall back to the Tournament Library, as an
    unknown tournament in an old link did (the malformed path is replaced by / and then behaves
    as /: an autosave on the device is offered for restore, as at / before);
  * the links the app makes are paths: Tournament Access (shown, Copy Link, the QR code), the TV
    menu's Court A/B TV, the Court A/B overlay links; back/forward: the app adds no history entry
    (in-app navigation does not change the address, as before);
  * hosting: /t/<id>/overlay/a is the overlay page (overlay.html, no app.js), /t/<id>/... the app;
  * offline: with the service worker installed, a court device opening /t/<id>/court/a or an old
    ?tournament=&court=A link without a network gets the app (redirected to the path); the overlay
    path is not served offline (live-only, as /overlay).
"""
import time
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright, Error as PlaywrightError
from ksm_app import KsmApp, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def fetch(base, path):
    with urllib.request.urlopen(base + path) as r:
        return r.status, r.read().decode('utf-8')


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Paths Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open A', 'format': 'Round Robin', 'court': 'A', 'entrants': people('A', 3)},
            {'name': 'Open B', 'format': 'Round Robin', 'court': 'B', 'entrants': people('B', 3)},
        ])
        director.save_now()
        director.wait_idle()

        # --- Hosting: which page each path gets -------------------------------------------------
        status, overlay_html = fetch(base, app_path(tid, 'overlay', 'a'))
        assert status == 200 and '<title>KSM Stream Overlay</title>' in overlay_html and '/assets/app-' not in overlay_html, overlay_html[:300]
        assert fetch(base, app_path(tid, 'overlay', 'B') + '?red=left')[1] == overlay_html
        assert fetch(base, f'/overlay?tournament={tid}')[1] == overlay_html
        _, index_html = fetch(base, '/')
        assert '/assets/app-' in index_html and 'KSM Stream Overlay' not in index_html
        for path in (app_path(tid), app_path(tid, 'live'), app_path(tid, 'court', 'b'), app_path(tid, 'tv', 'a'), f'/t/{tid}/nonsense', '/t/'):
            assert fetch(base, path) == (200, index_html), f'{path} is not the app'

        device = KsmApp.open_device(browser, base, 'Device', problems)
        page = device.page
        # A page at / with an autosave asks to restore it (as before M.9); links with a tournament never ask.
        device.expect_dialog('Restore autosaved tournament?')

        def opens(path, address, view, message):
            device.goto(path)
            device.wait_for(lambda: device.visible_view() == [view], message=f'{message}: the {view} screen')
            assert device.address() == address, f'{message}: address {device.address()}, expected {address}'

        # --- New paths ------------------------------------------------------------------------
        for path in (app_path(tid), app_path(tid, 'live')):
            opens(path, path, 'public', path)
            device.wait_generated()
            assert device.page.evaluate('KSMTest.role()') == 'spectator' and device.tournament_id() == tid
            device.reload()
            device.wait_for(lambda: device.visible_view() == ['public'], message=f'{path} after reload')
            assert device.address() == path
        opens(app_path(tid, 'court', 'b'), app_path(tid, 'court', 'b'), 'public', 'court B link')
        device.wait_generated()
        device.show_screen('score')
        assert device.court_screen()['court'] == 'B', device.court_screen()
        device.reload()
        device.wait_generated()
        device.show_screen('score')
        assert device.court_screen()['court'] == 'B' and device.address() == app_path(tid, 'court', 'b'), device.court_screen()
        for court in ('A', 'B'):
            opens(app_path(tid, 'tv', court), app_path(tid, 'tv', court), 'tv', f'Court {court} TV')
            device.wait_for(lambda: device.tv_screen()['court'] == court, message=f'the Court {court} TV display')
            device.reload()
            device.wait_for(lambda: device.tv_screen()['court'] == court and device.visible_view() == ['tv'], message=f'Court {court} TV after reload')
            assert device.address() == app_path(tid, 'tv', court)
        opens(f'/t/{tid}/TV/B', app_path(tid, 'tv', 'b'), 'tv', 'uppercase TV path')
        device.wait_for(lambda: device.tv_screen()['court'] == 'B', message='the tidied Court B TV')
        opens(f'/t/{tid}/tv', app_path(tid, 'tv', 'a'), 'tv', 'TV path without a court')
        device.wait_for(lambda: device.tv_screen()['court'] == 'A', message='Court A for a TV path without a court')

        # --- Old query links: replaced by their path, same screen ----------------------------------
        old_links = [
            (f'/?tournament={tid}', app_path(tid), 'public'),
            (f'/?spectator={tid}', app_path(tid), 'public'),
            (f'/index.html?tournament={tid}', app_path(tid), 'public'),
            (f'/?tournament={tid}&court=B', app_path(tid, 'court', 'b'), 'public'),
            (f'/?role=spectator&tournament={tid}&court=A&view=tv', app_path(tid, 'tv', 'a'), 'tv'),
            (f'/?role=spectator&tournament={tid}&court=B&view=tv', app_path(tid, 'tv', 'b'), 'tv'),
            (f'/?tournament={tid}&view=tv', app_path(tid, 'tv', 'a'), 'tv'),
            (f'/?role=spectator&tournament={tid}&key=k1&court=B&view=tv', app_path(tid, 'tv', 'b') + '?key=k1', 'tv'),
        ]
        for old, new, view in old_links:
            opens(old, new, view, old)
            device.wait_generated()
            assert device.tournament_id() == tid, old
            if view == 'tv':
                court = new.split('/tv/')[1][0].upper()
                device.wait_for(lambda: device.tv_screen()['court'] == court, message=f'{old}: the Court {court} TV')
            if '&court=B' in old and view == 'public':
                device.show_screen('score')
                assert device.court_screen()['court'] == 'B', f'{old}: {device.court_screen()}'
        # The old overlay link opens the overlay page at its path, its options kept.
        page.goto(f'{base}/overlay?tournament={tid}&court=B&red=left', wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('[data-testid=overlay]')?.dataset.state === 'match'", timeout=15000)
        assert device.address() == app_path(tid, 'overlay', 'b') + '?red=left', device.address()
        assert page.text_content(sel('overlay-court')).strip() == 'Court B'
        assert [e.get_attribute('data-testid') for e in page.query_selector_all('.ov-side')] == ['overlay-red', 'overlay-white'], 'red=left lost'
        page.goto(f'{base}{app_path(tid, "overlay", "a")}', wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('[data-testid=overlay]')?.dataset.state === 'match'", timeout=15000)
        assert page.text_content(sel('overlay-court')).strip() == 'Court A' and page.evaluate('typeof state') == 'undefined'

        # --- Unknown and malformed: the Tournament Library ------------------------------------------
        for path, address in ((app_path('00000000-0000-4000-8000-000000000000'), app_path('00000000-0000-4000-8000-000000000000')),
                              ('/?tournament=00000000-0000-4000-8000-000000000000', app_path('00000000-0000-4000-8000-000000000000')),
                              (f'/t/{tid}/nonsense', '/'), (f'/t/{tid}/court/c?x=1', '/'), ('/t/', '/')):
            opens(path, '/', 'home', path)
            assert page.evaluate("document.body.classList.contains('ksm-home')"), path
            page.wait_for_selector(f'{sel("home-tournament-name")}:has-text("Paths Cup")')
        # Only the three malformed paths (now /) asked; the unknown tournament's links did not.
        assert len(device.seen_dialogs) == 3, device.seen_dialogs

        # --- No history entries: back leaves the app's page as before ----------------------------
        device.goto(f'/?tournament={tid}&court=B')
        device.wait_generated()
        length = page.evaluate('history.length')
        device.nav('results')
        device.nav('live-scores')
        assert page.evaluate('history.length') == length and device.address() == app_path(tid, 'court', 'b')
        page.go_back(wait_until='domcontentloaded')
        page.wait_for_function('window.KSMTest && KSMTest.booted()')
        assert device.address() == '/', f'back should return to the page before the link, at {device.address()}'
        page.go_forward(wait_until='domcontentloaded')
        page.wait_for_function('window.KSMTest && KSMTest.booted()')
        device.wait_for(lambda: device.visible_view() == ['public'], message='forward: Live Scores')
        assert device.address() == app_path(tid, 'court', 'b'), device.address()
        device.close()

        # --- Links the app makes --------------------------------------------------------------------
        dpage = director.page
        dpage.context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
        director.click('nav-save-load')
        director.click('nav-tournament-access')
        dpage.wait_for_selector(sel('access-link'))
        link = dpage.inner_text(sel('access-link')).strip()
        assert link == f'{base}{app_path(tid)}', link
        qr = dpage.get_attribute(sel('access-qr'), 'src') or ''
        assert urllib.parse.quote(link, safe='') in qr, qr
        director.click('access-copy')
        director.wait_for(lambda: dpage.evaluate('navigator.clipboard.readText()') == link, message='Copy Link')
        director.click('cloud-modal-close')
        for court in ('A', 'B'):
            assert director.tv_link(court) == f'{base}{app_path(tid, "tv", court)}', director.tv_link(court)
            dpage.evaluate("navigator.clipboard.writeText = async t => { window.__copied = t }")
            dpage.evaluate('window.__copied = null')
            director.click('nav-tv')
            director.click(f'nav-overlay-{court.lower()}')
            copied = dpage.wait_for_function('window.__copied').json_value()
            assert copied == f'{base}{app_path(tid, "overlay", court)}', copied
        assert director.address() == '/', f'the director never had a link in the address: {director.address()}'

        # --- Offline: the service worker serves the app for /t/ paths -------------------------------
        court = KsmApp.open_device(browser, base, 'Offline court', problems, app_path(tid, 'court', 'a'), service_workers='allow')
        court.wait_generated()
        cpage = court.page
        cpage.wait_for_function('navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true)', timeout=15000)
        cpage.evaluate('navigator.serviceWorker.ready.then(() => true)')
        court.wait_for(lambda: cpage.evaluate("caches.keys().then(async keys => keys.length > 0 && Boolean(await caches.match('/index.html')))"),
                       message='the offline copy of the app')
        cpage.context.set_offline(True)
        for path, address in ((app_path(tid, 'court', 'a'), app_path(tid, 'court', 'a')), (app_path(tid, 'tv', 'b'), app_path(tid, 'tv', 'b')),
                              (f'/?tournament={tid}&court=A', app_path(tid, 'court', 'a'))):
            court.goto(path)
            assert cpage.evaluate("typeof initializeCloudRoleFromUrl === 'function' && Boolean(document.querySelector('#score'))"), f'offline {path}: not the app'
            assert court.address() == address, f'offline {path}: {court.address()}'
        try:
            cpage.goto(f'{base}{app_path(tid, "overlay", "a")}', wait_until='domcontentloaded')
            served = cpage.evaluate("Boolean(document.querySelector('#overlay-root') || document.querySelector('#score'))")
        except PlaywrightError:
            served = False
        assert not served, 'the overlay is live-only: no offline copy'
        cpage.context.set_offline(False)
        court.close()

        assert not problems, '\n'.join(problems)
        print(f'PASS path URLs: new paths + reload, {len(old_links) + 1} old link forms, unknown/malformed, generated links, '
              f'hosting, offline app ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
