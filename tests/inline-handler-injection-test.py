"""Names containing quotes or HTML must not break out of inline on*="..." handlers.

esc() turns ' into &#39;, but the HTML parser decodes that back before the handler
runs, so '${esc(name)}' let a division name like  x');alert(1);('  run code.
Handlers now use jsArg(), which emits a JSON string literal.
"""
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

EVIL = [
    "x');window.__pwned=1;('",
    'y");window.__pwned=2;("',
    "z</b><img src=x onerror=window.__pwned=3>",
    "back\\slash' & \"both\"",
]

checks = 0
with sync_playwright() as p:
    browser = launch_chromium(p)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    dialogs, errors = [], []
    page.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))
    page.on('pageerror', lambda e: errors.append(str(e)))
    load_app(page)

    # Custom divisions with hostile names, shown in the Setup division table.
    page.evaluate("""names => {
      window.__pwned = 0; window.__calls = [];
      names.forEach(n => { state.divisions.push(n); state.divisionTypes[n] = 'Round Robin'; state.divisionCourts[n] = 'A'; });
      const orig = window.setDivisionCourt;
      window.setDivisionCourt = (d, v) => { window.__calls.push(d); return orig(d, v); };
      navigateTo('setup'); renderDivisionSetup();
    }""", EVIL)
    page.wait_for_timeout(200)

    # Fire every court <select> handler for the hostile rows and confirm the exact name arrives.
    fired = page.evaluate("""names => {
      const out = [];
      document.querySelectorAll('select[onchange^="setDivisionCourt("]').forEach(sel => {
        sel.value = 'B'; sel.dispatchEvent(new Event('change'));
      });
      return window.__calls.filter(n => names.includes(n));
    }""", EVIL)
    assert sorted(fired) == sorted(EVIL), ('handler received wrong names', fired); checks += 1
    assert all(page.evaluate("n => state.divisionCourts[n]", n) == 'B' for n in EVIL); checks += 1

    # Dojo profile links built from dojo names.
    page.evaluate("""n => { window.__dojo = null; window.showDojoProfile = d => { window.__dojo = d; };
      const b = document.createElement('div'); b.innerHTML = `<button id="dj" onclick="showDojoProfile(${jsArg(n)})">x</button>`;
      document.body.appendChild(b); document.getElementById('dj').click(); }""", EVIL[0])
    assert page.evaluate("window.__dojo") == EVIL[0]; checks += 1

    assert page.evaluate("window.__pwned") == 0, 'injected code ran'; checks += 1
    assert not dialogs, dialogs; checks += 1
    assert not errors, errors; checks += 1

    # No inline handler still wraps an esc() value in quotes.
    import re
    from ksm_source import app_source
    html = app_source()
    assert not re.search(r"""on\w+="[^"]*'\$\{esc\(""", html); checks += 1
    browser.close()
print(f'PASS inline handler injection ({checks} checks)')
