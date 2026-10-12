import { html as appSource, engine } from './lib/ksm-source.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
const html=appSource;
function extract(name){
  const start=html.indexOf(`function ${name}(`);
  if(start<0)throw new Error(`Missing ${name}`);
  const brace=html.indexOf('{',start);let depth=0;
  for(let i=brace;i<html.length;i++){
    if(html[i]==='{')depth++;
    else if(html[i]==='}'&&--depth===0)return html.slice(start,i+1);
  }
  throw new Error(`Unclosed ${name}`);
}
let passed=0;
function ok(cond,msg){if(!cond)throw new Error(msg);passed++;}

// Frozen championship mapping remains authoritative after a native 6-player no-show.
{
  const context={state:{generated:true,brackets:{D:[['A1','B2'],['B1','A2']]},pools:{D:[{players:[1,2]},{players:[3,4,5]}]}},championshipTemplateForTotal:()=>[]};
  vm.createContext(context);vm.runInContext(engine,context);vm.runInContext(extract('championshipLabels'),context);
  const labels=context.championshipLabels('D');
  ok(labels.length===2,'native six-player championship template must remain frozen after no-show');
  ok(labels[0][0]==='A1'&&labels[1][0]==='B1','frozen seed mapping must be preserved');
}

// A completed two-person tie for first explicitly resolves both Seed 1 and Seed 2.
{
  // A and B both beat C and draw each other; the finished tiebreak A beats B locks the order.
  const bout=(white,red,wp,rp,extra={})=>({pool:'A',type:'individual',white,red,wp,rp,done:true,...extra});
  const context={
    state:{currentDivision:'D',
      pools:{D:[{label:'A',players:[{name:'A',dojo:'X'},{name:'B',dojo:'Y'},{name:'C',dojo:'Z'}]}]},
      allMatches:{D:[bout('A','C',['M','K'],[]),bout('B','C',['M','K'],[]),bout('A','B',['M'],['M']),
        bout('A','B',['M'],[],{tiebreak:true,tiebreakSeries:1,requiresWinner:true})]}},
    requiredSeedPlaces:()=>({A:2})
  };
  vm.createContext(context);
  vm.runInContext(engine,context);
  vm.runInContext(extract('poolSeedResolution'),context);
  vm.runInContext(extract('poolPositionsResolved'),context);
  vm.runInContext(extract('seedNameForLabel'),context);
  const r=context.poolSeedResolution('A','D');
  ok(r.complete===true,'tie for first must fully resolve advancing seeds');
  ok(r.seeds[1].name==='A','winner must own Seed 1');
  ok(r.seeds[2].name==='B','loser must own Seed 2');
  ok(context.seedNameForLabel('D','A1',true).name==='A','A1 placeholder must populate');
  ok(context.seedNameForLabel('D','A2',true).name==='B','A2 placeholder must populate');
}

// No-show removal deletes only affected matches and preserves every survivor's order.
{
  const matches=[
    {pool:'A',white:'A',red:'B',id:'A1'},
    {pool:'A',white:'C',red:'B',id:'A2'},
    {pool:'A',white:'C',red:'A',id:'A3'},
    {pool:'B',white:'D',red:'E',id:'B1'},
    {pool:'Championship',championship:true,id:'C1'}
  ];
  const context={
    state:{generated:true,divisionTypes:{D:'Round Robin'},pools:{D:[{label:'A',size:3,players:[{name:'A'},{name:'B'},{name:'C'}]},{label:'B',size:2,players:[{name:'D'},{name:'E'}]}]},allMatches:{D:matches},managementRevision:0},
    structuralNoShowAllowed:()=>true,syncChampionshipTemplate:()=>{},initCourtStates:()=>{},
    buildIndividualSingleElimMatches:()=>[]
  };
  vm.createContext(context);vm.runInContext(extract('applyIndividualNoShow'),context);
  ok(context.applyIndividualNoShow('D','B')===true,'no-show should apply');
  const ids=context.state.allMatches.D.map(m=>m.id);
  ok(ids.join(',')==='A3,B1,C1','surviving template matches must retain original global order');
  ok(context.state.pools.D[0].players.map(p=>p.name).join(',')==='A,C','only absent player is removed from pool');
}
console.log(`PASS: template consistency and seed resolution ${passed}/${passed} assertions`);
