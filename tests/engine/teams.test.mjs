// app/engine/teams.ts + kachinuki.ts (roadmap 2.6): team bouts per format and team count,
// bracket templates and courts, bracket advancement, pairing winners (bout wins, points,
// representative), kachinuki progression, round-robin standings/placements, award modes,
// plus equivalence with the pre-move legacy code over the golden team scenarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  teamSlots, slotLabel, buildTeamMatches, teamBracketNodesForCount, teamPairMatchObjects, syncTeamBracket, teamWinner,
  teamPairSummary, maybeCreateTeamTiebreak, teamStandings, teamRoundRobinPlacements, teamFinalPlacements, teamRoundRobinProgress,
  teamRoundRobinTiebreakPlan, teamPairIds, teamPairMatches,
} from '../../app/engine/teams.ts';
import { kachinukiTransitionState, kachinukiPairWinner, maybeCreateKachinukiNext } from '../../app/engine/kachinuki.ts';
import { html, engine, extractFunction } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

const OLD = 'd3931d8';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const makeTeams = n => Array.from({ length: n }, (_, i) => {
  const L = LETTERS[i % 26] + (i >= 26 ? i : '');
  return { team: `Team ${L}`, senpo: `T${L}1`, jiho: `T${L}J`, chuken: `T${L}2`, fukusho: `T${L}F`, taisho: `T${L}3` };
});
const POSITION_KEYS = ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'teamWhite', 'teamRed', 'position', 'teamPair', 'done', 'wp', 'rp', 'type', 'origin', 'court'];
const settings = (teamFormat, teamTournamentFormat = 'Round Robin') => ({ teamFormat, teamTournamentFormat });
const score = (m, wp, rp) => Object.assign(m, { wp, rp, done: true });
const applySync = (nodes, arr, plan) => { plan.winners.forEach(w => { nodes[w.index].winner = w.winner; }); arr.push(...plan.added); };

