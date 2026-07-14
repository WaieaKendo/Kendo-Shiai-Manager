from pathlib import Path
from playwright.sync_api import sync_playwright

HTML=(Path(__file__).resolve().parents[1]/'public'/'index.html').read_text()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    page.set_content(HTML, wait_until='domcontentloaded')

    # Split validation minimum.
    page.evaluate("""
      state.divisions=['Test'];state.divisionTypes={Test:'Single Elimination'};state.divisionCourts={Test:'split'};
      state.competitors=[1,2,3].map(i=>({name:'P'+i,dojo:'D'+i,division:'Test',seed:'',status:'Checked'}));
    """)
    v=page.evaluate("validateTournament()")
    assert not v['valid'] and any(x['code']=='SPLIT_MINIMUM' for x in v['issues']),v

    # Split pool assignment: 3 pools -> A on Court A, B/C on Court B.
    page.evaluate("""
      state.divisionTypes.Test='Round Robin';state.divisionCourts.Test='split';
      state.competitors=Array.from({length:9},(_,i)=>({name:'P'+(i+1),dojo:'D'+i,division:'Test',seed:'',status:'Checked'}));
      state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.brackets={};state.byeWinners={};state.currentByDivision={};
      generateDivisionState('Test');
    """)
    pool_courts=page.evaluate("Object.fromEntries(state.pools.Test.map(p=>[p.label,[...new Set(state.allMatches.Test.filter(m=>m.pool===p.label).map(m=>m.court))][0]]))")
    assert pool_courts=={'A':'A','B':'B','C':'B'},pool_courts

    # Split direct elimination uses canonical halves and Final A.
    page.evaluate("""
      state.divisionTypes.Test='Single Elimination';state.divisionCourts.Test='split';
      state.competitors=Array.from({length:8},(_,i)=>({name:'E'+(i+1),dojo:'D'+i,division:'Test',seed:i<2?String(i+1):'',status:'Checked'}));
      state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.brackets={};state.byeWinners={};state.currentByDivision={};
      generateDivisionState('Test');
    """)
    node_courts=page.evaluate("Object.fromEntries(state.allMatches.Test.map(m=>[m.elimNodeId,m.court]))")
    assert node_courts['QF1']=='A' and node_courts['QF2']=='A'
    assert node_courts['QF3']=='B' and node_courts['QF4']=='B'
    # Final isn't instantiated until semis finish, but canonical node is A.
    assert page.evaluate("state.singleElimNodes.Test.find(n=>n.id==='F').court")=='A'

    # Pool championship match can unlock once its own source pools resolve, while an unrelated pool remains unfinished.
    page.evaluate("""
      state.generated=true;state.divisionTypes.Test='Round Robin';state.divisionCourts.Test='split';
      state.pools={Test:[
        {label:'A',size:4,players:[{name:'A1',dojo:'D'},{name:'A2',dojo:'D'},{name:'A3',dojo:'D'},{name:'A4',dojo:'D'}]},
        {label:'B',size:3,players:[{name:'B1',dojo:'D'},{name:'B2',dojo:'D'},{name:'B3',dojo:'D'}]},
        {label:'C',size:3,players:[{name:'C1',dojo:'D'},{name:'C2',dojo:'D'},{name:'C3',dojo:'D'}]}
      ]};state.brackets={Test:championshipTemplateForTotal(10)};state.championshipNodes={};state.byeWinners={};state.allMatches={Test:buildPoolMatches('Test',state.pools.Test).concat(buildChampionshipTemplateMatches('Test',state.brackets.Test))};
      state.allMatches.Test.filter(m=>m.pool==='A'||m.pool==='B').forEach((m,i)=>{m.done=true;m.wp=['M'];m.rp=[]});
      poolPositionsResolved=(label,div)=>label!=='C';
      poolStandings=(label,div)=>[{name:label+'1',dojo:'D',wins:2,pts:2},{name:label+'2',dojo:'D',wins:1,pts:1},{name:label+'3',dojo:'D',wins:0,pts:0}];
      maybeCreateChampionship(state.allMatches.Test.find(m=>m.pool==='B'));
    """)
    assert page.evaluate("state.allMatches.Test.some(m=>m.championship)")
    assert page.evaluate("state.allMatches.Test.some(m=>m.pool==='C'&&!m.done)")

    # Director totals split canonical matches by court without losing the overall denominator.
    split_total=page.evaluate("directorDivisionProgress('Test',null)")
    split_a=page.evaluate("directorDivisionProgress('Test','A')")
    split_b=page.evaluate("directorDivisionProgress('Test','B')")
    assert split_total['total']==split_a['total']+split_b['total'],(split_total,split_a,split_b)

    # Pool no-show only rebuilds target pool; 3 -> 2 creates one match.
    page.evaluate("""
      state.generated=true;state.divisionTypes.Test='Round Robin';state.divisionCourts.Test='A';
      state.pools={Test:[
        {label:'A',size:3,players:[{name:'A1',dojo:'D'},{name:'A2',dojo:'D'},{name:'A3',dojo:'D'}]},
        {label:'B',size:3,players:[{name:'B1',dojo:'D'},{name:'B2',dojo:'D'},{name:'B3',dojo:'D'}]}
      ]};state.allMatches={Test:buildPoolMatches('Test',state.pools.Test)};
      applyIndividualNoShow('Test','A3');
    """)
    assert page.evaluate("state.pools.Test.find(p=>p.label==='A').players.length")==2
    assert page.evaluate("state.allMatches.Test.filter(m=>m.pool==='A').length")==1
    assert page.evaluate("state.allMatches.Test.filter(m=>m.pool==='B').length")==3

    # Direct no-show keeps canonical node count and clears only entrant.
    page.evaluate("""
      state.generated=true;state.divisionTypes.Test='Single Elimination';state.divisionCourts.Test='A';
      state.competitors=Array.from({length:8},(_,i)=>({name:'N'+(i+1),dojo:'D',division:'Test',seed:'',status:'Checked'}));
      state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.currentByDivision={};
      generateDivisionState('Test');window.__nodeCount=state.singleElimNodes.Test.length;
      applyIndividualNoShow('Test','N1');
    """)
    assert page.evaluate("state.singleElimNodes.Test.length===window.__nodeCount")
    assert page.evaluate("state.singleElimComps.Test.some(x=>x&&x.name==='N1')") is False
    assert page.evaluate("state.allMatches.Test.every(m=>m.white!=='N1'&&m.red!=='N1')")

    # Regenerate one division leaves another untouched.
    page.evaluate("""
      state.generated=true;state.divisions=['Test','Other'];state.divisionTypes={Test:'Round Robin',Other:'Round Robin'};state.divisionCourts={Test:'A',Other:'B'};
      state.competitors=[...Array.from({length:6},(_,i)=>({name:'T'+i,dojo:'D',division:'Test',seed:'',status:'Checked'})),...Array.from({length:6},(_,i)=>({name:'O'+i,dojo:'D',division:'Other',seed:'',status:'Checked'}))];
      state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.teamBracketNodes={};state.teamPools={};state.brackets={};state.byeWinners={};state.currentByDivision={};
      generateDivisionState('Test');generateDivisionState('Other');window.__other=JSON.stringify(state.allMatches.Other);
      regenerateSingleDivision('Test');
    """)
    assert page.evaluate("JSON.stringify(state.allMatches.Other)===window.__other")

    # Save schema/version and required management UI.
    payload=page.evaluate("tournamentPayload()")
    assert payload['schemaVersion']=='1.1' and payload['engineVersion']=='3.12.6'
    assert page.locator('#tournamentStatusCard').count()==1
    assert page.locator('#regenerateDivisionBtn').count()==1

    assert not errors,errors
    print('PASS: Tournament Management Engine 22/22 assertions')
    browser.close()
