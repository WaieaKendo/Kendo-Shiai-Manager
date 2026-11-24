// app/engine/integrity.ts (roadmap 2.7): completed-result snapshots and the load-time
// repair (Hikiwake is never a valid result of a winner-required match, a snapshot that
// disagrees with its points is invalid, a winner-required match with no winner re-opens),
// duplicate individual match removal, sync identities, plus equivalence with the pre-move
// legacy code over the golden scenarios' final matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  completedResultSnapshot, planCompletedResultRepairs, loadedEliminationRepairPlan, isValidMatchObject,
  individualLogicalMatchKey, uniqueIndividualMatches, matchSyncIdentity, matchHasSyncIdentity, legacyTiebreakSyncIdentity,
  matchIndexIn, findMatchAgain,
} from '../../app/engine/integrity.ts';
import { completedResultSnapshotValid } from '../../app/engine/standings.ts';
import { html, extractFunction, withDependencies } from '../lib/ksm-source.mjs';
import { vmStore } from '../lib/vm-store.mjs';
import { gitShow, gitListAppJs } from '../lib/git-show.mjs';

const AT = '2026-01-01T00:00:00.000Z';
const champ = over => ({ division: 'Open', type: 'individual', championship: true, position: 'Final', white: 'A', red: 'B', done: true, wp: [], rp: [], ...over });
const pool = over => ({ division: 'Open', type: 'individual', pool: 'A', white: 'A', red: 'B', done: true, wp: [], rp: [], ...over });

test('snapshot records points and the score winner', () => {
  assert.deepEqual(completedResultSnapshot(pool({ wp: ['M', 'K'], rp: ['D'], wt: 1 }), AT), { winner: 'A', wp: ['M', 'K'], rp: ['D'], wt: 1, rt: 0, recordedAt: AT });
  assert.equal(completedResultSnapshot(pool({}), AT).winner, 'Hikiwake');
  assert.equal(completedResultSnapshot(null, AT).winner, 'Hikiwake');
});

test('integrity rules: Hikiwake, snapshot/score mismatch, re-open', () => {
  const hiki = { winner: 'Hikiwake', wp: [], rp: [] };
  assert.equal(completedResultSnapshotValid(pool({}), hiki), true, 'pool bout may draw');
  for (const m of [champ({}), pool({ type: 'exhibition' }), pool({ type: 'teamPlayoff' }), pool({ requiresWinner: true })])
    assert.equal(completedResultSnapshotValid(m, hiki), false, `Hikiwake invalid for ${m.type}`);
  assert.equal(completedResultSnapshotValid(pool({}), { winner: 'A', wp: [], rp: ['M'] }), false, 'winner disagrees with points');
  assert.equal(completedResultSnapshotValid(pool({}), { winner: 'Z', wp: ['M'], rp: [] }), false, 'winner is not in the match');

  const all = { Open: [
    champ({ wp: ['M'], completedResult: { winner: 'A', wp: ['M', 'K'], rp: [], wt: 2, rt: 1 } }), // valid snapshot: restore
    champ({ templateNode: true, completedResult: hiki }),                                         // no winner: re-open
    champ({ templateNode: true, white: 'A', red: '' }),                                           // re-open, not ready
    pool({ wp: ['M'], completedResult: { winner: 'B', wp: ['M'], rp: [] } }),                     // mismatch: new snapshot
    pool({ done: false }), null, 'junk',
  ], Bad: 'x' };
  const plan = planCompletedResultRepairs(all, AT);
  assert.deepEqual([plan.restored, plan.created, plan.reopened], [1, 1, 2]);
  assert.deepEqual(plan.repairs, [
    { division: 'Open', index: 0, action: 'restore', set: { wp: ['M', 'K'], rp: [], wt: 2, rt: 1 } },
    { division: 'Open', index: 1, action: 'reopen', set: { done: false, ready: true } },
    { division: 'Open', index: 2, action: 'reopen', set: { done: false, ready: false } },
    { division: 'Open', index: 3, action: 'create', set: { completedResult: { winner: 'A', wp: ['M'], rp: [], wt: 0, rt: 0, recordedAt: AT } } },
  ]);
  assert.equal(all.Open[1].done, true, 'input untouched');
  assert.deepEqual(planCompletedResultRepairs(null, AT), { restored: 0, created: 0, reopened: 0, repairs: [] });
  assert.deepEqual(loadedEliminationRepairPlan(['Open', 'Kids'], { Open: [{}] }, { Kids: [{}], Open: [] }),
    [{ division: 'Open', championship: true, singleElim: false }, { division: 'Kids', championship: false, singleElim: true }]);
});

