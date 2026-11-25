"""Independent audience orientation: real sync/reload plus a new mirrored TV golden."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from golden_screen import Golden
from ksm_app import KsmApp, app_path
from ksm_browser import launch_chromium
from ksm_server import local_worker

TV = {'width': 1920, 'height': 1080}


def people(prefix):
    return [{'name': f'{prefix} {i}', 'dojo': 'Test Dojo', 'seed': '', 'status': 'Checked'} for i in range(4)]


def check_layout(app, left):
    layout = app.tv_layout()
    pairs = [layout[k] for k in ('players', 'scores', 'hansoku', 'teams', 'summaries', 'lineups') if layout[k]]
    pairs += layout['rows'] + layout['upcoming']
    assert pairs, layout
    for white, red in pairs:
        assert (red[0] < white[0]) == left, (left, layout)
    return layout


def main():
    errors = []
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', errors, tournament_name='TV orientation')
        tid = director.create_tournament()
        director.configure([
            {'name': 'Open A', 'format': 'Single Elimination', 'court': 'A', 'entrants': people('A')},
            {'name': 'Open B', 'format': 'Single Elimination', 'court': 'B', 'entrants': people('B')},
        ])
        director.open_court('A')
        director.score_point('W', 'M')
        director.score_point('R', 'K')
        director.hansoku('W')
        director.hansoku('R')
        director.save_now()
        director.wait_idle()
        a = KsmApp.open_device(browser, base, 'TV A', errors, app_path(tid, 'tv', 'A'), viewport=TV)
        b = KsmApp.open_device(browser, base, 'TV B', errors, app_path(tid, 'tv', 'B'), viewport=TV)
        for tv in (a, b):
            tv.wait_generated()
            tv.wait_for(lambda: tv.tv_screen()['live'], message='live TV')
            check_layout(tv, False)
        assert director.payload()['setup']['court1TvRedSide'] == 'right'
        assert director.payload()['setup']['court2TvRedSide'] == 'right'
        director.set_table_red_side('A', 'left')
        director.wait_idle()
        a.wait_for(lambda: a.payload()['setup']['court1RedSide'] == 'left', message='table setting synced independently')
        check_layout(a, False)
        baseline = a.tv_screen()
        director.set_tv_red_side('A', 'left')
        director.wait_idle()
        a.wait_for(lambda: a.payload()['setup']['court1TvRedSide'] == 'left', message='TV A setting synced')
        a.wait_for(lambda: a.tv_layout()['players'][1][0] < a.tv_layout()['players'][0][0], message='TV A mirrored')
        check_layout(a, True)
        check_layout(b, False)
        assert a.tv_screen() == baseline, 'Mirroring must preserve side identity and scores'
        g = Golden('audience-red-left', a, errors, Path(__file__).parent / 'golden' / 'tv',
                   lambda app: ({'tv': app.tv_screen(), 'upcoming': app.tv_upcoming()}, {'layout': list(app.tv_layout().values())}))
        g.check('individual with points and hansoku')
        a.reload()
        a.wait_generated()
        a.wait_for(lambda: a.tv_screen()['live'], message='TV after reload')
        check_layout(a, True)
        assert a.payload()['setup']['court1TvRedSide'] == 'left'
        # Both courts can be set independently, and switching A back removes its class.
        director.configure_tv_red_side('B', 'left')
        director.set_tv_red_side('A', 'right')
        director.wait_idle()
        b.wait_for(lambda: b.payload()['setup']['court2TvRedSide'] == 'left', message='B mirrored')
        a.wait_for(lambda: a.payload()['setup']['court1TvRedSide'] == 'right', message='A reset')
        check_layout(b, True)
        check_layout(a, False)
        # Loading old or malformed snapshots must clear a previously mirrored setting.
        for value in (None, 'unknown'):
            payload = b.payload()
            if value is None:
                payload['setup'].pop('court2TvRedSide')
            else:
                payload['setup']['court2TvRedSide'] = value
            b.apply_live_update(payload)
            b.wait_for(lambda: b.payload()['setup']['court2TvRedSide'] == 'right', message='fallback right')
            check_layout(b, False)
        # Team sheets (three/five person) and kachinuki lineups use the same side grids.
        for fmt in ('3-Person Team', '5-Person Team', 'Kachinuki'):
            director.configure([{'team': True, 'format': fmt, 'tournament': 'Single Elimination', 'teams': 4, 'court': 'A'}])
            director.open_court('A')
            director.score_point('W', 'M')
            director.score_point('R', 'K')
            director.hansoku('W')
            director.hansoku('R')
            director.set_tv_red_side('A', 'left')
            director.save_now()
            director.wait_idle()
            a.wait_for(lambda: (a.tv_layout()['lineups'] if fmt == 'Kachinuki' else a.tv_layout()['teams']) and a.tv_layout()['players'] and
                       a.tv_layout()['players'][1][0] < a.tv_layout()['players'][0][0], message=f'{fmt} mirrored')
            a.wait_for(lambda: len(a.tv_layout()['rows']) == (5 if fmt == '5-Person Team' else 3 if fmt == '3-Person Team' else 0), message=f'{fmt} rows')
            check_layout(a, True)
            g.check(fmt)
            director.set_tv_red_side('A', 'right')
            director.wait_idle()
            a.wait_for(lambda: a.payload()['setup']['court1TvRedSide'] == 'right', message='team reset')
            check_layout(a, False)
        g.finish()
        assert not errors, errors
        browser.close()
    print('PASS TV red side: defaults, per-court mirror, points/hansoku/upcoming, sync, reload, legacy fallback')


if __name__ == '__main__':
    main()
