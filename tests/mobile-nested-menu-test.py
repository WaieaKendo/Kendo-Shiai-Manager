"""Hamburger menu on phones: a submenu nests inside the menu panel (an accordion), not a floating card."""
import os
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html

HTML = app_html()
SHOT = os.environ.get('KSM_SHOT_DIR')

with sync_playwright() as p:
    browser = launch_chromium(p)
    for size in ({"width": 375, "height": 812}, {"width": 812, "height": 375}):
        page = browser.new_page(viewport=size, is_mobile=True, has_touch=True)
        errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        load_app(page, HTML)
        page.get_by_test_id('nav-toggle').wait_for(state='visible')
        page.get_by_test_id('nav-toggle').tap()
        trigger = page.get_by_title("Courts")
        trigger.tap()
        menu = page.locator("#courtsMenu")
        menu.wait_for(state="visible")
        nav = page.locator("header.ksm-topbar .minimal-nav").bounding_box()
        box = menu.bounding_box()
        tbox = trigger.bounding_box()
        assert page.evaluate("getComputedStyle(document.querySelector('#courtsMenu')).position") == "static", size
        assert box["x"] >= nav["x"] and box["x"] + box["width"] <= nav["x"] + nav["width"] + 1, (size, box, nav)
        assert box["y"] >= tbox["y"] + tbox["height"] - 1, (size, box, tbox)
        assert menu.get_by_role("button", name="Court A").is_visible() and menu.get_by_role("button", name="Court B").is_visible()
        if SHOT:
            page.screenshot(path=f"{SHOT}/nested-{size['width']}.png")
        # opening a second submenu closes the first
        page.get_by_title("TV Display").tap()
        page.locator("#tvMenu").wait_for(state="visible")
        assert not menu.is_visible(), size
        # choosing an item closes the whole hamburger menu
        page.get_by_title("Courts").tap()
        menu.get_by_role("button", name="Court A").tap()
        page.wait_for_function("!document.body.classList.contains('ksm-nav-expanded')")
        assert not errors, errors
        page.close()
    browser.close()
print("PASS mobile nested menu")
