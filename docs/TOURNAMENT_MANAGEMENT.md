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


## Team round robin ranking (F27, decided by the owners, WKC style)

- Teams are ranked by (a) team match wins, then (b) individual bout wins, then (c) points (ippon) scored.
- Teams still level on all three for a place that gets an award fight a one-point daihyosen (representative bout, ippon shobu; a winner is required), one bout per pair of the level teams, once every pairing is decided; its winner takes the place. Teams still level after it (a circle of three) fight another round.
- The places that get an award follow Setup's "Team Awards to Display" (D2, decided by the owners): Champion only → 1st; Champion + Runner-up (the default) → 1st–2nd; Champion + Runner-up + 3rd place(s) → 1st–3rd.
- Level teams below those places share the rank. Daihyosen bouts do not count in the team records.
- A daihyosen bout is labelled "Daihyosen — first point wins" on the court screen, Live Scores and the TV (D1); the scorekeeper still ends it with Next Match.
- Scorer notes (court screen, #38): a tag next to the bout line says "Winner required" or "Hikiwake allowed". While a winner-required bout (a semifinal or final, a team playoff, a daihyosen) is tied, the match area shows "Encho — winner needed" and Next Match is disabled; one point (or a hansoku point) clears it. While a hikiwake-allowed bout (pool or round robin) is tied, Next Match reads "Next Match (Hikiwake)": pressing it records a draw. A bout at 0-0 counts as tied.
- Fusen-sho asks "who won?": press the winning side's button (White or Red, with the fighter's name; the buttons are in the same left/right order as the court screen). The winner is recorded with F F, as before.
- "Configure court" (staff, top right of the court screen) sets this court's Red side (Left / Right, as seen from the scoring table) without going to Setup; it edits the same Setup setting, so every device follows. It never changes which fighter is Red or White.

## Division running order and Continue (#31)

- Setup's divisions table lists the divisions in their running order (enabled ones; switched-off ones below, a switched-off custom division keeps its row). Move up / move down change it; it is saved and synced like every Setup edit.
- Each court plays its divisions in that order: the court's division dropdown, the division-complete box's **Continue to <next division>** (the next one in the order with a match ready on that court: finished divisions, divisions not generated yet and divisions waiting on the other court are skipped) and the TV's / Live Scores' "Up next on this court".
- Continue (and Close TV results after Keep showing results) is the court's ordinary division choice, so the court's TV and Live Scores follow. "All divisions on Court X are done." when nothing is left on the court.

## Renaming a division (#25, product owner)

