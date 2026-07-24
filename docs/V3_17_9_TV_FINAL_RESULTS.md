# KSM v3.17.9-test — TV Final Results

This test release keeps the completed division visible to the audience after the final match.

## Behavior

- While a court has an active match, its TV continues to use the existing individual, team, or Kachinuki presentation.
- When the active division is complete and no further match remains on that court, the TV reuses the existing read-only Court completion results markup.
- The TV shows the division title, final placements, and a Division Complete footer.
- The results remain visible until a different division is assigned to that court.
- Assigning or starting a new division automatically returns the TV to its normal live presentation.

## Scope

This is a presentation-only change. It does not alter tournament progression, placement calculation, scoring, undo/redo, cloud saves, or realtime synchronization.
