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
  4. Replace while the director's own save is in flight and rebased: the file is sent, not that result.
  5. A closed tab's queued work this tab took over is replaced by the file, not given back; a crashed tab's
     copy of its queued work (kept apart while asked; 2b: Cancel puts it back) is released, not lost.
  6. The director's tab closes while asked: the autosave keeps the copy from before, nothing is queued.
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
        def raced(first_point, start=None):
            seen = director.page.evaluate('KSMTest.toasts().length')
            races.race(director, start or replace, a, lambda: a.score_point('W', first_point), settle_after=False)
            director.page.wait_for_selector(sel('replace-conflict-anyway'))
            title = director.page.inner_text(sel('cloud-modal-title'))
            assert title == 'Another device changed the tournament during the replace.', title
            assert director.page.evaluate("document.activeElement?.dataset.testid") == 'replace-conflict-anyway', 'Replace anyway is not the default'
            return seen

        # 2a. Replace anyway: the file wins everywhere.
        seen = raced('K')
        # An edit while asked (an award) is saved on top of the file once it is replaced.
        # (an input event: the ordinary autosave, whose 2 s timer runs while the question is open)
        director.page.evaluate("KSMTest.app.state.awards=[{name:'While asked'}];document.body.dispatchEvent(new Event('input',{bubbles:true}))")
        director.wait_for(lambda: not director.page.evaluate('KSMTest.app.ksmSaveTimer'), message='2a: the autosave timer to run while asked')
        director.click('replace-conflict-anyway')
        races.settle()
        server_copy = on_server()
        assert [x.get('name') for x in server_copy['state'].get('awards') or []] == ['While asked'], f'2a: the edit made while asked was not saved: {server_copy["state"].get("awards")}'
        director.page.evaluate("KSMTest.app.state.awards=[];KSMTest.saveNow('Clear award')")
        races.settle()
        assert played(server_copy, 'Open A') == [] and played(server_copy, 'Open B') == [], \
            f'2a: the file did not win: {played(server_copy, "Open A")} {played(server_copy, "Open B")}'
        for app in (director, a, b):
            assert played(app.payload(), 'Open A') == [] and played(app.payload(), 'Open B') == [], f'2a: {app.name} differs from the file'
        # (the toast history skips a repeat of the same text: case 1 showed it too)
        toasts = director.page.evaluate('KSMTest.toasts()')
        assert toasts[-1].startswith('✓ Tournament replaced from '), f'2a: no toast: {toasts}'

        # 2b. Cancel: the other device's point stays; the director is told the file was not loaded.
        # The director has queued work of its own (here for another tournament, so it is never sent): while the
        # question is open it is kept apart (a copy survives a crash), and Cancel puts it back.
        QUEUED = '{"tournamentId":"another-tournament","role":"staff","payload":{"state":{}},"queuedAt":"2030-01-01T00:00:00.000Z"}'
        def replace_with_queue():
            director.page.evaluate('raw => localStorage.setItem(KSMTest.app.ksmOutboxKey(), raw)', QUEUED)
            replace()
        seen = raced('D', replace_with_queue)
        kept = director.page.evaluate('''() => [localStorage.getItem(KSMTest.app.ksmOutboxKey()),
          localStorage.getItem('ksm.cloud.replace-backup.v1:' + KSMTest.app.KSM_TAB_ID)]''')
        assert kept == [None, QUEUED], f'2b: queued work while asked: {kept}'
        director.click('replace-conflict-cancel')
        kept = director.page.evaluate('''() => [localStorage.getItem(KSMTest.app.ksmOutboxKey()),
          localStorage.getItem('ksm.cloud.replace-backup.v1:' + KSMTest.app.KSM_TAB_ID)]''')
        assert kept == [QUEUED, None], f'2b: Cancel did not put the queued work back: {kept}'
        director.page.evaluate('localStorage.removeItem(KSMTest.app.ksmOutboxKey())')
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

        def replaced(label):
            # (the toast history skips a repeat of the same text, so wait for the Replace itself)
            return lambda: director.wait_for(lambda: not director.page.evaluate('KSMTest.replacing()'), timeout=30, message=f'{label}: the Replace to settle')

        # 4. Replace while the director's own save is in flight and is rebased (Court A saved first): the file
        #    is sent, not the merged result that save applies meanwhile.
        settled = replaced('4')
        director.hold_next_save()
        director.page.evaluate("KSMTest.app.state.awards=[{name:'In flight'}];KSMTest.saveNow('Director edit')")
        director.wait_held_save()
        a.score_point('W', 'M')
        a.blur(); races.flush_edit(a); a.wait_idle()
        director.load_tournament_file(path)
        director.page.wait_for_selector(sel('file-load-replace'))
        director.click('file-load-replace')
        director.release_save()
        settled()
        assert director.page.evaluate('KSMTest.toasts()')[-1].startswith('✓ Tournament replaced'), director.page.evaluate('KSMTest.toasts()')
        races.settle()
        server_copy = on_server()
        assert played(server_copy, 'Open A') == [] and not server_copy['state'].get('awards'), \
            f'4: the save in flight\'s result was sent instead of the file: {played(server_copy, "Open A")} {server_copy["state"].get("awards")}'
        for app in (director, a, b):
            assert played(app.payload(), 'Open A') == [], f'4: {app.name} differs from the file'

        # 5. A closed tab's queued work this tab took over (not merged yet) is replaced by the file, not given
        #    back as a new queue that would replay over it.
        director.page.evaluate('''() => { const app = KSMTest.app, p = app.tournamentPayload(); p.state.awards = [{name: 'Closed tab award'}];
          localStorage.setItem(app.ksmOutboxKey(), JSON.stringify({schemaVersion: '1.0', tournamentId: app.cloudSession.tournamentId, role: 'staff',
            baseRevision: app.cloudSession.revision, payload: p, actions: [], queuedAt: new Date().toISOString(), writer: app.KSM_TAB_ID, adoptedFrom: 'gone-tab'})); }''')
        settled = replaced('5')
        replace()
        settled()
        assert director.page.evaluate('KSMTest.toasts()')[-1].startswith('✓ Tournament replaced'), director.page.evaluate('KSMTest.toasts()')
        queues = director.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith(KSMTest.app.KSM_CLOUD_OUTBOX_KEY))")
        assert not queues, f'5: replaced work is still queued: {queues}'
        races.settle()
        assert not on_server()['state'].get('awards'), '5: the closed tab\'s work came back over the file'

        # 5b. A tab that crashed while asked (no beforeunload) leaves its queued work's copy: once that tab is gone,
        #     it is released as a closed tab's work (taken over by the next staff tab of its tournament).
        released = director.page.evaluate('''raw => { localStorage.setItem('ksm.cloud.replace-backup.v1:crashed-tab', raw);
          KSMTest.app.ksmReleaseReplaceBackups();
          const keys = Object.keys(localStorage);
          return [keys.includes('ksm.cloud.replace-backup.v1:crashed-tab'),
                  keys.filter(k => k.startsWith(KSMTest.app.KSM_CLOUD_OUTBOX_KEY + ':released-')).map(k => localStorage.getItem(k))]; }''', QUEUED)
        assert released == [False, [QUEUED]], f'5b: a crashed tab\'s queued work was not released: {released}'
        director.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith(KSMTest.app.KSM_CLOUD_OUTBOX_KEY)).forEach(k => localStorage.removeItem(k))")

        # 6. The director's tab closes while asked: its startup cache (the autosave) keeps the copy from before,
        #    not the unconfirmed file; the server keeps Court A's point.
        b.score_point('R', 'K')
        races.settle()
        raced('M')
        keep = director.page.context.new_page()
        keep.goto(base + '/privacy.html', wait_until='domcontentloaded')
        with director.page.expect_event('close'):
            director.page.close(run_before_unload=True)
        autosave = keep.evaluate("JSON.parse(localStorage.getItem('ksm.local.autosave.v3_1') || 'null')")
        assert played(autosave, 'Open B') == [('OB 1', 'OB 2', [], ['K'])], f'6: the autosave holds the unconfirmed file: {played(autosave, "Open B")}'
        assert not keep.evaluate("Object.keys(localStorage).filter(k => k.startsWith('ksm.cloud.outbox.v3_15'))"), '6: the file was queued'
        assert played(on_server(), 'Open A') == [('OA 1', 'OA 2', ['M'], [])], '6: Court A\'s point was lost'

        # Survives a reload: a reloaded court and a fresh device show the server's copy.
        server_copy = on_server()
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
