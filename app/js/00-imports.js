// Step 3d of #136: the modules app/js uses, imported by name so the rest of the concatenation keeps calling them as before.
import {DIVISION_PRESETS,state} from '../modules/app-state.js';
import {dragPoolPlayer,dropPoolPlayer,insertPoolPlayer,saveEditedPools,toggleEditPools} from '../modules/court/court-context-and-pool-editing.js';
import {applyCourtState,findNextForCourt,individualMatchReady,initCourtStates,isTeamMatch,openCourt,openPublicCourt,renderDivisions,sortIndividualDivisionMatches,sortTeamMatches} from '../modules/court/court-match-order.js';
import {SINGLE_ELIM_CONTEXT_LAYOUTS,normalizeQueueGroupLabel,setCourtSupportMode} from '../modules/court/court-queue-and-context.js';
import {activeScoreArrays,courtCurrentMatch,showCompProfile,teamSideLabel} from '../modules/court/court-queue-and-views.js';
import {KSM_UNDO_LOG_LIMIT,ensureCourtHistory,hansoku,loadScoreFromMatch,matchRequiresWinner,nextMatch,performCourtAction,point,redo,undo,updateUndoButton} from '../modules/court/court-scoring-and-history.js';
import {ksmMatchTimerInput,ksmNormalizeTimerSettings,ksmSaveTimerSettings,ksmSetCourtTimerEnabled,ksmSetCourtTimerSound} from '../modules/court/match-timer.js';
import {closeFusenDialog,confirmFusen,ensureScorableCurrentMatch,matchDisplayMeta,openFusenDialog,updateScoreTournamentName} from '../modules/court/scorekeeper-screen.js';
import {contextDivisionForCourt,renderContext,renderQueue,setCourtCompletePresentation,syncIndividualSingleElim} from '../modules/court/split-court-templates.js';
import {buildChampionshipTemplateMatches,champMatchBySlot,champWinnerObj,championshipLabels,championshipTemplateForTotal,enforceUniqueIndividualMatches,expectedRoundCount,firstRoundName,individualLogicalMatchKey,nextRoundFromName,previousRoundName,roundSequenceFromFirst,sourceLabelForRound} from '../modules/engine/engine-championship.js';
import {assignPoolPlayerSlots,buildPoolMatches,championshipCourtFor,divisionCourtMode,eligibleIndividuals,eligibleTeams,poolCourtFor,poolMatchPairs,poolPlayerSlot,poolPlayerSlotLetter} from '../modules/engine/engine-pools.js';
import {completedResultSnapshot,repairCompletedMatchResults,winnerOf} from '../modules/engine/engine-result-integrity.js';
import {buildIndividualSingleElimMatches,dedupeSingleElimMatches,maybeAdvanceIndividualSingleElim,sideLabelGeneric,singleElimOrderMap,sortIndividualSingleElimMatches} from '../modules/engine/engine-single-elim.js';
import {APPROVED_DYNAMIC_MATCH_TYPES,isIndividualPoolTiebreakMatch,makeTiebreakMatch,teamPairIds,teamPairSummary,teamRoundRobinPairResolved,teamRoundRobinProgress,tiebreakMatchesForGroup,unresolvedRequiredTiebreakGroup} from '../modules/engine/engine-standings-and-tiebreaks.js';
import {teamBracketNodesForCount,teamWinner} from '../modules/engine/engine-team-bracket.js';
import {nodePairId,slotLabel} from '../modules/engine/engine-team-matches.js';
import {esc,jsArg} from '../modules/html-text.js';
