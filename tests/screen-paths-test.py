"""Every app tab replaces its path; reload, access guards, history and offline routes."""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker


def main():
    problems=[]
    with local_worker() as base, sync_playwright() as p:
        browser=launch_chromium(p)
        owner=KsmApp.open_device(browser,base,'Owner',problems,tournament_name='Screen Paths 2027')
        tid=owner.create_tournament();owner.wait_idle()
        assert owner.address()=='/screen-paths-2027/setup'
        owner.configure([{'name':'Open','format':'Round Robin','court':'A','entrants':[
            {'name':name,'dojo':'Dojo','seed':'','status':'Checked'} for name in ['Aoki','Baba','Chiba']]}])
        owner.save_now();owner.wait_idle()
        for prefix in ['/screen-paths-2027','/t/'+tid]:
            app=KsmApp.open_device(browser,base,'Tabs',problems)
            app.wait_for_library()
            app.click('home-tournament-name')
            app.wait_for(lambda: app.tournament_id()==tid and app.visible_view()==['director'],message='Library opens tournament')
            if prefix.startswith('/t/'):
                app.page.evaluate('(path)=>ksmReplaceUrl(path)',prefix)
            length=app.page.evaluate('history.length')
            for screen,view,private in [('setup','setup',True),('registration','registration',True),('pools','registration',True),('overview','director',False),('results','results',False),('live','public',False),('court/b','score',False)]:
                app.staff_login()
                if screen=='pools':
                    app.nav('registration');app.click('reg-tab-pools')
                elif screen=='court/b':app.open_court('B')
                else:app.nav({'overview':'overview','live':'live-scores'}.get(screen,screen))
                app.wait_for(lambda: app.address()==prefix+'/'+screen,message=screen+' path')
                assert app.visible_view()==[view]
                assert app.page.evaluate('history.length')==length,screen
                app.blur();app.wait_idle()
                app.reload()
                expected_view='director' if private else 'public' if screen.startswith('court/') else view
                expected_address=prefix+'/overview' if private else prefix+'/'+screen
                assert app.visible_view()==[expected_view],(screen,app.visible_view())
                assert app.address()==expected_address,(screen,app.address())
                assert app.tournament_id()==tid
                assert app.page.evaluate('history.length')==length
            # All those tab changes replaced one entry: Back returns directly to the Library.
            app.page.evaluate('history.back()')
            app.wait_for(lambda: app.visible_view()==['home'] and app.address()=='/',message='Back skips tab history')
            app.page.evaluate('history.forward()')
            # A browser evaluation pumps Playwright events; page.url alone is cached.
            app.wait_for(lambda: app.tournament_id()==tid,message='Forward restores tournament '+prefix)
            assert app.address()==prefix+'/court/b',(prefix,app.address(),app.page.evaluate('({history:history.length,loading:ksmRouteLoading,role:ksmSessionRole})'),problems)
            app.close()
        offline=KsmApp.open_device(browser,base,'Offline',problems,'/screen-paths-2027/overview',service_workers='allow')
        offline.page.evaluate('navigator.serviceWorker.ready.then(()=>true)')
        offline.wait_for(lambda: offline.page.evaluate("caches.match('/index.html').then(Boolean)"),message='cached app shell')
        offline.page.context.set_offline(True)
        offline.reload()
        assert offline.address()=='/screen-paths-2027/overview' and offline.visible_view()==['director']
        assert offline.tournament_id()==tid
        offline.close()
        assert not problems,problems
        browser.close()
    print('PASS screen paths: all tabs, ID/slug, reload guards, replace history, offline overview')


if __name__=='__main__':main()
