# KSM v3.10.4 Release Notes

This responsive-layout release addresses two narrow Court Mode issues reported during real iPhone testing.

## Portrait
Long division names remain constrained to the Scorekeeper header instead of extending beyond the viewport. The control uses responsive sizing and safe overflow handling while retaining direct division switching.

## Landscape
The score reserve is shorter on phone-sized landscape screens, removing unnecessary empty vertical space while preserving score readability and White-left/Red-right orientation.

No tournament behavior or data structures changed.
