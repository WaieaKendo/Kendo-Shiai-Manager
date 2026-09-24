// app/engine/single-elim.ts (roadmap 2.5): seed placement, bracket nodes and Match
// Objects, advancement through byes to the Final, labels and placements, plus
// equivalence with the pre-move legacy code over the golden single-elimination scenarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  singleElimBracketSize, protectedSeedQuadrant, singleElimSlotInfo, placeIndividualsForSingleElim,
  buildIndividualSingleElimMatches, syncIndividualSingleElim, sideLabelGeneric, indivSide,
} from '../../app/engine/single-elim.ts';
import { individualPlacements } from '../../app/engine/championship.ts';
import { teamBracketNodesForCount } from '../../app/engine/teams.ts';
import { html, engine, extractFunction } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

// The frozen templates moved with the team bracket into app/engine/teams.ts (2.6).
const nodesFor = n => teamBracketNodesForCount(n);
const DOJOS = ['Dojo A', 'Dojo B', 'Dojo C', 'Dojo D'];
const entrants = (n, seeds = 0) => Array.from({ length: n }, (_, i) => ({ name: `P${String(i + 1).padStart(2, '0')}`, dojo: DOJOS[i % 4], seed: i < seeds ? String(i + 1) : '' }));
const MATCH_KEYS = ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'position', 'done', 'wp', 'rp', 'type', 'championship',
  'singleElim', 'templateNode', 'origin', 'ready', 'elimNodeId', 'court', 'bracketSlot'];
const apply = (nodes, arr, plan) => { plan.winners.forEach(w => { nodes[w.index].winner = w.winner; }); plan.updates.forEach(u => Object.assign(arr[u.index], u.set)); };

