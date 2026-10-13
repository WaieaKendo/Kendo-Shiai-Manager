// A division rename through a save conflict (issue #25).
//
// A rename touches divisions, divisionTypes, divisionCourts and competitors, which the F4 three-way
// merge treats as separate values: merged one by one, a rename racing another device's registration
// edit was split (the division renamed, its competitors left on the old name, or the old division
// back next to the new one). The 409 rebase now replays renames whole before the merge
// (rebaseDivisionRenamesForMerge() in app/js/18-, KSMEngine.rebaseDivisionRenames()).
//
// Runs the app's performCloudSave + rebaseLocalPayloadOnRecord in a vm against a stubbed server
// that answers 409 with a newer record (as conflict-merge-test.mjs does), then checks what the
// retried save sends:
//   * this device renamed while the other edited / added competitors of that division: every
//     competitor is on the new name, both edits are kept, no notice;
//   * the other device renamed while this one edited / added competitors: the same;
//   * a rename that cannot be applied over the server copy (the draw made there, its new name
//     taken there, both devices renamed the same division) is not saved at all, with a notice;
//   * without a merge base the server copy is kept whole, with a notice for the dropped rename.
import vm from 'node:vm';
import { extractFunction, withDependencies, html } from './lib/ksm-source.mjs';

let failed = false;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; };

const code = [
  "const KSM_LOCAL_VIEW_STATE_KEYS=new Set(['currentCourt','publicCourt','currentDivision','matches','current','score']);",
  "function normalizeCourt(value){return String(value||'').toUpperCase()==='B'?'B':'A'}",
  "function cloneJson(value){return JSON.parse(JSON.stringify(value))}",
  extractFunction(html, 'rememberCloudBase'),
  extractFunction(html, 'rebaseLocalPayloadOnRecord'),
  extractFunction(html, 'performCloudSave'),
].join('\n');

const state = over => ({
  divisions: ['Kids', 'Masters'], divisionTypes: { Kids: 'Round Robin', Masters: 'Single Elimination' }, divisionCourts: { Kids: 'A', Masters: 'B' },
  competitors: [{ name: 'K 1', dojo: 'Dojo', division: 'Kids', status: 'Checked' }, { name: 'K 2', dojo: 'Dojo', division: 'Kids', status: 'Checked' },
    { name: 'M 1', dojo: 'Dojo', division: 'Masters', status: 'Checked' }],
  teams: [], exhibitions: [], awards: [], teamAwardMode: 'top2', managementRevision: 0, generated: false, divisionRenames: [],
  pools: {}, allMatches: {}, courtState: { A: { division: null, index: 0 }, B: { division: null, index: 0 } },
  courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] }, ...over,
});
const payload = over => ({ schemaVersion: '1.1', setup: { tName: 'Rename Cup' }, state: state(over) });
// The rename as the Setup row makes it (ksmRenameSetupDivision(): KSMEngine.renamedDivisionState()).
const renamed = (p, from, to, id) => {
  const out = JSON.parse(JSON.stringify(p));
  const s = out.state;
  s.divisions = s.divisions.map(d => (d === from ? to : d));
  for (const k of ['divisionTypes', 'divisionCourts']) s[k] = Object.fromEntries(Object.entries(s[k]).map(([d, v]) => [d === from ? to : d, v]));
  s.competitors = s.competitors.map(c => (c.division === from ? { ...c, division: to } : c));
  s.divisionRenames = [...s.divisionRenames, { id, from, to }];
  return out;
};
const withCompetitors = (p, f) => { const out = JSON.parse(JSON.stringify(p)); out.state.competitors = f(out.state.competitors); return out; };
// The other device's registration edit: K 1's dojo changed and a new player K 3 added to Kids.
const registrationEdit = list => [...list.map(c => (c.name === 'K 1' ? { ...c, dojo: 'New Dojo' } : c)), { name: 'K 3', dojo: 'Dojo', division: 'Kids', status: 'Checked' }];

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
    confirm: message => { throw new Error(`unexpected confirm: ${message}`); },
    v316StaffPassword: () => 'pw', promptNewStaffPassword: () => 'pw', sessionStorage: { setItem() {} },
    setSessionRole() {}, persistCloudSession() {}, rememberTournament() {}, clearOutbox() {},
    setConnectionStatus() {}, renderPersistentSaveStatus() {}, connectCloudSocket() {},
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
  return context.performCloudSave(local, 10).then(saved => ({ saved: saved.payload, toasts, diagnostics }));
}

