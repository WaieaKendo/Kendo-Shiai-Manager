"""Issue #70: moved actions, Library isolation, contextual retries and Staff Login.

Real Worker plus routed failures and a paused clock; no timing sleeps. F36 remains #81 and is
pinned independently by network-two-tabs-test.py.
"""
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel, app_path
from ksm_browser import install_test_api, launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points


ISOLATION = """() => ({
  state: JSON.stringify(KSMTest.app.state), setup: JSON.stringify(KSMTest.app.getSetupSnapshot()),
  session: JSON.stringify(KSMTest.app.cloudSession), outbox: localStorage.getItem(KSMTest.app.KSM_CLOUD_OUTBOX_KEY),
  autosave: localStorage.getItem(KSMTest.app.KSM_SAVE_KEY), origin: localStorage.getItem(KSMTest.app.KSM_AUTOSAVE_CLOUD_ID),
  socket: KSMTest.app.ksmCloudSocket === window.__exportSocket, socketState: KSMTest.app.ksmCloudSocket?.readyState,
  mutation: KSMTest.app.ksmLocalMutationVersion, confirmed: KSMTest.app.ksmConfirmedMutationVersion,
})"""


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        aid, a, follower = two_courts(browser, base, problems, 'Library A')
        b = KsmApp.open_device(browser, base, 'Library B', problems, tournament_name='Library B')
        bid = b.create_tournament()
        b.configure([{'name': 'B Division', 'format': 'Round Robin', 'court': 'B',
                      'entrants': [{'name': f'B player {i}', 'dojo': 'B Dojo', 'status': 'Checked'} for i in range(4)]}])
        b.page.evaluate("KSMTest.app.state.awards=[{award:'Fighting spirit',name:'B winner',dojo:'B Dojo'}]")
        b.save_now(); b.wait_idle()
        brecord = fetch_record(base, bid)
        page = a.page
        page.evaluate('(record) => KSMTest.app.rememberTournament(record)', brecord)
        a.nav('setup');a.wait_idle()
        assert page.locator('#setup-tournament-actions').is_visible()
        assert not page.locator('#setup-tournament-actions details').evaluate('el => el.open')
        for testid in ['setup-tournament-access', 'setup-copy-id']:
            assert page.locator(sel(testid)).is_visible(), testid
        for testid in ['setup-download-file','setup-download-recovery','setup-load-recovery','setup-export-brackets','setup-export-results']:
            assert not page.locator(sel(testid)).is_visible(), testid
        assert page.locator(sel('setup-short-url')).is_visible()
        assert page.locator('[href="#setup-tournament-actions"]').count()==0
        page.context.grant_permissions(['clipboard-read','clipboard-write'],origin=base)
        a.click('setup-copy-id')
        a.wait_for(lambda: page.evaluate('navigator.clipboard.readText()')==aid,message='Setup Copy Tournament ID')
        page.locator('#setup-tournament-actions summary').click()
        a.click('setup-cloud-diagnostics')
        assert page.locator(sel('cloud-modal-title')).inner_text()=='Developer Tools'
        a.click('cloud-modal-close')
        page.locator('#setup-tournament-actions summary').click()
        assert page.locator(sel('nav-save-load')).count() == page.locator(sel('nav-export')).count() == 0
        if os.environ.get('KSM_ACTION_SCREENSHOTS'):
            page.screenshot(path='/tmp/ksm70-setup.png',full_page=True)
        assert page.locator(sel('header-save-now')).count() == 0
        assert page.locator(sel('save-status')).evaluate("el => !el.closest('[role=button],button,a')")
        # Setup exports use the same renderer as Library exports.
        a.click('setup-export-brackets')
        assert 'A 1' in page.locator(sel('print-body')).inner_text()
        a.nav('setup'); a.click('setup-export-results')
        assert 'division results' in page.locator(sel('print-body')).inner_text().lower()
        a.open_court('A'); a.wait_idle()
        page.clock.install();page.clock.pause_at(datetime.now(timezone.utc)+timedelta(seconds=1))
        shown = a.current_match()
        failures = []
        def refuse(route):
            if route.request.method == 'PUT':
                failures.append(route.request.post_data_json)
                route.fulfill(status=500, content_type='application/json', body='{"error":"Injected failure"}')
            else:
                route.continue_()
        page.route(KsmApp._SAVE_URL, refuse)
        a.score_point('W','M')
        # Debounce is ordinary work, with no manual-save action.
        assert page.locator(sel('header-save-now')).count() == 0
        page.clock.fast_forward(2100);page.clock.fast_forward(1300)
        a.wait_for(lambda: a.outbox() and failures, message='A queued after refusal')
        page.wait_for_function('() => !KSMTest.app.ksmCloudSaveInFlight && !KSMTest.app.ksmCloudSavePending')
        assert page.locator(sel('header-save-now')).is_enabled()
        assert page.locator(sel('save-status')).inner_text() == 'Not saved · Changes waiting'
        page.evaluate("KSMTest.app.updateSaveStatus('Saved file')")
        assert page.locator(sel('save-status')).inner_text().startswith('Not saved · Changes waiting')
        page.set_viewport_size({'width':390,'height':844})
        assert page.locator(sel('header-save-now')).is_visible()
        assert 'Not saved' in page.locator(sel('header-save-now')).inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if os.environ.get('KSM_ACTION_SCREENSHOTS'):
            page.screenshot(path='/tmp/ksm70-warning-phone.png')
        page.set_viewport_size({'width':1280,'height':900})
        print('queued A; browsing Library',flush=True)
        a.go_to_library()
        # B actions need B's staff password; authorizing it does not replace A's session.
        row = page.locator(sel('home-tournament')).filter(has=page.locator(sel('home-tournament-name')).filter(has_text='Library B'))
        assert row.locator(sel('library-export')).count() == 0
        row.locator(sel('library-staff-actions')).click()
        row.locator('summary').click()
        if os.environ.get('KSM_ACTION_SCREENSHOTS'):
            page.screenshot(path='/tmp/ksm70-library.png',full_page=True)
        page.evaluate('window.__exportSocket=KSMTest.app.ksmCloudSocket')
        before = page.evaluate(ISOLATION)
        requests = []
        page.on('request', lambda req: requests.append((req.method,req.url)))
        for kind in ['brackets','results','file']:
            with page.expect_download() as dl:
                row.locator(sel('library-export-'+kind)).click()
            content = Path(dl.value.path()).read_text()
            if kind == 'file':
                pack = json.loads(content)
                assert pack['tournamentId'] == bid and pack['state'] == brecord['payload']['state']
            else:
                assert 'Library B' in content and '<script' not in content
                assert ('B player' if kind == 'brackets' else 'B winner') in content
            after=page.evaluate(ISOLATION)
            assert after == before, (kind, {key:(before[key],after[key]) for key in before if before[key]!=after[key]})
        assert [method for method,url in requests if url.endswith('/api/tournaments/'+bid)] == ['GET']*3
        assert a.tournament_id() == aid
        print('all B exports isolated',flush=True)
        page.unroute(KsmApp._SAVE_URL, refuse)
        page.clock.resume()
        a.wait_idle()
        assert_points(fetch_record(base,aid)['payload'],'A',shown,['M'],[])
        # Return restores A without a reload or socket replacement.
        a.click('library-return'); a.open_court('A'); a.wait_idle()
        assert page.evaluate('KSMTest.app.ksmCloudSocket === window.__exportSocket')
        assert page.locator(sel('header-save-now')).count() == 0
        print('A queue reached server',flush=True)
        # A failure without an outbox also offers an immediate retry.
        page.evaluate("KSMTest.app.ksmSaveStatusMode='error';KSMTest.app.renderPersistentSaveStatus()")
        assert page.locator(sel('save-status')).inner_text()=='Save needs attention'
        assert page.locator(sel('header-save-now')).is_enabled()
        rev=a.revision();a.click('header-save-now')
        a.wait_for(lambda:a.revision()>rev,message='failed status retried')
        a.wait_idle()
        # navigator.onLine=false is only a hint: Save now must issue a real request anyway.
        page.evaluate("Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});KSMTest.app.writeOutbox(KSMTest.app.tournamentPayload(),'offline hint fixture')")
        rev = a.revision()
        a.click('header-save-now')
        a.wait_for(lambda: a.revision()>rev and not a.outbox(), message='manual retry despite offline hint')
        assert a.toast() == '✓ Tournament saved'
        page.evaluate("delete navigator.onLine")
        # Hold an ordinary save in flight: no Save now during Saving….
        held=[]
        def hold(route):
            if route.request.method=='PUT': held.append(route)
            else: route.continue_()
        page.route(KsmApp._SAVE_URL,hold)
        page.evaluate("void KSMTest.app.saveTournamentToCloudWithReason('held ordinary save')")
        a.wait_for(lambda: page.evaluate('0') == 0 and bool(held), message='held save')
        assert page.locator(sel('save-status')).inner_text()=='Saving…'
        assert page.locator(sel('header-save-now')).count()==0
        held.pop().continue_();page.unroute(KsmApp._SAVE_URL,hold);a.wait_idle()
        print('offline hint and saving state passed',flush=True)
        # 401 during retry sends the user directly to Staff Login, preserving queued staff work.
        def expire(route):
            if route.request.method=='PUT': route.fulfill(status=401,content_type='application/json',body='{"error":"Expired staff session"}')
            else: route.continue_()
        page.route(KsmApp._SAVE_URL,expire)
        page.evaluate("KSMTest.app.writeOutbox(KSMTest.app.tournamentPayload(),'expired fixture')")
        prompts=[]
        page.on('dialog',lambda dialog: prompts.append(dialog.message))
        a.click('header-save-now')
        a.wait_for(lambda: page.evaluate('0') == 0 and 'Enter Staff password' in prompts, message='401 leads to Staff Login')
        assert 'Unable to save' not in a.toast()
        page.unroute(KsmApp._SAVE_URL,expire)
        a.wait_for(lambda: a.staff_session(), message='staff reauthenticated')
        a.save_now();a.wait_idle()
        print('401 login passed',flush=True)
        page.evaluate('window.__deleteSocket=KSMTest.app.ksmCloudSocket')
        # Nonactive deletion reuses typed confirmation without changing A's session/queue/socket.
        a.go_to_library()
        row = page.locator(sel('home-tournament')).filter(has=page.locator(sel('home-tournament-name')).filter(has_text='Library B'))
        row.locator(sel('library-delete')).click()
        assert not a.delete_enabled()
        a.type_delete_name('Library B');assert a.delete_enabled()
        a.click('delete-confirm')
        a.wait_for(lambda: row.count()==0, message='B removed from Library')
        assert a.tournament_id()==aid and page.evaluate('KSMTest.app.ksmCloudSocket === window.__deleteSocket')
        # An unauthenticated Library offers Staff actions, never exports or Delete.
        public=KsmApp.open_device(browser,base,'Public Library',problems)
        public.wait_for_library()
        public.page.wait_for_selector(sel('home-tournament'))
        assert public.page.locator(sel('library-export')).count()==0
        assert public.page.locator(sel('library-delete')).count()==0
        unauthorized=[]
        public.page.on('request',lambda request: unauthorized.append(request.url))
        public.page.evaluate("async id => { await KSMTest.app.ksmExportLibraryTournament(id,'file'); await KSMTest.app.ksmDeleteLibraryTournament(id); }",aid)
        assert not unauthorized, 'unauthenticated staff action sent a request'
        # A remembered ID without a loaded/authenticated context must not offer an empty return.
        remembered=page.evaluate('({key:KSMTest.app.KSM_CLOUD_SESSION_KEY,value:localStorage.getItem(KSMTest.app.KSM_CLOUD_SESSION_KEY)})')
        seed="localStorage.setItem('ksm.local.reset.v3_17_3','done');localStorage.setItem("+json.dumps(remembered['key'])+","+json.dumps(remembered['value'])+");"
        root=KsmApp.open_device(browser,base,'Remembered Library',problems,before_load=lambda tab:tab.add_init_script(seed))
        root.wait_for_library()
        assert root.page.locator(sel('library-return')).count()==0
        imported=page.evaluate('KSMTest.app.tournamentFilePayload()')
        root.page.evaluate("file=>KSMTest.app.confirmTournamentFileLoad(file,'A.ksm')",imported)
        assert root.page.locator(sel('file-load-replace')).count()==0
        assert root.page.locator(sel('file-load-new')).is_visible()
        root.click('file-load-cancel')
        untouched=root.page.evaluate('JSON.stringify(KSMTest.app.state)')
        root.page.evaluate("file=>{KSMTest.app.ksmPendingTournamentFile={payload:file,fileName:'A.ksm'};KSMTest.app.replaceTournamentFromFile()}",imported)
        assert root.page.evaluate('JSON.stringify(KSMTest.app.state)')==untouched
        assert root.page.evaluate('localStorage.getItem(KSMTest.app.KSM_SAVE_KEY)') is None
        root.page.evaluate('KSMTest.app.ksmPendingTournamentFile=null')
        remembered_row=root.page.locator(sel('home-tournament')).filter(has=root.page.locator(sel('home-tournament-name')).filter(has_text='Library A'))
        remembered_row.locator(sel('library-staff-actions')).click()
        remembered_row.locator(sel('library-delete')).click()
        root.page.wait_for_selector(sel('delete-dialog'))
        root.click('delete-cancel')
        # No-cache startup failure cannot save an empty screen, even through a direct call.
        failed=browser.new_context(service_workers='block')
        failedpage=failed.new_page();install_test_api(failedpage);writes=[]
        def fail_load(route):
            if route.request.method=='GET':route.fulfill(status=503,content_type='application/json',body='{}')
            else:writes.append(route.request.method);route.abort()
        failedpage.route('**/api/tournaments/**',fail_load)
        failedpage.goto(base+app_path(aid))
        failedpage.wait_for_selector('#startupLoadFailure')
        failedpage.evaluate('KSMTest.app.saveNow()')
        assert failedpage.locator(sel('header-save-now')).count()==0 and not writes
        assert failedpage.evaluate('localStorage.getItem(KSMTest.app.KSM_SAVE_KEY)') is None
        assert not problems, problems
        browser.close()
    print('PASS #70: Setup actions, authenticated Library export/delete, queued A isolation, healthy/saving/queued/offline/401/no-cache header')


if __name__=='__main__':
    main()