- Every row of Setup's divisions table, preset or custom, switched on or off, has **Rename**: the name becomes a text field (Save or Enter; Cancel or Escape). The preset names stay the defaults of a new tournament.
- A rename changes the name everywhere it is used: its place in the running order (unchanged), its format and court (a renamed preset keeps them and stays a preset: no ×, listed with the presets when switched off, its old name not listed again), every competitor of the division, the Registration dropdowns and the device's own division choices. It is saved and synced like every Setup edit and recorded in the tournament (`state.divisionRenames`).
- Names are trimmed, must not be empty and must be unique among the divisions, ignoring case (switched-off presets and custom divisions count; "Team Tournament" and "Exhibition Matches" are taken). A change of case only is allowed. A refused rename shows why in the row and changes nothing.
- **Before the draw only.** Once Generate Tournament has run (the whole tournament, not per division: the name is also in pools, matches, court history, results and other devices' court choices), Rename shows "Divisions can't be renamed after the draw; rename-anytime comes with stable IDs." (stable IDs, issue #15). A division with pools or matches of its own is refused the same way.
- **The team event is not renamable**: "Team Tournament" is a fixed key the engine and every screen look up by name, teams have no division field, and it is not a row of the divisions table. "Exhibition Matches" likewise.
- **Two devices at once:** a rename touches the divisions, their formats and courts and the competitors, which the save-conflict merge (F4) handles as separate values. So on a conflict renames are replayed whole first: the other device's renames are applied to this device's edits, this device's renames to the server copy. A competitor added to or edited under the old name on the other device ends up on the new name, and both edits are kept. A rename that cannot be replayed (the draw was made on the other device, the division was removed or renamed there, the new name was taken there) is not saved at all, with a notice; the other device's version is kept.

## Paste from Excel (owner decisions 16, 17)

- On Registration → Individual Players, paste rows copied from a spreadsheet (Ctrl+V / Cmd+V; the Paste from Excel button explains it). Columns, tab-separated: Name, Dojo, Division, Seed, Status; only Name is required.
- Division: one offered in Setup (empty: the first division). Status: Registered, Checked In (or Checked) or No Show (or NoShow), in any case (empty: Registered).
- A row with another division or status is not added (an unknown division is never created); a notice lists those rows and why. Cells are trimmed; CR LF, CR and LF line ends all work.

## Kachinuki (confirmed by the owners)

- A team loses only when its last player loses. A draw eliminates only the other team's player while that team still has players; when both teams' players are exhausted by draws, a representative playoff decides.

## Seed-locked tiebreak resolution

Once a tiebreak series uniquely secures an advancing seed, that seed is frozen. Later tiebreak series may resolve only the remaining unresolved seed range and may not displace already secured players or teams.

## v3.12.6 template-consistency clarifications

- A two-person tiebreak for first place owns and resolves both advancing placements: winner to Seed 1 and loser to Seed 2.
- A tiebreak at the second-place boundary owns only Seed 2 and cannot alter an already secured Seed 1.
- Structural no-show handling changes only the absent entrant's pool (#24, product owner): before any of that pool's bouts is played, its bouts are rebuilt in the standard order for the new size (3 players: A–B, C–B, C–A, so nobody changes tasuki between consecutive bouts), in the pool's place and on its court, and the remaining players keep their slot letters. Every other Match Object (other pools, the championship template) retains its template order, pool identity and court assignment. A pool with a played bout is not restructured.
- Championship seed-pair mappings are frozen at generation. A no-show does not select a different championship template, including the native six-competitor 3+3 configuration.

## Deleting a tournament

A tournament can only be deleted by a staff device of that tournament (Staff Login first). Open **Developer Tools** (click the connection status in the header) and press **Delete tournament**:

1. Read the warning: the delete **cannot be undone**, and every device connected to the tournament is disconnected and returned to the Tournament Library. The dialog shows how many devices are connected right now.
2. Press **Download a backup first** to save the tournament as a `.ksm` file (the same file as Setup → Advanced → Backup → Download Tournament File). It can be loaded again as a new tournament later.
3. Type the tournament's name exactly as shown (capital letters count; spaces around it do not). **Delete tournament** stays disabled until it matches.
4. Press **Delete tournament** (or Enter). The device shows the Tournament Library with "Tournament deleted".

Other devices show "This tournament was deleted" and return to the Library; a device that was offline shows it when it reconnects, and anything it had not saved is discarded. The server keeps only a marker that the tournament was deleted, so no device can bring it back. Spectators are not offered the action.

## Team divisions

Setup → Team Competition supports several independent team divisions. Keep **Teams enabled** on
for team competition. Use **Add team division**, enter a name, and choose the match format
(3-Person Team, 5-Person Team, or Kachinuki), tournament format (Single Elimination or Round Robin),
court, and awards for each division. Move up/down changes their running order. Names and order
can change without changing any team's assignment. Format, court, removal and assignments are
locked after generation; names, order and awards remain editable.

Registration → Team Registration has a division select on each team and a division filter beside
the name filter. New teams belong to the first division in running order. Removing a division with
teams asks for confirmation and names the remaining division those teams will move to. Add another
division first if the only division still contains teams.

Generation builds each competition independently. Courts, Live Scores, TV, Results & Awards,
Overview, stream overlays, and printable exports show its name. Continue and Up next also use
the division name; their selection remains tied to its persisted ID. A 3-person bracket on Court A and a 5-person round
robin on Court B can run in the same tournament. Kachinuki uses the same rules in every division:
the opposing last player must lose before the pairing ends.

Old files, cloud copies, autosaves and recovery files load through the same migration. An enabled
old team event becomes one division named “Team Tournament”; the existing draw, scores, medals,
format, court and award mode are preserved. Disabled old tournaments get no team division.

Each division has a persisted ID independent of its name and position. Devices merge changes by
ID and merge individual division fields independently. Concurrent additions both survive. Removing
a division wins over concurrent edits to it. If another device assigns a team to that removed
division, the team goes to the first remaining division in running order, and the conflict notice
names the team division assignment. If no division remains, the assignment is empty until a
new division is added and selected.

### Compatibility reader audit

These were all readers or declarations of the five old team settings before #85. The old Setup
fields remain serialized for compatibility; division records now supply each competition's settings.

| Reader | Current role |
| --- | --- |
| `app/index.html` | Global enable switch; legacy setting controls retained as compatibility adapters, with the division editor above them. |
| `app/engine/settings.ts` | Pure defaults and legacy Setup reader, also used by migration. |
| `app/engine/teams.ts` | Pure existing team engine; receives one division's format and tournament format. |
| `app/engine/generation.ts` | Generates one competition from its stable division ID and filtered teams. |
| `app/js/01-state-and-setup.js` | Legacy defaults and Setup compatibility fields; publishes the division editor. |
| `app/js/03-registration-and-validation.js` | New teams default to the first division; counts and validates each team division independently. |
| `app/js/05-engine-team-matches.js` | Supplies division-specific match format to slots, bracket creation and advancement. |
| `app/js/07-engine-team-bracket.js` | Uses the scored match's division tournament format for winner requirements. |
| `app/js/08-engine-generation.js` | Runs the pure engine once per enabled team division. |
| `app/js/09-results-and-awards.js` | Builds representative rosters with the team's division format and division identity. |
| `app/js/13-engine-standings-and-tiebreaks.js` | Division-specific standings, representative playoffs, round-robin daihyosen and award places. |
| `app/js/17-print.js` | Snapshot-only migration and division settings for independent rosters, standings, brackets and awards. |
| `app/js/18-sync-state-and-rebase.js` | Includes division records in the merge base, merges by ID, and labels assignment conflicts. |
| `app/js/20-cloud-session-and-autosave.js` | Serializes legacy Setup fields; loads division courts from the migrated records; returns save success. |
| `app/js/27-results-screen.js` | Uses each division's award mode. |
| `app/js/30-setup-header-and-director.js` | Uses each division's team format in Overview progress estimates. |
| `app/js/35-react-court.js` | Uses each division's award mode for completion panels and its scoped representative roster. |
| `app/js/43-react-registration.js` | Publishes a division selector and per-team format/slots; preserves both filters. |
| `app/react/registration/RegistrationTeams.tsx` | Draws the selector and each team's own roster slots. |
| `app/react/registration/teams-model.ts` | Typed registration input with per-card division, slots and format. |
| `app/types/globals.d.ts` | Legacy select declarations remain for compatibility controls. |
| `app/types/tournament.d.ts` | Persisted division records and team assignment IDs, alongside old Setup fields. |

## Grand champion (#86)

Setup → **Grand Champion** → **Add grand champion match**: tick the individual divisions whose
winners meet, then choose the court and the awards (**Grand Champion only**, or **Grand Champion +
Runner-up**). Two divisions always play one match (a Final: a tie cannot end it, Encho decides).
With three or more, choose **Single elimination** (a bracket of the winners) or **Pool of winners**
(3–5 divisions, one round robin decided by the standings and their tiebreaks). After generation the
divisions, format and court are fixed; the name and awards stay editable.

- **Fill-in.** When every chosen division is complete, its winners are drawn into the match on its
  court: the court's division list has it and **Continue** goes there. Until then the row says which
  divisions it is waiting for.
- **Withdrawal.** **Withdraw a player…** on the row: the division's **runner-up** plays instead, or
  the winner loses by **Fusen-sho** (every unplayed bout of theirs, recorded as the court's Fusen-sho).
  Offered until that player's match starts. If the same person won two chosen divisions, the row asks
  who plays for the later one (the runner-up).
- **A division corrected before the match starts** (Undo on its court, a result corrected): the match
  follows, filled with the corrected winner, or emptied until the division is decided again.
- **A division corrected after the match started**: nothing changes by itself. The director is asked
  in the page (a court device only shows a notice; Setup's row has **Decide…**): **Keep the match as
  played**, or **Draw again** with the corrected players (its results are deleted). The answer is
  saved with the row, so every device does the same; a later correction asks again.
- **Results, TV, print.** The match's places are its awards: **Grand Champion** (and **Runner-up**).

Sync: rows merge by id on a save conflict (a removed row wins, with the usual notice). The draw is
not merged: every device that saves recomputes it from the divisions after each change, load and
rebase, so they all reach the same draw. A court's points for players that another device has since
replaced (a correction before the start) are not saved onto the new players; the court is told.
Saved format 3 (`KSM_CLIENT_SCHEMA`): the server refuses saves from apps older than this.
