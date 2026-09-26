"""Tournament files: Download / Load Tournament File (.ksm) and Load Recovery File.

Roadmap 0.5 and M.12. Two staff devices on a throwaway `wrangler dev`, everything through
the Save / Load menu (test IDs, Playwright's download and file-chooser APIs):
  * Download Tournament File writes the tournament (setup, state) with its tournament ID and
    cloud revision;
  * loading that file on the same tournament asks first (file name, saved date, revision, ID
    next to the open tournament's revision); Cancel changes nothing; Replace restores the file
    exactly (the state downloaded again is identical, the cloud copy is the file's);
  * a file of another tournament never replaces the open one: it is offered as a new
    tournament, which gets its own cloud ID and the file's data, while both existing cloud
    tournaments stay unchanged; a file without a tournament ID (older app) is treated the same;
  * invalid files (not JSON, no tournament data, a recovery file) are refused and change nothing;
  * Load Recovery File refuses a file that is not a recovery file and a cancelled password,
    changing nothing; it asks before loading as a new tournament (Cancel changes nothing) and
    refuses while work for the open tournament is still queued, which then reaches the cloud (F7).
"""
import json
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

PLAYERS = [('Aoki Ren', 'Aiea'), ('Baba Sho', 'Waipahu'), ('Chiba Kai', 'Maui'), ('Doi Mei', 'Hilo')]


def write_text(path, text):
    Path(path).write_text(text, encoding='utf-8')
    return path


