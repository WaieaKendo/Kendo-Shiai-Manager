// #95 review: team divisions in the 409 merge (app/js/18-sync-state-and-rebase.js).
//
//   * mergeRegistrationListSplit(): a structural edit (Generate) replays division X with this device's
//     teams; meanwhile the other device moved a team into or out of X. The team must be neither lost
//     nor kept twice (teams are split by id across server, local and base, not by their division).
//   * ksmKeepDrawnTeamAssignments(): a move into or out of a team division the other device has
//     already drawn keeps the server's assignment, with a conflict notice (the draw's matches refer to
//     teams by position).
import vm from 'node:vm';
import { extractFunction, withDependencies, html } from './lib/ksm-source.mjs';

let failed = false;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; };
const code = withDependencies(html, ['mergeRegistrationListSplit', 'ksmKeepDrawnTeamAssignments'].map(n => extractFunction(html, n)).join('\n'));
const context = { console };
vm.createContext(context);
vm.runInContext(code + '\nthis.split = mergeRegistrationListSplit; this.keepDrawn = ksmKeepDrawnTeamAssignments;', context);

const team = (id, div) => ({ id, team: id, teamDivisionId: div });
const ids = list => list.map(t => `${t.id}@${t.teamDivisionId}`).sort();

// A: this device generated X (its teams: a1, a2 in X; t in Y). The other device moved t from Y into X.
{
  const base = [team('a1', 'X'), team('a2', 'X'), team('t', 'Y'), team('y1', 'Y')];
  const local = base.map(t => ({ ...t, status: 'Checked' }));
  const server = base.map(t => t.id === 't' ? { ...t, teamDivisionId: 'X' } : t);
  const out = context.split(server, local, base, ['X'], 'Teams', [], 'teams');
  check(out.filter(t => t.id === 't').length === 1, 'A: a team moved into the replayed division by the other device is kept, once');
  check(out.find(t => t.id === 't')?.teamDivisionId === 'Y', 'A: it stays where this device\'s draw left it (Y)');
  check(out.length === 4, `A: no team lost (${ids(out)})`);
}
// B: the reverse: the other device moved t from X (replayed here) to Y.
{
  const base = [team('a1', 'X'), team('t', 'X'), team('y1', 'Y')];
  const local = base.map(t => ({ ...t, status: 'Checked' }));
  const server = base.map(t => t.id === 't' ? { ...t, teamDivisionId: 'Y' } : t);
  const out = context.split(server, local, base, ['X'], 'Teams', [], 'teams');
  check(out.filter(t => t.id === 't').length === 1, `B: the moved team is not kept twice (${ids(out)})`);
  check(out.find(t => t.id === 't')?.teamDivisionId === 'X', 'B: it stays in this device\'s draw (X)');
}
// Unrelated edits outside the replayed division still merge (a team added on the server in Y).
{
  const base = [team('a1', 'X'), team('y1', 'Y')];
  const local = base.map(t => ({ ...t, status: 'Checked' }));
  const server = [...base, team('y2', 'Y')];
  const out = context.split(server, local, base, ['X'], 'Teams', [], 'teams');
  check(ids(out).join() === ['a1@X', 'y1@Y', 'y2@Y'].join(), `the other device's new team outside the draw is kept (${ids(out)})`);
}
// Drawn on the server: this device moved t into X (not drawn here); X keeps the server's teams.
{
  const st = { teams: [team('a1', 'X'), team('t', 'X')], allMatches: { X: [{ type: 'teamPlayoff' }] } };
  const conflicts = [];
  context.keepDrawn(st, [team('a1', 'X'), team('t', 'Y')], [], conflicts);
  check(st.teams.find(t => t.id === 't').teamDivisionId === 'Y', 'a move into a division drawn on the server is undone');
  check(conflicts.length === 1, 'with a conflict notice');
}
// ...and out of one (teamElimTeams snapshot only).
{
  const st = { teams: [team('t', 'Y')], allMatches: {}, teamElimTeams: { X: ['t'] } };
  const conflicts = [];
  context.keepDrawn(st, [team('t', 'X')], [], conflicts);
  check(st.teams[0].teamDivisionId === 'X', 'a move out of a drawn division is undone');
}
// Not drawn, or replayed by this device: the merged assignment stands.
{
  const st = { teams: [team('t', 'X')], allMatches: {} };
  const conflicts = [];
  context.keepDrawn(st, [team('t', 'Y')], [], conflicts);
  check(st.teams[0].teamDivisionId === 'X' && !conflicts.length, 'a move between undrawn divisions merges as before');
  const st2 = { teams: [team('t', 'X')], allMatches: { X: [{}] } };
  context.keepDrawn(st2, [team('t', 'Y')], ['X'], conflicts);
  check(st2.teams[0].teamDivisionId === 'X' && !conflicts.length, 'a division this device replays is not the server\'s draw');
}
if (failed) process.exit(1);
