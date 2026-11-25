from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_app import KsmApp


with sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    errors=[]
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    # A real tournament on Court A with one scored, finished match, so the court screen's React
    # context panel draws real match rows. (The test used to write a row into #courtContext with
    # innerHTML; since the court screen is React that raced the React module: on a slower machine
    # React mounted after the write and replaced it.)
    app = KsmApp.local(page, 'Court portrait')  # offline app, test API included
    app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': [
        {'name': n, 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for n in ('Riku Tanaka', 'Mika Watanabe', 'Sora Ito')]}])
    page.evaluate("KSMTest.show('score')")
    app.score_point('W', 'M')
    app.score_point('R', 'K')
    app.next_match()
    page.wait_for_selector('#courtContext .aligned-match-row .match-point.red')
    checks=0
    viewport=page.evaluate('({w:innerWidth,h:innerHeight})')
    for sel in ['#score','.scorekeeper-shell','.scoreboard-card','.sk-support-grid','.scoreboard-support-card']:
        box=page.locator(sel).first.bounding_box(); assert box
        assert box['x'] >= -0.5 and box['x']+box['width'] <= viewport['w']+0.5, (sel,box,viewport)
        checks += 1
    buttons=page.locator('.bottom-action-row button')
    assert buttons.count()==4, buttons.count(); checks+=1  # Undo, Redo, Fusen, Next Match
    for i in range(buttons.count()):
        box=buttons.nth(i).bounding_box(); assert box
        assert box['x']>=0 and box['x']+box['width']<=viewport['w']+0.5
        checks+=1
    app.wait_for(app.timer, message='portrait timer mounted')
    layout = app.timer_layout()
    left, right = sorted([layout['white'], layout['red']], key=lambda b: b['x'])
    timer = layout['timer']
    assert abs(left['y'] - right['y']) <= 1 and left['right'] <= right['x'] + 1, layout
    assert timer['y'] >= max(left['bottom'], right['bottom']) - 1, layout
    assert timer['x'] <= left['x'] + 1 and timer['right'] >= right['right'] - 1, layout
    names = []
    for side in ('white', 'red'):
        name = page.locator(f'[data-testid="court-{side}-name"]').bounding_box()
        names.append(name)
        panel = page.locator(f'#score .{side}-control-panel')
        panel_box = panel.bounding_box()
        assert panel_box['y'] >= name['y'] + name['height'] - 1, (side, name, panel_box)
        assert panel_box['x'] <= name['x'] + name['width']/2 <= panel_box['x'] + panel_box['width'], (side, name, panel_box)
        points = panel.locator('button')
        assert points.count() == 5
        bounds = [points.nth(i).bounding_box() for i in range(5)]
        assert all(b['height'] >= 48 for b in bounds), bounds
        rows = {}
        for box in bounds:
            rows.setdefault(round(box['y']), []).append(box)
        assert sorted(map(len, rows.values())) == [2, 3], rows
    left_name, right_name = sorted(names, key=lambda b: b['x'])
    assert left_name['x'] + left_name['width'] <= right_name['x'], names
    sides = [page.locator(f'#score .scoreboard-{side}').bounding_box() for side in ('white', 'red')]
    assert abs(sides[0]['y'] - sides[1]['y']) <= 1, sides
    assert app.timer_control('timer-replay')['disabled']
    assert app.timer_control('timer-show-tv')['disabled']
    assert 'TV not connected' in app.timer_control('timer-show-tv')['title']
    assert page.locator('.bottom-action-row [data-testid="tie-flash-button"]').count() == 0
    # Owner decision 4 (#29): the button reads "Fusen-sho" (was "Fusen-gachi"; display text only).
    assert page.locator('.fusen-action').inner_text().strip().endswith('Fusen-sho'); checks+=1
    row=page.locator('#courtContext .aligned-match-row').first
    rbox=row.bounding_box(); assert rbox and rbox['x']+rbox['width']<=viewport['w']+0.5; checks+=1
    wname=page.locator('#courtContext .aligned-match-row .match-name.white').first.bounding_box()
    wpt=page.locator('#courtContext .aligned-match-row .match-point').first.bounding_box()
    rname=page.locator('#courtContext .aligned-match-row .match-name.red').first.bounding_box()
    rpt=page.locator('#courtContext .aligned-match-row .match-point.red').first.bounding_box()
    assert wpt['y'] >= wname['y'] + wname['height'] - 1; checks+=1
    assert rpt['y'] >= rname['y'] + rname['height'] - 1; checks+=1
    assert wpt['width'] <= 22 and rpt['width'] <= 22; checks+=1
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth') is True; checks+=1
    assert not errors, errors; checks+=1
    print(f'PASS: mobile Court portrait reliability {checks}/{checks} assertions')
    browser.close()
