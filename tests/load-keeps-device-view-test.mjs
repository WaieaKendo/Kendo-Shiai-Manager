// #15 PR 4 (docs/STORE.md section 2 point 4, section 3 item 4): a load keeps this device's court view.
//
// applyTournamentPayload() (app/modules/sync/cloud-realtime-save-and-load.js) puts the whole payload into `state`,
// so for a moment `state.currentDivision` / `current` / `matches` / `score` / `currentCourt` are the *saving*
// device's. rehydrateLoadedTournamentState() then rebuilds this device's view. Before this PR, when the court had no
// shared courtState entry, it took the payload's `currentDivision` / `current` (another device's view), and with
// nothing to show it left the payload's `currentDivision` (and, with no court known, the payload's `currentCourt`).
// Now the view comes only from this device's own state: its court (pin), the division it chose
// (ksmLocalCourtDivision), the court's shared courtState entry, else the court's first scorable match.
//
// Each case runs the app's own applyTournamentPayload() twice, in two vm contexts: with applyTournamentPayload() /
// rehydrateLoadedTournamentState() as they were before this PR (git show of the base commit) and with the new code.
//   * cases where the view already came from the court's shared entry give the same `state` as before (covered);
//   * the cases that took another device's view give that view before and this device's view now (changed).
import vm from 'node:vm';
import { extractFunction, html, withDependencies } from './lib/ksm-source.mjs';
import { gitShow } from './lib/git-show.mjs';

const BASE = '477eca9020beda42e71d90ee7fe8ac5dd29d08d9'; // next/4.1 before this PR (#176 merged)
const FILE = 'app/modules/sync/cloud-realtime-save-and-load.js';
const CHANGED = ['applyTournamentPayload', 'rehydrateLoadedTournamentState'];
let failed = false, count = 0;
const check = (ok, name) => { count++; if (!ok) { console.log(`FAIL ${name}`); failed = true; } };
const json = v => JSON.stringify(v);

// Everything a load calls that is not the court view: UI, saving, the pin store, the repairs (tested elsewhere).
const STUBS = ['renderAll', 'updateUndoButton', 'autoSaveTournament', 'scheduleAutoSave', 'applySetupSnapshot', 'ksmNoteTeamsReassigned',
  'ksmAddDaihyosenForTeamAwards', 'ksmSyncGrandChampions', 'repairLoadedEliminationAdvancement', 'sanitizeLoadedTournamentState',
  'normalizeAllIndividualPoolTiebreakOrder', 'replaceState', 'pinCourtLocally', 'pinnedCourt', 'restorePinnedCourt', 'isTvSession',
  'cloudSession', 'applyCourtSides', 'ensureCourtHistory', 'ksmLocalCourtDivision', 'point', 'renderScore', 'ksmNotifyStateChanged', 'renderPublic'];