test('positions per team format', () => {
  assert.deepEqual(teamSlots('3-Person Team'), ['senpo', 'chuken', 'taisho']);
  assert.deepEqual(teamSlots('Kachinuki'), ['senpo', 'chuken', 'taisho']);
  assert.deepEqual(teamSlots('5-Person Team'), ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho']);
  assert.deepEqual(teamSlots(''), teamSlots('5-Person Team'), 'missing format means 5-person');
  assert.deepEqual(['senpo', 'jiho', 'chuken', 'fukusho', 'taisho', 'x'].map(slotLabel), ['Senpo', 'Jiho', 'Chuken', 'Fukusho', 'Taisho', 'x']);
});

test('round robin bouts per format and team count (2–8)', () => {
  for (const [fmt, per] of [['3-Person Team', 3], ['5-Person Team', 5], ['Kachinuki', 1]]) {
    for (let n = 2; n <= 8; n++) {
      const teams = makeTeams(n), { singleElim, matches } = buildTeamMatches('Team Tournament', teams, settings(fmt));
      assert.equal(singleElim, false);
      assert.equal(matches.length, (n * (n - 1) / 2) * per, `${fmt} ${n}`);
      const pairs = [...new Set(matches.map(m => m.teamPair))];
      assert.equal(pairs.length, n * (n - 1) / 2);
      for (const m of matches) {
        const [i, j] = m.teamPair.split('-').map(Number);
        assert.ok(i < j);
        assert.equal(m.teamWhite, teams[i].team); assert.equal(m.teamRed, teams[j].team);
        assert.equal(m.court, (i + j) % 2 === 0 ? 'A' : 'B');
        assert.equal(m.pool, 'A');
      }
    }
  }
  const [senpo] = buildTeamMatches('D', makeTeams(3), settings('5-Person Team')).matches;
  assert.deepEqual(Object.keys(senpo), POSITION_KEYS, 'position bout field order');
  assert.deepEqual([senpo.white, senpo.red, senpo.position, senpo.type, senpo.origin], ['TA1', 'TB1', 'Senpo', 'teamPosition', 'TEMPLATE']);
  const [k] = buildTeamMatches('D', makeTeams(3), settings('Kachinuki')).matches;
  assert.deepEqual(Object.keys(k), [...POSITION_KEYS, 'lineupW', 'lineupR', 'wIndex', 'rIndex'], 'kachinuki bout field order');
  assert.deepEqual([k.lineupW, k.lineupR, k.position], [['TA1', 'TA2', 'TA3'], ['TB1', 'TB2', 'TB3'], 'Kachinuki']);
  // Missing members get a placeholder name.
  const [p] = teamPairMatchObjects('D', { team: 'X' }, { team: 'Y', senpo: 'Y1' }, 'A', '0-1', 'A', '3-Person Team', teamSlots('3-Person Team'));
  assert.deepEqual([p.white, p.red], ['X Senpo', 'Y1']);
  assert.deepEqual(buildTeamMatches('D', makeTeams(4), settings('3-Person Team', 'Single Elimination')), { singleElim: true, matches: [] });
  assert.deepEqual(buildTeamMatches('D', makeTeams(4), settings('3-Person Team', '')), { singleElim: true, matches: [] }, 'default is single elimination');
});

test('bracket templates: every team placed once, feeders earlier, courts by half, Final on A', () => {
  assert.deepEqual(teamBracketNodesForCount(0), []); assert.deepEqual(teamBracketNodesForCount(1), []);
  assert.equal(teamBracketNodesForCount(33), null); assert.equal(teamBracketNodesForCount(4.5), null);
  for (let n = 2; n <= 32; n++) {
    const nodes = teamBracketNodesForCount(n);
    const teams = nodes.flatMap(x => [x.left, x.right]).filter(s => s?.team).map(s => s.team).sort((a, b) => a - b);
    assert.deepEqual(teams, Array.from({ length: n }, (_, i) => i + 1), `${n}: each team once`);
    nodes.forEach((node, i) => {
      assert.deepEqual(Object.keys(node), ['id', 'round', 'court', 'left', 'right', 'slot', 'winner']);
      for (const s of [node.left, node.right]) if (s?.ref) assert.ok(nodes.slice(0, i).some(x => x.id === s.ref), `${n}: ${node.id} fed by earlier ${s.ref}`);
    });
    assert.equal(new Set(nodes.map(x => x.id)).size, nodes.length, `${n}: unique ids`);
    const final = nodes.filter(x => x.round === 'Final');
    assert.equal(final.length, 1); assert.equal(final[0].court, 'A'); assert.equal(nodes.at(-1).id, 'F');
    if (n >= 4) assert.deepEqual(nodes.filter(x => x.round === 'Semifinal').map(x => x.court), ['A', 'B']);
  }
  assert.deepEqual(teamBracketNodesForCount(4).map(x => [x.id, x.court]), [['SF1', 'A'], ['SF2', 'B'], ['F', 'A']]);
  assert.equal(teamBracketNodesForCount(32).filter(x => x.round === 'Round of 32').length, 16);
});

test('bracket templates and a legacy global parity equal the pre-move code (2–33 teams)', t => {
  const old = gitShow(OLD, 'app/js/07-engine-team-bracket.js');
  if (old === null) return t.skip(`${OLD} not in this clone`);
  const ctx = vm.createContext({ alerted: 0 });
  vm.runInContext(`alert=()=>alerted++;\n${['T', 'W', 'N', 'teamBracketNodesForCount'].map(n => extractFunction(old, n)).join('\n')}`, ctx);
  const cur = vm.createContext({ alerted: 0 });
  vm.runInContext(`${engine}\nalert=()=>alerted++;\n${['T', 'W', 'N', 'teamBracketNodesForCount'].map(n => extractFunction(html, n)).join('\n')}`, cur);
  for (let n = 0; n <= 33; n++) {
    assert.equal(JSON.stringify(cur.teamBracketNodesForCount(n)), JSON.stringify(ctx.teamBracketNodesForCount(n)), `${n}`);
  }
  assert.deepEqual([cur.alerted, ctx.alerted], [1, 1], 'unsupported count alerts once');
});

test('single elimination bracket fills and advances: byes, White = right side, winner by bout wins, points, representative', () => {
  const teams = makeTeams(5), nodes = teamBracketNodesForCount(5).map(n => ({ ...n })), arr = [];
  applySync(nodes, arr, syncTeamBracket('D', nodes, arr, teams, '3-Person Team'));
  assert.deepEqual([...new Set(arr.map(m => m.teamPair))], ['node-QF1', 'node-QF2'], 'only nodes with both teams known');
  const qf1 = arr.filter(m => m.teamNodeId === 'QF1');
  assert.deepEqual(qf1.map(m => [m.teamWhite, m.teamRed, m.pool, m.court, m.bracketSlot]), Array(3).fill(['Team B', 'Team A', 'Quarterfinal', 'A', 0]));
  assert.deepEqual(Object.keys(qf1[0]), [...POSITION_KEYS, 'teamNodeId', 'bracketSlot']);
  // QF1: White wins 2 bouts to 1.
  score(qf1[0], ['M'], []); score(qf1[1], [], ['K']); score(qf1[2], ['D'], []);
  assert.equal(teamWinner(arr, 'node-QF1'), 'Team B');
  // QF2: 1-1 on bouts with a draw, Red ahead on points.
  const qf2 = arr.filter(m => m.teamNodeId === 'QF2');
  score(qf2[0], ['M'], []); score(qf2[1], [], ['K', 'D']); score(qf2[2], ['M'], ['M']);
  assert.deepEqual(teamPairSummary(arr, 'node-QF2'), { teamWhite: 'Team D', teamRed: 'Team C', wWins: 1, rWins: 1, wPts: 2, rPts: 3, done: 3, total: 3, matches: qf2 });
  assert.equal(teamWinner(arr, 'node-QF2'), 'Team C');
  const plan = syncTeamBracket('D', nodes, arr, teams, '3-Person Team');
  assert.deepEqual(plan.winners.map(w => [nodes[w.index].id, w.winner]), [['QF1', 'Team B'], ['QF2', 'Team C'], ['SF1', 'Team B']], 'SF1 bye advances Team B');
  applySync(nodes, arr, plan);
  assert.deepEqual(arr.filter(m => m.teamNodeId === 'SF2').map(m => [m.teamWhite, m.teamRed, m.court]), Array(3).fill(['Team E', 'Team C', 'B']));
  // SF2 level on bouts and points: representative playoff decides.
  const sf2 = arr.filter(m => m.teamNodeId === 'SF2');
  score(sf2[0], ['M'], []); score(sf2[1], [], ['K']); score(sf2[2], [], []);
  assert.equal(teamWinner(arr, 'node-SF2'), null);
  const tb = maybeCreateTeamTiebreak(sf2[2], arr, '3-Person Team');
  assert.equal(tb.anchor, sf2[2]); assert.equal(tb.dynamicType, 'TEAM_3_PERSON_REPRESENTATIVE');
  assert.deepEqual(Object.keys(tb.playoff), ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'teamWhite', 'teamRed', 'position', 'teamPair', 'done', 'wp', 'rp', 'tiebreak', 'type', 'court', 'teamNodeId', 'bracketSlot', 'parentTeamMatch']);
  assert.deepEqual([tb.playoff.white, tb.playoff.red, tb.playoff.court, tb.playoff.teamNodeId, tb.playoff.bracketSlot], ['Team E Representative', 'Team C Representative', 'B', 'SF2', 1]);
  arr.push(tb.playoff);
  assert.equal(maybeCreateTeamTiebreak(sf2[2], arr, '3-Person Team'), null, 'one playoff per pairing');
  assert.equal(syncTeamBracket('D', nodes, arr, teams, '3-Person Team').winners.length, 0, 'waits for the playoff');
  score(tb.playoff, [], ['M']);
  assert.equal(teamWinner(arr, 'node-SF2'), 'Team C');
  applySync(nodes, arr, syncTeamBracket('D', nodes, arr, teams, '3-Person Team'));
  const final = arr.filter(m => m.teamNodeId === 'F');
  assert.deepEqual(final.map(m => [m.teamWhite, m.teamRed, m.court]), Array(3).fill(['Team C', 'Team B', 'A']));
  assert.equal(teamFinalPlacements(nodes, teams), null, 'no placements before the Final');
  final.forEach(m => score(m, ['M'], []));
  applySync(nodes, arr, syncTeamBracket('D', nodes, arr, teams, '3-Person Team'));
  assert.deepEqual(teamFinalPlacements(nodes, teams), { first: 'Team C', second: 'Team B', thirds: ['Team E'], roundRobin: false }, 'SF1 was a bye: one third place');
});

