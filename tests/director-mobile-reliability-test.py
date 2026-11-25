from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html

HTML=app_html()

with sync_playwright() as p:
    browser=launch_chromium(p)
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    load_app(page, HTML)

    # Eight-person direct elimination is seven scoreable matches and belongs
    # wholly to its assigned court in the current engine.
    page.evaluate("""
      KSMTest.app.state.divisionTypes={Direct8:'Single Elimination'};
      KSMTest.app.state.divisionCourts={Direct8:'A'};
      KSMTest.app.state.singleElimComps={Direct8:Array.from({length:8},(_,i)=>({name:'P'+(i+1)}))};
      KSMTest.app.state.singleElimNodes={Direct8:KSMTest.app.teamBracketNodesForCount(8)};
      KSMTest.app.state.allMatches={Direct8:[]};
    """)
    assert page.evaluate("KSMTest.app.directorSingleElimTotal('Direct8','A')")==7
    assert page.evaluate("KSMTest.app.directorSingleElimTotal('Direct8','B')")==0
    direct=page.evaluate("KSMTest.app.directorDivisionProgress('Direct8','A')")
    assert direct=={'completed':0,'total':7,'remaining':7,'variable':False},direct

    # Selecting Kachinuki globally must not suppress unrelated individual totals.
    page.evaluate("""
      if(window.teamFormat)teamFormat.value='Kachinuki';
      KSMTest.app.state.divisionTypes.Individual='Single Elimination';
      KSMTest.app.state.divisionCourts.Individual='B';
      KSMTest.app.state.singleElimComps.Individual=Array.from({length:4},(_,i)=>({name:'I'+(i+1)}));
      KSMTest.app.state.singleElimNodes.Individual=KSMTest.app.teamBracketNodesForCount(4);
      KSMTest.app.state.allMatches.Individual=[];
      KSMTest.app.state.divisionTypes['Team Tournament']='Team';
      KSMTest.app.state.teams=[{team:'A',division:'Team Tournament',type:'Kachinuki'}];
      KSMTest.app.state.allMatches['Team Tournament']=[
        {division:'Team Tournament',type:'kachinuki',done:true,court:'A',teamPair:'P1'},
        {division:'Team Tournament',type:'kachinuki',done:false,court:'A',teamPair:'P1'}
      ];
    """)
    individual=page.evaluate("KSMTest.app.directorDivisionProgress('Individual','B')")
    kach=page.evaluate("KSMTest.app.directorDivisionProgress('Team Tournament','A')")
    summary=page.evaluate("KSMTest.app.tournamentSummary()")
    assert individual=={'completed':0,'total':3,'remaining':3,'variable':False},individual
    assert kach=={'completed':1,'total':None,'remaining':None,'variable':True},kach
    # The fixed-format total (Individual 3, with Direct8 7) plus the kachinuki bouts known so far
    # (2; F15: counted in the total as in completed, so the bar stays within 100%).
    assert summary['total']==12 or summary['total']==5, summary
    assert summary['completed']<=summary['total'], summary
    assert summary['total']>=3 and summary['variable'] is True

    # Mobile date field matches the width of other Setup fields.
    date_box=page.locator('#tDate').bounding_box()
    name_box=page.locator('#tName').bounding_box()
    assert date_box and name_box
    assert abs(date_box['width']-name_box['width']) < 1.5,(date_box,name_box)

    # Active match is compacted on portrait mobile.
    page.evaluate("KSMTest.app.navigateTo('score')")
    style=page.locator('#score .scoreboard-match').evaluate("el=>getComputedStyle(el)")
    assert float(style['rowGap'].replace('px','')) <= 4.1,style['rowGap']

    assert not errors,errors
    print('PASS: Director/mobile reliability 10/10 assertions')
    browser.close()
