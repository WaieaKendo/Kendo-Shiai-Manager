// index.html overrides many functions by declaring them again later in the file;
// the browser silently runs the LAST declaration. That makes it easy to edit a
// definition that never runs. This test is a ratchet:
//   * it FAILS if a function gains a new duplicate declaration, and
//   * it asks you to lower the baseline when a duplicate is removed.
import { html, countDefinitions } from './lib/ksm-source.mjs';

// Baseline recorded at v3.17.20-test. Only ever lower these numbers.
const BASELINE = {
  alignedPointSlots: 2, allPoolResultsContextHtml: 2, audienceIndividualHero: 2, bracketHtml: 2,
  canCloudWrite: 2, cloudHeaders: 2, cloudSocketUrl: 2, initializeCloudRoleFromUrl: 2,
  installRoleBanner: 2, isReadOnlySession: 2, isSpectatorSession: 2, kachinukiSheetHtml: 2,
  legacyUpdateUndoButton: 4, list: 2, loadTournamentFromCloud: 2, openTournamentAccess: 2,
  poolResultCardHtml: 2, regTab: 2, renderContext: 7, renderProgress: 2, renderPublic: 2,
  renderQueue: 4, renderResultsAll: 2, renderScore: 4, renderTvDisplay: 2, sessionKey: 2,
  setMatchBadge: 2, setSessionRole: 2, singleElimBracketHtml: 2, singleElimRoundCardHtml: 2,
  spectatorLink: 2, standardTeamAudienceHtml: 2, syncIndividualSingleElim: 2,
  teamResultsBracketHtml: 2, teamSheetHtml: 2,
};

const names = [...new Set([...html.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]))];
let failed = 0;
for (const name of names) {
  const count = countDefinitions(html, name), allowed = BASELINE[name] || 1;
  if (count > allowed) { console.log(`FAIL ${name} is declared ${count}× (baseline ${allowed}); edit the existing definition instead of redeclaring it`); failed++; }
  else if (count < allowed) console.log(`NOTE ${name} is now declared ${count}× — lower its BASELINE entry to ${count}`);
}
const total = Object.values(BASELINE).reduce((a, n) => a + n - 1, 0);
console.log(`${failed ? 'FAIL' : 'PASS'} no new function redeclarations (${Object.keys(BASELINE).length} functions / ${total} extra declarations in baseline)`);
if (failed) process.exit(1);
