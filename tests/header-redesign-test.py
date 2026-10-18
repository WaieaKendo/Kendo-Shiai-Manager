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
        page.evaluate("cloudSession.tournamentId='header-fixture';tName.value='ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';syncSetupHeader()")
        for width,height in [(375,812),(812,375),(1280,900)]:
            page.evaluate("setSessionRole('spectator');installRoleBanner('spectator')")
            page.set_viewport_size({'width':width,'height':height})
            page.evaluate('document.fonts.ready')
            chip=page.locator(sel('tournament-chip')+' summary')
            chip.wait_for(state='visible')
            facts=page.evaluate("""() => {
              const q=s=>document.querySelector(s), box=s=>q(s).getBoundingClientRect().toJSON();
              const name=q('.tournament-chip-name');
              return {logo:box('.nav-brand'),chip:box('.tournament-switcher summary'),staff:box('#staffAuthButton'),
                brand:getComputedStyle(q('.nav-brand-copy')).display,
                color:getComputedStyle(q('.tournament-switcher')).color,
                theme:getComputedStyle(q('body')).getPropertyValue('--ksm-ivory').trim(),
                ellipsis:getComputedStyle(name).textOverflow,nowrap:getComputedStyle(name).whiteSpace,
                overflow:document.documentElement.scrollWidth>innerWidth};
            }""")
            assert facts['brand']=='none' and facts['ellipsis']=='ellipsis' and facts['nowrap']=='nowrap',facts
            assert facts['chip']['height']>=44 and facts['staff']['height']>=44,facts
            assert facts['logo']['right']<=facts['chip']['left'] and facts['chip']['right']<=facts['staff']['left'],facts
            assert facts['staff']['right']<=width and not facts['overflow'],facts
            assert page.locator('header .version-badge').count()==0
            page.evaluate("setSessionRole('staff');installRoleBanner('staff')")
            chip.click()
            assert page.locator('.tournament-switcher-menu button').all_text_contents()==['Switch tournament','Edit short name','Library']
            chip.click()
        page.evaluate("setSessionRole('spectator');installRoleBanner('spectator')")
        page.locator(sel('tournament-chip')+' summary').click()
        page.locator(sel('chip-edit-slug')).wait_for(state='detached')
        assert page.locator('.tournament-switcher-menu button').all_text_contents()==['Switch tournament','Library']
        app.click('chip-library')
        app.wait_for(lambda: app.visible_view()==['home'],message='chip Library action')
        assert page.locator('.home-brand').is_visible()
        assert 'Kendo Shiai Manager' in page.locator('.home-brand').inner_text()
        version=json.loads((Path(__file__).resolve().parents[1]/'package.json').read_text())['version']
        assert page.locator(sel('library-about')).inner_text()=='About: Kendo Shiai Manager v'+version
        assert page.locator(sel('library-about')).is_visible()
        browser.close()
    print('PASS compact tournament header, menu roles, Library brand and About version')


if __name__=='__main__':
    main()
