# KSM Tournament Management Engine v3.12.0

## Scope

This document describes the implemented v3.12.0 management features. Match Objects remain the source of truth. These operations create or transform Match Objects only in the owning generation/management layer; views continue to present derived state.

## Court assignment

Individual divisions support:

- `A` — Court A only
- `B` — Court B only
- `split` — Split Between Courts

Split mode requires at least four eligible competitors.

### Pool play

Pools remain intact and fixed after generation. With `N` pools:

- Court A receives the first `floor(N / 2)` pools.
- Court B receives all remaining pools.
- Therefore Court B receives the extra pool when the count is odd.

Each generated pool Match Object owns an explicit `court` value.

### Direct elimination

Court assignment follows the canonical elimination-node topology:

- top half: Court A
- bottom half: Court B
- play-ins: court of the half they feed
- Final: Court A

### Pool championship bracket

The same top-half/bottom-half rule is applied to every championship round, with the Final on Court A. A first-round championship match may be created as soon as its own pool sources are finalized; unrelated pools do not block it.

## Tournament validation

Generate Tournament first runs `validateTournament()` and returns structured issues containing severity, code, division, message, and suggested action. Generation is blocked by errors. Implemented checks include:

- incomplete registration rows
- duplicate competitor entries within a division
- invalid division references
- invalid court assignment
- split mode below four eligible competitors
- unsupported entrant counts
- invalid or duplicate seeds
- invalid team counts/template range

A live Tournament Status card in Registration shows readiness, competitor count, division count, and court count.

## Fixed-position no-show handling

Structural no-show handling is available only when the division is generated and has zero completed Match Objects.

### Individual elimination

The target competitor is cleared from the frozen bracket entry slot. Canonical nodes remain unchanged. Bye propagation is recomputed without compacting or reseeding the bracket.

### Individual pool play

Only the target pool changes. The absent competitor and their matches are removed. Remaining player order is preserved. A four-player pool becomes the canonical three-player schedule. A three-player pool becomes one head-to-head match. Other pools remain untouched.

### Team tournament

Only whole-team no-shows are structurally handled. Elimination keeps the frozen team slots and recomputes byes. Round robin removes only pairings involving the absent team. Missing individual team members remain a manual Fusen-gachi workflow.

After a division has started, marking an entrant No Show does not alter generated structure.

## Regenerate Single Division

Registration includes a Regenerate Single Division workflow:

1. Select a generated division.
2. Review status: Ready, Matches Started, or Not Generated.
3. Continue only when Ready.
4. Validate the selected division.
5. Confirm the exact scope.
6. Regenerate transactionally.

The operation replaces only the selected division's pools/bracket, Match Objects, queues, Court Context, Results state, and Director projections. If generation fails, the prior division snapshot is restored. Ordinary scorekeeper Undo is not used for this structural operation.

## Persistence

Save schema is `1.1`; engine version is `3.12.0`. New state includes frozen team-elimination entries and a management revision counter. Older saves default to existing single-court assignments and initialize missing management state safely.

## v3.12.4 Split-Court Stabilization

Split Between Courts is a routing layer only. Pool standings, tiebreak detection, qualifier resolution, and bracket advancement continue to use the same engines as single-court divisions.

- Tiebreaks inherit the court assigned to their source pool.
- A two-person tiebreak requiring advancement must have a winner before Next Match can proceed.
- Split direct-elimination divisions show Court Queue; each court sees only its own matches. Single-court direct elimination continues to rely on Court Context without Court Queue.
- Split pool championship queues show only matches and future placeholders assigned to the active court.
- Court Context continues to show the complete bracket/division context.
- Every logical individual match has exactly one Match Object.


## v3.12.4 Bracket lifecycle and tiebreak invariants

- Standard direct-elimination Match Objects are instantiated once from the canonical template at generation.
- Advancement populates existing template nodes; it never creates quarterfinal, semifinal, or Final nodes.
- Only approved pool tiebreaks may be created dynamically.
- Two-person tiebreaks require a winner. Three- and four-person tiebreak matches may end in ties.
- After a multi-person tiebreak series, KSM resolves any determinable seeds and creates another tiebreak only for unresolved seed groups.
- Court filtering occurs after canonical match ordering.


## Match Object creation invariant (v3.12.4)

Every Match Object must originate from either the Tournament Template Library or the approved Dynamic Tiebreak Generator. No queue, view, advancement, court-assignment, or results subsystem may create a Match Object.

Approved dynamic types are limited to:

- `INDIVIDUAL_POOL_TIEBREAK`
- `TEAM_3_PERSON_REPRESENTATIVE`
- `TEAM_5_PERSON_REPRESENTATIVE`
- `KACHINUKI_REPRESENTATIVE`
- `TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK`
- `TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK`
- `KACHINUKI_ROUND_ROBIN_TIEBREAK`

Standard quarterfinals, semifinals, Finals, pool schedules, and elimination team pairings are template-owned and must exist before play begins.


## Seed-locked tiebreak resolution

Once a tiebreak series uniquely secures an advancing seed, that seed is frozen. Later tiebreak series may resolve only the remaining unresolved seed range and may not displace already secured players or teams.

## v3.12.6 template-consistency clarifications

- A two-person tiebreak for first place owns and resolves both advancing placements: winner to Seed 1 and loser to Seed 2.
- A tiebreak at the second-place boundary owns only Seed 2 and cannot alter an already secured Seed 1.
- Structural no-show handling changes only the absent entrant's pool (#24, product owner): before any of that pool's bouts is played, its bouts are rebuilt in the standard order for the new size (3 players: A–B, C–B, C–A, so nobody changes tasuki between consecutive bouts), in the pool's place and on its court, and the remaining players keep their slot letters. Every other Match Object (other pools, the championship template) retains its template order, pool identity and court assignment. A pool with a played bout is not restructured.
- Championship seed-pair mappings are frozen at generation. A no-show does not select a different championship template, including the native six-competitor 3+3 configuration.
