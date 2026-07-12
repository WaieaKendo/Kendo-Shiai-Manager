# Changelog

## v3.11.3 — Mobile Landscape Results and Live Scores Refinement

- Added a two-column Results layout for phone landscape.
- Recentered the Live Scores canvas in mobile landscape.
- Reduced active-match card height, typography, score size, and spacing in mobile landscape.
- Kept portrait and desktop layouts unchanged.
- Bumped the PWA cache to v3.11.3.
- No tournament engine, Match Object, template, scoring, advancement, or save-format changes.

## v3.11.2 — Director and Mobile Reliability Fixes

- Corrected direct individual elimination totals so an eight-person bracket reports seven scoreable matches.
- Scoped Kachinuki variable-total behavior to Kachinuki divisions only; fixed-format individual and standard-team estimates remain available.
- Reduced portrait mobile spacing inside the active Scorekeeper match card.
- Constrained the Setup date field to exactly the same width as the other Tournament Details fields on iOS.
- No tournament generation, scoring, advancement, template, or save-format behavior changed.
- Bumped the PWA cache to v3.11.2.

## v3.11.1 — Director Progress Accuracy

- Pool-based individual divisions now calculate totals from all pool bouts plus the complete championship bracket.
- Direct individual elimination totals now use all scoreable Court Context bracket nodes, including later rounds not yet instantiated as Match Objects.
- 3-person and 5-person team totals now use scoreable team pairings multiplied by roster size, with generated representative playoffs added when present.
- Kachinuki displays completed bouts only and intentionally omits a fixed total, remaining count, and progress bar.
- No tournament generation, scoring, advancement, template, or save-format behavior changed.
- Bumped the PWA cache to v3.11.1.

## v3.11.0 — Global Layout Standardization and Mobile Setup Optimization

### Changed
- Established one 1400px desktop content canvas for Setup, Registration, Courts, Director, Live Scores, Search, Results, Export, and Save/Load views.
- Standardized view top spacing, horizontal gutters, card gaps, and mobile bottom safe-area spacing.
- Rebuilt Setup responsive behavior for phone portrait use.
- Converted the Individual Divisions table into stacked labeled cards on phones.
- Made Setup fields, selectors, custom-division controls, and the primary continuation action full-width and touch friendly.
- Bumped the PWA cache to v3.11.0.

### Unchanged
- Match Objects and tournament state ownership.
- Pool, bracket, team, queue, scoring, advancement, Results, and save/load logic.
