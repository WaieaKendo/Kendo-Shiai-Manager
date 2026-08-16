# KSM v3.15.9 — TV Fixed Canvas & Court Action History

- TV display is a fixed 1920×1080 picture-like canvas with fixed internal coordinates.
- Browser zoom scales the complete display uniformly; no automatic viewport scaling remains.
- Team Upcoming Matches includes unresolved Semifinal and Final placeholders.
- Individual championship and single-elimination displays use generated source placeholders instead of generic TBD when available.
- Court A and Court B have independent persistent 100-action Undo/Redo histories.
- Repeated Undo reverses scorekeeper actions sequentially, including Next Match, across tab changes and reloads.
- Undo and Redo create new autosaved/cloud-synchronized states without confirmation dialogs.
- Tournament Engine remains frozen at v3.12.9.
