"""#85 preflight regressions: failed first short-name save and draft-link isolation."""
import os
import re
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker


def install_mutation(page):
    page.add_init_script("sessionStorage.setItem('ksm.pending-slug','previous-short-name')")
    mutant=os.environ.get('KSM_TEST_MUTATION')
    if not mutant:
        return
    def alter(route):
        response=route.fetch()
        code=response.text()
        if mutant=='slug-success':
            before="if(!saved||!cloudSession.tournamentId||cloudSession.slug!==slug)"
            assert before in code
            code=code.replace(before,'if(false)')
        elif mutant=='draft-before-guards':
            before='function ksmReadLocalDraft(){'
            assert before in code
            code=code.replace(before,before+"try{const draft=JSON.parse(localStorage.getItem(KSM_DETACHED_DRAFT_KEY)||'null');if(draft?.state)return draft}catch(_){}")
        else:
            raise AssertionError('Unknown mutation: '+mutant)
        route.fulfill(response=response,body=code)
    page.route(re.compile(r'/assets/app-[^/]+\.js(?:\?|$)'),alter)


def main():
    problems=[]
    with local_worker() as base, sync_playwright() as p:
        browser=launch_chromium(p)
        a=KsmApp.open_device(browser,base,'Local draft',problems,before_load=install_mutation)
        page=a.page
        page.clock.install()
        page.clock.pause_at(page.evaluate('Date.now()'))
        # Keep the local draft uncreated; creation is refused by the real request boundary.
        page.evaluate("""()=>{KSMTest.app.cloudSession.tournamentId='';KSMTest.app.cloudSession.slug=null;KSMTest.app.show('setup');KSMTest.seedDetachedDraft(KSMTest.payload());}""")
        assert page.evaluate('KSMTest.shortName().pending')=='previous-short-name'
        assert page.evaluate('!!KSMTest.localDraft()')
        for path in ['/?tournament=other','/?spectator=other','/?view=tv','/?view=overlay','/?role=spectator','/other/tv/a','/other/overlay/a','/other/live']:
            page.evaluate('path=>history.replaceState(null,"",path)',path)
            assert page.evaluate('KSMTest.localDraft()') is None,path
        page.evaluate('history.replaceState(null,"","/")')
        assert page.evaluate('!!KSMTest.localDraft()')
        # New tournaments normally ask for passwords as part of create. This failure leaves
        # the old pending choice intact and must not claim that the requested name was saved.
        page.route('**/api/tournaments',lambda route:route.fulfill(status=409,content_type='application/json',body='{"error":"That name is taken","code":"slug-taken"}') if route.request.method=='POST' else route.continue_())
        page.evaluate("KSMTest.app.setSessionRole('staff');KSMTest.app.installRoleBanner('staff');KSMTest.app.renderAll()")
        result=page.evaluate("KSMTest.app.ksmRenameTournamentSlug('taken-name').then(()=>({ok:true}),e=>({error:e.message}))")
        assert result.get('error') and 'taken' in result['error'].lower(),result
        assert page.evaluate('KSMTest.shortName()')=={'slug':'','pending':'previous-short-name'}
        page.locator(sel('setup-short-url')).fill('another-taken-name')
        page.locator(sel('setup-short-url')).press('Enter')
        page.wait_for_function("document.getElementById('setupShortUrlStatus').textContent.toLowerCase().includes('taken')")
        assert page.locator(sel('setup-short-url')).get_attribute('aria-invalid')=='true'
        assert page.evaluate('KSMTest.shortName()')=={'slug':'','pending':'previous-short-name'}
        assert page.locator('#setupShortUrlStatus').inner_text()!='Saved'
        assert not problems,problems
        browser.close()
    print('PASS preflight: short-name creation failure preserves slug; detached draft hidden on all display links')

if __name__=='__main__':
    main()
