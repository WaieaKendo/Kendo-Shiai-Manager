import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateTeamDivisions, mergeTeamDivisionRecords, reconcileTeamAssignments } from '../../app/engine/team-divisions.ts';
import { generateDivision } from '../../app/engine/generation.ts';
import { readSettings } from '../../app/engine/settings.ts';

const rows = Array.from({length:4},(_,i)=>({team:`Team ${i}`,senpo:`S${i}`,jiho:`J${i}`,chuken:`C${i}`,fukusho:`F${i}`,taisho:`T${i}`,status:'Checked'}));
const division = (id,order=0) => ({id,name:id,teamFormat:'3-Person Team',teamTournamentFormat:'Single Elimination',court:'A',awardMode:'top2',order});

test('legacy migration preserves exact generated bouts, brackets, courts and order for all team formats',()=>{
  for(const teamFormat of ['3-Person Team','5-Person Team','Kachinuki'])for(const teamTournamentFormat of ['Single Elimination','Round Robin']){
    const setup={teamEnabled:'Enabled',teamFormat,teamTournamentFormat,teamCourt:'B',teamAwardMode:'dual3'};
    const old={teams:structuredClone(rows),divisionCourts:{'Team Tournament':'B'},teamAwardMode:'dual3'};
    const migrated=migrateTeamDivisions(old,setup),d=migrated.teamDivisions[0];
    assert.deepEqual(old.teams,rows,'migration must not mutate the supplied payload');
    assert.equal(d.id,'Team Tournament');assert.equal(d.awardMode,'dual3');
    const input={division:'Team Tournament',competitors:[],teams:rows,settings:readSettings(setup),courtMode:'B'};
    const before=generateDivision(input),after=generateDivision({...input,teams:migrated.teams,teamDivisionId:d.id});
    // Seeded teams now have persisted registration identities, but engine matches/nodes are identical.
    assert.deepEqual(after.matches,before.matches);assert.deepEqual(after.teamBracketNodes,before.teamBracketNodes);
    assert.deepEqual(migrateTeamDivisions(migrated,setup),migrated,'idempotent on every later load');
  }
  assert.deepEqual(migrateTeamDivisions({teams:rows},{teamEnabled:'Disabled'}).teamDivisions,[]);
});

test('division generation isolates entrants, match format and court',()=>{
  const a=division('id-a'),b={...division('id-b',1),teamFormat:'5-Person Team',teamTournamentFormat:'Round Robin',court:'B'};
  const teams=rows.map((t,i)=>({...t,teamDivisionId:i<2?a.id:b.id}));
  for(const d of [a,b]){
    const result=generateDivision({division:d.id,teamDivisionId:d.id,competitors:[],teams,settings:{...readSettings({}),...d},courtMode:d.court});
    assert.equal(result.matches.length,d===a?0:5);
    assert.equal(result.teamElimTeams.length,2);
    if(d===a)assert.equal(result.teamBracketNodes.length,1);
    assert.ok(result.matches.every(m=>m.division===d.id&&m.court===d.court));
    assert.ok(result.matches.every(m=>d===a?['Team 0','Team 1'].includes(m.teamWhite):['Team 2','Team 3'].includes(m.teamWhite)));
  }
});

test('rename versus reorder, add versus add, and assignment survive by persisted ID',()=>{
  const base=[division('a'),division('b',1)],server=structuredClone(base),local=structuredClone(base),conflicts=[];
  server[0].name='Kids';local[0].order=1;local[1].order=0;
  const merged=mergeTeamDivisionRecords(server,local,base,'Team divisions',conflicts);
  assert.equal(merged.find(d=>d.id==='a').name,'Kids');assert.equal(merged.find(d=>d.id==='a').order,1);assert.deepEqual(conflicts,[]);
  const added=mergeTeamDivisionRecords([...server,division('c',2)],[...local,division('d',2)],base,'Team divisions',conflicts);
  assert.equal(added.length,4);
  const teams=[{id:'t',teamDivisionId:'a'}];
  assert.equal(reconcileTeamAssignments({teamDivisions:merged,teams}).teams[0].teamDivisionId,'a');
});

test('remove versus assign falls back to first remaining division and labels conflict',()=>{
  const base=[division('a'),division('b',1)],conflicts=[];
  const divisions=mergeTeamDivisionRecords([base[0]],base,base,'Team divisions',conflicts);
  const merged=reconcileTeamAssignments({teamDivisions:divisions,teams:[{id:'t',teamDivisionId:'b'}]},conflicts);
  assert.equal(merged.teams[0].teamDivisionId,'a');assert.ok(conflicts.includes('Team division assignment (division removed)'));
  assert.deepEqual(reconcileTeamAssignments(merged),merged,'reload keeps assignment');
});


test('legacy team identities agree across reordered raw copies and persist after rename',()=>{
  const original=migrateTeamDivisions({teams:rows});
  const reordered=migrateTeamDivisions({teams:[...rows].reverse()});
  assert.deepEqual(Object.fromEntries(original.teams.map(t=>[t.team,t.id])),Object.fromEntries(reordered.teams.map(t=>[t.team,t.id])));
  const id=original.teams[0].id;original.teams[0].team='Renamed team';
  assert.equal(migrateTeamDivisions(original).teams[0].id,id);
});


test('migration follows the legacy load precedence and running-order fallback',()=>{
  const old={teams:rows,divisionCourts:{'Team Tournament':'A'},teamAwardMode:'top2'};
  const migrated=migrateTeamDivisions(old,{teamCourt:'B',teamAwardMode:'top1'});
  assert.equal(migrated.teamDivisions[0].court,'B');assert.equal(migrated.teamDivisions[0].awardMode,'top1');
  const ordered=migrateTeamDivisions({teamDivisions:[division('later',1),division('first',0)],teams:[{id:'t',teamDivisionId:'removed'}]});
  assert.equal(ordered.teams[0].teamDivisionId,'first');
});

test('legacy IDs stay unique when an older client inserts a same-name row before a migrated one (#95 review)',()=>{
  const setup={teamEnabled:'Enabled'};
  const migrated=migrateTeamDivisions({teams:[{team:'X'},{team:'X'}]},setup).teams.map(t=>t.id);
  assert.deepEqual(migrated,['legacy-team:X:0','legacy-team:X:1']);
  // An older client adds an id-less "X" in front of the migrated rows: it must not take legacy-team:X:0 again.
  const mixed=migrateTeamDivisions({teams:[{team:'X'},{team:'X',id:'legacy-team:X:0'},{team:'X',id:'legacy-team:X:1'}]},setup).teams.map(t=>t.id);
  assert.equal(new Set(mixed).size,3,`duplicate IDs: ${mixed}`);
  assert.deepEqual(mixed.slice(1),['legacy-team:X:0','legacy-team:X:1'],'existing IDs are kept');
  // Two devices migrating the same record get the same IDs.
  const record={teams:[{team:'X'},{team:'X',id:'legacy-team:X:0'},{team:'Y'}]};
  assert.deepEqual(migrateTeamDivisions(record,setup).teams,migrateTeamDivisions(structuredClone(record),setup).teams);
});
