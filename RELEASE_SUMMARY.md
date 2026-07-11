# KSM v3.10.8 Release Summary

**Objective:** Remove redundant team-current-match presentation and emphasize the active bout within the complete lineup.

**Root cause:** Standard team Live Scores rendered the authoritative active bout twice: once in a dedicated panel and again in its lineup row.

**Owning layer:** Live Scores presentation.

**Files changed:**
- `public/index.html`
- `public/service-worker.js`
- `package.json`
- `tests/spectator-experience-test.py`
- release documentation

**Engine impact:** None. Match Objects, tournament templates, advancement, scoring, and save schema are unchanged.

**Expected presentation:**
- One lineup only.
- Active row remains in lineup order.
- Active row is larger and outlined in gold.
- No active-row background tint.
