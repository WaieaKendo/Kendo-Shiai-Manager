/* ksm:post-split-begin stream-overlay */
// ==========================================================
// Stream overlay links (feat/react-overlay)
// /t/<id>/overlay/a|b (M.9; was /overlay?tournament=<id>&court=A|B, which still works) is a
// read-only React page (app/overlay.html) for
// OBS / PRISM browser sources. The TV menu gets a "copy link" item per court: the React
// navigation bar draws them (app/react/shell/nav-model.ts; they were added here at startup
// until the shell moved to React, M.13).
// Post-split code: scripts/verify-split.mjs removes the marked region before it compares.
// ==========================================================
function streamOverlayLink(court){if(!cloudSession.tournamentId)return '';return ksmLinkUrl({screen:'overlay',id:cloudSession.tournamentId,court:normalizeCourt(court)})}
async function copyStreamOverlayLink(court){closeNavMenus();if(!cloudSession.tournamentId)await saveNow();const link=streamOverlayLink(court);if(!link){alert('Save the tournament to cloud before copying a stream overlay link.');return}copyTextValue(link,`Court ${normalizeCourt(court)} stream overlay link copied`)}
/* ksm:post-split-end */
