from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html

HTML=app_html()

with sync_playwright() as p:
    browser=launch_chromium(p)
    checks=0
    for width,height,mobile in [(390,844,True),(1440,1000,False)]:
        page=browser.new_page(viewport={'width':width,'height':height}, is_mobile=mobile, has_touch=mobile)
        errors=[]
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        load_app(page, HTML)
        page.wait_for_timeout(200)
        viewport=page.evaluate('({w:innerWidth,h:innerHeight})')
        ids=['setup','registration','score','director','public','results','print']  # Search view removed in v3.15.x
        lefts=[]; widths=[]; tops=[]
        for id_ in ids:
            page.evaluate("id=>{document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));document.getElementById(id).classList.remove('hidden')}",id_)
            page.wait_for_timeout(30)
            box=page.locator('#'+id_).bounding_box(); assert box,(id_,width)
            assert box['x']>=-0.5 and box['x']+box['width']<=viewport['w']+0.5,(id_,box,viewport)
            lefts.append(round(box['x'],1)); widths.append(round(box['width'],1)); tops.append(round(box['y'],1))
            checks+=1
        assert max(lefts)-min(lefts)<=1.0,(width,lefts); checks+=1
        assert max(widths)-min(widths)<=1.0,(width,widths); checks+=1
        assert max(tops)-min(tops)<=1.0,(width,tops); checks+=1
        if mobile:
            page.evaluate("document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));setup.classList.remove('hidden');KSMTest.app.renderDivisionSetup()")
            page.wait_for_timeout(100)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth') is True; checks+=1
            hero=page.locator('.setup-hero').bounding_box(); panel=page.locator('.setup-panel').first.bounding_box()
            assert hero and panel and hero['width']<=viewport['w'] and panel['width']<=viewport['w']; checks+=1
            rows=page.locator('.setup-division-table tbody tr')
            assert rows.count()>=7; checks+=1
            r=rows.first.bounding_box(); assert r and r['x']>=0 and r['x']+r['width']<=viewport['w']+0.5; checks+=1
            assert page.locator('.setup-form-grid').first.evaluate("e=>getComputedStyle(e).gridTemplateColumns").count('px')==1; checks+=1
            btn=page.locator('.setup-primary-action').bounding_box(); assert btn and btn['width']>300; checks+=1
        assert not errors,errors; checks+=1
        page.close()
    print(f'PASS: global layout and mobile Setup {checks}/{checks} assertions')
    browser.close()
