from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html

HTML=app_html()

with sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    errors=[]
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    load_app(page, HTML)
    page.evaluate("""
      document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
      document.querySelector('#score').classList.remove('hidden');
      document.querySelector('#courtContext').innerHTML = `
        <div class="context-box"><div class="pool-result-card">
          <div class="aligned-match-row compact current">
            <div class="match-name white">Riku Tanaka</div>
            <div class="match-point">M</div><div class="match-point">M</div>
            <div class="match-status">vs</div>
            <div class="match-point red">K</div><div class="match-point red empty">·</div>
            <div class="match-name red">Mika Watanabe</div>
          </div>
        </div></div>`;
    """)
    page.wait_for_timeout(200)
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
    assert page.locator('.fusen-action').inner_text().strip().endswith('Fusen-gachi'); checks+=1
    row=page.locator('.aligned-match-row').first
    rbox=row.bounding_box(); assert rbox and rbox['x']+rbox['width']<=viewport['w']+0.5; checks+=1
    wname=page.locator('.aligned-match-row .match-name.white').bounding_box()
    wpt=page.locator('.aligned-match-row .match-point').first.bounding_box()
    rname=page.locator('.aligned-match-row .match-name.red').bounding_box()
    rpt=page.locator('.aligned-match-row .match-point.red').first.bounding_box()
    assert wpt['y'] >= wname['y'] + wname['height'] - 1; checks+=1
    assert rpt['y'] >= rname['y'] + rname['height'] - 1; checks+=1
    assert wpt['width'] <= 22 and rpt['width'] <= 22; checks+=1
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth') is True; checks+=1
    assert not errors, errors; checks+=1
    print(f'PASS: mobile Court portrait reliability {checks}/{checks} assertions')
    browser.close()
