// #15 PR 6 (docs/STORE.md section 1.2): who moves a court's shared pointer (courtState[c], courtActiveDivision[c],
// currentByDivision). Decided in PR 6: only Court c's scorekeeper (a device that may write the tournament and whose
// court is c; a cloud TV link is never staff). A view choice on any other device (a spectator or a TV on Court B, Live Scores / the director's
// dashboard rendering Court B on a device pinned to Court A) changes only that device's view.
//
// Runs the app's own applyCourtState() / setActiveDivision() / selectScorekeeperDivision() / courtCurrentMatch() in a vm
// context per device, with the court view's store helpers writing the context's plain `state`.
import vm from 'node:vm';
import { extractFunction, html, withDependencies } from './lib/ksm-source.mjs';
import { deriveMatches, viewHelpers } from './lib/derived-matches.mjs';
import { gitShow } from './lib/git-show.mjs';

let failed = false, count = 0;
const check = (ok, name) => { count++; if (!ok) { console.log(`FAIL ${name}`); failed = true; } };
const json = v => JSON.stringify(v);

const STUBS = ['renderDivisions', 'renderScore', 'renderPools', 'renderProgress', 'renderContext', 'renderPublic', 'applyCourtSides', 'criticalAutoSave',
  'isReadOnlySession', 'canCloudWrite', 'isTvSession', 'ksmSetCurrentCourt', 'ksmSetPublicCourt', 'ksmShowDivision', 'setLocalCourtDivision',
  'ksmLocalCourtDivision', 'pinCourtLocally', 'show', 'ksmNotifyStateChanged', 'ksmShowMatch', 'ksmSetScore', 'ksmEmptyScore', 'ksmResetCourtPads'];
const entry = ['applyCourtState', 'setActiveDivision', 'selectScorekeeperDivision', 'courtCurrentMatch', 'isCourtScorekeeper', 'syncOwnCourtPointer'].map(n => extractFunction(html, n)).join('\n');
const code = '"use strict";\n' + withDependencies(html, entry, { exclude: STUBS });

const bout = (division, n, court, extra = {}) => ({ division, pool: 'A', white: `${division} ${n}`, red: `${division} ${n + 1}`, wdojo: '', rdojo: '', done: false, wp: [], rp: [], wt: 0, rt: 0, type: 'individual', court, ...extra });
// Open on Court A; Kids (Court B, bout 1 done, bout 2 next) and Juniors on Court B. Court B runs Kids bout 2.
function tournament() {
  const allMatches = {
    Open: [bout('Open', 1, 'A'), bout('Open', 3, 'A')],
    Kids: [bout('Kids', 1, 'B', { done: true }), bout('Kids', 3, 'B'), bout('Kids', 5, 'B')],
    Juniors: [bout('Juniors', 1, 'B'), bout('Juniors', 3, 'B')],
  };
  return {
    divisions: ['Open', 'Kids', 'Juniors'], divisionTypes: {}, divisionCourts: { Open: 'A', Kids: 'B', Juniors: 'B' }, allMatches, teams: [], competitors: [],
    courtState: { A: { division: 'Open', index: 0 }, B: { division: 'Kids', index: 1 } }, courtActiveDivision: { A: 'Open', B: 'Kids' },
    currentByDivision: { Open: 0, Kids: 1 }, history: [], matches: allMatches.Open, current: 0, score: { W: [], R: [], WT: 0, RT: 0 },
    currentDivision: 'Open', currentCourt: 'A', publicCourt: 'A',
  };
}
// syncOwnCourtPointer() as #180 merged it (before #15 PR 7's fix of its review Low), for case 7.
const PR6 = '37b48d0', pr6Source = gitShow(PR6, 'app/modules/court/court-match-order.js');
const pr6Code = pr6Source && code.replace(extractFunction(html, 'syncOwnCourtPointer'), () => extractFunction(pr6Source, 'syncOwnCourtPointer'));
/** A device: `staff` (may write the tournament), `tv`, and the court it shows. */
function device({ staff = true, tv = false, court = 'A', source = code }) {
  const local = { A: null, B: null };
  const context = {
    console, window: {}, ksmLocalCourtDivision: local, saves: [],
    renderDivisions() {}, renderScore() {}, renderPools() {}, renderProgress() {}, renderContext() {}, renderPublic() {}, applyCourtSides() {}, show() {}, ksmNotifyStateChanged() {},
    criticalAutoSave(reason) { context.saves.push(reason); }, isReadOnlySession: () => !staff, canCloudWrite: () => staff, isTvSession: () => tv, pinCourtLocally: c => c,
    ksmSetCurrentCourt(c) { context.state.currentCourt = c; }, ksmSetPublicCourt(c) { context.state.publicCourt = c; }, ksmShowDivision(d) { context.state.currentDivision = d; },
    setLocalCourtDivision(c, d) { local[c] = d; },
  };
  Object.assign(context, viewHelpers(context));
  vm.createContext(context);
  vm.runInContext(source, context);
  context.state = deriveMatches(tournament());
  context.state.currentCourt = court;
  return context;
}
const shared = s => json({ courtState: s.courtState, courtActiveDivision: s.courtActiveDivision, currentByDivision: s.currentByDivision });
const before = shared(tournament());

