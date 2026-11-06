// Step 3d of #136: the modules app/js uses, imported by name so the rest of the concatenation keeps calling them as before.
import {DIVISION_PRESETS,state} from '../modules/app-state.js';
import {buildChampionshipTemplateMatches,champMatchBySlot,champWinnerObj,championshipLabels,championshipTemplateForTotal,enforceUniqueIndividualMatches,expectedRoundCount,firstRoundName,individualLogicalMatchKey,nextRoundFromName,previousRoundName,roundSequenceFromFirst,sourceLabelForRound} from '../modules/engine/engine-championship.js';
import {assignPoolPlayerSlots,buildPoolMatches,championshipCourtFor,divisionCourtMode,eligibleIndividuals,eligibleTeams,poolCourtFor,poolMatchPairs,poolPlayerSlot,poolPlayerSlotLetter} from '../modules/engine/engine-pools.js';
import {completedResultSnapshot,repairCompletedMatchResults,winnerOf} from '../modules/engine/engine-result-integrity.js';
import {dedupeSingleElimMatches,sideLabelGeneric,singleElimOrderMap,sortIndividualSingleElimMatches} from '../modules/engine/engine-single-elim.js';
import {APPROVED_DYNAMIC_MATCH_TYPES,isIndividualPoolTiebreakMatch,makeTiebreakMatch,teamPairIds,teamPairSummary,teamRoundRobinPairResolved,teamRoundRobinProgress,tiebreakMatchesForGroup,unresolvedRequiredTiebreakGroup} from '../modules/engine/engine-standings-and-tiebreaks.js';
import {teamBracketNodesForCount,teamWinner} from '../modules/engine/engine-team-bracket.js';
import {nodePairId,slotLabel} from '../modules/engine/engine-team-matches.js';
