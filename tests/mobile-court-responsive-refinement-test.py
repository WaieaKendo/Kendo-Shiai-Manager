from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

ROOT = Path(__file__).resolve().parents[1] / 'public'
HTML = (ROOT / 'index.html').read_text(encoding='utf-8')

with sync_playwright() as p:
    browser = launch_chromium(p)
    checks=0
    errors=[]

    portrait=browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    portrait.on('pageerror', lambda exc: errors.append(str(exc)))
    load_app(portrait, HTML)
    portrait.evaluate("""
      document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
      document.querySelector('#score').classList.remove('hidden');
      const s=document.querySelector('#scoreDiv');
      s.innerHTML='<option selected>Yonenbu (11 years and under)</option>';
    """)
    portrait.wait_for_timeout(150)
    sel=portrait.locator('#scoreDiv').bounding_box(); assert sel
    assert sel['x'] >= -0.5 and sel['x']+sel['width'] <= 390.5; checks+=1
    assert portrait.evaluate('document.documentElement.scrollWidth <= innerWidth'); checks+=1
    fs=float(portrait.locator('#scoreDiv').evaluate("e=>parseFloat(getComputedStyle(e).fontSize)"))
    assert fs <= 22.1; checks+=1

    landscape=browser.new_page(viewport={'width':844,'height':390}, is_mobile=True, has_touch=True)
    landscape.on('pageerror', lambda exc: errors.append(str(exc)))
    load_app(landscape, HTML)
    landscape.evaluate("""
      document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
      document.querySelector('#score').classList.remove('hidden');
    """)
    landscape.wait_for_timeout(150)
    score_h=landscape.locator('.scoreboard-score-row').evaluate("e=>parseFloat(getComputedStyle(e).minHeight)")
    stack_h=landscape.locator('.score-stack').first.evaluate("e=>parseFloat(getComputedStyle(e).minHeight)")
    points_h=landscape.locator('.scoreboard-score-row .points').first.evaluate("e=>parseFloat(getComputedStyle(e).height)")
    assert score_h <= 74.1; checks+=1
    assert stack_h <= 70.1; checks+=1
    assert points_h <= 52.1; checks+=1
    assert not errors, errors; checks+=1
    print(f'PASS: mobile Court responsive refinements {checks}/{checks} assertions')
    browser.close()
