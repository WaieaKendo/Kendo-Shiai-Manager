# KSM v3.15.10 — TV Layout & Undo/Redo Stabilization

This release stabilizes the fixed 16:9 TV presentation and the court-scoped sequential action history.

## TV
- Five fixed individual zones: white name, white points, VS, red points, red name.
- Centered 1760 px team composition with equal 830 px columns.
- Pool or round shown below the division.
- Two outlined Upcoming Matches cards.
- Existing generated placeholders used for unresolved bracket participants.
- Team Semifinal and Final nodes remain visible before participants resolve.

## Undo/Redo
- Court-specific chronological action stacks.
- Next Match is one atomic reversible action.
- Repeated Undo can walk backward across completed matches.
- Redo reapplies sequentially.
- History persists in tournament state and cloud snapshots.
