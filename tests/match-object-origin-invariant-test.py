from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html, app_source

HTML=app_html()

with sync_playwright() as p:
    browser=launch_chromium(p)
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    load_app(page, HTML)

    allowed=page.evaluate("Array.from(KSMTest.app.APPROVED_DYNAMIC_MATCH_TYPES)")
    assert allowed==[
      'INDIVIDUAL_POOL_TIEBREAK','TEAM_3_PERSON_REPRESENTATIVE','TEAM_5_PERSON_REPRESENTATIVE',
      'KACHINUKI_REPRESENTATIVE','TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK',
      'TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK','KACHINUKI_ROUND_ROBIN_TIEBREAK'
    ],allowed

    # Championship structure is complete at generation and never grows during sync.
    page.evaluate("""
      KSMTest.app.state.divisions=['Test'];KSMTest.app.state.divisionTypes={Test:'Round Robin'};KSMTest.app.state.divisionCourts={Test:'split'};
      KSMTest.app.state.competitors=Array.from({length:8},(_,i)=>({name:'P'+(i+1),dojo:'D',division:'Test',seed:'',status:'Checked'}));
      KSMTest.app.state.pools={};KSMTest.app.state.allMatches={};KSMTest.app.state.singleElimNodes={};KSMTest.app.state.singleElimComps={};KSMTest.app.state.brackets={};KSMTest.app.state.championshipNodes={};KSMTest.app.state.byeWinners={};KSMTest.app.state.currentByDivision={};
      KSMTest.app.generateDivisionState('Test');
      window.__standardCount=KSMTest.app.state.allMatches.Test.filter(m=>m.championship).length;
      window.__totalCount=KSMTest.app.state.allMatches.Test.length;
      KSMTest.app.syncChampionshipTemplate('Test');KSMTest.app.syncChampionshipTemplate('Test');KSMTest.app.syncChampionshipTemplate('Test');
    """)
    assert page.evaluate("window.__standardCount===3") # 2 semifinals + final
    assert page.evaluate("KSMTest.app.state.allMatches.Test.length===window.__totalCount")
    assert page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.championship).every(m=>m.origin==='TEMPLATE')")
    assert page.evaluate("KSMTest.app.state.allMatches.Test.filter(m=>m.championship).every(m=>m.templateNode===true)")

    # No non-tiebreak subsystem can append an arbitrary Match Object through the approved path.
    unauthorized=page.evaluate("""()=>{try{KSMTest.app.appendApprovedDynamicMatches('Test',null,{division:'Test'},'SEMIFINAL');return false}catch(e){return /Unauthorized/.test(e.message)}}""")
    assert unauthorized

    # Individual pool tiebreak is approved and marked with an explicit origin/type.
    page.evaluate("""
      const pool={label:'Z',size:2,players:[{name:'ZA',dojo:'D'},{name:'ZB',dojo:'D'}]};
      KSMTest.app.state.pools.Test.push(pool);
      const anchor={division:'Test',pool:'Z',white:'ZA',red:'ZB',wdojo:'D',rdojo:'D',done:true,wp:[],rp:[],type:'individual',court:'B'};
      KSMTest.app.state.allMatches.Test.push(anchor);
      const tb=KSMTest.app.makeTiebreakMatch('Test','Z',{name:'ZA',dojo:'D'},{name:'ZB',dojo:'D'},true,1,0);
      KSMTest.app.appendApprovedDynamicMatches('Test',anchor,tb,'INDIVIDUAL_POOL_TIEBREAK');
    """)
    assert page.evaluate("KSMTest.app.state.allMatches.Test.find(m=>m.dynamicType==='INDIVIDUAL_POOL_TIEBREAK').origin==='TIEBREAK'")

    # Static source contract: championship synchronizer contains no array insertion.
    source=app_source()
    section=source[source.index('function recomputeChampionshipAdvancement'):source.index('function firstRoundName',source.index('function recomputeChampionshipAdvancement'))]
    assert '.push(' not in section and '.splice(' not in section, section

    assert not errors,errors
    print('PASS: Match Object origin invariant 12/12 assertions')
    browser.close()