test('representative playoff only when level on bouts and points; 5-person type', () => {
  const arr = buildTeamMatches('D', makeTeams(2), settings('5-Person Team')).matches;
  arr.slice(0, 4).forEach(m => score(m, [], []));
  assert.equal(maybeCreateTeamTiebreak(arr[3], arr, '5-Person Team'), null, 'not all bouts done');
  score(arr[4], ['M'], []);
  assert.equal(maybeCreateTeamTiebreak(arr[4], arr, '5-Person Team'), null, 'not level');
  score(arr[4], [], []);
  assert.equal(maybeCreateTeamTiebreak(arr[4], arr, '5-Person Team').dynamicType, 'TEAM_5_PERSON_REPRESENTATIVE');
  assert.equal(maybeCreateTeamTiebreak(arr[1], arr, '').anchor, arr[4], 'anchored on the last position bout');
  assert.equal(maybeCreateTeamTiebreak({ ...arr[4], tiebreak: true }, arr, ''), null);
  assert.equal(maybeCreateTeamTiebreak(null, arr, ''), null);
});

test('kachinuki: winner stays, draws, lineups exhausted, playoff', () => {
  assert.deepEqual(kachinukiTransitionState({ wp: ['M'], rp: [], wIndex: 0, rIndex: 0 }), { wi: 0, ri: 1, whiteExhausted: false, redExhausted: false });
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: ['K'], wIndex: 1, rIndex: 2 }), { wi: 2, ri: 2, whiteExhausted: false, redExhausted: false });
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 0, rIndex: 0 }), { wi: 1, ri: 1, whiteExhausted: false, redExhausted: false }, 'draw: both out');
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 2, rIndex: 0 }), { wi: 2, ri: 1, whiteExhausted: false, redExhausted: false }, 'draw: last White stays');
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 1, rIndex: 2 }), { wi: 2, ri: 2, whiteExhausted: false, redExhausted: false }, 'draw: last Red stays');
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 2, rIndex: 2 }), { wi: 3, ri: 3, whiteExhausted: true, redExhausted: true });

  const arr = buildTeamMatches('D', makeTeams(2), settings('Kachinuki')).matches;
  const play = (wp, rp) => {
    const m = arr.at(-1); score(m, wp, rp);
    const next = maybeCreateKachinukiNext(m);
    if (next) arr.push(next.match);
    return next;
  };
  let next = play(['M'], []);
  assert.equal(next.kind, 'continuation');
  assert.deepEqual([next.match.white, next.match.red, next.match.wIndex, next.match.rIndex, next.match.origin], ['TA1', 'TB2', 0, 1, 'TEMPLATE_CONTINUATION']);
  assert.deepEqual(Object.keys(next.match), ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'teamWhite', 'teamRed', 'position', 'teamPair', 'done', 'wp', 'rp', 'type', 'court', 'lineupW', 'lineupR', 'wIndex', 'rIndex', 'teamNodeId', 'bracketSlot', 'origin']);
  assert.equal(kachinukiPairWinner(arr), null);
  next = play([], []); // draw: TA1 and TB2 both out
  assert.deepEqual([next.match.white, next.match.red], ['TA2', 'TB3']);
  next = play([], ['K']); // TB3 beats TA2
  assert.deepEqual([next.match.white, next.match.red], ['TA3', 'TB3']);
  next = play([], []); // last players draw: both lineups exhausted
  assert.equal(next.kind, 'playoff');
  assert.deepEqual([next.match.white, next.match.position, next.match.tiebreak, next.match.type], ['Team A Representative', 'Kachinuki Playoff', true, 'teamPlayoff']);
  assert.equal(teamWinner(arr, '0-1'), null, 'playoff pending');
  assert.equal(maybeCreateKachinukiNext(next.match), null, 'playoff has no next bout');
  score(arr.at(-1), [], ['M']);
  assert.equal(teamWinner(arr, '0-1'), 'Team B');

  const won = buildTeamMatches('D', makeTeams(2), settings('Kachinuki')).matches;
  for (let i = 0; i < 3; i++) { const m = won.at(-1); score(m, ['M'], []); const n = maybeCreateKachinukiNext(m); if (n) won.push(n.match); }
  assert.equal(won.length, 3, 'TA1 beats all three: no fourth bout');
  assert.equal(kachinukiPairWinner(won), 'Team A'); assert.equal(teamWinner(won, '0-1'), 'Team A');
});

