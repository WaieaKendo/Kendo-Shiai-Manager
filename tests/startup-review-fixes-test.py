"""PR #77: autosave origin, cached Retry/rebase, offline Retry and empty-screen save gates."""
import os
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker
from ksm_network import two_courts, assert_points, converge


def reject_dialogs(app, problems):
    app.page.on('dialog', lambda dialog: problems.append('Unexpected recovery dialog: '+dialog.message))


def retry_button(app):
    return app.page.locator('#startupLoadFailure').get_by_role('button', name='Retry', exact=True)


def fail_load(app, tid):
    endpoint = f'**/api/tournaments/{tid}'
    def block(route):
        if route.request.method == 'GET': route.fulfill(status=503, body='Unavailable')
        elif route.request.method == 'PUT': route.abort()
        else: route.continue_()
    app.page.route(endpoint, block)
    app.reload()
    assert app.page.locator('#startupLoadFailure').is_visible()
    return endpoint, block


def freeze(app):
    app.page.clock.install()
    app.page.clock.pause_at(datetime.now(timezone.utc)+timedelta(seconds=1))


def cloud_origin(browser, base, problems):
    a = KsmApp.open_device(browser, base, 'Origin', problems, tournament_name='Origin cloud X')
    tid = a.create_tournament(); a.wait_idle()
    # Exercise both ordinary autosaves and the cloud-load writer.
    a.page.evaluate("KSMTest.app.markLocalSave('Origin check')")
    marked_origin = a.page.evaluate('localStorage.getItem(KSMTest.app.KSM_SAVE_KEY+":cloud-id")')
    a.reload()
    loaded_origin = a.page.evaluate('localStorage.getItem(KSMTest.app.KSM_SAVE_KEY+":cloud-id")')
    reject_dialogs(a, problems)
    missing='00000000-0000-4000-8000-000000000077'
    a.page.route(f'**/api/tournaments/{missing}', lambda route: route.fulfill(status=404, body='Not found'))
    a.goto(app_path(missing))
    assert a.visible_view() == ['home']
    a.reload()
    assert a.page.get_by_test_id('local-draft').count() == 0, 'cloud autosave became a local draft after 404 and reload'
    assert marked_origin == loaded_origin == tid
    a.page.evaluate('''() => {
      KSMTest.app.cloudSession.tournamentId=null;KSMTest.app.persistCloudSession();
      document.body.classList.add('ksm-home');
      tName.value='Genuine local draft';KSMTest.app.markLocalSave('Local draft');
    }''')
    a.reload()
    assert 'Genuine local draft' in a.page.get_by_test_id('local-draft').inner_text()
    a.close()


def retry_edits(browser, base, problems):
    tid, a, b = two_courts(browser, base, problems, 'Immediate cached Retry')
    reject_dialogs(a, problems)
    endpoint, block = fail_load(a, tid)
    a.open_court('A')
    freeze(a)
    shown = a.current_match()
    a.score_point('W', 'M')
    assert not a.outbox(), 'test must click Retry before either save debounce runs'
    retry_button(a).click()
    a.wait_for(lambda: retry_button(a).is_enabled(), message='second failed Retry')
    assert_points(a.payload(), 'A', shown, ['M'], [])
    assert a.outbox(), 'Retry did not capture pending cached edits'
    a.page.unroute(endpoint, block)
    retry_button(a).click()
    a.wait_for(lambda: not a.page.locator('#startupLoadFailure').count() and not a.outbox(), message='successful Retry')
    a.page.clock.resume()
    payload = converge(base, tid, (a, b))
    assert_points(payload, 'A', shown, ['M'], [])
    for device in (a, b): assert_points(device.payload(), 'A', shown, ['M'], [])
    a.close(); b.close()


