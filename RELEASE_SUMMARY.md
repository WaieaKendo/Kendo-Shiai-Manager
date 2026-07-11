# KSM v3.10.9 Release Summary

**Objective:** Repair mobile team point alignment, prevent enlarged active-row score-box collisions, and restore breathing room below the mobile navigation.

**Root causes:**
- The shared `.red` utility added right padding and a border to Red team point placeholders.
- The active mobile row enlarged point boxes without increasing the spacing between their translated positions.
- Several application views began at the exact top edge of the content area below the sticky navigation.

**Owning layer:** Responsive presentation and layout CSS.

**Files changed:**
- `public/index.html`
- `public/service-worker.js`
- `package.json`
- `tests/spectator-experience-test.py`
- release documentation

**Engine impact:** None. Match Objects, templates, scoring, advancement, queues, and save schema are unchanged.
