"""Admin invitation, creator/owner creation, director editing and mobile access UI."""
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from ksm_browser import launch_chromium, install_test_api
from ksm_server import local_worker
ROOT = Path(__file__).resolve().parents[1]

def main():
    mock = subprocess.Popen(['node', str(ROOT / 'tests/lib/mock-auth0.mjs')], cwd=ROOT, stdout=subprocess.PIPE, text=True)
    try:
        config = json.loads(mock.stdout.readline())
        variables = {'AUTH0_DOMAIN': config['issuer'], 'AUTH0_AUDIENCE': config['audience'], 'AUTH0_CLIENT_ID': config['clientId'], 'ADMIN_EMAILS': 'admin@example.com'}
        with local_worker(variables=variables) as base, sync_playwright() as p:
            browser = launch_chromium(p)
            def device(email, width=1280):
                context = browser.new_context(viewport={'width': width, 'height': 850}, permissions=['clipboard-read', 'clipboard-write'])
                page = context.new_page()
                install_test_api(page)
                page.goto(base)
                page.get_by_test_id('library-sign-in').click()
                page.get_by_label('Email', exact=True).fill(email)
                page.get_by_role('button', name='Continue', exact=True).click()
                page.wait_for_url(base + '/')
                expect(page.get_by_test_id('library-account')).to_contain_text(email)
                return context, page
            admin_context, admin = device('admin@example.com', 375)
            admin.get_by_test_id('library-people').click()
            dialog = admin.get_by_test_id('people-access')
            expect(dialog).to_be_visible()
            admin_row = dialog.get_by_test_id('person-row').filter(has_text='admin@example.com')
            expect(admin_row).to_contain_text('from server settings')
            expect(admin_row.get_by_role('button')).to_have_count(0)
            dialog.get_by_test_id('people-email').fill('creator@example.com')
            dialog.get_by_role('button', name='Give access', exact=True).click()
            invite = dialog.get_by_test_id('pending-invite').filter(has_text='creator@example.com')
            expect(invite).to_contain_text('Creator')
            invite.get_by_role('button', name='Copy invite message').click()
            expect(dialog.get_by_role('status')).to_contain_text('Invite message copied')
            assert admin.evaluate('navigator.clipboard.readText()') == f"You've been given access to KSM. Sign in at {base}/ with creator@example.com."
            assert admin.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert dialog.evaluate('(el)=>el.scrollWidth <= el.clientWidth + 1')
            admin.screenshot(path='/private/tmp/ksm-131-people-mobile.png', full_page=True)
            dialog.get_by_role('button', name='Close People & access').click()
            creator_context, creator = device('creator@example.com')
            expect(creator.get_by_test_id('library-account')).to_contain_text('Creator')
            expect(creator.get_by_test_id('library-load-file')).to_be_visible()
            expect(creator.get_by_test_id('library-people')).to_have_count(0)
            prompts = []
            def create_prompt(dialog):
                prompts.append(dialog.message)
                assert 'password' not in dialog.message.lower()
                dialog.accept('Creator Cup' if dialog.message == 'Tournament Name' else 'creator-cup')
            creator.on('dialog', create_prompt)
            creator.get_by_test_id('home-new-tournament').click()
            expect(creator.get_by_test_id('account-role')).to_contain_text('Owner · Creator Cup')
            expect(creator.get_by_test_id('setup-tournament-name')).to_have_value('Creator Cup')
            creator.remove_listener('dialog', create_prompt)
            assert len(prompts) == 2
            tid = creator.evaluate('window.ksmAuthBridge.tournament()')
            panel = creator.get_by_test_id('tournament-access')
            expect(panel.get_by_text('creator@example.com', exact=True)).to_be_visible()
            # Inline review errors are surfaced without a stale optimistic role change.
            panel.get_by_test_id('access-email').fill('creator@example.com')
            panel.get_by_role('button', name='Add access', exact=True).click()
            expect(panel.get_by_role('alert')).to_have_text('Already an owner')
            panel.get_by_role('button', name='Remove owner creator@example.com', exact=True).click()
            expect(panel.get_by_role('alert')).to_contain_text('last owner')
            panel.get_by_test_id('access-email').fill('director@example.com')
            panel.get_by_role('button', name='Add access', exact=True).click()
            expect(panel).to_contain_text('Pending invite')
            expect(panel.get_by_text('director@example.com', exact=True)).to_be_visible()
            director_context, director = device('director@example.com', 375)
            director.goto(base + f'/t/{tid}/setup')
            expect(director.get_by_test_id('account-role')).to_contain_text('Director · Creator Cup')
            read_only = director.get_by_test_id('tournament-access')
            expect(read_only.get_by_test_id('access-read-only')).to_be_visible()
            expect(read_only.get_by_role('button')).to_have_count(0)
            expect(read_only.get_by_text('creator@example.com', exact=True)).to_be_visible()
            assert director.evaluate('document.documentElement.scrollWidth <= innerWidth')
            # Edit a real setup field and save through the same permission path.
            with director.expect_response(lambda response: response.request.method == 'PUT' and response.url == base + f'/api/tournaments/{tid}' and response.status == 200) as saved:
                director.get_by_test_id('setup-tournament-name').fill('Directed Cup')
                director.get_by_test_id('setup-tournament-name').blur()
            assert saved.value.json()['payload']['setup']['tName'] == 'Directed Cup'
            creator.goto(base)
            expect(creator.get_by_test_id('library-account')).to_contain_text('Creator')
            expect(creator.get_by_text('Owner · Directed Cup', exact=True)).to_be_visible()
            admin.reload()
            admin.get_by_test_id('library-people').click()
            dialog = admin.get_by_test_id('people-access')
            person = dialog.get_by_test_id('person-row').filter(has_text='creator@example.com')
            expect(person).to_contain_text('Creator')
            expect(person).to_contain_text('Owner · Directed Cup')
            expect(dialog.get_by_test_id('pending-invite').filter(has_text='creator@example.com')).to_have_count(0)
            # Remove global roles and confirm removal from everything in the admin UI.
            person.get_by_role('button', name='Remove Creator from creator@example.com').click()
            expect(person).to_contain_text('No global roles')
            director_person = dialog.get_by_test_id('person-row').filter(has_text='director@example.com')
            admin.once('dialog', lambda d: d.accept())
            director_person.get_by_role('button', name='Remove director@example.com from everything').click()
            expect(director_person).not_to_contain_text('Directed Cup')
            admin.screenshot(path='/private/tmp/ksm-131-people-mobile-after.png', full_page=True)
            dialog.get_by_role('button', name='Close People & access').click()
            admin.goto(base + f'/t/{tid}/setup')
            expect(admin.get_by_test_id('account-role')).to_contain_text('Admin')
            admin.locator('.ksm-account-menu > summary').click()
            admin.get_by_role('button', name='People & access', exact=True).click()
            expect(admin.get_by_test_id('people-access')).to_be_visible()
            # Invalid authentication leaves public library rows available and prompts sign-in.
            admin.get_by_test_id('people-access').get_by_role('button', name='Close People & access').click()
            admin.goto(base)
            admin.route('**/api/tournaments', lambda route: route.fulfill(status=200,headers={'x-ksm-auth':'invalid'},json=[]))
            admin.evaluate('window.ksmAuthBridge.library()')
            expect(admin.get_by_test_id('library-sign-in')).to_have_text('Sign in again')
            expect(admin.get_by_test_id('home-new-tournament')).to_have_count(0)
            expect(admin.get_by_test_id('library-people')).to_have_count(0)
            for context in [admin_context, creator_context, director_context]:
                context.close()
            browser.close()
        print('PASS admin invites creator, creator owns new tournament, director edits with read-only access, People at 375px, protections and invalid-auth prompt')
    finally:
        mock.terminate()
        mock.wait(timeout=10)

if __name__ == '__main__':
    main()
