// Conflict (HTTP 409) rebase keeps director/staff edits that are not court actions (F4).
//
// Runs the app's performCloudSave + rebaseLocalPayloadOnRecord in a vm against a stubbed
// server that answers 409 with a newer record, then checks what the retried save sends:
//   * Setup fields and registration/division/award edits are merged three-way against the
//     cloud copy the local edit started from: the local value is kept when only this device
//     changed it; when both sides changed the same field the server's value is kept and a
//     conflict notice is shown (toast + diagnostics);
//   * repeated conflicts use the previous server record as the base (no false conflicts);
//   * without a known base the server copy wins, as before;
//   * F10 (fixed): a local structural edit (pool edit, regenerate) is replayed onto the server
//     copy when the server did not change the same divisions (its registration half merges
//     too); when it did, the director is asked: OK re-applies the edit over the other device's
//     version, Cancel keeps that version with a notice (and drops the whole edit); a base
//     without the structure keeps the server copy, with a notice;
//   * F32 (fixed): the registration entries of a replayed division are saved with its structure
//     (this device's), the other divisions' entries merge three-way; when the other device changed
//     a replayed division's entries the director is asked, as for F10. No orphaned matches. Teams
//     (no division field) belong to 'Team Tournament'.
import vm from 'node:vm';
import { extractFunction, withDependencies, html } from './lib/ksm-source.mjs';

let failed = false;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; };
const clone = v => JSON.parse(JSON.stringify(v));

const code = [
  "const KSM_LOCAL_VIEW_STATE_KEYS=new Set(['currentCourt','publicCourt','currentDivision','matches','current','score']);",
  "function normalizeCourt(value){return String(value||'').toUpperCase()==='B'?'B':'A'}",
  "function cloneJson(value){return JSON.parse(JSON.stringify(value))}",
  extractFunction(html, 'rememberCloudBase'),
  extractFunction(html, 'rebaseLocalPayloadOnRecord'),
  extractFunction(html, 'performCloudSave'),
].join('\n');

const setup = over => ({ tName: 'Spring Cup', tHost: 'Dojo', tLocation: 'Hall', court1Refs: '', ...over });
const baseState = over => ({
  divisions: ['Open', 'Kids'], divisionTypes: { Open: 'Round Robin', Kids: 'Round Robin' }, divisionCourts: { Open: 'A', Kids: 'B' },
  competitors: [{ name: 'P 1', division: 'Open', status: 'Checked' }, { name: 'P 2', division: 'Open', status: 'Checked' }],
  teams: [], exhibitions: [], awards: [], teamAwardMode: 'top2', managementRevision: 1,
  pools: { Open: [{ label: 'A', players: ['P 1', 'P 2'] }] },
  allMatches: { Open: [{ division: 'Open', type: 'individual', pool: 'A', white: 'P 1', red: 'P 2', wp: [], rp: [], done: false }] },
  courtState: { A: { division: 'Open', index: 0 }, B: { division: null, index: 0 } },
  courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] }, ...over,
});
const payload = (setupOver = {}, stateOver = {}) => ({ schemaVersion: '1.1', setup: setup(setupOver), state: baseState(stateOver) });

