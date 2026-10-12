"""Stream overlay (/overlay) against a local backend: the real app, TV and overlay.

  * A director creates a tournament; the overlay opened before generation shows its
    idle state, then the first match once the tournament is generated.
  * Court A: the overlay shows the same current match and "Next" as the Court A TV,
    and follows a point, a hansoku and Next Match within seconds.
  * Court B runs a team round robin: ?court=B&red=left shows the teams, the current
    position and the bout, with Red on the left.
  * The staff TV menu offers a copyable overlay link per court.
  * The page is transparent, sends no PUT/POST/DELETE, and at 733x1303 on a landscape
    device (PRISM's portrait widget) switches to band mode at 74% of the height.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

PLAYERS = ['Aoki Ken', 'Baba Jun', 'Chiba Rei', 'Doi Sho']
# A point reaches the server after the app's save debounce (~3 s), then the overlay through the live
# connection. 10 s was too tight once on a busy GitHub runner (a save that met a conflict and was
# replayed); 20 s still catches an update that never arrives, and the failure message says where it is.
UPDATE_SECONDS = 20


def overlay_page(browser, base, path, writes, viewport=None, screen=None):
    opts = {'viewport': viewport or {'width': 1920, 'height': 1080}, 'service_workers': 'block'}
    if screen:
        opts['screen'] = screen
    ctx = browser.new_context(**opts)
    page = ctx.new_page()
    page.on('request', lambda r: writes.append(f'{r.method} {r.url}') if r.method not in ('GET', 'HEAD', 'OPTIONS') else None)
    page.goto(f'{base}{path}', wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('[data-testid=overlay]')?.dataset.state !== 'loading'", timeout=15000)
    return page


def overlay(page):
    return page.evaluate("""() => {
      const root = document.querySelector('[data-testid="overlay"]');
      const t = id => (root.querySelector(`[data-testid="${id}"]`)?.textContent || '').trim();
      return {state: root.dataset.state, mode: root.dataset.mode, status: root.dataset.status,
              court: t('overlay-court'), division: t('overlay-division'), meta: t('overlay-meta'),
              white: t('overlay-white-name'), red: t('overlay-red-name'),
              white_sub: t('overlay-white-sub'), red_sub: t('overlay-red-sub'),
              white_points: t('overlay-white-points'), red_points: t('overlay-red-points'),
              red_hansoku: Number(root.querySelector('[data-testid="overlay-red-hansoku"]')?.dataset.count || 0),
              next: t('overlay-next').replace(/^Next:\\s*/, ''),
              sides: [...root.querySelectorAll('.ov-side')].map(e => e.dataset.testid)};
    }""")


def wait_overlay(page, predicate, message, timeout=UPDATE_SECONDS, source=None):
    """`source`: the scoring device's KsmApp, for its save state in the failure message."""
    deadline, last = time.time() + timeout, None
    while time.time() < deadline:
        last = overlay(page)
        if predicate(last):
            return last
        time.sleep(0.1)
    where = ''
    if source is not None:
        try:
            where = f'; scoring device: revision {source.page.evaluate("KSMTest.revision()")}, pending {source.page.evaluate("KSMTest.pending()")}'
        except Exception as error:  # the page may be gone
            where = f'; scoring device unreadable: {error}'
    raise AssertionError(f'overlay: timed out waiting for {message}; last={last}{where}')


