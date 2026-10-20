"""Load Tournament File (Replace) while courts score (test audit, issue #59, rank 12).

Director and the two court scorekeepers against a throwaway `wrangler dev`: "Open A" (Court A) and
"Open B" (Court B), round robins of 3. The director downloads a tournament file before any point is
scored, then loads it again with Replace (Setup -> Load Tournament File):

  1. No race: Court B had scored. Replace puts the file's copy on the server (the point is gone);
     Court B follows the replaced copy (screen and data), and its next point saves on top of it
     without a conflict.
  2. Race (F37, #88): the director's Replace is held at the network while Court A saves a point first.
     The Replace meets a conflict (HTTP 409) and is never merged away: the director is asked in the
     page ("Another device changed the tournament during the replace.").
     a. Replace anyway: the file goes out again against the newer revision; the server, the director
        and both courts have the file's copy (Court A's point is gone), with a toast saying so.
     b. Cancel: the server, the director and both courts keep Court A's point; the director is told the
        file was not loaded.
  3. The Replace reaches the server but its answer is lost: the director checks with the server and
     keeps the file (it does not put the old copy back over it).
"""
import time
import urllib.request

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

        # 2. Replace held while Court A saves a point first (F37): the director is asked.
        def raced(first_point):
            seen = director.page.evaluate('KSMTest.toasts().length')
            races.race(director, replace, a, lambda: a.score_point('W', first_point), settle_after=False)
            director.page.wait_for_selector(sel('replace-conflict-anyway'))
            title = director.page.inner_text(sel('cloud-modal-title'))
            assert title == 'Another device changed the tournament during the replace.', title
            assert director.page.evaluate("document.activeElement?.dataset.testid") == 'replace-conflict-anyway', 'Replace anyway is not the default'
            return seen

        # 2a. Replace anyway: the file wins everywhere.
        seen = raced('K')
        director.click('replace-conflict-anyway')
        races.settle()
        server_copy = on_server()
        assert played(server_copy, 'Open A') == [] and played(server_copy, 'Open B') == [], \
            f'2a: the file did not win: {played(server_copy, "Open A")} {played(server_copy, "Open B")}'
        for app in (director, a, b):
            assert played(app.payload(), 'Open A') == [] and played(app.payload(), 'Open B') == [], f'2a: {app.name} differs from the file'
        # (the toast history skips a repeat of the same text: case 1 showed it too)
        toasts = director.page.evaluate('KSMTest.toasts()')
        assert toasts[-1].startswith('✓ Tournament replaced from '), f'2a: no toast: {toasts}'

        # 2b. Cancel: the other device's point stays; the director is told the file was not loaded.
        seen = raced('D')
        director.click('replace-conflict-cancel')
        races.settle()
        server_copy = on_server()
        assert played(server_copy, 'Open A') == [('OA 1', 'OA 2', ['D'], [])], f'2b: Court A\'s point was lost: {played(server_copy, "Open A")}'
        for app in (director, a, b):
            assert played(app.payload(), 'Open A') == played(server_copy, 'Open A') and played(app.payload(), 'Open B') == played(server_copy, 'Open B'), \
                f'2b: {app.name} differs from the server'
        toasts = director.page.evaluate('KSMTest.toasts()')[seen:]
        assert any(t.startswith('Tournament file not loaded') for t in toasts), f'2b: the director was not told: {toasts}'
        assert not director.page.locator(sel('cloud-modal')).count(), '2b: the question is still open'

        # 3. The Replace reaches the server but its answer is lost: the director asks the server, keeps the file
        #    and says it is replaced (it does not put back the old copy over the file).
        count = len(director.page.evaluate('KSMTest.toasts()'))
        director.hold_next_save()
        replace()
        director.wait_held_save()
        held = director._held[0].request
        headers = {k: v for k, v in held.headers.items() if k.lower().startswith(('content-type', 'x-ksm-'))}
        with urllib.request.urlopen(urllib.request.Request(held.url, data=held.post_data.encode(), headers=headers, method='PUT')) as r:
            assert r.status == 200, r.status  # the server applies it
        director.drop_held_save()  # the director never hears that it did
        director.wait_for(lambda: len(director.page.evaluate('KSMTest.toasts()')) > count, timeout=30, message='3: the Replace to settle')
        assert director.page.evaluate('KSMTest.toasts()')[-1].startswith('✓ Tournament replaced'), director.page.evaluate('KSMTest.toasts()')
        races.settle()
        server_copy = on_server()
        assert played(server_copy, 'Open A') == [] and played(server_copy, 'Open B') == [], '3: the file is not on the server'
        for app in (director, a, b):
            assert played(app.payload(), 'Open A') == [] and played(app.payload(), 'Open B') == [], f'3: {app.name} differs from the file'

        # Survives a reload: a reloaded court and a fresh device show the server's copy.
        fresh = KsmApp.open_device(browser, base, 'Fresh', problems, app_path(tid))
        a.reload()
        for app in (fresh, a):
            app.wait_revision(races.server()['revision'])
            assert app.payload()['state']['allMatches'] == server_copy['state']['allMatches'], f'{app.name} differs from the server'
        assert not problems, '\n'.join(problems)
        print(f'PASS load file while courts score: Replace reaches the server and Court B follows it; a Replace that meets a conflict '
              f'asks: Replace anyway wins everywhere, Cancel keeps the other save and says so (F37) ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