def write_json(path, data):
    return write_text(path, json.dumps(data))


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        server = lambda tid: fetch_record(base, tid)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Files Cup')
        page = director.page
        tmp = Path(tempfile.mkdtemp(prefix='ksm-files-'))
        tid = director.create_tournament()
        director.setup_divisions([('Files Division', 'Round Robin', 'A')])
        for name, dojo in PLAYERS:
            director.register(name, dojo, 'Files Division')
        director.generate()
        director.wait_generated()
        director.open_court('A')
        director.score_point('W', 'M')
        director.wait_idle()
        points = lambda: (''.join(director.court_screen()['white_points'].split()), ''.join(director.court_screen()['red_points'].split()))
        modal = lambda: page.locator(sel('cloud-modal'))

        # --- Download Tournament File -----------------------------------------------------------
        saved, path = director.download_tournament_file()
        record = server(tid)
        assert saved['tournamentId'] == tid and saved['revision'] == record['revision'] == director.revision(), \
            {k: saved.get(k) for k in ('tournamentId', 'revision')}
        assert saved['setup']['tName'] == 'Files Cup' and saved['savedAt'], saved['setup']
        assert [c['name'] for c in saved['state']['competitors']] == [n for n, _ in PLAYERS]
        assert saved['state']['allMatches'] == record['payload']['state']['allMatches'], 'file differs from the cloud copy'

        # --- Same tournament: confirm, Cancel, Replace ------------------------------------------
        director.score_point('R', 'K')
        director.wait_idle()
        assert points() == ('M', 'K')
        rev = server(tid)['revision']
        director.load_tournament_file(path)
        page.wait_for_selector(sel('file-load-replace'))
        shown = {k: page.inner_text(sel(f'file-load-{k}')).strip() for k in ('name', 'saved', 'revision', 'id', 'open')}
        assert shown['name'] == 'Files Cup' and shown['revision'] == str(saved['revision']) and shown['id'] == tid, shown
        assert shown['saved'] not in ('', 'Unknown') and shown['open'] == f'Files Cup · revision {rev}', shown
        assert 'copy of the open tournament' in page.inner_text(sel('file-load-message'))
        assert page.locator(sel('file-load-new')).count() == 0, 'same tournament offered as a new one'
        director.click('file-load-cancel')
        assert modal().count() == 0 and points() == ('M', 'K'), 'Cancel changed the tournament'
        director.wait_idle()
        director.load_tournament_file(path)
        director.click('file-load-replace')
        director.wait_idle()
        director.open_court('A')
        assert points() == ('M', ''), f'the file was not restored: {points()}'
        after = server(tid)
        assert after['revision'] > rev and after['payload']['state']['allMatches'] == saved['state']['allMatches'], \
            'the cloud copy is not the restored file'
        again, _ = director.download_tournament_file()
        assert again['state'] == saved['state'], 'state after Replace differs from the file: ' + \
            ', '.join(k for k in set(again['state']) | set(saved['state']) if again['state'].get(k) != saved['state'].get(k))
        assert again['setup'] == saved['setup'], 'setup after Replace differs from the file'

        # --- Invalid files change nothing ------------------------------------------------------
        director.wait_idle()
        before = server(tid)['payload']['state']
        director.expect_dialog('Unable to load')
        recovery_name, recovery_path = director.download('nav-download-recovery', menu='nav-save-load')
        invalid = [
            (write_text(tmp / 'not-json.ksm', '{not json'), 'Unable to load this tournament file.'),
            (write_json(tmp / 'no-state.ksm', {'setup': saved['setup']}), 'Unable to load no-state.ksm: it holds no tournament data. Nothing was changed.'),
            (write_json(tmp / 'broken.ksm', {**saved, 'state': {'divisions': 'Open'}}), 'Unable to load broken.ksm: its tournament data is incomplete. Nothing was changed.'),
            (write_json(tmp / 'recovery.ksm', json.loads(Path(recovery_path).read_text())), 'Unable to load recovery.ksm: it is a recovery file (use Load Recovery File). Nothing was changed.'),
        ]
        for bad, message in invalid:
            director.seen_dialogs.clear()
            director.load_tournament_file(bad)
            assert director.wait_for_dialogs() == [message], director.seen_dialogs
            assert modal().count() == 0, f'{bad.name} opened the confirmation'
        director.open_court('A')
        assert points() == ('M', '') and director.tournament_id() == tid
        director.wait_idle()
        assert server(tid)['payload']['state'] == before, 'an invalid file changed the tournament'

        # --- Another tournament's file: never replaces, loads as new ----------------------------
        other = KsmApp.open_device(browser, base, 'Other director', problems, tournament_name='Other Cup', password='other-pass')
        other_tid = other.create_tournament()
        other.setup_divisions([('Kids Division', 'Round Robin', 'B')])
        other.register('Kid One', 'Kona', 'Kids Division')
        other.wait_idle()
        other_before = server(other_tid)
        other.load_tournament_file(path)
        other.page.wait_for_selector(sel('file-load-new'))
        assert other.page.locator(sel('file-load-replace')).count() == 0, 'another tournament offered to replace the open one'
        assert other.page.inner_text(sel('file-load-id')).strip() == tid
        assert 'not the open tournament' in other.page.inner_text(sel('file-load-message'))
        other.click('file-load-cancel')
        other.wait_idle()
        assert other.tournament_id() == other_tid and server(other_tid)['payload']['setup']['tName'] == 'Other Cup'
        other.load_tournament_file(path)
        other.click('file-load-new')  # answers the new Staff password prompts
        other.wait_for(lambda: other.tournament_id() not in (None, other_tid, tid), message='the new tournament ID')
        other.wait_idle()
        new_tid = other.tournament_id()
        created = server(new_tid)
        assert created['payload']['setup']['tName'] == 'Files Cup' and created['payload']['state']['allMatches'] == saved['state']['allMatches'], \
            'the new tournament does not hold the file'
        untouched = server(other_tid)['payload']
        assert untouched['setup']['tName'] == 'Other Cup' and untouched['state'] == other_before['payload']['state'], \
            'the open tournament was changed'
        assert server(tid)['payload']['state']['allMatches'] == saved['state']['allMatches'], 'the file\'s own tournament was changed'
        other.close()

        # A file without a tournament ID (saved before 0.5) is never taken for the open tournament.
        legacy = write_json(tmp / 'older.ksm', {k: v for k, v in saved.items() if k not in ('tournamentId', 'revision')})
        director.load_tournament_file(legacy)
        page.wait_for_selector(sel('file-load-new'))
        assert page.locator(sel('file-load-replace')).count() == 0
        assert page.inner_text(sel('file-load-id')).strip() == 'None (older file)' and page.inner_text(sel('file-load-revision')).strip() == 'Unknown'
        director.click('file-load-cancel')
        assert director.tournament_id() == tid

        # --- Load Recovery File -------------------------------------------------------------------
        director.wait_idle()
        rev = server(tid)['revision']
        director.expect_dialog('Unable to load this recovery file.')
        director.seen_dialogs.clear()
        director.load_recovery_file(path)  # a tournament file, not a recovery file
        director.wait_for_dialogs()
        assert director.tournament_id() == tid and director.revision() == rev, 'an invalid recovery file changed the device'
        # With a tournament open it asks first (F7); Cancel leaves everything as it was.
        ask = 'Load this recovery file as a new tournament?'
        director.expect_dialog(ask, accept=False)
        director.seen_dialogs.clear()
        director.load_recovery_file(recovery_path)
        assert director.wait_for_dialogs() == [director.seen_dialogs[0]] and director.seen_dialogs[0].startswith(ask)
        assert 'Files Cup' in director.seen_dialogs[0], director.seen_dialogs
        assert director.tournament_id() == tid and director.revision() == rev, 'Cancel changed the device'
        # Cancelling the new Staff password leaves the open tournament as it was. (Before asking for
        # the password, the guard saves this device's pending autosave, e.g. the screen it is on, so
        # the revision may move; the tournament's matches must not.)
        matches = server(tid)['payload']['state']['allMatches']
        director.expect_dialog(ask, accept=True)
        director.expect_dialog('Create Staff password')
        director.seen_dialogs.clear()
        director.load_recovery_file(recovery_path)
        director.wait_for_dialogs(3)
        assert director.seen_dialogs[2] == 'Unable to load this recovery file.', director.seen_dialogs
        director.wait_idle()
        assert director.tournament_id() == tid and server(tid)['payload']['state']['allMatches'] == matches, \
            'a cancelled recovery load changed the open tournament'
        del director.expected['Create Staff password']

        # F7 (docs/ROADMAP.md, fixed): while work for the open tournament is still queued (offline),
        # Load Recovery File refuses and changes nothing; the queued point then reaches the cloud.
        refused = 'This device has changes that could not be saved to the cloud yet.'
        director.expect_dialog(refused)
        page.context.set_offline(True)
        director.score_point('R', 'D')
        director.wait_for(director.outbox, message='the offline point to be queued')
        director.seen_dialogs.clear()
        director.load_recovery_file(recovery_path)
        director.wait_for_dialogs(2)
        assert director.seen_dialogs[1].startswith(refused), director.seen_dialogs
        assert director.tournament_id() == tid and director.outbox(), 'a refused recovery file changed the device'
        page.context.set_offline(False)
        director.save_now()
        director.wait_idle()
        has_point = lambda: any(m.get('rp') == ['D'] for m in server(tid)['payload']['state']['allMatches']['Files Division'])
        director.wait_for(has_point, message='the queued point to reach the open tournament')
        # With nothing queued, it loads as a new tournament and the open one stays unchanged.
        before = server(tid)
        director.seen_dialogs.clear()
        director.load_recovery_file(recovery_path)
        director.wait_for(lambda: page.inner_text(sel('save-status')).strip() == 'Recovery file loaded', message='the recovery file to load')
        director.save_now()
        director.wait_for(lambda: director.tournament_id() not in (None, tid), message='the recovered tournament')
        director.wait_idle()
        after = server(tid)['payload']['state']['allMatches']
        assert after == before['payload']['state']['allMatches'] and has_point(), 'loading the recovery file changed the open tournament'

        assert not problems, '\n'.join(problems)
        print(f'PASS tournament files: download/load round trip, same-tournament confirm, other tournament as new, '
              f'older file, invalid files, recovery file: ask, refusals, queued work kept (F7) ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
