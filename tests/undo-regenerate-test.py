"""#129 part 3: Undo regenerate, through the real app and a local backend (wrangler dev).

  * a cloud tournament with results: Regenerate Tournament's typed warning has the undo line; after
    the redraw Setup -> Advanced -> Danger zone shows Undo regenerate with the finished-match count it
    brings back; the confirmation states what is replaced; Undo brings back results and brackets;
  * a court device open through it all (Court A, on a division it chose itself after the redraw, with
    a point on its way to the server when the undo happens) ends on the restored tournament: its
    point is not put on top of it, its court shows the restored copy's division and match (the same
    as a court device opened afresh), and the server copy stays the restored one;
  * offline the button is disabled with a reason; a regenerate made offline is queued with its mark
    and, once online, the server keeps its restore point (the outbox replay keeps the mark);
  * a spectator sees no button; a local-only tournament's warning has no undo line.
"""
import json
import urllib.request

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record, sel, staff_token, CLIENT_SCHEMA
from ksm_browser import launch_chromium
from ksm_server import local_worker

people = lambda p, n: [{'name': f'{p} {i}', 'dojo': f'{p} Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(1, n + 1)]
finished = lambda matches: sum(bool(m.get('done')) for ms in matches.values() for m in ms)
UNDO_LINE = 'You can undo this for 24 hours from Setup → Advanced → Danger zone.'


def status(base, tid):
    req = urllib.request.Request(f'{base}/api/tournaments/{tid}/status', headers={'x-ksm-role': 'staff', 'x-ksm-session-key': staff_token(base, tid), **CLIENT_SCHEMA})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def open_advanced(app):
    app.show_screen('setup')
    app.page.locator('#setup-tournament-actions details').evaluate('el => { el.open = false; }')
    app.page.wait_for_timeout(50)
    app.page.locator('#setup-tournament-actions details').evaluate('el => { el.open = true; }')


def regenerate(app, expect_undo_line):
    """Danger zone -> Regenerate Tournament -> validation -> the typed warning -> redraw (with its backup download)."""
    open_advanced(app)
    app.click('setup-regenerate-tournament')
    app.page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
    app.click('generate-confirm')
    warning = app.page.locator(sel('regenerate-warning'))
    warning.wait_for()
    assert (UNDO_LINE in warning.inner_text()) == expect_undo_line, warning.inner_text()
    app.page.locator(sel('regenerate-warning-input')).fill('REGENERATE')
    with app.page.expect_download():
        app.click('regenerate-warning-confirm')
    app.wait_for(lambda: app.page.locator(sel('regenerate-warning')).count() == 0, message='warning closed')


def results_text(app):
    app.show_screen('results')
    app.page.wait_for_timeout(300)
    return app.page.inner_text('#results')


def court_position(app):
    return app.page.evaluate("() => { const s = KSMTest.app.state; return { division: s.courtState?.A?.division, index: s.courtState?.A?.index }; }")


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)

        # ---- local-only: the warning has no undo line
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        local = KsmApp.local(page, 'Local', problems=problems)
        local.answers['Create Staff password'] = ''
        local.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('L', 4)}])
        page.evaluate("() => { KSMTest.prepareCourt('A'); KSMTest.play([['W','M'],['W','M']]); }")
        local.show_screen('setup')
        page.locator('#setup-tournament-actions details').evaluate('el => { el.open = true; }')
        local.click('setup-regenerate-tournament')
        page.wait_for_selector(f'{sel("validation-modal")}:not(.hidden)')
        local.click('generate-confirm')
        page.locator(sel('regenerate-warning')).wait_for()
        assert UNDO_LINE not in page.inner_text(sel('regenerate-warning'))
        assert page.locator(sel('regenerate-warning-undo')).count() == 0
        local.click('regenerate-warning-cancel')
        page.close()

        # ---- a cloud tournament with results on two divisions of Court A
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Undo Cup')
        tid = director.create_tournament()
        director.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('O', 4)},
                            {'name': 'Kids', 'format': 'Round Robin', 'court': 'A', 'entrants': people('K', 4)},
                            # A two-player final: its match has the same identity in every draw (the bracket node), so
                            # a point scored on it after the redraw would be replayed onto the restored copy's final.
                            {'name': 'Finals', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('F', 2)}])
        director.wait_generated()
        director.page.evaluate("() => { KSMTest.prepareCourt('A'); KSMTest.play([['W','M'],['W','M']]); }")
        director.save_now()
        director.wait_idle()
        # Court A moves on to Kids and plays one there: the court position before the redraw is Kids.
        director.page.evaluate("() => { KSMTest.app.selectScorekeeperDivision('Kids'); KSMTest.play([['R','K']]); }")
        director.save_now()
        director.wait_idle()
        before = fetch_record(base, tid)
        before_matches = before['payload']['state']['allMatches']
        before_done = finished(before_matches)
        assert before_done == 2 and finished({'Kids': before_matches['Kids']}) == 1, before_done
        assert court_position(director)['division'] == 'Kids'
        assert status(base, tid)['restorePoint'] is None
        open_advanced(director)
        assert director.page.locator(sel('setup-undo-regenerate')).count() == 0

        # The court device (Court A scorekeeper) is open through the redraw and the undo.
        court = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        court.wait_generated()
        court.staff_login()
        court.open_court('A')
        court.wait_for(court.current_match, message='a match on Court A')

        # ---- Regenerate with results: the warning's undo line, then the Danger zone's Undo
        court.wait_idle()
        director.wait_revision(fetch_record(base, tid)['revision'])
        director.wait_idle()
        before = fetch_record(base, tid)
        assert before['payload']['state']['allMatches'] == before_matches
        structure_before, results_before, final_before = director.page.evaluate('KSMTest.structure()'), results_text(director), director.final_state()
        regenerate(director, expect_undo_line=True)
        assert director.final_state() != final_before
        director.wait_idle()
        redrawn = fetch_record(base, tid)
        assert finished(redrawn['payload']['state']['allMatches']) == 0
        point = status(base, tid)['restorePoint']
        assert point and point['finishedMatches'] == before_done and point['revision'] == before['revision'], point
        # The save's completion already asked the server (the button is there before the Danger zone opens).
        undo = director.page.locator(sel('setup-undo-regenerate'))
        director.wait_for(lambda: undo.count() == 1, message='Undo regenerate after the regenerate save')
        open_advanced(director)
        undo.wait_for()
        assert 'danger' in undo.get_attribute('class') and undo.is_enabled()
        info = director.page.inner_text(sel('setup-undo-regenerate-info'))
        assert f'{before_done} finished matches' in info and 'available until' in info, info

        # The court follows the redraw, chooses Finals itself and scores there; the second point is on its way when the undo happens.
        court.wait_revision(redrawn['revision'])
        assert court.court_screen()['selected'] == 'Kids', court.court_screen()
        court.page.select_option(f'#score {sel("court-division-select")}', label='Finals')
        court.wait_for(lambda: court.court_screen()['selected'] == 'Finals' and court.current_match(), message='Court A on Finals')
        court.score_point('W', 'M')
        court.wait_idle()
        assert court_position(court)['division'] == 'Finals'
        court.hold_next_save()
        court.score_point('W', 'K')
        court.wait_held_save()

        # The director undoes: the confirmation says what is replaced.
        director.wait_revision(fetch_record(base, tid)['revision'])
        now_done = finished(director.all_matches())
        director.expect_dialog('Undo regenerate?', accept=True)
        director.seen_dialogs.clear()
        undo.click()
        seen = director.wait_for_dialogs()
        assert f'({now_done} finished {"match" if now_done == 1 else "matches"} now) is replaced on every device' in seen[0], seen
        director.wait_toast('✓ Regenerate undone')
        restored = fetch_record(base, tid)
        assert restored['payload']['state']['allMatches'] == before_matches
        assert restored['restored']['fromRevision'] == before['revision']
        assert status(base, tid)['restorePoint'] is None
        assert director.all_matches() == before_matches, 'the restoring device did not apply the restored copy'
        director.wait_for(lambda: director.page.locator(sel('setup-undo-regenerate')).count() == 0, message='Undo regenerate gone')
        # Results and brackets are back.
        assert director.page.evaluate('KSMTest.structure()') == structure_before, 'pools and brackets differ after the undo'
        assert director.final_state() == final_before, 'standings and results differ after the undo'
        assert results_text(director) == results_before, 'the Results screen differs after the undo'

        # The court's held point meets the restored copy: it is not put on top of it.
        court.release_save()
        court.wait_idle()
        court.wait_for(lambda: court.all_matches() == before_matches, message='Court A on the restored matches')
        after = fetch_record(base, tid)
        assert after['payload']['state']['allMatches'] == before_matches, 'the court device wrote its post-regenerate point over the restored tournament'
        # Before the fix the held save was rebased onto the restored copy: Court A's post-regenerate position
        # (Finals) and its court action history were written over it (revision + 1).
        assert after['revision'] == restored['revision'], 'the court device saved its post-regenerate work over the restored tournament'
        assert after['payload']['state']['courtState']['A']['division'] == 'Kids', after['payload']['state']['courtState']
        recovery = court.page.evaluate("() => JSON.parse(localStorage.getItem('ksm.cloud.recovery.v3_15') || 'null')")
        assert recovery and recovery.get('reason') == 'Replaced by Undo regenerate', recovery
        # Its court shows the restored copy's division and match, as a court device opened afresh does.
        fresh = KsmApp.open_device(browser, base, 'Fresh Court A', problems, app_path(tid, 'court', 'A'))
        fresh.wait_revision(after['revision'])
        fresh.staff_login()
        fresh.open_court('A')
        assert court_position(court)['division'] == 'Kids', court_position(court)
        court.wait_for(lambda: court.current_match() == fresh.current_match(), message='the same match as a fresh court device')
        fresh.close()

        # ---- A spectator sees no Undo regenerate
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        spectator.wait_generated()
        open_advanced(spectator)
        spectator.page.wait_for_timeout(500)
        assert spectator.page.locator(sel('setup-undo-regenerate')).count() == 0
        spectator.close()

        # ---- Offline: a queued regenerate keeps its mark; the button is disabled with a reason
        director.wait_idle()
        director.page.context.set_offline(True)
        regenerate(director, expect_undo_line=True)
        director.wait_for(lambda: (director.page.evaluate('KSMTest.app.readOutbox()') or {}).get('restorePoint') == 'regenerate', message='the queued regenerate keeps its mark')
        assert status(base, tid)['restorePoint'] is None
        director.page.context.set_offline(False)
        director.wait_idle()
        point = status(base, tid)['restorePoint']
        assert point and point['finishedMatches'] == before_done, point
        open_advanced(director)
        undo = director.page.locator(sel('setup-undo-regenerate'))
        undo.wait_for()
        director.page.context.set_offline(True)
        director.page.evaluate("() => window.dispatchEvent(new Event('offline'))")
        director.wait_for(lambda: undo.is_disabled(), message='Undo regenerate disabled offline')
        assert 'needs a connection' in director.page.inner_text(sel('setup-undo-regenerate-info'))
        director.page.context.set_offline(False)
        director.page.evaluate("() => window.dispatchEvent(new Event('online'))")
        director.wait_for(lambda: undo.is_enabled(), message='Undo regenerate enabled online')
        size = len(json.dumps(fetch_record(base, tid)))
        print(f'     record size {size} bytes (the restore point holds one more copy)')

        assert not problems, problems
        browser.close()
    print('PASS undo regenerate: warning line, Danger zone, court device, offline mark, spectator, local-only')


if __name__ == '__main__':
    main()
