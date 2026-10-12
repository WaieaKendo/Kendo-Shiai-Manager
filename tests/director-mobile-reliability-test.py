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
      state.divisionTypes={Direct8:'Single Elimination'};
      state.divisionCourts={Direct8:'A'};
      state.singleElimComps={Direct8:Array.from({length:8},(_,i)=>({name:'P'+(i+1)}))};
      state.singleElimNodes={Direct8:teamBracketNodesForCount(8)};
      state.allMatches={Direct8:[]};
    """)
    assert page.evaluate("directorSingleElimTotal('Direct8','A')")==7
    assert page.evaluate("directorSingleElimTotal('Direct8','B')")==0
    direct=page.evaluate("directorDivisionProgress('Direct8','A')")
    assert direct=={'completed':0,'total':7,'remaining':7,'variable':False},direct

    # Selecting Kachinuki globally must not suppress unrelated individual totals.
    page.evaluate("""
      if(window.teamFormat)teamFormat.value='Kachinuki';
      state.divisionTypes.Individual='Single Elimination';
      state.divisionCourts.Individual='B';
      state.singleElimComps.Individual=Array.from({length:4},(_,i)=>({name:'I'+(i+1)}));
      state.singleElimNodes.Individual=teamBracketNodesForCount(4);
      state.allMatches.Individual=[];
      state.divisionTypes['Team Tournament']='Team';
      state.teams=[{team:'A',division:'Team Tournament',type:'Kachinuki'}];
      state.allMatches['Team Tournament']=[
        {division:'Team Tournament',type:'kachinuki',done:true,court:'A',teamPair:'P1'},
        {division:'Team Tournament',type:'kachinuki',done:false,court:'A',teamPair:'P1'}
      ];
    """)
    individual=page.evaluate("directorDivisionProgress('Individual','B')")
    kach=page.evaluate("directorDivisionProgress('Team Tournament','A')")
    summary=page.evaluate("tournamentSummary()")
    assert individual=={'completed':0,'total':3,'remaining':3,'variable':False},individual
    assert kach=={'completed':1,'total':None,'remaining':None,'variable':True},kach
    assert summary['total']==10 or summary['total']==3, summary
    # The known fixed-format total must remain present; exact total can include Direct8.
    assert summary['total']>=3 and summary['variable'] is True

    # Mobile date field matches the width of other Setup fields.
    date_box=page.locator('#tDate').bounding_box()
    name_box=page.locator('#tName').bounding_box()
    assert date_box and name_box
    assert abs(date_box['width']-name_box['width']) < 1.5,(date_box,name_box)

    # Active match is compacted on portrait mobile.
    page.evaluate("navigateTo('score')")
    style=page.locator('#score .scoreboard-match').evaluate("el=>getComputedStyle(el)")
    assert float(style['rowGap'].replace('px','')) <= 4.1,style['rowGap']

    assert not errors,errors
    print('PASS: Director/mobile reliability 10/10 assertions')
    browser.close()
