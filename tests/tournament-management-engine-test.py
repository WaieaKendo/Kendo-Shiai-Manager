from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html

HTML=app_html()

with sync_playwright() as p:
    browser=launch_chromium(p)
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    load_app(page, HTML)

    # Split validation minimum.
    page.evaluate("""
      KSMTest.app.state.divisions=['Test'];KSMTest.app.state.divisionTypes={Test:'Single Elimination'};KSMTest.app.state.divisionCourts={Test:'split'};
      KSMTest.app.state.competitors=[1,2,3].map(i=>({name:'P'+i,dojo:'D'+i,division:'Test',seed:'',status:'Checked'}));
    """)
    v=page.evaluate("KSMTest.app.validateTournament()")
    assert not v['valid'] and any(x['code']=='SPLIT_MINIMUM' for x in v['issues']),v

    # Split pool assignment: 3 pools -> A on Court A, B/C on Court B.
    page.evaluate("""
      KSMTest.app.state.divisionTypes.Test='Round Robin';KSMTest.app.state.divisionCourts.Test='split';
      KSMTest.app.state.competitors=Array.from({length:9},(_,i)=>({name:'P'+(i+1),dojo:'D'+i,division:'Test',seed:'',status:'Checked'}));
      KSMTest.app.state.pools={};KSMTest.app.state.allMatches={};KSMTest.app.state.singleElimNodes={};KSMTest.app.state.singleElimComps={};KSMTest.app.state.brackets={};KSMTest.app.state.byeWinners={};KSMTest.app.state.currentByDivision={};
      KSMTest.app.generateDivisionState('Test');
    """)
    pool_courts=page.evaluate("Object.fromEntries(KSMTest.app.state.pools.Test.map(p=>[p.label,[...new Set(KSMTest.app.state.allMatches.Test.filter(m=>m.pool===p.label).map(m=>m.court))][0]]))")
    assert pool_courts=={'A':'A','B':'B','C':'B'},pool_courts

    # Split direct elimination uses canonical halves and Final A.
    page.evaluate("""
      KSMTest.app.state.divisionTypes.Test='Single Elimination';KSMTest.app.state.divisionCourts.Test='split';
      KSMTest.app.state.competitors=Array.from({length:8},(_,i)=>({name:'E'+(i+1),dojo:'D'+i,division:'Test',seed:i<2?String(i+1):'',status:'Checked'}));
      KSMTest.app.state.pools={};KSMTest.app.state.allMatches={};KSMTest.app.state.singleElimNodes={};KSMTest.app.state.singleElimComps={};KSMTest.app.state.brackets={};KSMTest.app.state.byeWinners={};KSMTest.app.state.currentByDivision={};
      KSMTest.app.generateDivisionState('Test');
    """)
    node_courts=page.evaluate("Object.fromEntries(KSMTest.app.state.allMatches.Test.map(m=>[m.elimNodeId,m.court]))")
    assert node_courts['QF1']=='A' and node_courts['QF2']=='A'
    assert node_courts['QF3']=='B' and node_courts['QF4']=='B'
    # Final isn't instantiated until semis finish, but canonical node is A.
    assert page.evaluate("KSMTest.app.state.singleElimNodes.Test.find(n=>n.id==='F').court")=='A'

    # Pool championship match can unlock once its own source pools resolve, while an unrelated pool remains unfinished.
    page.evaluate("""
      KSMTest.app.state.generated=true;KSMTest.app.state.divisionTypes.Test='Round Robin';KSMTest.app.state.divisionCourts.Test='split';
      KSMTest.app.state.pools={Test:[
        {label:'A',size:4,players:[{name:'A1',dojo:'D'},{name:'A2',dojo:'D'},{name:'A3',dojo:'D'},{name:'A4',dojo:'D'}]},
        {label:'B',size:3,players:[{name:'B1',dojo:'D'},{name:'B2',dojo:'D'},{name:'B3',dojo:'D'}]},
        {label:'C',size:3,players:[{name:'C1',dojo:'D'},{name:'C2',dojo:'D'},{name:'C3',dojo:'D'}]}
      ]};KSMTest.app.state.brackets={Test:KSMTest.app.championshipTemplateForTotal(10)};KSMTest.app.state.championshipNodes={};KSMTest.app.state.byeWinners={};KSMTest.app.state.allMatches={Test:KSMTest.app.buildPoolMatches('Test',KSMTest.app.state.pools.Test).concat(KSMTest.app.buildChampionshipTemplateMatches('Test',KSMTest.app.state.brackets.Test))};
      KSMTest.app.state.allMatches.Test.filter(m=>m.pool==='A'||m.pool==='B').forEach((m,i)=>{m.done=true;m.wp=['M'];m.rp=[]});
      KSMTest.app.poolPositionsResolved=(label,div)=>label!=='C';
      KSMTest.app.poolStandings=(label,div)=>[{name:label+'1',dojo:'D',wins:2,pts:2},{name:label+'2',dojo:'D',wins:1,pts:1},{name:label+'3',dojo:'D',wins:0,pts:0}];
      KSMTest.app.maybeCreateChampionship(KSMTest.app.state.allMatches.Test.find(m=>m.pool==='B'));
    """)
    assert page.evaluate("KSMTest.app.state.allMatches.Test.some(m=>m.championship)")
    assert page.evaluate("KSMTest.app.state.allMatches.Test.some(m=>m.pool==='C'&&!m.done)")

    # Director totals split canonical matches by court without losing the overall denominator.
    split_total=page.evaluate("KSMTest.app.directorDivisionProgress('Test',null)")
    split_a=page.evaluate("KSMTest.app.directorDivisionProgress('Test','A')")
    split_b=page.evaluate("KSMTest.app.directorDivisionProgress('Test','B')")
    assert split_total['total']==split_a['total']+split_b['total'],(split_total,split_a,split_b)

    # Pool no-show only rebuilds target pool; 3 -> 2 creates one match.
    page.evaluate("""
      KSMTest.app.state.generated=true;KSMTest.app.state.divisionTypes.Test='Round Robin';KSMTest.app.state.divisionCourts.Test='A';
      KSMTest.app.state.pools={Test:[
        {label:'A',size:3,players:[{name:'A1',dojo:'D'},{name:'A2',dojo:'D'},{name:'A3',dojo:'D'}]},
        {label:'B',size:3,players:[{name:'B1',dojo:'D'},{name:'B2',dojo:'D'},{name:'B3',dojo:'D'}]}
      ]};KSMTest.app.state.allMatches={Test:KSMTest.app.buildPoolMatches('Test',KSMTest.app.state.pools.Test)};
      KSMTest.app.applyIndividualNoShow('Test','A3');
    """)
    assert page.evaluate("KSMTest.app.state.pools.Test.find(p=>p.label==='A').players.length")==2
    assert page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.pool==='A').length")==1
    assert page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.pool==='B').length")==3

    # Direct no-show keeps canonical node count and clears only entrant.
    page.evaluate("""
      KSMTest.app.state.generated=true;KSMTest.app.state.divisionTypes.Test='Single Elimination';KSMTest.app.state.divisionCourts.Test='A';
      KSMTest.app.state.competitors=Array.from({length:8},(_,i)=>({name:'N'+(i+1),dojo:'D',division:'Test',seed:'',status:'Checked'}));
      KSMTest.app.state.pools={};KSMTest.app.state.allMatches={};KSMTest.app.state.singleElimNodes={};KSMTest.app.state.singleElimComps={};KSMTest.app.state.currentByDivision={};
      KSMTest.app.generateDivisionState('Test');window.__nodeCount=KSMTest.app.state.singleElimNodes.Test.length;
      KSMTest.app.applyIndividualNoShow('Test','N1');
    """)
    assert page.evaluate("KSMTest.app.state.singleElimNodes.Test.length===window.__nodeCount")
    assert page.evaluate("KSMTest.app.state.singleElimComps.Test.some(x=>x&&x.name==='N1')") is False
    assert page.evaluate("KSMTest.app.state.allMatches.Test.every(m=>m.white!=='N1'&&m.red!=='N1')")

    # Regenerate one division leaves another untouched.
    page.evaluate("""
      KSMTest.app.state.generated=true;KSMTest.app.state.divisions=['Test','Other'];KSMTest.app.state.divisionTypes={Test:'Round Robin',Other:'Round Robin'};KSMTest.app.state.divisionCourts={Test:'A',Other:'B'};
      KSMTest.app.state.competitors=[...Array.from({length:6},(_,i)=>({name:'T'+i,dojo:'D',division:'Test',seed:'',status:'Checked'})),...Array.from({length:6},(_,i)=>({name:'O'+i,dojo:'D',division:'Other',seed:'',status:'Checked'}))];
      KSMTest.app.state.pools={};KSMTest.app.state.allMatches={};KSMTest.app.state.singleElimNodes={};KSMTest.app.state.singleElimComps={};KSMTest.app.state.teamBracketNodes={};KSMTest.app.state.teamPools={};KSMTest.app.state.brackets={};KSMTest.app.state.byeWinners={};KSMTest.app.state.currentByDivision={};
      KSMTest.app.generateDivisionState('Test');KSMTest.app.generateDivisionState('Other');window.__other=JSON.stringify(KSMTest.app.state.allMatches.Other);
      KSMTest.app.regenerateSingleDivision('Test');
    """)
    assert page.evaluate("JSON.stringify(KSMTest.app.state.allMatches.Other)===window.__other")

    # Save schema/version and required management UI.
    payload=page.evaluate("KSMTest.app.tournamentPayload()")
    assert payload['schemaVersion']=='1.1' and payload['engineVersion']=='3.12.9'
    assert page.locator('#tournamentStatusCard').count()==1
    assert page.locator('#regenerateDivisionBtn').count()==1

    assert not errors,errors
    print('PASS: Tournament Management Engine 22/22 assertions')
    browser.close()
