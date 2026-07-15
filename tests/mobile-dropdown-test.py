from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "public"
HTML = (ROOT / "index.html").read_text(encoding="utf-8")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.set_content(HTML, wait_until="domcontentloaded")
    page.wait_for_timeout(300)

    contracts = [
        ("Courts", "#courtsMenu", "Court A"),
        ("Live Scores", "#liveScoresMenu", "Court A"),
        ("Export", "#exportMenu", "Tournament Brackets"),
        ("Save or Load", "#saveLoadMenu", "Save Now"),
    ]
    checks = 0
    for title, menu, item in contracts:
        trigger = page.get_by_title(title)
        trigger.tap()
        locator = page.locator(menu)
        locator.wait_for(state="visible")
        assert trigger.get_attribute("aria-expanded") == "true"
        assert locator.get_by_role("button", name=item).is_visible()
        box = locator.bounding_box()
        assert box is not None
        viewport = page.evaluate("({w:innerWidth,h:innerHeight})")
        assert box["x"] >= 0 and box["x"] + box["width"] <= viewport["w"]
        assert box["y"] >= 0 and box["y"] + min(box["height"], 1) <= viewport["h"]
        checks += 6
        page.get_by_title("Setup").tap()
        assert locator.is_hidden()
        assert trigger.get_attribute("aria-expanded") == "false"
        checks += 2

    trigger = page.get_by_title("Courts")
    trigger.tap(); assert page.locator("#courtsMenu").is_visible()
    trigger.tap(); assert page.locator("#courtsMenu").is_hidden()
    checks += 2

    trigger.tap(); assert page.locator("#courtsMenu").is_visible()
    page.locator("main").tap(position={"x": 10, "y": 10})
    assert page.locator("#courtsMenu").is_hidden()
    checks += 2

    assert not errors, errors
    checks += 1
    print(f"PASS: mobile dropdown viewport reliability {checks}/{checks} assertions")
    browser.close()