test('bracket size and protected seed quadrants', () => {
  assert.deepEqual([2, 4, 5, 8, 9, 16, 17, 32].map(singleElimBracketSize), [4, 4, 8, 8, 16, 16, 32, 32]);
  assert.deepEqual([1, 2, 3, 4, 5, 0].map(protectedSeedQuadrant), [0, 3, 2, 1, null, null]);
  const info = singleElimSlotInfo(8, nodesFor(8));
  assert.deepEqual(Object.keys(info).map(Number), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(Object.keys(info[1]), ['pos', 'nodeId', 'round', 'slot', 'opponent', 'court', 'isPlayIn', 'order', 'quadrant', 'half', 'protectedSeed']);
  assert.deepEqual([1, 3, 5, 7].map(p => [info[p].quadrant, info[p].opponent, info[p].protectedSeed]), [[0, 2, 1], [1, 4, 4], [2, 6, 3], [3, 8, 2]]);
  assert.equal(singleElimSlotInfo(9, nodesFor(9))[9].isPlayIn, true);
});

test('seed placement for 2–16 entrants: everyone placed once, top seeds apart, quadrants and dojo spread', () => {
  for (let n = 2; n <= 16; n++) {
    for (const seeds of [0, Math.min(4, n)]) {
      const comps = entrants(n, seeds);
      const placed = placeIndividualsForSingleElim([...comps].reverse(), nodesFor(n));
      assert.equal(placed.length, n, `${n}`);
      assert.deepEqual(new Set(placed), new Set(comps), `${n}: a permutation`);
      if (!seeds) continue;
      const info = singleElimSlotInfo(n, nodesFor(n));
      const pos = s => placed.findIndex(c => c.seed === String(s)) + 1;
      assert.equal(placed[0].seed, '1', `${n}: seed 1 at the top`);
      if (n < 8) continue;
      assert.deepEqual([1, 2, 3, 4].map(s => info[pos(s)].quadrant), [0, 3, 2, 1], `${n}: seeds in their quadrants`);
      assert.notEqual(info[pos(1)].half, info[pos(2)].half, `${n}: seeds 1 and 2 in opposite halves`);
      for (let s = 1; s <= 4; s++) assert.ok(!placed[(info[pos(s)].opponent || 0) - 1]?.seed, `${n}: seed ${s} does not open against a seed`);
    }
  }
  const one = entrants(1); assert.equal(placeIndividualsForSingleElim(one, []), one, '0–1 entrants: unchanged');
  // Same-club entrants (Aiea and Waipahu count as one) are kept apart in the first round when possible.
  const two = placeIndividualsForSingleElim(entrants(8).map(c => ({ ...c, dojo: c.name <= 'P04' ? 'Aiea' : 'Waipahu Kendo' })), nodesFor(8));
  const four = placeIndividualsForSingleElim(entrants(8).map((c, i) => ({ ...c, dojo: i % 2 ? 'X' : 'Y' })), nodesFor(8));
  assert.equal(two.length, 8);
  assert.ok([0, 2, 4, 6].every(i => four[i].dojo !== four[i + 1].dojo), 'two clubs of four: every first-round pair mixed');
});

test('nodes and Match Objects: shape per size, field order, courts (single and split)', () => {
  for (let n = 2; n <= 16; n++) {
    const { nodes, matches } = buildIndividualSingleElimMatches('Open', nodesFor(n), 'A');
    // 5 and 6 keep a node with an empty bye slot (SF1 / SF2); otherwise one node per bout.
    assert.equal(nodes.length, n === 5 || n === 6 ? n : n - 1, `${n}: node count`);
    assert.equal(nodes.at(-1).id, 'F');
    assert.deepEqual(nodes.map(x => x.winner), nodes.map(() => null));
    assert.deepEqual(Object.keys(nodes[0]), ['id', 'round', 'court', 'left', 'right', 'slot', 'winner']);
    assert.deepEqual(matches.map(m => m.elimNodeId), nodes.map(x => x.id));
    for (const m of matches) assert.deepEqual(Object.keys(m), MATCH_KEYS);
    assert.ok(matches.every(m => m.court === 'A' && !m.ready && m.white === '' && m.origin === 'TEMPLATE'));
    const split = buildIndividualSingleElimMatches('Open', nodesFor(n), 'split');
    assert.deepEqual(split.matches.map(m => m.court), split.nodes.map(x => (x.round === 'Final' ? 'A' : x.court)), `${n}: split courts`);
    assert.ok(buildIndividualSingleElimMatches('Open', nodesFor(n), 'B').matches.every(m => m.court === 'B'));
  }
  const t = nodesFor(4), built = buildIndividualSingleElimMatches('Open', t, 'A');
  built.nodes[0].winner = { name: 'x', dojo: '' };
  assert.equal(t[0].winner, null, 'template nodes are copied');
});

test('advancement to the Final: byes (incl. empty bye slot for 5–6), labels, placements', () => {
  for (let n = 2; n <= 16; n++) {
    for (const mode of ['A', 'split']) {
      const comps = entrants(n);
      const { nodes, matches } = buildIndividualSingleElimMatches('Open', nodesFor(n), mode);
      const sync = () => apply(nodes, matches, syncIndividualSingleElim(nodes, matches, comps, mode));
      sync();
      const byeNodes = nodes.filter(x => !x.left || !x.right);
      for (const node of byeNodes) {
        const m = matches.find(x => x.elimNodeId === node.id);
        assert.equal(m.ready, false, `${n} ${node.id}: a bye bout is never ready`);
        if (!(node.left || node.right).ref) assert.ok(node.winner, `${n} ${node.id}: entrant with a bye advances at once`);
      }
      const finalNode = nodes.at(-1);
      if (finalNode.left?.ref && !nodes.find(x => x.id === finalNode.left.ref).winner) {
        assert.equal(sideLabelGeneric(finalNode.left, comps, nodes), `Winner ${finalNode.left.ref}`);
      }
      let guard = 0;
      while (!matches.at(-1).done && guard++ < 40) {
        const m = matches.find(x => x.ready && !x.done);
        assert.ok(m, `${n} ${mode}: a ready bout until the Final is done`);
        assert.ok(m.red && m.white);
        Object.assign(m, { rp: ['M'], wp: [], done: true });
        sync();
        const node = nodes.find(x => x.id === m.elimNodeId);
        assert.deepEqual(node.winner, { name: m.red, dojo: m.rdojo });
      }
      const final = matches.at(-1);
      assert.equal(final.position, 'Final');
      assert.equal(final.court, 'A', 'Final on court A');
      assert.equal(sideLabelGeneric(finalNode.left, comps, nodes), final.red);
      const places = individualPlacements(matches, null);
      assert.equal(places[0].name, final.red);
      assert.equal(places[1].name, final.white);
      assert.equal(places.length, 2 + matches.filter(m => m.position === 'Semifinal' && m.done).length);
      assert.deepEqual(syncIndividualSingleElim(nodes, matches, comps, mode).winners, [], 'stable once played');
    }
  }
  // 5 players: SF1's White slot is empty (bye); its Red is fed by QF1 and waits for it.
  const comps = entrants(5), { nodes, matches } = buildIndividualSingleElimMatches('Open', nodesFor(5), 'A');
  apply(nodes, matches, syncIndividualSingleElim(nodes, matches, comps, 'A'));
  const sf1 = nodes.find(x => x.id === 'SF1');
  assert.equal(sf1.right, null);
  assert.equal(sf1.winner, null, 'waits for QF1');
  const sf1m = matches.find(m => m.elimNodeId === 'SF1');
  assert.deepEqual([sf1m.red, sf1m.white, sf1m.ready, sf1m.position], ['', '', false, 'Semifinal']);
  assert.equal(sideLabelGeneric(sf1.left, comps, nodes), 'Winner QF1');
  assert.equal(sideLabelGeneric(sf1.right, comps, nodes), 'BYE');
  assert.equal(sideLabelGeneric({ team: 9 }, comps, nodes), 'Entry 9');
  assert.equal(sideLabelGeneric({}, comps, nodes), 'TBD');
  assert.equal(indivSide({ team: 1 }, [null], nodes), null, 'no-show slot');
  // Hikiwake does not advance; a missing Match Object is reported.
  const qf1 = matches.find(m => m.elimNodeId === 'QF1');
  Object.assign(qf1, { done: true, wp: [], rp: [] });
  const plan = syncIndividualSingleElim(nodes, matches.filter(m => m.elimNodeId !== 'F'), comps, 'A');
  assert.ok(!plan.winners.some(w => nodes[w.index].id === 'QF1'));
  assert.deepEqual([...new Set(plan.missing)], ['F']);
});

test('placement, build and advancement equal the pre-move legacy code on golden single-elimination scenarios', t => {
  const OLD = '8a6ed29';
  const oldFiles = ['06-engine-single-elim.js', '32-split-court-templates.js'].map(f => gitShow(OLD, `app/js/${f}`));
  if (oldFiles.includes(null)) return t.skip(`${OLD} not in this clone`);
  const oldSrc = oldFiles.join('\n');
  const MOVED = ['placeIndividualsForSingleElim', 'singleElimSlotInfo', 'chooseBestSeedSlot', 'protectedSeedQuadrant', 'singleElimBracketSize',
    'buildIndividualSingleElimMatches', 'indivSide', 'syncIndividualSingleElim', 'maybeAdvanceIndividualSingleElim', 'sideLabelGeneric',
    'specificMatchSideLabel', 'singleElimOrderMap', 'sortIndividualSingleElimMatches'];
  const SHARED = ['T', 'W', 'N', 'teamBracketNodesForCount', 'clubGroup', 'winnerOf', 'individualLogicalMatchKey', 'enforceUniqueIndividualMatches'];
  const load = src => {
    const ctx = vm.createContext({ state: null, console: { error() {} } });
    const tplConst = src === oldSrc ? oldSrc.slice(oldSrc.indexOf('const BRACKET_SLOT_TEMPLATES'), oldSrc.indexOf('};') + 2) : '';
    vm.runInContext(`${engine}\n${tplConst}\n${SHARED.map(n => extractFunction(html, n)).join('\n')}\n${MOVED.map(n => extractFunction(src, n)).join('\n')}`, ctx);
    return ctx;
  };
  const legacy = load(oldSrc), current = load(html);
  assert.ok(!/KSMEngine/.test(extractFunction(oldSrc, 'syncIndividualSingleElim')), 'old code is pre-move');
  assert.ok(/KSMEngine\.syncIndividualSingleElim/.test(extractFunction(html, 'syncIndividualSingleElim')), 'current code delegates');
  const dir = new URL('../golden/engine/', import.meta.url);
  let scenarios = 0, steps = 0;
  for (const file of fs.readdirSync(dir).filter(f => /^se-/.test(f)).sort()) {
    const g = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'));
    for (const d of g.setup) {
      const played = (g.final?.[d.name]?.matches || []).filter(m => m.singleElim && m.done);
      for (const court of new Set([d.court || 'A', 'split', 'B'])) {
        const run = ctx => {
          ctx.state = { singleElimNodes: {}, singleElimComps: {}, allMatches: {}, divisionCourts: { [d.name]: court }, currentDivision: d.name };
          const st = ctx.state, div = d.name, res = [];
          const comps = d.entrants.filter(e => e.status !== 'No-show').map(e => ({ ...e, division: div }));
          const ordered = ctx.placeIndividualsForSingleElim(comps);
          st.singleElimComps[div] = ordered;
          st.allMatches[div] = ctx.buildIndividualSingleElimMatches(div, ordered);
          const snap = () => res.push(JSON.stringify(st.allMatches[div]), JSON.stringify(st.singleElimNodes[div]),
            JSON.stringify(st.allMatches[div].map(m => [ctx.specificMatchSideLabel(m, 'white'), ctx.specificMatchSideLabel(m, 'red')])),
            JSON.stringify(Object.values(ctx.singleElimSlotInfo(ordered.length))));
          snap();
          for (const p of played) {
            const m = st.allMatches[div].find(x => x.elimNodeId === p.node);
            if (!m) continue;
            Object.assign(m, { wp: p.wp || [], rp: p.rp || [], done: true });
            ctx.maybeAdvanceIndividualSingleElim(m); snap();
          }
          // A no-show after the draw rebuilds with an empty slot.
          st.allMatches[div] = ctx.buildIndividualSingleElimMatches(div, ordered.map((c, i) => (i === ordered.length - 1 ? null : c))); snap();
          return res;
        };
        const a = run(legacy), b = run(current);
        assert.deepEqual(b, a, `${file} ${d.name} @${court}`);
        scenarios++; steps += a.length;
      }
    }
  }
  assert.ok(scenarios >= 40 && steps > 500, `scenarios: ${scenarios}, snapshots: ${steps}`);
});
