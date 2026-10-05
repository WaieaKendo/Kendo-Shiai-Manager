// index.html overrides many functions by declaring them again later in the file;
// the browser silently runs the LAST declaration. That makes it easy to edit a
// definition that never runs. This test is a ratchet:
//   * it FAILS if a function gains a new duplicate declaration, and
//   * it asks you to lower the baseline when a duplicate is removed.
import { html, countDefinitions } from './lib/ksm-source.mjs';

// Baseline recorded at v3.17.20-test. Only ever lower these numbers.
// M.8 step 5 (feat/react-court-finish) removed the legacy court renderer: 46 -> 27 extra
// declarations (renderScore 4->1, renderQueue 4->1, renderContext 7->1, legacyUpdateUndoButton
// 4->0, setMatchBadge 2->0, allPoolResultsContextHtml 2->0, poolResultCardHtml 2->0,
// singleElimRoundCardHtml 2->0; entries at 1 or 0 are dropped).
// M.13 (feat/react-live-scores) removed the legacy Live Scores renderer: 27 -> 26 (renderPublic 2->1).
// M.13 (feat/react-tv) removed the legacy TV renderers and the never-called audience-hero helpers:
// 26 -> 23 (renderTvDisplay 2->1, audienceIndividualHero 2->0, standardTeamAudienceHtml 2->0).
// M.13 (feat/react-results) removed the legacy Results renderer and the unused team/kachinuki
// sheets: 23 -> 18 (renderResultsAll 2->0, teamResultsBracketHtml 2->0, teamSheetHtml 2->0,
// kachinukiSheetHtml 2->0 and the inner `list` of both kachinukiSheetHtml() 2->0).
// M.13 (feat/react-overview) removed the legacy Overview renderer and the first renderProgress()
// (11-, overridden by the empty one in 23- and never run): 18 -> 17 (renderProgress 2->1).
// M.13 (feat/react-library) removed none (17).
// M.13 (feat/react-pools) removed the legacy Pools renderer with bracketHtml() and its helpers:
// 17 -> 14 (alignedPointSlots 2->0, bracketHtml 2->0, singleElimBracketHtml 2->0).
const BASELINE = {
  canCloudWrite: 2, cloudHeaders: 2, cloudSocketUrl: 2, initializeCloudRoleFromUrl: 2,
  installRoleBanner: 2, isReadOnlySession: 2, isSpectatorSession: 2,
  loadTournamentFromCloud: 2, openTournamentAccess: 2,
  regTab: 2,
  sessionKey: 2,
  setSessionRole: 2, spectatorLink: 2, syncIndividualSingleElim: 2,
};

const names = [...new Set([...html.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]))];
let failed = 0;
for (const name of names) {
  const count = countDefinitions(html, name), allowed = BASELINE[name] || 1;
  if (count > allowed) { console.log(`FAIL ${name} is declared ${count}× (baseline ${allowed}); edit the existing definition instead of redeclaring it`); failed++; }
  else if (count < allowed) console.log(`NOTE ${name} is now declared ${count}× — lower its BASELINE entry to ${count}`);
}
for (const name of Object.keys(BASELINE)) {
  if (!names.includes(name)) console.log(`NOTE ${name} is no longer declared — remove its BASELINE entry`);
}
const total = Object.values(BASELINE).reduce((a, n) => a + n - 1, 0);
console.log(`${failed ? 'FAIL' : 'PASS'} no new function redeclarations (${Object.keys(BASELINE).length} functions / ${total} extra declarations in baseline)`);
if (failed) process.exit(1);
