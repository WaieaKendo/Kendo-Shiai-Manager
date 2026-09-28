from pathlib import Path
from ksm_source import app_source, court_react_source

html = app_source()
# M.13: divisionCompletePanelHtml() went with the legacy TV renderer (its last user). The
# division-complete panel (court screen, Live Scores, TV) is the court screen's React component:
# 35-react-court.js publishes each placement's tier, CourtComplete.tsx sets it as the place's class.
react = court_react_source()
checks = {
    "complete heading removed from renderer": '<h2>Division Complete</h2>' not in html,
    "tier class applied": "tier:ksmText(p.tier)" in html and "placeClass: p.tier" in react and '<b className={row.placeClass}>{row.place}</b>' in react and 'className="division-complete-row"' in react,
    "gold label rule": '.division-complete-row b.gold{color:#c99b38}' in html,
    "silver label rule": '.division-complete-row b.silver{color:#aeb4bd}' in html,
    "bronze label rule": '.division-complete-row b.bronze{color:#b67b4a}' in html,
    "medalist rows boxless": '.division-complete-row{background:none!important;box-shadow:none!important;border:0!important}' in html,
    "team court context one column": '#courtContext .results-team-bracket{grid-template-columns:minmax(0,1fr)!important}' in html,
}
failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items(): print(("PASS" if ok else "FAIL"), name)
if failed: raise SystemExit(1)
print(f"Final tournament UI polish: {len(checks)}/{len(checks)} passed")
