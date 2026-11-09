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
  * a spectator sees no button; a local-only tournament's warning has no undo line;
  * review fixes of #156: the court's dropped work has its own recovery copy (a later offline queue does
    not overwrite it) and Download Recovery File includes it; a closed tab's work queued before the undo
    is kept there too, not merged onto the restored tournament; an undo confirmed before a newer
    regenerate is refused (restore-point-changed) and the button shows the newer one;
  * recovery copies are capped and trimmed before writing (with storage full, only this tournament's older
    copies, and none if it still does not fit); with storage full the queue still writes, a closed tab's work
    stays queued (one notice) until its copy can be kept, and a court's dropped work is parked and offered as
    a download from a button.
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


def restore_recoveries(app, tid):
    """The device's copies of work an Undo regenerate dropped, oldest first (one key each)."""
    return app.page.evaluate("""(tid) => Object.keys(localStorage).filter(k => k.startsWith(`ksm.cloud.recovery.v3_15:restore:${tid}:`))
      .sort((a, b) => Number(a.split(':').slice(-2)[0]) - Number(b.split(':').slice(-2)[0])).map(k => JSON.parse(localStorage.getItem(k)))""", tid)


def regenerate_put(base, tid, payload, revision, point_id):
    """A full regenerate's save from another staff device (marked, so the server keeps a restore point)."""
    body = json.dumps({'tournamentId': tid, 'revision': revision, 'payload': payload, 'restorePoint': 'regenerate', 'restorePointId': point_id}).encode()
    req = urllib.request.Request(f'{base}/api/tournaments/{tid}', data=body, method='PUT', headers={
        'content-type': 'application/json', 'x-ksm-role': 'staff', 'x-ksm-session-key': staff_token(base, tid),
        'x-ksm-client-id': 'other-director', 'x-ksm-client-name': 'Other director', **CLIENT_SCHEMA})
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
        assert restore_recoveries(court, tid) and restore_recoveries(court, tid)[-1]['reason'] == 'Replaced by Undo regenerate', restore_recoveries(court, tid)
        assert restore_recoveries(court, tid)[-1]['restoredRevision'] == restored['revision']
        # Its court shows the restored copy's division and match, as a court device opened afresh does.
        fresh = KsmApp.open_device(browser, base, 'Fresh Court A', problems, app_path(tid, 'court', 'A'))
        fresh.wait_revision(after['revision'])
        fresh.staff_login()
        fresh.open_court('A')
        assert court_position(court)['division'] == 'Kids', court_position(court)
        court.wait_for(lambda: court.current_match() == fresh.current_match(), message='the same match as a fresh court device')
        fresh.close()

        # The dropped work keeps its own copy: a later offline queue (which writes the single recovery slot)
        # does not overwrite it, and Download Recovery File includes it.
        slot = court.page.evaluate("""() => { KSMTest.app.writeOutbox(KSMTest.app.tournamentPayload(), 'Later offline edit');
          const slot = JSON.parse(localStorage.getItem('ksm.cloud.recovery.v3_15') || 'null'); KSMTest.app.clearOutbox(); return slot; }""")
        assert slot and slot.get('reason') is None, slot
        kept = restore_recoveries(court, tid)
        assert len(kept) == 1 and kept[0]['reason'] == 'Replaced by Undo regenerate', kept
        open_advanced(court)
        with court.page.expect_download() as download:
            court.click('setup-download-recovery')
        with open(download.value.path()) as f:
            pack = json.load(f)
        assert [r.get('reason') for r in pack.get('restoreRecovery') or []] == ['Replaced by Undo regenerate'], pack.get('restoreRecovery')
        assert pack['restoreRecovery'][0]['outbox']['payload'], 'the recovery file lacks the dropped work'

        # A closed tab's work queued before the undo is not merged onto the restored tournament (F36 + #129):
        # the director's tab takes it over (Save Now) and keeps it in the recovery file instead.
        director.wait_idle()
        orphan = director.page.evaluate("() => { const p = KSMTest.app.tournamentPayload(); p.setup.tName = 'Closed tab edit'; return p; }")
        director.page.evaluate("""([tid, payload, base]) => localStorage.setItem('ksm.cloud.outbox.v3_15:gone-tab', JSON.stringify({schemaVersion: '1.0',
          tournamentId: tid, role: 'staff', baseRevision: base, payload, actions: [{type: 'snapshot', reason: 'Closed tab', createdAt: new Date().toISOString()}],
          queuedAt: new Date().toISOString(), writer: 'gone-tab'}))""", [tid, orphan, restored['revision'] - 1])
        director.page.evaluate('() => KSMTest.app.saveNow()')
        director.wait_for(lambda: director.page.evaluate("() => localStorage.getItem('ksm.cloud.outbox.v3_15:gone-tab') === null") and restore_recoveries(director, tid),
                          message="the closed tab's work kept in the recovery file")
        director.wait_idle()
        kept = restore_recoveries(director, tid)
        assert kept[-1]['outbox'].get('adoptedFrom') == 'gone-tab' and kept[-1]['outbox']['payload']['setup']['tName'] == 'Closed tab edit', {k: v for k, v in kept[-1]['outbox'].items() if k != 'payload'}
        assert director.page.evaluate('() => KSMTest.app.readOutbox()') is None
        current = fetch_record(base, tid)
        assert current['payload']['state']['allMatches'] == before_matches and current['payload']['setup']['tName'] != 'Closed tab edit', current['payload']['setup']
        assert director.page.evaluate('() => KSMTest.app.tournamentPayload().setup.tName') != 'Closed tab edit'

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

        # An undo confirmed before a newer regenerate landed is refused: the newer one is not undone.
        confirmed = status(base, tid)['restorePoint']
        assert confirmed and confirmed['id'], confirmed
        def newer_regenerate(route):
            record = fetch_record(base, tid)
            regenerate_put(base, tid, record['payload'], record['revision'], 'newer-regenerate')
            route.continue_()
        director.page.route('**/restore-point', newer_regenerate)
        director.expect_dialog('Undo regenerate?', accept=True)
        director.expect_dialog('The regenerate to undo has changed', accept=True)
        director.seen_dialogs.clear()
        revision_before = fetch_record(base, tid)['revision']
        undo.click()
        seen = director.wait_for_dialogs(2)
        assert seen[1].startswith('The regenerate to undo has changed'), seen
        director.page.unroute('**/restore-point')
        assert fetch_record(base, tid)['revision'] == revision_before + 1, 'the refused undo wrote a revision'
        assert status(base, tid)['restorePoint']['id'] == 'newer-regenerate'
        director.wait_for(lambda: undo.count() == 1 and undo.is_enabled(), message='Undo regenerate still offered (the newer point)')
        # Recovery copies are capped (3 per tournament, 5 in all, 1,000,000 characters) and trimmed before a
        # new one is written; one too large is refused. They never make the queue itself fail.
        d = director.page
        d.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('ksm.cloud.recovery.v3_15:restore:')).forEach(k => localStorage.removeItem(k))")
        own = d.evaluate("(tid) => { for (let n = 0; n < 4; n++) KSMTest.app.ksmKeepRestoreRecovery(tid, 9, {n}); return KSMTest.app.ksmRestoreRecoveries(tid).map(r => r.n); }", tid)
        assert own == [1, 2, 3], own
        caps = d.evaluate("""() => { const A = KSMTest.app, big = 'x'.repeat(600000);
          for (let n = 0; n < 3; n++) A.ksmKeepRestoreRecovery('other-' + n, 9, {n});
          const b1 = A.ksmKeepRestoreRecovery('big-1', 9, {big}), b2 = A.ksmKeepRestoreRecovery('big-2', 9, {big});
          const huge = A.ksmKeepRestoreRecovery('huge', 9, {big: 'x'.repeat(1000001)});
          const keys = Object.keys(localStorage).filter(k => k.startsWith('ksm.cloud.recovery.v3_15:restore:'));
          return {count: keys.length, chars: keys.reduce((sum, k) => sum + localStorage.getItem(k).length, 0), b1: !!b1, b2Kept: !!b2 && localStorage.getItem(b2) !== null, huge}; }""")
        assert caps['count'] <= 5 and caps['chars'] <= 1000000 and caps['b1'] and caps['b2Kept'] and caps['huge'] is None, caps
        d.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('ksm.cloud.recovery.v3_15:restore:')).forEach(k => localStorage.removeItem(k))")

        # Storage full while keeping a copy: only this tournament's older copies are given up, and only until the
        # new one fits; when it still does not fit, nothing is deleted.
        trims = d.evaluate("""(tid) => { const A = KSMTest.app, P = 'ksm.cloud.recovery.v3_15:restore:', original = Storage.prototype.setItem;
          const restoreKeys = () => Object.keys(localStorage).filter(k => k.startsWith(P));
          const a = A.ksmKeepRestoreRecovery(tid, 9, {n: 'a'}), b = A.ksmKeepRestoreRecovery(tid, 9, {n: 'b'}), c = A.ksmKeepRestoreRecovery('other', 9, {n: 'c'});
          let limit = 0; const before = new Set([a, b, c]);  // copies put back always fit again
          Storage.prototype.setItem = function (k, v) { if (String(k).startsWith(P) && !before.has(k) && restoreKeys().length >= limit) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); };
          try {
            limit = 0;  // never fits
            const none = A.ksmKeepRestoreRecovery(tid, 9, {n: 'never'});
            const allKept = [a, b, c].every(k => localStorage.getItem(k) !== null) && restoreKeys().length === 3;
            limit = 2;  // fits once two of the three older copies are gone
            const fits = A.ksmKeepRestoreRecovery(tid, 9, {n: 'd'});
            return {none, allKept, fits: !!fits, a: localStorage.getItem(a) !== null, b: localStorage.getItem(b) !== null, c: localStorage.getItem(c) !== null, own: A.ksmRestoreRecoveries(tid).map(r => r.n)};
          } finally { Storage.prototype.setItem = original; restoreKeys().forEach(k => localStorage.removeItem(k)); } }""", tid)
        assert trims == {'none': None, 'allKept': True, 'fits': True, 'a': False, 'b': False, 'c': True, 'own': ['d']}, trims

        # A court's work dropped by an undo while its copy cannot be kept is parked (not cleared, never sent) and
        # the director downloads it with a tap.
        director.wait_idle()
        d.evaluate("""() => { const original = Storage.prototype.setItem; window.__ksmSetItem = original;
          Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('ksm.cloud.recovery.v3_15')) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); }; }""")
        d.evaluate("() => { const p = KSMTest.app.tournamentPayload(); p.setup.tName = 'Parked edit'; KSMTest.app.writeOutbox(p, 'Before the undo'); }")
        d.evaluate("(record) => window.dispatchEvent(new CustomEvent('ksm:superseded-by-restore', {detail: {record}}))", fetch_record(base, tid))
        d.evaluate("() => { Storage.prototype.setItem = window.__ksmSetItem; }")
        parked = """(tid) => Object.keys(localStorage).filter(k => k.startsWith(`ksm.cloud.restore-parked.v1:${tid}:`)).map(k => JSON.parse(localStorage.getItem(k)))"""
        rows = d.evaluate(parked, tid)
        assert len(rows) == 1 and rows[0]['outbox']['payload']['setup']['tName'] == 'Parked edit', rows
        assert d.evaluate('() => KSMTest.app.readOutbox()') is None, 'the parked work is still queued'
        offer = d.locator('[data-testid="toast-download-recovery"]')
        offer.wait_for()
        with d.expect_download() as download:
            offer.click()
        with open(download.value.path()) as f:
            pack = json.load(f)
        assert [r['outbox']['payload']['setup']['tName'] for r in pack.get('parkedBeforeRestore') or []] == ['Parked edit'], pack.get('parkedBeforeRestore')
        # A later save neither sends nor clears it.
        d.evaluate('() => KSMTest.app.saveNow()')
        director.wait_idle()
        assert fetch_record(base, tid)['payload']['setup']['tName'] != 'Parked edit'
        assert len(d.evaluate(parked, tid)) == 1
        d.evaluate("(tid) => Object.keys(localStorage).filter(k => k.startsWith(`ksm.cloud.restore-parked.v1:${tid}:`)).forEach(k => localStorage.removeItem(k))", tid)

        # Storage full for recovery copies: the offline queue still writes, and a closed tab's work from before
        # the undo is not dropped (it stays queued) until its copy can be kept.
        director.wait_idle()
        d.evaluate("""() => { const original = Storage.prototype.setItem; window.__ksmSetItem = original;
          Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('ksm.cloud.recovery.v3_15')) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); }; }""")
        queued = d.evaluate("() => { KSMTest.app.writeOutbox(KSMTest.app.tournamentPayload(), 'Full storage'); const o = KSMTest.app.readOutbox(); KSMTest.app.clearOutbox(); return o && o.actions[0].reason; }")
        assert queued == 'Full storage', queued
        orphan = d.evaluate("() => { const p = KSMTest.app.tournamentPayload(); p.setup.tName = 'Closed tab edit 2'; return p; }")
        d.evaluate("""([tid, payload, base]) => localStorage.setItem('ksm.cloud.outbox.v3_15:gone-tab-2', JSON.stringify({schemaVersion: '1.0',
          tournamentId: tid, role: 'staff', baseRevision: base, payload, actions: [{type: 'snapshot', reason: 'Closed tab', createdAt: new Date().toISOString()}],
          queuedAt: new Date().toISOString(), writer: 'gone-tab-2'}))""", [tid, orphan, restored['revision'] - 1])
        held = """() => Object.keys(localStorage).filter(k => k.startsWith('ksm.cloud.outbox.v3_15')).some(k => { try { return JSON.parse(localStorage.getItem(k)).payload.setup.tName === 'Closed tab edit 2'; } catch (_) { return false; } })"""
        d.evaluate("""() => { window.__ksmFullNotices = 0; new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes)
          if (n.dataset?.testid === 'toast-download-recovery') window.__ksmFullNotices++; }).observe(document.body, {subtree: true, childList: true}); }""")
        d.evaluate('() => KSMTest.app.saveNow()')
        d.wait_for_timeout(1500)  # not wait_idle: the held work keeps the device unsaved, by design
        d.evaluate('() => KSMTest.app.saveNow()')  # a retry of the same queued work: no second notice
        d.wait_for_timeout(1500)
        assert d.evaluate('() => window.__ksmFullNotices') == 1, d.evaluate('() => window.__ksmFullNotices')
        assert d.evaluate(held), "the closed tab's work was dropped although its recovery copy could not be kept"
        assert restore_recoveries(director, tid) == []
        assert fetch_record(base, tid)['payload']['setup']['tName'] != 'Closed tab edit 2'
        d.evaluate("() => { Storage.prototype.setItem = window.__ksmSetItem; }")
        d.evaluate('() => KSMTest.app.saveNow()')
        director.wait_for(lambda: not d.evaluate(held) and restore_recoveries(director, tid), message="the closed tab's work kept once there is room")
        assert restore_recoveries(director, tid)[-1]['outbox']['payload']['setup']['tName'] == 'Closed tab edit 2'
        assert fetch_record(base, tid)['payload']['setup']['tName'] != 'Closed tab edit 2'
        director.wait_idle()

        size = len(json.dumps(fetch_record(base, tid)))
        print(f'     record size {size} bytes (the restore point holds one more copy)')

        assert not problems, problems
        browser.close()
    print('PASS undo regenerate: warning line, Danger zone, court device, offline mark, spectator, local-only')


if __name__ == '__main__':
    main()
