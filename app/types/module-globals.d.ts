// Types for the names app/js imports from app/modules (app/js/00-imports.js). tsc checks app/js files as plain
// scripts that share one global scope, and an import would not put a name in it, so each imported name is
// declared here with the type of the module export. Keep in step with 00-imports.js
// (tests/no-duplicate-declarations-test.mjs fails when they differ).
import type * as m0 from '../modules/app-state.js';
import type * as m1 from '../modules/engine/engine-championship.js';
import type * as m2 from '../modules/engine/engine-pools.js';
import type * as m3 from '../modules/engine/engine-result-integrity.js';
import type * as m4 from '../modules/engine/engine-single-elim.js';
import type * as m5 from '../modules/engine/engine-standings-and-tiebreaks.js';
import type * as m6 from '../modules/engine/engine-team-bracket.js';
import type * as m7 from '../modules/engine/engine-team-matches.js';

declare global {
  const DIVISION_PRESETS: typeof m0.DIVISION_PRESETS;
  const state: typeof m0.state;
  const buildChampionshipTemplateMatches: typeof m1.buildChampionshipTemplateMatches;
  const champMatchBySlot: typeof m1.champMatchBySlot;
  const champWinnerObj: typeof m1.champWinnerObj;
  const championshipLabels: typeof m1.championshipLabels;
  const championshipTemplateForTotal: typeof m1.championshipTemplateForTotal;
  const enforceUniqueIndividualMatches: typeof m1.enforceUniqueIndividualMatches;
  const expectedRoundCount: typeof m1.expectedRoundCount;
  const firstRoundName: typeof m1.firstRoundName;
  const individualLogicalMatchKey: typeof m1.individualLogicalMatchKey;
  const nextRoundFromName: typeof m1.nextRoundFromName;
  const previousRoundName: typeof m1.previousRoundName;
  const roundSequenceFromFirst: typeof m1.roundSequenceFromFirst;
  const sourceLabelForRound: typeof m1.sourceLabelForRound;
  const assignPoolPlayerSlots: typeof m2.assignPoolPlayerSlots;
  const buildPoolMatches: typeof m2.buildPoolMatches;
  const championshipCourtFor: typeof m2.championshipCourtFor;
  const divisionCourtMode: typeof m2.divisionCourtMode;
  const eligibleIndividuals: typeof m2.eligibleIndividuals;
  const eligibleTeams: typeof m2.eligibleTeams;
  const poolCourtFor: typeof m2.poolCourtFor;
  const poolMatchPairs: typeof m2.poolMatchPairs;
  const poolPlayerSlot: typeof m2.poolPlayerSlot;
  const poolPlayerSlotLetter: typeof m2.poolPlayerSlotLetter;
  const completedResultSnapshot: typeof m3.completedResultSnapshot;
  const repairCompletedMatchResults: typeof m3.repairCompletedMatchResults;
  const winnerOf: typeof m3.winnerOf;
  const dedupeSingleElimMatches: typeof m4.dedupeSingleElimMatches;
  const sideLabelGeneric: typeof m4.sideLabelGeneric;
  const singleElimOrderMap: typeof m4.singleElimOrderMap;
  const sortIndividualSingleElimMatches: typeof m4.sortIndividualSingleElimMatches;
  const APPROVED_DYNAMIC_MATCH_TYPES: typeof m5.APPROVED_DYNAMIC_MATCH_TYPES;
  const isIndividualPoolTiebreakMatch: typeof m5.isIndividualPoolTiebreakMatch;
  const makeTiebreakMatch: typeof m5.makeTiebreakMatch;
  const teamPairIds: typeof m5.teamPairIds;
  const teamPairSummary: typeof m5.teamPairSummary;
  const teamRoundRobinPairResolved: typeof m5.teamRoundRobinPairResolved;
  const teamRoundRobinProgress: typeof m5.teamRoundRobinProgress;
  const tiebreakMatchesForGroup: typeof m5.tiebreakMatchesForGroup;
  const unresolvedRequiredTiebreakGroup: typeof m5.unresolvedRequiredTiebreakGroup;
  const teamBracketNodesForCount: typeof m6.teamBracketNodesForCount;
  const teamWinner: typeof m6.teamWinner;
  const nodePairId: typeof m7.nodePairId;
  const slotLabel: typeof m7.slotLabel;
}
export {};
