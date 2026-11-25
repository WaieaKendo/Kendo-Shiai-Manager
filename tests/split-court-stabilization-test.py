from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html

HTML=app_html()

with sync_playwright() as p:
    browser=launch_chromium(p)
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    dialogs=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: (dialogs.append(d.message), d.accept()))
    load_app(page, HTML)

    # Split pools must use the existing tiebreak algorithm; routing only adds the pool court.
    page.evaluate("""
      KSMTest.app.state.divisions=['Test'];KSMTest.app.state.divisionTypes={Test:'Round Robin'};KSMTest.app.state.divisionCourts={Test:'split'};
      KSMTest.app.state.pools={Test:[
        {label:'A',size:3,players:[{name:'A1',dojo:'D'},{name:'A2',dojo:'D'},{name:'A3',dojo:'D'}]},
        {label:'B',size:3,players:[{name:'B1',dojo:'D'},{name:'B2',dojo:'D'},{name:'B3',dojo:'D'}]},
        {label:'C',size:3,players:[{name:'C1',dojo:'D'},{name:'C2',dojo:'D'},{name:'C3',dojo:'D'}]}
      ]};
      KSMTest.app.state.brackets={Test:KSMTest.app.championshipTemplateForTotal(9)};KSMTest.app.state.championshipNodes={};KSMTest.app.state.byeWinners={};
      KSMTest.app.state.allMatches={Test:KSMTest.app.buildPoolMatches('Test',KSMTest.app.state.pools.Test).concat(KSMTest.app.buildChampionshipTemplateMatches('Test',KSMTest.app.state.brackets.Test))};
      const b=KSMTest.app.state.allMatches.Test.filter(m=>m.pool==='B');
      b[0].done=true;b[0].wp=['M'];b[0].rp=[];
      b[1].done=true;b[1].wp=['M'];b[1].rp=[];
      b[2].done=true;b[2].wp=[];b[2].rp=[];
      KSMTest.app.maybeCreateTiebreaks(b[2]);
    """)
    tb=page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.pool==='B'&&m.tiebreak)")
    assert len(tb)==1,tb
    assert tb[0]['court']=='B',tb
    assert tb[0]['requiresWinner'] is True,tb

    # A required head-to-head tiebreak cannot be completed as a draw or duplicated.
    page.evaluate("""
      KSMTest.app.state.currentDivision='Test';KSMTest.app.state.currentCourt='B';KSMTest.app.state.matches=KSMTest.app.state.allMatches.Test;
      KSMTest.app.state.current=KSMTest.app.state.matches.findIndex(m=>m.pool==='B'&&m.tiebreak);
      KSMTest.app.state.courtState={A:{division:'Test',index:0},B:{division:'Test',index:KSMTest.app.state.current}};
      KSMTest.app.state.courtActiveDivision={A:'Test',B:'Test'};KSMTest.app.state.score={W:[],R:[],WT:0,RT:0};
      KSMTest.app.nextMatch();
    """)
    assert dialogs and 'Ties are not allowed' in dialogs[-1],dialogs
    assert page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.pool==='B'&&m.tiebreak).length")==1
    assert page.evaluate("KSMTest.app.state.allMatches.Test.find(m=>m.pool==='B'&&m.tiebreak).done") is False

    # Split direct elimination restores Court Queue and filters it to the active court.
    page.evaluate("""
      KSMTest.app.state.divisionTypes.Test='Single Elimination';KSMTest.app.state.divisionCourts.Test='split';
      KSMTest.app.state.competitors=Array.from({length:8},(_,i)=>({name:'E'+(i+1),dojo:'D',division:'Test',seed:'',status:'Checked'}));
      KSMTest.app.state.pools={};KSMTest.app.state.allMatches={};KSMTest.app.state.singleElimNodes={};KSMTest.app.state.singleElimComps={};KSMTest.app.state.currentByDivision={};
      KSMTest.app.generateDivisionState('Test');KSMTest.app.state.currentDivision='Test';KSMTest.app.state.currentCourt='A';KSMTest.app.state.matches=KSMTest.app.state.allMatches.Test;
      const firstA=KSMTest.app.state.matches.findIndex(m=>m.court==='A'&&!m.done);KSMTest.app.state.current=firstA;
      KSMTest.app.setCourtSupportMode('singleElim');KSMTest.app.renderQueue();
    """)
    assert page.locator('#score .sk-queue-card').evaluate("el=>!el.classList.contains('hidden')")
    queue_a=page.locator('#queue').inner_text()
    court_b_names=page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.court==='B'&&!m.done).flatMap(m=>[m.white,m.red]).filter(Boolean)")
    assert all(name not in queue_a for name in court_b_names), (queue_a,court_b_names)

    page.evaluate("""
      KSMTest.app.state.currentCourt='B';const firstB=KSMTest.app.state.matches.findIndex(m=>m.court==='B'&&!m.done);KSMTest.app.state.current=firstB;KSMTest.app.renderQueue();
    """)
    queue_b=page.locator('#queue').inner_text()
    court_a_names=page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.court==='A'&&!m.done).flatMap(m=>[m.white,m.red]).filter(Boolean)")
    assert all(name not in queue_b for name in court_a_names), (queue_b,court_a_names)

    # Single-court direct elimination retains its existing no-queue presentation.
    page.evaluate("KSMTest.app.state.divisionCourts.Test='A';KSMTest.app.state.currentCourt='A';KSMTest.app.setCourtSupportMode('singleElim')")
    assert page.locator('#score .sk-queue-card').evaluate("el=>el.classList.contains('hidden')")

    # Pool championship placeholder queues are court-specific before Match Objects resolve.
    page.evaluate("""
      KSMTest.app.state.divisionTypes.Test='Round Robin';KSMTest.app.state.divisionCourts.Test='split';
      KSMTest.app.state.pools={Test:[
        {label:'A',size:4,players:[{name:'A1',dojo:'D'},{name:'A2',dojo:'D'},{name:'A3',dojo:'D'},{name:'A4',dojo:'D'}]},
        {label:'B',size:4,players:[{name:'B1',dojo:'D'},{name:'B2',dojo:'D'},{name:'B3',dojo:'D'},{name:'B4',dojo:'D'}]}
      ]};KSMTest.app.state.brackets={Test:KSMTest.app.championshipTemplateForTotal(8)};KSMTest.app.state.championshipNodes={};KSMTest.app.state.allMatches={Test:KSMTest.app.buildChampionshipTemplateMatches('Test',KSMTest.app.state.brackets.Test)};KSMTest.app.state.byeWinners={Test:[]};
      KSMTest.app.poolPositionsResolved=()=>false;
    """)
    # (The court queue's championship groups: ksmChampionshipQueueGroups(), 35-react-court.js, in
    # place of the legacy poolChampionshipQueueGroups() removed in M.8 step 5.)
    groups_a=page.evaluate("KSMTest.app.ksmChampionshipQueueGroups('Test','A').map(g=>[g.label,g.rows.length])")
    groups_b=page.evaluate("KSMTest.app.ksmChampionshipQueueGroups('Test','B').map(g=>[g.label,g.rows.length])")
    assert groups_a==[['Semifinal',1],['Final',1]],groups_a
    assert groups_b==[['Semifinal',1]],groups_b

    # Repeated advancement resolution creates exactly one logical Final.
    page.evaluate("""
      KSMTest.app.state.divisionCourts.Test='split';KSMTest.app.state.brackets={Test:[['A1','B2'],['B1','A2']]};KSMTest.app.state.championshipNodes={};KSMTest.app.state.byeWinners={Test:[]};
      KSMTest.app.state.allMatches={Test:KSMTest.app.buildChampionshipTemplateMatches('Test',KSMTest.app.state.brackets.Test)};
      const semis=KSMTest.app.state.allMatches.Test.filter(m=>m.position==='Semifinal');
      semis[0].white='W1';semis[0].red='R1';semis[0].wdojo='D';semis[0].rdojo='D';semis[0].done=true;semis[0].wp=['M'];semis[0].rp=[];
      semis[1].white='W2';semis[1].red='R2';semis[1].wdojo='D';semis[1].rdojo='D';semis[1].done=true;semis[1].wp=[];semis[1].rp=['M'];
      window.__beforeCount=KSMTest.app.state.allMatches.Test.length;
      KSMTest.app.recomputeChampionshipAdvancement('Test');KSMTest.app.recomputeChampionshipAdvancement('Test');KSMTest.app.recomputeChampionshipAdvancement('Test');
    """)
    assert page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.championship&&m.position==='Final'&&m.bracketSlot===0).length")==1
    assert page.evaluate("KSMTest.app.state.allMatches.Test.find(m=>m.position==='Final').court")=='A'
    assert page.evaluate("KSMTest.app.state.allMatches.Test.length===window.__beforeCount")

    assert not errors,errors
    print('PASS: Split-court stabilization 12/12 assertions')
    browser.close()