// 1. Court B's scorekeeper picks Juniors on the court screen: Court B's shared pointer moves (and is saved).
{
  const d = device({ court: 'B' });
  d.applyCourtState('B', d.state.courtState.B, true);
  d.selectScorekeeperDivision('Juniors');
  const s = d.state;
  check(s.courtState.B.division === 'Juniors' && s.courtState.B.index === 0 && s.courtActiveDivision.B === 'Juniors' && s.currentByDivision.Juniors === 0,
    `Court B's scorekeeper: Court B now runs Juniors bout 1 (got ${json(s.courtState.B)} ${s.courtActiveDivision.B})`);
  check(s.currentDivision === 'Juniors' && d.ksmLocalCourtDivision.B === 'Juniors', 'Court B\'s scorekeeper: its own view and choice are Juniors');
  check(json(s.courtState.A) === json(tournament().courtState.A), 'Court B\'s scorekeeper: Court A untouched');
  check(d.saves.length === 1, 'the change is saved right away');
}
// 2. A spectator (or a director logged out) on Court B picks Juniors: only its own view changes.
for (const [label, opts] of [['spectator on Court B', { staff: false, court: 'B' }], ['TV on Court B (a cloud TV link is never staff)', { staff: false, tv: true, court: 'B' }]]) {
  const d = device(opts);
  d.applyCourtState('B', d.state.courtState.B, true);
  check(shared(d.state) === before, `${label}: opening the court does not write its shared pointer`);
  d.setActiveDivision('Juniors');
  const s = d.state;
  check(shared(s) === before, `${label}: picking Juniors leaves Court B's shared pointer on Kids bout 2 (got ${shared(s)})`);
  check(s.currentDivision === 'Juniors' && s.current === 0 && s.matches[0] === s.allMatches.Juniors[0], `${label}: its own court screen shows Juniors bout 1`);
  check(d.ksmLocalCourtDivision.B === 'Juniors', `${label}: its own choice is remembered (device state)`);
}
// 3. A director's device pinned to Court A draws Live Scores / the dashboard for Court B, whose pointer is at a finished
//    bout: it shows Court B's next bout, but does not write Court B's pointer. Court B's scorekeeper heals it.
{
  const stale = d => { d.state.allMatches.Kids[1].done = true; return d; };
  const director = stale(device({ court: 'A' }));
  const m = director.courtCurrentMatch('B');
  check(m && m.match === director.state.allMatches.Kids[2], `director on Court A: Court B's current bout is Kids bout 3 (got ${m && m.match.white})`);
  check(director.state.courtState.B.index === 1, `director on Court A: Court B's shared pointer is not written (got ${json(director.state.courtState.B)})`);
  const keeper = stale(device({ court: 'B' }));
  keeper.courtCurrentMatch('B');
  check(keeper.state.courtState.B.index === 2 && keeper.state.courtActiveDivision.B === 'Kids', `Court B's scorekeeper: the render heals Court B's pointer (got ${json(keeper.state.courtState.B)})`);
}
// 4. A staff device opening Court B (openCourt() pins it and sets its court first) is Court B's scorekeeper: as before.
//    applyCourtState() checks the court it is given against this device's court, before it shows that court.
{
  const d = device({ court: 'A' });
  d.ksmSetCurrentCourt('B');
  d.applyCourtState('B', { division: 'Juniors', index: 1 }, true);
  check(d.state.currentCourt === 'B' && d.state.courtState.B.division === 'Juniors' && d.state.courtState.B.index === 1, 'a staff device that opens Court B moves Court B\'s pointer (it is now B\'s device)');
  const other = device({ court: 'A' });
  other.applyCourtState('B', { division: 'Juniors', index: 1 }, true);
  check(other.state.courtState.B.division === 'Kids', 'applyCourtState for a court that is not this device\'s court does not move that court\'s pointer');
}
// 6. #180 review: a division picked before Staff Login follows once the device may write (syncOwnCourtPointer(), called
//    on login and before each court action); never on a spectator or TV; a no-op when the pointer already matches.
{
  let staff = false;
  const d = device({ staff: true, court: 'B' });
  d.canCloudWrite = () => staff;
  vm.runInContext('canCloudWrite=globalThis.canCloudWrite', d);
  d.applyCourtState('B', d.state.courtState.B, true);
  d.setActiveDivision('Juniors');
  check(shared(d.state) === before && d.syncOwnCourtPointer() === false, 'before login: the pick moves only the view, and the catch-up does nothing');
  staff = true;
  check(d.syncOwnCourtPointer() === true, 'after login: the catch-up writes');
  check(d.state.courtState.B.division === 'Juniors' && d.state.courtState.B.index === 0 && d.state.courtActiveDivision.B === 'Juniors' && d.state.currentByDivision.Juniors === 0,
    `after login: Court B's pointer is the device's view, Juniors bout 1 (got ${json(d.state.courtState.B)})`);
  check(d.syncOwnCourtPointer() === false, 'once: a second catch-up does nothing');
  check(json(d.state.courtState.A) === json(tournament().courtState.A), 'Court A untouched');
}
// 7. #180 review, Low (fixed in #15 PR 7): Court B's scorekeeper shows Kids bout 2; it is finished elsewhere (another
//    device's save, a director's result edit) and a render's self-heal (courtCurrentMatch()) moves Court B's pointer on
//    to bout 3 before this screen re-renders. An auth-token refresh (ksmAccountSetRole() -> syncOwnCourtPointer()) then
//    must not put the pointer back on the finished bout 2. A pick of another division still catches up (case 6).
{
  const heal = d => { d.applyCourtState('B', d.state.courtState.B, true); d.state.allMatches.Kids[1].done = true; d.courtCurrentMatch('B'); return d; };
  const d = heal(device({ court: 'B' }));
  check(d.state.courtState.B.index === 2 && d.state.current === 1, `the self-heal moved Court B on to bout 3 while the screen still shows bout 2 (got ${json(d.state.courtState.B)}, current ${d.state.current})`);
  check(d.syncOwnCourtPointer() === false && d.state.courtState.B.index === 2 && d.state.currentByDivision.Kids === 1, `the catch-up does not rewind Court B onto the finished bout (got ${json(d.state.courtState.B)})`);
  if (pr6Code) {
    const was = heal(device({ court: 'B', source: pr6Code }));
    check(was.syncOwnCourtPointer() === true && was.state.courtState.B.index === 1, `#180 as merged rewound it (got ${json(was.state.courtState.B)}); PR 7 fixes that`);
  }
}
// 5. #177 review: finding Court A's first match (no division given) does not re-sort or replace Court B's match lists.
{
  const d = device({ court: 'A' });
  const kids = d.state.allMatches.Kids, juniors = d.state.allMatches.Juniors, order = json(kids);
  const next = d.findNextForCourt('A', null, 0);
  check(next.division === 'Open' && next.index === 0, `Court A's first match is Open bout 1 (got ${json(next)})`);
  check(d.state.allMatches.Kids === kids && d.state.allMatches.Juniors === juniors && json(kids) === order, 'Court B\'s divisions keep their arrays (not re-sorted or replaced)');
  const none = device({ court: 'A' });
  none.state.allMatches.Open.forEach(m => { m.done = true; });
  const kidsB = none.state.allMatches.Kids;
  const empty = none.findNextForCourt('A', null, 0);
  check(none.state.allMatches.Kids === kidsB && empty.index === (none.state.allMatches[empty.division] || []).length, `nothing ready on Court A: no match found, Court B's lists untouched (got ${json(empty)})`);
}

if (failed) process.exit(1);
console.log(`PASS court pointers: only the court's scorekeeper moves them: ${count} checks`);