// Runs one save of `local` (built on revision 10 = `base`) against servers answering with `conflicts` (409 records) first.
function run({ base, local, conflicts, rememberBase = true, confirmAnswer = null, baseOverride = null }) {
  const toasts = [], diagnostics = [], sent = [], confirms = [];
  let call = 0;
  const context = {
    console, Blob,
    cloudSession: { tournamentId: 't1', revision: 10, updatedAt: null, clientId: 'director', court: 'A' },
    state: { currentCourt: 'A' },
    pinnedCourt: () => 'A',
    cloudEnvelope: p => ({ tournamentId: 't1', payload: p }),
    cloudHeaders: () => ({}),
    analyzeTournamentSnapshot: () => ({ totalBytes: 1 }),
    writeCloudDiagnosticsState: d => { diagnostics.push(d); return d; },
    showKsmToast: (message, duration, isError) => toasts.push({ message, isError }),
    // F10's question; a test that does not expect it fails on it.
    confirm: message => { confirms.push(message); if (confirmAnswer === null) throw new Error(`unexpected confirm: ${message}`); return confirmAnswer; },
    v316StaffPassword: () => 'pw', promptNewStaffPassword: () => 'pw', sessionStorage: { setItem() {}, removeItem() {} },
    setSessionRole() {}, persistCloudSession() {}, rememberTournament() {}, clearOutbox() {},
    setConnectionStatus() {}, renderPersistentSaveStatus() {}, connectCloudSocket() {},
    // Engine clean-ups run by the rebase: not under test here.
    sanitizeLoadedTournamentState() {}, normalizeAllIndividualPoolTiebreakOrder() {}, repairCompletedMatchResults() {},
    ksmCloudAttemptCounter: 0, ksmLastSuccessfulSaveAt: null, ksmSaveStatusMode: 'idle', ksmCloudSocket: {},
    fetch: async (_url, opts) => {
      const body = JSON.parse(opts.body); sent.push(body);
      if (call < conflicts.length) {
        const record = { tournamentId: 't1', revision: 11 + call, updatedAt: 'x', payload: conflicts[call] };
        call++;
        return { status: 409, ok: false, text: async () => JSON.stringify({ error: 'Revision conflict', record }) };
      }
      return { status: 200, ok: true, text: async () => JSON.stringify({ tournamentId: 't1', revision: 20, updatedAt: 'y', payload: body.payload }) };
    },
  };
  Object.assign(context,{ksmTournamentEpoch:0,ksmPendingSlug:''});
vm.createContext(context);
  vm.runInContext(withDependencies(html, code, { exclude: Object.keys(context) }), context);
  if (rememberBase) context.rememberCloudBase({ revision: 10, payload: base });
  if (baseOverride) { context.oldBase = baseOverride; vm.runInContext('KSM_CLOUD_BASE.payload = oldBase', context); }
  return context.performCloudSave(local, 10).then(saved => ({ saved: saved.payload, toasts, diagnostics, sent, confirms }));
}

const base = payload();

// Director renames the tournament while a court scores (court save = server revision 11).
{
  const server = payload({}, {});
  server.state.allMatches.Open[0].rp = ['K'];
  const { saved, toasts } = await run({ base, local: payload({ tName: 'Renamed Cup' }), conflicts: [server] });
  check(saved.setup.tName === 'Renamed Cup', 'Setup rename made during court scoring survives the conflict');
  check(saved.state.allMatches.Open[0].rp.join('') === 'K', 'the court point from the server is kept');
  check(toasts.length === 0, 'no conflict notice when only this device changed the field');
}

// Unrelated fields on both sides.
{
  const { saved, toasts } = await run({ base, local: payload({ tHost: 'Director Host' }), conflicts: [payload({ tLocation: 'Other Hall' })] });
  check(saved.setup.tHost === 'Director Host' && saved.setup.tLocation === 'Other Hall', 'unrelated Setup fields changed on both sides both survive');
  check(toasts.length === 0, 'no conflict notice for unrelated fields');
}

// The same field on both sides.
{
  const { saved, toasts, diagnostics } = await run({ base, local: payload({ tName: 'Director Cup', tHost: 'Director Host' }), conflicts: [payload({ tName: 'Desk Cup' })] });
  check(saved.setup.tName === 'Desk Cup', 'same field changed on both sides: the server value is kept');
  check(saved.setup.tHost === 'Director Host', 'the other local field still survives');
  check(toasts.length === 1 && toasts[0].message.includes('Tournament name') && toasts[0].isError, `a conflict notice names the field: ${JSON.stringify(toasts)}`);
  check(diagnostics.some(d => (d.mergeConflicts || []).includes('Tournament name')), 'the conflict is recorded in diagnostics');
}

