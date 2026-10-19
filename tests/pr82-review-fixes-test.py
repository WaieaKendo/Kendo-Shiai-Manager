"""PR #82 regression cases; KSM_REVIEW_CASE selects a case for local revert checks.

Uses the existing real Worker/browser harness, routed requests and clock controls. F36 is #81.
"""
import os
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, put_record, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def draft_device(browser, base, problems):
    a=KsmApp.open_device(browser,base,'Draft device',problems,tournament_name='New beside draft')
    a.page.evaluate("tName.value='Keep this draft';KSMTest.app.markLocalSave('Draft fixture')")
    a.reload()
    assert 'Keep this draft' in a.page.get_by_test_id('local-draft').inner_text()
    return a


def draft_new(browser,base,problems):
    a=draft_device(browser,base,problems)
    a.create_tournament();a.wait_idle();a.go_to_library();a.reload()
    draft=a.page.get_by_test_id('local-draft')
    assert 'Keep this draft' in draft.inner_text()
    before=a.page.evaluate('localStorage.getItem(KSMTest.app.KSM_SAVE_KEY)')
    draft.get_by_role('button',name='Discard',exact=True).click()
    assert 'Keep this draft' in draft.inner_text() # confirmation before removal
    draft.get_by_role('button',name='Cancel',exact=True).click()
    draft.get_by_role('button',name='Discard',exact=True).click()
    draft.get_by_role('button',name='Discard draft',exact=True).click()
    assert a.page.get_by_test_id('local-draft').count()==0
    assert a.page.evaluate('localStorage.getItem(KSMTest.app.KSM_SAVE_KEY)')==before,'Discard removed active safety copy'
    a.close()


def draft_open(browser,base,problems):
    owner=KsmApp.open_device(browser,base,'Owner',problems,tournament_name='Open beside draft')
    tid=owner.create_tournament();owner.wait_idle();record=fetch_record(base,tid)
    a=draft_device(browser,base,problems)
    a.page.evaluate('(record)=>{KSMTest.app.rememberTournament(record);KSMTest.app.renderHomeTournamentLibrary()}',record)
    a.page.get_by_test_id('home-tournament-name').filter(has_text='Open beside draft').click()
    a.wait_for(lambda:a.tournament_id()==tid and a.visible_view()!=['home'],message='Open beside local draft')
    # A spectator returns through the existing Library operation, preserving its detached draft.
    a.page.evaluate('KSMTest.app.ksmShowLibrary()')
    draft=a.page.get_by_test_id('local-draft')
    assert 'Keep this draft' in draft.inner_text()
    draft.get_by_role('button',name='Open',exact=True).click()
    a.wait_for(lambda:a.visible_view()==['setup'],message='Open preserved draft')
    assert a.page.get_by_test_id('setup-tournament-name').input_value()=='Keep this draft'
    assert not a.tournament_id()
    a.close();owner.close()


def return_view(browser,base,problems):
    a=KsmApp.open_device(browser,base,'Court return',problems,tournament_name='Court return')
    a.create_tournament();a.wait_idle();a.open_court('B');a.wait_idle()
    before=a.page.evaluate('JSON.stringify(KSMTest.app.state.courtState)')
    a.go_to_library();a.click('library-return')
    assert a.visible_view()==['score'],'Return lost the court screen'
    assert a.page.evaluate('KSMTest.app.state.currentCourt')=='B'
    assert a.page.evaluate('JSON.stringify(KSMTest.app.state.courtState)')==before
    a.close()


