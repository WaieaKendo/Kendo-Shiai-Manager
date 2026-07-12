from pathlib import Path
from playwright.sync_api import sync_playwright

HTML=(Path(__file__).resolve().parents[1]/'public'/'index.html').read_text()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    dialogs=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: (dialogs.append(d.message), d.accept()))
    page.set_content(HTML, wait_until='domcontentloaded')

    # Split pools must use the existing tiebreak algorithm; routing only adds the pool court.
    page.evaluate("""
      state.divisions=['Test'];state.divisionTypes={Test:'Round Robin'};state.divisionCourts={Test:'split'};
      state.pools={Test:[
        {label:'A',size:3,players:[{name:'A1',dojo:'D'},{name:'A2',dojo:'D'},{name:'A3',dojo:'D'}]},
        {label:'B',size:3,players:[{name:'B1',dojo:'D'},{name:'B2',dojo:'D'},{name:'B3',dojo:'D'}]},
        {label:'C',size:3,players:[{name:'C1',dojo:'D'},{name:'C2',dojo:'D'},{name:'C3',dojo:'D'}]}
      ]};
      state.brackets={Test:championshipTemplateForTotal(9)};state.byeWinners={};
      state.allMatches={Test:buildPoolMatches('Test',state.pools.Test)};
      const b=state.allMatches.Test.filter(m=>m.pool==='B');
      b[0].done=true;b[0].wp=['M'];b[0].rp=[];
      b[1].done=true;b[1].wp=['M'];b[1].rp=[];
      b[2].done=true;b[2].wp=[];b[2].rp=[];
      maybeCreateTiebreaks(b[2]);
    """)
    tb=page.evaluate("state.allMatches.Test.filter(m=>m.pool==='B'&&m.tiebreak)")
    assert len(tb)==1,tb
    assert tb[0]['court']=='B',tb
    assert tb[0]['requiresWinner'] is True,tb

    # A required head-to-head tiebreak cannot be completed as a draw or duplicated.
    page.evaluate("""
      state.currentDivision='Test';state.currentCourt='B';state.matches=state.allMatches.Test;
      state.current=state.matches.findIndex(m=>m.pool==='B'&&m.tiebreak);
      state.courtState={A:{division:'Test',index:0},B:{division:'Test',index:state.current}};
      state.courtActiveDivision={A:'Test',B:'Test'};state.score={W:[],R:[],WT:0,RT:0};
      nextMatch();
    """)
    assert dialogs and 'Ties are not allowed' in dialogs[-1],dialogs
    assert page.evaluate("state.allMatches.Test.filter(m=>m.pool==='B'&&m.tiebreak).length")==1
    assert page.evaluate("state.allMatches.Test.find(m=>m.pool==='B'&&m.tiebreak).done") is False

    # Split direct elimination restores Court Queue and filters it to the active court.
    page.evaluate("""
      state.divisionTypes.Test='Single Elimination';state.divisionCourts.Test='split';
      state.competitors=Array.from({length:8},(_,i)=>({name:'E'+(i+1),dojo:'D',division:'Test',seed:'',status:'Checked'}));
      state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.currentByDivision={};
      generateDivisionState('Test');state.currentDivision='Test';state.currentCourt='A';state.matches=state.allMatches.Test;
      const firstA=state.matches.findIndex(m=>m.court==='A'&&!m.done);state.current=firstA;
      setCourtSupportMode('singleElim');renderQueue();
    """)
    assert page.locator('#score .sk-queue-card').evaluate("el=>!el.classList.contains('hidden')")
    queue_a=page.locator('#queue').inner_text()
    court_b_names=page.evaluate("state.allMatches.Test.filter(m=>m.court==='B'&&!m.done).flatMap(m=>[m.white,m.red]).filter(Boolean)")
    assert all(name not in queue_a for name in court_b_names), (queue_a,court_b_names)

    page.evaluate("""
      state.currentCourt='B';const firstB=state.matches.findIndex(m=>m.court==='B'&&!m.done);state.current=firstB;renderQueue();
    """)
    queue_b=page.locator('#queue').inner_text()
    court_a_names=page.evaluate("state.allMatches.Test.filter(m=>m.court==='A'&&!m.done).flatMap(m=>[m.white,m.red]).filter(Boolean)")
    assert all(name not in queue_b for name in court_a_names), (queue_b,court_a_names)

    # Single-court direct elimination retains its existing no-queue presentation.
    page.evaluate("state.divisionCourts.Test='A';state.currentCourt='A';setCourtSupportMode('singleElim')")
    assert page.locator('#score .sk-queue-card').evaluate("el=>el.classList.contains('hidden')")

    # Pool championship placeholder queues are court-specific before Match Objects resolve.
    page.evaluate("""
      state.divisionTypes.Test='Round Robin';state.divisionCourts.Test='split';
      state.pools={Test:[
        {label:'A',size:4,players:[{name:'A1',dojo:'D'},{name:'A2',dojo:'D'},{name:'A3',dojo:'D'},{name:'A4',dojo:'D'}]},
        {label:'B',size:4,players:[{name:'B1',dojo:'D'},{name:'B2',dojo:'D'},{name:'B3',dojo:'D'},{name:'B4',dojo:'D'}]}
      ]};state.brackets={Test:championshipTemplateForTotal(8)};state.allMatches={Test:[]};state.byeWinners={Test:[]};
      poolPositionsResolved=()=>false;
    """)
    groups_a=page.evaluate("poolChampionshipQueueGroups('Test','A').map(g=>[g.label,g.rows.length])")
    groups_b=page.evaluate("poolChampionshipQueueGroups('Test','B').map(g=>[g.label,g.rows.length])")
    assert groups_a==[['Semifinal',1],['Final',1]],groups_a
    assert groups_b==[['Semifinal',1]],groups_b

    # Repeated advancement resolution creates exactly one logical Final.
    page.evaluate("""
      state.divisionCourts.Test='split';state.brackets={Test:[['A1','B2'],['B1','A2']]};state.byeWinners={Test:[]};
      state.allMatches={Test:[
        {division:'Test',pool:'Championship',white:'W1',red:'R1',wdojo:'D',rdojo:'D',position:'Semifinal',done:true,wp:['M'],rp:[],type:'individual',championship:true,court:'A',bracketSlot:0},
        {division:'Test',pool:'Championship',white:'W2',red:'R2',wdojo:'D',rdojo:'D',position:'Semifinal',done:true,wp:[],rp:['M'],type:'individual',championship:true,court:'B',bracketSlot:1}
      ]};
      recomputeChampionshipAdvancement('Test');recomputeChampionshipAdvancement('Test');recomputeChampionshipAdvancement('Test');
    """)
    assert page.evaluate("state.allMatches.Test.filter(m=>m.championship&&m.position==='Final'&&m.bracketSlot===0).length")==1
    assert page.evaluate("state.allMatches.Test.find(m=>m.position==='Final').court")=='A'

    assert not errors,errors
    print('PASS: Split-court stabilization 12/12 assertions')
    browser.close()
