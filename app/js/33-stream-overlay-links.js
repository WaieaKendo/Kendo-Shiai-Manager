/* ksm:post-split-begin stream-overlay */
// ==========================================================
// Stream overlay links (feat/react-overlay)
// /overlay?tournament=<id>&court=A|B is a read-only React page (app/overlay.html) for
// OBS / PRISM browser sources. The TV menu gets a "copy link" item per court: the React
// navigation bar draws them (app/react/shell/nav-model.ts; they were added here at startup
// until the shell moved to React, M.13).
// Post-split code: scripts/verify-split.mjs removes the marked region before it compares.
// ==========================================================
function streamOverlayLink(court){if(!cloudSession.tournamentId)return '';const url=new URL('/overlay',location.href);url.searchParams.set('tournament',cloudSession.tournamentId);url.searchParams.set('court',normalizeCourt(court));return url.toString()}
async function copyStreamOverlayLink(court){closeNavMenus();if(!cloudSession.tournamentId)await saveNow();const link=streamOverlayLink(court);if(!link){alert('Save the tournament to cloud before copying a stream overlay link.');return}copyTextValue(link,`Court ${normalizeCourt(court)} stream overlay link copied`)}
/* ksm:post-split-end */