test('round robin standings, progress and placements', () => {
  const teams = makeTeams(4), arr = buildTeamMatches('D', teams, settings('3-Person Team')).matches;
  assert.deepEqual(teamRoundRobinProgress(arr), { complete: 0, total: 6 });
  // Nothing played: all level, so they share the rank (F27; before, ranks 1-4 by name), listed by name.
  assert.deepEqual(teamStandings(arr, teams).map(r => [r.name, r.played, r.rank, r.nameFallback]), teams.map(t => [t.team, 0, 1, true]));
  // Lower-numbered team wins every pairing 2-1; pairing 0-1 on points only (1-1 bouts, one draw).
  for (const m of arr) {
    const [i, j] = m.teamPair.split('-').map(Number);
    if (i === 0 && j === 1) score(m, m.position === 'Senpo' ? ['M', 'K'] : [], m.position === 'Chuken' ? ['D'] : []);
    else score(m, m.position === 'Taisho' ? [] : ['M'], m.position === 'Taisho' ? ['M'] : []);
  }
  const rows = teamStandings(arr, teams);
  assert.deepEqual(Object.keys(rows[0]), ['name', 'played', 'wins', 'losses', 'matchWins', 'pts', 'rank', 'nameFallback']);
  assert.deepEqual(rows.map(r => [r.name, r.wins, r.losses, r.played]), [['Team A', 3, 0, 3], ['Team B', 2, 1, 3], ['Team C', 1, 2, 3], ['Team D', 0, 3, 3]]);
  assert.deepEqual(teamRoundRobinProgress(arr), { complete: 6, total: 6 });
  assert.equal(teamRoundRobinPlacements(false, arr, teams), null, 'not before the division is complete');
  const p = teamRoundRobinPlacements(true, arr, teams);
  assert.deepEqual([p.first, p.second, p.thirds, p.roundRobin], ['Team A', 'Team B', ['Team C'], true]);
  assert.equal(teamRoundRobinPlacements(true, [], []), null);
  // Level pairing without a playoff result does not count.
  const lvl = buildTeamMatches('D', makeTeams(2), settings('3-Person Team')).matches; lvl.forEach(m => score(m, [], []));
  assert.deepEqual(teamStandings(lvl, makeTeams(2)).map(r => r.played), [0, 0]);
});

// The award-mode rule lived in teamFinalResultsHtml() (09-), removed with the legacy Results
// renderer in M.13 (it only ran for the removed court queue's final results). The same rule is
// implemented by resultPlacements() (27-: Results, the division-complete panels, print) and by
// ksmFinalResults() (35-: the court queue's team results, which mirrors teamFinalResultsHtml()).
test('award mode: top1 / top2 / dual3 rows from the team placements', () => {
  const placements = { first: 'A', second: 'B', thirds: ['C', 'D'], roundRobin: false };
  const ctx = vm.createContext({ state: {}, KSMEngine: {}, teamFinalPlacements: () => placements,
    divisionComplete: () => true, isTeamDivision: () => true });
  ctx.ksmTeamSettings=()=>({teamAwardMode:ctx.state.teamAwardMode});
  vm.runInContext(['resultPlacements', 'ksmFinalResults', 'ksmText'].map(n => extractFunction(html, n)).join('\n'), ctx);
  const plain = v => JSON.parse(JSON.stringify(v));  // out of the vm realm, for deepEqual
  const rows = mode => { ctx.state.teamAwardMode = mode; return plain(ctx.resultPlacements('D').map(r => r.name)); };
  const lines = mode => { ctx.state.teamAwardMode = mode; return plain(ctx.ksmFinalResults('D').results.lines.map(l => `${l.place} ${l.name}`)); };
  assert.deepEqual(rows('top1'), ['A']);
  assert.deepEqual(rows(undefined), ['A', 'B'], 'default top2');
  assert.deepEqual(rows('dual3'), ['A', 'B', 'C', 'D']);
  assert.deepEqual(plain(ctx.resultPlacements('D').map(r => [r.place, r.tier])), [['1st', 'gold'], ['2nd', 'silver'], ['3rd', 'bronze'], ['3rd', 'bronze']]);
  assert.deepEqual(lines('top1'), ['🥇 1st A']);
  assert.deepEqual(lines(undefined), ['🥇 1st A', '🥈 2nd B'], 'default top2');
  assert.deepEqual(lines('dual3'), ['🥇 1st A', '🥈 2nd B', '🥉 3rd C', '🥉 3rd D']);
  assert.equal(ctx.ksmFinalResults('D').results.title, 'Team Results');
  ctx.teamFinalPlacements = () => null;
  assert.deepEqual(plain(ctx.resultPlacements('D')), []);
  // teamFinalResultsHtml() drew "Completed" without placements: the court queue's results: null.
  assert.deepEqual(plain(ctx.ksmFinalResults('D')), { kind: 'results', results: null });
});

// ---- F27: team round-robin ties (the owners' rule, WKC style) ----------------------------------
// Plays every pairing: result(teamWhite, teamRed) -> [[wp, rp], ...] per position bout.
function playRoundRobin(arr, result) {
  for (const pair of teamPairIds(arr)) {
    const bouts = teamPairMatches(arr, pair), r = result(bouts[0].teamWhite, bouts[0].teamRed);
    bouts.forEach((m, i) => score(m, ...(r[i] || [[], []])));
  }
}
// The winner takes the first bout 1-0 (Men), the other bouts are 0-0 draws.
const oneBout = (winner, white) => [winner === white ? [['M'], []] : [[], ['M']]];
const rows = (arr, teams) => teamStandings(arr, teams).map(r => [r.name, r.wins, r.matchWins, r.pts, r.rank, r.nameFallback]);