const newCode = '"use strict";\n' + withDependencies(html, CHANGED.map(n => extractFunction(html, n)).join('\n'), { exclude: STUBS });
const oldSource = gitShow(BASE, FILE);
let oldCode = null;
if (oldSource) {
  oldCode = newCode;
  for (const name of CHANGED) {
    const now = extractFunction(html, name);
    check(oldCode.includes(now), `${name} is in the code under test`);
    oldCode = oldCode.replace(now, () => extractFunction(oldSource, name));
  }
  check(/state\.currentDivision\)\{\s*cs=\{division:state\.currentDivision/.test(extractFunction(oldSource, 'rehydrateLoadedTournamentState')), 'the base rehydrate is the one with the payload fallback');
}
check(!/state\.current\b(?!Court|Division|ByDivision)/.test(extractFunction(html, 'rehydrateLoadedTournamentState').replace(/state\.current=0/, '')),
  'the rehydrate no longer reads the payload\'s current');

/** A context for `code`: the device's pin, TV flag, remembered court divisions and its state before the load. */
function makeContext(code, { pin = null, tv = false, local = {}, before }) {
  const context = {
    console, setTimeout: () => 0,
    cloudSession: { court: pin || '', tournamentId: 't1' },
    ksmLocalCourtDivision: { A: null, B: null, ...local },
    renderAll() {}, updateUndoButton() {}, autoSaveTournament() {}, scheduleAutoSave() {}, applySetupSnapshot() {}, ksmNoteTeamsReassigned() {},
    ksmAddDaihyosenForTeamAwards: () => [], ksmSyncGrandChampions: () => false, repairLoadedEliminationAdvancement() {},
    sanitizeLoadedTournamentState() {}, normalizeAllIndividualPoolTiebreakOrder() {}, applyCourtSides() {}, renderScore() {}, ksmNotifyStateChanged() {}, renderPublic() {},
    ensureCourtHistory() { const s = context.state; s.courtActionHistory = s.courtActionHistory || { A: [], B: [] }; s.courtRedoHistory = s.courtRedoHistory || { A: [], B: [] }; },
    isTvSession: () => tv,
  };
  let pinned = pin;
  context.pinnedCourt = () => pinned;
  context.pinCourtLocally = c => { pinned = c; };
  context.replaceState = loaded => { for (const k of Object.keys(context.state)) delete context.state[k]; Object.assign(context.state, loaded); };
  context.restorePinnedCourt = () => { if (!pinned) return null; context.cloudSession.court = pinned; context.state.currentCourt = pinned; if (tv) context.state.publicCourt = pinned; return pinned; };
  vm.createContext(context);
  vm.runInContext(code, context);
  context.state = before;
  return context;
}

// A tournament: Open on Court A (three bouts, the second in progress with a men), Kids and Juniors on Court B.
const bout = (division, n, court, extra = {}) => ({ division, pool: 'A', white: `${division} ${n}`, red: `${division} ${n + 1}`, wdojo: '', rdojo: '', done: false, wp: [], rp: [], wt: 0, rt: 0, type: 'individual', court, ...extra });
function tournament(view) {
  const allMatches = {
    Open: [bout('Open', 1, 'A', { done: true, wp: ['M', 'K'] }), bout('Open', 3, 'A', { wp: ['M'] }), bout('Open', 5, 'A')],
    Kids: [bout('Kids', 1, 'B', { done: true, rp: ['D'] }), bout('Kids', 3, 'B', { wp: ['K', 'K'] })],
    Juniors: [bout('Juniors', 1, 'B', { rp: ['T'] }), bout('Juniors', 3, 'B')],
  };
  return {
    divisions: ['Open', 'Kids', 'Juniors'], divisionTypes: {}, divisionCourts: { Open: 'A', Kids: 'B', Juniors: 'B' }, allMatches, teams: [], competitors: [],
    courtState: { A: { division: 'Open', index: 1 }, B: { division: 'Kids', index: 1 } }, courtActiveDivision: { A: 'Open', B: 'Kids' },
    currentByDivision: { Open: 1, Kids: 1, Juniors: 0 }, history: [], courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] },
    // The saving device's own view: Court B, scoring Kids bout 2 (two kote).
    currentCourt: 'B', publicCourt: 'B', currentDivision: 'Kids', current: 1, matches: allMatches.Kids, score: { W: ['K', 'K'], R: [], WT: 0, RT: 0 },
    ...view,
  };
}
const payloadOf = s => ({ state: JSON.parse(JSON.stringify(s)), setup: {} });
// This device before the load: a fresh device (the app's initial state), or a device already showing a tournament.
const fresh = () => ({ divisions: ['Women’s Open'], allMatches: {}, courtState: { A: { division: null, index: 0 }, B: { division: null, index: 0 } }, courtActiveDivision: { A: null, B: null },
  currentByDivision: {}, matches: [], current: 0, score: { W: [], R: [], WT: 0, RT: 0 }, history: [], currentDivision: 'Women’s Open', currentCourt: 'A', publicCourt: 'A' });
const courtADevice = () => { const s = tournament({ currentCourt: 'A', publicCourt: 'A', currentDivision: 'Open', current: 1, score: { W: ['M'], R: [], WT: 0, RT: 0 } }); s.matches = s.allMatches.Open; return s; };

/** Loads `payload` into a device set up by `device` with `code`; returns the device's view and the whole state. */
function load(code, device, payload, options) {
  const c = makeContext(code, device);
  c.applyTournamentPayload(payload, false, options);
  const s = c.state;
  return {
    state: s, local: { ...c.ksmLocalCourtDivision },
    view: { court: s.currentCourt, publicCourt: s.publicCourt, division: s.currentDivision, current: s.current, score: s.score, matchesIsDivision: s.matches === s.allMatches[s.currentDivision] || (!s.matches.length && !s.allMatches[s.currentDivision]) },
  };
}
const NEW = newCode, OLD = oldCode;
const remote = { pinnedCourt: 'A', preserveLocalDivision: true, source: 'live sync' };

