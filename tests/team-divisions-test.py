"""#85: division isolation, legacy load, scoring, display names and cloud edit races.

Every app operation uses KSMTest / KsmApp. Held requests establish save ordering;
Playwright's clock keeps local test autosaves from creating an unrelated cloud event.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker


def local_cases(browser):
    problems = []
    page = browser.new_page(viewport={'width':1280,'height':900})
    page.clock.install()
    app = KsmApp.local(page, problems=problems, query='?court=B')
    app.expect_dialog('Create Staff password')
    page.clock.pause_at(page.evaluate('Date.now()'))
    fixture=json.loads((Path(__file__).parent/'golden/engine/team3-se-2.json').read_text())
    fixture['setup'][0]['court']='A'
    app.configure(fixture['setup'])
    page.evaluate("KSMTest.app.state.awards=[{award:'Fighting spirit',name:'TA1',dojo:'Dojo'}]")
    legacy = app.payload()
    for _ in range(3):
        page.evaluate("()=>{KSMTest.prepareCourt('A');KSMTest.play([['W','M']]);}")
    legacy=app.payload()
    legacy_final=app.final_state()
    legacy['state'].pop('teamDivisions')
    for team in legacy['state']['teams']:
        team.pop('teamDivisionId',None)
        team.pop('id',None)
    page.evaluate('(payload)=>KSMTest.applyLiveUpdate(payload)',legacy)
    assert app.final_state()==legacy_final, 'legacy results or medals changed on load'
    assert app.payload()['state']['awards']==legacy['state']['awards']
    assert len(app.payload()['state']['allMatches']['Team Tournament'])==3
    assert len(page.evaluate('KSMTest.teamDivisions()'))==1
    recovered=page.evaluate("""()=>{
      const base=KSMTest.payload();delete base.state.teamDivisions;
      base.state.teams.forEach(t=>{delete t.id;delete t.teamDivisionId});
      base.state.courtActionHistory={A:[],B:[]};base.state.courtRedoHistory={A:[],B:[]};
      const local=structuredClone(base),server=structuredClone(base);
      local.state.teams[0].senpo='Recovered offline';server.state.teams[1].chuken='Other device';
      return KSMTest.app.rebaseLocalPayloadOnRecord(local,{payload:server,revision:1},0,base).state.teams;
    }""")
    assert recovered[0]['senpo']=='Recovered offline' and recovered[1]['chuken']=='Other device', 'legacy recovery merge discarded an independent edit'
    # New metadata is authoritative even when its legacy Setup adapters are stale.
    newer=app.payload();newer['setup']['teamFormat']='5-Person Team';newer['setup']['teamAwardMode']='top1'
    page.evaluate('payload=>KSMTest.applyLiveUpdate(payload)',newer)
    app.nav('setup');app.click('setup-save-continue')
    assert page.evaluate('KSMTest.teamDivisions()[0].teamFormat')=='3-Person Team', 'legacy adapter overwrote the persisted division format'
    assert page.evaluate('KSMTest.teamDivisions()[0].awardMode')=='top2', 'legacy adapter overwrote the persisted division awards'
    # First division's existing generated structure is discarded for this new draw.
    page.evaluate("""() => {KSMTest.app.state.generated=false;KSMTest.app.state.allMatches={};} """)
    first = page.evaluate('KSMTest.teamDivisions()[0].id')
    app.expect_dialog('Add another team division before removing one with teams.')
    assert page.evaluate('id=>KSMTest.removeTeamDivision(id)',first) is False
    temporary=page.evaluate("KSMTest.addTeamDivision('Temporary')")
    page.evaluate('id=>KSMTest.assignTeamDivision(0,id)',temporary)
    app.expect_dialog('Remove Temporary?',True)
    assert page.evaluate('id=>KSMTest.removeTeamDivision(id)',temporary)
    assert any('will move to Team Tournament' in message for message in app.seen_dialogs)
    assert app.payload()['state']['teams'][0]['teamDivisionId']==first
    second = page.evaluate("KSMTest.addTeamDivision('Adults')")
    spare=page.evaluate("KSMTest.addTeamDivision('Spare')")
    last=page.evaluate("KSMTest.addTeamDivision('Last')")
    page.evaluate('id=>KSMTest.removeTeamDivision(id)',spare)
    appended=page.evaluate("KSMTest.addTeamDivision('Appended')")
    ordering={d['id']:d['order'] for d in page.evaluate('KSMTest.teamDivisions()')}
    assert ordering[appended]>ordering[last], 'add reused a removed row position'
    page.evaluate('ids=>ids.forEach(id=>KSMTest.removeTeamDivision(id))',[last,appended])
    assert page.evaluate("([id])=>KSMTest.updateTeamDivision(id,{teamFormat:'5-Person Team',teamTournamentFormat:'Round Robin',court:'B'})",[second]) is None
    app.nav('setup')
    name=page.locator(sel('team-division-name')).first
    name.fill('Pending Kids')
    page.evaluate('KSMTest.app.renderAll()')
    assert name.input_value()=='Pending Kids' and name.evaluate('el=>el===document.activeElement'), 'redraw dropped typed division name'
    name.press('Tab')
    assert page.evaluate('KSMTest.teamDivisions()[0].name')=='Pending Kids'
    page.evaluate("([id])=>KSMTest.updateTeamDivision(id,{name:'Kids',court:'A',awardMode:'top1'})",[first])
    page.evaluate("""([id])=>{
      const st=KSMTest.app.state;
      st.teams.push(...['C','D'].map((n,i)=>({id:'new:'+n,team:'Team '+n,teamDivisionId:id,status:'Checked',senpo:n+'1',jiho:n+'2',chuken:n+'3',fukusho:n+'4',taisho:n+'5'})));
      KSMTest.app.generatePools({validated:true});
    }""",[second])
    state = app.payload()['state']
    assert len(state['allMatches'][first])==3 and len(state['allMatches'][second])==5
    assert all(m['court']=='A' for m in state['allMatches'][first])
    assert all(m['court']=='B' for m in state['allMatches'][second])
    for court,expected in [('A','Kids'),('B','Adults')]:
        app.open_court(court)
        page.wait_for_function("name=>document.querySelector('[data-testid=court-division-title]').textContent===name",arg=expected)
        assert expected in page.locator(sel('court-division-select')).inner_text()
    app.nav('live-scores')
    page.wait_for_function("document.getElementById('publicLive').textContent.includes('Adults')")
    assert 'Kids' in page.locator('#publicLive').inner_text()
    app.nav('overview')
    page.wait_for_function("document.getElementById('directorCourtGrid').textContent.includes('Adults')")
    assert 'Kids' in page.locator('#directorCourtGrid').inner_text()
    page.evaluate("()=>{KSMTest.app.state.publicCourt='B';KSMTest.renderTv();}")
    page.wait_for_function("document.querySelector('[data-testid=tv-division]').textContent==='Adults'")
    app.nav('setup');app.click('setup-export-brackets')
    assert 'Kids' in page.locator('#printBody').inner_text() and 'Adults' in page.locator('#printBody').inner_text()
    assert second not in page.locator('#printBody').inner_text(), 'printed an internal division ID'
    played = {first:0,second:0}
    for _ in range(30):
        progress = False
        for court in ['A','B']:
            division = page.evaluate("""court=>{const m=KSMTest.prepareCourt(court);if(!m)return null;const id=m.division;KSMTest.play([['W','M']]);return id;}""",court)
            if division:
                played[division]+=1
                progress = True
        if not progress:
            break
    assert played=={first:3,second:5}, played
    final = app.final_state()
    app.nav('results')
    page.wait_for_function("document.querySelectorAll('[data-testid=result-card-title]').length===2")
    assert set(page.locator(sel('result-card-title')).all_text_contents())=={'Kids','Adults'}
    assert len(page.locator(sel('placement-row')).all_text_contents())==3
    assert len(final[first]['placements'])==1 and len(final[second]['placements'])==2, 'divisions shared an award mode'
    app.nav('setup');app.click('setup-export-results')
    assert 'Kids' in page.locator('#printBody').inner_text() and 'Adults' in page.locator('#printBody').inner_text()
    # Renaming and reordering after scoring keep every match, result and assignment by ID.
    assignments=[t['teamDivisionId'] for t in app.payload()['state']['teams']]
    page.evaluate("id=>KSMTest.updateTeamDivision(id,{name:'Adult Open'})",second)
    page.evaluate("id=>KSMTest.moveTeamDivision(id,'up')",second)
    assert [t['teamDivisionId'] for t in app.payload()['state']['teams']]==assignments
    assert app.final_state()==final
    # A second-division kachinuki reaches the last opposing player and only then ends.
    page.evaluate("""id=>{KSMTest.app.state.generated=false;KSMTest.updateTeamDivision(id,{teamFormat:'Kachinuki'});KSMTest.app.generatePools({validated:true});}""",second)
    for _ in range(20):
        progressed=page.evaluate("""()=>{const m=KSMTest.prepareCourt('B');if(!m)return false;KSMTest.play([['W','M']]);return true;}""")
        if not progressed:
            break
    bouts=app.payload()['state']['allMatches'][second]
    assert len(bouts)==3 and all(m['done'] for m in bouts), bouts
    assert any(m.get('rIndex')==2 for m in bouts), 'last player never lost'
    # Continue and Up next display names while their actions keep persisted IDs.
    page.evaluate("""id=>{KSMTest.app.state.generated=false;KSMTest.updateTeamDivision(id,{court:'A'});KSMTest.moveTeamDivision(id,'down');KSMTest.app.generatePools({validated:true});}""",second)
    app.open_court('A')
    assert page.evaluate('id=>KSMTest.app.ksmUpNext("A",id).division',first)=='Adult Open'
    for _ in range(3):
        page.evaluate("()=>{KSMTest.prepareCourt('A');KSMTest.play([['W','M']]);}")
    page.wait_for_selector(sel('court-continue'))
    assert page.locator(sel('court-continue')).inner_text()=='Continue to Adult Open →'
    app.click('court-continue')
    assert app.payload()['state']['courtState']['A']['division']==second, 'Continue selected a label instead of its stable ID'
    assert not problems, problems
    page.close()


def merge_cases(browser, base):
    problems=[]
    a=KsmApp.open_device(browser,base,'A',problems,tournament_name='Team divisions sync')
    tid=a.create_tournament();a.wait_idle()
    first=a.page.evaluate('KSMTest.teamDivisions()[0].id')
    second=a.page.evaluate("KSMTest.addTeamDivision('Adults')")
    a.page.evaluate("id=>KSMTest.app.state.teams=[{id:'team-1',team:'One',teamDivisionId:id,status:'Checked'},{id:'team-2',team:'Two',teamDivisionId:id,status:'Checked'}]",first)
    a.save_now();a.wait_idle()
    b=KsmApp.open_device(browser,base,'B',problems,f'?tournament={tid}')
    b.staff_login();b.wait_idle();b.watch_conflicts()

    def race(mine,theirs):
        a.wait_idle();b.wait_idle()
        b.hold_next_save();mine()
        b.page.evaluate("KSMTest.saveNow('Team division race')")
        b.wait_held_save()
        theirs();a.save_now();a.wait_idle()
        b.release_save();b.wait_idle()
        rev=fetch_record(base,tid)['revision'];a.wait_revision(rev);b.wait_revision(rev)
        return fetch_record(base,tid)['payload']['state']

    st=race(lambda:b.page.evaluate("id=>KSMTest.moveTeamDivision(id,'up')",second),lambda:a.page.evaluate("id=>KSMTest.updateTeamDivision(id,{name:'Kids renamed'})",first))
    assert next(d for d in st['teamDivisions'] if d['id']==first)['name']=='Kids renamed'
    assert sorted(st['teamDivisions'],key=lambda d:d['order'])[0]['id']==second
    assert st['teams'][0]['teamDivisionId']==first
    st=race(lambda:b.page.evaluate("KSMTest.addTeamDivision('B added')"),lambda:a.page.evaluate("KSMTest.addTeamDivision('A added')"))
    assert {'A added','B added'}.issubset({d['name'] for d in st['teamDivisions']})
    added=next(d['id'] for d in st['teamDivisions'] if d['name']=='A added')
    st=race(lambda:b.page.evaluate("id=>KSMTest.assignTeamDivision(0,id)",second),lambda:a.page.evaluate("id=>KSMTest.assignTeamDivision(1,id)",added))
    assert st['teams'][0]['teamDivisionId']==second and st['teams'][1]['teamDivisionId']==added, 'simultaneous team assignments lost an edit'
    a.page.evaluate('id=>KSMTest.assignTeamDivision(0,id)',first);a.save_now();a.wait_idle();b.wait_revision(fetch_record(base,tid)['revision'])
    st=race(lambda:b.page.evaluate("id=>KSMTest.assignTeamDivision(0,id)",second),lambda:a.page.evaluate("id=>KSMTest.removeTeamDivision(id)",second))
    assert second not in {d['id'] for d in st['teamDivisions']}
    assert st['teams'][0]['teamDivisionId']==sorted(st['teamDivisions'],key=lambda d:(d['order'],d['id']))[0]['id']
    assert 'Team division assignment (division removed)' in b.page.evaluate('KSMTest.diagnostics().mergeConflicts'), b.page.evaluate('KSMTest.diagnostics()')
    assert b.conflicts()>=4
    b.reload();b.wait_revision(fetch_record(base,tid)['revision'])
    assert b.payload()['state']['teams'][0]['teamDivisionId']==st['teams'][0]['teamDivisionId']
    assert not problems,problems
    a.close();b.close()


def main():
    with sync_playwright() as p:
        browser=launch_chromium(p)
        local_cases(browser)
        with local_worker() as base:
            merge_cases(browser,base)
        browser.close()
    print('PASS team divisions: legacy load, separate courts/results, stable names/order, kachinuki and held-save conflicts')

if __name__=='__main__':
    main()