test('F27: ranked by team wins, then individual bout wins, then points', () => {
  const teams = makeTeams(4), arr = buildTeamMatches('D', teams, settings('3-Person Team')).matches;
  // A beats everyone 3-0; B, C, D each win one pairing (B > C 3-0, C > D 2-0, D > B 1-0).
  const sweep = { 'Team B|Team C': 3, 'Team C|Team D': 2, 'Team B|Team D': 1 };
  playRoundRobin(arr, (w, r) => {
    const key = [w, r].sort().join('|'), aWins = w === 'Team A' || r === 'Team A';
    const winner = aWins ? 'Team A' : { 'Team B|Team C': 'Team B', 'Team C|Team D': 'Team C', 'Team B|Team D': 'Team D' }[key];
    const n = aWins ? 3 : sweep[key];
    return [0, 1, 2].map(i => (i < n ? (winner === w ? [['M'], []] : [[], ['M']]) : [[], []]));
  });
  assert.deepEqual(rows(arr, teams), [['Team A', 3, 9, 9, 1, false], ['Team B', 1, 3, 3, 2, false], ['Team C', 1, 2, 2, 3, false], ['Team D', 1, 1, 1, 4, false]],
    'B, C and D level on team wins: bout wins decide');
  assert.equal(teamRoundRobinTiebreakPlan(arr.at(-1), arr, teams, '3-Person Team'), null, 'nobody level: no daihyosen');
  // Points decide when team wins and bout wins are level: each wins one pairing by one bout.
  const three = makeTeams(3), arr3 = buildTeamMatches('D', three, settings('3-Person Team')).matches;
  playRoundRobin(arr3, (w, r) => {
    const key = [w, r].sort().join('|');
    if (key === 'Team A|Team B') return w === 'Team A' ? [[['M', 'K'], []]] : [[[], ['M', 'K']]];   // A wins 2-0
    if (key === 'Team B|Team C') return w === 'Team B' ? [[['M'], []]] : [[[], ['M']]];             // B wins 1-0
    return w === 'Team C' ? [[['M'], []], [['K'], ['K']]] : [[[], ['M']], [['K'], ['K']]];          // C beats A 1-0, a 1-1 draw
  });
  assert.deepEqual(rows(arr3, three), [['Team A', 1, 1, 3, 1, false], ['Team C', 1, 1, 2, 2, false], ['Team B', 1, 1, 1, 3, false]]);
});

test('F27: three teams level for 1st play a daihyosen round; a circle plays another; kachinuki and 5-person types', () => {
  for (const [fmt, type] of [['3-Person Team', 'TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK'], ['5-Person Team', 'TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK']]) {
    const teams = makeTeams(3), arr = buildTeamMatches('D', teams, settings(fmt)).matches;
    // A > B, B > C, C > A, each by one 1-0 bout: level on all three.
    playRoundRobin(arr, (w, r) => oneBout({ 'Team A|Team B': 'Team A', 'Team B|Team C': 'Team B', 'Team A|Team C': 'Team C' }[[w, r].sort().join('|')], w));
    assert.deepEqual(rows(arr, teams).map(r => [r[0], r[4], r[5]]), [['Team A', 1, true], ['Team B', 1, true], ['Team C', 1, true]]);
    assert.equal(teamRoundRobinTiebreakPlan(arr[0], arr.slice(0, -1).concat({ ...arr.at(-1), done: false }), teams, fmt), null, 'not before every pairing is decided');
    const s1 = teamRoundRobinTiebreakPlan(arr.at(-1), arr, teams, fmt);
    assert.equal(s1.dynamicType, type);
    assert.deepEqual(s1.bouts.map(b => [b.teamWhite, b.teamRed, b.tiebreakSeries, b.tiebreakIndex, b.teamPair]),
      [['Team A', 'Team B', 1, 0, 'daihyosen-1-0'], ['Team C', 'Team B', 1, 1, 'daihyosen-1-1'], ['Team C', 'Team A', 1, 2, 'daihyosen-1-2']], 'the 3-player order');
    assert.ok(s1.bouts.every(b => b.court === arr.at(-1).court && b.position === 'Daihyosen' && b.roundRobinTiebreak && b.done === false));
    // Series 1 a circle again (A > B, B > C, C > A): a second series between the same three.
    const all = [...arr, ...s1.bouts];
    s1.bouts.forEach(b => score(b, ...(b.teamWhite === 'Team A' || b.teamWhite === 'Team C' && b.teamRed === 'Team A' ? [['M'], []] : [[], ['M']])));
    assert.deepEqual(rows(all, teams).map(r => r[4]), [1, 1, 1], 'still level after a circle');
    const s2 = teamRoundRobinTiebreakPlan(all.at(-1), all, teams, fmt);
    assert.deepEqual(s2.bouts.map(b => [b.teamWhite, b.teamRed, b.tiebreakSeries]), [['Team A', 'Team B', 2], ['Team C', 'Team B', 2], ['Team C', 'Team A', 2]]);
    // Series 2: B beats both, A beats C -> B, A, C.
    s2.bouts.forEach(b => score(b, ...(b.teamRed === 'Team B' ? [[], ['M']] : b.teamRed === 'Team A' ? [[], ['M']] : [['M'], []])));
    const done = [...all, ...s2.bouts];
    assert.deepEqual(rows(done, teams), [['Team B', 1, 1, 1, 1, false], ['Team A', 1, 1, 1, 2, false], ['Team C', 1, 1, 1, 3, false]], 'records unchanged, order by the daihyosen');
    assert.deepEqual(teamRoundRobinProgress(done), { complete: 3, total: 3 }, 'daihyosen bouts are not pairings');
    const p = teamRoundRobinPlacements(true, done, teams);
    assert.deepEqual([p.first, p.second, p.thirds], ['Team B', 'Team A', ['Team C']]);
    assert.equal(teamRoundRobinTiebreakPlan(done.at(-1), done, teams, fmt), null);
  }
  // Kachinuki: its own approved type.
  const teams = makeTeams(2), arr = buildTeamMatches('D', teams, settings('Kachinuki')).matches;
  assert.equal(teamRoundRobinTiebreakPlan(arr[0], arr, teams, 'Kachinuki'), null, 'kachinuki pairing undecided');
  const kTeams = makeTeams(3), k = buildTeamMatches('D', kTeams, settings('3-Person Team')).matches;
  playRoundRobin(k, (w, r) => oneBout({ 'Team A|Team B': 'Team A', 'Team B|Team C': 'Team B', 'Team A|Team C': 'Team C' }[[w, r].sort().join('|')], w));
  assert.equal(teamRoundRobinTiebreakPlan(k.at(-1), k, kTeams, 'Kachinuki').dynamicType, 'KACHINUKI_ROUND_ROBIN_TIEBREAK');
});

