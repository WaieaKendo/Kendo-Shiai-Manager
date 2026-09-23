// KSM test API: the ONLY place browser tests reach into index.html internals
// (the global `state` object and global functions).
//
// tests/ksm_app.py injects this file into every page it drives (add_init_script),
// so it defines `window.KSMTest` before the app's own scripts run; every member
// looks up app globals lazily, at call time.
//
// Use it only for what the app has no UI for (bulk setup, engine snapshots,
// sync status). When index.html is split into modules / React, update this file
// (and ksm_app.py) instead of the tests.
window.KSMTest = {
  booted() { return typeof state === 'object' && typeof cloudSession === 'object'; },

  // --- Cloud / sync status -----------------------------------------------------
  tournamentId() { return cloudSession.tournamentId || null; },
  revision() { return Number(cloudSession.revision) || 0; },
  role() { return ksmSessionRole; },
  pending() { return localChangesPending(); },
  diagnostics() { return readCloudDiagnosticsState(); },
  // Snapshot queued for the cloud (offline, failed save, reload before a save): who queued it, for which tournament.
  outbox() { const o = readOutbox(); return o ? {tournamentId: o.tournamentId, role: o.role, baseRevision: o.baseRevision, reason: o.actions?.[0]?.reason || ''} : null; },
  hasAutosave() { return !!localStorage.getItem(KSM_SAVE_KEY); },
  // Deliver a record as if it arrived on the live socket; returns whether it was applied.
  receive(record) { return applyRemoteCloudRecord(record, false, false); },
  clientId() { return cloudSession.clientId; },
  generated() { return !!state.generated && Object.keys(state.allMatches || {}).length > 0; },
  allMatches() { return state.allMatches; },
  pools() { return state.pools; },
  saveNow(label) { criticalAutoSave(label); },
  // Show a screen without re-running its menu action ('score' has no plain nav item).
  show(view) { navigateTo(view); },
  // Render the TV display in this page (a real TV device opens the ?view=tv link).
  renderTv() { renderTvDisplay(); },

  // --- Bulk setup without the Setup/Registration UI ------------------------------
  // entries: [{name, format, court, entrants:[{name,dojo,seed,status}]}, {team:true, format, tournament, teams, court}]
  // Mirrors what Setup + Registration + Generate do; used by the golden engine test.
  configure(entries) {
    const divs = entries.filter(d => !d.team), team = entries.find(d => d.team);
    state.divisions = divs.map(d => d.name);
    state.divisionTypes = Object.fromEntries(divs.map(d => [d.name, d.format]));
    state.divisionCourts = Object.fromEntries(divs.map(d => [d.name, d.court]));
    state.competitors = divs.flatMap(d => d.entrants.map(e => ({...e, division: d.name})));
    state.teams = []; state.exhibitions = [];
    teamEnabled.value = team ? 'Enabled' : 'Disabled';
    if (team) {
      teamFormat.value = team.format; teamTournamentFormat.value = team.tournament;
      state.divisionCourts['Team Tournament'] = team.court;
      const slots = team.format === '5-Person Team' ? ['senpo','jiho','chuken','fukusho','taisho'] : ['senpo','chuken','taisho'];
      state.teams = Array.from({length: team.teams}, (_, i) => {
        const code = String.fromCharCode(65 + i);
        return {team: `Team ${code}`, type: team.format, status: 'Checked', ...Object.fromEntries(slots.map((s, j) => [s, `T${code}${j + 1}`]))};
      });
    }
    generatePools({validated: true});
  },

  // --- Engine snapshots ------------------------------------------------------------
  matchSummary(m) {
    return m ? ({
      pool: m.pool || null, position: m.position || null, node: m.elimNodeId || m.champNodeId || null,
      court: m.court || null, white: m.white || '', red: m.red || '',
      teams: m.teamWhite || m.teamRed ? `${m.teamWhite || ''} v ${m.teamRed || ''}` : null, type: m.type || null,
      championship: !!m.championship, singleElim: !!m.singleElim, tiebreak: !!m.tiebreak,
      done: !!m.done, wp: m.wp || [], rp: m.rp || [],
      winner: m.done ? (winnerOf(m) || null) : null,
    }) : null;
  },
  structure() {
    const summary = m => KSMTest.matchSummary(m);
    return Object.fromEntries(Object.keys(state.allMatches).filter(div => (state.allMatches[div] || []).length).map(div => [div, {
      pools: (state.pools[div] || []).map(p => ({label: p.label, players: (p.players || []).map(x => x.name)})),
      matches: (state.allMatches[div] || []).map(summary),
    }]));
  },
  finalState() {
    const summary = m => KSMTest.matchSummary(m);
    return Object.fromEntries(Object.keys(state.allMatches).filter(div => (state.allMatches[div] || []).length).map(div => [div, {
      complete: divisionComplete(div),
      matches: (state.allMatches[div] || []).map(summary),
      standings: isTeamDivision(div)
        ? (isTeamRoundRobinDivision(div) ? {team: teamStandings(div).map(r => ({name: r.name, wins: r.wins, pts: r.pts}))} : {})
        : Object.fromEntries((state.pools[div] || []).map(p => [p.label,
            poolStandings(p.label, div).map(r => ({name: r.name, wins: r.wins, pts: r.pts}))])),
      placements: resultPlacements(div).map(r => ({place: r.place, name: r.name})),
    }]));
  },
  standings(div) {
    return Object.fromEntries((state.pools[div] || []).map(p => [p.label, poolStandings(p.label, div).map(r => ({name: r.name, wins: r.wins, pts: r.pts}))]));
  },

  // --- Scorekeeper shortcuts (engine-level, no clicks) ----------------------------
  // Open `court` like the Courts menu does; if it has nothing to play in its current
  // division, move it to the next division with a ready match (the app has no
  // auto-advance yet). Returns the live match object or null when the court is done.
  prepareCourt(court) {
    chooseCourt(court);
    let m = state.matches[state.current];
    if (!individualMatchReady(m) || !matchBelongsToCourt(m, court)) {
      const cs = findNextForCourt(court, null, 0);
      if (!cs || cs.index >= (state.allMatches[cs.division] || []).length) return null;
      applyCourtState(court, cs, true); rememberLocalCourtDivision(court, cs.division); renderScore();
      m = state.matches[state.current];
      if (!individualMatchReady(m)) return null;
    }
    return m;
  },
  mustWin(m) { return matchRequiresWinner(m) || m.singleElim || m.championship || m.tiebreak; },
  // pts: [['W','M'], ['R','K'], ...] — what the point buttons call, then Next Match.
  play(pts) {
    pts.forEach(([side, letter]) => point(side, letter));
    nextMatch();
  },
};
