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
    assert buttons.count()==5, buttons.count(); checks+=1  # Undo, Redo, Fusen, Next Match, tie flash
    for i in range(buttons.count()):
        box=buttons.nth(i).bounding_box(); assert box
        assert box['x']>=0 and box['x']+box['width']<=viewport['w']+0.5
        checks+=1
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
