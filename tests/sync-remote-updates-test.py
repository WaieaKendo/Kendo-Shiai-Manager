"""How devices take in updates from the cloud.

Director, a Court B scorekeeper and a spectator against a throwaway `wrangler dev`:
  * old or repeated revisions are ignored; a staff device ignores the echo of its
    own save, while a spectator sharing that client ID still applies it;
  * a staff device with the cursor in a field holds remote updates ("Live update
    waiting for editing to finish") and applies them when the field loses focus;
  * a saved tournament whose elimination winner was never advanced is repaired
    when it is loaded (live update and fresh link);
  * Setup edits that race another save are merged three-way (F4): a rename made while a
    court scores survives; unrelated fields changed on both sides both survive; when both
    change the same field the server's value is kept and a conflict notice is shown;
  * old local data from before v3.17.3 is cleared once, and only once.
"""
import copy
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, put_record, sel, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

AUTOSAVE_KEY = 'ksm.local.autosave.v3_1'   # stored-data format of older versions
RESET_MARKER = 'ksm.local.reset.v3_17_3'


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Updates Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 3)},
            {'name': 'Elim', 'format': 'Single Elimination', 'court': 'B', 'entrants': people('E', 4)},
        ])
        director.save_now()
        director.wait_idle()
        court = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'B'))
        court.wait_generated()
        court.staff_login()
        court.open_court('B')
        court.wait_idle()
        name_field = lambda app: app.page.input_value(sel('setup-tournament-name'))

        # --- Old and repeated revisions are ignored ------------------------------------------
        record = fetch_record(base, tid)
        court.wait_revision(record['revision'])
        for rev in (record['revision'] - 1, record['revision']):
            fake = copy.deepcopy(record)
            fake['revision'] = rev
            fake['payload']['setup']['tName'] = 'Stale Cup'
            assert court.receive(fake) is False, f'revision {rev} was applied'
        assert name_field(court) == 'Updates Cup' and court.revision() == record['revision']

        # --- A spectator applies a record carrying its own client ID ---------------------------
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        spectator.wait_generated()
        mine = copy.deepcopy(record)
        mine['revision'] = record['revision'] + 1
        mine['updatedBy'] = {'role': 'staff', 'clientId': spectator.client_id(), 'name': 'Staff tab'}
        mine['payload']['setup']['tName'] = 'Shared Browser Cup'
        assert spectator.receive(mine) is True, 'a spectator ignored an update carrying its own client ID'
        assert name_field(spectator) == 'Shared Browser Cup'
        spectator.close()

        # --- Remote updates wait while staff edit a field -----------------------------------------
        court.nav('registration')
        court.wait_idle()
        court.click('reg-filter')  # cursor in a field, nothing typed yet
        before = court.revision()
        director.open_court('A')
        director.score_point('W', 'M')
        director.wait_idle()
        court.wait_for(lambda: court.page.inner_text(sel('save-status')).strip() == 'Live update waiting for editing to finish',
                       message='the held-update status')
        assert court.revision() == before, 'the update was applied while the field had focus'
        court.page.click(sel('tournament-status'))  # leave the field
        court.wait_revision(director.revision())
        court.open_court('B')

        # --- A winner that was never advanced is repaired on load ------------------------------
        record = fetch_record(base, tid)
        payload = record['payload']
        semis = [m for m in payload['state']['allMatches']['Elim'] if m.get('position') == 'Semifinal']
        semi = semis[0]
        semi.update(done=True, wp=['M'], rp=[], wt=0, rt=0)  # saved by an old version: no advancement
        put_record(base, tid, payload, record['revision'])
        court.wait_revision(record['revision'] + 1)
        context_text = lambda app: app.page.inner_text(sel('court-context'))
        court.wait_for(lambda: semi['white'] in context_text(court).split('FINAL', 1)[-1],
                       message=f'{semi["white"]} to appear in the final after a live update')
        fresh = KsmApp.open_device(browser, base, 'Fresh spectator', problems, app_path(tid))
        fresh.wait_generated()
        fresh.open_court('B')
        assert semi['white'] in context_text(fresh).split('FINAL', 1)[-1], f'fresh load not repaired:\n{context_text(fresh)}'
        fresh.close()

        # --- F4 (fixed): a Setup edit racing a court save survives the conflict ----------------
        court.wait_idle()
        director.wait_revision(court.revision())
        director.nav('setup')
        director.watch_conflicts()
        director.hold_next_save()
        director.page.fill(sel('setup-tournament-name'), 'Renamed Cup')
        director.page.press(sel('setup-tournament-name'), 'Tab')
        director.wait_held_save()
        court.score_point('R', 'K')
        court.save_now()
        court.wait_idle()
        director.release_save()
        director.wait_idle()
        court.wait_idle()
        final = fetch_record(base, tid)
        assert director.conflicts() >= 1, 'the held director save did not conflict'
        assert any(m.get('rp') == ['K'] for m in final['payload']['state']['allMatches']['Elim']), 'the court point was lost'
        assert final['payload']['setup']['tName'] == 'Renamed Cup' and name_field(director) == 'Renamed Cup', \
            f'F4: the rename was lost in the conflict ({final["payload"]["setup"]["tName"]!r}, field {name_field(director)!r})'
        court.wait_for(lambda: name_field(court) == 'Renamed Cup', message='the rename to reach Court B')

        def race_director_edit(testid, value, server_edit):
            """Director edits a Setup field; before its save goes out another device saves `server_edit`."""
            director.wait_idle()
            director.wait_revision(fetch_record(base, tid)['revision'])
            director.watch_conflicts()
            director.hold_next_save()
            director.page.fill(sel(testid), value)
            director.page.press(sel(testid), 'Tab')
            director.wait_held_save()
            record = fetch_record(base, tid)
            server_edit(record['payload'])
            put_record(base, tid, record['payload'], record['revision'])
            director.release_save()
            director.wait_idle()
            assert director.conflicts() >= 1, 'the held Setup save did not conflict'
            return fetch_record(base, tid)['payload']

        # Unrelated fields on both sides: both survive.
        field = lambda testid: director.page.input_value(sel(testid))
        merged = race_director_edit('setup-host', 'Director Host', lambda pl: pl['setup'].update(tLocation='Other Hall'))
        assert (merged['setup']['tHost'], merged['setup']['tLocation']) == ('Director Host', 'Other Hall'), merged['setup']
        assert (field('setup-host'), field('setup-location')) == ('Director Host', 'Other Hall'), 'director fields not merged'
        assert merged['setup']['tName'] == 'Renamed Cup', merged['setup']

        # The same field on both sides: the server's value is kept and the director is told.
        merged = race_director_edit('setup-tournament-name', 'Director Cup', lambda pl: pl['setup'].update(tName='Desk Cup'))
        assert merged['setup']['tName'] == 'Desk Cup' and name_field(director) == 'Desk Cup', \
            f'both changed the name: the server copy should win ({merged["setup"]["tName"]!r}, field {name_field(director)!r})'
        notice = director.page.inner_text(sel('toast'))
        assert 'Tournament name' in notice and 'another device' in notice, f'no conflict notice: {notice!r}'
        assert director.page.is_visible(sel('toast')), 'the conflict notice is not shown'
        assert merged['setup']['tHost'] == 'Director Host' and merged['setup']['tLocation'] == 'Other Hall', merged['setup']

        # --- Own echo: a staff device ignores its own save coming back ---------------------------
        record = fetch_record(base, tid)
        court.wait_revision(record['revision'])
        echo = copy.deepcopy(record)
        echo['revision'] = record['revision'] + 1
        echo['updatedBy'] = {'role': 'staff', 'clientId': court.client_id(), 'name': 'Court B'}
        echo['payload']['setup']['tName'] = 'Echo Cup'
        assert court.receive(echo) is False, 'a staff device applied its own echo'
        assert name_field(court) != 'Echo Cup' and court.revision() == record['revision'] + 1

        # --- One-time reset of legacy local data --------------------------------------------------
        legacy = KsmApp.open_device(browser, base, 'Old tablet', problems)
        legacy.page.evaluate('([k, m]) => { localStorage.setItem(k, JSON.stringify({setup: {tName: "Old"}, state: {}})); localStorage.removeItem(m); }',
                             [AUTOSAVE_KEY, RESET_MARKER])
        legacy.reload()
        assert not legacy.has_autosave(), 'legacy local data survived the one-time reset'
        legacy.page.evaluate('k => localStorage.setItem(k, JSON.stringify({setup: {tName: "Kept"}, state: {}}))', AUTOSAVE_KEY)
        legacy.reload()
        assert legacy.has_autosave() and not legacy.seen_dialogs, 'the reset ran again'
        assert legacy.page.get_by_test_id('local-draft').is_visible()
        assert legacy.visible_view()==['home'], 'the initial Library transition was treated as leaving an active draft'
        assert legacy.page.evaluate('k => JSON.parse(localStorage.getItem(k)).setup.tName', AUTOSAVE_KEY)=='Kept', 'startup discarded the retained local draft'

        assert not problems, '\n'.join(problems)
        print(f'PASS remote updates: stale/duplicate/own echo, editing hold, load repair, legacy reset; Setup edits merged on conflict ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
