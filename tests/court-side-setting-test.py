"""Red/White side setting (Setup → Referees): per court, from the scoring table's view.

Court screens and printed match lines for that court are mirrored; the other
court, the TV display and the default layout are unchanged. The setting is part
of the saved setup, so every device on the tournament follows it.
"""
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

SETUP = """() => {
  KSMTest.app.state.divisions = ['Open']; KSMTest.app.state.divisionTypes = {Open: 'Single Elimination'}; KSMTest.app.state.divisionCourts = {Open: 'split'};
  KSMTest.app.state.competitors = Array.from({length: 8}, (_, i) => ({name: 'P' + (i + 1), dojo: 'D' + (i % 3), division: 'Open', seed: '', status: 'Checked'}));
  KSMTest.app.state.teams = []; KSMTest.app.state.exhibitions = []; teamEnabled.value = 'Disabled';
  KSMTest.app.generatePools({validated: true});
}"""

X = """sel => { const r = document.querySelector('#score ' + sel).getBoundingClientRect(); return r.left + r.width / 2; }"""

checks = 0
with sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.dismiss())
    load_app(page)
    page.evaluate(SETUP)

    # Default: White on the left, Red on the right.
    page.evaluate("KSMTest.app.chooseCourt('A')")
    assert not page.evaluate("document.body.classList.contains('ksm-red-left')"); checks += 1
    assert page.evaluate(X, '.scoreboard-white') < page.evaluate(X, '.scoreboard-red'); checks += 1
    assert page.evaluate(X, '.white-control-panel') < page.evaluate(X, '.red-control-panel'); checks += 1

    # Court A set to Red on the left: names, score row and buttons all mirror.
    page.evaluate("court1RedSide.value='left'; court1RedSide.dispatchEvent(new Event('change')); KSMTest.app.chooseCourt('A')")
    assert page.evaluate("document.body.classList.contains('ksm-red-left')"); checks += 1
    assert page.evaluate(X, '.scoreboard-red') < page.evaluate(X, '.scoreboard-white'); checks += 1
    assert page.evaluate(X, '.red-score-stack') < page.evaluate(X, '.white-score-stack'), 'score row did not mirror'; checks += 1
    assert page.evaluate(X, '.red-control-panel') < page.evaluate(X, '.white-control-panel'); checks += 1

    # Court B keeps its own (default) setting on the same device.
    page.evaluate("KSMTest.app.chooseCourt('B')")
    assert not page.evaluate("document.body.classList.contains('ksm-red-left')"); checks += 1
    assert page.evaluate(X, '.scoreboard-white') < page.evaluate(X, '.scoreboard-red'); checks += 1

    # Printed lines follow each match's court (split division: A mirrored, B not).
    lines = page.evaluate("""() => { const d = document.createElement('div'); d.innerHTML = KSMTest.app.printDivisionSheet('Open');
      return [...d.querySelectorAll('.print-match')].map(x => x.classList.contains('red-left')); }""")
    court_of_lines = page.evaluate("""() => KSMTest.app.state.allMatches.Open.map(m => m.court)""")
    assert any(lines) and not all(lines), lines; checks += 1
    assert sum(lines) == court_of_lines.count('A'), (lines, court_of_lines); checks += 1

    # Saved with the setup and restored on another device.
    snap = page.evaluate("KSMTest.app.getSetupSnapshot()")
    assert snap.get('court1RedSide') == 'left' and snap.get('court2RedSide') == 'right', snap; checks += 1
    other = browser.new_page(viewport={'width': 1280, 'height': 900})
    other.on('dialog', lambda d: d.dismiss())
    load_app(other)
    other.evaluate(SETUP)
    other.evaluate("snap => { KSMTest.app.applySetupSnapshot(snap); KSMTest.app.chooseCourt('A'); }", snap)
    assert other.evaluate("document.body.classList.contains('ksm-red-left')"); checks += 1

    # The TV display is never mirrored (it is the audience's view).
    assert page.evaluate("[...document.styleSheets].every(s => { try { return [...s.cssRules].every(r => !(r.selectorText||'').includes('ksm-red-left') || !(r.selectorText||'').includes('#tv')) } catch (e) { return true } })"); checks += 1

    assert not errors, errors
    browser.close()
print(f'PASS court side setting ({checks} checks)')
