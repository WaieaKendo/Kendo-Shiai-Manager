from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

HTML=(Path(__file__).resolve().parents[1]/'public'/'index.html').read_text()

with sync_playwright() as p:
    browser=launch_chromium(p)
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    load_app(page, HTML)

    allowed=page.evaluate("Array.from(APPROVED_DYNAMIC_MATCH_TYPES)")
    assert allowed==[
      'INDIVIDUAL_POOL_TIEBREAK','TEAM_3_PERSON_REPRESENTATIVE','TEAM_5_PERSON_REPRESENTATIVE',
      'KACHINUKI_REPRESENTATIVE','TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK',
      'TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK','KACHINUKI_ROUND_ROBIN_TIEBREAK'
    ],allowed

    # Championship structure is complete at generation and never grows during sync.
    page.evaluate("""
      state.divisions=['Test'];state.divisionTypes={Test:'Round Robin'};state.divisionCourts={Test:'split'};
      state.competitors=Array.from({length:8},(_,i)=>({name:'P'+(i+1),dojo:'D',division:'Test',seed:'',status:'Checked'}));
      state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.brackets={};state.championshipNodes={};state.byeWinners={};state.currentByDivision={};
      generateDivisionState('Test');
      window.__standardCount=state.allMatches.Test.filter(m=>m.championship).length;
      window.__totalCount=state.allMatches.Test.length;
      syncChampionshipTemplate('Test');syncChampionshipTemplate('Test');syncChampionshipTemplate('Test');
    """)
    assert page.evaluate("window.__standardCount===3") # 2 semifinals + final
    assert page.evaluate("state.allMatches.Test.length===window.__totalCount")
    assert page.evaluate("state.allMatches.Test.filter(m=>m.championship).every(m=>m.origin==='TEMPLATE')")
    assert page.evaluate("state.allMatches.Test.filter(m=>m.championship).every(m=>m.templateNode===true)")

    # No non-tiebreak subsystem can append an arbitrary Match Object through the approved path.
    unauthorized=page.evaluate("""()=>{try{appendApprovedDynamicMatches('Test',null,{division:'Test'},'SEMIFINAL');return false}catch(e){return /Unauthorized/.test(e.message)}}""")
    assert unauthorized

    # Individual pool tiebreak is approved and marked with an explicit origin/type.
    page.evaluate("""
      const pool={label:'Z',size:2,players:[{name:'ZA',dojo:'D'},{name:'ZB',dojo:'D'}]};
      state.pools.Test.push(pool);
      const anchor={division:'Test',pool:'Z',white:'ZA',red:'ZB',wdojo:'D',rdojo:'D',done:true,wp:[],rp:[],type:'individual',court:'B'};
      state.allMatches.Test.push(anchor);
      const tb=makeTiebreakMatch('Test','Z',{name:'ZA',dojo:'D'},{name:'ZB',dojo:'D'},true,1,0);
      appendApprovedDynamicMatches('Test',anchor,tb,'INDIVIDUAL_POOL_TIEBREAK');
    """)
    assert page.evaluate("state.allMatches.Test.find(m=>m.dynamicType==='INDIVIDUAL_POOL_TIEBREAK').origin==='TIEBREAK'")

    # Static source contract: championship synchronizer contains no array insertion.
    source=HTML
    section=source[source.index('function recomputeChampionshipAdvancement'):source.index('function firstRoundName',source.index('function recomputeChampionshipAdvancement'))]
    assert '.push(' not in section and '.splice(' not in section, section

    assert not errors,errors
    print('PASS: Match Object origin invariant 12/12 assertions')
    browser.close()
