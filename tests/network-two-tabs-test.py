"""N8 / F36 (#81): staff tabs of one browser keep each other's work.

Tabs share localStorage (device clientId, outbox, autosave). Before F36 one tab's save cleared
another tab's queued work, and a tab took another tab's live update for its own echo: it kept its
older copy at the new revision, and its next save overwrote the other tab's point. Each tab is now
its own writer (KSM_TAB_ID): own echo, own outbox slot, own history entries.

1. N8: tab A's saves fail (queued), tab B saves; A's queue survives, and once A can save, both
   points reach the server and both tabs (also when A saves right after B's update reached it).
2. Overwrite: A idle, B scores and saves, B's update reaches A, then A scores: B's point survives.
3. A tab closed with queued work: the next staff tab of the tournament (another court) sends it.
4. Writer ids: a tab opened with a copy of another tab's sessionStorage (a duplicated tab) and a
   reload get their own; an old client's record (writer = bare clientId) is a remote update, and
   old history entries without tabId still rebase (this device's replayed, another device's not);
   another live tab's entries are not replayed, a gone tab's are (a crashed load's cached copy).
"""
import json
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge
from ksm_app import KsmApp, app_path, fetch_record


def second_tab(a, base, tid, court, name, problems, storage=None):
    """Another tab of A's browser (same localStorage), logged in as staff on `court`."""
    page = a.page.context.new_page()
    if storage is not None:
        # What a duplicated tab starts with: a copy of the original tab's sessionStorage.
        page.add_init_script(f'for (const [k, v] of Object.entries({json.dumps(storage)})) sessionStorage.setItem(k, v);')
    tab = KsmApp(page, name, problems)
    tab.answers = dict(a.answers)
    page.on('dialog', tab._on_dialog)
    page.on('pageerror', lambda error: problems.append(f'{name}: {error}'))
    page.goto(base + app_path(tid, 'court', court), wait_until='domcontentloaded')
    page.wait_for_function('window.KSMTest && KSMTest.booted()')
    tab.wait_generated()
    if not tab.staff_session():
        tab.staff_login()
    tab.open_court(court); tab.wait_idle()
    tab.page.wait_for_function("KSMTest.pendingReason().socket === 'open'")
    return tab


def refuse_puts(app):
    def refuse(route):
        if route.request.method == 'PUT': route.abort()
        else: route.continue_()
    app.page.route(KsmApp._SAVE_URL, refuse)
    return lambda: app.page.unroute(KsmApp._SAVE_URL, refuse)


def check_both(base, tid, tabs, shown_a, shown_b, white_a, red_b):
    payload = converge(base, tid, tabs)
    assert_points(payload, 'A', shown_a, white_a, [])
    assert_points(payload, 'B', shown_b, [], red_b)
    for tab in tabs:
        assert_points(tab.payload(), 'A', shown_a, white_a, [])
        assert_points(tab.payload(), 'B', shown_b, [], red_b)


def n8_queued(browser, base, problems, a_saves_after_echo):
    tid, a, observer = two_courts(browser, base, problems, 'Two tabs after echo' if a_saves_after_echo else 'Two tabs')
    b = second_tab(a, base, tid, 'B', 'Second tab', problems)
    shown_a, shown_b = a.current_match(), b.current_match()
    allow = refuse_puts(a)
    a.score_point('W', 'M'); a.save_now()
    a.wait_for(a.outbox, message='tab A queue')
    b.score_point('R', 'K'); b.save_now(); b.wait_idle()
    b.socket_barrier(); a.socket_barrier()
    # F36: B's save cleared A's queue, and A took B's update for its own echo.
    assert a.outbox(), "B's save cleared tab A's queued work"
    assert_points(a.page.evaluate('KSMTest.app.readOutbox().payload'), 'A', shown_a, ['M'], [])
    assert_points(fetch_record(base, tid)['payload'], 'B', shown_b, [], ['K'])
    a.page.wait_for_function('!KSMTest.pendingReason().saveInFlight')
    allow()
    if a_saves_after_echo:
        a.score_point('W', 'K'); a.save_now()
        a.wait_idle()
        check_both(base, tid, [a, b, observer], shown_a, shown_b, ['M', 'K'], ['K'])
    else:
        # No new edit: the queue is retried on its own.
        a.wait_idle(timeout=60)
        check_both(base, tid, [a, b, observer], shown_a, shown_b, ['M'], ['K'])
    assert not a.outbox() and not b.outbox()
    for app in (a, b, observer): app.close()


