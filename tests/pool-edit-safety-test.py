"""Edit Pool never loses played results without asking and Cancel undoes the edit (F12).

Edit Pool (Registration -> Pools) used to move players in the live pools at every drop: Cancel
only redrew, so the moves stayed (with their old slot letters and the matches not rebuilt) and
the Cancel click itself autosaved them; leaving the editor by the division select or a live
update kept them the same way. Save Pool Changes rebuilt the division's matches without a
word, deleting every result already played.

Offline, through the UI (a player's drag events onto a pool) and test IDs, a round robin of 8
(two pools) next to a second division:
  * drag, Cancel: the pools are exactly as before, the editor is closed, no save is asked for;
  * drag, the division select: the same (the edit is cancelled); back on the division, too;
  * drag, a live update (test API): the same, and the update is not given the half-edited pools;
  * drag, Save before anything was played: the pools change and the matches are rebuilt;
  * a match played, Edit Pool, Save without a move: nothing asked, nothing rebuilt, the result
    stays;
  * a match played, drag, Save: the app asks first; Cancel keeps the result and the editor open
    with the move (nothing saved); Save again and OK: the new pools, the results deleted.
No page error or unexpected dialog may occur.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

DIV, OTHER = 'Edit Open', 'Edit Kids'
CONFIRM = 'Delete the results of'
# The first player of the editor dragged onto pool `index` (the drag events a mouse drag fires,
# sharing one DataTransfer; dispatched, as Chromium's headless mouse drag is unreliable here).
DRAG_JS = """([player, pool, index]) => {
  const dt = new DataTransfer(), source = document.querySelector(player), target = document.querySelectorAll(pool)[index];
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt}));
  fire(source, 'dragstart'); fire(target, 'dragover'); fire(target, 'drop'); fire(source, 'dragend');
}"""


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i + 1}', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    problems = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 1000})
        app = KsmApp.local(page, 'Director', problems=problems)
        app.answers['Create Staff password'] = ''  # offline harness: autosaves stay local
        app.configure([{'name': DIV, 'format': 'Round Robin', 'court': 'A', 'entrants': people('E', 8)},
                       {'name': OTHER, 'format': 'Round Robin', 'court': 'B', 'entrants': people('K', 3)}])
        app.watch_saves()
        pools = lambda: app.structure()[DIV]['pools']
        matches = lambda: app.structure()[DIV]['matches']
        editing = lambda: page.locator(sel('pool-edit-save')).count() > 0
        original = pools()
        assert len(original) == 2 and all(len(p['players']) == 4 for p in original), original
        app.pools(DIV)

        def edit_and_drag():
            app.click('pool-edit')
            assert editing(), 'Edit Pool did not open the editor'
            count = lambda: [p.locator(sel('pool-edit-player')).count() for p in page.locator(sel('pool-edit-pool')).all()]
            before = count()
            page.evaluate(DRAG_JS, [sel('pool-edit-player'), sel('pool-edit-pool'), 1])
            assert count() == [before[0] - 1, before[1] + 1], f'the drag did not move a player in the editor: {before} -> {count()}'
            app.saves_asked()  # from here on: what leaving the editor asks for

        # Cancel restores the pools and saves nothing.
        edit_and_drag()
        app.click('pool-edit-cancel')
        assert not editing(), 'Cancel did not close the editor'
        assert pools() == original, f'Cancel kept the moves (F12): {pools()}'
        assert app.saves_asked() == 0, 'Cancel asked for a save (F12)'
        assert [len(v) for v in app.pools(DIV).values()] == [4, 4]

        # The division select while editing: the edit is cancelled.
        edit_and_drag()
        page.select_option(sel('pool-division-select'), label=OTHER)
        assert pools() == original, f'leaving by the division select kept the moves (F12): {pools()}'
        page.select_option(sel('pool-division-select'), label=DIV)
        assert not editing() and pools() == original

        # A live update while editing: the edit is cancelled; the update never saw the moves.
        edit_and_drag()
        update = app.payload()
        assert [[x['name'] for x in p['players']] for p in update['state']['pools'][DIV]] == [p['players'] for p in original], \
            'the half-edited pools are in the tournament before Save (F12)'
        app.apply_live_update(update)
        assert not editing(), 'the live update left the editor open'
        assert pools() == original, f'a live update kept the moves (F12): {pools()}'

        # Save before anything was played: the new pools, matches rebuilt.
        edit_and_drag()
        app.click('pool-edit-save')
        assert not editing()
        saved = pools()
        assert [len(p['players']) for p in saved] == [3, 5], saved
        assert app.saves_asked() >= 1, 'Save Pool Changes did not save'
        pool_matches = [m for m in matches() if m['pool'] and not m['championship'] and not m['tiebreak']]
        assert len(pool_matches) == 3 + 10, f'matches not rebuilt for pools of 3 and 5: {[(m["pool"], m["white"], m["red"]) for m in pool_matches]}'

        # A match played.
        app.open_court('A')
        app.switch_division(DIV)
        app.score_point('W', 'M')
        app.next_match()
        done = [m for m in matches() if m['done']]
        assert len(done) == 1, done
        app.pools(DIV)

        # Save without a move: nothing asked, nothing rebuilt.
        app.click('pool-edit')
        app.click('pool-edit-save')
        assert not editing() and pools() == saved
        assert [m for m in matches() if m['done']] == done, 'Save without a change deleted a result (F12)'

        # A move after a match was played: asked first; Cancel keeps the result and the editor.
        app.expect_dialog(CONFIRM, accept=False)
        edit_and_drag()
        app.click('pool-edit-save')
        app.wait_for_dialogs(1)
        assert app.seen_dialogs[-1].startswith(f'{CONFIRM} 1 played match in {DIV}?'), app.seen_dialogs
        assert editing(), 'declining the warning closed the editor'
        assert [len(p.locator(sel('pool-edit-player')).all()) for p in page.locator(sel('pool-edit-pool')).all()] == [2, 6], 'declining the warning lost the move'
        assert pools() == saved and [m for m in matches() if m['done']] == done, 'declining the warning changed the tournament (F12)'
        assert app.saves_asked() == 0, 'declining the warning asked for a save'

        # Save again, OK: the results are deleted on purpose.
        app.expect_dialog(CONFIRM, accept=True)
        app.click('pool-edit-save')
        app.wait_for_dialogs(2)
        assert not editing()
        assert [len(p['players']) for p in pools()] == [2, 6], pools()
        assert not [m for m in matches() if m['done']], 'confirmed Save kept a result of the old pools'
        assert app.saves_asked() >= 1
        assert not problems, problems
        browser.close()
    print('PASS pool edit safety: Cancel/select/live update undo the edit, Save asks before deleting played results (F12)')


if __name__ == '__main__':
    main()
