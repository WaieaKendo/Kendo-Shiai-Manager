#!/usr/bin/env node
// Proves that app/ is the old single-file public/index.html, moved and not changed.
//
//   node scripts/verify-split.mjs [commit]     (default def5010, the last single-file version)
//
// 1. Markup: app/index.html is the old file with the <style> blocks replaced by the
//    app.css <link> and the <script> element by the app.js <script src>.
// 2. CSS: app/styles/*.css in order are the old <style> blocks' lines, in order.
// 3. JS: app/js/*.js in order are the old <script> contents. Byte-identical when only
//    moved; once type annotations (comments) are added, the check compares the code
//    with comments and formatting removed (Vite's minifier with compress/mangle off),
//    and reports which it did.
//
// Deliberate post-split additions are wrapped in markers, one line or several:
//   /* ksm:post-split-begin <name> */ ...added code... /* ksm:post-split-end */
// The check removes those regions (and one newline right after an end marker) before
// comparing, and KNOWN_POST_SPLIT_EDITS pins how many regions each <name> has, so an
// unmarked or unlisted change still fails. An inline replacement records the old code
// in the begin marker, `/* ksm:post-split-begin <name> was:<old code> */new/* ksm:post-split-end */`,
// and the check puts <old code> back in place of the region.
//
// Functions moved into app/engine/ (MOVED_TO_ENGINE) keep their declaration in app/js,
// with a body that is only a marked delegation to KSMEngine; for them the check
// compares against the old declaration with its body emptied.
//
// Old code deliberately deleted (REMOVED_COURT_RENDERER: the legacy court renderer, M.8
// step 5; REMOVED_LIVE_SCORES_RENDERER, REMOVED_TV_RENDERER, REMOVED_RESULTS_RENDERER,
// REMOVED_OVERVIEW_RENDERER, REMOVED_LIBRARY_RENDERER, REMOVED_POOLS_RENDERER, REMOVED_SETUP_RENDERER,
// REMOVED_REGISTRATION_RENDERER and REMOVED_SHELL_RENDERER: the legacy Live Scores, TV, Results,
// Overview, Tournament Library, Pools, Setup and Registration renderers and the legacy shell, M.13) is named piece by piece; the check deletes exactly those pieces from the old script before comparing, so every
// other difference, and any piece that no longer matches, still fails.
import { execFileSync } from 'node:child_process';
import { minify } from 'vite';
import { extractFunction } from '../tests/lib/ksm-source.mjs';
import { ROOT, STYLE_TAG, SCRIPT_TAG, VERSION_PLACEHOLDER, indexHtml, appStyles, appScript } from './app-sources.mjs';