def socket_return(browser,base,problems):
    a=KsmApp.open_device(browser,base,'Socket return',problems,tournament_name='Socket return')
    tid=a.create_tournament();a.wait_idle()
    a.page.wait_for_function('KSMTest.app.ksmCloudSocket?.readyState===WebSocket.OPEN')
    a.go_to_library()
    a.page.evaluate("window.__oldSocket=KSMTest.app.ksmCloudSocket;KSMTest.app.ksmCloudSocket.close(1000,'test drop')")
    a.page.wait_for_function('KSMTest.app.ksmCloudSocket===null')
    # online cannot reconnect while the home screen is set.
    a.page.evaluate("clearTimeout(KSMTest.app.ksmCloudReconnectTimer);KSMTest.app.ksmCloudReconnectTimer=null;dispatchEvent(new Event('online'));KSMTest.app.connectCloudSocket()")
    assert a.page.evaluate('KSMTest.app.ksmCloudSocket===null')
    record=fetch_record(base,tid);record['payload']['setup']['tHost']='Changed while in Library'
    put_record(base,tid,record['payload'],record['revision'])
    a.click('library-return')
    a.page.wait_for_function('KSMTest.app.ksmCloudSocket?.readyState===WebSocket.OPEN && KSMTest.app.ksmCloudSocket!==window.__oldSocket')
    a.wait_for(lambda:a.page.locator('#tHost').input_value()=='Changed while in Library',message='reconnect snapshot refresh')
    record=fetch_record(base,tid);record['payload']['setup']['tHost']='Remote after return'
    put_record(base,tid,record['payload'],record['revision'])
    a.wait_for(lambda:a.page.locator('#tHost').input_value()=='Remote after return',message='remote update after return')
    a.close()


def short_url(browser,base,problems):
    owner=KsmApp.open_device(browser,base,'Taken',problems,tournament_name='Taken short name')
    owner.create_tournament();owner.wait_idle();taken=owner.page.evaluate('KSMTest.app.cloudSession.slug')
    a=KsmApp.open_device(browser,base,'Rename',problems,tournament_name='Rename short name')
    tid=a.create_tournament();a.wait_idle();a.nav('setup')
    page=a.page;field=page.get_by_label('Short URL');hint=page.locator('#setupShortUrlStatus')
    mutation=page.evaluate('KSMTest.app.ksmLocalMutationVersion')
    puts=[];page.on('request',lambda request: puts.append(request.url) if request.method=='PUT' else None)
    field.fill('demo-cup-2026')
    with page.expect_response(lambda response:response.url.endswith('/slug')) as response:
        field.press('Enter')
    assert response.value.status==200
    a.wait_for(lambda:hint.inner_text()=='Saved',message='short URL saved')
    assert page.evaluate('KSMTest.app.cloudSession.slug')=='demo-cup-2026'
    assert fetch_record(base,tid)['slug']=='demo-cup-2026'
    assert not puts,'Short URL used tournament autosave'
    assert page.evaluate('KSMTest.app.ksmLocalMutationVersion')==mutation,'Short URL scheduled tournament autosave'
    field.fill(taken);field.press('Tab')
    a.wait_for(lambda:hint.inner_text()=='That name is taken',message='taken short URL')
    assert page.evaluate('KSMTest.app.cloudSession.slug')=='demo-cup-2026'
    assert field.get_attribute('aria-invalid')=='true'
    page.evaluate('KSMTest.app.renderAll()')
    assert field.input_value()==taken and hint.inner_text()=='That name is taken'
    public=KsmApp.open_device(browser,base,'Readonly',problems,app_path(tid))
    public.show_screen('setup')
    readonly=public.page.get_by_label('Short URL')
    assert readonly.input_value()=='demo-cup-2026' and readonly.get_attribute('readonly') is not None
    assert readonly.evaluate('el=>getComputedStyle(el).borderTopWidth')=='0px'
    requests=[];public.page.on('request',lambda request:requests.append(request.url) if request.method=='POST' else None)
    public.page.evaluate("setupShortUrl.value='forbidden';KSMTest.app.ksmSaveShortUrl(setupShortUrl)")
    assert not requests
    public.close();a.close();owner.close()


def legacy_type(browser,base,problems):
    a=KsmApp.open_device(browser,base,'Legacy type',problems,tournament_name='Legacy type')
    a.create_tournament();a.wait_idle()
    a.page.evaluate("const payload=KSMTest.app.tournamentPayload();payload.setup.tType='Team';KSMTest.app.applyTournamentPayload(payload,false)")
    assert a.page.locator('#tType').count()==0
    assert a.page.evaluate("!Object.hasOwn(KSMTest.app.getSetupSnapshot(),'tType')")
    assert a.page.evaluate("!Object.hasOwn(KSMTest.app.KSM_MERGE_LABELS,'tType')")
    a.close()


