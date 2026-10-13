"""The division running order is set in Setup (issue #31, part of #29).

Setup's divisions table lists the divisions in their running order (state.divisions, existing
data: the order generation, the court's division dropdown and Registration use) with a move up /
move down button on each row; switched-off divisions follow. A move is saved and synced like other
Setup edits: another device and a reload see the new order, and the court's division dropdown
follows it. The buttons work from the keyboard and keep the focus on the moved division.

Against a throwaway `wrangler dev`: a director and a second staff device; three divisions on
Court A (Kids, Juniors, Masters).
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, app_path, sel
from ksm_browser import launch_chromium
from ksm_server import local_worker


def people(prefix, n):
    return [{'name': f'{prefix} {i}', 'dojo': f'Dojo {i}', 'seed': '', 'status': 'Checked'} for i in range(1, n + 1)]


ORDER = ['Kids', 'Juniors', 'Masters']


def main():
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Order Cup')
        tid = director.create_tournament()
        director.configure([{'name': d, 'format': 'Round Robin', 'court': 'A', 'entrants': people(d, 3)} for d in ORDER])
        director.save_now()
        director.wait_idle()
        other = KsmApp.open_device(browser, base, 'Court A', problems, app_path(tid, 'court', 'A'))
        other.wait_generated()
        other.staff_login()

        director.nav('setup')
        assert director.setup_division_names()[:3] == ORDER, director.setup_division_names()
        director.move_division('Kids', 'down')  # Juniors, Kids, Masters
        director.move_division('Masters', 'up')  # Juniors, Masters, Kids
        assert director.setup_division_names()[:3] == ['Juniors', 'Masters', 'Kids'], director.setup_division_names()

        # Keyboard: the focused button moves its division and the focus stays with that division.
        page = director.page
        kids = director.setup_division_row('Kids')
        kids.locator(sel('setup-division-up')).focus()
        page.keyboard.press('Enter')
        director.wait_for(lambda: director.setup_division_names()[:3] == ['Juniors', 'Kids', 'Masters'], message='Kids moved up by Enter')
        focused = page.evaluate("() => document.activeElement?.closest('[data-testid=\"setup-division-row\"]')?.querySelector('[data-testid=\"setup-division-name\"]')?.textContent")
        assert focused == 'Kids', f'the focus left the moved division: {focused!r}'
        # The first row cannot move up, the last enabled one cannot move down.
        first = page.locator(sel('setup-division-row')).first
        assert first.locator(sel('setup-division-up')).is_disabled()

        director.wait_idle()
        record = fetch_record(base, tid)
        assert record['payload']['state']['divisions'][:3] == ['Juniors', 'Kids', 'Masters'], record['payload']['state']['divisions']

        other.wait_revision(record['revision'])
        other.open_court('A')
        assert other.division_options()[:3] == ['Juniors', 'Kids', 'Masters'], f'court dropdown: {other.division_options()}'
        other.nav('setup')
        assert other.setup_division_names()[:3] == ['Juniors', 'Kids', 'Masters'], f'second device: {other.setup_division_names()}'

        director.goto(app_path(tid))  # the page loaded again from the tournament's link
        director.wait_generated()
        director.staff_login()  # a reload ends the staff session (Staff Login again)
        director.nav('setup')
        assert director.setup_division_names()[:3] == ['Juniors', 'Kids', 'Masters'], f'after a reload: {director.setup_division_names()}'
        assert not problems, '\n'.join(problems)
        browser.close()
    print(f'PASS the division running order is set in Setup (move up/down, keyboard); saved, synced, kept on reload; '
          f'the court dropdown follows ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