test('duplicate individual matches: first kept, a completed duplicate replaces an open one', () => {
  const a = champ({ done: false, bracketSlot: 0 }), b = champ({ done: true, bracketSlot: 0, wp: ['M'] }), c = champ({ bracketSlot: 1 });
  const p1 = pool({}), p2 = pool({});
  const out = uniqueIndividualMatches([a, p1, b, c, p2, champ({ bracketSlot: 1, done: false })]);
  assert.deepEqual(out, [b, p1, c, p2]);
  assert.equal(out[0], b); assert.equal(out[1], p1, 'pool bouts are never de-duplicated');
  const tb1 = pool({ tiebreak: true, white: 'B', red: 'A', done: false }), tb2 = pool({ tiebreak: true });
  assert.equal(individualLogicalMatchKey(tb1), individualLogicalMatchKey(tb2), 'tiebreak key ignores side order');
  assert.equal(individualLogicalMatchKey({ type: 'individual', singleElim: true }), 'single:undefined:');
  assert.equal(individualLogicalMatchKey({ type: 'teamPosition', championship: true }), null);
});

test('sync identities', () => {
  assert.equal(isValidMatchObject([]), false); assert.equal(isValidMatchObject({}), true); assert.equal(matchSyncIdentity(null), '');
  assert.equal(matchSyncIdentity({ division: 'D', champNodeId: 'SF1' }), 'champ:D:SF1');
  assert.equal(matchSyncIdentity({ division: 'D', type: 'individual', pool: 'A', poolOrder: 2, whitePoolSlot: 'A1', redPoolSlot: 'A2', white: 'x', red: 'y' }), 'pool:D:A:2:A1-A2:x:y');
  assert.equal(matchSyncIdentity({ division: 'D', type: 'teamPosition', teamPair: '0-1', position: 'Senpo' }), 'team-pair:D:0-1:Senpo:teamPosition');
  const tb = { division: 'D', type: 'individual', tiebreak: true, pool: 'A', tiebreakId: 'T1', white: 'x', red: 'y' };
  assert.equal(matchHasSyncIdentity(tb, legacyTiebreakSyncIdentity(tb)), true);
  assert.equal(matchHasSyncIdentity(tb, ''), false);
});

test('integrity helpers equal the pre-move legacy code on golden final matches', t => {
  const OLD = 'e7312a6';
  const names = gitListAppJs(OLD);
  if (!names) return t.skip(`${OLD} not in this clone`);
  const files = names.map(f => gitShow(OLD, `app/js/${f}`));
  if (files.includes(null)) return t.skip(`${OLD} not in this clone`);
  const NAMES = ['repairCompletedMatchResults', 'completedResultSnapshot', 'individualLogicalMatchKey', 'enforceUniqueIndividualMatches', 'matchSyncIdentity', 'matchHasSyncIdentity'];
  // The pre-move code runs on a plain `state`; the current code on a real store (tests/lib/vm-store.mjs).
  const load = (src, inStore) => {
    const raw = { console: { warn() {}, info() {} } };
    if (inStore) raw.vs = vmStore(raw); else raw.state = null;
    const ctx = vm.createContext(raw);
    vm.runInContext(withDependencies(src, NAMES.map(n => extractFunction(src, n)).join('\n'), { exclude: inStore ? Object.keys(raw) : ['state', 'console'] }), ctx);
    return ctx;
  };
  const oldSrc = files.join('\n'), legacy = load(oldSrc, false), current = load(html, true);
  assert.ok(!/KSMEngine/.test(extractFunction(oldSrc, 'repairCompletedMatchResults')), 'old code is pre-move');
  const dir = new URL('../golden/engine/', import.meta.url);
  const noTime = s => s.replace(/"recordedAt":"[^"]*"/g, '"recordedAt":""');
  let checked = 0;
  for (const file of fs.readdirSync(dir).sort()) {
    const g = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'));
    const allMatches = {};
    for (const [div, d] of Object.entries(g.final || {})) {
      allMatches[div] = (d.matches || []).map((m, i) => {
        const x = { division: div, ...m, ...(m.championship ? { champNodeId: m.node } : m.singleElim ? { elimNodeId: m.node } : {}), templateNode: !!m.node };
        if (i % 4 === 1) x.completedResult = { winner: m.winner, wp: [...(m.wp || [])], rp: [...(m.rp || [])], wt: 1 };
        if (i % 4 === 2) x.completedResult = { winner: m.white, wp: [], rp: ['M'] };
        if (i % 4 === 3 && m.done) { x.wp = []; x.rp = []; }
        return x;
      });
    }
    const snap = ctx => {
      const st = JSON.parse(JSON.stringify(allMatches)), out = [];
      out.push(ctx.repairCompletedMatchResults({ allMatches: st }, 'test'), st);
      for (const [div, arr] of Object.entries(st)) {
        out.push(arr.map(m => [ctx.individualLogicalMatchKey(m), ctx.matchSyncIdentity(m), ctx.matchHasSyncIdentity(m, ctx.matchSyncIdentity(arr[0])), ctx.completedResultSnapshot(m)]));
        const live = { allMatches: { [div]: [...arr, ...arr.map(m => ({ ...m, done: !m.done }))] }, currentDivision: div };
        if (ctx.vs) { ctx.vs.load(live); ctx.dispatch(ctx.deviceSlice.actions.divisionShown(div)); } else ctx.state = live;
        // The legacy code re-aliased state.matches; since #15 PR 7 the app's state.matches is derived (allMatches of the
        // shown division), which this plain object does not have: compare that list.
        out.push(ctx.enforceUniqueIndividualMatches(div), ctx.state.matches ?? ctx.state.allMatches[ctx.state.currentDivision]);
      }
      return noTime(JSON.stringify(out));
    };
    assert.equal(snap(current), snap(legacy), file);
    checked++;
  }
  assert.ok(checked >= 76);
});