const on = (saved, division) => saved.state.competitors.filter(c => c.division === division).map(c => c.name).sort();
const noDuplicates = saved => new Set(saved.state.divisions.map(d => d.toLowerCase())).size === saved.state.divisions.length;
const base = payload();

// This device renamed Kids while another device edited K 1 and added K 3 to Kids (saved first).
{
  const { saved, toasts } = await run({ base, local: renamed(base, 'Kids', 'Under 12', 'r1'), conflicts: [withCompetitors(base, registrationEdit)] });
  check(JSON.stringify(saved.state.divisions) === '["Under 12","Masters"]', `the rename survives the conflict, in place: ${JSON.stringify(saved.state.divisions)}`);
  check(on(saved, 'Kids').length === 0, `no competitor is left on the old name: ${JSON.stringify(on(saved, 'Kids'))}`);
  check(on(saved, 'Under 12').join() === 'K 1,K 2,K 3', `the other device's new player is on the new name: ${on(saved, 'Under 12')}`);
  check(saved.state.competitors.find(c => c.name === 'K 1').dojo === 'New Dojo', "the other device's edit is kept");
  check(saved.state.divisionTypes['Under 12'] === 'Round Robin' && saved.state.divisionCourts['Under 12'] === 'A' && !('Kids' in saved.state.divisionTypes),
    'the format and court moved with the name');
  check(noDuplicates(saved), 'no division exists twice');
  check(saved.state.divisionRenames.map(r => r.id).join() === 'r1', 'the rename is recorded once');
  check(toasts.length === 0, `no notice: ${JSON.stringify(toasts)}`);
}

// Another device renamed Kids (saved first) while this device edited K 1 and added K 3 to Kids.
{
  const server = renamed(base, 'Kids', 'Under 12', 'theirs');
  const { saved, toasts } = await run({ base, local: withCompetitors(base, registrationEdit), conflicts: [server] });
  check(JSON.stringify(saved.state.divisions) === '["Under 12","Masters"]', `the other device's rename is kept: ${JSON.stringify(saved.state.divisions)}`);
  check(on(saved, 'Kids').length === 0, `no competitor is left on the old name: ${JSON.stringify(on(saved, 'Kids'))}`);
  check(on(saved, 'Under 12').join() === 'K 1,K 2,K 3', `this device's new player moved to the new name: ${on(saved, 'Under 12')}`);
  check(saved.state.competitors.find(c => c.name === 'K 1').dojo === 'New Dojo', "this device's edit is kept");
  check(noDuplicates(saved), 'no division exists twice');
  check(toasts.length === 0, `no notice: ${JSON.stringify(toasts)}`);
}

// Both renamed different divisions, both edited registration in other divisions.
{
  const server = renamed(base, 'Masters', 'Seniors', 'theirs');
  const { saved, toasts } = await run({ base, local: renamed(base, 'Kids', 'Under 12', 'mine'), conflicts: [server] });
  check(JSON.stringify(saved.state.divisions) === '["Under 12","Seniors"]', `both renames hold: ${JSON.stringify(saved.state.divisions)}`);
  check(on(saved, 'Under 12').join() === 'K 1,K 2' && on(saved, 'Seniors').join() === 'M 1', 'every competitor follows its division');
  check(saved.state.divisionRenames.map(r => r.id).join() === 'theirs,mine', 'both renames recorded, in order');
  check(toasts.length === 0, 'no notice');
}

