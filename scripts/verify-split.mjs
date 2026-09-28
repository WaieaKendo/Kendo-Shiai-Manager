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
// step 5; REMOVED_LIVE_SCORES_RENDERER: the legacy Live Scores renderer, M.13) is named piece by
// piece; the check deletes exactly those pieces from the old script before comparing, so every
// other difference, and any piece that no longer matches, still fails.
import { execFileSync } from 'node:child_process';
import { minify } from 'vite';
import { extractFunction } from '../tests/lib/ksm-source.mjs';
import { ROOT, STYLE_TAG, SCRIPT_TAG, indexHtml, appStyles, appScript } from './app-sources.mjs';

const commit = process.argv[2] || 'def5010';
const KNOWN_POST_SPLIT_EDITS = {
  // feat/react-setup: app/js/00-react-bridge.js + the ksm:state-changed dispatch in
  // performCourtAction() and renderAll(), so React islands re-render with `state`.
  'react-bridge': 3,
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
  // fix/pre-event (M.12): test IDs on markup drawn by app/js (03: the exhibition rows and the
  // Regenerate Single Division dialog), each line kept in its `was:` marker. Test IDs on the
  // static markup are listed in MARKUP_TEST_IDS instead.
  'test-ids': 4,
  // fix/pre-event (F8): clearTeams()/clearExhibitions() confirm first (app/js/03).
  'clear-confirm': 1,
  // refactor/engine-bridge (roadmap 2.0+): one delegation per MOVED_TO_ENGINE function.
  'engine-bridge': 88,
  // refactor/engine-settings (roadmap 2.1): tournamentSettings() accessor + inline
  // replacements of engine DOM reads (`was:` form, see below); 9 at 2.1, 4 left after
  // the team engine moved (2.6) and its bridges pass tournamentSettings() in; 3 after
  // division generation moved (2.7).
  'engine-settings': 3,
  // fix/pre-event (F9): printPlacementsForDivision() uses resultPlacements() (comment + body).
  'print-placements': 2,
  // fix/pre-event (F3, from fix/court-pin-after-reload): the pinned-court key no longer holds the
  // session role (18: storedCourtPin(), courtPinStorageKey() parameter + body, pinnedCourt() body)
  // and a tournament link without &court= starts on the device's stored court (33:
  // initializeCloudRoleFromUrl()).
  'court-pin': 5,
  // fix/pre-event (F4, from fix/setup-edit-conflict-merge): the 409 rebase merges non-court edits
  // three-way against the cloud copy they started from. 18: the merge helpers,
  // rebaseLocalPayloadOnRecord()'s basePayload parameter and merge call; 20: writeOutbox() keeps
  // the base; 21: live updates / own echo remember the base, the rebased save, the outbox flush
  // (two) and the page-unload queue pass it on (mergeQueuedStaffWork() passes the outbox's base
  // inside its outbox-flush-rebase region); 33: performCloudSave() takes, passes on and
  // remembers it, loadTournamentFromCloud() remembers it.
  'edit-merge': 15,
  // fix/pre-event (F11): saveAuto(), called by the awards editor but never defined (app/js/20).
  'award-save': 1,
  // fix/outbox-flush-local-changes (F6): mergeQueuedStaffWork() and its call at staff login;
  // the outbox flush also replays court actions taken before it started (comment + condition).
  'outbox-flush-rebase': 4,
  // fix/pre-event (F7): Load Recovery File asks first and refuses while work is queued
  // (confirmRecoveryFileLoad() + its call in loadRecoveryFile()).
  'recovery-guard': 2,
  // fix/pre-event (roadmap 0.5): Load Tournament File asks before replacing the open tournament and
  // loads a file of another tournament as a new one (loadTournamentFromFile(): two inline
  // replacements; the helpers after it); Download Tournament File writes the tournament ID and
  // revision into the file (manualSaveTournament(), inline).
  'load-file-guard': 4,
  // feat/react-live-scores (M.13): the Live Scores screen's React island. With the legacy
  // renderer removed (REMOVED_LIVE_SCORES_RENDERER) renderPublic()'s body (25) is a marked call
  // of ksmRenderLiveScores(), and app/js/36-react-live-scores.js publishes the screen as plain
  // data and shows a notice when the React module is missing.
  'react-live': 2,
  // feat/react-overlay: app/js/33-stream-overlay-links.js (TV menu "copy overlay link").
  'stream-overlay': 1,
};
// The same markers in app/styles/*.css (count per name, in order of first appearance).
const KNOWN_POST_SPLIT_CSS_EDITS = {
  // fix/pre-event (F2): Undo/Redo stay on the division-complete court screen (08); only
  // Fusen-gachi and Next Match are hidden there.
  'undo-after-complete': 1,
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
// fix/pre-event (M.12): data-testid attributes added to existing markup, as [old start tag, test ID];
// the check takes each ` data-testid="<id>"` out again (it must appear exactly once, at the end
// of that tag) and then compares byte for byte, so any other markup change still fails.
// fix/pre-event (F8): deliberate edits of existing markup, as [markup before, markup now]. Each
// 'now' must appear exactly once; the check puts 'before' back (before the test-ID step) and then
// compares byte for byte, so any other markup change still fails.
const MARKUP_EDITS = [
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
];
const old = execFileSync('git', ['show', `${commit}:public/index.html`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
let failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };

const scriptStart = old.indexOf('\n<script>\n') + 1, scriptEnd = old.indexOf('</script>\n</body>');
let oldScript = old.slice(scriptStart + '<script>\n'.length, scriptEnd);
for (const name of MOVED_TO_ENGINE) {
  const fn = extractFunction(oldScript, name);
  // The LAST declaration (the one that runs); an earlier redeclaration may be identical text.
  const at = oldScript.lastIndexOf(fn);
  oldScript = oldScript.slice(0, at) + fn.slice(0, fn.indexOf('{') + 1) + '}' + oldScript.slice(at + fn.length);
}
// Delete REMOVED_COURT_RENDERER and REMOVED_LIVE_SCORES_RENDERER from the old script: find every
// piece first (positions in the old script as it is now), refuse overlaps, then cut from the end.
{
  const removed = [
    ...REMOVED_COURT_RENDERER.map(entry => ['REMOVED_COURT_RENDERER', entry]),
    ...REMOVED_LIVE_SCORES_RENDERER.map(entry => ['REMOVED_LIVE_SCORES_RENDERER', entry]),
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
let markup = indexHtml();
for (const [before, now] of MARKUP_EDITS) {
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
check(markup === oldMarkup, `app/index.html is the old markup, byte for byte, apart from ${MARKUP_TEST_IDS.length} listed test IDs and ${MARKUP_EDITS.length} listed edits`);
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
const js = appScript().replace(POST_SPLIT, (_, name, was) => was ?? '');
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