// ---- Covered: the view came from the court's shared entry before, and still does (same state). ----
const SAME = {
  // A remote apply on Court A (realtime or poll): Court B switched to Juniors; Court A keeps Open bout 2 and its men.
  'remote apply from Court B (B switched division)': [{ pin: 'A', local: { A: 'Open' }, before: courtADevice() },
    payloadOf(tournament({ courtState: { A: { division: 'Open', index: 1 }, B: { division: 'Juniors', index: 0 } }, courtActiveDivision: { A: 'Open', B: 'Juniors' }, currentDivision: 'Juniors', current: 0, score: { W: [], R: ['T'], WT: 0, RT: 0 } })), remote],
  // The rebase result / outbox flush / queued work merge: the same options as a remote apply, this device's own payload.
  'rebase result (this device\'s own payload)': [{ pin: 'A', local: { A: 'Open' }, before: courtADevice() }, payloadOf(courtADevice()), { ...remote, source: 'concurrent rebase' }],
  // A reload: the autosave or the cloud copy, saved by Court B, on a court A tablet (ksmAccountLoad: pinnedCourt only).
  'reload on Court A (copy saved by Court B)': [{ pin: 'A', before: fresh() }, payloadOf(tournament()), { pinnedCourt: 'A' }],
  // First load on a fresh device, no pin: the cloud copy (Court A, the default court).
  'first load, fresh device, no pin': [{ before: fresh() }, payloadOf(tournament()), {}],
  // A TV on Court B follows Court B's shared entry (Juniors) although it remembered Kids.
  'TV on Court B follows Court B\'s courtState': [{ pin: 'B', tv: true, local: { B: 'Kids' }, before: tournament({ currentCourt: 'B' }) },
    payloadOf(tournament({ courtState: { A: { division: 'Open', index: 1 }, B: { division: 'Juniors', index: 0 } }, courtActiveDivision: { A: 'Open', B: 'Juniors' }, currentCourt: 'A', currentDivision: 'Open', current: 1, score: { W: ['M'], R: [], WT: 0, RT: 0 } })),
    { pinnedCourt: 'B', preserveLocalDivision: false, source: 'live sync' }],
  // A file load (applyTournamentFilePayload: no options) on a device showing Court B of another tournament.
  'file load': [{ before: tournament({ currentCourt: 'B', currentDivision: 'Juniors', current: 0 }) }, payloadOf(tournament({ currentCourt: 'A', currentDivision: 'Open', current: 2 })), undefined],
  // A tournament switch (tournament-switcher: no options) on a pinned Court A device that showed another tournament.
  'tournament switch': [{ pin: 'A', before: tournament({ divisions: ['Seniors'], allMatches: { Seniors: [bout('Seniors', 1, 'A')] }, currentDivision: 'Seniors', currentCourt: 'A' }) }, payloadOf(tournament()), undefined],
};
const expected = {
  'remote apply from Court B (B switched division)': { court: 'A', division: 'Open', current: 1, W: ['M'] },
  'rebase result (this device\'s own payload)': { court: 'A', division: 'Open', current: 1, W: ['M'] },
  'reload on Court A (copy saved by Court B)': { court: 'A', division: 'Open', current: 1, W: ['M'] },
  'first load, fresh device, no pin': { court: 'A', division: 'Open', current: 1, W: ['M'] },
  'TV on Court B follows Court B\'s courtState': { court: 'B', division: 'Juniors', current: 0, W: [], R: ['T'], publicCourt: 'B' },
  'file load': { court: 'B', division: 'Kids', current: 1, W: ['K', 'K'] },
  'tournament switch': { court: 'A', division: 'Open', current: 1, W: ['M'] },
};
for (const [name, [device, payload, options]] of Object.entries(SAME)) {
  const now = load(NEW, device, payload, options);
  const want = expected[name];
  check(now.view.court === want.court && now.view.division === want.division && now.view.current === want.current, `${name}: Court ${want.court} ${want.division} bout ${want.current + 1} (got ${now.view.court} ${now.view.division} ${now.view.current})`);
  check(json(now.view.score.W) === json(want.W) && (!want.R || json(now.view.score.R) === json(want.R)), `${name}: the score pad shows the match's points (${json(now.view.score)})`);
  check(now.view.matchesIsDivision, `${name}: matches is the shown division's list`);
  if (want.publicCourt) check(now.view.publicCourt === want.publicCourt, `${name}: the TV's public court stays ${want.publicCourt}`);
  if (OLD) {
    const before = load(OLD, { ...device, before: JSON.parse(JSON.stringify(device.before)) }, payload, options);
    check(json(before.state) === json(now.state) && json(before.local) === json(now.local), `${name}: the same state as before this PR`);
  }
}
// Court B's switch reached Court A's copy of the shared data, so a TV or the director still sees Juniors on B.
{
  const [device, payload, options] = SAME['remote apply from Court B (B switched division)'];
  const { state } = load(NEW, { ...device, before: courtADevice() }, payload, options);
  check(state.courtState.B.division === 'Juniors' && state.courtActiveDivision.B === 'Juniors', 'remote apply: Court B\'s shared entry (Juniors) comes from the payload');
}

