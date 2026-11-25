// #15 PR 12a (docs/STORE.md section 3 item 12): in the app, the draw (`pools`, `teamPools`, `brackets`,
// `singleElimComps`, `byeWinners`, `generated`, `managementRevision`) is store data written through
// app/modules/engine/structure-store.js. The vm tests run the app's functions in a context: this is the module's
// own code for those helpers (ksmDrawWith(), ksmEditedPools(), ksmNextManagementRevision(), ksmDrawHolds(), and since PR 12b
// ksmNodesWithWinners(), ksmAdvanceBracket(), ksmSetDraw()): a vm test whose context has a real store (tests/lib/vm-store.mjs)
// runs them as they are, ksmSetDraw() dispatching the draw action (since #15 item 14b).
import { extractFunction, html } from './ksm-source.mjs';

export const drawHelpers = `const KSM_DRAW_KEYS=Object.freeze(['pools','teamPools','brackets','singleElimComps','byeWinners','championshipNodes','singleElimNodes','teamBracketNodes','teamElimTeams']);
${extractFunction(html, 'ksmDrawWith')}
${extractFunction(html, 'ksmEditedPools')}
${extractFunction(html, 'ksmNextManagementRevision')}
${extractFunction(html, 'ksmDrawHolds')}
${extractFunction(html, 'ksmNodesWithWinners')}
${extractFunction(html, 'ksmAdvanceBracket')}
${extractFunction(html, 'ksmSetDraw')}
`;
