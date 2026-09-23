from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
HTML=(Path(__file__).resolve().parents[1]/'public'/'index.html').read_text()
with sync_playwright() as p:
  b=launch_chromium(p);page=b.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)));load_app(page, HTML)
  page.evaluate("""
    state.pools={Test:[{label:'A',size:3,players:[{name:'A',dojo:'D'},{name:'B',dojo:'D'},{name:'C',dojo:'D'}]}]};
    state.brackets={Test:[['A1','A2']]};state.allMatches={Test:[]};state.divisionCourts={Test:'A'};
    const base=[{name:'A',dojo:'D',wins:1,pts:1},{name:'B',dojo:'D',wins:1,pts:1},{name:'C',dojo:'D',wins:1,pts:1}];
    initialPoolStandings=()=>base;
    // Series 1 locks A first, B/C tied.
    state.allMatches.Test.push(
      makeTiebreakMatch('Test','A',base[0],base[1],false,1,0),
      makeTiebreakMatch('Test','A',base[2],base[1],false,1,1),
      makeTiebreakMatch('Test','A',base[2],base[0],false,1,2)
    );
    const s1=state.allMatches.Test; s1[0].done=true;s1[0].wp=['M'];s1[0].rp=[];s1[1].done=true;s1[1].wp=[];s1[1].rp=[];s1[2].done=true;s1[2].wp=[];s1[2].rp=['M'];
    // Series 2 gives B a large score, but it may only resolve seed 2 and cannot replace locked A.
    const b2=makeTiebreakMatch('Test','A',base[1],base[2],true,2,0);b2.done=true;b2.wp=['M','K'];b2.rp=[];state.allMatches.Test.push(b2);
  """)
  order=page.evaluate("poolStandings('A','Test').map(x=>x.name)")
  assert order[:3]==['A','B','C'],order
  assert page.evaluate("poolStandings('A','Test')[0].seedLocked===true")
  assert page.evaluate("unresolvedRequiredTiebreakGroup('A','Test',{start:1,end:3,players:initialPoolStandings()},2)===null")
  assert not errs,errs
  print('PASS: seed-locked tiebreak resolution 3/3 assertions');b.close()
