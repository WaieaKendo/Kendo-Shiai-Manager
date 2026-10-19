"""Public print route, offline shell, current labels, Setup popup and Letter PDF."""
import re
import os
import sys
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_app import KsmApp
from ksm_server import local_worker

ROOT = Path(__file__).resolve().parents[1]
# One list: guide text and the actual court controls must agree, including icon labels.
LABELS = {
    'point-white-M': 'Men', 'point-white-K': 'Kote', 'point-white-D': 'Do',
    'point-white-T': 'Tsuki', 'hansoku-white': 'Hansoku', 'undo': 'Undo',
    'redo': 'Redo', 'fusen-gachi': 'Fusen-sho', 'next-match': 'Next Match',
    'timer-toggle': 'Start · Hajime', 'timer-replay': 'Replay time-up whistle',
    'timer-adjust--10': '−10', 'timer-adjust--1': '−1',
    'timer-adjust-1': '+1', 'timer-adjust-10': '+10',
    'timer-show-tv': 'Show Encho on TV',
    '_stop': 'Stop · Yame', '_encho': 'Start encho', '_hikiwake': 'Show Hikiwake on TV',
}

def main():
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        context = browser.new_context()
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        response = page.goto(base + '/print/scorekeeper-guide', wait_until='networkidle')
        assert response.status == 200
        assert page.title() == 'Scorekeeper guide'
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        page.evaluate('navigator.serviceWorker.ready')
        assert page.locator('img').evaluate_all('(items) => items.every(i => i.complete && i.naturalWidth > 0)')
        guide = page.locator('body').inner_text()
        guide_html = response.body()
        for width in [390, 320]:
            page.set_viewport_size({'width': width, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        page.set_viewport_size({'width': 1180, 'height': 820})
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / 'guide.pdf'
            subprocess.run([sys.executable, str(ROOT / 'scripts/print-pdf.py'), 'scorekeeper-guide', '--out', str(pdf)],
                           cwd=ROOT, env={**os.environ, 'KSM_BASE_URL': base}, check=True, capture_output=True)
            # Chromium emits page dictionaries uncompressed; no extra PDF dependency needed.
            count = len(re.findall(rb'/Type\s*/Page\b', pdf.read_bytes()))
            assert count == 2, f'Guide must print on two sides, got {count} pages'
        # A fresh page proves navigation uses the installed precache, not HTTP memory cache.
        context.set_offline(True)
        offline = context.new_page()
        result = offline.goto(base + '/print/scorekeeper-guide', wait_until='networkidle')
        assert result.status == 200
        assert offline.locator('img').evaluate_all('(items) => items.every(i => i.complete && i.naturalWidth > 0)')
        assert 'Scorekeeper guide' in offline.locator('body').inner_text()
        context.set_offline(False)
        context.close()
        # Use the golden fixture to verify Setup placement and current button names.
        app = KsmApp(browser.new_page(), 'Print labels')
        load_app(app.page)
        app.page.evaluate("() => { cloudSession.tournamentId='print-fixture'; sessionStorage.setItem(KSM_V316_STAFF_SESSION,'ksmst_golden_fixture'); }")
        link = app.page.locator('#setup-tournament-actions .setup-print-group a')
        assert link.inner_text() == 'Scorekeeper guide (print)'
        assert link.get_attribute('target') == '_blank'
        # Fake-origin harness does not serve clean print routes; fulfill with the real worker page.
        app.page.context.route('**/print/scorekeeper-guide', lambda route: route.fulfill(status=200, content_type='text/html', body=guide_html))
        with app.page.expect_popup() as popup:
            link.click()
        popup.value.wait_for_load_state()
        assert popup.value.title() == 'Scorekeeper guide'
        popup.value.close()
        app.configure([{'name': 'Open', 'format': 'Single Elimination', 'court': 'A', 'entrants': [
            {'name': name, 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for name in ['A', 'B', 'C', 'D']]}])
        app.open_court('A')
        for testid, label in LABELS.items():
            if testid.startswith('_'):
                continue
            button = app.page.locator(f'#score [data-testid="{testid}"]')
            button.wait_for()
            if button.locator('.point-name, .action-label').count():
                actual = button.locator('.point-name, .action-label').inner_text().strip()
            elif testid.startswith('timer-adjust-'):
                actual = button.inner_text().strip()
            else:
                actual = button.get_attribute('aria-label') or button.evaluate("el => { const copy = el.cloneNode(true); copy.querySelectorAll('[aria-hidden=true], svg').forEach(n => n.remove()); return copy.textContent.trim().replace(/\\s+/g, ' '); }")
            assert label == actual, (testid, label, actual)
            assert label in guide, f'Guide missing current label: {label}'
        app.click('timer-toggle')
        assert app.page.locator('[data-testid="timer-toggle"]').get_attribute('aria-label') == LABELS['_stop']
        assert LABELS['_stop'] in guide
        app.click('timer-toggle')
        for _ in range(18):
            app.click('timer-adjust--10')
        encho = app.page.locator('[data-testid="timer-encho"]')
        encho.wait_for()
        assert encho.get_attribute('aria-label') == LABELS['_encho']
        assert LABELS['_encho'] in guide
        app.configure([{'name': 'Pool', 'format': 'Round Robin', 'court': 'B', 'entrants': [
            {'name': name, 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for name in ['E', 'F', 'G']]}])
        app.open_court('B')
        tv = app.page.locator('[data-testid="timer-show-tv"]')
        tv.wait_for()
        assert tv.get_attribute('aria-label') == LABELS['_hikiwake']
        assert LABELS['_hikiwake'] in guide
        assert not errors, errors
        browser.close()
    print('PASS printable guide: route, phone, images, offline, Setup popup, labels, two-page PDF')

if __name__ == '__main__':
    main()
