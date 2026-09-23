"""Reloading a device opened from a tournament link (finding F1, docs/ROADMAP.md).

Against a throwaway `wrangler dev`:
  * a Court A TV and a spectator reload: no "Restore autosaved tournament?" prompt,
    they load the cloud copy and keep following the court;
  * a Court A scorekeeper whose save failed (outbox) reloads while Court B keeps
    scoring: no prompt, the queued work survives the read-only reload and is
    merged into the cloud copy once staff logs in again;
  * a Court A scorekeeper reloads right after scoring, before the debounced save
    ran: the point is queued at unload and reaches the cloud after login;
  * a device opened without a tournament link still offers the local autosave.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker

PROMPT = 'Restore autosaved tournament?'


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def match(record, division, white, red):
    for m in record['payload']['state']['allMatches'][division]:
        if m.get('white') == white and m.get('red') == red:
            return m
    raise AssertionError(f'{division}: no match {white} vs {red}')


def points(record, division, m):
    got = match(record, division, m['white'], m['red'])
    return got.get('wp'), got.get('rp')


def wait_record(app, base, tid, check, message):
    """Poll the cloud copy until check(record) holds (no fixed sleeps: the last save may
    still be in flight on a loaded machine) and return that record."""
    return app.wait_for(lambda: (lambda r: r if check(r) else None)(fetch_record(base, tid)), timeout=20, message=message)


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Reload Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Court A Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('A', 3)},
            {'name': 'Court B Open', 'format': 'Round Robin', 'court': 'B', 'entrants': people('B', 3)},
        ])
        director.save_now()
        director.wait_idle()

        # --- TV and spectator: reload shows no prompt and the cloud copy --------------------
        tv = KsmApp.open_device(browser, base, 'TV', problems, f'/?role=spectator&tournament={tid}&court=A&view=tv',
                                viewport={'width': 1600, 'height': 900})
        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, f'/?tournament={tid}')
        for device in (tv, spectator):
            device.wait_generated()
            assert device.has_autosave(), f'{device.name}: expected a local autosave (what the prompt used to offer)'
            device.expect_dialog(PROMPT)
            device.reload()
            device.wait_generated()
            assert not device.seen_dialogs, f'{device.name}: reload asked {device.seen_dialogs}'
        tv.wait_for(lambda: tv.tv_screen()['live'] and tv.tv_screen()['white'], message='TV to show the Court A match')
        spectator.page.wait_for_selector('[data-testid="live-scores"]')

        # --- Court A scorekeeper: failed save, reload, Court B scores meanwhile -------------
        court_a = KsmApp.open_device(browser, base, 'Court A', problems, f'/?tournament={tid}&court=A')
        court_b = KsmApp.open_device(browser, base, 'Court B', problems, f'/?tournament={tid}&court=B')
        for app, c in ((court_a, 'A'), (court_b, 'B')):
            app.wait_generated()
            app.staff_login()
            app.open_court(c)
            app.expect_dialog(PROMPT)
        first_a = court_a.current_match()
        first_b = court_b.current_match()

        is_put = lambda route: route.abort() if route.request.method == 'PUT' else route.continue_()
        court_a.page.route('**/api/tournaments/**', is_put)
        court_a.score_point('W', 'M')
        court_a.wait_for(court_a.outbox, message='the failed save to be queued')
        assert court_a.outbox()['role'] == 'staff', court_a.outbox()
        court_a.page.unroute('**/api/tournaments/**', is_put)

        court_a.reload()
        court_a.wait_generated()
        assert not court_a.seen_dialogs, f'Court A: reload asked {court_a.seen_dialogs}'
        # Court B saves while Court A is a read-only device: the queued work must survive it.
        court_b.score_point('R', 'K')
        court_b.wait_idle()
        court_a.wait_revision(fetch_record(base, tid)['revision'])
        assert court_a.outbox(), 'Court A: queued work was dropped while logged out'

        # Slow network: the scorekeeper opens the court and scores while the flush is in flight.
        court_a.page.evaluate("""() => { const f = window.fetch; window.fetch = (u, o) =>
          o && o.method === 'PUT' ? new Promise(r => setTimeout(r, 1500)).then(() => f(u, o)) : f(u, o); }""")
        court_a.staff_login()
        court_a.open_court('A')
        court_a.score_point('R', 'D')
        court_a.wait_for(lambda: not court_a.outbox(), message='the queued work to be flushed')
        court_a.wait_idle()
        record = wait_record(court_a, base, tid, lambda r: points(r, 'Court A Open', first_a) == (['M'], ['D']),
                             'the cloud copy to hold Court A M / D')
        got = match(record, 'Court A Open', first_a['white'], first_a['red'])
        assert (got.get('wp'), got.get('rp')) == (['M'], ['D']), f'Court A points lost: {got.get("wp")} / {got.get("rp")}'
        assert match(record, 'Court B Open', first_b['white'], first_b['red']).get('rp') == ['K'], 'Court B point lost'
        court_a.wait_for(lambda: (court_a.court_screen()['white_points'], court_a.court_screen()['red_points']) == ('M', 'D'),
                         message='Court A screen to show its points')

        # --- Reload before the debounced save ran: the point is queued at unload ------------
        court_a.score_point('W', 'K')
        court_a.reload()
        court_a.wait_for(court_a.outbox, message='the unload queue to be restored')
        assert court_a.outbox()['reason'] == 'Unsynced changes at page unload', court_a.outbox()
        assert not court_a.seen_dialogs, f'Court A: reload asked {court_a.seen_dialogs}'
        court_a.staff_login()
        court_a.open_court('A')
        court_a.wait_for(lambda: not court_a.outbox(), message='the unload queue to be flushed')
        court_a.wait_idle()
        record = wait_record(court_a, base, tid, lambda r: points(r, 'Court A Open', first_a) == (['M', 'K'], ['D']),
                             'the cloud copy to hold Court A M K / D')
        got = match(record, 'Court A Open', first_a['white'], first_a['red'])
        assert (got.get('wp'), got.get('rp')) == (['M', 'K'], ['D']), f'Court A points: {got.get("wp")} / {got.get("rp")}'
        assert match(record, 'Court B Open', first_b['white'], first_b['red']).get('rp') == ['K'], 'Court B point lost'
        for device in (court_b, tv, spectator):
            device.wait_revision(record['revision'])
        tv.wait_for(lambda: tv.tv_screen()['white'] == first_a['white'], message='TV to still follow Court A')

        # --- Without a tournament link the local autosave is still offered -------------------
        home = KsmApp(director.page.context.new_page(), 'Home', problems)
        home.expect_dialog(PROMPT)
        home.page.on('dialog', home._on_dialog)
        home.page.goto(base + '/', wait_until='domcontentloaded')
        home.page.wait_for_function('window.KSMTest && KSMTest.booted()')
        assert home.seen_dialogs, 'a plain start with a local autosave no longer offers to restore it'

        assert not problems, '\n'.join(problems)
        print(f'PASS reload without restore prompt: TV, spectator, scorekeeper (queued + unload) in {time.time() - started:.0f}s')
        browser.close()


if __name__ == '__main__':
    main()
