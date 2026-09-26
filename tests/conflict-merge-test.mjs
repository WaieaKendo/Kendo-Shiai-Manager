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
//   * finding F10: a local structural edit (pool edit, regenerate) is still replaced by the
//     server copy. Expected failure: update this test and docs/ROADMAP.md when fixed.
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
function run({ base, local, conflicts, rememberBase = true }) {
  const toasts = [], diagnostics = [], sent = [];
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
    v316StaffPassword: () => 'pw', promptNewStaffPassword: () => 'pw', sessionStorage: { setItem() {} },
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
  vm.createContext(context);
  vm.runInContext(withDependencies(html, code, { exclude: Object.keys(context) }), context);
  if (rememberBase) context.rememberCloudBase({ revision: 10, payload: base });
  return context.performCloudSave(local, 10).then(saved => ({ saved: saved.payload, toasts, diagnostics, sent }));
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

// Finding F10: a structural edit (Edit Pool, regenerate) racing a court save is still lost.
{
  const local = payload({}, {
    managementRevision: 2,
    pools: { Open: [{ label: 'A', players: ['P 2', 'P 1'] }] },
    competitors: [{ name: 'P 1', division: 'Open', status: 'Checked' }, { name: 'P 2', division: 'Open', status: 'NoShow' }],
  });
  const server = payload();
  server.state.allMatches.Open[0].rp = ['K'];
  const { saved } = await run({ base, local, conflicts: [server] });
  check(saved.state.pools.Open[0].players[0] === 'P 1' && saved.state.managementRevision === 1 && saved.state.competitors[1].status === 'Checked',
    'F10 pinned: a local structural edit racing a court save is replaced by the server copy (if this fails, F10 is fixed: update this test and docs/ROADMAP.md)');
}

if (failed) process.exit(1);
