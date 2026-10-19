"""Load Tournament File (Replace) while courts score (test audit, issue #59, rank 12).

Director and the two court scorekeepers against a throwaway `wrangler dev`: "Open A" (Court A) and
"Open B" (Court B), round robins of 3. The director downloads a tournament file before any point is
scored, then loads it again with Replace (Setup -> Load Tournament File):

  1. No race: Court B had scored. Replace puts the file's copy on the server (the point is gone);
     Court B follows the replaced copy (screen and data), and its next point saves on top of it
     without a conflict.
  2. Race (F37, expected-failure check): the director's Replace is held at the network while Court A
     saves a point first. The held save meets a conflict (HTTP 409) and is rebased. Only court
     actions and the Setup/Registration lists are replayed or merged, so the file's copy is silently
     dropped: the server keeps both courts' points, the director's screen shows them again, and
     nobody is told (no question, no notice). When F37 is fixed (the file wins, or the director is
     asked or told that Replace was not saved), change the assertions below and mark F37 fixed.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel, app_path
from ksm_browser import launch_chromium
from ksm_races import Races, people, state_of
from ksm_server import local_worker


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='File Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open A', 'format': 'Round Robin', 'court': 'A', 'entrants': people('OA', 3)},
            {'name': 'Open B', 'format': 'Round Robin', 'court': 'B', 'entrants': people('OB', 3)},
        ])
        director.save_now()
        director.wait_idle()
        courts = {}
        for c in 'AB':
            app = KsmApp.open_device(browser, base, f'Court {c}', problems, app_path(tid, 'court', c))
            app.wait_generated()
            app.staff_login()
            app.open_court(c)
            courts[c] = app
        a, b = courts['A'], courts['B']
        races = Races(base, tid, [director, a, b])
        file, path = director.download_tournament_file()
        assert not any(m.get('wp') or m.get('rp') for div in file['state']['allMatches'].values() for m in div), 'the file starts with points'

        played = lambda payload, div: [(m['white'], m['red'], m.get('wp') or [], m.get('rp') or [])
                                       for m in payload['state']['allMatches'][div] if m.get('wp') or m.get('rp')]
        on_server = lambda: races.server()['payload']

        def replace():
            director.load_tournament_file(path)
            director.page.wait_for_selector(sel('file-load-replace'))
            director.click('file-load-replace')

        # 1. Replace without a race: Court B (which had scored) follows the replaced copy.
        b.score_point('W', 'M')
        races.settle()
        assert played(on_server(), 'Open B') == [('OB 1', 'OB 2', ['M'], [])], '1: the point to replace was not saved'
        rev = races.server()['revision']
        replace()
        races.settle()
        assert races.server()['revision'] > rev and played(on_server(), 'Open B') == [], '1: Replace did not put the file\'s copy on the server'
        b.wait_for(lambda: played(b.payload(), 'Open B') == [] and b.court_screen()['white_points'] == '',
                   message='1: Court B to follow the replaced copy')
        seen = b.conflicts()
        b.score_point('R', 'D')
        races.settle()
        assert played(on_server(), 'Open B') == [('OB 1', 'OB 2', [], ['D'])] and b.conflicts() == seen, \
            f'1: Court B\'s next point did not save on top of the replaced copy: {played(on_server(), "Open B")}'

        # 2. Replace held while Court A saves a point first (F37).
        record = races.race(director, replace, a, lambda: a.score_point('W', 'K'))
        server_copy = record['payload']
        # F37 (open): the file's copy is dropped silently. When fixed, the file wins or the director is told.
        assert played(server_copy, 'Open A') == [('OA 1', 'OA 2', ['K'], [])] and played(server_copy, 'Open B') == [('OB 1', 'OB 2', [], ['D'])], \
            f'F37 fixed? Replace no longer loses to the other save: {played(server_copy, "Open A")} {played(server_copy, "Open B")}: assert the new behaviour and mark F37 fixed'
        assert not [d for d in director.seen_dialogs if 'Re-apply' in d or 'replace' in d.lower()], f'F37 fixed? the director is asked: {director.seen_dialogs}'
        toasts = ' | '.join(director.page.evaluate('KSMTest.toasts()'))
        assert 'not saved' not in toasts and 'Replace' not in toasts, f'F37 fixed? the director is told: {toasts}'
        for app in (director, a, b):
            assert played(app.payload(), 'Open A') == played(server_copy, 'Open A') and played(app.payload(), 'Open B') == played(server_copy, 'Open B'), \
                f'2: {app.name} differs from the server'

        # Survives a reload: a reloaded court and a fresh device show the server's copy.
        fresh = KsmApp.open_device(browser, base, 'Fresh', problems, app_path(tid))
        a.reload()
        for app in (fresh, a):
            app.wait_revision(races.server()['revision'])
            assert app.payload()['state']['allMatches'] == server_copy['state']['allMatches'], f'{app.name} differs from the server'
        assert not problems, '\n'.join(problems)
        print(f'PASS load file while courts score: Replace reaches the server and Court B follows it; a Replace that meets a conflict is '
              f'dropped silently (F37 pinned) ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
