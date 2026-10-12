"""Special awards on the Results screen are saved (finding F11, docs/ROADMAP.md).

Against a throwaway `wrangler dev`, a staff device adds, edits and removes special awards in
the Results screen's awards editor:
  * "+ Add Award" shows the new row at once and "×" removes it at once;
  * every change reaches the cloud copy without any other save (autosave), and a second device
    sees the awards;
  * no page error (the editor used to call an undefined saveAuto()).
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        app = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Awards Cup')
        tid = app.create_tournament()
        app.configure([{'name': 'Open', 'format': 'Round Robin', 'court': 'A',
                        'entrants': [{'name': f'P {i}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(3)]}])
        app.save_now()
        app.wait_idle()
        page = app.page
        app.nav('results')
        editor = page.locator('#results .results-awards-card')
        rows = lambda: editor.get_by_role('textbox', name='Award name').count()
        cloud_awards = lambda: fetch_record(base, tid)['payload']['state'].get('awards') or []

        # Add two awards: each row appears at once (the editor redraws).
        for n in (1, 2):
            editor.get_by_role('button', name='+ Add Award').click()
            app.wait_for(lambda: rows() == n, message=f'{n} award row(s) on screen')

        # Edit the second award's fields (a change is committed when the field loses focus).
        for label, value in (('Award name', 'Best Kiai'), ('Recipient name', 'Aoki Ren'), ('Dojo', 'Aiea')):
            field = editor.get_by_role('textbox', name=label).nth(1)
            field.fill(value)
            field.press('Tab')

        # Autosave carries every change to the cloud without any other save.
        want = [{'award': 'Fighting Spirit', 'name': '', 'dojo': ''}, {'award': 'Best Kiai', 'name': 'Aoki Ren', 'dojo': 'Aiea'}]
        app.wait_for(lambda: cloud_awards() == want, timeout=20, message=f'the cloud copy to hold {want}')

        # Remove the first award: the row goes at once, and the cloud copy follows.
        editor.get_by_role('button', name='Remove award').first.click()
        app.wait_for(lambda: rows() == 1, message='the removed row to disappear')
        app.wait_for(lambda: cloud_awards() == want[1:], timeout=20, message='the removal to reach the cloud')
        app.wait_idle()

        # Another device sees the awards.
        other = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        other.wait_generated()
        other.wait_for(lambda: (other.page.evaluate('state.awards') or []) == want[1:], message='the second device to see the award')

        assert not problems, '\n'.join(problems)
        print(f'PASS awards: add/remove redraw at once, edits autosave to the cloud, second device sees them ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
