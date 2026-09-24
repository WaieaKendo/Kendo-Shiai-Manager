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
import { execFileSync } from 'node:child_process';
import { minify } from 'vite';
import { extractFunction } from '../tests/lib/ksm-source.mjs';
import { ROOT, STYLE_TAG, SCRIPT_TAG, indexHtml, appStyles, appScript } from './app-sources.mjs';

const commit = process.argv[2] || 'def5010';
const KNOWN_POST_SPLIT_EDITS = {
  // feat/react-setup: app/js/00-react-bridge.js + the ksm:state-changed dispatch in
  // performCourtAction() and renderAll(), so React islands re-render with `state`.
  'react-bridge': 3,
  // refactor/engine-bridge (roadmap 2.0+): one delegation per MOVED_TO_ENGINE function.
  'engine-bridge': 88,
  // refactor/engine-settings (roadmap 2.1): tournamentSettings() accessor + inline
  // replacements of engine DOM reads (`was:` form, see below); 9 at 2.1, 4 left after
  // the team engine moved (2.6) and its bridges pass tournamentSettings() in; 3 after
  // division generation moved (2.7).
  'engine-settings': 3,
  // fix/outbox-flush-local-changes (F6): mergeQueuedStaffWork() and its call at staff login;
  // the outbox flush also replays court actions taken before it started (comment + condition).
  'outbox-flush-rebase': 4,
  // feat/react-overlay: app/js/33-stream-overlay-links.js (TV menu "copy overlay link").
  'stream-overlay': 1,
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
const headStyles = old.slice(old.indexOf('<style'), old.indexOf('</head>'));
const oldStyleBlocks = [...headStyles.matchAll(/<style[^>]*>\n([\s\S]*?)<\/style>/g)];
const outsideBlocks = headStyles.replace(/<style[^>]*>\n[\s\S]*?<\/style>/g, '');

check(!outsideBlocks.trim(), `old <head> held only <style> blocks between <title> and </head> (${oldStyleBlocks.length} blocks)`);
const oldMarkup = old.slice(0, old.indexOf('<style')) + STYLE_TAG + '\n' + old.slice(old.indexOf('</head>'), scriptStart) + SCRIPT_TAG + old.slice(scriptEnd + '</script>'.length);
check(indexHtml() === oldMarkup, 'app/index.html is the old markup, byte for byte');
check(appStyles() === oldStyleBlocks.map(m => m[1]).join(''), 'app/styles/*.css concatenated = old <style> blocks, byte for byte');

const POST_SPLIT = /\/\* ksm:post-split-begin ([\w-]+)(?: was:((?:(?!\*\/)[^\n])*?))? \*\/[\s\S]*?\/\* ksm:post-split-end \*\/\n?/g;
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
