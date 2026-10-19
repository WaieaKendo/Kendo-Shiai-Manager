"""Boot never opens a restore dialog; only local drafts have explicit Library recovery."""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        a = KsmApp.open_device(browser, base, 'Drafts', problems)
        tid = a.create_tournament(); a.wait_idle()
        payload = a.page.evaluate('tournamentPayload()')
        a.goto('/')
        def no_dialog(dialog):
            problems.append('Unexpected boot dialog: ' + dialog.message)
            dialog.dismiss()
        a.page.on('dialog', no_dialog)
        a.reload()
        assert a.page.get_by_test_id('local-draft').count() == 0
        # Start with a local-only autosave, without a persisted cloud identity.
        a.page.evaluate('''payload=>{
          disconnectCloudSocket();sessionStorage.clear();
          cloudSession.tournamentId=null;persistCloudSession();
          payload.setup.tName='Local draft';
          localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(payload));
          document.body.classList.add('ksm-home');
        }''', payload)
        a.reload()
        draft = a.page.get_by_test_id('local-draft')
        assert draft.is_visible() and 'Local draft' in draft.inner_text()
        draft.get_by_role('button', name='Open', exact=True).click()
        a.wait_for(lambda: a.visible_view() == ['setup'], message='draft opened')
        assert a.page.evaluate('tName.value') == 'Local draft'
        a.goto('/')
        draft = a.page.get_by_test_id('local-draft')
        assert draft.is_visible()
        draft.get_by_role('button', name='Discard', exact=True).click()
        draft.get_by_role('button', name='Cancel', exact=True).click()
        assert a.page.evaluate('Boolean(localStorage.getItem(KSM_SAVE_KEY))')
        a.page.evaluate("localStorage.setItem(KSM_CLOUD_OUTBOX_KEY, JSON.stringify({sentinel:'keep'}))")
        draft.get_by_role('button', name='Discard', exact=True).click()
        draft.get_by_role('button', name='Discard draft', exact=True).click()
        assert draft.count() == 0
        assert not a.page.evaluate('localStorage.getItem(KSM_SAVE_KEY)')
        assert a.page.evaluate('readOutbox().sentinel') == 'keep'
        a.page.evaluate('localStorage.removeItem(KSM_CLOUD_OUTBOX_KEY)')
        a.page.evaluate('(payload)=>localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(payload))', payload)
        a.goto(f'/?spectator={tid}')
        assert a.page.get_by_test_id('local-draft').count() == 0
        assert not problems, problems
        browser.close()
    print('PASS no boot restore prompts: cloud ignored, draft Open, inline Discard, spectator skipped')


if __name__ == '__main__': main()
