"""Device-local match timing; deterministic epoch clock, real settings sync and TV flashes."""
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, count=4):
    return [{'name': f'{prefix} {i}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(count)]


def stable(app):
    value = app.payload()
    value.pop('savedAt', None)
    return value


def check(app, display, status='Stopped', encho=False):
    app.wait_for(lambda: app.timer() == {'display': display, 'status': status, 'encho': encho},
                 message=f'timer {display} {status} encho={encho}; got {app.timer()}')


def advance(app, milliseconds, sleeping=False):
    app.timer_now += timedelta(milliseconds=milliseconds)
    app.page.clock.set_fixed_time(app.timer_now)
    if sleeping:
        app.page.clock.fast_forward(milliseconds)
    else:
        app.page.clock.run_for(100)


def check_layout(app):
    layout = app.timer_layout()
    left, right = sorted([layout['white'], layout['red']], key=lambda b: b['x'])
    timer = layout['timer']
    if layout['width'] <= 600 and timer['y'] >= max(left['bottom'], right['bottom']) - 1:
        # Phone portrait: both scoring panels share a row, the timer sits full width below them.
        assert left['right'] <= right['x'] + 1 and timer['x'] <= left['x'] + 1 and timer['right'] >= right['right'] - 1, layout
    else:
        assert left['right'] <= timer['x'] + 1 and timer['right'] <= right['x'] + 1, layout
    assert all(b['x'] >= 0 and b['right'] <= layout['width'] + 1 for b in layout['buttons']), layout
    assert all(b['x'] >= timer['x'] - 1 and b['right'] <= timer['right'] + 1 for b in layout['buttons']), layout


def main():
    problems = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems)
        tid = director.create_tournament()
        director.configure([
            {'name': 'Pool', 'format': 'Round Robin', 'court': 'A', 'entrants': people('P')},
            {'name': 'Final', 'format': 'Single Elimination', 'court': 'B', 'entrants': people('F', 2)},
        ])
        defaults = {'timeRegular': '3:00', 'timeQuarterfinal': '', 'timeSemifinal': '', 'timeFinal': '', 'timeEncho': '3:00', 'court1TimerSound': 'whistle01', 'court2TimerSound': 'whistle02', 'court1TimerEnabled': 'On', 'court2TimerEnabled': 'On'}
        assert all(director.payload()['setup'][k] == v for k, v in defaults.items())
        lengths = dict(timeRegular='0:30', timeQuarterfinal='0:40', timeSemifinal='0:50', timeFinal='1:00', timeEncho='')
        director.set_timer_lengths(**lengths)
        director.configure_timer_sound('A', 'whistle02')
        director.configure_timer_sound('B', 'whistle01')
        director.save_now()
        director.wait_idle()
        a = KsmApp.open_device(browser, base, 'Scorer A', problems, app_path(tid, 'court', 'A'), clock=True, before_load=KsmApp.install_timer_probes)
        b = KsmApp.open_device(browser, base, 'Scorer B', problems, app_path(tid, 'court', 'B'), clock=True)
        tv_a = KsmApp.open_device(browser, base, 'TV A', problems, app_path(tid, 'tv', 'A'))
        tv_b = KsmApp.open_device(browser, base, 'TV B', problems, app_path(tid, 'tv', 'B'))
        live = KsmApp.open_device(browser, base, 'Live', problems, app_path(tid))
        for app in (a, b, tv_a, tv_b, live):
            app.wait_generated()
            assert app.socket_barrier()
        for app, court in ((a, 'A'), (b, 'B')):
            app.staff_login()
            app.open_court(court)
            app.wait_for(app.timer, message='timer mounted')
            app.wait_idle()
            assert all(app.payload()['setup'][k] == v for k, v in lengths.items())
            app.timer_now = datetime.now()
            app.page.clock.set_fixed_time(app.timer_now)
        check(a, '0:30')
        check(b, '1:00')
        for app in (a, b):
            assert app.timer_control('timer-replay')['disabled'], 'Whistle available before time-up'
        tv_a.wait_for(tv_a.tv_clock_stopped, message='stopped Court A TV border')
        tv_b.wait_for(tv_b.tv_clock_stopped, message='stopped Court B TV border')
        assert a.payload()['setup']['court1TimerSound'] == 'whistle02'
        assert b.payload()['setup']['court2TimerSound'] == 'whistle01'
        for width, height in [(1280,900),(844,390),(568,375),(390,844)]:
            a.page.set_viewport_size({'width':width,'height':height})
            check_layout(a)
        a.page.set_viewport_size({'width':1280,'height':900})
        assert a.timer_layout()['animation'] == 'none'
        before = stable(a)
        a.watch_saves()
        for delta, expected in [(-10, '0:20'), (-1, '0:19'), (1, '0:20'), (10, '0:30')]:
            a.click(f'timer-adjust-{delta}')
            check(a, expected)
        a.click('timer-toggle')
        a.wait_for(lambda: a.timer_probes()['requests'] == 1, message='wake lock acquired')
        a.timer_visibility(False)
        a.timer_visibility(True)
        a.wait_for(lambda: a.timer_probes()['requests'] == 2, message='wake lock reacquired')
        advance(a, 5000)
        check(a, '0:25', 'Running')
        tv_a.wait_for(lambda: not tv_a.tv_clock_stopped(), message='running Court A clears border')
        assert tv_b.tv_clock_stopped(), 'Court A affected Court B border'
        assert a.timer_control('timer-show-tv')['disabled']
        assert a.timer_layout()['animation'] == 'none'
        a.click('timer-toggle')
        advance(a, 2000)
        check(a, '0:25')
        assert a.timer_layout()['animation'] == 'match-timer-alert'
        tv_a.wait_for(tv_a.tv_clock_stopped, message='paused Court A TV border')
        assert a.timer_probes()['releases'] == 2
        a.reset_timer(False)
        check(a, '0:25')
        a.reset_timer()
        check(a, '0:30')
        assert a.timer_layout()['animation'] == 'none'
        assert stable(a) == before, 'Timer controls entered the tournament payload'
        assert a.saves_asked() == 0, 'Local timer controls requested cloud saves'
        a.click('timer-toggle')
        advance(a, 3000)
        check(a, '0:27', 'Running')
        a.reload()
        a.wait_generated()
        assert a.page.evaluate('KSMTest.role()') == 'staff'
        a.open_court('A')
        check(a, '0:27', 'Running')
        advance(a, 2000)
        check(a, '0:25', 'Running')
        a.hansoku('W')
        check(a, '0:25')  # a hansoku stops the clock, like a point
        a.click('timer-toggle')
        a.undo()  # removing the hansoku must not pause the running clock
        check(a, '0:25', 'Running')
        a.score_point('W', 'M')
        check(a, '0:25')
        advance(a, 2000)
        check(a, '0:25')
        a.score_point('R', 'M')
        a.click('timer-toggle')
        # Simulates a sleeping tablet: only the final interval is delivered.
        advance(a, 30000, sleeping=True)
        check(a, '0:00', 'TIME')
        assert not a.timer_control('timer-replay')['disabled']
        tv_a.wait_for(tv_a.tv_clock_stopped, message='TIME keeps stopped TV border')
        a.wait_for(lambda: a.timer_probes()['buzzers'] == 1, message='selected whistle played')
        assert '/assets/sounds/whistle02.mp3' in a.timer_probes()['sounds']
        advance(a, 1000)
        assert a.timer_probes()['buzzers'] == 1, 'Time-up must sound only once'
        tv_a.wait_for(tv_a.tie_flash_banner, message='Hikiwake time-up banner')
        assert tv_a.tie_flash_banner()['text'] == 'HIKIWAKE'
        assert tv_b.tie_flash_banner() is None
        banner_id = tv_a.tie_flash_banner()['id']
        a.click('timer-replay')
        a.wait_for(lambda: a.timer_probes()['buzzers'] == 2, message='whistle replay')
        check(a, '0:00', 'TIME')
        assert tv_a.tie_flash_banner()['id'] == banner_id, 'Whistle replay resent TV banner'
        b.click('timer-toggle')
        advance(b, 61000, sleeping=True)
        check(b, '0:00', 'TIME', True)
        assert not b.timer_control('timer-encho')['disabled']
        assert b.page.locator('[data-testid=timer-encho]').locator('..').get_attribute('class') == 'match-timer-transport'
        assert b.page.locator('[data-testid=timer-toggle]').count() == 0
        tv_b.wait_for(tv_b.tie_flash_banner, message='Encho time-up banner')
        assert tv_b.tie_flash_banner()['text'] == 'ENCHO'
        b.page.set_viewport_size({'width':568,'height':375})
        check_layout(b)
        b.click('timer-encho')
        advance(b, 7000)
        check(b, '0:07', 'Running')
        assert b.timer_layout()['encho']
        check_layout(b)
        advance(b, 180000, sleeping=True)
        check(b, '3:07', 'Running')
        b.click('timer-toggle')
        for app in (tv_a, tv_b, live):
            assert app.timer() is None, 'Timer visible to an audience'
            assert app.timer_storage() == {}, 'Audience device started a local timer'
        assert all(b.payload()['setup'][k] == v for k, v in lengths.items())
        b.reload()
        b.wait_generated()
        assert b.page.evaluate('KSMTest.role()') == 'staff'
        b.open_court('B')
        check(b, '3:07')
        # Settings sync over a real connection after both devices already exist.
        director.set_timer_lengths(timeFinal='')
        director.save_now()
        director.wait_idle()
        b.wait_for(lambda: b.payload()['setup']['timeFinal'] == '', message='blank final synced')
        b.reset_timer()
        check(b, '0:30')
        # Old/malformed Setup snapshots normalize after applySetupSnapshot's null guard.
        for values in ({}, {k: 'bad' for k in defaults}):
            payload = b.payload()
            for k in defaults:
                payload['setup'].pop(k, None)
            payload['setup'].update(values)
            b.apply_live_update(payload)
            assert all(b.payload()['setup'][k] == v for k, v in defaults.items())
        # A new match is fresh; undoing Next Match restores the previous identity's clock.
        a.reset_timer()
        a.click('timer-adjust--10')
        check(a, '0:20')
        a.next_match(settle=True)
        check(a, '0:30')
        a.undo()
        check(a, '0:20')
        assert len(a.timer_storage()) >= 1
        # Per-bout team identities: a teammate starts fresh and returning restores the old clock.
        team = KsmApp.local(browser.new_page(), 'Team timer')
        team.configure([{'team': True, 'format': '3-Person Team', 'tournament': 'Round Robin', 'teams': 2, 'court': 'A'}])
        team.open_court('A')
        check(team, '3:00')
        team.click('timer-adjust--10')
        check(team, '2:50')
        team.next_match(settle=True)
        check(team, '3:00')
        team.click('timer-adjust--1')
        check(team, '2:59')
        assert len(team.timer_storage()) == 2
        team.undo()
        check(team, '2:50')
        # Quarterfinal and semifinal use their configured stages, earlier rounds use regular.
        for count, expected in [(4, '0:50'), (8, '0:40'), (16, '0:30')]:
            stage = KsmApp.local(browser.new_page(), f'Stage {count}')
            stage.set_timer_lengths(**lengths)
            stage.configure([{'name': f'Draw {count}', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('S', count)}])
            stage.open_court('A')
            check(stage, expected)
            stage.close()
        assert not problems, '\n'.join(problems)
        browser.close()
    print('PASS match timer: controls, reset, reload, sleep, point/hansoku, TIME and court TV flashes, unlimited encho, final fallback, local-only runtime, Setup sync and legacy defaults')


if __name__ == '__main__':
    main()
