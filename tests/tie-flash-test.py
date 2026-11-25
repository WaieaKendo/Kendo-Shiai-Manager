"""Tie flashes: tied scorekeeper buttons send ephemeral court-specific TV events."""
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker



def people(prefix):
    return [{'name': f'{prefix} {i}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(1, 5)]


def changed_paths(before, after, path=''):
    if isinstance(before, dict) and isinstance(after, dict):
        return [p for key in before.keys() | after.keys() for p in changed_paths(before.get(key), after.get(key), f'{path}.{key}' if path else key)]
    if isinstance(before, list) and isinstance(after, list):
        return [p for i, (a, b) in enumerate(zip(before, after)) for p in changed_paths(a, b, f'{path}[{i}]')] + ([path] if len(before) != len(after) else [])
    return [] if before == after else [path]


def stable_payload(app):
    payload = app.payload()
    payload.pop('savedAt', None)  # Generated at read time; not tournament data.
    return payload


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Tie Flash Cup')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open', 'format': 'Round Robin', 'court': 'A', 'entrants': people('A')},
            {'name': 'Elimination', 'format': 'Single Elimination', 'court': 'B', 'entrants': people('B')},
        ])
        director.save_now('tie flash setup')
        director.wait_idle()

        spectator = KsmApp.open_device(browser, base, 'Spectator', problems, app_path(tid))
        courts = {
            c: KsmApp.open_device(browser, base, f'Court {c}', problems, app_path(tid, 'court', c), clock=True)
            for c in 'AB'
        }
        # TVs run a controlled clock so five-second expiry and a repeated flash can be checked
        # without adding wall-clock sleeps. Both open as independent anonymous TV devices.
        tvs = {
            c: KsmApp.open_device(browser, base, f'TV {c}', problems, app_path(tid, 'tv', c),
                                  viewport={'width': 1920, 'height': 1080}, clock=True)
            for c in 'AB'
        }
        for app in [spectator, *courts.values(), *tvs.values()]:
            assert app.socket_barrier(), f'{app.name}: socket did not reach its ping/pong barrier'
        for tv in tvs.values():
            tv.page.clock.pause_at(datetime.now() + timedelta(milliseconds=100))  # a datetime: a bare number is seconds, not Date.now() milliseconds
        for c, court in courts.items():
            court.wait_generated()
            court.staff_login()
            court.open_court(c)
            court.wait_for(court.current_match, message=f'Court {c} match')
            court.wait_for(court.timer, message='timer mounted')
            court.timer_now = datetime.now()
            court.page.clock.set_fixed_time(court.timer_now)
            control = court.timer_control('timer-show-tv')
            assert not control['disabled'], control
            assert control['label'] == f'Show {"Encho" if c == "B" else "Hikiwake"} on TV'
            assert control['title'] == control['label']
            assert court.tie_flash_button() is None, f'Court {c}: redundant manual TV control'
            assert court.page.locator(sel('court-encho-note')).count() == 0, f'Court {c}: winner note shown at 0-0'

        courts['A'].click('timer-toggle')
        assert courts['A'].timer_control('timer-show-tv')['disabled'], 'Running clock allowed a TV banner'
        courts['A'].click('timer-toggle')
        assert not courts['A'].timer_control('timer-show-tv')['disabled'], 'Stopped tied clock blocked TV banner'

        # Manual TV controls stay absent; only tied elimination scores show the winner note.
        courts['A'].score_point('W', 'M')
        assert courts['A'].tie_flash_button() is None, 'Court A: flash control remained visible at 1-0'
        assert courts['A'].timer_control('timer-show-tv')['disabled'], 'Untied clock allowed TV banner'
        courts['A'].score_point('R', 'K')
        courts['B'].score_point('W', 'M')
        assert courts['B'].tie_flash_button() is None, 'Court B: flash control remained visible at 1-0'
        assert courts['B'].timer_control('timer-show-tv')['disabled'], 'Untied clock allowed TV banner'
        courts['B'].score_point('R', 'K')
        for c, kind in [('A', 'Hikiwake'), ('B', 'Encho')]:
            assert courts[c].tie_flash_button() is None
            assert not courts[c].timer_control('timer-show-tv')['disabled']
            note = courts[c].page.locator(sel('court-encho-note'))
            assert (note.count() == 1) == (kind == 'Encho'), f'Court {c}: wrong tied winner note'

        # A flash must not mutate state, ask for a save, change Next Match, or reach TV B from A.
        for court in courts.values():
            court.wait_idle()
        for court in courts.values():
            court.watch_saves()
        before = {c: {'payload': stable_payload(court), 'match': court.current_match(),
                      'next': court.page.locator(sel('next-match')).inner_text().strip()}
                  for c, court in courts.items()}
        courts['A'].click('timer-show-tv')
        assert courts['A'].timer_control('timer-show-tv')['disabled'], 'Button stayed enabled during banner'
        tvs['A'].wait_for(lambda: tvs['A'].tie_flash_banner(), message='Court A Hikiwake flash')
        assert tvs['B'].tie_flash_banner() is None, 'Court A flash appeared on TV B'
        banner = tvs['A'].tie_flash_banner()
        assert banner['className'].endswith('tie-flash--hikiwake') and banner['text'] == 'HIKIWAKE' \
            and banner['icon'] == 'tie-flash-icon-hikiwake', f'wrong Hikiwake banner: {banner}'
        spectator.wait_for(lambda: spectator.live_tie_flash_banner('A'), message='Live Scores Court A Hikiwake flash')
        live_banner = spectator.live_tie_flash_banner('A')
        assert live_banner['id'] == banner['id'] and live_banner['icon'] == 'tie-flash-icon-hikiwake', live_banner
        assert spectator.live_tie_flash_banner('B') is None, 'Court A flash appeared in Live Scores Court B'

        # The UI prevents a second send for the full five-second display window.
        courts['A'].page.clock.set_fixed_time(courts['A'].timer_now + timedelta(milliseconds=4900))
        courts['A'].page.clock.run_for(100)
        assert courts['A'].timer_control('timer-show-tv')['disabled'], 'Banner cooldown ended early'
        courts['A'].page.clock.set_fixed_time(courts['A'].timer_now + timedelta(seconds=5))
        courts['A'].page.clock.run_for(100)
        courts['A'].wait_for(lambda: not courts['A'].timer_control('timer-show-tv')['disabled'], message='TV button after five seconds')

        # A repeated transport event refreshes the receiver's five-second display window.
        first_id = banner['id']
        tvs['A'].page.clock.fast_forward(4000)
        courts['A'].send_tie_flash()
        tvs['A'].wait_for(lambda: (b := tvs['A'].tie_flash_banner()) and b['id'] != first_id,
                          message='a new ID for the repeated Hikiwake flash')
        repeated_id = tvs['A'].tie_flash_banner()['id']
        tvs['A'].page.clock.fast_forward(2000)
        assert tvs['A'].tie_flash_banner()['id'] == repeated_id, 'repeated flash did not refresh the display window'
        tvs['A'].page.clock.fast_forward(3000)
        tvs['A'].wait_for(lambda: tvs['A'].tie_flash_banner() is None, message='Hikiwake flash expiry')

        courts['B'].click('timer-show-tv')
        assert courts['B'].timer_control('timer-show-tv')['disabled']
        tvs['B'].wait_for(lambda: tvs['B'].tie_flash_banner(), message='Court B Encho flash')
        banner = tvs['B'].tie_flash_banner()
        assert banner['className'].endswith('tie-flash--encho') and banner['text'] == 'ENCHO' \
            and banner['icon'] == 'tie-flash-icon-encho', f'wrong Encho banner: {banner}'
        assert tvs['A'].tie_flash_banner() is None, 'Court B flash appeared on TV A'

        # Receiver rejects stale events and ignores duplicate IDs even when their kind differs.
        tvs['B'].dispatch_tie_flash({'court': 'B', 'kind': 'encho', 'id': 'tie-flash-duplicate',
                                     'at': datetime.now().astimezone().isoformat()})
        tvs['B'].wait_for(lambda: tvs['B'].tie_flash_banner(), message='direct Encho event')
        tvs['B'].dispatch_tie_flash({'court': 'B', 'kind': 'hikiwake', 'id': 'tie-flash-duplicate',
                                     'at': datetime.now().astimezone().isoformat()})
        assert tvs['B'].tie_flash_banner()['className'].endswith('tie-flash--encho'), 'duplicate ID replaced active flash'
        stale = {'court': 'B', 'kind': 'hikiwake', 'id': 'tie-flash-stale', 'at': '2000-01-01T00:00:00.000Z'}
        tvs['B'].dispatch_tie_flash(stale)
        assert tvs['B'].tie_flash_banner()['className'].endswith('tie-flash--encho'), 'stale event replaced active flash'

        # A spectator can try a flash message, but the worker ignores it. Pong is a socket-order barrier.
        tvs['B'].page.clock.fast_forward(5000)
        tvs['B'].wait_for(lambda: tvs['B'].tie_flash_banner() is None, message='Encho banner expiry')
        assert spectator.send_socket_message({'type': 'flash', 'court': 'B', 'kind': 'encho', 'id': 'spectator-spoof'})
        assert spectator.socket_barrier(), 'spectator socket did not pong after its flash attempt'
        assert tvs['A'].tie_flash_banner() is None and tvs['B'].tie_flash_banner() is None, 'spectator flash was broadcast'

        for c, court in courts.items():
            assert court.saves_asked() == 0, f'Court {c}: flash requested a save'
            after = {'payload': stable_payload(court), 'match': court.current_match(),
                     'next': court.page.locator(sel('next-match')).inner_text().strip()}
            assert after == before[c], f'Court {c}: flash changed score/result/Next Match/payload at {changed_paths(before[c], after)}'
            assert not court.page.evaluate('KSMTest.pending()'), f'Court {c}: flash left pending work'
        # A fresh stopped message starts the TV's 15-second stale-state window.
        courts['A'].click('timer-toggle')
        tvs['A'].wait_for(lambda: not tvs['A'].tv_clock_stopped(), message='running TV border cleared')
        courts['A'].click('timer-toggle')
        tvs['A'].wait_for(tvs['A'].tv_clock_stopped, message='stopped TV border received')
        courts['A'].disconnect_socket()
        courts['A'].wait_for(lambda: courts['A'].timer_control('timer-show-tv')['disabled'], message='disconnected TV button disabled')
        assert 'TV not connected' in courts['A'].timer_control('timer-show-tv')['title']
        courts['A'].send_tie_flash()
        assert not courts['A'].page.evaluate('KSMTest.pending()'), 'Disconnected flash left pending work'
        tvs['A'].page.clock.fast_forward(14999)
        assert tvs['A'].tv_clock_stopped(), 'TV clock state expired before 15 seconds'
        tvs['A'].page.clock.fast_forward(1)
        tvs['A'].wait_for(lambda: not tvs['A'].tv_clock_stopped(), message='stale TV clock state expires')
        assert not problems, '\n'.join(problems)
        browser.close()
    print('PASS tie flashes: Hikiwake/Encho labels, court-specific TV banners, five-second refresh/expiry, stale/duplicate rejection, spectator role filtering, and no saved tournament changes')


if __name__ == '__main__':
    main()
