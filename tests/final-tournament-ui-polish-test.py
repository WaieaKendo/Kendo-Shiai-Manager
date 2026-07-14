from pathlib import Path

html = Path("public/index.html").read_text(encoding="utf-8")
checks = {
    "version bumped": "v3.12.8" in html,
    "complete heading removed from renderer": '<h2>Division Complete</h2>' not in html,
    "tier class applied": "p.tier||''" in html and "division-complete-row" in html,
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
