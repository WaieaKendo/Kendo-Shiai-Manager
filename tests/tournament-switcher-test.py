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
        assert a.address() == '/switch-a-2026'
        a.wait_for(lambda: 'Switch A' in page.locator(sel('tournament-chip')).inner_text(), message='A chip')
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
        assert not problems, problems
        browser.close()
    print('PASS tournament switcher: isolation, chip, history, reload, unsaved work')


if __name__ == '__main__':
    main()
