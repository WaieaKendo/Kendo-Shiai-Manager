# KSM Constitution v1.0

## Purpose
Kendo Shiai Manager (KSM) exists to provide a reliable, deterministic, intuitive tournament management system for kendo.

## Core Principles
- Tournament Templates define tournament structure.
- Standard Match Objects are created only during tournament generation.
- Dynamic Match Objects are allowed only for:
  - Individual pool-play tiebreaks
  - 3-person representative matches
  - 5-person representative matches
  - Kachinuki representative matches
  - 3-person RR tiebreaks
  - 5-person RR tiebreaks
  - Kachinuki RR tiebreaks
- Pool order and template match order never change after generation.
- Split courts only assign existing matches.
- Views never create Match Objects.
- No-shows remove only affected matches.
- Tournament Engine is frozen as of v3.12.9 except for verified bug fixes.

## UI Philosophy
- Minimal, consistent, responsive.
- Mobile and desktop are first-class.
- Visual consistency over decoration.

## Cloud Philosophy
Cloud extends the local engine; it does not replace it.

## Testing
All engine changes must pass TestLab before release.

## Final Principle
KSM should never surprise the tournament director.

The Constitution takes precedence over all other KSM design documents.
