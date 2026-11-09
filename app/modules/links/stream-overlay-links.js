// @ts-check
import {closeNavMenus,ksmLinkUrl} from '../legacy.js';
import {copyTextValue} from '../sync/cloud-realtime-save-and-load.js';
import {cloudSession,saveNow} from '../sync/cloud-session-and-autosave.js';
import {normalizeCourt} from '../sync/sync-state-and-rebase.js';
// Step 3d of #136: from app/js/33-stream-overlay-links.js.
// ==========================================================
// Stream overlay links (feat/react-overlay)
// /t/<id>/overlay/a|b (M.9; was /overlay?tournament=<id>&court=A|B, which still works) is a
// read-only React page (app/overlay.html) for
// OBS / PRISM browser sources. The TV menu gets a "copy link" item per court: the React
// navigation bar draws them (app/react/shell/nav-model.ts; they were added here at startup
// until the shell moved to React, M.13).
// ==========================================================
export function streamOverlayLink(court){if(!cloudSession.tournamentId)return '';return ksmLinkUrl({screen:'overlay',id:cloudSession.tournamentId,court:normalizeCourt(court)})}
export async function copyStreamOverlayLink(court){closeNavMenus();if(!cloudSession.tournamentId)await saveNow();const link=streamOverlayLink(court);if(!link){alert('Save the tournament to cloud before copying a stream overlay link.');return}copyTextValue(link,`Court ${normalizeCourt(court)} stream overlay link copied`)}