// #15, before 13c: a match is found again by sync identity when the list holds new objects (structural copies).
test('matchIndexIn: the same object first, else the sync identity; a shared identity by equal fields, then the hint', () => {
  const a = pool({ white: 'A', red: 'B', poolOrder: 0, done: false }), b = pool({ white: 'C', red: 'D', poolOrder: 1, done: false });
  const k = over => ({ division: 'T', type: 'kachinuki', teamPair: 'p1', position: 'Kachinuki', teamWhite: 'X', teamRed: 'Y', done: false, wp: [], rp: [], ...over });
  const k1 = k({ white: 'X1', red: 'Y1', done: true, wp: ['M'] }), k2 = k({ white: 'X1', red: 'Y2', done: true, rp: ['M'] }), k3 = k({ white: 'X2', red: 'Y2' });
  const list = [a, b, k1, k2, k3];
  assert.equal(matchIndexIn(list, b), 1);
  assert.equal(matchIndexIn(list, b, 0), 1, 'the object itself wins over the hint');
  const copies = list.map(m => structuredClone(m));
  copies.forEach((m, i) => assert.equal(matchIndexIn(copies, list[i]), i, `copy ${i}`));
  assert.equal(matchSyncIdentity(k1), matchSyncIdentity(k3), 'a kachinuki pairing shares one identity');
  // Written since it was held (no equal copy): the held index decides, else the first of the pairing.
  const stale = { ...k3, wp: ['K'] };
  assert.equal(matchIndexIn(copies, stale, 4), 4);
  assert.equal(matchIndexIn(copies, stale, 1), 2, 'a hint outside the candidates is ignored');
  assert.equal(matchIndexIn(copies, stale), 2);
  assert.equal(matchIndexIn(copies, pool({ white: 'Z', red: 'Q' })), -1);
  assert.equal(matchIndexIn(copies, null), -1);
  assert.equal(matchIndexIn(null, a), -1);
  assert.equal(matchIndexIn(copies, { not: 'a match' }), -1);
  assert.equal(findMatchAgain(copies, list[1]), copies[1]);
  // A name changed since it was held (the identity misses): the held index when that entry is the same slot.
  const renamed = { ...a, white: 'A2' };
  assert.equal(matchIndexIn(copies, renamed, 0), 0);
  assert.equal(matchIndexIn(copies, renamed, 1), -1, 'another slot at the hint');
  assert.equal(matchIndexIn(copies, renamed), -1);
  // A pool saved before the slots (no whitePoolSlot / redPoolSlot; poolOrder is the pool's index) and exhibitions: every
  // bout is the same slot, so the hint is not taken.
  const old = (white, red) => ({ division: 'Old', type: 'individual', pool: 'A', poolOrder: 0, white, red, done: false, wp: [], rp: [] });
  const legacy = [old('A', 'B'), old('C', 'D'), old('A', 'C')].map(m => structuredClone(m));
  assert.equal(matchIndexIn(legacy, { ...old('A', 'B'), white: 'Ann' }, 1), -1);
  assert.equal(matchIndexIn(legacy, { ...old('A', 'B'), white: 'Ann' }, 0), -1);
  const ex = (white, red) => ({ division: 'Exhibition', type: 'exhibition', white, red, done: false, wp: [], rp: [] });
  assert.equal(matchIndexIn([ex('A', 'B'), ex('C', 'D')], { ...ex('A', 'B'), white: 'Ann' }, 1), -1);
  // With the template order, a renamed pool bout is its own slot again.
  const slotted = [{ ...old('A', 'B'), poolTemplateOrder: 0 }, { ...old('C', 'D'), poolTemplateOrder: 1 }];
  assert.equal(matchIndexIn(slotted, { ...slotted[0], white: 'Ann' }, 0), 0);
  assert.equal(matchIndexIn(slotted, { ...slotted[0], white: 'Ann' }, 1), -1);
  assert.equal(findMatchAgain(copies, pool({ white: 'Z', red: 'Q' })), null);
});
