"""Rendered layout of the staff and audience screens on phones and desktop (offline app).

Bounding boxes and computed styles, not CSS source text:
  * phone portrait (390×844) and landscape (844×390): no sideways scroll; header nav
    collapses behind a hamburger and a long tournament name fits in at most two lines;
  * court screen, phone landscape: both scoring panels flank the centered timer,
    compact action buttons; Next Match stays gold;
  * Live Scores: courts stacked on a phone in portrait, side by side on desktop;
  * Results: two columns on a phone in landscape; card titles on one line;
  * validation modal: actions inside the card, aligned right on desktop;
  * division complete: placements without boxes, 1st/2nd/3rd in gold/silver/bronze.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

PORTRAIT, LANDSCAPE, DESKTOP = (390, 844), (844, 390), (1280, 900)
LONG_NAME = 'Hawaii Kendo Federation Annual Spring Invitational Shiai Championship'
GOLD, SILVER, BRONZE, NEXT_GOLD = 'rgb(201, 155, 56)', 'rgb(174, 180, 189)', 'rgb(182, 123, 74)', 'rgb(223, 161, 58)'

BOX_JS = """(q) => [...document.querySelectorAll(q)].filter(e => e.offsetParent !== null).map(e => {
  const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return {x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), h: Math.round(r.height),
          lh: parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2, bg: s.backgroundColor, bgi: s.backgroundImage, color: s.color,
          border: s.borderTopWidth, shadow: s.boxShadow, ws: s.whiteSpace}; })"""


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def boxes(page, query):
    return page.evaluate(BOX_JS, query)


def no_sideways_scroll(page, label):
    width, inner = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
    assert width <= inner, f'{label}: page scrolls sideways ({width} > {inner})'


def court_band(page, size, label, widen=False):
    """Phone landscape court: ten scoring buttons in matching rows; the four action buttons in one compact row;
    nothing off screen or scrolling sideways; the heading stack clear of the scores. `widen` adds letter
    spacing to every label, a stand-in for a wider font (Linux CI renders wider than macOS)."""
    page.set_viewport_size({'width': size[0], 'height': size[1]})
    if widen:
        page.add_style_tag(content='#score *{letter-spacing:.06em !important}')
    page.mouse.move(0, 0)  # a hovered button lifts 1px (translateY); that is not layout
    page.wait_for_timeout(400)  # let the resize reflow and any transitions settle before measuring
    page.evaluate('window.scrollTo(0, 0)')  # the layout is measured from the top, not from wherever the page happened to scroll
    points = boxes(page, '#score [data-testid^="point-"], #score [data-testid^="hansoku-"]')
    assert len(points) == 10 and [b['y'] for b in points[:5]] == [b['y'] for b in points[5:]], f'{label}: scoring panels must have matching rows: {points}'
    # The timer packs its eight controls into one row from 700 px wide; a narrower landscape phone needs two rows,
    # which pushes the action buttons further below the fold (the page scrolls). The measurement is from the top of the page.
    limit = 60 if size[0] >= 700 else 140
    actions = boxes(page, '#score [data-testid="undo"], #score [data-testid="redo"], #score [data-testid="fusen-gachi"], #score [data-testid="next-match"]')
    assert len(actions) == 4 and all(b['h'] <= 40 for b in actions) and max(b['b'] for b in actions) <= size[1] + limit, \
        f'{label}: compact action buttons expected: {actions}'
    assert len({b['y'] for b in actions}) == 1, f'{label}: the four action buttons must share one row: {actions}'
    assert all(b['r'] <= size[0] and b['x'] >= 0 for b in points + actions), f'{label}: court controls off screen'
    no_sideways_scroll(page, label)
    clipped = page.evaluate("""() => [...document.querySelectorAll('#score .bottom-action-row button')]
        .filter(b => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1).map(b => b.dataset.testid)""")
    assert not clipped, f'{label}: action button content is clipped: {clipped}'
    head = page.evaluate("""() => { const h = document.querySelector('#score .scoreboard-heading-center').getBoundingClientRect();
        const r = document.querySelector('#score .scoreboard-score-row').getBoundingClientRect(); return {hb: h.bottom, st: r.top}; }""")
    assert head['hb'] <= head['st'] + 1, f'{label}: heading stack overlaps the scores: {head}'
    tags = boxes(page, sel('court-encho-note')) + boxes(page, sel('court-rule-tag'))
    assert all(n['x'] >= 0 and n['r'] <= size[0] for n in tags), f'{label}: encho note / rule tag off screen: {tags}'


def main():
    started = time.time()
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport=dict(zip(('width', 'height'), DESKTOP)))
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: d.dismiss())
        app = KsmApp.local(page)
        # Measure an existing staff tournament; offline autosaves must not open
        # creation-password prompts in the middle of a navigation click.
        page.evaluate("() => { cloudSession.tournamentId='layout-cup'; sessionStorage.setItem(KSM_V316_STAFF_SESSION,'ksmst_layout_fixture'); }")
        page.fill(sel('setup-tournament-name'), LONG_NAME)
        page.press(sel('setup-tournament-name'), 'Tab')

        # --- Validation modal (desktop) ------------------------------------------------------------
        app.setup_divisions([('Mens Individual', 'Single Elimination', 'A'), ('Womens Individual', 'Round Robin', 'B')])
        for i in range(4):
            app.register(f'M {i + 1}', 'Dojo', 'Mens Individual')
        for i in range(3):
            app.register(f'W {i + 1}', 'Dojo', 'Womens Individual')
        app.nav('registration')
        app.click('generate-button')
        page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
        card = page.locator(f'{sel("validation-modal")} > *').first.bounding_box()
        confirm, cancel = page.locator(sel('generate-confirm')).bounding_box(), page.locator(sel('generate-cancel')).bounding_box()
        right = max(confirm['x'] + confirm['width'], cancel['x'] + cancel['width'])
        assert card['x'] < cancel['x'] and right < card['x'] + card['width'] and card['x'] + card['width'] - right < 60, \
            f'validation actions should sit inset at the right of the card: card {card}, buttons {confirm} {cancel}'
        app.click('generate-confirm')
        app.wait_generated()

        for label, (w, h) in (('portrait', PORTRAIT), ('landscape', LANDSCAPE)):
            page.set_viewport_size({'width': w, 'height': h})
            for view in ('setup', 'public', 'results'):
                app.show_screen(view)
                no_sideways_scroll(page, f'{label} {view}')
            app.open_court('A')
            no_sideways_scroll(page, f'{label} court')
            # Choosing a court collapses the mobile navigation; the toggle stays reachable.
            assert page.locator('nav.minimal-nav').is_hidden(), f'{label}: mobile nav stays expanded'
            toggle = boxes(page, sel('nav-toggle'))[0]
            assert toggle['x'] >= 0 and toggle['r'] <= w and toggle['h'] >= 44, f'{label}: hamburger {toggle}'
            name = boxes(page, sel('court-tournament-name'))[0]
            assert name['r'] <= w and name['h'] <= 2 * name['lh'] + 2, f'{label}: tournament name {name}'

        # --- Court screen in phone landscape ----------------------------------------------------------
        page.set_viewport_size({'width': LANDSCAPE[0], 'height': LANDSCAPE[1]})
        app.open_court('A')
        court_band(page, LANDSCAPE, 'phone landscape')
        for size in (LANDSCAPE, DESKTOP):
            page.set_viewport_size(dict(zip(('width', 'height'), size)))
            nxt = boxes(page, sel('next-match'))[0]
            assert NEXT_GOLD in (nxt['bg'] + nxt['bgi']).replace('223,161,58', NEXT_GOLD), f'Next Match is not gold at {size}: {nxt}'

        # A tied bout changes the labels (the encho note on a winner-required bout; "Next Match (Hikiwake)" and
        # no extra header badge on a pool bout). They must not push the four action buttons onto a second row or
        # overflow, at the test's phone landscape and at narrower landscape widths, whatever the fonts.
        for court, shown in (('A', 'court-encho-note'), ('B', 'next-match')):
            page.set_viewport_size({'width': LANDSCAPE[0], 'height': LANDSCAPE[1]})
            app.open_court(court)
            app.score_point('W', 'M')
            app.score_point('R', 'M')
            page.wait_for_selector(sel(shown))
            if court == 'B':
                page.wait_for_function("document.querySelector('[data-testid=\"next-match\"]').textContent.includes('Hikiwake')")
            for size in (LANDSCAPE, (740, 390), (667, 375), (568, 375)):
                court_band(page, size, f'tied court {court} at {size}')
            court_band(page, LANDSCAPE, f'tied court {court}, widened labels', widen=True)
            page.set_viewport_size({'width': LANDSCAPE[0], 'height': LANDSCAPE[1]})
            app.undo()
            app.undo()

        # --- Live Scores: stacked on a phone, side by side on desktop ------------------------------------
        page.set_viewport_size({'width': PORTRAIT[0], 'height': PORTRAIT[1]})
        app.nav('live-scores')
        a, b = boxes(page, sel('live-court-A'))[0], boxes(page, sel('live-court-B'))[0]
        assert a['x'] == b['x'] and b['y'] >= a['b'], f'phone portrait Live Scores should stack courts: {a} {b}'
        page.set_viewport_size({'width': DESKTOP[0], 'height': DESKTOP[1]})
        a, b = boxes(page, sel('live-court-A'))[0], boxes(page, sel('live-court-B'))[0]
        assert a['y'] == b['y'] and b['x'] >= a['r'], f'desktop Live Scores should show courts side by side: {a} {b}'

        # --- Results: two columns in phone landscape; titles on one line --------------------------------
        page.set_viewport_size({'width': LANDSCAPE[0], 'height': LANDSCAPE[1]})
        app.nav('results')
        cards = boxes(page, sel('result-card'))
        assert len(cards) == 2 and cards[0]['x'] != cards[1]['x'], f'landscape Results should use two columns: {cards}'
        titles = boxes(page, sel('result-card-title'))
        assert titles and all(t['h'] <= t['lh'] + 2 for t in titles), f'result titles wrap: {titles}'

        # --- Division complete: medal colours, no boxes ---------------------------------------------------
        page.set_viewport_size({'width': DESKTOP[0], 'height': DESKTOP[1]})
        app.open_court('A')
        while app.current_match():
            app.score_point('W', 'M')
            app.next_match()
        rows = boxes(page, f'#score {sel("division-complete-row")}')
        places = boxes(page, f'#score {sel("division-complete-row")} > b')
        assert [p['color'] for p in places] == [GOLD, SILVER, BRONZE, BRONZE], f'medal colours: {places}'
        assert all(r['bg'] in ('rgba(0, 0, 0, 0)', 'transparent') and r['border'] == '0px' and r['shadow'] == 'none' for r in rows), \
            f'placement rows should have no box: {rows}'
        assert all(p['bg'] in ('rgba(0, 0, 0, 0)', 'transparent') for p in places), 'medal labels have a badge background'

        assert not errors, errors
        print(f'PASS layout: phone portrait/landscape header, court, Live Scores, Results, validation modal, medals ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
