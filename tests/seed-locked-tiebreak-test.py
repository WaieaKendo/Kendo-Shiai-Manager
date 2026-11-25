from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html
HTML=app_html()
with sync_playwright() as p:
  b=launch_chromium(p);page=b.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)));load_app(page, HTML)
  page.evaluate("""
    KSMTest.app.state.pools={Test:[{label:'A',size:3,players:[{name:'A',dojo:'D'},{name:'B',dojo:'D'},{name:'C',dojo:'D'}]}]};
    KSMTest.app.state.brackets={Test:[['A1','A2']]};KSMTest.app.state.allMatches={Test:[]};KSMTest.app.state.divisionCourts={Test:'A'};
    const base=[{name:'A',dojo:'D',wins:1,pts:1},{name:'B',dojo:'D',wins:1,pts:1},{name:'C',dojo:'D',wins:1,pts:1}];
    KSMTest.app.initialPoolStandings=()=>base;
    // Series 1 locks A first, B/C tied.
    KSMTest.app.state.allMatches.Test.push(
      KSMTest.app.makeTiebreakMatch('Test','A',base[0],base[1],false,1,0),
      KSMTest.app.makeTiebreakMatch('Test','A',base[2],base[1],false,1,1),
      KSMTest.app.makeTiebreakMatch('Test','A',base[2],base[0],false,1,2)
    );
    const s1=KSMTest.app.state.allMatches.Test; s1[0].done=true;s1[0].wp=['M'];s1[0].rp=[];s1[1].done=true;s1[1].wp=[];s1[1].rp=[];s1[2].done=true;s1[2].wp=[];s1[2].rp=['M'];
    // Series 2 gives B a large score, but it may only resolve seed 2 and cannot replace locked A.
    const b2=KSMTest.app.makeTiebreakMatch('Test','A',base[1],base[2],true,2,0);b2.done=true;b2.wp=['M','K'];b2.rp=[];KSMTest.app.state.allMatches.Test.push(b2);
  """)
  order=page.evaluate("KSMTest.app.poolStandings('A','Test').map(x=>x.name)")
  assert order[:3]==['A','B','C'],order
  assert page.evaluate("KSMTest.app.poolStandings('A','Test')[0].seedLocked===true")
  assert page.evaluate("KSMTest.app.unresolvedRequiredTiebreakGroup('A','Test',{start:1,end:3,players:KSMTest.app.initialPoolStandings()},2)===null")
  assert not errs,errs
  print('PASS: seed-locked tiebreak resolution 3/3 assertions');b.close()
