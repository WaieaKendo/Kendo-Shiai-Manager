# KSM v3.10.3 Mobile Court Portrait Verification

## Scope

- Phone portrait Court Mode only.
- Full-width Court workspace and Scorekeeper card.
- Existing competitor names and score positions preserved.
- Five White and five Red point controls constrained to the viewport.
- Compact three-column Undo / Fusen-gachi / Next Match action row.
- Full `Fusen-gachi` label retained and wrapped.
- Court Context point chips reduced and placed below the corresponding player names.
- Desktop and landscape layouts unchanged.

## Automated verification

- Hosted/PWA package: 19/19 required files verified.
- Existing mobile dropdown regression: 37/37 assertions passed.
- Mobile Court portrait: 16/16 assertions passed.
- No horizontal document overflow at a 390 × 844 touch viewport.
- All three action buttons remain inside the viewport.
- White and Red point chips are below their player names.