def add_division(browser,base,problems):
    a=KsmApp.open_device(browser,base,'Add division',problems,tournament_name='Add division')
    a.create_tournament();a.wait_idle();a.nav('setup')
    page=a.page;button=page.get_by_test_id('custom-division-add');field=page.get_by_test_id('custom-division-name')
    assert button.inner_text()=='Add division' and button.is_disabled()
    field.fill('   ');assert button.is_disabled()
    page.clock.install();page.clock.pause_at(datetime.now(timezone.utc)+timedelta(seconds=1))
    field.fill('Review division');assert button.is_enabled();button.click()
    page.clock.run_for(100)
    row=page.get_by_test_id('setup-division-row').filter(has=page.get_by_test_id('setup-division-name').filter(has_text='Review division'))
    assert row.count()==1
    assert 'setup-division-added' in row.get_attribute('class')
    assert field.input_value()=='' and button.is_disabled()
    assert 'Added division: Review division' in a.toast()
    box=row.bounding_box();assert 0<=box['y']<page.viewport_size['height']
    assert row.evaluate('el=>getComputedStyle(el).animationDuration')=='2s'
    row.dispatch_event('animationend')
    assert 'setup-division-added' not in (row.get_attribute('class') or '')
    page.clock.resume();a.close()


def setup_layout(browser,base,problems):
    a=KsmApp.open_device(browser,base,'Setup layout',problems,tournament_name='Setup layout')
    a.create_tournament();a.wait_idle();a.nav('setup')
    page=a.page
    assert page.locator('.setup-actions-jump').count()==0
    assert page.locator('#setup-tournament-actions').evaluate("el=>!!(document.querySelector('[data-testid=setup-match-timer]').compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)")
    details=page.locator('#setup-tournament-actions details')
    assert not details.evaluate('el=>el.open')
    assert page.get_by_test_id('setup-tournament-access').is_visible()
    assert page.get_by_test_id('setup-copy-id').is_visible()
    for action in ['download-file','download-recovery','load-recovery','export-brackets','export-results','cloud-diagnostics']:
        button=details.get_by_test_id('setup-'+action)
        assert button.count()==1 and not button.is_visible()
    details.locator('summary').click()
    for heading in ['Backup','Export','Cloud Diagnostics']:
        assert details.get_by_role('heading',name=heading,exact=True).is_visible()
    if os.environ.get('KSM_ACTION_SCREENSHOTS'):
        page.screenshot(path='/tmp/ksm82-setup-advanced.png',full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path='/tmp/ksm82-setup-phone.png',full_page=True)
        page.set_viewport_size({'width':1280,'height':900})
    page.evaluate("KSMTest.app.ksmSaveStatusMode='error';KSMTest.app.renderPersistentSaveStatus()")
    assert page.get_by_test_id('save-status').evaluate("el=>{const probe=document.createElement('span');probe.style.color='var(--ksm-gold)';el.append(probe);const same=getComputedStyle(el).color===getComputedStyle(probe).color;probe.remove();return same}")
    a.page.evaluate("KSMTest.app.writeOutbox(KSMTest.app.tournamentPayload(),'server copy label')")
    a.go_to_library()
    row=page.get_by_test_id('home-tournament').filter(has=page.get_by_test_id('home-tournament-name').filter(has_text='Setup layout'))
    row.locator('summary').click()
    assert 'server copy' in row.get_by_test_id('library-export-file').inner_text()
    a.page.evaluate('KSMTest.app.clearOutbox()');a.close()


def main():
    problems=[]
    cases=[draft_new,draft_open,return_view,socket_return,short_url,legacy_type,add_division,setup_layout]
    selected=os.environ.get('KSM_REVIEW_CASE')
    with local_worker() as base,sync_playwright() as p:
        browser=launch_chromium(p)
        for case in cases:
            if selected and case.__name__!=selected:continue
            print('Running '+case.__name__,flush=True);case(browser,base,problems)
        assert not problems,problems
        browser.close()
    print('PASS PR #82 review regressions')


if __name__=='__main__':main()
