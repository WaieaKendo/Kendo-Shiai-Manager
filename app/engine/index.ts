// The engine's public surface. The build turns this into the classic script that
// defines `window.KSMEngine` (loaded before app.js); app/react/ imports the modules
// directly. Add each moved module's exports here.
export {
  poolSizes, clubGroup, shuffleDeterministic, poolPlayerSlotLetter, poolPlayerSlot,
  assignPoolPlayerSlots, buildPools, poolMatchPairs, buildPoolMatches, poolNoShowPlan,
} from './pools.ts';
export type { PoolEntrant, SlottedPlayer, BuiltPool, PoolMatch, PoolNoShowMatch } from './pools.ts';
export { readSettings, DEFAULT_SETTINGS } from './settings.ts';
export type { TournamentSettings } from './settings.ts';
export {
  matchRequiresWinner, completedResultWinnerValid, completedResultSnapshotValid, scoreWinnerOf, winnerOf,
  pendingTiebreak, initialPoolStandings, tiebreakStatsForPlayers, tiebreakSeriesStats, resolveTiebreakBaseGroup,
  unresolvedRequiredTiebreakGroup, poolStandings, requiredSeedPlaces, makeTiebreakMatch, tiebreakMatchesForGroup, tiebreakBlocks,
} from './standings.ts';
export type {
  StandingsMatch, CompletedResultLike, StandingRow, TiebreakStatsRow, TiedGroup, StandingsPool, TiebreakMatch, TiebreakBlock,
} from './standings.ts';
export {
  championshipTemplateForTotal, championshipLabels, firstRoundName, nextRoundFromName, roundMatchCount,
  championshipCourtFor, championshipMatchObjectForNode, buildChampionshipTemplateMatches, poolFinished,
  poolSeedResolution, parseSeedLabel, seedNameForLabel, champWinnerObj, championshipNodeSource,
  syncChampionshipTemplate, sourceLabelForRound, individualPlacements,
} from './championship.ts';
export type {
  ChampSource, ChampNode, ChampMatchLike, Competitor, ChampionshipMatch, SeedResolution as ChampSeedResolution,
  ChampionshipUpdate, Placement,
} from './championship.ts';
export {
  singleElimBracketSize, protectedSeedQuadrant, singleElimSlotInfo, chooseBestSeedSlot, placeIndividualsForSingleElim,
  singleElimCourtFor, buildIndividualSingleElimMatches, indivSide, syncIndividualSingleElim, sideLabelGeneric,
} from './single-elim.ts';
export type {
  SingleElimSource, SingleElimTemplateNode, SingleElimNode, SingleElimWinner, SingleElimEntrant, SlotInfo,
  SingleElimMatch, SingleElimMatchLike, SingleElimUpdate,
} from './single-elim.ts';
export {
  teamSlots, slotLabel, teamPairMatchObjects, buildTeamMatches, teamSource, winnerSource, teamNode, teamBracketNodesForCount,
  teamPairMatches, teamPositionMatches, teamPairSummary, teamWinner, teamPairIds, teamSideTeam, nodeHasMatch, nodePairId,
  syncTeamBracket, maybeCreateTeamTiebreak, teamRoundRobinPairResolved, teamStandings, teamRoundRobinProgress,
  teamRoundRobinPlacements, teamNodeSideName, teamFinalPlacements, teamRoundRobinTiebreakPlan, TEAM_ROUND_ROBIN_COUNTED_PLACES, teamRoundRobinCountedPlaces,
} from './teams.ts';
export type {
  TeamPosition, TeamEntry, TeamBracketSource, TeamBracketNode, TeamPositionMatch, KachinukiStartMatch, TeamBout, TeamMatchLike,
  TeamPairSummary as TeamPairSummaryData, TeamPlayoffSource, TeamPlayoff, TeamRepresentativeType, TeamStandingRow, TeamPlacements,
  TeamDaihyosen, TeamRoundRobinTiebreakType,
} from './teams.ts';
export { kachinukiTransitionState, kachinukiPairWinner, maybeCreateKachinukiNext } from './kachinuki.ts';
export type { KachinukiMatchLike, KachinukiBoutLike, KachinukiTransition, KachinukiPlayoff, KachinukiContinuation, KachinukiNext } from './kachinuki.ts';
export {
  completedResultSnapshot, planCompletedResultRepairs, loadedEliminationRepairPlan, isValidMatchObject,
  individualLogicalMatchKey, uniqueIndividualMatches, legacyTiebreakSyncIdentity, matchSyncIdentity, matchHasSyncIdentity,
} from './integrity.ts';
export type { CompletedResult, CompletedResultRepair, IdentityMatch } from './integrity.ts';
export { eligibleIndividuals, eligibleTeams, generateDivision, TEAM_DIVISION, EXHIBITION_DIVISION } from './generation.ts';
export type { CompetitorRow, TeamRow, ExhibitionRow, GenerationInput, DivisionPlan, RoundRobinPool, ExhibitionMatch } from './generation.ts';
export {
  routePath, routeUrl, parseRoutePath, parseLegacyLink, resolveUrl, legacyQuery, servesAppShell, servesOverlay,
} from './routes.ts';
export type { Route, RouteCourt, ResolvedUrl } from './routes.ts';
export {
  RENAME_AFTER_DRAW_MESSAGE, RENAME_EMPTY_MESSAGE, DIVISION_STRUCTURE_KEYS, drawMade, presetNames, divisionNamesInUse, isDivision,
  divisionRenameError, renamedDivisionState, rebaseDivisionRenames, orphanedDivisionStructure, withoutDivisionStructure,
} from './divisions.ts';
export type { DivisionRename, RenameState, RefusedRename, RenameRebase } from './divisions.ts';
