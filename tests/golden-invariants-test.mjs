// Sanity rules every golden snapshot must satisfy. The golden test only checks that
// engine output did not change; this checks that the approved output is actually
// right, so `npm run test:golden:update` cannot quietly approve wrong results.
import fs from 'node:fs';

const dir = new URL('./golden/engine/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const problems = [];

for (const file of files) {
  const g = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'));
  const name = file.replace(/\.json$/, '');

  // Every checked-in entrant of an individual round robin is placed in exactly one pool,
  // and no pool is empty.
  for (const d of g.setup.filter(d => !d.team && d.format === 'Round Robin')) {
    const pools = g.generated[d.name]?.pools || [];
    const placed = pools.flatMap(p => p.players);
    for (const e of d.entrants.filter(e => e.status === 'Checked')) {
      const count = placed.filter(n => n === e.name).length;
      if (count !== 1) problems.push(`${name} ${d.name}: ${e.name} placed in ${count} pools`);
    }
    for (const p of pools) if (!p.players.length) problems.push(`${name} ${d.name}: pool ${p.label} is empty`);
  }
  for (const [div, fin] of Object.entries(g.final)) {
    const matches = fin.matches.filter(Boolean);

    // Pool standings show each player's pool record (tiebreak matches excluded).
    for (const [pool, rows] of Object.entries(fin.standings)) {
      if (pool === 'team') continue;
      const record = {};
      for (const m of matches) {
        if (m.pool !== pool || m.championship || m.tiebreak || !m.done) continue;
        for (const [side, pts] of [['white', 'wp'], ['red', 'rp']]) {
          const r = (record[m[side]] ||= { wins: 0, pts: 0 });
          r.pts += m[pts].length;
          if (m.winner === m[side]) r.wins++;
        }
      }
      for (const row of rows) {
        const r = record[row.name];
        if (r && (r.wins !== row.wins || r.pts !== row.pts))
          problems.push(`${name} ${div} pool ${pool}: ${row.name} shown ${row.wins}W/${row.pts}pts, pool record ${r.wins}W/${r.pts}pts`);
      }
    }

    // Matches that must have a winner never end in Hikiwake.
    for (const m of matches) {
      if (m.done && (m.championship || m.singleElim || m.tiebreak) && (!m.winner || m.winner === 'Hikiwake'))
        problems.push(`${name} ${div}: ${m.position || m.pool} ${m.white} v ${m.red} completed without a winner`);
    }

    // A finished division lists placements, and 1st place won the final.
    if (fin.complete && !fin.placements.length) problems.push(`${name} ${div}: complete but no placements`);
    const finalMatch = matches.find(m => m.championship && m.position === 'Final' && m.done);
    const first = fin.placements.find(p => p.place === '1st');
    if (finalMatch && first && first.name !== finalMatch.winner)
      problems.push(`${name} ${div}: 1st place ${first.name} but Final won by ${finalMatch.winner}`);
  }
}

for (const p of problems) console.log(`FAIL ${p}`);
console.log(`${problems.length ? 'FAIL' : 'PASS'} golden snapshot invariants (${files.length} scenarios)`);
if (problems.length) process.exit(1);
