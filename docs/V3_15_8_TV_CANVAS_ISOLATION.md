# KSM v3.15.8 — TV Canvas Isolation

- Rebuilds TV mode as a dedicated fixed-position presentation route.
- Removes the normal KSM page shell, sticky layout, inherited padding, and scroll containers from TV mode.
- Uses one centered 1920×1080 canvas and one uniform scale calculation.
- Uses fixed internal coordinate zones for the header, active match, team context, and Upcoming Matches.
- Preserves URL-locked Court A / Court B assignment and the frozen v3.12.9 engine.
