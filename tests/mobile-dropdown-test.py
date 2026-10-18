from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html

HTML=app_html()

with sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    load_app(page, HTML)
    page.get_by_test_id('nav-toggle').wait_for(state='visible')

    def tap_trigger(trigger):
        toggle = page.get_by_test_id('nav-toggle')
        if toggle.get_attribute('aria-expanded') == 'false':
            toggle.tap()
        trigger.tap()

    contracts = [
        ("Courts", "#courtsMenu", "Court A"),
        ("TV Display", "#tvMenu", "Court A TV"),  # Live Scores became a direct link; TV Display is the dropdown
        ("Export", "#exportMenu", "Tournament Brackets"),
        ("Save or Load", "#saveLoadMenu", "Save Now"),
    ]
    checks = 0
    for title, menu, item in contracts:
        trigger = page.get_by_title(title)
        tap_trigger(trigger)
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
        page.get_by_test_id('nav-toggle').tap()
        page.get_by_test_id('nav-toggle').tap()
        page.get_by_title("Setup").tap()
        assert locator.is_hidden()
        assert trigger.get_attribute("aria-expanded") == "false"
        checks += 2

    trigger = page.get_by_title("Courts")
    tap_trigger(trigger); assert page.locator("#courtsMenu").is_visible()
    tap_trigger(trigger); assert page.locator("#courtsMenu").is_hidden()
    checks += 2

    tap_trigger(trigger); assert page.locator("#courtsMenu").is_visible()
    page.locator("main").tap(position={"x": 10, "y": 10})
    assert page.locator("#courtsMenu").is_hidden()
    checks += 2

    assert not errors, errors
    checks += 1
    print(f"PASS: mobile dropdown viewport reliability {checks}/{checks} assertions")
    browser.close()
