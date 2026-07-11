from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "public"
HTML = (ROOT / "index.html").read_text(encoding="utf-8")

HERO = '''
<div class="audience-canvas">
  <div class="audience-hero">
    <img class="audience-watermark" src="/assets/KSM-Background-watermark.svg" alt="">
    <div class="audience-header">
      <div class="audience-tournament"><img src="/assets/ksm-fuji-logo-nav.svg"><span>Aiea Taiheiji Kendo Tournament</span></div>
      <div class="audience-title"><h1 class="audience-court">Court A</h1><div class="audience-division">Yonenbu (11 years and under)</div><div class="audience-match-meta">Quarterfinal</div></div>
      <div></div>
    </div>
    <div class="audience-match-grid">
      <div class="audience-player white"><div class="audience-player-head"><span class="audience-side-dot audience-white-dot"></span><div><h2 class="audience-player-name">Aiko Fujimoto</h2><div class="audience-dojo">Aiea Taiheiji</div></div></div></div>
      <div class="audience-score-center"><div class="audience-score-stack"><div class="audience-points audience-white-points">K</div><div class="audience-triangles"></div></div><div class="audience-vs">vs</div><div class="audience-score-stack"><div class="audience-points audience-red-points">M</div><div class="audience-triangles"></div></div></div>
      <div class="audience-player red"><div class="audience-player-head"><div><h2 class="audience-player-name">Mika Watanabe</h2><div class="audience-dojo">Manoa</div></div><span class="audience-side-dot audience-red-dot"></span></div></div>
    </div>
  </div>
</div>'''

def within(inner, outer, tolerance=1):
    return inner["x"] >= outer["x"] - tolerance and inner["x"] + inner["width"] <= outer["x"] + outer["width"] + tolerance

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    checks = 0
    errors = []
    for width, height, mode in [(390,844,"portrait"),(844,390,"landscape")]:
        page = browser.new_page(viewport={"width":width,"height":height}, is_mobile=True, has_touch=True)
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.set_content(HTML, wait_until="domcontentloaded")
        page.locator("body").evaluate("(el,hero)=>{ el.innerHTML='<main id=public>'+hero+'</main>'; }", HERO)
        page.wait_for_timeout(100)
        hero = page.locator(".audience-hero").bounding_box()
        grid = page.locator(".audience-match-grid").bounding_box()
        white = page.locator(".audience-player.white").bounding_box()
        score = page.locator(".audience-score-center").bounding_box()
        red = page.locator(".audience-player.red").bounding_box()
        assert hero and grid and white and score and red
        assert hero["x"] >= 0 and hero["x"] + hero["width"] <= width + 1
        assert within(grid, hero)
        assert within(white, grid) and within(score, grid) and within(red, grid)
        assert white["x"] < score["x"] < red["x"]
        checks += 5
        if mode == "portrait":
            assert page.locator(".audience-player.white").evaluate("el=>getComputedStyle(el).textAlign") == "left"
            assert page.locator(".audience-player.red").evaluate("el=>getComputedStyle(el).textAlign") == "right"
            assert page.locator(".audience-player-name").first.evaluate("el=>parseFloat(getComputedStyle(el).fontSize)") <= 27
            checks += 3
        else:
            assert white["y"] < red["y"] + red["height"] and red["y"] < white["y"] + white["height"]
            assert page.locator(".audience-player-name").first.evaluate("el=>parseFloat(getComputedStyle(el).fontSize)") <= 36
            checks += 2
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        checks += 1
        page.close()
    assert not errors, errors
    checks += 1
    print(f"PASS: Live Scores responsive layout {checks}/{checks} assertions")
    browser.close()
