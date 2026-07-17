# KSM v3.15.13 — TV Clean-Room Rebuild

The TV presentation layer was rebuilt with entirely new `tv3-*` markup and CSS.

- One fixed 1920×1080 grid with three rows: header, current context, upcoming matches.
- No semantic header/main/section tags in TV markup.
- No legacy TV class names reused.
- Individual, standard team, and Kachinuki bodies remain inside the fixed middle row.
- Upcoming Matches is a permanent bottom-row component.
- Tournament data, cloud synchronization, and undo/redo logic are unchanged.
