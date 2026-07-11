# KSM v3.10.2 — Mobile Safari Dropdown Visibility

- Removed the desktop-only `!important` top-position override that placed fixed mobile dropdowns below the viewport.
- Preserved the existing one-tap dropdown interaction model.
- Added viewport-bound assertions for all four mobile dropdown menus.
- Bumped the hosted app and service-worker cache version to v3.10.2.
- No tournament-engine, Match Object, scoring, template, or Results behavior changed.

# Changelog

## v3.10.2 — Mobile Navigation Reliability

- Corrected touch interaction for Courts, Live Scores, Export, and Save/Load dropdown menus.
- Added explicit open/closed state through `aria-expanded` and `aria-controls`.
- Keeps one dropdown open until an option, outside area, another dropdown, or Escape closes it.
- Positions mobile dropdowns beneath their trigger and constrains them to the visible viewport.
- Increased submenu touch targets and enabled touch-manipulation behavior.
- Bumped the service-worker cache from `ksm-shell-v3.10.0` to `ksm-shell-v3.10.2`.
- Added automated 390 × 844 touch-viewport dropdown verification.

No tournament engine, Match Object, scoring, advancement, template, Results, or asset artwork changes.
