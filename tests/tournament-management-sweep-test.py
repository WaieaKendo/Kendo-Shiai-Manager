from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

HTML=(Path(__file__).resolve().parents[1]/'public'/'index.html').read_text()
checks=0
with sync_playwright() as p:
    browser=launch_chromium(p)
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    load_app(page, HTML)

    # Direct-elimination split sweep 4-32.
    for n in range(4,33):
        page.evaluate("""n=>{
          state.divisions=['Sweep'];state.divisionTypes={Sweep:'Single Elimination'};state.divisionCourts={Sweep:'split'};
          state.competitors=Array.from({length:n},(_,i)=>({name:'P'+(i+1),dojo:'D'+i,division:'Sweep',seed:i<4?String(i+1):'',status:'Checked'}));
          state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.teamBracketNodes={};state.teamPools={};state.brackets={};state.byeWinners={};state.currentByDivision={};
          generateDivisionState('Sweep');
        }""",n)
        nodes=page.evaluate("state.singleElimNodes.Sweep")
        matches=page.evaluate("state.allMatches.Sweep")
        assert any(x['id']=='F' and x['court']=='A' for x in nodes),(n,'final')
        for m in matches:
            node=next(x for x in nodes if x['id']==m['elimNodeId'])
            expected='A' if node['round']=='Final' else node['court']
            assert m['court']==expected,(n,m['elimNodeId'],m['court'],expected)
            checks+=1
        checks+=1

    # Pool split sweep 6-32; pools intact and B receives odd extra.
    for n in range(6,33):
        page.evaluate("""n=>{
          state.divisions=['Sweep'];state.divisionTypes={Sweep:'Round Robin'};state.divisionCourts={Sweep:'split'};
          state.competitors=Array.from({length:n},(_,i)=>({name:'P'+(i+1),dojo:'D'+i,division:'Sweep',seed:i<4?String(i+1):'',status:'Checked'}));
          state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.teamBracketNodes={};state.teamPools={};state.brackets={};state.byeWinners={};state.currentByDivision={};
          generateDivisionState('Sweep');
        }""",n)
        data=page.evaluate("state.pools.Sweep.map(p=>({label:p.label,court:p.court,matchCourts:[...new Set(state.allMatches.Sweep.filter(m=>m.pool===p.label).map(m=>m.court))]}))")
        a_count=len(data)//2
        assert sum(1 for x in data if x['court']=='A')==a_count,(n,data)
        assert sum(1 for x in data if x['court']=='B')==len(data)-a_count,(n,data)
        assert all(x['matchCourts']==[x['court']] for x in data),(n,data)
        checks+=3

    assert not errors,errors
    print(f'PASS: Tournament management sweep {checks} assertions across direct 4-32 and pools 6-32')
    browser.close()