// Registration, division settings and awards.
{
  const local = payload({}, {
    competitors: [{ name: 'P 1', division: 'Open', status: 'Checked' }, { name: 'P 2', division: 'Open', status: 'NoShow' }],
    divisionTypes: { Open: 'Round Robin', Kids: 'Single Elimination' },
    awards: [{ award: 'Fighting Spirit', name: 'P 1', dojo: 'Dojo' }],
  });
  const server = payload({}, { divisionTypes: { Open: 'Pools', Kids: 'Round Robin' } });
  server.state.allMatches.Open[0].wp = ['M'];
  const { saved, toasts } = await run({ base, local, conflicts: [server] });
  check(saved.state.competitors[1].status === 'NoShow', 'a registration edit survives the conflict');
  check(saved.state.awards.length === 1 && saved.state.awards[0].award === 'Fighting Spirit', 'an awards edit survives the conflict');
  check(saved.state.divisionTypes.Kids === 'Single Elimination' && saved.state.divisionTypes.Open === 'Pools', 'division formats merge per division');
  check(saved.state.allMatches.Open[0].wp.join('') === 'M', 'court result kept next to the registration edit');
  check(toasts.length === 0, 'no conflict notice');
  const both = await run({ base, local, conflicts: [payload({}, { competitors: [{ name: 'P 1', division: 'Open', status: 'NoShow' }, { name: 'P 2', division: 'Open', status: 'Checked' }] })] });
  check(both.saved.state.competitors[0].status === 'NoShow' && both.saved.state.competitors[1].status === 'Checked', 'registration changed on both sides: the server list is kept');
  check(both.toasts.length === 1 && both.toasts[0].message.includes('Registration'), 'and the conflict is reported');
}

// Two conflicts in a row: the second rebase uses the first server record as its base.
{
  const { saved, toasts, sent } = await run({ base, local: payload({ tName: 'Renamed Cup' }), conflicts: [payload({ tHost: 'Host 1' }), payload({ tHost: 'Host 2' })] });
  check(sent.map(b => b.revision).join(',') === '10,11,12', `retried at revisions ${sent.map(b => b.revision).join(',')}`);
  check(saved.setup.tName === 'Renamed Cup' && saved.setup.tHost === 'Host 2', 'repeated conflicts keep the local edit and the newest server value');
  check(toasts.length === 0, 'no false conflict notice across repeated conflicts');
}

// No known base (e.g. an outbox written by an older version): the server copy wins, as before.
{
  const { saved, toasts } = await run({ base, local: payload({ tName: 'Renamed Cup' }), conflicts: [payload()], rememberBase: false });
  check(saved.setup.tName === 'Spring Cup' && toasts.length === 0, 'without a base the server copy is kept unchanged');
}

// F10 (fixed): a structural edit (Edit Pool, regenerate) racing another save is kept.
// The base and server copies here have a second division, Kids, with its own pool and match.
const kidsMatch = (white, red) => ({ division: 'Kids', type: 'individual', pool: 'A', white, red, wp: [], rp: [], done: false });
const withKids = (p, players = ['K 1', 'K 2']) => {
  p.state.pools.Kids = [{ label: 'A', players }];
  p.state.allMatches.Kids = [kidsMatch(players[0], players[1])];
  return p;
};
const structuralBase = withKids(payload());
// The director's structural edit: Kids' pool redone (players swapped, the match rebuilt), plus a registration edit in the same save.
const kidsEdit = () => withKids(payload({ tHost: 'Director Host' }, {
  managementRevision: 2,
  competitors: [{ name: 'P 1', division: 'Open', status: 'Checked' }, { name: 'P 2', division: 'Open', status: 'NoShow' }],
}), ['K 2', 'K 1']);
// The director's structural edit of Open, the division a court is playing.
const openEdit = () => withKids(payload({}, {
  managementRevision: 2,
  pools: { Open: [{ label: 'A', players: ['P 2', 'P 1'] }] },
  allMatches: { Open: [{ division: 'Open', type: 'individual', pool: 'A', white: 'P 2', red: 'P 1', wp: [], rp: [], done: false }] },
  competitors: [{ name: 'P 1', division: 'Open', status: 'Checked' }, { name: 'P 2', division: 'Open', status: 'NoShow' }],
}));
const courtPlayedOpen = () => {
  const server = withKids(payload());
  Object.assign(server.state.allMatches.Open[0], { wp: ['M'], rp: ['K'], done: true });
  return server;
};

