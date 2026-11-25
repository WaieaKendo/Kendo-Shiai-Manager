// ==========================================================
// KSM v3.10.9 — spectator presentation refinements
// ==========================================================
function poolDisplayComplete(div,label){
  const matches=(state.allMatches?.[div]||[]).filter(match=>match.pool===label&&!match.championship);
  return matches.length>0&&matches.every(match=>match.done);
}