test('F27: teams level below the counted places share the rank, no daihyosen; a bracket never gets one', () => {
  // Six teams: A, B, C beat every team below them; D > E, E > F, F > D (level for 4th-6th).
  const teams = makeTeams(6), arr = buildTeamMatches('D', teams, settings('3-Person Team')).matches;
  const order = ['Team A', 'Team B', 'Team C'], circle = { 'Team D|Team E': 'Team D', 'Team E|Team F': 'Team E', 'Team D|Team F': 'Team F' };
  playRoundRobin(arr, (w, r) => {
    const top = [w, r].filter(x => order.includes(x)).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    return oneBout(top || circle[[w, r].sort().join('|')], w);
  });
  assert.deepEqual(rows(arr, teams).map(r => [r[0], r[1], r[4], r[5]]),
    [['Team A', 5, 1, false], ['Team B', 4, 2, false], ['Team C', 3, 3, false], ['Team D', 1, 4, true], ['Team E', 1, 4, true], ['Team F', 1, 4, true]]);
  assert.equal(teamRoundRobinTiebreakPlan(arr.at(-1), arr, teams, '3-Person Team'), null, '4th-6th do not count');
  const p = teamRoundRobinPlacements(true, arr, teams);
  assert.deepEqual([p.first, p.second, p.thirds], ['Team A', 'Team B', ['Team C']]);
  // A bracket bout (teamNodeId) has its own representative playoffs.
  const nodes = teamBracketNodesForCount(2), bracketTeams = makeTeams(2), bouts = [];
  applySync(nodes, bouts, syncTeamBracket('D', nodes, bouts, bracketTeams, '3-Person Team'));
  bouts.forEach(m => score(m, [], []));
  assert.equal(teamRoundRobinTiebreakPlan(bouts.at(-1), bouts, bracketTeams, '3-Person Team'), null);
});

