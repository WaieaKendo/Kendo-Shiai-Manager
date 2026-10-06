"""User text is shown as text, never run as markup (F19), on Team Registration (team cards) and
Exhibition (exhibition rows).

The legacy team cards and exhibition rows printed the status into their class attribute unescaped
(`class="status ${c.status}"`), so a status with markup broke out of the attribute and ran code
on every staff device that opened the tab (statuses arrive from other devices, a file, a paste);
F19 escaped it. Since M.13 Registration part 2 React draws both (app/react/registration/
RegistrationTeams.tsx), which escapes every text and attribute; this test pins it. The players
table is drawn by React since M.13 part 1 (golden-registration-test.py, reg-status-markup).

Offline, through the UI and test IDs: names with markup are typed into a team card (team name,
members) and an exhibition row (both players); then a live update (test API) brings teams and
exhibitions whose statuses carry markup, one that breaks out of the attribute into an inline
handler, and one that only adds a class word. Every tab is opened and every status chip clicked:
no injected element exists, nothing ran, each field and chip shows the text literally and each
chip's class attribute holds the stored text.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

IMG = '"><img src=x onerror="window.__pwned=1">'
NAMES = {
    'team': f'Team {IMG}',
    'senpo': "x');window.__pwned=2;('",
    'chuken': '</div><script>window.__pwned=3</script>',
    'taisho': f'Taisho {IMG}',
    'white': f'White {IMG}',
    'red': '<b onmouseover="window.__pwned=4">Red</b> & "co"',
}
# Statuses that arrive with a live update: markup, a handler injected through the attribute, a
# value that only adds class words.
STATUSES = [f'x{IMG}', 'x" onclick="window.__pwned=5" data-x="', 'Checked extra-class']
INJECTED = '#teamReg img, #teamReg script, #teamReg b, #exhibitionReg img, #exhibitionReg b, #exhibitionReg [onmouseover], [data-x]'


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        page.evaluate('() => { window.__pwned = 0; }')
        page.select_option(sel('exhibition-enabled'), label='Enabled')

        # Names with markup typed into a team card and an exhibition row.
        app.register_team(NAMES['team'], {k: NAMES[k] for k in ('senpo', 'chuken', 'taisho')})
        app.click('reg-tab-exhibition')
        app.click('exhibition-add')
        row = page.locator(sel('exhibition-row')).last
        for side in ('white', 'red'):
            row.locator(sel(f'exhibition-{side}')).fill(NAMES[side])
            row.locator(sel(f'exhibition-{side}')).press('Tab')

        # Statuses with markup from another device.
        payload = app.payload()
        state = payload['state']
        team = dict(state['teams'][0])
        state['teams'] = [{**team, 'status': s} for s in STATUSES]
        ex = dict(state['exhibitions'][0])
        state['exhibitions'] = [{**ex, 'status': s} for s in STATUSES]
        app.apply_live_update(payload)

        for tab, card, chip in (('reg-tab-team', 'team-card', 'team-status'), ('reg-tab-exhibition', 'exhibition-row', 'exhibition-status')):
            app.click(tab)
            page.wait_for_timeout(100)
            chips = page.locator(sel(chip))
            assert chips.count() == len(STATUSES), f'{chip}: {chips.count()} chips, expected {len(STATUSES)} (markup broke the card apart)'
            assert page.locator(sel(card)).count() == len(STATUSES), f'{card}: {page.locator(sel(card)).count()}'
            for i, status in enumerate(STATUSES):
                assert chips.nth(i).get_attribute('class') == f'status {status}', \
                    f'{chip} {i}: class {chips.nth(i).get_attribute("class")!r}, expected the stored status as text'
                assert chips.nth(i).inner_text() == '○ Registered', f'{chip} {i}: {chips.nth(i).inner_text()!r}'
            injected = page.locator(INJECTED).count()
            assert injected == 0, f'{tab}: {injected} element(s) injected by user text (F19)'
            assert page.evaluate('window.__pwned') == 0, f'{tab}: user text ran code (F19): {page.evaluate("window.__pwned")}'
            # The handler of the first chip (not one injected by the second) runs: clicks cycle it.
            chips.nth(1).click()
            assert page.evaluate('window.__pwned') == 0, f'{chip}: an injected handler ran (F19)'

        # The names show literally (values of the fields as typed, and in state).
        app.click('reg-tab-team')
        card = page.locator(sel('team-card')).first
        assert card.locator(sel('team-name')).input_value() == NAMES['team']
        for k in ('senpo', 'chuken', 'taisho'):
            assert card.locator(sel(f'team-member-{k}')).input_value() == NAMES[k], k
        app.click('reg-tab-exhibition')
        row = page.locator(sel('exhibition-row')).first
        for side in ('white', 'red'):
            assert row.locator(sel(f'exhibition-{side}')).input_value() == NAMES[side], side
        page.hover(sel('exhibition-red'))
        assert page.evaluate('window.__pwned') == 0, 'user text ran code (F19)'
        assert page.locator(INJECTED).count() == 0
        assert not problems, problems
        browser.close()
    print('PASS html escaping: team cards and exhibition rows show user text and statuses as text (F19)')


if __name__ == '__main__':
    main()
