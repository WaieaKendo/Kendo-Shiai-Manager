"""Issue #42: tournament boundaries, browser history, and unsaved work."""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        a = KsmApp.open_device(browser, base, 'Switcher', problems, tournament_name='Switch A')
        page = a.page
        aid = a.create_tournament()
        a.wait_idle()
        assert a.address() == '/switch-a-2026/setup'
        a.wait_for(lambda: 'Switch A' in page.locator(sel('tournament-chip')).inner_text(), message='A chip')
        page.locator(sel('setup-tournament-name')).fill('Switch A Renamed')
        a.wait_for(lambda: 'Switch A Renamed' in page.locator(sel('tournament-chip')).inner_text(), message='chip follows name editing')
        page.evaluate("state.divisions=['Only A'];state.competitors=[{name:'A only'}];pinCourtLocally('B');criticalAutoSave('A fixture')")
        a.wait_idle()
        page.evaluate("(id)=>localStorage.setItem('ksm:match-timer:'+JSON.stringify([id,'B','fixture']),JSON.stringify({runningSince:Date.now()}))",aid)
        page.locator(sel('tournament-chip')+' summary').click()
        a.click('switch-tournament')
        a.wait_for(lambda: a.visible_view() == ['home'], message='Library')
        assert a.address() == '/'
        assert page.evaluate("(id)=>!Object.keys(localStorage).some(key=>key.startsWith('ksm:match-timer:'+JSON.stringify([id]).slice(0,-1)))",aid)
        assert page.evaluate("!cloudSession.tournamentId && !readOutbox() && !v316StaffPassword() && !state.competitors.length && !state.divisions.includes('Only A') && !localCourtDivision('B')")
        a.answers['Tournament Name'] = 'Switch B'
        bid = a.create_tournament()
        a.wait_idle()
        assert bid != aid
        assert page.evaluate("!state.competitors.length && !state.divisions.includes('Only A') && cloudSession.court !== 'B'")
        for view in ['setup','registration','score','public','director','results','tv']:
            a.show_screen(view)
            a.wait_for(lambda: page.locator(sel('tournament-chip')).is_visible(), message=f'chip on {view}')
            assert 'Switch B' in page.locator(sel('tournament-chip')).inner_text()
        page.evaluate('showHomePage()')
        a.wait_for(lambda: a.visible_view() == ['home'], message='Library B')
        page.evaluate('(id)=>openTournamentFromHome(id)', aid)
        a.wait_for(lambda: a.tournament_id() == aid, message='A reopened')
        assert page.evaluate("!v316StaffPassword() && !readOutbox() && cloudSession.court !== 'B'")
        assert 'Switch A' in page.locator(sel('tournament-chip')).inner_text()
        page.go_back()
        a.wait_for(lambda: a.visible_view() == ['home'], message='Back to Library')
        page.go_forward()
        a.wait_for(lambda: a.tournament_id() == aid, message='Forward to A')
        a.reload()
        a.wait_for(lambda: a.tournament_id() == aid, message='reload A')
        a.staff_login()
        page.context.set_offline(True)
        page.evaluate("state.awards=[{name:'Unsaved award'}];criticalAutoSave('Offline award')")
        a.expect_dialog('This tournament has changes that could not be saved')
        page.evaluate('showHomePage()')
        a.wait_for_dialogs()
        assert page.evaluate("cloudSession.tournamentId && readOutbox() && state.awards[0].name === 'Unsaved award' && v316StaffPassword()")
        assert a.address() == '/switch-a-2026'
        blocked_count=len(a.seen_dialogs)
        page.evaluate('history.back()')
        a.wait_for_dialogs(blocked_count+1)
        a.wait_for(lambda: a.address()=='/switch-a-2026',message='saved tournament address restored after blocked Back')
        assert page.evaluate("readOutbox() && state.awards[0].name==='Unsaved award'")
        page.context.set_offline(False)
        a.save_now();a.wait_idle()
        page.evaluate('showHomePage()')
        a.wait_for(lambda: a.visible_view() == ['home'], message='saved exit')
        a.answers['Tournament Name'] = 'Deleted Cup'
        deleted = a.create_tournament();a.wait_idle()
        page.evaluate("state.divisions=['Deleted division'];criticalAutoSave('Deleted fixture')")
        a.wait_idle()
        a.delete_tournament('Deleted Cup')
        assert page.evaluate("!state.divisions.includes('Deleted division') && !state.competitors.length && !v316StaffPassword()")
        a.answers['Tournament Name'] = 'Fresh Cup'
        a.create_tournament();a.wait_idle()
        assert page.evaluate("!state.divisions.includes('Deleted division') && !state.divisions.includes('Only A')")
        # An imported/local draft can have neither mutation counters nor an outbox/session.
        draft = KsmApp.local(browser.new_page(), 'Local draft', problems=problems)
        dp = draft.page
        dp.evaluate("tName.value='Local only';state.competitors=[{name:'Local competitor'}];markLocalSave('Imported draft');sessionStorage.removeItem(KSM_V316_STAFF_SESSION)")
        raw = dp.evaluate('localStorage.getItem(KSM_SAVE_KEY)')
        assert dp.evaluate('!cloudSession.tournamentId && !readOutbox() && !localChangesPending() && !v316StaffPassword()')
        draft.expect_dialog('This tournament is only saved on this device')
        dp.evaluate('showHomePage()')
        draft.wait_for_dialogs()
        assert dp.evaluate('localStorage.getItem(KSM_SAVE_KEY)') == raw
        dp.locator(sel('tournament-chip')+' summary').click()
        draft.click('switch-tournament')
        draft.wait_for_dialogs(2)
        assert dp.evaluate('localStorage.getItem(KSM_SAVE_KEY)') == raw
        assert dp.evaluate("state.competitors[0].name==='Local competitor' && !document.body.classList.contains('ksm-home')")
        draft.close()
        # A failed create has no ID; Back must preserve its draft address, never /t/null.
        page.route('**/api/tournaments', lambda route: route.fulfill(status=503,content_type='application/json',body='{}') if route.request.method=='POST' else route.continue_())
        a.answers['Tournament Name']='Failed create'
        page.evaluate('createNewTournament()')
        a.wait_for(lambda: bool(a.outbox()), message='failed create queued')
        assert not a.tournament_id() and a.address()=='/'
        a.expect_dialog('This tournament has changes that could not be saved')
        count=len(a.seen_dialogs)
        history_count=page.evaluate('history.length')
        page.evaluate('history.back()')
        a.wait_for_dialogs(count+1)
        a.wait_for(lambda: a.address()=='/',message='failed-create address restored after blocked Back')
        assert page.evaluate('history.length')==history_count, 'blocked Back added a history entry for a tournament without an ID'
        assert a.address()=='/' and page.evaluate("readOutbox() && tName.value==='Failed create' && !document.body.classList.contains('ksm-home')")
        assert not problems, problems
        browser.close()
    print('PASS tournament switcher: isolation, chip, history, reload, unsaved work')


if __name__ == '__main__':
    main()
