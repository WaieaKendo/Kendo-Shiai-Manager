"""Tournament identity, compact headers, theme tokens, and the Library About version."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium


def main():
    with sync_playwright() as p:
        browser=launch_chromium(p)
        app=KsmApp.local(browser.new_page())
        page=app.page
        page.evaluate("window.headerMutations=0;const headerNote=noteLocalMutation;noteLocalMutation=(...args)=>{headerMutations++;return headerNote(...args)}")
        page.evaluate("cloudSession.tournamentId='header-fixture';tName.value='ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';syncSetupHeader()")
        for width,height in [(375,812),(812,375),(1280,900)]:
            page.evaluate("setSessionRole('spectator');installRoleBanner('spectator')")
            page.set_viewport_size({'width':width,'height':height})
            page.evaluate('document.fonts.ready')
            chip=page.locator(sel('tournament-chip'))
            chip.wait_for(state='visible')
            facts=page.evaluate("""() => {
              const q=s=>document.querySelector(s), box=s=>q(s).getBoundingClientRect().toJSON();
              const name=q('.tournament-chip-name');
              return {logo:box('.nav-brand'),chip:box('.tournament-home-link'),staff:box('#staffAuthButton'),
                brand:getComputedStyle(q('.nav-brand-copy')).display,
                color:getComputedStyle(q('.tournament-home-link')).color,
                theme:getComputedStyle(q('body')).getPropertyValue('--ksm-ivory').trim(),
                ellipsis:getComputedStyle(name).textOverflow,nowrap:getComputedStyle(name).whiteSpace,
                overflow:document.documentElement.scrollWidth>innerWidth};
            }""")
            assert facts['brand']=='none' and facts['ellipsis']=='ellipsis' and facts['nowrap']=='nowrap',facts
            assert facts['chip']['height']>=44 and facts['staff']['height']>=44,facts
            assert facts['logo']['right']<=facts['chip']['left'] and facts['chip']['right']<=facts['staff']['left'],facts
            assert facts['staff']['right']<=width and not facts['overflow'],facts
            assert page.locator('header .version-badge').count()==0
            assert chip.get_attribute('href').endswith('/t/header-fixture/overview')
            assert page.locator('details[data-testid="tournament-chip"]').count()==0
            if width==1280:
                chip.hover()
                assert chip.evaluate("el=>getComputedStyle(el).textDecorationLine")=='none'
                highlight=chip.evaluate("el=>getComputedStyle(el).backgroundColor")
                assert highlight!='rgba(0, 0, 0, 0)'
                page.mouse.move(0,0)
                chip.focus()
                page.keyboard.press('Shift+Tab');page.keyboard.press('Tab')
                assert chip.evaluate("el=>el.matches(':focus-visible')")
                assert chip.evaluate("el=>getComputedStyle(el).backgroundColor")==highlight
                assert chip.evaluate("el=>getComputedStyle(el).textDecorationLine")=='none'
                assert chip.evaluate("el=>parseFloat(getComputedStyle(el).outlineWidth)")>0

            toggle=page.locator(sel('nav-toggle'))
            for role,expected in [('spectator',['Overview','Live Scores','Courts','Results']),('staff',['Overview','Live Scores','Courts','TV','Results','Export','Save / Load','Registration','Setup'])]:
                page.evaluate("role=>{setSessionRole(role);installRoleBanner(role)}",role)
                if width<=900:
                    assert toggle.is_visible() and not page.locator('nav.minimal-nav').is_visible()
                    mutations=page.evaluate('headerMutations')
                    toggle.click()
                    assert page.evaluate('headerMutations')==mutations
                    assert toggle.get_attribute('aria-expanded')=='true'
                else:assert not toggle.is_visible()
                labels=page.locator('nav.minimal-nav > button:visible, nav.minimal-nav > .nav-menu:visible > button').all_text_contents()
                assert [label.replace('▾','').strip() for label in labels]==expected,labels
                if width<=900:
                    app.click('nav-save-load' if role=='staff' else 'nav-courts')
                    dropdown=page.locator('#saveLoadMenu' if role=='staff' else '#courtsMenu')
                    bounds=dropdown.bounding_box()
                    # The submenu nests inside the menu panel; the panel (which scrolls) stays on screen.
                    panel=page.locator('nav.minimal-nav').bounding_box()
                    assert panel['y']>=0 and panel['y']+panel['height']<=height,(width,height,panel)
                    assert bounds['x']>=panel['x'] and bounds['x']+bounds['width']<=panel['x']+panel['width']+1,(bounds,panel)
                    page.keyboard.press('Escape')
                    assert toggle.get_attribute('aria-expanded')=='false' and toggle.evaluate('el=>el===document.activeElement')
                    toggle.click()
                    page.locator('main').dispatch_event('click')
                    assert toggle.get_attribute('aria-expanded')=='false'
                    toggle.click()
                    app.click('nav-live-scores')
                    assert toggle.get_attribute('aria-expanded')=='false'
                    app.click('nav-courts');app.click('nav-court-a')
                    assert app.visible_view()==['score'] and toggle.get_attribute('aria-expanded')=='false'
            chip.click()
            app.wait_for(lambda: app.visible_view()==['director'],message='name links to Overview')
        page.set_viewport_size({'width':375,'height':812})
        page.evaluate("setSessionRole('spectator');installRoleBanner('spectator');navigateTo('public')")
        app.click('nav-toggle')
        page.locator('.nav-brand').click()
        app.wait_for(lambda: app.visible_view()==['director'],message='spectator logo opens Overview')
        assert page.locator(sel('nav-toggle')).get_attribute('aria-expanded')=='false'
        assert page.locator('.nav-brand').get_attribute('title')=='Overview'
        # This isolated header fixture has no server; discard its simulated pending saves.
        page.evaluate("clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;clearOutbox();ksmCloudSaveInFlight=false;ksmCloudSavePending=false;ksmConfirmedMutationVersion=ksmLocalMutationVersion;setSessionRole('staff');installRoleBanner('staff')")
        page.locator('.nav-brand').click()
        app.wait_for(lambda: app.visible_view()==['home'],message='staff logo opens selector')
        assert page.locator('.home-brand').is_visible()
        assert 'Kendo Shiai Manager' in page.locator('.home-brand').inner_text()
        version=json.loads((Path(__file__).resolve().parents[1]/'package.json').read_text())['version']
        assert page.locator(sel('library-about')).inner_text()=='About: Kendo Shiai Manager v'+version
        assert page.locator(sel('library-about')).is_visible()
        browser.close()
    print('PASS tournament home link, role nav order, hamburger, selector logo and version')


if __name__=='__main__':
    main()