// The server copy changed another division only: the edit is replayed, no question asked.
{
  const { saved, toasts, confirms, diagnostics } = await run({ base: structuralBase, local: kidsEdit(), conflicts: [courtPlayedOpen()] });
  check(saved.state.pools.Kids[0].players.join() === 'K 2,K 1' && saved.state.allMatches.Kids[0].white === 'K 2',
    'F10: a structural edit racing a court save in another division is replayed (Kids pools and matches kept)');
  check(saved.state.allMatches.Open[0].done === true && saved.state.allMatches.Open[0].rp.join('') === 'K', 'the court result in the other division is kept');
  check(saved.state.managementRevision === 2, `managementRevision moves on (${saved.state.managementRevision})`);
  check(saved.state.competitors[1].status === 'NoShow' && saved.setup.tHost === 'Director Host', 'registration and Setup edits in the same save merge too');
  check(confirms.length === 0 && toasts.length === 0, `no question or notice: ${JSON.stringify({ confirms, toasts })}`);
  check(diagnostics.some(d => d.stage === 'Structural edit replayed' && d.structuralReplay.includes('Kids')), 'the replay is recorded in diagnostics');
}

// A regenerate that removed a division: the removal is replayed too.
{
  const local = payload({}, { managementRevision: 2 });
  const { saved } = await run({ base: structuralBase, local, conflicts: [courtPlayedOpen()] });
  check(!('Kids' in saved.state.allMatches) && !('Kids' in saved.state.pools), 'a division removed by the structural edit stays removed');
  check(saved.state.allMatches.Open[0].done === true, 'and the court result in the untouched division is kept');
}

// The server copy changed the same division (a court played in it): the director is asked.
{
  const { saved, toasts, confirms } = await run({ base: structuralBase, local: openEdit(), conflicts: [courtPlayedOpen()], confirmAnswer: false });
  check(confirms.length === 1 && confirms[0].startsWith('Re-apply your change to Open?') && confirms[0].includes('1 match result'),
    `F10: a conflicting structural edit asks whether to re-apply it: ${JSON.stringify(confirms)}`);
  check(saved.state.pools.Open[0].players[0] === 'P 1' && saved.state.allMatches.Open[0].done === true && saved.state.managementRevision === 1,
    'Cancel: the other device\'s version of Open is kept');
  check(saved.state.competitors[1].status === 'Checked', 'Cancel: the registration half of the dropped edit is not merged (the edit stays whole)');
  check(toasts.length === 1 && toasts[0].isError && toasts[0].message.includes('Open') && toasts[0].message.includes('not saved'),
    `Cancel: a notice says the change was not saved: ${JSON.stringify(toasts)}`);
}
{
  const { saved, confirms } = await run({ base: structuralBase, local: openEdit(), conflicts: [courtPlayedOpen()], confirmAnswer: true });
  check(confirms.length === 1, 'OK: asked once');
  check(saved.state.pools.Open[0].players[0] === 'P 2' && saved.state.allMatches.Open[0].white === 'P 2' && saved.state.allMatches.Open[0].done === false,
    'OK: the director\'s Open replaces the other device\'s version (its result is deleted, as the question says)');
  check(saved.state.competitors[1].status === 'NoShow' && saved.state.managementRevision === 2, 'OK: the registration half merges and managementRevision moves on');
  check(saved.state.pools.Kids[0].players.join() === 'K 1,K 2', 'OK: other divisions keep the server copy');
}

// A merge base without the structure (an outbox queued by an older version): the server copy is kept, with a notice.
{
  const oldBase = { setup: clone(structuralBase.setup), state: { competitors: clone(structuralBase.state.competitors), managementRevision: 1 } };
  const { saved, toasts, confirms } = await run({ base: structuralBase, local: kidsEdit(), conflicts: [courtPlayedOpen()], baseOverride: oldBase });
  check(saved.state.pools.Kids[0].players.join() === 'K 1,K 2' && confirms.length === 0, 'no structure in the base: the server copy is kept');
  check(toasts.length === 1 && toasts[0].message.includes('not saved'), `and the director is told: ${JSON.stringify(toasts)}`);
}

