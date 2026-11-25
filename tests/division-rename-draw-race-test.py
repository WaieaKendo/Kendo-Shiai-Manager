"""A draw racing another device's division rename (found in external PR review, #36).

The director generates the tournament while a registration desk renames a division and saves
first. Before the fix the director's save met the conflict, the rename was replayed onto the
director's state (its competitors moved to the new name) and the draw was replayed too, still keyed
under the old name: saved with no warning, pools and matches for a division that no longer exists.
Now the draw is not saved: the rename and the desk's state win, and the director is told "Another
device renamed <old> to <new>. Generate again."; generating again draws the renamed division.
(The rules, both orders, are pinned in division-rename-merge-test.mjs.)

Against a throwaway `wrangler dev`: a director and a registration desk (a second staff device).
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker

YONENBU = 'Yonenbu (11 years and under)'
NEW = 'Under 12'
STRUCTURE = ('pools', 'teamPools', 'allMatches', 'teamBracketNodes', 'singleElimNodes', 'singleElimComps', 'brackets', 'championshipNodes')
FIXED = ('Team Tournament', 'Exhibition Matches')


def drawn_names(st):
    """Division names with pools, matches or brackets in a server state."""
    return sorted({d for k in STRUCTURE for d, v in (st.get(k) or {}).items() if v})


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Draw Race Cup')
        tid = director.create_tournament()
        for i in range(1, 5):
            director.register(f'K {i}', f'Dojo {i}', YONENBU)
        director.blur()
        director.wait_idle()
        desk = KsmApp.open_device(browser, base, 'Desk', problems, app_path(tid))
        desk.staff_login()
        desk.wait_revision(fetch_record(base, tid)['revision'])
        director.watch_conflicts()
        server = lambda: fetch_record(base, tid)['payload']['state']

        # The director's draw is held at the network while the desk renames Yonenbu and saves first.
        director.hold_next_save()
        director.generate()
        director.wait_generated()
        held = director.wait_held_save()
        assert YONENBU in drawn_names(held['state']), f'the held save is not the draw: {drawn_names(held["state"])}'
        desk.nav('setup')
        assert desk.rename_division(YONENBU, NEW) == ''
        desk.blur()
        desk.wait_idle()
        assert NEW in server()['divisions'], 'the rename did not reach the server first'
        director.release_save()
        director.wait_for(lambda: director.conflicts() > 0, message='the draw to meet the conflict')
        director.wait_idle()
        st = server()
        assert NEW in st['divisions'] and YONENBU not in st['divisions'], f'the rename was lost: {st["divisions"]}'
        assert all(c['division'] == NEW for c in st['competitors']), f'a competitor was left on the old name: {st["competitors"]}'
        orphans = [d for d in drawn_names(st) if d not in st['divisions'] and d not in FIXED]
        assert not orphans, f'#36: pools/matches saved under a name that is no division: {orphans}'
        assert not drawn_names(st) and not st.get('generated'), f'#36: part of the draw was saved: {drawn_names(st)}, generated {st.get("generated")}'
        notice = director.page.inner_text(sel('toast'))
        assert f'Another device renamed "{YONENBU}" to "{NEW}". Generate again.' in notice, f'no notice to generate again: {notice!r}'
        director.wait_for(lambda: not director.page.evaluate('KSMTest.generated()'), message='the director to show the tournament not generated')

        # Generate again: the renamed division is drawn, on the server and the desk.
        director.generate()
        director.wait_generated()
        director.wait_idle()
        st = server()
        assert st.get('generated') and NEW in drawn_names(st) and YONENBU not in drawn_names(st), f'generate again: {drawn_names(st)}'
        players = sorted(p if isinstance(p, str) else p['name'] for pool in st['pools'][NEW] for p in pool['players'])
        assert players == ['K 1', 'K 2', 'K 3', 'K 4'], f'generate again: the renamed division\'s players: {players}'
        desk.wait_revision(fetch_record(base, tid)['revision'])
        desk.wait_generated()

        assert not problems, '\n'.join(problems)
        browser.close()
    print(f'PASS a draw racing a division rename: the rename wins, the draw is not saved (nothing under the old name), '
          f'"Generate again" shown; generating again draws the renamed division ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
