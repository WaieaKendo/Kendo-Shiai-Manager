# KSM v3.10.6 — Live Scores Responsive Redesign

## Objective
Make the spectator Live Scores view readable and complete on phones without changing tournament behavior.

## Changes
- Phone portrait: White competitor remains left, Red competitor remains right, with the score centered between them.
- Phone landscape: competitors and score use one side-by-side scoreboard row.
- Mobile names, score letters, header, and vertical gaps are reduced.
- Desktop/projector styling is unchanged.

## Architecture impact
Presentation layer only. Match Objects remain the source of truth.

## Verification
- Hosted/PWA files: 19/19
- Mobile dropdown: 37/37
- Mobile Court portrait: 16/16
- Mobile Court responsive refinements: 7/7
- Director overview: 6/6
- Live Scores responsive layout: 18/18
- Browser errors: 0
