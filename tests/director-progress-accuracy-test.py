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

    # Pool play: 6 pool bouts + a four-qualifier championship (3 bouts) = 9.
    page.evaluate("""
      KSMTest.app.state.pools={PoolDiv:[
        {label:'A',players:[{name:'A1'},{name:'A2'},{name:'A3'}]},
        {label:'B',players:[{name:'B1'},{name:'B2'},{name:'B3'}]}
      ]};
      KSMTest.app.state.divisionTypes={PoolDiv:'Round Robin'};
      KSMTest.app.state.divisionCourts={PoolDiv:'A'};
      KSMTest.app.state.allMatches={PoolDiv:[
        {division:'PoolDiv',pool:'A',type:'individual',done:true,court:'A'},
        {division:'PoolDiv',pool:'A',type:'individual',done:false,court:'A'},
        {division:'PoolDiv',pool:'A',type:'individual',done:false,court:'A'},
        {division:'PoolDiv',pool:'B',type:'individual',done:false,court:'A'},
        {division:'PoolDiv',pool:'B',type:'individual',done:false,court:'A'},
        {division:'PoolDiv',pool:'B',type:'individual',done:false,court:'A'}
      ]};
    """)
    pool=page.evaluate("KSMTest.app.directorDivisionProgress('PoolDiv','A')")
    assert pool=={'completed':1,'total':9,'remaining':8,'variable':False},pool

    # Direct elimination: Court Context nodes, not only instantiated first-round Match Objects.
    page.evaluate("""
      KSMTest.app.state.pools.DirectDiv=[];
      KSMTest.app.state.divisionTypes.DirectDiv='Single Elimination';
      KSMTest.app.state.divisionCourts.DirectDiv='A';
      KSMTest.app.state.singleElimNodes={DirectDiv:[
        {id:'Q1',left:{team:1},right:{team:2},court:'A'},
        {id:'Q2',left:{team:3},right:{team:4},court:'A'},
        {id:'S1',left:{ref:'Q1'},right:{ref:'Q2'},court:'A'},
        {id:'F',left:{ref:'S1'},right:{team:5},court:'A'}
      ]};
      KSMTest.app.state.allMatches.DirectDiv=[
        {division:'DirectDiv',singleElim:true,done:true,court:'A'},
        {division:'DirectDiv',singleElim:true,done:false,court:'A'}
      ];
    """)
    direct=page.evaluate("KSMTest.app.directorDivisionProgress('DirectDiv','A')")
    assert direct=={'completed':1,'total':4,'remaining':3,'variable':False},direct

    # Five-person team: three scoreable team pairings x five bouts = 15.
    page.evaluate("""
      if(window.teamFormat)teamFormat.value='5-Person Team';
      KSMTest.app.state.teams=[{team:'One',division:'Team Tournament',type:'5-Person Team'}];
      KSMTest.app.state.divisionTypes['Team Tournament']='Team';
      KSMTest.app.state.teamBracketNodes={'Team Tournament':[
        {id:'SF1',left:{team:1},right:{team:2},court:'A'},
        {id:'SF2',left:{team:3},right:{team:4},court:'B'},
        {id:'F',left:{ref:'SF1'},right:{ref:'SF2'},court:'A'}
      ]};
      KSMTest.app.state.allMatches['Team Tournament']=Array.from({length:5},(_,i)=>({
        division:'Team Tournament',type:'teamPosition',teamPair:'node-SF1',done:i<2,court:'A'
      }));
    """)
    team_all=page.evaluate("KSMTest.app.directorDivisionProgress('Team Tournament',null)")
    team_a=page.evaluate("KSMTest.app.directorDivisionProgress('Team Tournament','A')")
    assert team_all=={'completed':2,'total':15,'remaining':13,'variable':False},team_all
    assert team_a=={'completed':2,'total':10,'remaining':8,'variable':False},team_a

    # Three-person team uses the same queue pairing count with a roster size of three.
    page.evaluate("""
      if(window.teamFormat)teamFormat.value='3-Person Team';
      KSMTest.app.state.teams=[{team:'One',division:'Team Tournament',type:'3-Person Team'}];
    """)
    team_three=page.evaluate("KSMTest.app.directorDivisionProgress('Team Tournament',null)")
    assert team_three['total']==9,team_three

    # Kachinuki has no fixed denominator, progress bar, or remaining count.
    page.evaluate("""
      if(window.teamFormat)teamFormat.value='Kachinuki';
      KSMTest.app.state.teams=[{team:'One',division:'Team Tournament',type:'Kachinuki'}];
      KSMTest.app.state.allMatches['Team Tournament']=[
        {division:'Team Tournament',type:'kachinuki',teamPair:'node-SF1',done:true,court:'A'},
        {division:'Team Tournament',type:'kachinuki',teamPair:'node-SF1',done:false,court:'A'}
      ];
      KSMTest.app.state.courtState.A={division:'Team Tournament',index:1};
      KSMTest.app.state.courtState.B={division:null,index:0};
      KSMTest.app.renderDirector();
    """)
    k=page.evaluate("KSMTest.app.directorDivisionProgress('Team Tournament','A')")
    assert k=={'completed':1,'total':None,'remaining':None,'variable':True},k
    first=page.locator('.director-court-card').first
    assert '1 Match Completed' in first.inner_text()  # singular since the quirk pass
    assert first.locator('.director-progress-track').count()==0

    assert not errors,errors
    print('PASS: Director progress accuracy 9/9 assertions')
    browser.close()
