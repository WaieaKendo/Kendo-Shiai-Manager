# KSM v3.11.1 Release Summary

## Objective
Correct Director court and tournament progress totals without changing tournament behavior.

## Counting rules
- Pool-based individual divisions: all pool bouts plus the complete championship bracket.
- Direct individual elimination: all scoreable matches represented in Court Context.
- 3-person and 5-person team tournaments: scoreable team pairings multiplied by team size; generated representative playoffs are added.
- Kachinuki: completed bouts are shown without a fixed denominator because the number of bouts varies with wins and ties.

## Architecture impact
Presentation/read-only Director projection only. Match Objects remain authoritative.