const commit = process.argv[2] || 'def5010';
const KNOWN_POST_SPLIT_EDITS = {
  // feat/path-urls (M.9): app/js/00-path-urls.js (an old query link becomes its path before the
  // app reads it; ksmLinkParams(), ksmLinkUrl()), and the old address reads and link builders
  // switched to them: isTvSession(), roleLink(), tvLink(), restoreAutoSaveIfWanted() (21),
  // KSM_TV_ASSIGNED_COURT (25), spectatorLink(), initializeCloudRoleFromUrl() (33). The court-pin,
  // load-file-guard and stream-overlay regions read and write the address through them too.
  'path-urls': 13,
  // feat/react-setup: app/js/00-react-bridge.js + the ksm:state-changed dispatch in
  // performCourtAction() and renderAll(), so React islands re-render with `state`.
  'react-bridge': 3,
  // feat/grand-champion (#86): app/js/01-grand-champion.js (the rows, the derived draw, the director's
  // questions, Setup's island data); the draw follows the sources after every edit and court action
  // (scheduleAutoSave(), criticalAutoSave(), 20) and every load (applyTournamentPayload(), 21); a row
  // that cannot be drawn is a generation error (03); a printed sheet shows the row's name and format (17);
  // a save conflict carries this device's draw into a server copy without one and does not move a court's
  // points onto a grand champion drawn again with other players (18, three regions).
  // Listed here because 01-grand-champion.js is its first region: names in order of first appearance.
  'grand-champion': 9,
  'tournament-switcher': 23,
  'team-divisions': 32,
  // fix/react-batch-1 (F13): addDivision() (01) reads the old #newDiv / #newDivType fallbacks as
  // window properties (the page has no such fields; the bare names threw for an empty name).
  'add-division': 2,
  'library-setup': 13,
  // fix/quirks-pass (Setup): toggleDivision() (01) switching a preset back on keeps the format and
  // court it had (still in state), the preset's only when it has none.
  'quirks-setup': 1,
  // fix/court-assignment: a court change after the draw moves the division's unplayed matches
  // (setDivisionCourt(), ksmReassignDivisionCourt() in 01); Generate starts each court on its own
  // first division instead of the Generated Pools dropdown's (08).
  'court-reassign': 3,
  // feat/react-setup-screen (M.13): the Setup screen's React islands (#divisionSetupRows,
  // #setupTournamentName). With the legacy renderer removed (REMOVED_SETUP_RENDERER) the bodies of
  // renderDivisionSetup() (01) and syncSetupHeader() (30) are marked publishers, and
  // app/js/42-react-setup.js publishes the rows and the name as plain data and shows a notice when
  // the React module is missing.
  // Listed here because renderDivisionSetup() (01) is its first region: the check compares names
  // in order of first appearance.
  'react-setup': 3,
  // feat/react-court-screen, feat/react-court-header (M.8): the court screen's React islands
  // (app/js/35-react-court.js); renderScore() hands the match display over (check at the top of
  // the last renderScore()); renderDivisions() and updateScoreTournamentName() publish the
  // header; feat/react-court-actions: updateUndoButton() (10) publishes Undo/Redo;
  // feat/react-court-context: the live renderQueue()/renderContext() wrappers (32) publish the
  // queue and context panels; feat/react-court-finish (step 5): setCourtCompletePresentation()
  // (32) publishes the division-complete panel, and with the legacy renderer removed
  // (REMOVED_COURT_RENDERER) the court writers' bodies are marked publishers: renderDivisions()
  // (02), updateUndoButton() (10), renderScore() and updateScoreTournamentName() (22),
  // renderQueue(), renderContext() (new declarations in place of the 32 wrappers) and
  // setCourtCompletePresentation() (32). Listed here because renderDivisions() (02) is its first
  // region: the check compares names in order of first appearance.
  'react-court': 8,
  // feat/react-shell (M.13, the last step): the shell's React islands (the navigation bar, the
  // header's status row, the Fusen-gachi, generation check, Regenerate Single Division and cloud
  // dialogs). app/js/44-react-shell.js keeps what the legacy shell drew as plain data, publishes it
  // and shows a notice when the React module is missing. With the legacy shell renderer removed
  // (REMOVED_SHELL_RENDERER) the legacy functions are marked publishers or call one:
  // closeManagementModal(), showValidationDialog(), openRegenerateDivisionDialog(),
  // continueRegenerateDivision() (03), regenerateSingleDivision() (08), setConnectionStatus(),
  // renderPersistentSaveStatus(), updateSaveStatus() (20), renderCloudPresence(),
  // closeCloudModal(), cloudDiagnostics() (21), openFusenDialog(), closeFusenDialog() (22),
  // setNavMenuState(), positionMobileNavMenu(), closeNavMenus() and the resize listener (23, with
  // two inline `was:` replacements: toggleNavMenu() and the listener read the open menu from a
  // variable instead of the menus' classes), setActiveNavForView() (24), setSessionRole() and
  // openTournamentAccess() (33). Listed here because closeManagementModal() (03) is its first
  // region: the check compares names in order of first appearance.
  // feat/owner-decisions (issue #29, the owners' decisions on the quirk pass; #31): legacy edits
  // that carry out a decision. 03: + Add Row / + Add Team clear their filter so the new entry
  // shows (14, addRow(), addTeamRow()); cycleCompetitorStatus()'s alert says Fusen-sho (4, inline
  // `was:`); validateTournament() lists "No competitors registered" as an error when nothing would
  // be generated (2). 16: the Paste from Excel listener adds a row through ksmPasteRow() (16, 17;
  // inline `was:`) and names the refused rows (ksmPasteNotice()). Listed before react-shell:
  // addRow() (03) is its first region. 03: a No Show after generation asks first
  // (cycleCompetitorStatus(), cycleTeamStatus(); 18).
  'owner-decisions': 8,
  'react-shell': 24,
  // feat/react-registration (M.13): Registration part 1's React islands (#regTable, the contents
  // of #tournamentStatusCard). With the legacy renderer removed (REMOVED_REGISTRATION_RENDERER)
  // renderReg()'s body (03) is a marked publisher and renderTournamentStatus() (03) publishes in
  // place of its card markup, and app/js/43-react-registration.js publishes the players table and
  // the status card as plain data and shows a notice when the React module is missing.
  // feat/react-registration-2 (M.13, part 2): the team cards, the exhibition table and the tab bar
  // are React islands too. With their legacy renderer removed (REMOVED_REGISTRATION_RENDERER) the
  // bodies of renderTeams() and renderExhibitions() (03) are marked calls of their publishers in
  // 43, and regTab() (23) publishes the tab in place of the four class toggles.
  // Listed here because renderTournamentStatus() (03) is its
  // first region: the check compares names in order of first appearance.
  'react-registration': 6,
  // feat/team-division-after-draw: a division added after generation ('new') is drawn on its own by
  // Regenerate Single Division: divisionRegenerationStatus() (03) and regenerateSingleDivision() (08).
  'draw-new-division': 2,
  // fix/quirks-pass (Registration): renderReg(), renderTeams() and renderExhibitions() (03) also
  // refresh the tournament status card, so it is never stale after + Add Row, samples, Clear,
  // a paste or a team/exhibition edit; Load Sample Players, Load Sample Teams and Load Sample
  // Tournament (03) ask before replacing existing entries.
  'quirks-registration': 6,
  // fix/pre-event (M.12) added test IDs to markup drawn by app/js in `test-ids` regions (each line
  // kept in its `was:` marker): the exhibition rows' region went with renderExhibitions()'s body in
  // feat/react-registration-2 (4 -> 3), the Regenerate Single Division dialog's three
  // (openRegenerateDivisionDialog() x2, continueRegenerateDivision()) with the legacy shell in
  // feat/react-shell (3 -> none): the React islands carry those test IDs. Test IDs on the static
  // markup are listed in MARKUP_TEST_IDS.
  // fix/react-batch-1 (F19) escaped the status class of the team cards and exhibition rows
  // (html-escape: 1, in renderTeams()); that code went with the legacy renderer in
  // feat/react-registration-2 (React escapes it; html-escaping-test.py pins it).
  // fix/pre-event (F8): clearTeams()/clearExhibitions() confirm first (app/js/03).
  'clear-confirm': 1,
  // refactor/engine-bridge (roadmap 2.0+): one delegation per MOVED_TO_ENGINE function.
  'engine-bridge': 88,
  // refactor/engine-settings (roadmap 2.1): tournamentSettings() accessor + inline
  // replacements of engine DOM reads (`was:` form, see below); 9 at 2.1, 4 left after
  // the team engine moved (2.6) and its bridges pass tournamentSettings() in; 3 after
  // division generation moved (2.7).
  'engine-settings': 2,
  // fix/pre-event-2 (#24, product owner): applyIndividualNoShow() (08) rebuilds the no-show's pool
  // bouts in the standard order for its new size (KSMEngine.poolNoShowPlan).
  'pool-no-show': 3,
  // feat/react-pools (M.13): the Pools view's React island (#poolOutput). With the legacy renderer
  // removed (REMOVED_POOLS_RENDERER) the bodies of renderPools() (08) and toggleEditPools() (16)
  // are marked publishers, and app/js/41-react-pools.js publishes the view and the editor as
  // plain data and shows a notice when the React module is missing. Listed here because renderPools() (08) is its first region: the check
  // compares names in order of first appearance.
  'react-pools': 3,
  // fix/pre-event-2 (F30): Undo/Redo are logged per court (10-: KSM_HISTORY_KEYS, recordCourtUndoLog(),
  // undo(), redo()) and replayed in time order with the court actions by the 409 rebase (18-:
  // replayPendingCourtHistory(), mergeCourtHistoryStacks() and their two call sites). PR #33 review:
  // undo() and redo() also keep the touched divisions' matches before they apply (courtUndoMatchesBefore()),
  // so an Undo/Redo that inserts or removes matches is logged and replayed by identity; performCourtAction()
  // records the same for a court action (withCourtMatchOps()). PR #33 review: an ordinary Undo/Redo applies
  // its patches by match identity (applyCourtHistoryEntry(), two replacements in applyHistoryValues()) and
  // undo()/redo() note a part not applied in their status (two replacements).
  'history-replay': 14,
  'match-timer': 6,
  // fix/pre-event-2 (F27): maybeCreateTeamTiebreak() (13) also adds a team round robin's daihyosen
  // (KSMEngine.teamRoundRobinTiebreakPlan) when teams are level for 1st-3rd.
  // Found in external PR review (#35): ksmAddDaihyosenForTeamAwards() (13) adds the daihyosen a
  // team award mode changed after the round robin needs (with the Setup field's change listener),
  // also after a load or live/rebased update (applyTournamentPayload(), 21); KSM_TEAM_PLACE_TIED
  // (27), what Results and the court show for an awarded place still level.
  'team-rr-daihyosen': 4,
  // fix/react-batch-1 (F12): Edit Pool works on a copy (41-react-pools.js): the drop handlers
  // insertPoolPlayer(), dropPoolPlayer() and movePoolPlayer() (16) move players in it (three inline
  // replacements), saveEditedPools() (16) applies it after the played-results warning (one), and
  // the document-wide click listener (21) asks for no autosave for clicks in the editor (one).
  // toggleEditPools() reads the copy inside its react-pools region.
  'pool-edit': 5,
  // fix/react-batch-1 (F18): Paste from Excel splits rows on CR LF, CR and LF and trims each cell
  // (16: the document paste listener, two inline edits).
  'paste-lines': 2,
  // test/audit (F31): Paste from Excel asks for an autosave like every other registration edit (app/js/16).
  'paste-save': 1,
  // fix/pre-event (F9): printPlacementsForDivision() uses resultPlacements() (comment + body).
  'print-placements': 2,
  // fix/pre-event (F3, from fix/court-pin-after-reload): the pinned-court key no longer holds the
  // session role (18: storedCourtPin(), courtPinStorageKey() parameter + body, pinnedCourt() body)
  // and a tournament link without &court= starts on the device's stored court (33:
  // initializeCloudRoleFromUrl()).
  'court-pin': 5,
  // fix/f36-two-tabs (F36, #81): one writer per tab. app/js/18-two-tabs.js (tab id, heartbeat, an
  // outbox slot per tab, a closed tab's slot taken over), the per-tab ownership of history entries and
  // the other court's replay in the rebase (18), readOutbox()/writeOutbox()/clearOutbox() (20), the
  // echo check, the flush and the unload merge (21), and the writer id sent as x-ksm-client-id (33).
  'two-tabs': 16,
  // fix/pre-event (F4, from fix/setup-edit-conflict-merge): the 409 rebase merges non-court edits
  // three-way against the cloud copy they started from. 18: the merge helpers,
  // rebaseLocalPayloadOnRecord()'s basePayload parameter and merge call; 20: writeOutbox() keeps
  // the base; 21: live updates / own echo remember the base, the rebased save, the outbox flush
  // (two) and the page-unload queue pass it on (mergeQueuedStaffWork() passes the outbox's base
  // inside its outbox-flush-rebase region); 33: performCloudSave() takes, passes on and
  // remembers it, loadTournamentFromCloud() remembers it.
  'edit-merge': 16,
  // fix/react-batch-2 (F10): a structural edit (generate, regenerate, Edit Pool) is replayed onto
  // the server copy on a save conflict, or the director is asked (18: the replay helpers; the
  // merge base, the registration gate and the rebase's call are in edit-merge regions).
  'structural-replay': 1,
  // fix/staff-password-hardening (F33): writeOutbox() (20) leaves a queued staff snapshot alone on a
  // logged-out device (ksmKeepStaffOutbox() in 33's staff-hardening region), so a 401 keeps the
  // unsaved work as staff work until Staff Login.
  'staff-outbox': 1,
  // #40: persist and normalize the audience orientation.
  'tv-red-side': 2,
  // fix/pre-event (F11): saveAuto(), called by the awards editor but never defined (app/js/20).
  'autosave-origin': 8,
  // fix/f37-replace-conflict (F37, #88): Load Tournament File → Replace is saved on its own and never
  // rebased; on a 409 the director is asked (Replace anyway / Cancel). performCloudSave()'s options and
  // its 409 hand-off (33), ordinary saves and the outbox flush wait while the question is open, and
  // closing the question is Cancel (21); no autosave while it is unsettled (20). The Replace itself is in the load-file-guard region.
  'replace-conflict': 7,
  'startup-recovery': 5,
  'award-save': 1,
  // feat/delete-tournament (issue #26, the app side): a tournament deleted on the server (410
  // 'tournament-deleted', or the live connection closed with 'Tournament deleted') is forgotten by
  // the device and its save is neither queued nor retried: three announcing functions and
  // refreshTvFromCloud(), connectCloudSocket(),
  // saveTournamentToCloudWithReason() and flushCloudOutbox() (21); toggleStaffSession(),
  // performCloudSave(), loadTournamentFromCloud() and openTournamentFromHome() (33). The delete
  // dialog and the forgetting itself are in 44 (post-split throughout). Listed here because
  // refreshTvFromCloud() (21) is its first region.
  'delete-tournament': 9,
  'private-reads': 1,
  'tie-flash': 5,
  'friendly-links': 10,
  // fix/stuck-pending (F35, test audit N1), 21 and 33: a failed save queued in the outbox is retried
  // with backoff (scheduleQueuedSaveRetry(), from saveTournamentToCloudWithReason() and
  // flushCloudOutbox()), the local changes a queued snapshot carries are confirmed when it is sent
  // (noteQueuedMutation()/confirmQueuedMutation()), and performCloudSave() gives up on a save to an
  // existing tournament after KSM_CLOUD_SAVE_TIMEOUT_MS (cloudSaveTimeoutSignal()).
  'save-retry': 6,
  // fix/outbox-flush-local-changes (F6): mergeQueuedStaffWork() and its call at staff login;
  // the outbox flush also replays court actions taken before it started (comment + condition).
  'outbox-flush-rebase': 4,
  // fix/quirks-pass (shell): copyTextValue() (21) without the clipboard titles its prompt "<what>
  // (copy it from here):" instead of "<what> copied" (nothing was copied).
  'quirks-shell': 1,
  // fix/pre-event (F7): Load Recovery File asks first and refuses while work is queued
  // (confirmRecoveryFileLoad() + its call in loadRecoveryFile()).
  'recovery-guard': 2,
  // fix/pre-event (roadmap 0.5): Load Tournament File asks before replacing the open tournament and
  // loads a file of another tournament as a new one (loadTournamentFromFile(): two inline
  // replacements; the helpers after it); Download Tournament File writes the tournament ID and
  // revision into the file (manualSaveTournament(), inline).
  'auth0-access': 6,
  'load-file-guard': 4,
  // feat/court-clarity (issue #38): confirmFusen() (22) takes the winning side now.
  'court-clarity': 1,
  // feat/react-live-scores (M.13): the Live Scores screen's React island. With the legacy
  // renderer removed (REMOVED_LIVE_SCORES_RENDERER) renderPublic()'s body (25) is a marked call
  // of ksmRenderLiveScores(), and app/js/36-react-live-scores.js publishes the screen as plain
  // data and shows a notice when the React module is missing.
  'react-live': 2,
  // feat/react-tv (M.13): the TV display's React island. With the legacy TV renderer removed
  // (REMOVED_TV_RENDERER) renderTvDisplay()'s body (26) is a marked call of ksmRenderTv(), and
  // app/js/37-react-tv.js publishes the TV as plain data and shows a notice when the React module
  // is missing.
  'react-tv': 2,
  // feat/react-results (M.13): the Results screen's React islands. With the legacy renderer
  // removed (REMOVED_RESULTS_RENDERER) the bodies of renderResultsDashboard() and
  // openResultsBracket() (27) are marked calls of ksmRenderResults() / ksmRenderResultsBracket(),
  // and app/js/38-react-results.js publishes the screen as plain data and shows a notice when the
  // React module is missing.
  'react-results': 3,
  // fix/react-batch-1 (F15): tournamentSummary() (30) adds a kachinuki division's known bouts to
  // the total, as its completed count does.
  'overview-kachinuki': 1,
  // feat/react-overview (M.13): the Overview screen's React island. With the legacy renderer
  // removed (REMOVED_OVERVIEW_RENDERER) renderDirector()'s body (30) is a marked call of
  // ksmRenderOverview(), and app/js/39-react-overview.js publishes the screen as plain data and
  // shows a notice when the React module is missing.
  'react-overview': 2,
  // fix/quirks-pass (court): the renderScore() wrapper (32) publishes the completed division's
  // title and "Division complete" as the header's match line (it kept the last match's).
  'quirks-court': 1,
  // fix/staff-password-hardening (issue #9), all in 33: ksmStaffToken(); Staff Login
  // (toggleStaffSession()) shows the server's message when the tournament refuses password
  // attempts (HTTP 429, attempt limit) and keeps the session token it returns instead of the
  // password; performCloudSave() creates a tournament with the new password (never a token), keeps
  // the token the creation returns, and turns the device into a spectator on 401 (session expired).
  'refresh-keeps-staff': 6,
  'staff-hardening': 5,
  // #95 review (version gate): cloudHeaders() sends x-ksm-client-schema and performCloudSave() handles
  // the server's 426 (reload, no retry) (33).
  'client-schema': 2,
  // feat/react-library (M.13): the Tournament Library's React island. With the legacy renderer
  // removed (REMOVED_LIBRARY_RENDERER) paintHomeTournamentLibrary()'s body (33) is a marked call of
  // ksmRenderLibrary(), and app/js/40-react-library.js publishes the library as plain data and
  // shows a notice when the React module is missing.
  'react-library': 2,
  // feat/react-overlay: app/js/33-stream-overlay-links.js (TV menu "copy overlay link").
  'stream-overlay': 1,
};
// The same markers in app/styles/*.css (count per name, in order of first appearance).
const KNOWN_POST_SPLIT_CSS_EDITS = {
  'tie-flash': 2,
  'library-setup': 2,
  'print-guide': 1,
  // #85 team divisions: the Teams-off note and the disabled team setup (07-setup.css), and 08.
  'team-divisions': 2,
  // fix/pre-event (F2): Undo/Redo stay on the division-complete court screen (08); only
  // Fusen-gachi and Next Match are hidden there.
  'undo-after-complete': 1,
  // fix/react-batch-1 (F14): the TV canvas scales to fit the window, centred (end of 13-tv.css;
  // the factor --ksm-tv-fit comes from ksmFitTv() in app/js/37-react-tv.js, react-tv region).
  'tv-fit': 1,
  'tv-red-side': 1,
  // feat/owner-decisions (issue #29): the decisions' styles, theme tokens only, at the end of
  // 14-library-and-branding.css: hansoku on Live Scores and the TV (5), the Setup move buttons
  // (#31), the court's Continue box (7), between matches (6), read-only awards (8), the sample
  // buttons only with the test tools on (20), the daihyosen label (D1).
  'owner-decisions': 1,
  'privacy-footer': 1,
  // feat/division-rename (issue #25): app/styles/16-division-rename.css, the Setup divisions
  // table's Rename button, rename field and refusal message (theme tokens only).
  'division-rename': 1,
  'match-timer': 1,
  'tournament-switcher': 1,
  // feat/grand-champion (#86): app/styles/20-grand-champion.css, Setup's grand champion rows (theme tokens only).
  'grand-champion-style': 1,
  // fix/tiebreak-mark: app/styles/21-pool-tiebreak.css, a pool card's Tiebreak section and note (theme tokens only).
  'pool-tiebreak': 1,
  // fix/nav-links: app/styles/22-nav-links.css, the Courts and TV menu items as links styled like the buttons.
  'nav-links': 1,
  'auth0-roles': 1,
};
// Old functions whose body now lives in app/engine/*.ts (parameter lists without braces).
const MOVED_TO_ENGINE = [
  'poolSizes', 'clubGroup', 'shuffleDeterministic', 'poolPlayerSlotLetter', 'assignPoolPlayerSlots',
  'poolPlayerSlot', 'buildPools', 'poolMatchPairs', 'buildPoolMatches',
  // step 2.3: standings, tiebreaks and winner helpers (app/engine/standings.ts)
  'matchRequiresWinner', 'completedResultWinnerValid', 'completedResultSnapshotValid', 'scoreWinnerOf', 'winnerOf',
  'pendingTiebreak', 'initialPoolStandings', 'tiebreakStatsForPlayers', 'tiebreakSeriesStats', 'resolveTiebreakBaseGroup',
  'unresolvedRequiredTiebreakGroup', 'tiebreakMatchesForGroup', 'makeTiebreakMatch', 'requiredSeedPlaces', 'poolStandings',
  // step 2.4: championship bracket, seeds, advancement and individual placements (app/engine/championship.ts)
  'championshipTemplateForTotal', 'championshipLabels', 'firstRoundName', 'nextRoundFromName', 'roundMatchCountForDivision',
  'championshipCourtFor', 'championshipMatchObjectForNode', 'buildChampionshipTemplateMatches', 'poolFinished', 'poolSeedResolution',
  'seedNameForLabel', 'champWinnerObj', 'championshipNodeSource', 'syncChampionshipTemplate', 'sourceLabelForRound', 'resultPlacements',
  // step 2.5: individual single elimination placement, nodes and advancement (app/engine/single-elim.ts)
  'singleElimBracketSize', 'protectedSeedQuadrant', 'singleElimSlotInfo', 'chooseBestSeedSlot', 'placeIndividualsForSingleElim',
  'buildIndividualSingleElimMatches', 'indivSide', 'syncIndividualSingleElim', 'sideLabelGeneric',
  // step 2.6: team bouts, bracket templates and advancement, pairing winners, representative
  // playoff, round-robin standings and placements, kachinuki (app/engine/teams.ts, kachinuki.ts)
  'teamSlots', 'slotLabel', 'buildTeamMatches', 'teamSideTeam', 'nodeHasMatch', 'nodePairId', 'syncTeamBracket',
  'T', 'W', 'N', 'teamBracketNodesForCount', 'addTeamPairMatches', 'kachinukiTransitionState', 'kachinukiPairWinner', 'teamWinner',
  'teamPairMatches', 'teamPositionMatches', 'teamPairSummary', 'teamPairIds', 'teamRoundRobinPairResolved', 'teamStandings',
  'teamRoundRobinProgress', 'teamRoundRobinPlacements', 'maybeCreateTeamTiebreak', 'teamNodeSideName', 'teamFinalPlacements',
  'maybeCreateKachinukiNext',
  // step 2.7: result integrity, match identity and division generation (app/engine/integrity.ts, generation.ts)
  'completedResultSnapshot', 'repairCompletedMatchResults', 'repairLoadedEliminationAdvancement', 'isValidMatchObject',
  'legacyTiebreakSyncIdentity', 'matchSyncIdentity', 'matchHasSyncIdentity', 'individualLogicalMatchKey',
  'enforceUniqueIndividualMatches', 'eligibleIndividuals', 'eligibleTeams', 'generateDivisionState',
];
// feat/react-court-finish (M.8 step 5): the legacy court renderer, deleted. React draws the
// court screen (app/react/court/); tests/golden/court/*.json pin what this code drew. Entries:
//   'name#n'       the n-th declaration (1-based) of function `name` in the old script, deleted
//   'name#n:body'  its body only: the declaration stays in app/js and its new body is entirely
//                  a marked react-court region (like MOVED_TO_ENGINE)
//   {from, to}     the old code from `from` (unique in the old script) through the next `to`
// Numbers are positions in the old single file (= app/js order): the file each was in is noted.
const REMOVED_COURT_RENDERER = [
  // The DOM-writing court screen renderers and their dead redeclarations (2.10).
  'renderScore#1', 'renderScore#2', 'renderScore#3',            // 10, 22, 22 (overridden by #4)
  'renderScore#4:body',                                          // 22: publishes the header and match (react-court)
  'setMatchBadge#1', 'setMatchBadge#2', 'renderPointLetters#1',  // 22: only the removed renderScore() used them
  'legacyUpdateUndoButton#1', 'legacyUpdateUndoButton#2', 'legacyUpdateUndoButton#3', 'legacyUpdateUndoButton#4', // 22: never called
  'updateUndoButton#1:body',                                     // 10: publishes Undo/Redo (react-court)
  'updateScoreTournamentName#1:body',                            // 22: publishes the tournament name (react-court)
  { from: '    scoreDiv.innerHTML=opts.map(', to: 'if(window.scoreDiv&&state.currentDivision)scoreDiv.value=state.currentDivision;\n' }, // renderDivisions() (02): court title + select
  'renderQueue#1', 'renderQueue#2', 'renderQueue#3', 'renderQueue#4', // 11, 22, 24, 24 (#4 was the one the 32 wrapper called)
  'renderContext#1', 'renderContext#2', 'renderContext#3', 'renderContext#4', 'renderContext#5', 'renderContext#6', 'renderContext#7', // 16, 22, 24, 29, 29, 29, 31
  // The split-court wrappers (32); renderQueue() and renderContext() are marked new declarations there.
  { from: 'const renderQueue_v3121=renderQueue;', to: '  renderQueue_v3121();\n};\n' },
  { from: 'const renderContext_v3121=renderContext;', to: '  courtContext.innerHTML=persistentContextHtml(div,null);\n};\n' },
  { from: 'const renderSingleElimContext_v3121=renderSingleElimContext;', to: '};\n' },
  'setCourtCompletePresentation#1:body',                         // 32: publishes the division-complete panel (react-court)
  // HTML helpers only the removed renderers used (no other screen or test calls them).
  'finalResultsHtml#1', 'teamQueueStatusHtml#1', 'teamPlaceholderRows#1', 'queueRowHtml#1', 'championshipQueueRows#1', // 11
  'scorekeeperQueueRow#1', 'courtQueueItems#1',                  // 22
  'queueGroupLabel#1', 'renderGroupedQueueRow#1', 'groupedQueueSection#1', 'poolChampionshipQueueGroups#1',
  'teamQueueGroups#1', 'renderSingleElimContext#1',              // 24
  'singleElimRoundCardHtml#1', 'singleElimRoundCardHtml#2',      // 24, 28
  'allPoolResultsContextHtml#1', 'allPoolResultsContextHtml#2', 'activePoolForDivision#1', // 29
  'poolResultCardHtml#1', 'poolResultCardHtml#2', 'orderedPoolContextHtml#1', // 29, 31, 31
  'splitTemplateContextHtml#1', 'canonicalSingleElimQueue#1', 'persistentContextHtml#1', // 32
];
// feat/react-live-scores (M.13): the legacy Live Scores renderer, deleted. React draws Live Scores
// (app/react/live-scores/); tests/golden/live-scores/*.json pin what this code drew. Same entry
// forms as REMOVED_COURT_RENDERER. Shared helpers (audienceMeta(), teamSheetHtml(),
// kachinukiSheetHtml(), divisionCompletePanelHtml(), the TV's) stay.
const REMOVED_LIVE_SCORES_RENDERER = [
  'renderPublic#1',                                              // 11: never ran (overridden by #2)
  'renderPublic#2:body',                                         // 25: publishes Live Scores (react-live)
  'liveScorePoints#1', 'liveScoresCourtCard#1',                  // 25: only the removed renderPublic() used them
  // 32: the division-complete wrapper; ksmRenderLiveScores() (36) makes its decision.
  { from: 'const renderPublic_v3121=renderPublic;', to: '  renderPublic_v3121();\n};\n' },
];
// feat/react-tv (M.13): the legacy TV renderer, deleted. React draws the TV display (app/react/tv/);
// tests/golden/tv/*.json pin what this code drew. Same entry forms as REMOVED_COURT_RENDERER. The
// TV's decisions stay (buildTV3ViewModel(), tv3UpcomingModel(), tv3Side() in 26;
// tvUpcomingMatches(), tvIndividualSideLabel(), tvTeamNodeEntries(), tvAssignedCourt() in 25), and
// audienceMeta() (Live Scores, TV).
const REMOVED_TV_RENDERER = [
  // 26: the tv3 renderer's DOM writing (only renderTvDisplay() used them).
  'renderTvDisplay#2:body',                                      // 26: publishes the TV (react-tv)
  'tv3Name#1', 'tv3Header#1', 'tv3Upcoming#1', 'tv3Player#1', 'tv3Individual#1', 'tv3Team#1', 'tv3KRow#1',
  'tv3Kachinuki#1', 'tv3Results#1', 'tv3ResultsFooter#1',
  'divisionCompletePanelHtml#1',                                 // 32: its last user was tv3Results()
  // 25: the first TV renderer, which never ran (overridden by #2 in 26), and the helpers only it used.
  'renderTvDisplay#1', 'fitTvCanvas#1', 'fitTvText#1', 'tvPointText#1', 'tvNameLines#1', 'tvNameHtml#1',
  'tvUpcomingHtml#1', 'tvIndividualHtml#1', 'tvKachinukiStatusRow#1', 'tvKachinukiHtml#1', 'tvTeamHtml#1',
  // 25, 31: the audience-hero helpers, which nothing called (Live Scores was drawn by
  // liveScoresCourtCard(), the TV by the tv3 renderer).
  'audienceTournamentName#1', 'audiencePenalties#1', 'audienceHeaderHtml#1', 'audienceScoreHtml#1',
  'audienceIndividualHero#1', 'audienceIndividualHero#2', 'audienceNextIndividualHtml#1', 'teamPointSlots#1',
  'nextTeamPairText#1', 'standardTeamAudienceHtml#1', 'standardTeamAudienceHtml#2', 'kachinukiPlayerRows#1',
  'kachinukiAudienceHtml#1', 'audienceNameHtml#1',
];
// feat/react-results (M.13): the legacy Results renderer, deleted. React draws the Results screen
// (app/react/results/); tests/golden/results/*.json pin what this code drew. Same entry forms as
// REMOVED_COURT_RENDERER. The Results decisions stay (resultPlacements(), the engine bridge, and
// the awards actions addResultAward(), removeResultAward(), closeResultsBracket() in 27), and the
// shared HTML helpers the Pools screen still drew with (bracketHtml(), singleElimBracketHtml(),
// teamRoundRobinStandingsHtml(), alignedMatchRowHtml(), ... in 28; removed with the Pools
// renderer, REMOVED_POOLS_RENDERER).
const REMOVED_RESULTS_RENDERER = [
  // 09: the first Results renderer, overridden by renderResultsAll#2 (27) and never run, and what only it used.
  'medalResultsHtml#1', 'teamFinalResultsHtml#1', 'renderResultsAll#1', 'renderAwards#1', 'addAward#1',
  // 11, 16: team and kachinuki sheets, overridden by #2 (28); their last callers were the court and Live Scores renderers.
  'teamSheetHtml#1', 'kachinukiSheetHtml#1',
  // 27: the Results renderer.
  'resultCardHtml#1', 'awardsEditorHtml#1',
  'renderResultsDashboard#1:body',                               // 27: publishes Results (react-results)
  'teamResultsBracketHtml#1',                                    // 27: overridden by #2 (28), never ran
  'completedResultDetailHtml#1',
  'openResultsBracket#1:body',                                   // 27: publishes the modal (react-results)
  'renderResultsAll#2',                                          // 27: "the historical entry point", which nothing called
  // 28: unused since the court and Live Scores renderers (sheets) and the Results modal (team results) moved to React.
  'teamSheetHtml#2', 'kachinukiSheetHtml#2', 'teamResultsBracketHtml#2',
];
// feat/react-overview (M.13): the legacy Overview renderer, deleted. React draws the Overview
// (app/react/overview/); tests/golden/overview/*.json pin what this code drew. Same entry forms as
// REMOVED_COURT_RENDERER. The Overview's decisions stay (tournamentSummary(), courtSummaryFor(),
// directorDivisionProgress() and its helpers, directorMatchLabel(), startDirectorRefresh() /
// stopDirectorRefresh() and the renderAll() wrapper in 30), and the empty renderProgress() (23),
// which renderAll() and nextMatch() call.
const REMOVED_OVERVIEW_RENDERER = [
  // 11: the first progress renderer, overridden by renderProgress#2 (23, an empty function) and
  // never run; it wrote #progActive and #progUpcoming, which the page never had.
  'renderProgress#1',
  // 30: the Overview renderer.
  'directorMatchRow#1',                                          // only renderDirector() used it
  'renderDirector#1:body',                                       // 30: publishes the Overview (react-overview)
];
// feat/react-library (M.13): the legacy Tournament Library renderer, deleted. React draws the
// library (app/react/library/); tests/golden/library/*.json pin what this code drew. Same entry
// forms as REMOVED_COURT_RENDERER. The library's decisions stay in 33 (renderHomeTournamentLibrary():
// the cache, the cloud list / discover and the loading, empty, error and offline lines;
// showHomePage(), createNewTournament(), openTournamentFromHome(), read/writeTournamentLibrary(),
// rememberTournament()).
const REMOVED_LIBRARY_RENDERER = [
  'libraryCardMarkup#1',                                         // 33: only paintHomeTournamentLibrary() used it
  'paintHomeTournamentLibrary#1:body',                           // 33: publishes the library (react-library)
];
// feat/react-pools (M.13): the legacy Pools renderer, deleted. React draws #poolOutput, the Pools
// view and the Edit Pool editor (app/react/pools/); tests/golden/pools/*.json pin what this code
// drew. Same entry forms as REMOVED_COURT_RENDERER. The Pools decisions and actions stay:
// renderPools()'s division choice and toggleEditPools()'s guard (now marked publishers),
// dragPoolPlayer(), dropPoolPlayer(), insertPoolPlayer(), movePoolPlayer(), saveEditedPools() (16),
// generatePools() (08), the select's options in renderDivisions() (02); the bracket's data comes
// from ksmBracket() (35), which keeps the helpers it reads (expectedRoundCount(),
// roundSequenceFromFirst(), champMatchBySlot(), previousRoundName(), sourceLabelForRound() in 14).
const REMOVED_POOLS_RENDERER = [
  'singleElimBracketHtml#1',                                     // 06: overridden by #2 (28), never ran
  'renderPools#1:body',                                          // 08: publishes the view (react-pools)
  'placeholderMatchHtml#1', 'futureRoundsHtml#1',                // 14: only bracketHtml() #1 and #2 used them
  'bracketHtml#1',                                               // 14: overridden by #2 (28), never ran
  'toggleEditPools#1:body',                                      // 16: publishes the editor (react-pools)
  // 28: the Pools view's bracket (bracketHtml() was its last user since the Results modal moved
  // to React) and the HTML helpers only it used.
  'alignedPointSlots#1', 'alignedMatchRowHtml#1', 'alignedPlaceholderRowHtml#1', 'singleElimBracketHtml#2', 'bracketHtml#2',
  'teamRoundRobinStandingsHtml#1',
  'alignedPointSlots#2',                                         // 29: the live declaration, used only by alignedMatchRowHtml()
];
// feat/react-setup-screen (M.13): the legacy Setup renderer, deleted. React draws the divisions
// table's rows and the hero's name (app/react/setup/); tests/golden/setup/*.json pin what this
// code drew. Same entry forms as REMOVED_COURT_RENDERER. Setup's decisions and actions stay
// (saveSetup(), addDivision(), addCustomDivision(), removeDivision(), toggleDivision(),
// setDivisionFormat(), setDivisionCourt() in 01; the saveSetup() wrapper and the name's input
// listener in 30), and every Setup field is the static markup of app/index.html.
const REMOVED_SETUP_RENDERER = [
  'renderDivisionSetup#1:body',                                  // 01: publishes the rows (react-setup)
  'divisionSetupRow#1',                                          // 01: only renderDivisionSetup() used it
  'syncSetupHeader#1:body',                                      // 30: publishes the hero's name (react-setup)
];
// feat/react-registration (M.13): the legacy players table and status card renderer, deleted. React
// draws #regTable and the contents of #tournamentStatusCard (app/react/registration/);
// tests/golden/registration/*.json pin what this code drew. Same entry forms as
// REMOVED_COURT_RENDERER. The decisions and actions stay (03: renderReg() and
// renderTournamentStatus() as publishers, validateTournament(), updateComp(), addRow(),
// cycleCompetitorStatus(), loadSamples(), clearCompetitors(); the paste listener in 16; regTab() in
// 23), and the tab bar, toolbars and filter are the static markup of app/index.html.
const REMOVED_REGISTRATION_RENDERER = [
  'regTab#1',                                                    // 03: overridden by #2 (23), never ran
  { from: 'el.innerHTML=`<div class="tournament-status-head">', to: '</div>`;' }, // 03: renderTournamentStatus()'s card markup (react-registration publishes)
  'renderReg#1:body',                                            // 03: publishes the table (react-registration)
  // feat/react-registration-2 (M.13, part 2): React draws the team cards, the exhibition table and
  // the tab bar's classes (app/react/registration/RegistrationTeams.tsx); tests/golden/registration-teams
  // pins what this code drew. The actions stay (addTeamRow(), addAutoTeam(), cycleTeamStatus(),
  // addExhibitionRow(), loadTeamSamples(), clearTeams(), clearExhibitions() in 03; regTab()'s
  // state.regMode, the cards' visibility and the Pools redraw in 23).
  'renderTeams#1:body',                                          // 03: publishes the cards (react-registration)
  'renderExhibitions#1:body',                                    // 03: publishes the table (react-registration)
  { from: "  if(window.indTab)indTab.classList.toggle('active',mode==='individual');\n", to: "if(window.poolsTab)poolsTab.classList.toggle('active',mode==='pools');\n" }, // 23: regTab()'s tab classes (react-registration publishes the tab)
];
// feat/react-shell (M.13, the last step): the legacy shell renderer, deleted. React draws the
// navigation bar, the header's status row and the pop-up dialogs (app/react/shell/);
// tests/golden/shell/*.json pin what this code drew. Same entry forms as REMOVED_COURT_RENDERER.
// The decisions and actions stay: toggleNavMenu(), navigateTo(), chooseCourt(), the document
// listeners and the resize listener (23), setSessionRole()'s role and body classes (33),
// installRoleBanner() (33: the banner stays legacy), the save and sync code that sets the status,
// openFusenDialog()'s guard and confirmFusen() (22), validateTournament(),
// requestTournamentGeneration(), divisionRegenerationStatus() (03), regenerateSingleDivision()
// (08), cloudDiagnostics()'s details, openTournamentAccess()'s save first (33), copyTextValue(),
// the downloads and retryQueuedCloudSave() (21), the Load Tournament File checks (21,
// load-file-guard), the stream overlay links' functions (33-stream-overlay-links.js).
const REMOVED_SHELL_RENDERER = [
  'closeManagementModal#1:body',                                 // 03: publishes (react-shell); other ids keep the class write in the region
  'showValidationDialog#1:body',                                 // 03: publishes the generation check
  'openRegenerateDivisionDialog#1:body',                         // 03: publishes the division list
  'continueRegenerateDivision#1:body',                           // 03: publishes the confirmation
  { from: "regenerateModalTitle.textContent='Division Regenerated';", to: "OK</button>';" }, // 08: regenerateSingleDivision()'s result (publishes)
  'snapshotAnalysisHtml#1', 'historyEntryCard#1', 'actionHistoryAnalysisHtml#1', // 19: only cloudDiagnostics() used them
  'setConnectionStatus#1:body', 'renderPersistentSaveStatus#1:body', 'updateSaveStatus#1:body', // 20: publish the status line
  { from: "const el=document.getElementById('cloudPresence');", to: "online`:''" }, // 21: renderCloudPresence()'s text (publishes)
  'closeCloudModal#1:body',                                      // 21: publishes
  'openCloudModal#1',                                            // 21: the modal's markup; its callers publish their content
  'showQr#1', 'openTournamentAccess#1',                          // 21: overridden by openTournamentAccess#2 (33) and never run; showQr() was only its
  // 21: cloudDiagnostics()'s markup (it publishes the details and analyses).
  { from: 'const actions=`<div class="row" style="justify-content:flex-end;margin-top:18px;gap:10px;flex-wrap:wrap"><button class="secondary" onclick="downloadSnapshotAnalysis()">', to: '${actionHistoryAnalysisHtml(historyAnalysis)}${actions}`)' },
  { from: "  const dlg=document.getElementById('fusenDialog');\n  if(dlg)dlg.classList.remove('hidden');", to: "dlg.classList.remove('hidden');" }, // 22: openFusenDialog() (publishes)
  'closeFusenDialog#1:body',                                     // 22: publishes
  'setNavMenuState#1:body', 'positionMobileNavMenu#1:body', 'closeNavMenus#1:body', // 23: publish the open menu and its placement
  { from: "openMenu.style.removeProperty('top');", to: "openMenu.style.removeProperty('max-height');" }, // 23: the resize listener (publishes)
  'setActiveNavForView#1:body',                                  // 24: publishes the screen's label
  { from: "const el=document.getElementById('sessionRole');if(el){el.textContent=ksmSessionRole==='staff'?'Staff':'Spectator';", to: "el.dataset.role=ksmSessionRole}" }, // 33: setSessionRole()'s role text
  { from: "const btn=document.getElementById('staffAuthButton');", to: "?'Logout':'Staff Login'" }, // 33: setSessionRole()'s button text (publishes both)
  { from: "openCloudModal('Tournament Access',`<div class=\"access-link-box\"", to: "</div>`)" }, // 33: openTournamentAccess()'s markup (publishes)
];
// fix/pre-event (M.12): data-testid attributes added to existing markup, as [old start tag, test ID];
// the check takes each ` data-testid="<id>"` out again (it must appear exactly once, at the end
// of that tag) and then compares byte for byte, so any other markup change still fails.
// fix/pre-event (F8): deliberate edits of existing markup, as [markup before, markup now]. Each
// 'now' must appear exactly once; the check puts 'before' back (before the test-ID step) and then
// compares byte for byte, so any other markup change still fails.
const MARKUP_EDITS = [
  // A new tournament starts with an empty Host and Location (examples as placeholders), not the original club's.
  ['<input id="tHost" value="Aiea Taiheiji Kendo Club" data-testid="setup-host">', '<input id="tHost" value="" placeholder="e.g. Aiea Taiheiji Kendo Club" data-testid="setup-host">'],
  ['<input id="tLocation" value="Halawa District Park" data-testid="setup-location">', '<input id="tLocation" value="" placeholder="e.g. Halawa District Park" data-testid="setup-location">'],

  // Owner request: the Exhibition Matches card spans the width like the other Setup cards.
  ["      <section class=\"setup-panel\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Additional Matches</div>", "      <section class=\"setup-panel setup-panel-wide\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Additional Matches</div>"],
  // feat/grand-champion (#86): Setup's Grand Champion section, before Exhibition Matches (React draws its contents).
  ["", "      <section class=\"setup-panel setup-panel-wide\" data-testid=\"setup-grand-champion\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Competition Structure</div>\n            <h2>Grand Champion</h2>\n          </div>\n        </div>\n        <div id=\"grandChampionSetup\" class=\"setup-stack\"></div>\n      </section>\n\n"],
  // Team division editor and registration filter, with unique surrounding markup.
  ["      </section>\n\n      <section class=\"setup-panel\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Team Competition</div>\n            <h2>Team Tournament</h2>\n          </div>\n        </div>\n        <div class=\"setup-stack\">\n          <div class=\"field\">\n            <label>Enable Team Tournament</label>\n            <select id=\"teamEnabled\" onchange=\"saveSetup()\" data-testid=\"team-enabled\">\n              <option>Enabled</option>\n", "      </section>\n\n      <section class=\"setup-panel setup-panel-wide\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Team Competition</div>\n            <h2>Team divisions</h2>\n          </div>\n        </div>\n        <div class=\"setup-stack\">\n          <div class=\"field\">\n            <label>Teams enabled</label>\n            <select id=\"teamEnabled\" onchange=\"saveSetup()\" data-testid=\"team-enabled\">\n              <option>Enabled</option>\n"],
  ["            </select>\n          </div>\n          <div class=\"field\">\n            <label>Team Match Format</label>\n", "            </select>\n          </div>\n          <div id=\"teamDivisionSetup\" class=\"setup-stack\"></div>\n          <button class=\"primary\" onclick=\"ksmAddTeamDivision()\" data-testid=\"team-division-add\">＋ Add team division</button>\n          <div hidden>\n          <div class=\"field\">\n            <label>Team Match Format</label>\n"],
  ["              <option value=\"dual3\">Champion + Runner-up + 3rd place(s)</option>\n            </select>\n          </div>\n        </div>\n", "              <option value=\"dual3\">Champion + Runner-up + 3rd place(s)</option>\n            </select>\n          </div>\n          </div>\n        </div>\n"],
  // Import CSV: was a placeholder alert; reads a .csv with a header row (43-react-registration.js).
  ['<button onclick="alert(\'CSV import will be added in the production build.\')" data-testid="reg-import-csv">', '<input id="ksmImportCsvFile" type="file" accept=".csv,text/csv" hidden onchange="ksmImportCSVFile(event)" data-testid="reg-import-file"><button onclick="ksmImportCSV()" data-testid="reg-import-csv">'],
  ["  </div>\n</section>\n<section id=\"registration\" class=\"view hidden\"><div class=\"card wide\"><div class=\"toolbar\"><div class=\"row\"><button id=\"indTab\" class=\"tab active\" onclick=\"regTab('individual')\" data-testid=\"reg-tab-individual\">Individual Players</button><button id=\"teamTab\" class=\"tab\" onclick=\"regTab('team')\" data-testid=\"reg-tab-team\">Team Registration</button><button id=\"exhibitionTab\" class=\"tab\" onclick=\"regTab('exhibition')\" data-testid=\"reg-tab-exhibition\">Exhibition</button><button id=\"poolsTab\" class=\"tab\" onclick=\"regTab('pools')\" data-testid=\"reg-tab-pools\">Pools</button><button id=\"generateBtn\" class=\"primary\" onclick=\"requestTournamentGeneration()\" data-testid=\"generate-button\">Generate Tournament</button><button id=\"regenerateDivisionBtn\" onclick=\"openRegenerateDivisionDialog()\" data-testid=\"regenerate-division-button\">Regenerate Single Division</button></div><div class=\"row\"><button onclick=\"alert('CSV import will be added in the production build.')\" data-testid=\"reg-import-csv\">Import CSV</button><button onclick=\"exportCSV()\" data-testid=\"reg-export-csv\">Export CSV</button><button onclick=\"ksmPasteHelp()\" data-testid=\"reg-paste-excel\">Paste from Excel</button><button onclick=\"loadFullTournament()\" data-testid=\"reg-load-sample-tournament\">Load Sample Tournament</button><button class=\"danger\" onclick=\"clearCompetitors()\" data-testid=\"reg-clear\">Clear Registration</button></div></div><div id=\"tournamentStatusCard\" class=\"tournament-status-card\" data-testid=\"tournament-status\"></div></div><div id=\"indReg\" class=\"card wide\"><div class=\"toolbar\"><div class=\"row\"><button class=\"primary\" onclick=\"addRow()\" data-testid=\"reg-add-row\">+ Add Row</button><button onclick=\"addRow(5)\">+ 5 Rows</button><button onclick=\"loadSamples()\" data-testid=\"reg-load-samples\">Load Sample Players</button></div><div class=\"row\"><input id=\"regFilter\" placeholder=\"Filter players...\" oninput=\"renderReg()\" data-testid=\"reg-filter\"></div></div><div style=\"overflow:auto\"><table id=\"regTable\"></table></div></div><div id=\"teamReg\" class=\"card wide hidden\"><div class=\"toolbar\"><div class=\"row\"><button class=\"primary\" onclick=\"addTeamRow()\" data-testid=\"team-add\">+ Add Team</button><button onclick=\"addTeamRow(3)\">+ 3 Teams</button><button onclick=\"loadTeamSamples()\" data-testid=\"team-load-samples\">Load Sample Teams</button><button onclick=\"addAutoTeam()\">+ Auto Test Team</button><button class=\"danger\" onclick=\"clearTeams()\" data-testid=\"team-clear\">Clear Teams</button></div><div class=\"row\"><input id=\"teamFilter\" placeholder=\"Filter teams...\" oninput=\"renderTeams()\"></div></div><p class=\"sub\">Use vertical team cards. Team name is the only team identifier required.</p><div style=\"overflow:auto\"><table id=\"teamTable\"></table></div></div><div id=\"exhibitionReg\" class=\"card wide hidden\"><div class=\"toolbar\"><div class=\"row\"><button class=\"primary\" onclick=\"addExhibitionRow()\" data-testid=\"exhibition-add\">+ Add Exhibition Match</button><button onclick=\"addExhibitionRow(3)\" data-testid=\"exhibition-add-3\">+ 3 Matches</button><button class=\"danger\" onclick=\"clearExhibitions()\" data-testid=\"exhibition-clear\">Clear Exhibitions</button></div></div><div style=\"overflow:auto\"><table id=\"exhibitionTable\"></table></div></div><div id=\"poolsReg\" class=\"card wide hidden\"><h1>Generated Pools</h1><p class=\"sub\">Pools are generated from registered or checked-in individual competitors. No-show competitors are excluded.</p><div class=\"row\"><select id=\"poolDiv\" onchange=\"state.poolViewDivision=this.value;renderPools()\" data-testid=\"pool-division-select\"></select><button onclick=\"ksmRegeneratePoolDivision()\" data-testid=\"pools-regenerate\">Regenerate</button></div><div id=\"poolOutput\" class=\"pool-wrap\" style=\"margin-top:16px\"></div></div></section><section id=\"score\" class=\"view hidden\">\n  <div class=\"scorekeeper-shell\">\n    <div class=\"card scorekeeper-main scoreboard-card\">\n", "  </div>\n</section>\n<section id=\"registration\" class=\"view hidden\"><div class=\"card wide\"><div class=\"toolbar\"><div class=\"row\"><button id=\"indTab\" class=\"tab active\" onclick=\"regTab('individual')\" data-testid=\"reg-tab-individual\">Individual Players</button><button id=\"teamTab\" class=\"tab\" onclick=\"regTab('team')\" data-testid=\"reg-tab-team\">Team Registration</button><button id=\"exhibitionTab\" class=\"tab\" onclick=\"regTab('exhibition')\" data-testid=\"reg-tab-exhibition\">Exhibition</button><button id=\"poolsTab\" class=\"tab\" onclick=\"regTab('pools')\" data-testid=\"reg-tab-pools\">Pools</button><button id=\"generateBtn\" class=\"primary\" onclick=\"requestTournamentGeneration()\" data-testid=\"generate-button\">Generate Tournament</button><button id=\"regenerateDivisionBtn\" onclick=\"openRegenerateDivisionDialog()\" data-testid=\"regenerate-division-button\">Regenerate Single Division</button></div><div class=\"row\"><button onclick=\"alert('CSV import will be added in the production build.')\" data-testid=\"reg-import-csv\">Import CSV</button><button onclick=\"exportCSV()\" data-testid=\"reg-export-csv\">Export CSV</button><button onclick=\"ksmPasteHelp()\" data-testid=\"reg-paste-excel\">Paste from Excel</button><button onclick=\"loadFullTournament()\" data-testid=\"reg-load-sample-tournament\">Load Sample Tournament</button><button class=\"danger\" onclick=\"clearCompetitors()\" data-testid=\"reg-clear\">Clear Registration</button></div></div><div id=\"tournamentStatusCard\" class=\"tournament-status-card\" data-testid=\"tournament-status\"></div></div><div id=\"indReg\" class=\"card wide\"><div class=\"toolbar\"><div class=\"row\"><button class=\"primary\" onclick=\"addRow()\" data-testid=\"reg-add-row\">+ Add Row</button><button onclick=\"addRow(5)\">+ 5 Rows</button><button onclick=\"loadSamples()\" data-testid=\"reg-load-samples\">Load Sample Players</button></div><div class=\"row\"><input id=\"regFilter\" placeholder=\"Filter players...\" oninput=\"renderReg()\" data-testid=\"reg-filter\"></div></div><div style=\"overflow:auto\"><table id=\"regTable\"></table></div></div><div id=\"teamReg\" class=\"card wide hidden\"><div class=\"toolbar\"><div class=\"row\"><button class=\"primary\" onclick=\"addTeamRow()\" data-testid=\"team-add\">+ Add Team</button><button onclick=\"addTeamRow(3)\">+ 3 Teams</button><button onclick=\"loadTeamSamples()\" data-testid=\"team-load-samples\">Load Sample Teams</button><button onclick=\"addAutoTeam()\">+ Auto Test Team</button><button class=\"danger\" onclick=\"clearTeams()\" data-testid=\"team-clear\">Clear Teams</button></div><div class=\"row\"><input id=\"teamFilter\" placeholder=\"Filter teams...\" oninput=\"renderTeams()\">\n<select id=\"teamDivisionFilter\" aria-label=\"Filter by team division\" data-testid=\"team-division-filter\" onchange=\"renderTeams()\"><option value=\"\">All team divisions</option></select>\n</div></div><p class=\"sub\">Use vertical team cards. Team name is the only team identifier required.</p><div style=\"overflow:auto\"><table id=\"teamTable\"></table></div></div><div id=\"exhibitionReg\" class=\"card wide hidden\"><div class=\"toolbar\"><div class=\"row\"><button class=\"primary\" onclick=\"addExhibitionRow()\" data-testid=\"exhibition-add\">+ Add Exhibition Match</button><button onclick=\"addExhibitionRow(3)\" data-testid=\"exhibition-add-3\">+ 3 Matches</button><button class=\"danger\" onclick=\"clearExhibitions()\" data-testid=\"exhibition-clear\">Clear Exhibitions</button></div></div><div style=\"overflow:auto\"><table id=\"exhibitionTable\"></table></div></div><div id=\"poolsReg\" class=\"card wide hidden\"><h1>Generated Pools</h1><p class=\"sub\">Pools are generated from registered or checked-in individual competitors. No-show competitors are excluded.</p><div class=\"row\"><select id=\"poolDiv\" onchange=\"state.poolViewDivision=this.value;renderPools()\" data-testid=\"pool-division-select\"></select><button onclick=\"ksmRegeneratePoolDivision()\" data-testid=\"pools-regenerate\">Regenerate</button></div><div id=\"poolOutput\" class=\"pool-wrap\" style=\"margin-top:16px\"></div></div></section><section id=\"score\" class=\"view hidden\">\n  <div class=\"scorekeeper-shell\">\n    <div class=\"card scorekeeper-main scoreboard-card\">\n"],

  // Public printable guide, inside Sharing & access.
  ["", "<div class=\"setup-print-group\"><h4>Print</h4><a href=\"/print/scorekeeper-guide\" target=\"_blank\" rel=\"noopener\" data-testid=\"setup-print-guide\">Scorekeeper guide (print)</a></div>"],
  ["    <nav class=\"setup-actions-jump director-only\" aria-label=\"Setup sections\"><a href=\"#setup-tournament-actions\" onclick=\"event.preventDefault();document.getElementById('setup-tournament-actions').scrollIntoView({block:'start'})\">Tournament details, sharing, backup &amp; export</a></nav>\n\n    <div class=\"setup-layout\">\n      <section class=\"setup-panel setup-panel-wide\" id=\"setup-tournament-actions\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Tournament</div>\n            <h2>Tournament Details</h2>\n          </div>\n        </div>\n        <div class=\"setup-form-grid\">\n          <div class=\"field\">\n            <label>Tournament Name</label>\n            <input id=\"tName\" value=\"Aiea Taiheiji Kendo Tournament\" data-testid=\"setup-tournament-name\">\n            <div class=\"setup-short-url director-only\">\n              <div class=\"setup-short-url-row\"><span>Short URL: <output id=\"setupShortUrl\" data-testid=\"setup-short-url\"></output></span><button type=\"button\" class=\"secondary\" onclick=\"ksmEditTournamentSlug(false)\" data-testid=\"edit-tournament-slug\">Edit short name</button></div>\n              <p class=\"small\">Old links keep working after a rename.</p>\n            </div>\n          </div>\n          <div class=\"field\">\n            <label>Host Organization</label>\n            <input id=\"tHost\" value=\"Aiea Taiheiji Kendo Club\" data-testid=\"setup-host\">\n          </div>\n          <div class=\"field\">\n            <label>Date</label>\n            <input id=\"tDate\" type=\"date\">\n          </div>\n          <div class=\"field\">\n            <label>Location</label>\n            <input id=\"tLocation\" value=\"Halawa District Park\" data-testid=\"setup-location\">\n          </div>\n          <div class=\"field\">\n            <label>Courts</label>\n            <input id=\"tCourts\" type=\"number\" min=\"1\" value=\"2\">\n          </div>\n          <div class=\"field\">\n            <label>Tournament Type</label>\n            <select id=\"tType\">\n              <option>Individual + Team</option>\n              <option>Individual</option>\n              <option>Team</option>\n            </select>\n          </div>\n        </div>\n\n        <div class=\"setup-tournament-actions\">\n          <div><h3>Sharing &amp; access</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"openTournamentAccess()\" data-testid=\"setup-tournament-access\">Tournament Access · Links &amp; QR codes</button>\n            <button type=\"button\" onclick=\"copyTournamentId()\" data-testid=\"setup-copy-id\">Copy Tournament ID</button>\n          </div></div>\n          <div><h3>Backup</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"manualSaveTournament()\" data-testid=\"setup-download-file\">Download Tournament File</button>\n            <button type=\"button\" onclick=\"downloadRecoveryFile()\" data-testid=\"setup-download-recovery\">Download Recovery File</button>\n            <button type=\"button\" onclick=\"triggerLoadRecoveryFile()\" data-testid=\"setup-load-recovery\">Load Recovery File</button>\n          </div></div>\n          <div><h3>Export</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"exportTournamentBrackets()\" data-testid=\"setup-export-brackets\">Tournament Brackets</button>\n            <button type=\"button\" onclick=\"exportResultsAwards()\" data-testid=\"setup-export-results\">Results &amp; Awards</button>\n          </div></div>\n          <details><summary>Advanced</summary><button type=\"button\" onclick=\"cloudDiagnostics()\" data-testid=\"setup-cloud-diagnostics\">Cloud Diagnostics</button></details>\n        </div>\n\n      </section>\n\n      <section class=\"setup-panel setup-panel-wide\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Competition Structure</div>\n            <h2>Individual Divisions</h2>\n            <p>Enable the divisions you will use, then assign format and court.</p>\n          </div>\n        </div>\n\n        <div class=\"setup-division-table-wrap\">\n          <table class=\"setup-division-table\">\n            <thead>\n              <tr>\n                <th>Use</th>\n                <th>Division</th>\n                <th>Format</th>\n                <th>Court Assignment</th>\n              </tr>\n            </thead>\n            <tbody id=\"divisionSetupRows\" data-testid=\"setup-division-rows\"></tbody>\n          </table>\n        </div>\n\n        <div class=\"custom-division-box\">\n          <div class=\"custom-division-title\">Add Custom Division</div>\n          <div class=\"custom-division-row\">\n            <input id=\"customDivName\" placeholder=\"Division name\" data-testid=\"custom-division-name\">\n            <select id=\"customDivFormat\" data-testid=\"custom-division-format\">\n              <option>Round Robin</option>\n              <option>Single Elimination</option>\n            </select>\n            <select id=\"customDivCourt\" data-testid=\"custom-division-court\">\n              <option value=\"A\">Court A</option>\n              <option value=\"B\">Court B</option>\n              <option value=\"split\">Split Between Courts</option>\n            </select>\n            <button onclick=\"addCustomDivision()\" data-testid=\"custom-division-add\">+ Add Division</button>\n          </div>\n        </div>\n      </section>\n\n      <section class=\"setup-panel\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Team Competition</div>\n            <h2>Team Tournament</h2>\n          </div>\n        </div>\n        <div class=\"setup-stack\">\n          <div class=\"field\">\n            <label>Enable Team Tournament</label>\n            <select id=\"teamEnabled\" onchange=\"saveSetup()\" data-testid=\"team-enabled\">\n              <option>Enabled</option>\n              <option>Disabled</option>\n            </select>\n          </div>\n          <div class=\"field\">\n            <label>Team Match Format</label>\n            <select id=\"teamFormat\" onchange=\"saveSetup();renderTeams()\" data-testid=\"team-format\">\n              <option selected>3-Person Team</option>\n              <option>5-Person Team</option>\n              <option>Kachinuki</option>\n            </select>\n          </div>\n          <div class=\"field\">\n            <label>Tournament Format</label>\n            <select id=\"teamTournamentFormat\" onchange=\"saveSetup()\" data-testid=\"team-tournament-format\">\n              <option selected>Single Elimination</option>\n              <option>Round Robin</option>\n            </select>\n          </div>\n          <div class=\"field\">\n            <label>Court Assignment</label>\n            <select id=\"teamCourt\" onchange=\"state.divisionCourts['Team Tournament']=this.value;saveSetup()\" data-testid=\"team-court\">\n              <option>A</option>\n              <option>B</option>\n              <option selected>Both</option>\n            </select>\n          </div>\n          <div class=\"field\">\n            <label>Team Awards to Display</label>\n            <select id=\"teamAwardMode\" onchange=\"state.teamAwardMode=this.value;saveSetup()\" data-testid=\"team-award-mode\">\n              <option value=\"top1\">Champion only</option>\n              <option value=\"top2\" selected>Champion + Runner-up</option>\n              <option value=\"dual3\">Champion + Runner-up + 3rd place(s)</option>\n            </select>\n          </div>\n        </div>\n      </section>\n\n      <section class=\"setup-panel\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Additional Matches</div>\n            <h2>Exhibition Matches</h2>\n          </div>\n        </div>\n        <div class=\"setup-stack\">\n          <div class=\"field\">\n            <label>Enable Exhibition Matches</label>\n            <select id=\"exhibitionEnabled\" onchange=\"saveSetup();renderReg()\" data-testid=\"exhibition-enabled\">\n              <option>Disabled</option>\n              <option>Enabled</option>\n            </select>\n          </div>\n          <p class=\"setup-helper\">Enabling this adds an Exhibition tab in Registration. Exhibition matches do not affect standings.</p>\n        </div>\n      </section>\n\n      <section class=\"setup-panel setup-panel-wide\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Operations</div>\n            <h2>Referees</h2>\n          </div>\n        </div>\n        <div class=\"setup-form-grid\">\n          <div class=\"field\">\n            <label>Court A Referees</label>\n            <textarea id=\"court1Refs\" rows=\"4\" placeholder=\"Names only\"></textarea>\n          </div>\n          <div class=\"field\">\n            <label>Court B Referees</label>\n            <textarea id=\"court2Refs\" rows=\"4\" placeholder=\"Names only\"></textarea>\n          </div>\n          <div class=\"field\">\n            <label>Court A — Red side (as seen from the scoring table)</label>\n            <select id=\"court1RedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-red-side-a\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n          <div class=\"field\">\n            <label for=\"court1TvRedSide\">Court A — TV: Red side (as seen by the audience)</label>\n            <select id=\"court1TvRedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-tv-red-side-a\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n          <div class=\"field\">\n            <label>Court B — Red side (as seen from the scoring table)</label>\n            <select id=\"court2RedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-red-side-b\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n          <div class=\"field\">\n            <label for=\"court2TvRedSide\">Court B — TV: Red side (as seen by the audience)</label>\n            <select id=\"court2TvRedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-tv-red-side-b\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n        </div>\n      </section>\n\n      <section class=\"setup-panel setup-panel-wide\" data-testid=\"setup-match-timer\">\n        <div class=\"setup-panel-head\"><h2>Match timer</h2></div>\n        <p class=\"setup-helper\">Use m:ss. Blank stage lengths use Regular; blank Encho has no limit.</p>\n        <div class=\"setup-form-grid\">\n          <div class=\"field\"><label for=\"timeRegular\">Regular</label><input id=\"timeRegular\" value=\"3:00\" placeholder=\"3:00\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeRegular\"></div>\n          <div class=\"field\"><label for=\"timeQuarterfinal\">Quarterfinal</label><input id=\"timeQuarterfinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeQuarterfinal\"></div>\n          <div class=\"field\"><label for=\"timeSemifinal\">Semifinal</label><input id=\"timeSemifinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeSemifinal\"></div>\n          <div class=\"field\"><label for=\"timeFinal\">Final</label><input id=\"timeFinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeFinal\"></div>\n          <div class=\"field\"><label for=\"timeEncho\">Encho</label><input id=\"timeEncho\" value=\"3:00\" placeholder=\"No limit\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeEncho\"></div>\n          <div class=\"field\"><label for=\"court1TimerSound\">Court A time-up sound</label><select id=\"court1TimerSound\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court1TimerSound\"><option value=\"whistle01\" selected>Whistle 1</option><option value=\"whistle02\">Whistle 2</option></select></div>\n          <div class=\"field\"><label for=\"court1TimerEnabled\">Court A match timer</label><select id=\"court1TimerEnabled\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court1TimerEnabled\"><option value=\"On\" selected>On</option><option value=\"Off\">Off</option></select></div>\n          <div class=\"field\"><label for=\"court2TimerSound\">Court B time-up sound</label><select id=\"court2TimerSound\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court2TimerSound\"><option value=\"whistle01\">Whistle 1</option><option value=\"whistle02\" selected>Whistle 2</option></select></div>\n          <div class=\"field\"><label for=\"court2TimerEnabled\">Court B match timer</label><select id=\"court2TimerEnabled\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court2TimerEnabled\"><option value=\"On\" selected>On</option><option value=\"Off\">Off</option></select></div>\n        </div>\n      </section>\n\n      <div class=\"setup-action-row\">\n        <button class=\"setup-primary-action\" onclick=\"saveSetup();show('registration')\" data-testid=\"setup-save-continue\">Save Setup &amp; Continue</button>\n      </div>\n    </div>\n  </div>", "    <div class=\"setup-layout\">\n      <section class=\"setup-panel setup-panel-wide\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Tournament</div>\n            <h2>Tournament Details</h2>\n          </div>\n        </div>\n        <div class=\"setup-form-grid\">\n          <div class=\"field\">\n            <label>Tournament Name</label>\n            <input id=\"tName\" value=\"Aiea Taiheiji Kendo Tournament\" data-testid=\"setup-tournament-name\">\n\n          </div>\n          <div class=\"field setup-short-url\">\n            <label for=\"setupShortUrl\">Short URL</label>\n            <div class=\"setup-short-url-input\"><span aria-hidden=\"true\">/</span><input id=\"setupShortUrl\" data-testid=\"setup-short-url\" aria-describedby=\"setupShortUrlStatus\" onblur=\"ksmSaveShortUrl(this)\" onkeydown=\"if(event.key==='Enter'){event.preventDefault();this.blur()}\" oninput=\"this.removeAttribute('aria-invalid')\"></div>\n            <p class=\"small\" id=\"setupShortUrlStatus\" role=\"status\">Old links keep working after a rename.</p>\n          </div>\n          <div class=\"field\">\n            <label>Host Organization</label>\n            <input id=\"tHost\" value=\"Aiea Taiheiji Kendo Club\" data-testid=\"setup-host\">\n          </div>\n          <div class=\"field\">\n            <label>Date</label>\n            <input id=\"tDate\" type=\"date\">\n          </div>\n          <div class=\"field\">\n            <label>Location</label>\n            <input id=\"tLocation\" value=\"Halawa District Park\" data-testid=\"setup-location\">\n          </div>\n          <div class=\"field\">\n            <label>Courts</label>\n            <input id=\"tCourts\" type=\"number\" min=\"1\" value=\"2\">\n          </div>\n\n        </div>\n\n\n\n      </section>\n\n      <section class=\"setup-panel setup-panel-wide\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Competition Structure</div>\n            <h2>Individual Divisions</h2>\n            <p>Enable the divisions you will use, then assign format and court.</p>\n          </div>\n        </div>\n\n        <div class=\"setup-division-table-wrap\">\n          <table class=\"setup-division-table\">\n            <thead>\n              <tr>\n                <th>Use</th>\n                <th>Division</th>\n                <th>Format</th>\n                <th>Court Assignment</th>\n              </tr>\n            </thead>\n            <tbody id=\"divisionSetupRows\" data-testid=\"setup-division-rows\"></tbody>\n          </table>\n        </div>\n\n        <div class=\"custom-division-box\">\n          <div class=\"custom-division-title\">Add Custom Division</div>\n          <div class=\"custom-division-row\">\n            <input id=\"customDivName\" oninput=\"document.querySelector('[data-testid=custom-division-add]').disabled=!this.value.trim()\" placeholder=\"Division name\" data-testid=\"custom-division-name\">\n            <select id=\"customDivFormat\" data-testid=\"custom-division-format\">\n              <option>Round Robin</option>\n              <option>Single Elimination</option>\n            </select>\n            <select id=\"customDivCourt\" data-testid=\"custom-division-court\">\n              <option value=\"A\">Court A</option>\n              <option value=\"B\">Court B</option>\n              <option value=\"split\">Split Between Courts</option>\n            </select>\n            <button class=\"primary\" disabled onclick=\"addCustomDivision()\" data-testid=\"custom-division-add\">Add division</button>\n          </div>\n        </div>\n      </section>\n\n      <section class=\"setup-panel\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Team Competition</div>\n            <h2>Team Tournament</h2>\n          </div>\n        </div>\n        <div class=\"setup-stack\">\n          <div class=\"field\">\n            <label>Enable Team Tournament</label>\n            <select id=\"teamEnabled\" onchange=\"saveSetup()\" data-testid=\"team-enabled\">\n              <option>Enabled</option>\n              <option>Disabled</option>\n            </select>\n          </div>\n          <div class=\"field\">\n            <label>Team Match Format</label>\n            <select id=\"teamFormat\" onchange=\"saveSetup();renderTeams()\" data-testid=\"team-format\">\n              <option selected>3-Person Team</option>\n              <option>5-Person Team</option>\n              <option>Kachinuki</option>\n            </select>\n          </div>\n          <div class=\"field\">\n            <label>Tournament Format</label>\n            <select id=\"teamTournamentFormat\" onchange=\"saveSetup()\" data-testid=\"team-tournament-format\">\n              <option selected>Single Elimination</option>\n              <option>Round Robin</option>\n            </select>\n          </div>\n          <div class=\"field\">\n            <label>Court Assignment</label>\n            <select id=\"teamCourt\" onchange=\"state.divisionCourts['Team Tournament']=this.value;saveSetup()\" data-testid=\"team-court\">\n              <option>A</option>\n              <option>B</option>\n              <option selected>Both</option>\n            </select>\n          </div>\n          <div class=\"field\">\n            <label>Team Awards to Display</label>\n            <select id=\"teamAwardMode\" onchange=\"state.teamAwardMode=this.value;saveSetup()\" data-testid=\"team-award-mode\">\n              <option value=\"top1\">Champion only</option>\n              <option value=\"top2\" selected>Champion + Runner-up</option>\n              <option value=\"dual3\">Champion + Runner-up + 3rd place(s)</option>\n            </select>\n          </div>\n        </div>\n      </section>\n\n      <section class=\"setup-panel\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Additional Matches</div>\n            <h2>Exhibition Matches</h2>\n          </div>\n        </div>\n        <div class=\"setup-stack\">\n          <div class=\"field\">\n            <label>Enable Exhibition Matches</label>\n            <select id=\"exhibitionEnabled\" onchange=\"saveSetup();renderReg()\" data-testid=\"exhibition-enabled\">\n              <option>Disabled</option>\n              <option>Enabled</option>\n            </select>\n          </div>\n          <p class=\"setup-helper\">Enabling this adds an Exhibition tab in Registration. Exhibition matches do not affect standings.</p>\n        </div>\n      </section>\n\n      <section class=\"setup-panel setup-panel-wide\">\n        <div class=\"setup-panel-head\">\n          <div>\n            <div class=\"setup-panel-eyebrow\">Operations</div>\n            <h2>Referees</h2>\n          </div>\n        </div>\n        <div class=\"setup-form-grid\">\n          <div class=\"field\">\n            <label>Court A Referees</label>\n            <textarea id=\"court1Refs\" rows=\"4\" placeholder=\"Names only\"></textarea>\n          </div>\n          <div class=\"field\">\n            <label>Court B Referees</label>\n            <textarea id=\"court2Refs\" rows=\"4\" placeholder=\"Names only\"></textarea>\n          </div>\n          <div class=\"field\">\n            <label>Court A — Red side (as seen from the scoring table)</label>\n            <select id=\"court1RedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-red-side-a\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n          <div class=\"field\">\n            <label for=\"court1TvRedSide\">Court A — TV: Red side (as seen by the audience)</label>\n            <select id=\"court1TvRedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-tv-red-side-a\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n          <div class=\"field\">\n            <label>Court B — Red side (as seen from the scoring table)</label>\n            <select id=\"court2RedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-red-side-b\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n          <div class=\"field\">\n            <label for=\"court2TvRedSide\">Court B — TV: Red side (as seen by the audience)</label>\n            <select id=\"court2TvRedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-tv-red-side-b\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n        </div>\n      </section>\n\n      <section class=\"setup-panel setup-panel-wide\" data-testid=\"setup-match-timer\">\n        <div class=\"setup-panel-head\"><h2>Match timer</h2></div>\n        <p class=\"setup-helper\">Use m:ss. Blank stage lengths use Regular; blank Encho has no limit.</p>\n        <div class=\"setup-form-grid\">\n          <div class=\"field\"><label for=\"timeRegular\">Regular</label><input id=\"timeRegular\" value=\"3:00\" placeholder=\"3:00\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeRegular\"></div>\n          <div class=\"field\"><label for=\"timeQuarterfinal\">Quarterfinal</label><input id=\"timeQuarterfinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeQuarterfinal\"></div>\n          <div class=\"field\"><label for=\"timeSemifinal\">Semifinal</label><input id=\"timeSemifinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeSemifinal\"></div>\n          <div class=\"field\"><label for=\"timeFinal\">Final</label><input id=\"timeFinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeFinal\"></div>\n          <div class=\"field\"><label for=\"timeEncho\">Encho</label><input id=\"timeEncho\" value=\"3:00\" placeholder=\"No limit\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeEncho\"></div>\n          <div class=\"field\"><label for=\"court1TimerSound\">Court A time-up sound</label><select id=\"court1TimerSound\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court1TimerSound\"><option value=\"whistle01\" selected>Whistle 1</option><option value=\"whistle02\">Whistle 2</option></select></div>\n          <div class=\"field\"><label for=\"court1TimerEnabled\">Court A match timer</label><select id=\"court1TimerEnabled\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court1TimerEnabled\"><option value=\"On\" selected>On</option><option value=\"Off\">Off</option></select></div>\n          <div class=\"field\"><label for=\"court2TimerSound\">Court B time-up sound</label><select id=\"court2TimerSound\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court2TimerSound\"><option value=\"whistle01\">Whistle 1</option><option value=\"whistle02\" selected>Whistle 2</option></select></div>\n          <div class=\"field\"><label for=\"court2TimerEnabled\">Court B match timer</label><select id=\"court2TimerEnabled\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court2TimerEnabled\"><option value=\"On\" selected>On</option><option value=\"Off\">Off</option></select></div>\n        </div>\n      </section>\n\n      <section class=\"setup-panel setup-panel-wide\" id=\"setup-tournament-actions\">\n        <div class=\"setup-tournament-actions\">\n          <div><h3>Sharing &amp; access</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"openTournamentAccess()\" data-testid=\"setup-tournament-access\">Tournament Access · Links &amp; QR codes</button>\n            <button type=\"button\" onclick=\"copyTournamentId()\" data-testid=\"setup-copy-id\">Copy Tournament ID</button>\n          </div></div>\n          <details><summary>Advanced</summary>\n          <div><h3>Backup</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"manualSaveTournament()\" data-testid=\"setup-download-file\">Download Tournament File</button>\n            <button type=\"button\" onclick=\"downloadRecoveryFile()\" data-testid=\"setup-download-recovery\">Download Recovery File</button>\n            <button type=\"button\" onclick=\"triggerLoadRecoveryFile()\" data-testid=\"setup-load-recovery\">Load Recovery File</button>\n          </div></div>\n          <div><h3>Export</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"exportTournamentBrackets()\" data-testid=\"setup-export-brackets\">Tournament Brackets</button>\n            <button type=\"button\" onclick=\"exportResultsAwards()\" data-testid=\"setup-export-results\">Results &amp; Awards</button>\n          </div></div>\n          <div><h3>Cloud Diagnostics</h3><button type=\"button\" onclick=\"cloudDiagnostics()\" data-testid=\"setup-cloud-diagnostics\">Cloud Diagnostics</button></div>\n          </details>\n        </div>\n      </section>\n\n      <div class=\"setup-action-row\">\n        <button class=\"setup-primary-action\" onclick=\"saveSetup();show('registration')\" data-testid=\"setup-save-continue\">Save Setup &amp; Continue</button>\n      </div>\n    </div>\n  </div>"],
  ["    <div class=\"nav-menu nav-tile-wrap director-only\">\n      <button class=\"nav-tile nav-menu-trigger\" type=\"button\" aria-haspopup=\"menu\" aria-expanded=\"false\" aria-controls=\"exportMenu\" onclick=\"toggleNavMenu('exportMenu',event)\" title=\"Export\" data-testid=\"nav-export\">\n        <img src=\"/assets/nav-icons/export.svg\" alt=\"\">\n        <span>Export <b aria-hidden=\"true\">▾</b></span>\n      </button>\n      <div id=\"exportMenu\" role=\"menu\" class=\"nav-dropdown nav-dropdown-wide hidden\">\n        <button onclick=\"exportTournamentBrackets()\" data-testid=\"nav-export-brackets\">Tournament Brackets</button>\n        <button onclick=\"exportResultsAwards()\" data-testid=\"nav-export-results\">Results &amp; Awards</button>\n        <button onclick=\"closeNavMenus();alert('Referee assignment export will be added with the Referee Assignment module.')\" data-testid=\"nav-export-referees\">Referee Assignments</button>\n        <button onclick=\"closeNavMenus();alert('Tournament Archive export will be added with the archive module.')\" data-testid=\"nav-export-archive\">Tournament Archive</button>\n      </div>\n    </div>\n\n    <div class=\"nav-menu nav-tile-wrap director-only\">\n      <button class=\"nav-tile nav-menu-trigger\" type=\"button\" aria-haspopup=\"menu\" aria-expanded=\"false\" aria-controls=\"saveLoadMenu\" onclick=\"toggleNavMenu('saveLoadMenu',event)\" title=\"Save or Load\" data-testid=\"nav-save-load\">\n        <img src=\"/assets/nav-icons/save-load.svg\" alt=\"\">\n        <span>Save / Load <b aria-hidden=\"true\">▾</b></span>\n      </button>\n      <div id=\"saveLoadMenu\" role=\"menu\" class=\"nav-dropdown nav-dropdown-wide hidden\">\n        <div class=\"menu-heading\">Tournament</div>\n        <button onclick=\"closeNavMenus();createNewTournament()\" data-testid=\"nav-new-tournament\">New Tournament</button>\n        <button onclick=\"closeNavMenus();saveNow()\" data-testid=\"nav-save-now\">Save Now</button>\n        <button onclick=\"closeNavMenus();showHomePage()\" data-testid=\"nav-library\">Tournament Library</button>\n        <button onclick=\"closeNavMenus();manualSaveTournament()\" data-testid=\"nav-download-file\">Download Tournament File</button>\n        <button onclick=\"closeNavMenus();triggerLoadTournament()\" data-testid=\"nav-load-file\">Load Tournament File</button>\n        <div class=\"menu-divider\"></div><div class=\"menu-heading\">Recovery</div>\n        <button onclick=\"closeNavMenus();downloadRecoveryFile()\" data-testid=\"nav-download-recovery\">Download Recovery File</button>\n        <button onclick=\"closeNavMenus();triggerLoadRecoveryFile()\" data-testid=\"nav-load-recovery\">Load Recovery File</button>\n        <div class=\"menu-divider\"></div><div class=\"menu-heading\">Sharing</div>\n        <button onclick=\"closeNavMenus();copyTournamentId()\">Copy Tournament ID</button>\n        <button onclick=\"closeNavMenus();openTournamentAccess()\" data-testid=\"nav-tournament-access\">Tournament Access</button>\n        <div class=\"menu-divider\"></div><div class=\"menu-heading\">Cloud</div>\n        <button onclick=\"closeNavMenus();cloudDiagnostics()\" data-testid=\"nav-cloud-diagnostics\">Cloud Diagnostics</button>\n      </div>\n    </div>\n\n    <input id=\"ksmLoadFile\"", "    <input id=\"ksmLoadFile\""],
  ["  <div class=\"row cloud-status-wrap\"><button id=\"staffAuthButton\" class=\"secondary\" type=\"button\" onclick=\"toggleStaffSession()\" data-testid=\"staff-auth\">Staff Login</button><div onclick=\"cloudDiagnostics()\" role=\"button\" tabindex=\"0\" title=\"Open Cloud Diagnostics\"><span id=\"sessionRole\" hidden>Spectator</span><span id=\"connectionStatus\" class=\"small nav-save-status\" data-testid=\"connection-status\">Local</span><span id=\"cloudPresence\" hidden></span><span id=\"saveStatus\" class=\"small nav-save-status\" data-testid=\"save-status\">Not saved yet</span></div></div>", "  <div class=\"row cloud-status-wrap\"><button id=\"staffAuthButton\" class=\"secondary\" type=\"button\" onclick=\"toggleStaffSession()\" data-testid=\"staff-auth\">Staff Login</button><div role=\"status\"><span id=\"sessionRole\" hidden>Spectator</span><span onclick=\"cloudDiagnostics()\" role=\"button\" tabindex=\"0\" id=\"connectionStatus\" class=\"small nav-save-status\" data-testid=\"connection-status\">Local</span><span id=\"cloudPresence\" hidden></span><span id=\"saveStatus\" class=\"small nav-save-status\" data-testid=\"save-status\">Not saved yet</span></div></div>"],
  ["      <button class=\"home-new-button\" type=\"button\" data-testid=\"home-new-tournament\" onclick=\"createNewTournament()\">＋ New Tournament</button>", "      <div class=\"actions\"><button type=\"button\" data-testid=\"library-load-file\" onclick=\"triggerLoadTournament()\">Load Tournament File</button>\n      <button class=\"home-new-button\" type=\"button\" data-testid=\"home-new-tournament\" onclick=\"createNewTournament()\">＋ New Tournament</button></div>"],

  ["", "\n    <nav class=\"setup-actions-jump director-only\" aria-label=\"Setup sections\"><a href=\"#setup-tournament-actions\" onclick=\"event.preventDefault();document.getElementById('setup-tournament-actions').scrollIntoView({block:'start'})\">Tournament details, sharing, backup &amp; export</a></nav>\n\n"],
  ["      <section class=\"setup-panel setup-panel-wide\">\n", "      <section class=\"setup-panel setup-panel-wide\" id=\"setup-tournament-actions\">\n"],
  ["Edit short URL", "Edit short name"],
  ["", "\n        <div class=\"setup-tournament-actions\">\n          <div><h3>Sharing &amp; access</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"openTournamentAccess()\" data-testid=\"setup-tournament-access\">Tournament Access · Links &amp; QR codes</button>\n            <button type=\"button\" onclick=\"copyTournamentId()\" data-testid=\"setup-copy-id\">Copy Tournament ID</button>\n          </div></div>\n          <div><h3>Backup</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"manualSaveTournament()\" data-testid=\"setup-download-file\">Download Tournament File</button>\n            <button type=\"button\" onclick=\"downloadRecoveryFile()\" data-testid=\"setup-download-recovery\">Download Recovery File</button>\n            <button type=\"button\" onclick=\"triggerLoadRecoveryFile()\" data-testid=\"setup-load-recovery\">Load Recovery File</button>\n          </div></div>\n          <div><h3>Export</h3><div class=\"actions\">\n            <button type=\"button\" onclick=\"exportTournamentBrackets()\" data-testid=\"setup-export-brackets\">Tournament Brackets</button>\n            <button type=\"button\" onclick=\"exportResultsAwards()\" data-testid=\"setup-export-results\">Results &amp; Awards</button>\n          </div></div>\n          <details><summary>Advanced</summary><button type=\"button\" onclick=\"cloudDiagnostics()\" data-testid=\"setup-cloud-diagnostics\">Cloud Diagnostics</button></details>\n        </div>\n\n"],

  // Link preview: a plain page title (the version moved to the About line) and Open Graph tags.
  ["<title>Kendo Shiai Manager v__KSM_VERSION__</title>", "<title>Kendo Shiai Manager</title>\n<meta name=\"description\" content=\"Run a kendo tournament: pools, brackets, live scores and TV displays.\">\n<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:site_name\" content=\"Kendo Shiai Manager\">\n<meta property=\"og:title\" content=\"Kendo Shiai Manager\">\n<meta property=\"og:description\" content=\"Live scores, pools and brackets for kendo tournaments.\">\n<meta property=\"og:image\" content=\"https://tournament.hawaiikendofederation.org/icons/icon-512.png\">\n<meta name=\"twitter:card\" content=\"summary\">"],
  ["            <input id=\"tName\" value=\"Aiea Taiheiji Kendo Tournament\" data-testid=\"setup-tournament-name\">", "            <input id=\"tName\" value=\"Aiea Taiheiji Kendo Tournament\" data-testid=\"setup-tournament-name\">\n            <div class=\"setup-short-url director-only\">\n              <div class=\"setup-short-url-row\"><span>Short URL: <output id=\"setupShortUrl\" data-testid=\"setup-short-url\"></output></span><button type=\"button\" class=\"secondary\" onclick=\"ksmEditTournamentSlug(false)\" data-testid=\"edit-tournament-slug\">Edit short URL</button></div>\n              <p class=\"small\">Old links keep working after a rename.</p>\n            </div>"],
  ["  <div class=\"brand nav-brand\" role=\"button\" tabindex=\"0\" title=\"Tournament Library\" onclick=\"showHomePage()\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();showHomePage()}\">", "  <div class=\"brand nav-brand\" role=\"button\" tabindex=\"0\" title=\"Tournament Library\" onclick=\"ksmHeaderLogo()\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();ksmHeaderLogo()}\">"],
  ['    <div class="nav-brand-copy">\n      <span class="nav-brand-name">KSM</span>\n      <span class="nav-brand-subtitle">Kendo Shiai Manager</span>\n      <span class="version-badge">v__KSM_VERSION__</span>\n    </div>', '    <div class="nav-brand-copy">\n      <span class="nav-brand-name">KSM</span>\n      <span class="nav-brand-subtitle">Kendo Shiai Manager</span>\n    </div>'],
  ['  <nav class="minimal-nav', '  <div id="tournamentHeading" class="tournament-heading"></div>\n\n  <nav class="minimal-nav'],
  ["", "      <section class=\"setup-panel setup-panel-wide\" data-testid=\"setup-match-timer\">\n        <div class=\"setup-panel-head\"><h2>Match timer</h2></div>\n        <p class=\"setup-helper\">Use m:ss. Blank stage lengths use Regular; blank Encho has no limit.</p>\n        <div class=\"setup-form-grid\">\n          <div class=\"field\"><label for=\"timeRegular\">Regular</label><input id=\"timeRegular\" value=\"3:00\" placeholder=\"3:00\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeRegular\"></div>\n          <div class=\"field\"><label for=\"timeQuarterfinal\">Quarterfinal</label><input id=\"timeQuarterfinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeQuarterfinal\"></div>\n          <div class=\"field\"><label for=\"timeSemifinal\">Semifinal</label><input id=\"timeSemifinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeSemifinal\"></div>\n          <div class=\"field\"><label for=\"timeFinal\">Final</label><input id=\"timeFinal\" value=\"\" placeholder=\"Use Regular\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeFinal\"></div>\n          <div class=\"field\"><label for=\"timeEncho\">Encho</label><input id=\"timeEncho\" value=\"3:00\" placeholder=\"No limit\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-timeEncho\"></div>\n          <div class=\"field\"><label for=\"court1TimerSound\">Court A time-up sound</label><select id=\"court1TimerSound\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court1TimerSound\"><option value=\"whistle01\" selected>Whistle 1</option><option value=\"whistle02\">Whistle 2</option></select></div>\n          <div class=\"field\"><label for=\"court1TimerEnabled\">Court A match timer</label><select id=\"court1TimerEnabled\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court1TimerEnabled\"><option value=\"On\" selected>On</option><option value=\"Off\">Off</option></select></div>\n          <div class=\"field\"><label for=\"court2TimerSound\">Court B time-up sound</label><select id=\"court2TimerSound\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court2TimerSound\"><option value=\"whistle01\">Whistle 1</option><option value=\"whistle02\" selected>Whistle 2</option></select></div>\n          <div class=\"field\"><label for=\"court2TimerEnabled\">Court B match timer</label><select id=\"court2TimerEnabled\" onchange=\"ksmSaveTimerSettings()\" data-testid=\"setup-court2TimerEnabled\"><option value=\"On\" selected>On</option><option value=\"Off\">Off</option></select></div>\n        </div>\n      </section>\n\n"],
  // #40: independent audience orientation for each TV.
  ['', "          <div class=\"field\">\n            <label for=\"court1TvRedSide\">Court A \u2014 TV: Red side (as seen by the audience)</label>\n            <select id=\"court1TvRedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-tv-red-side-a\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n"],
  ['', "          <div class=\"field\">\n            <label for=\"court2TvRedSide\">Court B \u2014 TV: Red side (as seen by the audience)</label>\n            <select id=\"court2TvRedSide\" onchange=\"saveSetup();applyCourtSides();renderAll()\" data-testid=\"setup-tv-red-side-b\"><option value=\"right\">Red on the right</option><option value=\"left\">Red on the left</option></select>\n          </div>\n"],

  // feat/owner-decisions (decision 3, #29): the Pools tab's Regenerate opens Regenerate Single
  // Division for the Pools select's division (ksmRegeneratePoolDivision(), 44-react-shell.js).
  ['<button onclick="generatePools()">Regenerate</button>', '<button onclick="ksmRegeneratePoolDivision()" data-testid="pools-regenerate">Regenerate</button>'],
  // feat/owner-decisions (decision 4): "Fusen-gachi" is shown as "Fusen-sho" (the court button and
  // its dialog; React draws both, this is the markup without the module). Display text only.
  ['<span>Fusen-gachi</span>', '<span>Fusen-sho</span>'],
  // feat/owner-decisions (decision 17): Paste from Excel explains the paste (ksmPasteHelp(), 43-).
  ['<button onclick="alert(\'Paste rows directly into the table from Excel.\')" data-testid="reg-paste-excel">', '<button onclick="ksmPasteHelp()" data-testid="reg-paste-excel">'],
  ['<h2 id="fusenTitle">Fusen-gachi</h2>', '<h2 id="fusenTitle">Fusen-sho</h2>'],
  ['</main>', '</main>\n<footer class="privacy-footer no-print"><a href="/privacy" data-testid="privacy-link">Privacy</a><span class="library-about" data-testid="library-about">About: Kendo Shiai Manager <span class="version-badge">v__KSM_VERSION__</span></span></footer>'],
  ['<button class="danger" onclick="state.teams=[];renderTeams()" data-testid="team-clear">', '<button class="danger" onclick="clearTeams()" data-testid="team-clear">'],
  ['<button class="danger" onclick="state.exhibitions=[];renderExhibitions()" data-testid="exhibition-clear">', '<button class="danger" onclick="clearExhibitions()" data-testid="exhibition-clear">'],
];
const MARKUP_TEST_IDS = [
  ['<button onclick="exportResultsAwards()">', 'nav-export-results'],
  ['<button onclick="closeNavMenus();alert(\'Referee assignment export will be added with the Referee Assignment module.\')">', 'nav-export-referees'],
  ['<button onclick="closeNavMenus();alert(\'Tournament Archive export will be added with the archive module.\')">', 'nav-export-archive'],
  ['<button onclick="closeNavMenus();manualSaveTournament()">', 'nav-download-file'],
  ['<button onclick="closeNavMenus();triggerLoadTournament()">', 'nav-load-file'],
  ['<input id="ksmLoadFile" type="file" accept=".ksm,application/json" style="display:none" onchange="loadTournamentFromFile(event)">', 'load-file-input'],
  ['<select id="exhibitionEnabled" onchange="saveSetup();renderReg()">', 'exhibition-enabled'],
  // Test audit (issue #19): the referees' red side per court and the team awards, for edit-sync-test.py.
  ['<select id="court1RedSide" onchange="saveSetup();applyCourtSides();renderAll()">', 'setup-red-side-a'],
  ['<select id="court2RedSide" onchange="saveSetup();applyCourtSides();renderAll()">', 'setup-red-side-b'],
  ['<select id="teamAwardMode" onchange="state.teamAwardMode=this.value;saveSetup()">', 'team-award-mode'],
  ['<button id="exhibitionTab" class="tab" onclick="regTab(\'exhibition\')">', 'reg-tab-exhibition'],
  ['<button id="regenerateDivisionBtn" onclick="openRegenerateDivisionDialog()">', 'regenerate-division-button'],
  ['<button onclick="alert(\'CSV import will be added in the production build.\')">', 'reg-import-csv'],
  ['<button onclick="exportCSV()">', 'reg-export-csv'],
  ['<button onclick="alert(\'Paste rows directly into the table from Excel.\')">', 'reg-paste-excel'],
  ['<button class="danger" onclick="clearCompetitors()">', 'reg-clear'],
  ['<button class="danger" onclick="state.teams=[];renderTeams()">', 'team-clear'],
  ['<button class="primary" onclick="addExhibitionRow()">', 'exhibition-add'],
  ['<button onclick="addExhibitionRow(3)">', 'exhibition-add-3'],
  ['<button class="danger" onclick="state.exhibitions=[];renderExhibitions()">', 'exhibition-clear'],
  ['<div id="regenerateModal" class="ksm-modal hidden" role="dialog" aria-modal="true" aria-labelledby="regenerateModalTitle">', 'regenerate-modal'],
  ['<h2 id="regenerateModalTitle">', 'regenerate-modal-title'],
  ['<button onclick="closeManagementModal(\'regenerateModal\')" aria-label="Close">', 'regenerate-modal-close'],
  ['<button class="primary" onclick="previewFullPrintPacket()">', 'print-full-packet'],
  ['<div id="printBody" class="print-body">', 'print-body'],
  // F4 (fix/setup-edit-conflict-merge): Setup fields its conflict test edits.
  ['<input id="tHost" value="Aiea Taiheiji Kendo Club">', 'setup-host'],
  ['<input id="tLocation" value="Halawa District Park">', 'setup-location'],
  // fix/quirks-pass: the sample buttons registration-status-card-test.py and
  // sample-load-confirm-test.py press.
  ['<button onclick="loadSamples()">', 'reg-load-samples'],
  ['<button onclick="loadTeamSamples()">', 'team-load-samples'],
  ['<button onclick="loadFullTournament()">', 'reg-load-sample-tournament'],
];
// infra/deploy: the release version is written only in package.json. Where the old file had its
// version, the sources now hold the placeholder __KSM_VERSION__, which the build fills in from
// package.json (withVersion() in scripts/app-sources.mjs). These are the only placeholders allowed,
// as [the text around the placeholder, how many times]: each must appear exactly that often, no
// other placeholder may exist, and the check puts the OLD file's own version (read from its badge)
// back in their place before comparing, so every other difference still fails.
const VERSION_PLACEHOLDERS = {
  // app/index.html: the Library footer About version badge.
  markup: [['About: Kendo Shiai Manager <span class="version-badge">v__KSM_VERSION__</span>', 1]],
  // app/js/19-cloud-diagnostics.js: appVersion in the snapshot and action-history downloads.
  script: [["appVersion:'__KSM_VERSION__'", 2]],
};
const old = execFileSync('git', ['show', `${commit}:public/index.html`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
let failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
const oldVersion = old.match(/<span class="version-badge">v([^<]+)<\/span>/)[1];
// VERSION_PLACEHOLDERS: check the listed placeholders and put the old version back in their place.
function fillOldVersion(text, where) {
  const listed = VERSION_PLACEHOLDERS[where];
  const counts = listed.map(([context, n]) => [context, n, text.split(context).length - 1]);
  const total = text.split(VERSION_PLACEHOLDER).length - 1, expected = listed.reduce((sum, [, n]) => sum + n, 0);
  check(counts.every(([, n, found]) => found === n) && total === expected,
    `${where}: the version placeholders are exactly the listed ones (${counts.map(([c, n, found]) => `${c} ${found}/${n}`).join(', ')}; ${total} in all)`);
  return text.replaceAll(VERSION_PLACEHOLDER, oldVersion);
}

const scriptStart = old.indexOf('\n<script>\n') + 1, scriptEnd = old.indexOf('</script>\n</body>');
let oldScript = old.slice(scriptStart + '<script>\n'.length, scriptEnd);
for (const name of MOVED_TO_ENGINE) {
  const fn = extractFunction(oldScript, name);
  // The LAST declaration (the one that runs); an earlier redeclaration may be identical text.
  const at = oldScript.lastIndexOf(fn);
  oldScript = oldScript.slice(0, at) + fn.slice(0, fn.indexOf('{') + 1) + '}' + oldScript.slice(at + fn.length);
}
// Delete REMOVED_COURT_RENDERER, REMOVED_LIVE_SCORES_RENDERER, REMOVED_TV_RENDERER, REMOVED_RESULTS_RENDERER, REMOVED_OVERVIEW_RENDERER, REMOVED_LIBRARY_RENDERER, REMOVED_POOLS_RENDERER, REMOVED_SETUP_RENDERER, REMOVED_REGISTRATION_RENDERER and REMOVED_SHELL_RENDERER from the old script: find every
// piece first (positions in the old script as it is now), refuse overlaps, then cut from the end.
{
  const removed = [
    ...REMOVED_COURT_RENDERER.map(entry => ['REMOVED_COURT_RENDERER', entry]),
    ...REMOVED_LIVE_SCORES_RENDERER.map(entry => ['REMOVED_LIVE_SCORES_RENDERER', entry]),
    ...REMOVED_TV_RENDERER.map(entry => ['REMOVED_TV_RENDERER', entry]),
    ...REMOVED_RESULTS_RENDERER.map(entry => ['REMOVED_RESULTS_RENDERER', entry]),
    ...REMOVED_OVERVIEW_RENDERER.map(entry => ['REMOVED_OVERVIEW_RENDERER', entry]),
    ...REMOVED_LIBRARY_RENDERER.map(entry => ['REMOVED_LIBRARY_RENDERER', entry]),
    ...REMOVED_POOLS_RENDERER.map(entry => ['REMOVED_POOLS_RENDERER', entry]),
    ...REMOVED_SETUP_RENDERER.map(entry => ['REMOVED_SETUP_RENDERER', entry]),
    ...REMOVED_REGISTRATION_RENDERER.map(entry => ['REMOVED_REGISTRATION_RENDERER', entry]),
    ...REMOVED_SHELL_RENDERER.map(entry => ['REMOVED_SHELL_RENDERER', entry]),
  ];
  const cuts = removed.map(([list, entry]) => {
    if (typeof entry === 'object') {
      const at = oldScript.indexOf(entry.from);
      if (at < 0 || oldScript.indexOf(entry.from, at + 1) >= 0) throw new Error(`${list}: ${entry.from} is not unique in the old script`);
      const end = oldScript.indexOf(entry.to, at);
      if (end < 0) throw new Error(`${list}: no ${entry.to} after ${entry.from}`);
      return { at, end: end + entry.to.length, what: entry.from };
    }
    const [, name, nth, body] = entry.match(/^([\w$]+)#(\d+)(:body)?$/);
    const starts = [...oldScript.matchAll(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g'))].map(m => m.index);
    const at = starts[Number(nth) - 1];
    if (at === undefined) throw new Error(`${list}: the old script has ${starts.length} declarations of ${name}, not ${nth}`);
    const fn = extractFunction(oldScript.slice(at), name, { occurrence: 'first' });
    if (body) return { at: at + fn.indexOf('{') + 1, end: at + fn.length - 1, what: entry };
    return { at, end: at + fn.length + (oldScript[at + fn.length] === '\n' ? 1 : 0), what: entry };
  }).sort((a, b) => a.at - b.at);
  cuts.forEach((c, i) => { if (i && c.at < cuts[i - 1].end) throw new Error(`removed renderers: ${c.what} overlaps ${cuts[i - 1].what}`); });
  for (const c of cuts.reverse()) oldScript = oldScript.slice(0, c.at) + oldScript.slice(c.end);
}
const headStyles = old.slice(old.indexOf('<style'), old.indexOf('</head>'));
const oldStyleBlocks = [...headStyles.matchAll(/<style[^>]*>\n([\s\S]*?)<\/style>/g)];
const outsideBlocks = headStyles.replace(/<style[^>]*>\n[\s\S]*?<\/style>/g, '');

check(!outsideBlocks.trim(), `old <head> held only <style> blocks between <title> and </head> (${oldStyleBlocks.length} blocks)`);
const oldMarkup = old.slice(0, old.indexOf('<style')) + STYLE_TAG + '\n' + old.slice(old.indexOf('</head>'), scriptStart) + SCRIPT_TAG + old.slice(scriptEnd + '</script>'.length);
let markup = fillOldVersion(indexHtml(), 'markup');
for (const [beforeSource, nowSource] of MARKUP_EDITS) {
  const before = beforeSource.replaceAll(VERSION_PLACEHOLDER, oldVersion);
  const now = nowSource.replaceAll(VERSION_PLACEHOLDER, oldVersion);
  const count = markup.split(now).length - 1;
  if (count !== 1) check(false, `MARKUP_EDITS: ${now} appears ${count} times (expected once)`);
  else markup = markup.replace(now, () => before);
}
for (const [tag, id] of MARKUP_TEST_IDS) {
  const added = `${tag.slice(0, -1)} data-testid="${id}">`;
  const count = markup.split(added).length - 1;
  if (count !== 1) check(false, `MARKUP_TEST_IDS: ${id} is on its tag ${count} times (expected once)`);
  else markup = markup.replace(added, () => tag);
}
check(markup === oldMarkup, `app/index.html is the old markup, byte for byte, apart from ${MARKUP_TEST_IDS.length} listed test IDs, ${MARKUP_EDITS.length} listed edits and the version placeholders`);
const POST_SPLIT = /\/\* ksm:post-split-begin ([\w-]+)(?: was:((?:(?!\*\/)[^\n])*?))? \*\/[\s\S]*?\/\* ksm:post-split-end \*\/\n?/g;
// CSS takes the same markers (KNOWN_POST_SPLIT_CSS_EDITS); without them the styles stay byte for byte.
const foundCss = {};
for (const m of appStyles().matchAll(POST_SPLIT)) foundCss[m[1]] = (foundCss[m[1]] || 0) + 1;
check(JSON.stringify(foundCss) === JSON.stringify(KNOWN_POST_SPLIT_CSS_EDITS),
  `post-split CSS edits are the known ones (${Object.entries(foundCss).map(([k, n]) => `${k}: ${n}`).join(', ') || 'none'})`);
check(appStyles().replace(POST_SPLIT, (_, name, was) => was ?? '') === oldStyleBlocks.map(m => m[1]).join(''),
  'app/styles/*.css concatenated = old <style> blocks, byte for byte, apart from marked post-split edits');

const found = {};
for (const m of appScript().matchAll(POST_SPLIT)) found[m[1]] = (found[m[1]] || 0) + 1;
check(JSON.stringify(found) === JSON.stringify(KNOWN_POST_SPLIT_EDITS),
  `post-split edits are the known ones (${Object.entries(found).map(([k, n]) => `${k}: ${n}`).join(', ') || 'none'})`);
const js = fillOldVersion(appScript(), 'script').replace(POST_SPLIT, (_, name, was) => was ?? '');
check(!/ksm:post-split-(begin|end)/.test(js), 'every post-split marker is paired');
if (js === oldScript) check(true, 'app/js/*.js concatenated = old <script>, byte for byte');
else {
  const normalize = async code => (await minify('app.js', code, { compress: false, mangle: false, codegen: { removeWhitespace: false } })).code;
  const [a, b] = await Promise.all([normalize(oldScript), normalize(js)]);
  check(a === b, 'app/js/*.js concatenated = old <script> apart from comments (type annotations) and formatting');
  if (a !== b) {
    const at = [...a].findIndex((ch, i) => ch !== b[i]);
    console.log(`  first difference near:\n  old: ${a.slice(at - 80, at + 80)}\n  new: ${b.slice(at - 80, at + 80)}`);
  }
}
if (failed) process.exit(1);