// ---- Changed: the view came from another device's payload before; now from this device. ----
// 1. Court A has no shared entry (a 4.0 copy, or Court A never started) and the copy was saved by Court B on Kids
//    bout 2: before, Court A took Kids (Court B's division; no Kids bout is on Court A, so an empty court, and Kids
//    written into Court A's shared entry); now the court's first scorable match (Open bout 2, its men).
{
  const payload = payloadOf(tournament({ courtState: { A: { division: null, index: 0 }, B: { division: 'Kids', index: 1 } }, courtActiveDivision: { A: null, B: 'Kids' } }));
  for (const [label, device, options] of [
    ['remote apply', { pin: 'A', before: courtADevice() }, { pinnedCourt: 'A', preserveLocalDivision: false, source: 'live sync' }],
    ['reload', { pin: 'A', before: fresh() }, { pinnedCourt: 'A' }],
  ]) {
    const now = load(NEW, device, payload, options);
    check(now.view.court === 'A' && now.view.division === 'Open' && now.view.current === 1 && json(now.view.score.W) === json(['M']),
      `no shared entry, ${label}: Court A opens its own first match, Open bout 2 (got ${now.view.division} ${now.view.current} ${json(now.view.score)})`);
    if (OLD) {
      const before = load(OLD, { ...device, before: JSON.parse(JSON.stringify(device.before)) }, payload, options);
      check(before.view.division === 'Kids' && before.view.current === 2 && before.state.courtState.A.division === 'Kids',
        `no shared entry, ${label}: before this PR Court A took Court B's division from the payload (Kids, no Court A match: an empty court) (got ${before.view.division} ${before.view.current})`);
    }
  }
}
// 2. Nothing to show yet (no draw): before, the division was the saving device's; now this device keeps its own.
{
  const payload = payloadOf({ ...tournament(), allMatches: {}, courtState: { A: { division: null, index: 0 }, B: { division: null, index: 0 } }, courtActiveDivision: { A: null, B: null }, currentDivision: 'Kids', current: 0, matches: [] });
  const device = { pin: 'A', before: { ...fresh(), divisions: ['Open', 'Kids', 'Juniors'], currentDivision: 'Juniors' } };
  const now = load(NEW, device, payload, remote);
  check(now.view.division === 'Juniors' && now.view.current === 0 && json(now.view.score) === json({ W: [], R: [], WT: 0, RT: 0 }) && now.state.matches.length === 0,
    `no draw: this device keeps its own division (Juniors) (got ${now.view.division})`);
  const freshNow = load(NEW, { pin: 'A', before: fresh() }, payload, { pinnedCourt: 'A' });
  check(freshNow.view.division === 'Open', `no draw, fresh device whose default division is not in the tournament: the tournament's first division (got ${freshNow.view.division})`);
  if (OLD) {
    const before = load(OLD, { ...device, before: JSON.parse(JSON.stringify(device.before)) }, payload, remote);
    check(before.view.division === 'Kids', `no draw: before this PR the saving device's division (Kids) came with the payload (got ${before.view.division})`);
  }
}
// 3. No court known on this device (no pin, no court in its state): before, the saving device's court (B); now A.
{
  const before = fresh(); delete before.currentCourt;
  const now = load(NEW, { before }, payloadOf(tournament()), undefined);
  check(now.view.court === 'A' && now.view.division === 'Open', `no court known: Court A, not the saving device's court (got ${now.view.court} ${now.view.division})`);
  if (OLD) {
    const old = fresh(); delete old.currentCourt;
    const was = load(OLD, { before: old }, payloadOf(tournament()), undefined);
    check(was.view.court === 'B', `no court known: before this PR the saving device's court (B) came with the payload (got ${was.view.court})`);
  }
}
// 4. The device fields are still written into the payload (4.0 devices read them): the load does not drop them.
{
  const { state } = load(NEW, { pin: 'A', before: fresh() }, payloadOf(tournament()), { pinnedCourt: 'A' });
  check(['currentCourt', 'publicCourt', 'currentDivision', 'current', 'matches', 'score'].every(k => k in state), 'the device fields stay in state, so tournamentPayload() keeps saving them');
}

if (failed) process.exit(1);
console.log(`PASS loads keep the device view: ${count} checks`);