def overwrite_idle(browser, base, problems):
    tid, a, observer = two_courts(browser, base, problems, 'Two tabs idle')
    b = second_tab(a, base, tid, 'B', 'Second tab', problems)
    shown_a, shown_b = a.current_match(), b.current_match()
    b.score_point('R', 'K'); b.save_now(); b.wait_idle()
    a.wait_revision(fetch_record(base, tid)['revision'])
    # The update from the other tab is applied, not taken for A's own echo.
    assert_points(a.payload(), 'B', shown_b, [], ['K'])
    a.score_point('W', 'M'); a.save_now(); a.wait_idle()
    check_both(base, tid, [a, b, observer], shown_a, shown_b, ['M'], ['K'])
    for app in (a, b, observer): app.close()


def closed_tab(browser, base, problems):
    tid, a, observer = two_courts(browser, base, problems, 'Closed tab')
    shown_a = a.current_match()
    shown_b = observer.current_match()
    # The other device moves on first, so A's queued work is behind the server (a rebase).
    observer.score_point('R', 'K'); observer.save_now(); observer.wait_idle()
    refuse_puts(a)
    a.score_point('W', 'M'); a.save_now()
    a.wait_for(a.outbox, message='tab A queue')
    context = a.page.context
    keep = context.new_page()  # keeps the browser context open; a plain page of the site reads its storage
    keep.goto(base + '/privacy.html', wait_until='domcontentloaded')
    answers = dict(a.answers)
    with a.page.expect_event('close'):
        a.page.close(run_before_unload=True)  # beforeunload and pagehide run, as when a tab is closed
    queued = keep.evaluate("Object.keys(localStorage).filter(k => k.startsWith('ksm.cloud.outbox.v3_15'))")
    assert len(queued) == 1, queued
    # A new tab on the other court; Staff Login there takes over and sends the closed tab's work.
    holder = KsmApp(keep, 'holder', problems)
    holder.answers = answers
    c = second_tab(holder, base, tid, 'B', 'Next tab', problems)
    c.wait_idle()
    payload = converge(base, tid, [c, observer])
    assert_points(payload, 'A', shown_a, ['M'], [])
    assert_points(payload, 'B', shown_b, [], ['K'])
    assert_points(c.payload(), 'A', shown_a, ['M'], [])
    left = keep.evaluate("Object.keys(localStorage).filter(k => k.startsWith('ksm.cloud.outbox.v3_15'))")
    assert not left, left
    for app in (c, observer): app.close()


def closed_tab_does_not_block_switching(browser, base, problems):
    """A closed staff tab left queued work for its tournament; a new tab (no Staff Login) on the Library
    can still open another tournament: that work is not this tab's, and it stays in the browser."""
    other = KsmApp.open_device(browser, base, 'Other', problems, tournament_name='Switch Target')
    other.create_tournament(); other.wait_idle(); other.close()
    a = KsmApp.open_device(browser, base, 'Staff', problems, tournament_name='Left Behind')
    a.create_tournament(); a.wait_idle()
    refuse_puts(a)
    a.page.evaluate("KSMTest.app.state.awards=[{name:'Unsent'}];KSMTest.saveNow('edit')")
    a.wait_for(a.outbox, message='tab A queue')
    t = KsmApp(a.page.context.new_page(), 'New tab', problems)
    t.page.on('dialog', t._on_dialog)
    with a.page.expect_event('close'):
        a.page.close(run_before_unload=True)
    t.page.goto(base + '/', wait_until='domcontentloaded')
    t.page.wait_for_function('window.KSMTest && KSMTest.booted()')
    t.page.get_by_text('Switch Target', exact=True).first.click()
    t.wait_for(lambda: t.page.evaluate("KSMTest.app.cloudSession.tournamentId") and 'home' not in t.visible_view(), message='Switch Target to open')
    queued = t.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith(KSMTest.app.KSM_CLOUD_OUTBOX_KEY))")
    assert len(queued) == 1, f'the closed tab\'s work must stay in the browser: {queued}'
    t.page.context.close()


