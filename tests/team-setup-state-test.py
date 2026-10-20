"""Team setup says why it can't change (owner report: Add team division "did nothing").

The controls were disabled correctly but looked editable. Teams Disabled: the whole team setup is
disabled and a note says how to enable it. After generation: Add/Remove, match format and court are
disabled, names and awards stay editable, and a note says so. Enabled before generation: Add works.
"""
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_app import KsmApp, sel

STATE = """() => ({add: document.querySelector('[data-testid=team-division-add]').disabled,
  rows: document.querySelectorAll('[data-testid=team-division-row]').length,
  disabled: [...document.querySelectorAll('[data-testid=team-division-row] :is(input,select,button)')].map(e => e.dataset.testid + '=' + e.disabled),
  note: document.querySelector('[data-testid=team-division-note]')?.textContent || '',
  faded: document.getElementById('teamDivisionSetup').dataset.teamsOff === '1'})"""


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        a = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Team Setup State')
        a.create_tournament(); a.wait_idle()
        a.nav('setup'); a.page.wait_for_selector(sel('team-division-add'))
        s = a.page.evaluate(STATE)
        assert not s['add'] and not s['note'] and not s['faded'], s
        a.click('team-division-add')
        a.wait_for(lambda: a.page.evaluate(STATE)['rows'] == 2, message='a second team division')
        a.page.select_option(sel('team-enabled'), 'Disabled')
        s = a.page.evaluate(STATE)
        assert s['add'] and s['faded'] and all(x.endswith('=true') for x in s['disabled']), s
        assert s['note'].startswith('Teams are disabled'), s
        a.page.select_option(sel('team-enabled'), 'Enabled')
        s = a.page.evaluate(STATE)
        assert not s['add'] and not s['note'] and not s['faded'], s
        # Generated, the first team division drawn: it is fixed (names, awards and order stay editable); the
        # Add button stays on (a new team division can be added and drawn on its own).
        a.page.evaluate('''() => { const app = KSMTest.app, id = KSMTest.teamDivisions()[0].id;
          app.state.generated = true; app.state.allMatches = {...app.state.allMatches, [id]: [{type: 'teamPlayoff'}]}; app.ksmRenderTeamDivisions(); }''')
        s = a.page.evaluate(STATE)
        assert not s['add'] and s['note'].startswith('Drawn team divisions are fixed'), s
        s['disabled'] = s['disabled'][:len(s['disabled']) // 2]  # the drawn (first) row
        fields = [x for x in s['disabled'] if not x.startswith(('team-division-up', 'team-division-down'))]
        editable = {x.split('=')[0] for x in fields if x.endswith('=false')}
        assert editable == {'team-division-name', 'team-division-awardMode'}, s  # order (up/down) also stays editable
        # A locked control says why (tooltip).
        tip = a.page.locator(sel('team-division-teamFormat')).first.get_attribute('title')
        assert tip.startswith('Fixed:') and 'is drawn' in tip, tip
        assert not problems, problems
        browser.close()
    print('PASS team setup: Add works before generation; disabled teams and a drawn team division are shown and explained')


if __name__ == '__main__':
    main()
