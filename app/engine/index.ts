// The engine's public surface. The build turns this into the classic script that
// defines `window.KSMEngine` (loaded before app.js); app/react/ imports the modules
// directly. Add each moved module's exports here.
export {
  poolSizes, clubGroup, shuffleDeterministic, poolPlayerSlotLetter, poolPlayerSlot,
  assignPoolPlayerSlots, buildPools, poolMatchPairs, buildPoolMatches,
} from './pools.ts';
export type { PoolEntrant, SlottedPlayer, BuiltPool, PoolMatch } from './pools.ts';
export { readSettings, DEFAULT_SETTINGS } from './settings.ts';
export type { TournamentSettings } from './settings.ts';
export {
  matchRequiresWinner, completedResultWinnerValid, completedResultSnapshotValid, scoreWinnerOf, winnerOf,
  pendingTiebreak, initialPoolStandings, tiebreakStatsForPlayers, tiebreakSeriesStats, resolveTiebreakBaseGroup,
  unresolvedRequiredTiebreakGroup, poolStandings, requiredSeedPlaces, makeTiebreakMatch, tiebreakMatchesForGroup,
} from './standings.ts';
export type {
  StandingsMatch, CompletedResultLike, StandingRow, TiebreakStatsRow, TiedGroup, StandingsPool, TiebreakMatch,
} from './standings.ts';
