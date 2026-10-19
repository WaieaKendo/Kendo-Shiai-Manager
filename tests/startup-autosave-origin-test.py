"""#77: classify legacy autosaves at load, and tag recovery/cloud creation."""
import json
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, API_JS
from ksm_browser import launch_chromium
from ksm_server import local_worker


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        source = KsmApp.open_device(browser, base, 'Source', problems, tournament_name='Legacy origin')
        tid = source.create_tournament(); source.wait_idle()
        for cloud in (True, False):
            fixture = source.page.evaluate('cloud=>KSMTest.legacyFixture(cloud)', cloud)
            def seed(page):
                page.add_init_script(API_JS+'\nKSMTest.seedLegacy('+json.dumps(fixture)+')')
            app = KsmApp.open_device(browser, base, f'Legacy {cloud}', problems, before_load=seed)
            if cloud:
                # The migration runs before navigation/home can clear the persisted session.
                assert tid in app.page.evaluate('KSMTest.originWrites()'), 'legacy cloud autosave was not classified before startup reset'
                assert app.page.get_by_test_id('local-draft').count() == 0
            else:
                assert app.page.get_by_test_id('local-draft').is_visible()
                assert 'Legacy origin' in app.page.get_by_test_id('local-draft').inner_text()
            app.close()
        # A recovery load first saves a local origin; cloud creation then tags that autosave.
        _, recovery = source.download('nav-download-recovery', menu='nav-save-load')
        source.wait_idle()
        local = source
        local.expect_dialog('Load this recovery file as a new tournament?', accept=True)
        local.load_recovery_file(recovery)
        local.wait_for(lambda: local.page.get_by_test_id('save-status').inner_text() == 'Recovery file loaded',
                       message='recovery loaded locally')
        assert local.page.evaluate('KSMTest.autosaveOrigin()') == ''
        assert local.tournament_id() is None
        # Freeze debounced autosaves: otherwise a later local write could hide a missing
        # creation-time tag by tagging the autosave after the cloud ID already exists.
        local.page.clock.install(time=datetime(2026, 10, 18, 12, tzinfo=timezone.utc))
        local.page.clock.pause_at(datetime(2026, 10, 18, 12, 0, 1, tzinfo=timezone.utc))
        local.save_now()
        local.wait_for(local.tournament_id, message='recovery cloud creation')
        local.page.wait_for_function('!KSMTest.pendingReason().saveInFlight')
        assert local.page.evaluate('KSMTest.autosaveOrigin()') == local.tournament_id()
        local.page.clock.resume(); local.wait_idle()
        assert not problems, problems
        browser.close()
    print('PASS legacy, recovery and cloud autosave origins')

if __name__ == '__main__': main()
