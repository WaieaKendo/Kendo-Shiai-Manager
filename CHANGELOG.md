# Changelog

## v3.10.1 — Mobile Navigation Reliability

- Corrected touch interaction for Courts, Live Scores, Export, and Save/Load dropdown menus.
- Added explicit open/closed state through `aria-expanded` and `aria-controls`.
- Keeps one dropdown open until an option, outside area, another dropdown, or Escape closes it.
- Positions mobile dropdowns beneath their trigger and constrains them to the visible viewport.
- Increased submenu touch targets and enabled touch-manipulation behavior.
- Bumped the service-worker cache from `ksm-shell-v3.10.0` to `ksm-shell-v3.10.1`.
- Added automated 390 × 844 touch-viewport dropdown verification.

No tournament engine, Match Object, scoring, advancement, template, Results, or asset artwork changes.
