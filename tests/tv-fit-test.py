"""The TV display's 1920x1080 canvas fits any screen (F14).

The TV (?view=tv) is designed as one fixed 1920x1080 picture. It used to sit at the top left at its
own size: on a 1280x720 screen the right and bottom were cut off (and the page could not scroll),
on 4K it was small at the top. Now it is scaled uniformly to fit the window, centred, letterboxed in
the TV background.

Offline TV devices (a Court A TV with a match on, as tv-display-test.py does) at TV, laptop,
4K, 4:3, ultra-wide and portrait sizes, and resized while open: the canvas keeps 16:9, touches two
opposite edges of the window (the largest uniform scale that fits), is centred, nothing of it is
outside the window, the page has no scroll bars, and the bands around it are the TV background.
The scale is CSS (it follows a resize at once); the fallback factor for older browsers
(--ksm-tv-fit, set by script on resize) is checked too. No page error may occur.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp
from ksm_browser import launch_chromium, load_app

SIZES = [(1920, 1080), (1280, 720), (3840, 2160), (1366, 768), (1024, 768), (2560, 1080), (1080, 1920), (800, 450)]
TV_MODE_JS = "() => { document.body.classList.add('ksm-tv'); renderTvDisplay(); show('tv'); }"
MEASURE_JS = """() => {
  const r = document.querySelector('#tvLive .tv3-root').getBoundingClientRect();
  const se = document.scrollingElement;
  return {x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight,
          scroll: [se.scrollWidth, se.scrollHeight, document.body.scrollWidth, document.body.scrollHeight],
          fit: Number(getComputedStyle(document.documentElement).getPropertyValue('--ksm-tv-fit')),
          page: getComputedStyle(document.documentElement).backgroundColor,
          canvas: getComputedStyle(document.querySelector('#tvLive .tv3-root')).backgroundColor};
}"""


def check(page, w, h, label):
    m = page.evaluate(MEASURE_JS)
    scale = min(w / 1920, h / 1080)
    where = f'{label} {w}x{h}: {m}'
    assert abs(m['w'] - 1920 * scale) <= 1 and abs(m['h'] - 1080 * scale) <= 1, f'not scaled to fit (F14): {where}'
    assert m['x'] >= -0.5 and m['y'] >= -0.5 and m['x'] + m['w'] <= w + 0.5 and m['y'] + m['h'] <= h + 0.5, f'cut off (F14): {where}'
    assert abs(m['x'] - (w - m['x'] - m['w'])) <= 1 and abs(m['y'] - (h - m['y'] - m['h'])) <= 1, f'not centred (F14): {where}'
    assert m['scroll'][0] <= w and m['scroll'][1] <= h and m['scroll'][2] <= w and m['scroll'][3] <= h, f'the page scrolls (F14): {where}'
    # The fallback factor for browsers without tan(atan2()) in CSS (set by ksmFitTv() on resize).
    assert abs(m['fit'] - scale) < 0.001, f'--ksm-tv-fit is not the fitting scale: {where}'
    assert m['page'] == m['canvas'], f'the bands around the canvas are not the TV background: {where}'


def main():
    errors = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        for w, h in SIZES:
            page = browser.new_page(viewport={'width': w, 'height': h})
            page.on('pageerror', lambda e: errors.append(str(e)))
            app = KsmApp(page, 'tv')
            load_app(page, query='?court=A')
            app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A',
                            'entrants': [{'name': f'Player {i}', 'dojo': f'Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(1, 5)]}])
            page.evaluate(TV_MODE_JS)
            page.wait_for_timeout(100)
            check(page, w, h, 'opened at')
            page.close()
        # Resized while open (a window dragged, a TV switching modes).
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        page.on('pageerror', lambda e: errors.append(str(e)))
        load_app(page, query='?court=A')
        KsmApp(page, 'tv')
        page.evaluate(TV_MODE_JS)
        for w, h in [(1280, 720), (3840, 2160), (1000, 900), (1920, 1080)]:
            page.set_viewport_size({'width': w, 'height': h})
            page.wait_for_timeout(100)
            check(page, w, h, 'resized to')
        browser.close()
    assert not errors, errors
    print(f'PASS TV fit: the 1920x1080 canvas scales to fit, centred, no scroll ({len(SIZES)} sizes + resizes) (F14)')


if __name__ == '__main__':
    main()
