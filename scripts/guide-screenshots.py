"""Recreate guide images from the court golden tests' local KsmApp fixture."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from ksm_app import KsmApp
from ksm_browser import launch_chromium, load_app
from playwright.sync_api import sync_playwright

out = Path(__file__).resolve().parents[1] / 'app/print/scorekeeper-guide'
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page(viewport={'width': 1180, 'height': 820}, device_scale_factor=1)
    app = KsmApp(page, 'Guide')
    load_app(page)
    page.evaluate("() => { cloudSession.tournamentId='guide-fixture'; sessionStorage.setItem(KSM_V316_STAFF_SESSION,'ksmst_golden_fixture'); }")
    page.evaluate("() => { tName.value = 'Sample Kendo Tournament'; }")
    app.configure([{'name': 'Open', 'format': 'Single Elimination', 'court': 'A', 'entrants': [
        {'name': name, 'dojo': 'Sample Dojo', 'seed': '', 'status': 'Checked'} for name in ['Aki Tanaka', 'Kai Sato', 'Ren Mori', 'Nao Ito']]}])
    app.open_court('A')
    page.locator('[data-testid="match-timer"]').wait_for()
    def shot(name, selector='#score .scoreboard-card'):
        page.evaluate('window.scrollTo(0, 0)')
        page.screenshot(path=str(out / f'{name}.png'), clip=page.locator(selector).bounding_box(), full_page=True)
    app.score_point('W', 'M')
    shot('point')
    app.hansoku('R')
    shot('hansoku')
    app.undo()
    app.undo()
    app.click('timer-toggle')
    shot('running')
    app.click('timer-toggle')
    # Advance the real timer through its adjustment buttons (no edited images).
    for _ in range(18):
        app.click('timer-adjust--10')
    page.locator('[data-testid="timer-encho"]').wait_for()
    app.click('timer-encho')
    shot('encho')
    # Use the production status renderer with deterministic fixture inputs.
    for state in ['Saving', 'Saved', 'Unsaved', 'Offline']:
        page.evaluate("""(state) => {
          clearOutbox();
          ksmSaveStatusMode = state.toLowerCase();
          ksmLastSuccessfulSaveAt = Date.now();
          if (state === 'Unsaved') writeOutbox(tournamentPayload(), 'Guide example');
          setConnectionStatus(state === 'Offline' ? 'No connection' : 'Connected', state === 'Offline' ? 'offline' : 'online');
          renderPersistentSaveStatus();
        }""", state)
        page.wait_for_timeout(100)
        shot('save-' + state.lower(), '.cloud-status-wrap [role="status"]' if state == 'Offline' else '[data-testid="save-status"]')
    browser.close()
print(f'Guide screenshots: {out}')
