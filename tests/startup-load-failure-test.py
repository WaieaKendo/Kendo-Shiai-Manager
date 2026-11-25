"""Startup failures retain the tab's staff session and queued work until Retry succeeds."""
import os
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        for failure, cached in [('503', True), ('abort', True), ('503', False)]:
            case = f'{failure}-{cached}'
            if os.environ.get('KSM_STARTUP_CASE') and os.environ['KSM_STARTUP_CASE'] != case: continue
            a = KsmApp.open_device(browser, base, failure, problems, tournament_name=f'Startup {failure} {cached}')
            tid = a.create_tournament(); a.wait_idle()
            token = a.staff_session()
            a.page.on('dialog', lambda dialog: problems.append('Unexpected startup dialog: '+dialog.message))
            # Block saves without emitting an offline event (navigator.onLine stays true).
            endpoint = f'**/api/tournaments/{tid}'
            def blocked(route):
                if route.request.method == 'GET':
                    if failure == 'abort': route.abort()
                    else: route.fulfill(status=503, body='Unavailable')
                elif route.request.method == 'PUT': route.abort()
                else: route.continue_()
            a.page.route(endpoint, blocked)
            a.page.evaluate("KSMTest.app.state.awards=[{name:'Keep this work'}];KSMTest.app.criticalAutoSave('Queue recovery')")
            a.wait_for(a.outbox, message='work queued')
            queued = a.page.evaluate('KSMTest.app.readOutbox().payload.state')
            if not cached:
                a.page.evaluate('(id)=>localStorage.removeItem("ksm.tournament.record:"+id)', tid)
            a.reload()
            assert a.page.locator('#startupLoadFailure').is_visible()
            if cached:
                assert a.page.evaluate('KSMTest.app.state.awards[0].name') == 'Keep this work'
            else:
                assert a.visible_view() == []
            assert 'home' not in a.visible_view()
            assert a.staff_session() == token
            assert a.page.evaluate('KSMTest.role()') == 'staff'
            assert a.page.get_by_role('button', name='Logout', exact=True).is_visible()
            assert a.page.evaluate('KSMTest.app.readOutbox().payload.state') == queued
            if not cached:
                retry = a.page.locator('#startupLoadFailure').get_by_role('button', name='Retry', exact=True)
                retry.click()
                a.wait_for(lambda: retry.is_enabled(), message='failed Retry completed')
                a.reload()
                assert a.page.evaluate('KSMTest.app.readOutbox().payload.state') == queued
            a.page.unroute(endpoint, blocked)
            a.page.locator('#startupLoadFailure').get_by_role('button', name='Retry', exact=True).click()
            a.wait_for(lambda: not a.page.locator('#startupLoadFailure').count() and not a.outbox(), message='Retry and queue flush')
            assert fetch_record(base, tid)['payload']['state']['awards'][0]['name'] == 'Keep this work'
            assert a.staff_session() == token
            a.socket_barrier()
            a.close()
        for status in (404, 410):
            a = KsmApp.open_device(browser, base, str(status), problems, tournament_name=f'Gone {status}')
            tid = a.create_tournament(); a.wait_idle()
            a.page.on('dialog', lambda dialog: problems.append('Unexpected startup dialog: '+dialog.message))
            a.page.route(f'**/api/tournaments/{tid}', lambda route: route.fulfill(status=status, body='Not found') if route.request.method == 'GET' else route.continue_())
            a.reload()
            assert a.visible_view() == ['home']
            assert not a.staff_session()
            assert not a.page.locator('#startupLoadFailure').count()
        assert not problems, problems
        browser.close()
    print('PASS startup load recovery: 503, dropped request, no cache, Retry, staff, queue, 404/410')


if __name__ == '__main__': main()