def cache_base(browser, base, problems):
    tid, a, b = two_courts(browser, base, problems, 'Cached base conflict')
    reject_dialogs(a, problems)
    endpoint, block = fail_load(a, tid)
    freeze(a)
    shown_a, shown_b = a.current_match(), b.current_match()
    a.page.evaluate("KSMTest.app.navigateTo('setup')")
    a.page.get_by_test_id('setup-host').fill('Cached host')
    a.open_court('A'); a.score_point('W', 'M')
    b.page.evaluate("KSMTest.app.navigateTo('setup')")
    b.page.get_by_test_id('setup-location').fill('Other court hall')
    b.open_court('B'); b.score_point('R', 'K'); b.save_now(); b.wait_idle()
    conflicts=[]
    a.page.on('response', lambda response: conflicts.append(response.status)
              if response.status == 409 and response.request.method == 'PUT'
              and (response.request.post_data_json or {}).get('revision', -1) >= 0 else None)
    # The failed Retry writes an outbox at the cache's original revision.
    retry_button(a).click()
    a.wait_for(lambda: retry_button(a).is_enabled(), message='cached queue captured')
    assert a.page.evaluate('Boolean(KSMTest.app.readOutbox().basePayload)'), 'cached edits have no three-way merge base'
    a.page.unroute(endpoint, block)
    retry_button(a).click()
    a.wait_for(lambda: not a.page.locator('#startupLoadFailure').count() and not a.outbox(), message='conflicting Retry flush')
    assert conflicts, 'test did not observe a save conflict'
    a.page.clock.resume()
    payload = converge(base, tid, (a, b))
    assert payload['setup']['tHost'] == 'Cached host'
    assert payload['setup']['tLocation'] == 'Other court hall'
    for device in (a, b):
        assert_points(device.payload(), 'A', shown_a, ['M'], [])
        assert_points(device.payload(), 'B', shown_b, [], ['K'])
        assert device.payload()['setup']['tHost'] == 'Cached host'
        assert device.payload()['setup']['tLocation'] == 'Other court hall'
    a.close(); b.close()


def offline_retry(browser, base, problems):
    for cached in (True, False):
        a = KsmApp.open_device(browser, base, f'Offline {cached}', problems, tournament_name=f'Offline Retry {cached}')
        tid = a.create_tournament(); a.wait_idle()
        if not cached: a.page.evaluate('(id)=>localStorage.removeItem("ksm.tournament.record:"+id)', tid)
        fail_load(a, tid)
        reject_dialogs(a, problems)
        token = a.staff_session()
        a.page.evaluate("KSMTest.app.writeOutbox(KSMTest.app.ksmStartupHasCache?KSMTest.app.tournamentPayload():JSON.parse(localStorage.getItem(KSMTest.app.KSM_SAVE_KEY)),'Existing queued work')")
        before = a.page.evaluate('KSMTest.app.readOutbox().payload.state')
        a.page.context.set_offline(True)
        retry_button(a).click()
        assert a.page.locator('#startupLoadFailure').is_visible()
        assert 'home' not in a.visible_view()
        assert a.staff_session() == token
        assert a.page.evaluate('KSMTest.app.readOutbox().payload.state') == before
        assert 'Offline' in a.page.get_by_test_id('connection-status').get_attribute('title')
        a.close()


def no_cache_saves(browser, base, problems):
    a = KsmApp.open_device(browser, base, 'Empty screen', problems, tournament_name='No cache manual saves')
    tid = a.create_tournament(); a.wait_idle()
    a.page.evaluate('(id)=>localStorage.removeItem("ksm.tournament.record:"+id)', tid)
    fail_load(a, tid)
    reject_dialogs(a, problems)
    before = a.page.evaluate('[localStorage.getItem(KSMTest.app.KSM_SAVE_KEY),localStorage.getItem(KSMTest.app.KSM_CLOUD_OUTBOX_KEY)]')
    puts = []
    a.page.on('request', lambda request: puts.append(request.url) if request.method == 'PUT' else None)
    a.page.evaluate('KSMTest.manualSave()')
    a.save_now('Critical path while empty')
    # Wait for any forbidden request to finish before asserting the storage and request log.
    a.page.wait_for_function('!KSMTest.pendingReason().saveInFlight')
    assert a.page.evaluate('[localStorage.getItem(KSMTest.app.KSM_SAVE_KEY),localStorage.getItem(KSMTest.app.KSM_CLOUD_OUTBOX_KEY)]') == before
    assert not puts, puts
    a.close()


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        for case in (cloud_origin, retry_edits, cache_base, offline_retry, no_cache_saves):
            if os.environ.get('KSM_REVIEW_CASE') and os.environ['KSM_REVIEW_CASE'] != case.__name__: continue
            case(browser, base, problems)
            assert not problems, problems
            print('PASS', case.__name__, flush=True)
        browser.close()


if __name__ == '__main__': main()
