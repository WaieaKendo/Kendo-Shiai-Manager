# KSM v3.11.2 Release Summary

## Objective
Correct Director totals and two mobile layout regressions without changing tournament behavior.

## Corrections
- Direct individual elimination totals use the complete scoreable bracket (`entrants - 1`) on the division's assigned court.
- Kachinuki removes a fixed denominator only for Kachinuki divisions. Other individual and standard-team estimates continue to calculate normally.
- Portrait Scorekeeper active-match spacing is reduced.
- The Setup date field matches the width of every other Tournament Details field.

## Architecture impact
Read-only Director projection and responsive CSS only. Match Objects, engines, templates, and save data are unchanged.
