# Tournament Engine Summary

Status: Frozen (v3.12.9)

Architecture:
- Templates own tournament structure.
- Advancement fills existing Match Objects only.
- Standard elimination matches are never dynamically created.
- Split courts assign existing matches.
- Team and pool tiebreaks are the only approved dynamic match creation.

Supported:
- Individual pool + championship
- Individual elimination
- 3-person teams
- 5-person teams
- Kachinuki
- Split courts
- No-shows
- Regenerate single untouched division
- TestLab regression harness