test('team engine equals the pre-move legacy code over the golden team scenarios', t => {
  const files = ['05-engine-team-matches.js', '07-engine-team-bracket.js', '09-results-and-awards.js', '13-engine-standings-and-tiebreaks.js', '16-court-context-and-pool-editing.js'];
  const oldFiles = files.map(f => gitShow(OLD, `app/js/${f}`));
  if (oldFiles.includes(null)) return t.skip(`${OLD} not in this clone`);
  const oldSrc = oldFiles.join('\n');
  const MOVED = ['teamSlots', 'slotLabel', 'buildTeamMatches', 'teamSideTeam', 'nodeHasMatch', 'nodePairId', 'syncTeamBracket', 'T', 'W', 'N',
    'teamBracketNodesForCount', 'addTeamPairMatches', 'kachinukiTransitionState', 'kachinukiPairWinner', 'teamWinner', 'maybeAdvanceTeamBracket',
    'teamPairMatches', 'teamPositionMatches', 'teamPairSummary', 'teamPairIds', 'teamRoundRobinPairResolved', 'teamStandings',
    'teamRoundRobinProgress', 'teamRoundRobinPlacements', 'maybeCreateTeamTiebreak', 'teamNodeSideName', 'teamFinalPlacements', 'maybeCreateKachinukiNext'];
  const SHARED = ['winnerOf', 'isTeamMatch', 'teamNodeOrderMap', 'teamPairOrderMap', 'teamPositionOrder', 'teamMatchSortKey', 'sortTeamMatches', 'isTeamRoundRobinDivision'];
  const stubs = `alert=()=>{};isTeamDivision=()=>true;eligibleTeams=()=>teamsList;tournamentSettings=()=>settings;ksmTeamSettings=()=>({...settings,teamAwardMode:state.teamAwardMode||settings.teamAwardMode});
    divisionComplete=div=>{const ms=state.allMatches[div]||[];return ms.length&&ms.every(m=>m.done)};
    appendApprovedDynamicMatches=(div,after,match,type)=>{const arr=state.allMatches[div]||[];const list=Array.isArray(match)?match:[match];list.forEach(x=>{x.origin='TIEBREAK';x.dynamicType=type});arr.splice(arr.indexOf(after)+1,0,...list);state.allMatches[div]=arr;sortTeamMatches(div);return list;};`;
  const load = src => {
    const ctx = vm.createContext({ state: null, teamsList: null, settings: null });
    vm.runInContext(`${engine}\n${stubs}\n${SHARED.map(n => extractFunction(html, n)).join('\n')}\n${MOVED.map(n => extractFunction(src, n)).join('\n')}`, ctx);
    return ctx;
  };
  const legacy = load(oldSrc), current = load(html);
  assert.ok(!/KSMEngine/.test(extractFunction(oldSrc, 'syncTeamBracket')), 'old code is pre-move');
  assert.ok(/KSMEngine\.syncTeamBracket/.test(extractFunction(html, 'syncTeamBracket')), 'current code delegates');
  const dir = new URL('../golden/engine/', import.meta.url);
  const outcome = line => {
    const [side, ...pts] = line.split(' | ').at(-1).split(' ');
    return { side, wp: pts.filter(p => p[0] === 'W').map(p => p.slice(1)), rp: pts.filter(p => p[0] === 'R').map(p => p.slice(1)) };
  };
  let scenarios = 0, steps = 0, daihyosenScenarios = 0;
  for (const file of fs.readdirSync(dir).filter(f => /^(team[35]|kachinuki)-/.test(f)).sort()) {
    const g = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'));
    const d = g.setup.find(s => s.team);
    const results = (g.play_order || []).map(outcome);
    const div = 'Team Tournament';
    for (const count of new Set([d.teams, 2, 3, 6, 8])) {
      for (const tfmt of ['Single Elimination', 'Round Robin']) {
        if (tfmt === 'Round Robin' && count > 5) continue;
        const run = ctx => {
          ctx.settings = { teamFormat: d.format, teamTournamentFormat: tfmt };
          ctx.teamsList = makeTeams(count);
          ctx.state = { allMatches: {}, teamBracketNodes: {}, teamElimTeams: {}, teamAwardMode: 'dual3' };
          const st = ctx.state, res = [];
          const snap = () => res.push(JSON.parse(JSON.stringify({ matches: st.allMatches[div], nodes: st.teamBracketNodes[div] || null,
            standings: ctx.teamStandings(div), placements: ctx.teamFinalPlacements(div), progress: ctx.teamRoundRobinProgress(div) })));
          st.allMatches[div] = ctx.buildTeamMatches(div, ctx.teamsList);
          ctx.sortTeamMatches(div); snap();
          for (let i = 0; i < 200; i++) {
            const m = st.allMatches[div].find(x => !x.done);
            if (!m) break;
            const r = results[i % Math.max(1, results.length)] || { wp: ['M'], rp: [] };
            // A daihyosen (F27, current code only) needs a winner: a drawn result goes to White.
            const level = m.roundRobinTiebreak && r.wp.length === r.rp.length;
            Object.assign(m, { wp: level ? ['M'] : [...r.wp], rp: level ? [] : [...r.rp], done: true });
            ctx.maybeCreateTeamTiebreak(m); ctx.maybeCreateKachinukiNext(m); ctx.maybeAdvanceTeamBracket(m); snap();
          }
          return res;
        };
        const a = run(legacy), b = run(current), label = `${file} ${count} teams ${tfmt}`;
        // F27 changed the round-robin ranking (team wins, bout wins, points, then a daihyosen for
        // 1st-3rd; level teams share the rank) and adds daihyosen bouts after the last pairing.
        // Everything else must equal the pre-move code step by step: the pairings' bouts, the
        // bracket, the progress and every team's record; the order must follow the new rule.
        const record = rows => rows.map(r => [r.name, r.played, r.wins, r.losses, r.matchWins, r.pts]).sort((x, y) => x[0].localeCompare(y[0]));
        const pairings = ms => (ms || []).filter(m => !m.roundRobinTiebreak);
        assert.equal(b.length >= a.length, true, `${label}: fewer steps`);
        b.forEach((cur, i) => {
          const old = a[Math.min(i, a.length - 1)], at = `${label} step ${i}`;
          if (i < a.length) {
            assert.deepEqual(pairings(cur.matches), old.matches, `${at}: bouts`);
            assert.deepEqual(cur.nodes, old.nodes, `${at}: bracket`);
          } else assert.ok(cur.matches.slice(old.matches.length).every(m => m.roundRobinTiebreak), `${at}: only daihyosen bouts after the round robin`);
          assert.deepEqual(cur.progress, old.progress, `${at}: progress`);
          assert.deepEqual(record(cur.standings), record(old.standings), `${at}: records`);
          cur.standings.forEach((row, k) => {
            const prev = cur.standings[k - 1];
            if (!prev) return assert.equal(row.rank, 1, `${at}: first rank`);
            const order = prev.wins - row.wins || prev.matchWins - row.matchWins || prev.pts - row.pts;
            assert.ok(order >= 0, `${at}: ${prev.name} ahead of ${row.name} breaks the order rule`);
            assert.ok(row.rank === prev.rank ? order === 0 && row.nameFallback && prev.nameFallback : row.rank === k + 1, `${at}: rank of ${row.name}`);
          });
          if (tfmt !== 'Round Robin') assert.deepEqual(cur.placements, old.placements, `${at}: bracket placements`);
          else if (cur.matches.some(m => !m.done)) assert.equal(cur.placements, null, `${at}: no placements before every bout (and daihyosen) is played`);
          else {
            // The round robin's placements come from the (new) standings, 1st-3rd decided.
            const top = cur.standings.slice(0, 3);
            assert.deepEqual(cur.placements, { first: top[0].name, second: top[1]?.name || '', thirds: top[2] ? [top[2].name] : [], standings: cur.standings, roundRobin: true }, `${at}: placements`);
            assert.ok(top.every((r, k) => r.rank === k + 1), `${at}: 1st-3rd decided (by the daihyosen when level)`);
          }
        });
        if (b.some(x => x.matches.some(m => m.roundRobinTiebreak))) daihyosenScenarios++;
        scenarios++; steps += a.length;
      }
    }
  }
  assert.ok(scenarios >= 60 && steps > 1500, `scenarios: ${scenarios}, snapshots: ${steps}`);
  assert.ok(daihyosenScenarios > 0, 'some golden round robins end level and get a daihyosen');
});