// A division added on this device since the last save and renamed in the same save (found by the
// e2e test: the add and the rename are one save, and it met a conflict).
{
  const added = JSON.parse(JSON.stringify(base));
  added.state.divisions.push('Masters X'); added.state.divisionTypes['Masters X'] = 'Round Robin'; added.state.divisionCourts['Masters X'] = 'A';
  const { saved, toasts } = await run({ base, local: renamed(added, 'Masters X', 'Seniors', 'r1'), conflicts: [withCompetitors(base, registrationEdit)] });
  check(JSON.stringify(saved.state.divisions) === '["Kids","Masters","Seniors"]' && saved.state.divisionTypes.Seniors === 'Round Robin' && !('Masters X' in saved.state.divisionTypes),
    `a new division renamed before its first save is saved under its new name: ${JSON.stringify(saved.state.divisions)}`);
  check(on(saved, 'Kids').join() === 'K 1,K 2,K 3', "the other device's registration edit is kept");
  check(toasts.length === 0, `no notice: ${JSON.stringify(toasts)}`);
}

// Refused: the draw was made on the other device; the new name was taken there; both renamed Kids.
for (const [label, server, reason] of [
  ['the draw was made on another device', { ...payload({ generated: true, managementRevision: 1, allMatches: { Kids: [{ division: 'Kids', white: 'K 1', red: 'K 2', wp: [], rp: [] }] } }) }, 'the draw was made on another device'],
  ['the new name was added on another device', payload({ divisions: ['Kids', 'Masters', 'under 12'], divisionTypes: { Kids: 'Round Robin', Masters: 'Single Elimination', 'under 12': 'Round Robin' } }), 'another device added a division with that name'],
  ['both renamed Kids', renamed(base, 'Kids', 'Children', 'theirs'), 'another device renamed a division with that name at the same time'],
]) {
  const { saved, toasts, diagnostics } = await run({ base, local: renamed(base, 'Kids', 'Under 12', 'mine'), conflicts: [server] });
  check(!saved.state.divisions.includes('Under 12') && on(saved, 'Under 12').length === 0 && !('Under 12' in saved.state.divisionTypes),
    `${label}: no part of the rename is saved (${JSON.stringify(saved.state.divisions)})`);
  check(JSON.stringify(saved.state.divisions) === JSON.stringify(server.state.divisions) && JSON.stringify(saved.state.competitors) === JSON.stringify(server.state.competitors),
    `${label}: the server's divisions and competitors are kept`);
  check(!saved.state.divisionRenames.some(r => r.id === 'mine'), `${label}: the refused rename is not recorded`);
  check(toasts.length === 1 && toasts[0].isError && toasts[0].message.includes('"Kids" to "Under 12" was not saved') && toasts[0].message.includes(reason),
    `${label}: a notice says so: ${JSON.stringify(toasts)}`);
  check(diagnostics.some(d => d.stage === 'Division rename conflict: server version kept'), `${label}: recorded in diagnostics`);
}

// No known base (an outbox from an older version): the server copy wins, with a notice for the rename.
{
  const { saved, toasts } = await run({ base, local: renamed(base, 'Kids', 'Under 12', 'mine'), conflicts: [withCompetitors(base, registrationEdit)], rememberBase: false });
  check(JSON.stringify(saved.state.divisions) === '["Kids","Masters"]' && on(saved, 'Kids').join() === 'K 1,K 2,K 3', 'without a base the server copy is kept whole');
  check(toasts.length === 1 && toasts[0].message.includes('"Kids" to "Under 12" was not saved'), `and the dropped rename is reported: ${JSON.stringify(toasts)}`);
}

if (failed) process.exit(1);
console.log('PASS a division rename through a save conflict: replayed whole, or not saved with a notice');
