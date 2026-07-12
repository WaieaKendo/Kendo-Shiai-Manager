# Layout and Mobile Setup Verification — v3.11.0

The release standardizes the outer width and top spacing of all eight KSM views at phone and desktop sizes. Setup uses a compact mobile hero, one-column fields, stacked division cards, touch-sized controls, and a full-width continuation action.

## Automated verification
- All views share the same left edge, width, and top offset at 390px and 1440px viewports.
- No mobile horizontal overflow.
- Setup hero and panels remain within the viewport.
- Division controls render as phone-width cards.
- Setup form grids collapse to one column.
- Primary action is full width.
