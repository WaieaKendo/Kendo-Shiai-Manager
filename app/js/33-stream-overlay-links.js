/* ksm:post-split-begin stream-overlay */
// ==========================================================
// Stream overlay links (feat/react-overlay)
// /overlay?tournament=<id>&court=A|B is a read-only React page (app/overlay.html) for
// OBS / PRISM browser sources. The TV menu gets a "copy link" item per court; the markup
// in index.html stays as it was, so the items are added here at startup.
// Post-split code: scripts/verify-split.mjs removes the marked region before it compares.
// ==========================================================
function streamOverlayLink(court){if(!cloudSession.tournamentId)return '';const url=new URL('/overlay',location.href);url.searchParams.set('tournament',cloudSession.tournamentId);url.searchParams.set('court',normalizeCourt(court));return url.toString()}
async function copyStreamOverlayLink(court){closeNavMenus();if(!cloudSession.tournamentId)await saveNow();const link=streamOverlayLink(court);if(!link){alert('Save the tournament to cloud before copying a stream overlay link.');return}copyTextValue(link,`Court ${normalizeCourt(court)} stream overlay link copied`)}
(function addStreamOverlayMenuItems(){
  const menu=typeof document!=='undefined'&&document.getElementById('tvMenu');
  if(!menu||menu.querySelector('[data-testid="nav-overlay-a"]'))return;
  menu.insertAdjacentHTML('beforeend','<div class="menu-heading">Stream overlay</div>'+['A','B'].map(c=>`<button onclick="copyStreamOverlayLink('${c}')" data-testid="nav-overlay-${c.toLowerCase()}" title="Copy the Court ${c} stream overlay link (OBS / PRISM browser source)">Copy Court ${c} overlay link</button>`).join(''));
})();
/* ksm:post-split-end */
