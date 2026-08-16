# KSM v3.16.2 — Pool Division Selection Stability

## Fix

The Generated Pools division selector now has its own persistent UI selection instead of being rebound to the active scorekeeping division whenever the application re-renders.

- Switching the Pools view to another division remains stable during autosave, synchronization, and other background renders.
- The active court/scorekeeping division is not changed by browsing pools.
- Tournament generation, pool editing, Save Now, cloud synchronization, and recovery behavior are unchanged.
