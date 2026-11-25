"""Every division name can be edited before the tournament is generated (issue #25, product owner).

Setup's divisions table has Rename on every row, preset or custom: the name becomes a text field
(Save or Enter, Cancel or Escape). A rename changes the name everywhere it is used: its place in the
running order, its format and court, every competitor of the division and the Registration
dropdowns; it is saved and synced like every Setup edit and kept on reload. Names are trimmed,
non-empty and unique (case-insensitive); a refused rename shows why in the row and changes
nothing. Once the tournament is generated, Rename is refused with "Divisions can't be renamed after
the draw; rename-anytime comes with stable IDs." A rename racing another device's registration edit
(a save conflict, either way round) is replayed whole: no competitor is left on the old name and no
division exists twice (the merge rules are pinned in division-rename-merge-test.mjs).

Against a throwaway `wrangler dev`: a director and a registration desk (a second staff device).
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

YONENBU = 'Yonenbu (11 years and under)'
SHONENBU = 'Shonenbu (12–14 years old)'
AFTER_DRAW = "Divisions can't be renamed after the draw; rename-anytime comes with stable IDs."


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Rename Cup')
        tid = director.create_tournament()
        director.register('K 1', 'Dojo 1', YONENBU)
        director.register('K 2', 'Dojo 2', YONENBU)
        director.blur()
        director.wait_idle()
        desk = KsmApp.open_device(browser, base, 'Desk', problems, app_path(tid))
        desk.staff_login()
        desk.wait_revision(fetch_record(base, tid)['revision'])
        devices = [director, desk]
        for app in devices:
            app.watch_conflicts()
        server = lambda: fetch_record(base, tid)['payload']['state']

        def settle():
            for app in devices:
                app.blur()
                app.wait_idle()
            rev = fetch_record(base, tid)['revision']
            for app in devices:
                app.wait_revision(rev)

        def division_of(state, name):
            return next(c['division'] for c in state['competitors'] if c['name'] == name)

        # 1. A preset renamed from the keyboard: same place in the running order, format and court kept.
        director.nav('setup')
        order = director.setup_division_names()
        assert order[0] == YONENBU, order
        row = director.setup_division_row(YONENBU)
        fmt, court = row.locator(sel('setup-division-format')).input_value(), row.locator(sel('setup-division-court')).input_value()
        row.locator(sel('setup-division-rename')).focus()
        director.page.keyboard.press('Enter')
        field = director.page.locator(sel('setup-division-rename-input'))
        director.wait_for(lambda: field.count() == 1, message='the rename field')
        assert director.page.evaluate("() => document.activeElement?.dataset.testid") == 'setup-division-rename-input', 'the field has the focus'
        assert field.input_value() == YONENBU, 'the field starts with the current name'
        director.page.keyboard.press('ControlOrMeta+A')
        director.page.keyboard.type('  Under 12  ')
        director.page.keyboard.press('Enter')
        director.wait_for(lambda: director.setup_division_names()[0] == 'Under 12', message='the rename in the table')
        assert director.setup_division_names() == ['Under 12'] + order[1:], f'only the name changed, in place: {director.setup_division_names()}'
        focused = director.page.evaluate("() => [document.activeElement?.dataset.testid, document.activeElement?.closest('[data-testid=\"setup-division-row\"]')?.querySelector('[data-testid=\"setup-division-name\"]')?.textContent]")
        assert focused == ['setup-division-rename', 'Under 12'], f'the focus went back to the renamed row\'s Rename: {focused}'
        row = director.setup_division_row('Under 12')
        assert row.locator(sel('setup-division-format')).input_value() == fmt and row.locator(sel('setup-division-court')).input_value() == court, \
            'the renamed preset keeps its format and court'
        assert row.locator(sel('setup-division-remove')).count() == 1, 'a renamed preset can still be removed before its draw (×, #112)'
        assert YONENBU not in director.setup_division_names(), 'the old preset name is not listed again'
        assert director.registration_division('K 1') [0] == 'Under 12', 'Registration shows the new name for the competitor'
        options = director.registration_division('K 2')[1]
        assert 'Under 12' in options and YONENBU not in options, f'the Registration dropdown offers the new name: {options}'

        # 2. Refused renames: a duplicate (any case), an empty name. Nothing changes; the field stays open.
        director.nav('setup')
        before = director.payload()['state']
        error = director.rename_division('Under 12', ' shonenbu (12–14 YEARS OLD) ')
        assert error == f'There is already a division named "{SHONENBU}".', error
        assert director.page.locator(sel('setup-division-rename-input')).count() == 1, 'the field stays open after a refusal'
        director.cancel_rename()
        error = director.rename_division('Under 12', '   ')
        assert error == "A division name can't be empty.", error
        director.page.keyboard.press('Escape')
        director.wait_for(lambda: not field.count(), message='Escape to close the field')
        after = director.payload()['state']
        for key in ('divisions', 'divisionTypes', 'divisionCourts', 'competitors', 'divisionRenames'):
            assert after[key] == before[key], f'a refused rename changed {key}'

        # 3. A custom division renamed with Save.
        director.page.fill(sel('custom-division-name'), 'Masters X')
        director.click('custom-division-add')
        assert director.rename_division('Masters X', 'Seniors') == ''
        assert 'Seniors' in director.setup_division_names() and 'Masters X' not in director.setup_division_names()
        assert director.setup_division_row('Seniors').locator(sel('setup-division-remove')).count() == 1, 'still a custom division'

        # 4. Saved, on the other device, in Registration there.
        settle()
        st = server()
        assert st['divisions'][0] == 'Under 12' and 'Seniors' in st['divisions'] and YONENBU not in st['divisions'], st['divisions']
        assert division_of(st, 'K 1') == 'Under 12' and division_of(st, 'K 2') == 'Under 12'
        assert st['divisionTypes']['Under 12'] == fmt and st['divisionCourts']['Under 12'] == court and YONENBU not in st['divisionTypes']
        desk.nav('setup')
        desk.wait_for(lambda: desk.setup_division_names()[0] == 'Under 12', message='the rename on the desk')
        assert desk.registration_division('K 1')[0] == 'Under 12', 'the desk\'s Registration shows the new name'

        def race(second, second_edit, first, first_edit):
            """`second`'s save is held while `first` edits and saves; then it meets the conflict."""
            settle()
            seen = second.conflicts()
            second.hold_next_save()
            second_edit()
            second.blur()
            second.wait_held_save()
            first_edit()
            first.blur()
            first.wait_idle()
            second.release_save()
            second.wait_for(lambda: second.conflicts() > seen, message='the held save to meet the conflict')
            settle()
            return server()

        # 5. The director renames while the desk edits a competitor of that division and adds one to it.
        def desk_edits():
            desk.set_competitor_field('K 1', 'dojo', 'Desk Dojo')
            desk.register('K 3', 'Dojo 3', 'Under 12')

        def director_renames():
            director.nav('setup')
            assert director.rename_division('Under 12', 'Kids') == ''
        st = race(desk, desk_edits, director, director_renames)
        assert [c['name'] for c in st['competitors'] if c['division'] == 'Under 12'] == [], f'5: a competitor was left on the old name: {st["competitors"]}'
        assert sorted(c['name'] for c in st['competitors'] if c['division'] == 'Kids') == ['K 1', 'K 2', 'K 3'], f'5: {st["competitors"]}'
        assert next(c for c in st['competitors'] if c['name'] == 'K 1')['dojo'] == 'Desk Dojo', "5: the desk's edit was lost"
        assert 'Kids' in st['divisions'] and 'Under 12' not in st['divisions'], st['divisions']
        assert len({d.lower() for d in st['divisions']}) == len(st['divisions']), f'5: a division exists twice: {st["divisions"]}'
        for app in devices:
            app.wait_for(lambda: app.registration_division('K 3')[0] == 'Kids', message='5: K 3 on Kids on every device')

        # 6. The other way round: the director edits a competitor and adds one while the desk renames.
        def director_edits():
            director.set_competitor_field('K 2', 'dojo', 'Director Dojo')
            director.register('K 4', 'Dojo 4', 'Kids')

        def desk_renames():
            desk.nav('setup')
            assert desk.rename_division('Kids', 'Children') == ''
        st = race(director, director_edits, desk, desk_renames)
        assert [c['name'] for c in st['competitors'] if c['division'] == 'Kids'] == [], f'6: a competitor was left on the old name: {st["competitors"]}'
        assert sorted(c['name'] for c in st['competitors'] if c['division'] == 'Children') == ['K 1', 'K 2', 'K 3', 'K 4'], f'6: {st["competitors"]}'
        assert next(c for c in st['competitors'] if c['name'] == 'K 2')['dojo'] == 'Director Dojo', "6: the director's edit was lost"
        assert 'Children' in st['divisions'] and 'Kids' not in st['divisions'], st['divisions']
        assert len({d.lower() for d in st['divisions']}) == len(st['divisions']), f'6: a division exists twice: {st["divisions"]}'
        for app in devices:
            app.wait_for(lambda: app.registration_division('K 4')[0] == 'Children', message='6: K 4 on Children on every device')

        # 7. Kept on reload.
        director.goto(app_path(tid))
        assert director.page.evaluate('KSMTest.role()') == 'staff'
        director.nav('setup')
        director.wait_for(lambda: director.setup_division_names()[0] == 'Children', message='the rename after a reload')
        assert 'Seniors' in director.setup_division_names() and YONENBU not in director.setup_division_names(), director.setup_division_names()
        assert director.registration_division('K 1')[0] == 'Children'

        # 8. After the draw: refused with the message, nothing changes.
        director.generate()
        director.wait_generated()
        director.nav('setup')
        assert director.rename_division('Children', 'Juniors') == AFTER_DRAW
        assert director.page.locator(sel('setup-division-rename-input')).count() == 0, 'no field opens after the draw'
        assert director.setup_division_names()[0] == 'Children'
        settle()
        assert server()['divisions'][0] == 'Children'
        assert not problems, '\n'.join(problems)
        browser.close()
    print(f'PASS every division can be renamed before the draw (preset and custom, keyboard and Save): in place, '
          f'format and court kept, competitors and Registration follow, synced, kept on reload; duplicate/empty refused; '
          f'refused after the draw; replayed whole through a save conflict either way ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
