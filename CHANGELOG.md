# Changelog

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