test('D2: a daihyosen only for the places with an award (team award mode: top1 / top2 / dual3)', async () => {
  const { teamRoundRobinCountedPlaces } = await import('../../app/engine/teams.ts');
  assert.equal(teamRoundRobinCountedPlaces('top1'), 1);
  assert.equal(teamRoundRobinCountedPlaces('top2'), 2);
  assert.equal(teamRoundRobinCountedPlaces('dual3'), 3);
  assert.equal(teamRoundRobinCountedPlaces(undefined), 2, 'the default mode (Champion + Runner-up)');
  // Four teams: A beats everyone; B, C, D level for 2nd-4th (a circle, one 1-0 bout each).
  const teams = makeTeams(4);
  const circle = { 'Team B|Team C': 'Team B', 'Team C|Team D': 'Team C', 'Team B|Team D': 'Team D' };
  const play = () => {
    const arr = buildTeamMatches('D', teams, settings('3-Person Team')).matches;
    playRoundRobin(arr, (w, r) => oneBout(w === 'Team A' || r === 'Team A' ? 'Team A' : circle[[w, r].sort().join('|')], w));
    return arr;
  };
  // top2 (Champion + Runner-up): 2nd has an award, so B, C, D (level for 2nd) play a daihyosen.
  const top2 = play();
  const plan2 = teamRoundRobinTiebreakPlan(top2.at(-1), top2, teams, '3-Person Team', 2);
  assert.deepEqual(plan2.bouts.map(b => [b.teamWhite, b.teamRed]), [['Team B', 'Team C'], ['Team D', 'Team C'], ['Team D', 'Team B']]);
  // top1 (Champion only): only 1st has an award; B, C, D share 2nd, no daihyosen.
  const top1 = play();
  assert.equal(teamRoundRobinTiebreakPlan(top1.at(-1), top1, teams, '3-Person Team', 1), null, 'no award for 2nd: no daihyosen');
  assert.deepEqual(teamStandings(top1, teams, 1).map(r => [r.name, r.rank, r.nameFallback]),
    [['Team A', 1, false], ['Team B', 2, true], ['Team C', 2, true], ['Team D', 2, true]], 'level teams without an award share the rank');
  // Six teams, 3rd level (D > E > F > D after A, B, C win above): dual3 plays it, top2 does not.
  const six = makeTeams(6), order = ['Team A', 'Team B'], c3 = { 'Team C|Team D': 'Team C', 'Team D|Team E': 'Team D', 'Team C|Team E': 'Team E' };
  const playSix = () => {
    const arr = buildTeamMatches('D', six, settings('3-Person Team')).matches;
    playRoundRobin(arr, (w, r) => {
      const top = [w, r].filter(x => order.includes(x)).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
      const key = [w, r].sort().join('|');
      return oneBout(top || c3[key] || ([w, r].includes('Team F') ? [w, r].find(x => x !== 'Team F') : w), w);
    });
    return arr;
  };
  const d3 = playSix();
  assert.deepEqual(teamStandings(d3, six, 3).slice(2, 5).map(r => [r.name, r.rank]), [['Team C', 3], ['Team D', 3], ['Team E', 3]], 'level for 3rd');
  assert.ok(teamRoundRobinTiebreakPlan(d3.at(-1), d3, six, '3-Person Team', 3), 'dual3: 3rd has an award, a daihyosen');
  const t2 = playSix();
  assert.equal(teamRoundRobinTiebreakPlan(t2.at(-1), t2, six, '3-Person Team', 2), null, 'top2: no award for 3rd, no daihyosen');
  const p = teamRoundRobinPlacements(true, t2, six, 2);
  assert.deepEqual([p.first, p.second], ['Team A', 'Team B']);
});

test('#35 review: the award mode switched to more places after the round robin ended: a daihyosen, never an alphabetical runner-up', async () => {
  const { teamRoundRobinMissingDaihyosen } = await import('../../app/engine/teams.ts');
  // Four teams: A beats everyone; B, C, D level for 2nd (a circle, one 1-0 bout each).
  const teams = makeTeams(4);
  const circle = { 'Team B|Team C': 'Team B', 'Team C|Team D': 'Team C', 'Team B|Team D': 'Team D' };
  const arr = buildTeamMatches('D', teams, settings('3-Person Team')).matches;
  playRoundRobin(arr, (w, r) => oneBout(w === 'Team A' || r === 'Team A' ? 'Team A' : circle[[w, r].sort().join('|')], w));
  // Finished under "Champion only" (top1): no daihyosen for 2nd, the champion is decided.
  assert.equal(teamRoundRobinMissingDaihyosen(arr, teams, '3-Person Team', 1), null, 'top1: no daihyosen for 2nd');
  const top1 = teamRoundRobinPlacements(true, arr, teams, 1);
  assert.equal(top1.first, 'Team A');
  assert.equal(top1.undecided, undefined, 'top1: every awarded place is decided');
  // Switched to "Champion + Runner-up" (top2): 2nd now has an award; still level, so undecided.
  const level = teamRoundRobinPlacements(true, arr, teams, 2);
  assert.equal(level.first, 'Team A');
  assert.equal(level.second, '', `the runner-up was named while B, C and D are level: ${level.second}`);
  assert.deepEqual(level.undecided, [2]);
  const dual3 = teamRoundRobinPlacements(true, arr, teams, 3);
  assert.deepEqual([dual3.second, dual3.thirds, dual3.undecided], ['', [], [2, 3]], 'dual3: 2nd and 3rd both undecided');
  // The missing daihyosen, judged from the whole division (no bout just played).
  const plan = teamRoundRobinMissingDaihyosen(arr, teams, '3-Person Team', 2);
  assert.ok(plan, 'top2: a daihyosen for the level teams');
  assert.deepEqual(plan.bouts.map(b => [b.teamWhite, b.teamRed]), [['Team B', 'Team C'], ['Team D', 'Team C'], ['Team D', 'Team B']]);
  assert.equal(plan.anchor, arr.at(-1));
  arr.push(...plan.bouts);
  assert.equal(teamRoundRobinMissingDaihyosen(arr, teams, '3-Person Team', 2), null, 'none while the daihyosen is unplayed');
  // Back to fewer places after it was created: no other daihyosen (the bouts stay).
  assert.equal(teamRoundRobinMissingDaihyosen(arr, teams, '3-Person Team', 1), null);
  // Red wins every daihyosen bout: C beats B and D, B beats D, so C is 2nd.
  arr.filter(m => m.roundRobinTiebreak).forEach(m => score(m, [], ['M']));
  assert.equal(teamRoundRobinMissingDaihyosen(arr, teams, '3-Person Team', 2), null, 'decided: no further daihyosen');
  const decided = teamRoundRobinPlacements(true, arr, teams, 2);
  assert.deepEqual([decided.first, decided.second, decided.undecided], ['Team A', 'Team C', undefined], 'the daihyosen winner is runner-up');
});