// F32 (found in external PR review): a structural edit and the registration change it was built from are
// saved together. The director adds K 3 to Kids and regenerates Kids; another device edits a
// player's dojo at the same time. The saved tournament never has matches for a player its
// registration does not list.
{
  const kidsPlayers = [{ name: 'K 1', dojo: 'Kids Dojo', division: 'Kids', status: 'Checked' }, { name: 'K 2', dojo: 'Kids Dojo', division: 'Kids', status: 'Checked' }];
  const regBase = () => { const p = withKids(payload()); p.state.competitors = p.state.competitors.map(c => ({ ...c, dojo: 'Dojo' })).concat(clone(kidsPlayers)); return p; };
  const addK3 = () => {
    const p = regBase();
    p.state.managementRevision = 2;
    p.state.competitors.push({ name: 'K 3', dojo: 'New Dojo', division: 'Kids', status: 'Checked' });
    p.state.pools.Kids = [{ label: 'A', players: ['K 1', 'K 2', 'K 3'] }];
    p.state.allMatches.Kids = [kidsMatch('K 1', 'K 2'), kidsMatch('K 2', 'K 3'), kidsMatch('K 1', 'K 3')];
    return p;
  };
  const dojoEdit = name => { const p = regBase(); p.state.competitors.find(c => c.name === name).dojo = 'Edited Dojo'; return p; };
  const orphans = st => Object.values(st.allMatches || {}).flat().flatMap(m => [m.white, m.red])
    .filter(n => n && !(st.competitors || []).some(c => c.name === n));
  const hasK3 = st => (st.competitors || []).some(c => c.name === 'K 3' && c.division === 'Kids');

  // Another division's player edited: both changes are kept, no question (the replayed division's entries are this device's).
  const other = await run({ base: regBase(), local: addK3(), conflicts: [dojoEdit('P 1')] });
  check(orphans(other.saved.state).length === 0, `F32: no match references a player missing from registration: ${JSON.stringify(orphans(other.saved.state))}`);
  check(hasK3(other.saved.state) && other.saved.state.allMatches.Kids.length === 3, 'F32: the added player and the regenerated Kids are both saved');
  check(other.saved.state.competitors.find(c => c.name === 'P 1').dojo === 'Edited Dojo', 'F32: the other device\'s dojo edit in Open is kept too');
  check(other.saved.state.competitors.length === 5 && other.confirms.length === 0 && other.toasts.length === 0,
    `F32: one entry per player, no question or notice: ${JSON.stringify({ n: other.saved.state.competitors.length, confirms: other.confirms, toasts: other.toasts })}`);

  // A player of the regenerated division edited on the other device: the director is asked.
  const cancel = await run({ base: regBase(), local: addK3(), conflicts: [dojoEdit('K 1')], confirmAnswer: false });
  check(cancel.confirms.length === 1 && cancel.confirms[0].startsWith('Re-apply your change to Kids?'),
    `F32: the other device changed a Kids player: the director is asked: ${JSON.stringify(cancel.confirms)}`);
  check(orphans(cancel.saved.state).length === 0 && !hasK3(cancel.saved.state) && cancel.saved.state.allMatches.Kids.length === 1,
    'F32 Cancel: neither the added player nor the regenerated Kids is saved');
  check(cancel.saved.state.competitors.find(c => c.name === 'K 1').dojo === 'Edited Dojo' && cancel.saved.state.managementRevision === 1,
    'F32 Cancel: the other device\'s registration and structure are kept');
  check(cancel.toasts.length === 1 && cancel.toasts[0].message.includes('Kids') && cancel.toasts[0].message.includes('not saved'), `F32 Cancel: the notice: ${JSON.stringify(cancel.toasts)}`);

  const ok = await run({ base: regBase(), local: addK3(), conflicts: [dojoEdit('K 1')], confirmAnswer: true });
  check(ok.confirms.length === 1, 'F32 OK: asked once');
  check(orphans(ok.saved.state).length === 0 && hasK3(ok.saved.state) && ok.saved.state.allMatches.Kids.length === 3 && ok.saved.state.managementRevision === 2,
    'F32 OK: the added player and the regenerated Kids are saved together');
  check(ok.saved.state.competitors.find(c => c.name === 'K 1').dojo === 'Kids Dojo' && ok.saved.state.competitors.length === 5,
    'F32 OK: this device\'s Kids registration replaces the other device\'s change there, as the question says');

  // Both devices changed Open's entries too (outside the replayed division): Open keeps the server's, with the F29 notice.
  const both = addK3(); both.state.competitors.find(c => c.name === 'P 2').status = 'NoShow';
  const outside = await run({ base: regBase(), local: both, conflicts: [dojoEdit('P 1')] });
  check(orphans(outside.saved.state).length === 0 && hasK3(outside.saved.state), 'F32: Kids saved whole when Open also conflicts');
  check(outside.saved.state.competitors.find(c => c.name === 'P 1').dojo === 'Edited Dojo' && outside.saved.state.competitors.find(c => c.name === 'P 2').status === 'Checked',
    'F32: Open\'s entries: the server\'s version');
  check(outside.toasts.length === 1 && outside.toasts[0].message.includes('Registration'), `F32: and the Registration conflict is reported: ${JSON.stringify(outside.toasts)}`);
}

