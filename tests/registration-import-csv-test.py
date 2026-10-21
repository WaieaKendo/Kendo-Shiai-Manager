"""Registration -> Import CSV reads a .csv file (was a placeholder alert).

The first row names the columns in any order and case: Name (or First Name + Last Name), Dojo (or
Club, Academy), Division, Seed, Status; other columns are ignored. Rows are added like pasted rows:
an unknown division or status is not added and is listed. A player already registered in that
division is skipped, so Export CSV's file imports again without duplicates. A file without a Name
column changes nothing and says which columns are expected.
"""
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

WOMEN = 'Women’s Open'


def main():
    problems = []
    tmp = Path(tempfile.mkdtemp())
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.nav('registration')
        app.click('reg-tab-individual')
        divisions = app.payload()['state']['divisions']

        def load(name, text):
            path = tmp / name
            path.write_text(text, encoding='utf-8')
            app.seen_dialogs.clear()
            page.set_input_files(sel('reg-import-file'), str(path))
            return app.wait_for_dialogs(1)[0]

        app.expect_dialog('Imported', accept=True)
        app.expect_dialog('bad.csv', accept=True)
        # Our own layout: columns out of order, extra columns ignored, a BOM, quotes and CRLF.
        notice = load('players.csv', '﻿Status,Last Name,First Name,Academy,Division,Rank,Seed\r\n'
                                     f'Checked In,Aoki,Ann,Aiea,"{WOMEN}",2 Dan,1\r\n'
                                     ',Baba,Bo,"Maui, Upcountry",,1 Kyu,\r\n'
                                     'No Show,Chun,Cy,Hilo,Unknown Division,,\r\n'
                                     'Late,Doi,Dee,Kona,,,\r\n')
        assert notice.startswith('Imported 2 players from players.csv.'), notice
        assert 'Cy Chun' in notice and 'Unknown Division' in notice and 'Dee Doi' in notice and 'Late' in notice, notice
        state = app.payload()['state']
        assert state['divisions'] == divisions, state['divisions']
        got = [(c['name'], c['dojo'], c['division'], c['seed'], c['status']) for c in state['competitors']]
        assert got == [('Ann Aoki', 'Aiea', WOMEN, '1', 'Checked'),
                       ('Bo Baba', 'Maui, Upcountry', divisions[0], '', 'Registered')], got
        assert page.locator(sel('reg-row')).count() == 2

        # Export CSV's file imports again: everyone is already registered.
        _, exported = app.download('reg-export-csv')
        notice = load('again.csv', Path(exported).read_text(encoding='utf-8'))
        assert notice.startswith('Imported 0 players') and 'Already registered, skipped: 2.' in notice, notice
        assert len(app.payload()['state']['competitors']) == 2

        notice = load('bad.csv', 'Dojo,Division\nAiea,Open\n')
        assert 'no Name column' in notice, notice
        assert len(app.payload()['state']['competitors']) == 2
        assert not problems, problems
        browser.close()
    print('PASS Import CSV reads named columns in any order, refuses unknown divisions and statuses, skips players already registered')


if __name__ == '__main__':
    main()