def writer_ids(browser, base, problems):
    tid, a, observer = two_courts(browser, base, problems, 'Writers')
    storage = a.page.evaluate('Object.fromEntries(Object.entries(sessionStorage))')
    dup = second_tab(a, base, tid, 'A', 'Duplicated tab', problems, storage=storage)
    ids = [t.writer_id() for t in (a, dup)]
    client = a.client_id()
    assert ids[0] != ids[1] and all(i.startswith(client + '/') for i in ids), ids
    before = dup.writer_id()
    dup.reload(); dup.page.wait_for_function('window.KSMTest && KSMTest.booted()'); dup.wait_generated()
    assert dup.writer_id() != before, 'a reload kept the writer id'
    dup.page.close()
    a.wait_idle()
    # An old client of this device (writer = the bare clientId) is another writer: its update applies.
    record = fetch_record(base, tid)
    shown_b = observer.current_match()
    payload = record['payload']
    m = next(m for m in payload['state']['allMatches']['Court B Open'] if (m['white'], m['red']) == (shown_b['white'], shown_b['red']))
    m['rp'] = ['D']
    old = {**record, 'revision': record['revision'] + 1, 'updatedBy': {'role': 'staff', 'clientId': client, 'name': 'Old tab', 'court': 'B'}, 'payload': payload}
    assert a.receive(old), "an old client's update was taken for this tab's echo"
    assert_points(a.payload(), 'B', shown_b, [], ['D'])
    # Rebase: entries without tabId keep the old rule (this device's replay, another device's do not).
    result = a.page.evaluate("""(client) => {
      const app = KSMTest.app, server = {revision: 10, payload: app.tournamentPayload()};
      const local = app.tournamentPayload(), div = 'Court A Open';
      const at = i => ['allMatches', div, 0, 'wp'];
      const entry = (who, tab, when) => ({format: 'patch-v1', label: 'Point', court: 'A', when, clientId: who,
        ...(tab ? {tabId: tab} : {}), revision: 10, patches: [{path: at(0), before: [], after: ['M']}]});
      local.state.allMatches[div][0].wp = ['M'];
      local.state.courtActionHistory = {A: [entry(client, '', '2030-01-01T00:00:00.000Z')], B: []};
      const legacy = app.rebaseLocalPayloadOnRecord(local, server, 10).state.allMatches[div][0].wp;
      local.state.courtActionHistory.A = [entry('other-device', '', '2030-01-01T00:00:00.000Z')];
      const other = app.rebaseLocalPayloadOnRecord(local, server, 10).state.allMatches[div][0].wp;
      // Another tab of this device: its entries only while it is alive (its heartbeat); a gone tab's are replayed
      // (a crashed earlier load of this tab whose cached copy still holds them).
      localStorage.setItem('ksm.tab.alive.v1:another-tab', String(Date.now()));
      local.state.courtActionHistory.A = [entry(client, 'another-tab', '2030-01-01T00:00:00.000Z')];
      const tab = app.rebaseLocalPayloadOnRecord(local, server, 10).state.allMatches[div][0].wp;
      localStorage.removeItem('ksm.tab.alive.v1:another-tab');
      const gone = app.rebaseLocalPayloadOnRecord(local, server, 10).state.allMatches[div][0].wp;
      return {legacy, other, tab, gone, server: server.payload.state.allMatches[div][0].wp};
    }""", client)
    assert result['legacy'] == ['M'] and result['gone'] == ['M'], result
    assert result['other'] == result['server'] and result['tab'] == result['server'], result
    for app in (a, observer): app.close()


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        n8_queued(browser, base, problems, a_saves_after_echo=False); print('PASS N8: both tabs\' queued points reach the server and both tabs')
        n8_queued(browser, base, problems, a_saves_after_echo=True); print('PASS N8: A saves after B\'s update reached it, B\'s point survives')
        overwrite_idle(browser, base, problems); print('PASS F36: an idle tab applies the other tab\'s update; its next save keeps that point')
        closed_tab(browser, base, problems); print('PASS F36: a closed tab\'s queued work is sent by the next staff tab (other court)')
        closed_tab_does_not_block_switching(browser, base, problems); print('PASS F36: a closed tab\'s queued work does not keep another tab from switching tournaments')
        writer_ids(browser, base, problems); print('PASS F36: own writer per tab, duplicate and reload; old clients and old entries')
        assert not problems, problems
        browser.close()

if __name__ == '__main__': main()
