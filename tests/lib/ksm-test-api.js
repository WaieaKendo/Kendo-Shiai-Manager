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
  // Instrument browser capabilities without replacing the timer or its epoch clock.
  installTimerProbes() {
    const probe = window.__ksmTimerProbe = {requests:0,releases:0,buzzers:0,sounds:[],lock:null};
    Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{
      probe.requests++;
      const lock={released:false,release:async()=>{lock.released=true;probe.releases++}};
      probe.lock=lock;return lock;
    }}});
    const originalFetch=window.fetch;
    window.fetch=(...args)=>{const url=String(args[0]);if(url.includes('/assets/sounds/'))probe.sounds.push(url);return originalFetch(...args)};
    const NativeAudio=window.AudioContext;
    window.AudioContext=class extends NativeAudio {
      createBufferSource(){const oscillator=super.createBufferSource(),start=oscillator.start.bind(oscillator);
        oscillator.start=(...args)=>{probe.buzzers++;return start(...args)};return oscillator;}
    };
  },
  timerProbes() { const p=window.__ksmTimerProbe;return {requests:p.requests,releases:p.releases,buzzers:p.buzzers,sounds:p.sounds}; },
  async timerVisibility(visible) {
    if(!visible)await window.__ksmTimerProbe.lock?.release();
    Object.defineProperty(document,'visibilityState',{configurable:true,value:visible?'visible':'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  },
  timerStorage() { return Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('ksm:match-timer:')).map(k=>[k,JSON.parse(localStorage.getItem(k))])); },
  booted() { return window.ksmBootstrapReady === true && typeof state === 'object' && typeof cloudSession === 'object'; },

  // --- Cloud / sync status -----------------------------------------------------
  tournamentId() { return cloudSession.tournamentId || null; },
  revision() { return Number(cloudSession.revision) || 0; },
  role() { return ksmSessionRole; },
  // What the device keeps for its staff session and sends as x-ksm-session-key (a session token
  // after Staff Login; issue #9).
  staffSession() { return sessionKey(); },
  pending() { return localChangesPending(); },
  // Why pending() is true (what wait_idle reports when it times out): each thing that keeps the
  // device "unsaved", plus the last save attempt as the cloud diagnostics recorded it.
  pendingReason() {
    const d = readCloudDiagnosticsState(), socket = typeof ksmCloudSocket === 'object' && ksmCloudSocket;
    return {
      pending: localChangesPending(),
      mutationVersion: ksmLocalMutationVersion, confirmedVersion: ksmConfirmedMutationVersion,
      autosaveTimer: !!ksmSaveTimer, cloudSaveTimer: !!ksmCloudTimer, saveInFlight: ksmCloudSaveInFlight,
      queuedSave: ksmCloudSavePending ? {reason: ksmCloudSavePending.reason, force: !!ksmCloudSavePending.force} : null,
      outbox: KSMTest.outbox(), applyingRemote: ksmApplyingRemoteSnapshot,
      role: ksmSessionRole, revision: KSMTest.revision(), online: navigator.onLine,
      socket: socket ? ['connecting', 'open', 'closing', 'closed'][socket.readyState] : 'none',
      saveStatus: ksmSaveStatusMode,
      lastSave: {attemptId: d.attemptId, stage: d.stage, at: d.lastAttemptAt, httpStatus: d.httpStatus,
                 error: d.errorMessage || '', body: String(d.errorBody || '').slice(0, 200), lastSuccessAt: d.lastSuccessAt, serverRevision: d.serverRevision},
      now: new Date().toISOString(),
    };
  },
  diagnostics() { return readCloudDiagnosticsState(); },
  // Snapshot queued for the cloud (offline, failed save, reload before a save): who queued it, for which tournament.
  outbox() { const o = readOutbox(); return o ? {tournamentId: o.tournamentId, role: o.role, baseRevision: o.baseRevision, reason: o.actions?.[0]?.reason || ''} : null; },
  manualSave() { return saveNow(); },
  autosavePayload() { return JSON.parse(localStorage.getItem(KSM_SAVE_KEY)||'null'); },
  autosaveOrigin() { return localStorage.getItem(KSM_AUTOSAVE_CLOUD_ID); },
  legacyFixture(cloud) {
    return {saveKey:KSM_SAVE_KEY, originKey:KSM_AUTOSAVE_CLOUD_ID,
      sessionKey:KSM_CLOUD_SESSION_KEY,payload:tournamentPayload(),storage:{...localStorage},
      session:cloud?{...cloudSession}: {}};
  },
  seedLegacy(fixture) {
    Object.entries(fixture.storage).forEach(([key,value])=>localStorage.setItem(key,value));
    localStorage.setItem(fixture.saveKey,JSON.stringify(fixture.payload));
    localStorage.removeItem(fixture.originKey);
    localStorage.setItem(fixture.sessionKey,JSON.stringify(fixture.session));
    window.__originWrites=[];
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(this===localStorage&&key===fixture.originKey)window.__originWrites.push(String(value));
      return set.call(this,key,value);
    };
  },
  originWrites() { return window.__originWrites || []; },
  hasAutosave() { return !!localStorage.getItem(KSM_SAVE_KEY); },
  // Deliver a record as if it arrived on the live socket; returns whether it was applied.
  receive(record) { return applyRemoteCloudRecord(record, false, false); },
  // This device's tournament as it would be saved (a copy: change it and hand it to applyLiveUpdate).
  payload() { return tournamentPayload(); },
  // Apply a tournament copy the way an applied live update does (applyRemoteCloudRecord(); also a
  // 409 rebase, the cloud copy loaded, Staff Login with queued work): the state is replaced and
  // every screen redrawn, without the staff device's while-editing deferral.
  applyLiveUpdate(payload) {
    ksmApplyingRemoteSnapshot = true;
    try { applyTournamentPayload(payload, false, {source: 'live sync'}); } finally { ksmApplyingRemoteSnapshot = false; }
  },
  clientId() { return cloudSession.clientId; },
  // Count the save conflicts this device meets (HTTP 409 answers to its saves, each followed by
  // a rebase); conflicts() returns the total since watchConflicts().
  watchConflicts() {
    if (window.__ksmTestConflicts) return;
    window.__ksmTestConflicts = {count: 0};
    const orig = window.fetch;
    window.fetch = async function (...args) {
      const response = await orig.apply(this, args);
      if (response.status === 409) window.__ksmTestConflicts.count++;
      return response;
    };
  },
  conflicts() { return window.__ksmTestConflicts?.count || 0; },
  generated() { return !!state.generated && Object.keys(state.allMatches || {}).length > 0; },
  allMatches() { return state.allMatches; },
  pools() { return state.pools; },
  saveNow(label) { criticalAutoSave(label); },
  // Count the saves this device asks for (every scheduleAutoSave()/criticalAutoSave(), also from the
  // document-wide input/change/click listeners, which look them up at call time); savesAsked()
  // returns how many since the last call.
  watchSaves() {
    if (window.__ksmTestSaves) return;
    window.__ksmTestSaves = {count: 0};
    ['scheduleAutoSave', 'criticalAutoSave'].forEach(f => {
      const orig = window[f];
      window[f] = function (...args) { window.__ksmTestSaves.count++; return orig.apply(this, args); };
    });
  },
  savesAsked() { const n = window.__ksmTestSaves?.count || 0; if (window.__ksmTestSaves) window.__ksmTestSaves.count = 0; return n; },
  // Test-only realtime controls. The ping reply is a barrier: all earlier messages on this
  // socket have been handled by the worker before the promise resolves.
  socketBarrier(timeoutMs = 5000) {
    const socket = typeof ksmCloudSocket === 'object' && ksmCloudSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = setTimeout(() => finish(false), timeoutMs);
      const finish = result => {
        clearTimeout(timer);
        socket.removeEventListener('message', done);
        resolve(result);
      };
      const done = event => {
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        if (message.type !== 'pong') return;
        finish(true);
      };
      socket.addEventListener('message', done);
      socket.send('ping');
    });
  },
  sendSocketMessage(message) {
    const socket = typeof ksmCloudSocket === 'object' && ksmCloudSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  },
  timerMounted() {
    const timer = document.querySelector('[data-testid=match-timer]');
    // Role changes hide the existing court tree before its next render; spectators must see no timer.
    const input = window.ksmMatchTimerInput?.();
    if (!input) return !timer;  // not merely hidden: the island unmounts on its next render (<= 250 ms)
    if (!timer) return false;
    // Same mode and the same tied/untied reading as the court, not just "a timer exists".
    const tv = timer.querySelector('[data-testid=timer-show-tv]');
    return !!timer.querySelector('[data-testid=timer-display]') === input.enabled && (!tv || tv.title.includes('not tied') === !input.tied);
  },
  sendTieFlash() { ksmSendTieFlash(); },
  dispatchTieFlash(message) {
    window.dispatchEvent(new CustomEvent('ksm:tie-flash', {detail: message}));
  },
  disconnectSocket() { disconnectCloudSocket(); },
  // Show a screen without re-running its menu action ('score' has no plain nav item).
  show(view) { navigateTo(view); },
  // Owner decision 20: this device's test tools (the sample-data buttons) on or off.
  testTools(on) { ksmSetTestTools(!!on); },
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
      // The Setup select too: saveSetup() and synced setup snapshots read the team court from it.
      teamCourt.value = team.court; state.divisionCourts['Team Tournament'] = team.court;
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

// Every toast the device showed, in order. A toast is transient (it fades after a few seconds and
// the next one replaces its text), so a test that polls the element can miss one on a slow
// machine; this keeps the history for KsmApp.wait_toast().
(function recordToasts() {
  const seen = [];
  let last = null;
  const read = () => {
    const el = document.getElementById('ksmToast');
    const text = el ? el.textContent : null;
    if (text && text !== last) { seen.push(text); last = text; }
  };
  new MutationObserver(read).observe(document, {subtree: true, childList: true, characterData: true});
  window.KSMTest.toasts = () => { read(); return seen.slice(); };
})();
