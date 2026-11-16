// #15 PR 12a (docs/STORE.md section 3 item 12): in the app, the draw (`pools`, `teamPools`, `brackets`,
// `singleElimComps`, `byeWinners`, `generated`, `managementRevision`) is store data written through
// app/modules/engine/structure-store.js. The vm tests run the app's functions on a plain `state`: this is the module's
// own code for those helpers (ksmDrawWith(), ksmEditedPools(), ksmNextManagementRevision(), ksmDrawHolds()), with ksmSetDraw() putting
// the maps on that `state` as the store's reducer does.
import { extractFunction, html } from './ksm-source.mjs';

export const drawHelpers = `const KSM_DRAW_KEYS=Object.freeze(['pools','teamPools','brackets','singleElimComps','byeWinners']);
${extractFunction(html, 'ksmDrawWith')}
${extractFunction(html, 'ksmEditedPools')}
${extractFunction(html, 'ksmNextManagementRevision')}
${extractFunction(html, 'ksmDrawHolds')}
function ksmSetDraw(type,lists){Object.assign(state,lists)}
`;