def main():
    problems, writes = [], []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Overlay Cup')
        tid = director.create_tournament()
        director.wait_idle()

        # --- Idle before the tournament is generated; transparent page ----------------
        ov_a = overlay_page(browser, base, app_path(tid, 'overlay', 'A'), writes)
        o = wait_overlay(ov_a, lambda o: o['state'] == 'idle', 'idle state')
        assert o['court'] == 'Court A', o
        bg = ov_a.evaluate("() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor]")
        assert bg == ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'], f'overlay page must be transparent, got {bg}'

        director.configure([
            {'name': 'Court A Open', 'format': 'Round Robin', 'court': 'A',
             'entrants': [{'name': n, 'dojo': f'Dojo {i}', 'seed': '', 'status': 'Checked'} for i, n in enumerate(PLAYERS)]},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 3, 'court': 'B'},
        ])
        director.save_now('Overlay generate')
        director.wait_idle()
        wait_overlay(ov_a, lambda o: o['state'] == 'match', 'the first match after generation')

        # --- Court A: same match and "Next" as the TV ----------------------------------
        tv = KsmApp.open_device(browser, base, 'TV A', problems, director.tv_link('A').replace(base, ''))
        tv.wait_for(lambda: tv.tv_screen()['live'], message='TV current match')

        def tv_now():
            s, up = tv.tv_screen(), tv.tv_upcoming()
            return {'white': s['white'], 'red': s['red'], 'division': s['division'], 'meta': s['meta'],
                    'next': f'{up[0][0]} vs {up[0][1]}' if up and up[0] else ''}

        def same_as_tv(o):
            t = tv_now()
            return o['state'] == 'match' and (o['white'], o['red'], o['division'], o['meta'], o['next']) == \
                (t['white'], t['red'], t['division'], t['meta'], t['next'])

        o = wait_overlay(ov_a, same_as_tv, 'Court A overlay = Court A TV')
        assert o['white_sub'].startswith('Dojo') and o['red_sub'].startswith('Dojo') and o['next'], o
        assert o['sides'] == ['overlay-white', 'overlay-red'], o

        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'),
                                   before_load=lambda pg: pg.add_init_script(
                                       "window.__ksmChanges=0;addEventListener('ksm:state-changed',()=>window.__ksmChanges++)"))
        court.wait_generated()
        court.staff_login()
        court.open_court('A')
        m = court.wait_for(court.current_match, message='a match on Court A')
        assert (m['white'], m['red']) == (o['white'], o['red']), f'scorekeeper {m} vs overlay {o}'

        started = time.time()
        court.score_point('W', 'M')
        wait_overlay(ov_a, lambda o: o['white_points'] == 'M', 'White Men on the overlay', source=court)
        point_s = time.time() - started
        assert court.page.evaluate('window.__ksmChanges') > 0, 'no ksm:state-changed event after a court action'
        court.hansoku('R')
        wait_overlay(ov_a, lambda o: o['red_hansoku'] == 1, 'Red hansoku indicator', source=court)

        first = (o['white'], o['red'])
        started = time.time()
        court.next_match()
        tv.wait_for(lambda: (tv.tv_screen()['white'], tv.tv_screen()['red']) != first, message='TV next match')
        o = wait_overlay(ov_a, lambda o: (o['white'], o['red']) != first and same_as_tv(o), 'overlay = TV after Next Match')
        next_s = time.time() - started
        assert o['white_points'] == '' and o['red_hansoku'] == 0, o

        # --- Court B: team match, Red on the left ---------------------------------------
        tv_b = KsmApp.open_device(browser, base, 'TV B', problems, director.tv_link('B').replace(base, ''))
        tv_b.wait_for(lambda: tv_b.tv_screen()['live'], message='TV B current match')
        ov_b = overlay_page(browser, base, app_path(tid, 'overlay', 'B') + '?red=left', writes)
        tb = tv_b.tv_screen()
        o = wait_overlay(ov_b, lambda o: o['state'] == 'match' and o['white_sub'] == tb['white_team'], 'Court B team match')
        assert o['court'] == 'Court B' and o['red_sub'] == tb['red_team'], (o, tb)
        assert o['meta'] == tb['meta'] == 'Senpo', (o, tb)
        assert o['white'] in tb['white'] and o['red'] in tb['red'], (o, tb)  # TV adds the bout number
        assert o['sides'] == ['overlay-red', 'overlay-white'], o

        # --- Staff TV menu: copy the overlay link ---------------------------------------
        court.page.evaluate("navigator.clipboard.writeText = async t => { window.__copied = t }")
        court.click('nav-tv')
        court.click('nav-overlay-a')
        link = court.page.wait_for_function('window.__copied').json_value()
        assert link == f'{base}{app_path(tid, "overlay", "A")}', link
        court.click('nav-tv')
        assert court.page.is_visible(sel('nav-overlay-b')), 'no Court B overlay link'

        # --- Band mode: PRISM portrait widget on a landscape phone ----------------------
        band = overlay_page(browser, base, app_path(tid, 'overlay', 'A') + '?debug=1', writes,
                            viewport={'width': 733, 'height': 1303}, screen={'width': 2340, 'height': 1080})
        o = wait_overlay(band, lambda o: o['state'] == 'match', 'band-mode match')
        assert o['mode'] == 'band', o
        box = band.locator(sel('overlay-bar')).bounding_box()
        assert abs(box['width'] - 733 * 1680 / 1920) < 2, box
        assert abs(box['y'] - 0.74 * 1303) < 2 and box['height'] < 1303 * 0.1, box
        debug = band.inner_text(sel('overlay-debug'))
        assert '733×1303' in debug and 'page portrait' in debug and 'device landscape' in debug and 'band y=74%' in debug, debug
        custom = overlay_page(browser, base, app_path(tid, 'overlay', 'A') + '?y=50', writes,
                              viewport={'width': 733, 'height': 1303}, screen={'width': 2340, 'height': 1080})
        wait_overlay(custom, lambda o: o['state'] == 'match', 'y=50 match')
        assert abs(custom.locator(sel('overlay-bar')).bounding_box()['y'] - 0.5 * 1303) < 2
        normal = ov_a.locator(sel('overlay-bar')).bounding_box()
        assert overlay(ov_a)['mode'] == 'normal' and normal['y'] > 1080 * 0.75, normal

        assert not writes, f'overlay pages must be read-only: {writes}'
        assert not problems, '\n'.join(problems)
        print(f'PASS overlay matches the Court A TV (point {point_s:.1f}s, Next Match {next_s:.1f}s), '
              f'idle state, team match on Court B, copy link, transparent, read-only, band mode')
        browser.close()


if __name__ == '__main__':
    main()
