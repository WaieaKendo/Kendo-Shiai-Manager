"""Issue #43: staff editing, aliases, generated links and offline reloads."""
import json
import urllib.request
import urllib.parse
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

SHORT_NAME = 'Tournament short name (lowercase letters, digits and dashes)'


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        staff = KsmApp.open_device(browser, base, 'Staff', problems, tournament_name='LOKT 2027')
        tid = staff.create_tournament();staff.wait_idle()
        assert staff.address() == '/lokt-2027/setup'
        staff.configure([{'name':'Open', 'format':'Round Robin', 'court':'A', 'entrants':[
            {'name':name,'dojo':'Dojo','seed':'','status':'Checked'} for name in ['Aoki','Baba','Chiba']]}])
        staff.save_now();staff.wait_idle()
        page = staff.page
        for suffix, view in [('', 'director'),('/live','public'),('/court/a','public'),('/court/b','public'),('/tv/a','tv'),('/tv/b','tv')]:
            device = KsmApp.open_device(browser,base,'Link',problems,'/lokt-2027'+suffix)
            device.wait_generated()
            assert device.tournament_id() == tid and device.visible_view() == [view]
            assert 'LOKT 2027' in device.page.locator(sel('tournament-chip')).inner_text()
            device.close()
        for court in ['a','b']:
            with urllib.request.urlopen(base+'/lokt-2027/overlay/'+court) as response:
                assert b'overlay-root' in response.read()
        page.evaluate('openTournamentAccess()')
        page.wait_for_selector(sel('edit-tournament-slug'))
        staff.answers[SHORT_NAME] = 'lokt-renamed-2027'
        with page.expect_response(lambda response: response.url.endswith('/slug') and response.request.method == 'POST') as renamed:
            staff.click('edit-tournament-slug')
        assert renamed.value.status == 200, (renamed.value.text(), problems)
        staff.wait_for(lambda: staff.address() == '/lokt-renamed-2027/pools',message=f'rename address: {renamed.value.text()}, problems {problems}')
        staff.wait_for(lambda: '/lokt-renamed-2027' in page.locator(sel('access-link')).inner_text(),message='renamed generated link')
        assert '/lokt-renamed-2027' in urllib.parse.unquote(page.locator(sel('access-qr')).get_attribute('src'))
        staff.answers[SHORT_NAME] = 'api'
        staff.expect_dialog('Use lowercase letters')
        staff.click('edit-tournament-slug')
        staff.wait_for_dialogs()
        assert staff.address() == '/lokt-renamed-2027/pools'
        alias = KsmApp.open_device(browser,base,'Alias',problems,'/lokt-2027/court/b?red=left')
        alias.wait_generated()
        assert alias.address() == '/lokt-renamed-2027/court/b?red=left'
        assert alias.tournament_id() == tid
        alias.close()
        # Warm a real service worker and both the slug mapping and tournament record.
        offline = KsmApp.open_device(browser,base,'Offline',problems,'/lokt-renamed-2027/court/a',service_workers='allow')
        offline.wait_generated()
        op = offline.page
        op.evaluate('navigator.serviceWorker.ready.then(() => true)')
        offline.wait_for(lambda: op.evaluate("caches.match('/index.html').then(Boolean)"),message='offline shell cached')
        op.context.set_offline(True)
        offline.reload()
        offline.wait_for(lambda: offline.tournament_id() == tid and offline.visible_view() == ['public'],message='offline slug reload')
        assert offline.address() == '/lokt-renamed-2027/court/a'
        assert 'LOKT 2027' in op.locator(sel('tournament-chip')).inner_text()
        op.context.set_offline(False)
        assert not problems, problems
        browser.close()
    print('PASS friendly links: all routes, staff rename, alias, QR and offline reload')


if __name__ == '__main__':
    main()
