"""Registration and export controls (roadmap M.12), offline, through the UI and test IDs.

Setup and Registration are filled in like a director would (most other tests skip them with
KSMTest.configure), then:
  * Export CSV downloads the registered players (quoted, commas and quotes escaped);
  * Clear Registration, Clear Teams and Clear Exhibitions ask first: Cancel keeps the entries,
    OK clears them (F8 fixed);
  * exhibitions: the tab appears when enabled in Setup, + Add / + 3 Matches add rows, names,
    status and remove work, and generation creates a match for each complete, non-no-show row;
  * Regenerate Single Division: every division with its status (Ready, Matches Started,
    Not Generated; only Ready can be chosen), the confirmation, and a regenerated division
    next to an unchanged one;
  * Export -> Tournament Brackets / Results & Awards and Preview Full Packet draw their print
    sheets (division sheets with pools and players, results with the same placements as the
    Results screen, including a finished pool-only round robin: F9 fixed);
  * placeholder buttons (Import CSV, Paste from Excel, Referee Assignments, Tournament Archive)
    still only show their "will be added" message (implement or remove: planning meeting).
No page error or unexpected dialog may occur.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

MAIN, SECOND, THIRD, EMPTY = 'Reg Division', 'Second Division', 'Champ Division', 'Empty Division'
PLAYERS = [('Aoki Ren', 'Aiea', '1'), ('Baba "Sho"', 'Waipahu, West', ''), ('Chiba Kai', 'Maui', '2'), ('Doi Mei', 'Hilo', '')]
SECOND_PLAYERS = [('Eto Yui', 'Kona'), ('Fuji Aya', 'Kauai'), ('Goto Ken', 'Manoa'), ('Hara Rio', 'Palolo')]
THIRD_PLAYERS = [(f'Champ {i}', f'Dojo {i}') for i in range(1, 7)]  # two pools + championship bracket


def play_to_end(app, court, division):
    """Score every match of `division` on `court` (White wins by Men) and return its placements."""
    app.open_court(court)
    app.switch_division(division)
    for _ in range(60):
        m = app.current_match()
        if not m or m['division'] != division:
            break
        app.score_point('W', 'M')
        app.next_match()
    screen = app.court_screen()
    assert screen['complete'] and screen['placements'], f'{division} did not finish: {screen}'
    return [(place.lower(), name) for place, name in screen['placements']]  # the court upper-cases places by CSS


REGISTERED = len(PLAYERS) + len(SECOND_PLAYERS) + len(THIRD_PLAYERS) + 1  # + the no-show


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        app = KsmApp.local(page, 'Director', problems=problems)
        # Offline harness: the local staff session has no cloud tournament, so each autosave asks
        # for a new Staff password to create one; leave it blank (the save stays local).
        app.answers['Create Staff password'] = ''
        count = lambda testid: page.locator(sel(testid)).count()
        texts = lambda testid: [t.strip() for t in page.locator(sel(testid)).all_inner_texts()]

        # --- Setup and registration through the UI ---------------------------------------------
        app.setup_divisions([(MAIN, 'Round Robin', 'A'), (SECOND, 'Single Elimination', 'B'), (THIRD, 'Round Robin', 'A'), (EMPTY, 'Round Robin', 'A')])
        app.setup_team_event('3-Person Team', 'Single Elimination', 'B')
        page.select_option(sel('exhibition-enabled'), label='Enabled')
        for name, dojo, seed in PLAYERS:
            app.register(name, dojo, MAIN, seed=seed)
        for name, dojo in SECOND_PLAYERS:
            app.register(name, dojo, SECOND)
        for name, dojo in THIRD_PLAYERS:
            app.register(name, dojo, THIRD)
        app.register('No Show Nao', 'Hilo', MAIN, status='NoShow')

        # --- Export CSV ---------------------------------------------------------------------------
        name, path = app.download('reg-export-csv')
        lines = Path(path).read_text(encoding='utf-8').split('\n')
        expected = ['"Name","Dojo","Division","Seed","Status"'] + \
            [f'"{n.replace(chr(34), 2 * chr(34))}","{d}","{MAIN}","{s}","Checked"' for n, d, s in PLAYERS] + \
            [f'"{n}","{d}","{SECOND}","","Checked"' for n, d in SECOND_PLAYERS] + \
            [f'"{n}","{d}","{THIRD}","","Checked"' for n, d in THIRD_PLAYERS] + [f'"No Show Nao","Hilo","{MAIN}","","NoShow"']
        assert name == 'ksm-registration.csv' and lines == expected, f'{name}:\n' + '\n'.join(lines)

        # --- Placeholder buttons (meeting decision: implement or remove) ------------------------
        placeholders = [('reg-import-csv', None, 'CSV import will be added in the production build.'),
                        ('reg-paste-excel', None, 'Paste rows directly into the table from Excel.'),
                        ('nav-export-referees', 'nav-export', 'Referee assignment export will be added with the Referee Assignment module.'),
                        ('nav-export-archive', 'nav-export', 'Tournament Archive export will be added with the archive module.')]
        for testid, menu, message in placeholders:
            app.expect_dialog(message, accept=True)
            if menu:
                app.click(menu)
            elif not page.is_visible(sel(testid)):
                app.nav('registration')
            app.seen_dialogs.clear()
            app.click(testid)
            assert app.wait_for_dialogs() == [message], (testid, app.seen_dialogs)
        assert count('reg-row') == REGISTERED, 'a placeholder changed the registration'

        # --- Teams ---------------------------------------------------------------------------------
        for code in 'ABCD':
            app.register_team(f'Team {code}', {'senpo': f'{code}1', 'chuken': f'{code}2', 'taisho': f'{code}3'})
        assert count('team-card') == 4

        # --- Exhibitions -------------------------------------------------------------------------
        app.nav('registration')
        app.click('reg-tab-exhibition')
        app.click('exhibition-add')
        app.click('exhibition-add-3')
        assert count('exhibition-row') == 4, count('exhibition-row')
        rows = page.locator(sel('exhibition-row'))
        for i, (white, red) in enumerate([('Sensei Ono', 'Sensei Ida'), ('Guest Kim', 'Guest Lee'), ('Solo Only', '')]):
            for side, person in (('white', white), ('red', red)):
                if person:
                    rows.nth(i).locator(sel(f'exhibition-{side}')).fill(person)
                    rows.nth(i).locator(sel(f'exhibition-{side}')).press('Tab')
        rows.nth(0).locator(sel('exhibition-status')).click()
        assert rows.nth(0).locator(sel('exhibition-status')).inner_text().strip() == '● Checked In'
        rows.nth(3).locator(sel('exhibition-remove')).click()
        assert count('exhibition-row') == 3

        # --- Generate, then play the main division to the end ------------------------------------
        app.generate()
        app.wait_generated()
        structure = app.structure()
        exhibition = [(m['white'], m['red']) for m in structure['Exhibition Matches']['matches']]
        assert exhibition == [('Sensei Ono', 'Sensei Ida'), ('Guest Kim', 'Guest Lee')], exhibition
        assert sorted(sum((pl['players'] for pl in structure[MAIN]['pools']), [])) == sorted(n for n, _, _ in PLAYERS), structure[MAIN]['pools']
        assert EMPTY not in structure and 'Team Tournament' in structure, list(structure)
        placements = {MAIN: play_to_end(app, 'A', MAIN)}

        # --- Regenerate Single Division -------------------------------------------------------------
        before = app.structure()
        app.nav('registration')
        app.click('regenerate-division-button')
        page.wait_for_selector(f'{sel("regenerate-modal")}:not(.hidden)')
        options = page.locator(sel('regenerate-option'))
        status = {options.nth(i).locator(sel('regenerate-option-name')).inner_text().strip():
                  (options.nth(i).locator(sel('regenerate-option-status')).inner_text().strip(),
                   options.nth(i).locator(sel('regenerate-option-radio')).is_enabled())
                  for i in range(options.count())}
        assert status[MAIN] == ('Matches Started', False) and status[SECOND] == ('Ready', True) and \
            status[EMPTY] == ('Not Generated', False) and status['Exhibition Matches'] == ('Ready', True), status
        page.locator(sel('regenerate-option'), has=page.locator(sel('regenerate-option-name'), has_text=SECOND)) \
            .locator(sel('regenerate-option-radio')).check()
        app.click('regenerate-continue')
        assert page.inner_text(sel('regenerate-modal-title')).strip() == f'Regenerate {SECOND}?'
        app.click('regenerate-confirm')
        assert page.inner_text(sel('regenerate-modal-title')).strip() == 'Division Regenerated', page.inner_text(sel('regenerate-modal'))
        assert f'{SECOND} successfully regenerated.' in page.inner_text(sel('regenerate-modal'))
        app.click('regenerate-modal-close')
        after = app.structure()
        assert after[MAIN] == before[MAIN], 'regenerating one division changed another'
        assert sorted({x for m in after[SECOND]['matches'] for x in (m['white'], m['red']) if x in {n for n, _ in SECOND_PLAYERS}}) == \
            sorted(n for n, _ in SECOND_PLAYERS), after[SECOND]['matches']
        placements[SECOND] = play_to_end(app, 'B', SECOND)
        placements[THIRD] = play_to_end(app, 'A', THIRD)
        results_screen = app.placements()
        for div, rows in placements.items():
            assert [(pl.lower(), n) for pl, n in results_screen[div]][:len(rows)] == rows, f'Results screen for {div}: {results_screen[div]} (court showed {rows})'

        # --- Exports and print -------------------------------------------------------------------------
        app.click('nav-export')
        app.click('nav-export-brackets')
        sheets = page.inner_text(sel('print-body')).lower()  # print headings are upper-cased by CSS
        for needle in (f'{MAIN} • Round Robin • Court A', f'{SECOND} • Single Elimination • Court B', 'Pool A', 'Aoki Ren', 'Eto Yui', 'Team A', 'Sensei Ono'):
            assert needle.lower() in sheets, f'Tournament Brackets lack {needle!r}:\n{sheets[:1500]}'
        app.click('nav-export')
        app.click('nav-export-results')
        results = page.inner_text(sel('print-body')).lower()
        assert 'division results' in results and 'no awards entered.' in results, results[:1500]
        assert placements.get(MAIN), f'{MAIN} should have placements on the Results screen: {placements}'
        # MAIN is a pool-only round robin (4 players, roadmap 0.2): it used to print "Results pending" (F9).
        for div in (THIRD, SECOND, MAIN):
            printed = f'{div}\n' + '\n'.join(f'{place}\n{person}' for place, person in placements[div])
            assert printed.lower() in results, f'Results & Awards lack the {div} placements {placements[div]}:\n{results[:1500]}'
        assert f'team tournament\nresults pending' in results  # still being played
        assert f'{MAIN}\nresults pending'.lower() not in results, 'F9: the finished round robin prints "Results pending"'
        app.click('print-full-packet')
        packet = page.inner_text(sel('print-body')).lower()
        assert all(x.lower() in packet for x in (f'{MAIN} • Round Robin', f'{SECOND} • Single Elimination', 'Division Results', placements[THIRD][0][1])), packet[:1500]
        assert packet.index('division sheet') < packet.index('division results'), 'packet order: division sheets, then results'

        # --- Clear Registration / Teams / Exhibitions ask first (F8) --------------------------------------
        app.nav('registration')
        app.click('reg-tab-individual')
        app.expect_dialog('Clear all individual competitors?', accept=False)
        app.seen_dialogs.clear()
        app.click('reg-clear')
        assert app.wait_for_dialogs() == ['Clear all individual competitors?'] and count('reg-row') == REGISTERED
        app.expect_dialog('Clear all individual competitors?', accept=True)
        app.seen_dialogs.clear()
        app.click('reg-clear')
        app.wait_for_dialogs()
        assert count('reg-row') == 0, 'Clear Registration kept players'
        # F8 (docs/ROADMAP.md, fixed): Clear Teams and Clear Exhibitions ask first, like Clear Registration.
        for tab, button, row, question in (('reg-tab-team', 'team-clear', 'team-card', 'Clear all teams?'),
                                           ('reg-tab-exhibition', 'exhibition-clear', 'exhibition-row', 'Clear all exhibition matches?')):
            app.click(tab)
            before = count(row)
            assert before > 0, f'{row}: nothing to clear'
            app.expect_dialog(question, accept=False)
            app.seen_dialogs.clear()
            app.click(button)
            assert app.wait_for_dialogs() == [question] and count(row) == before, f'{button}: Cancel changed the list'
            app.expect_dialog(question, accept=True)
            app.seen_dialogs.clear()
            app.click(button)
            app.wait_for_dialogs()
            app.wait_for(lambda: count(row) == 0, message=f'{button} to clear the list')

        assert not problems, '\n'.join(problems)
        print('PASS registration: CSV export, placeholders, teams, exhibitions, regenerate dialog, '
              'brackets/results/full packet print, clear buttons ask first (F8)')
        browser.close()


if __name__ == '__main__':
    main()