// F32 for teams (found in the second external review): teams have no division field (sample-loaded
// teams, as the engine reads them all for the team event), so they belong to 'Team Tournament'. The
// director renames a team and regenerates the team event while another device edits a team member:
// the saved tournament never has team matches for a team its registration does not list.
{
  const T = 'Team Tournament';
  const team = (name, senpo) => ({ team: name, senpo, chuken: 'C', taisho: 'T', status: 'Checked' });
  const teamMatch = (w, r) => ({ division: T, type: 'team', teamWhite: w, teamRed: r, bouts: [], done: false });
  const teamBase = () => {
    const p = payload();
    p.state.teams = [team('Aiea A', 'Sato'), team('Waipahu A', 'Kato')];
    p.state.teamPools = { [T]: [{ label: 'A', players: [{ name: 'Aiea A' }, { name: 'Waipahu A' }] }] };
    p.state.allMatches[T] = [teamMatch('Aiea A', 'Waipahu A')];
    return p;
  };
  const renamed = () => {
    const p = teamBase();
    p.state.managementRevision = 2;
    p.state.teams[0].team = 'Aiea B';
    p.state.teamPools[T] = [{ label: 'A', players: [{ name: 'Aiea B' }, { name: 'Waipahu A' }] }];
    p.state.allMatches[T] = [teamMatch('Aiea B', 'Waipahu A')];
    return p;
  };
  const memberEdit = () => { const p = teamBase(); p.state.teams[1].senpo = 'Edited'; return p; };
  const teamOrphans = st => (st.allMatches?.[T] || []).flatMap(m => [m.teamWhite, m.teamRed])
    .filter(n => n && !(st.teams || []).some(t => t.team === n));

  const cancel = await run({ base: teamBase(), local: renamed(), conflicts: [memberEdit()], confirmAnswer: false });
  check(cancel.confirms.length === 1 && cancel.confirms[0].startsWith(`Re-apply your change to ${T}?`),
    `F32 teams: a team member edited on the other device: the director is asked: ${JSON.stringify(cancel.confirms)}`);
  check(teamOrphans(cancel.saved.state).length === 0 && cancel.saved.state.teams.some(t => t.team === 'Aiea A') && cancel.saved.state.teams[1].senpo === 'Edited',
    `F32 teams Cancel: the old name and the other device's edit, with matching team matches: ${JSON.stringify({ orphans: teamOrphans(cancel.saved.state), teams: cancel.saved.state.teams.map(t => t.team) })}`);

  const ok = await run({ base: teamBase(), local: renamed(), conflicts: [memberEdit()], confirmAnswer: true });
  check(teamOrphans(ok.saved.state).length === 0 && ok.saved.state.teams.some(t => t.team === 'Aiea B') && ok.saved.state.allMatches[T][0].teamWhite === 'Aiea B',
    `F32 teams OK: the renamed team is saved in registration and in the matches: ${JSON.stringify({ orphans: teamOrphans(ok.saved.state), teams: ok.saved.state.teams.map(t => t.team) })}`);
}

if (failed) process.exit(1);
