"""Court screen and pool details, on the offline app (staff session), through test IDs.

  * later rounds name their sources ("Winner of Semifinal Match 1", "Winner SF1"), never TBD,
    in the court queue and court context;
  * Registration → Pools keeps its own division, whatever the court is showing, and back;
  * Edit Pool: dragging a player to another pool re-letters both pools A, B, C, D and
    keeps the championship matches;
  * print sheets list each pool's players with their slot letters;
  * mid-tournament court context: pools in progress first and alphabetical, then the
    championship preview, then completed pools marked ✓; pool cards in one column;
  * a live team match shows only its team sheet with Wins/Points; team results show
    Wins/Points headers.
"""
import time

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel
from ksm_browser import launch_chromium

POOLS, ELIM, TEAM = 'Pools', 'Elim', 'Team Tournament'


def people(prefix, n):
    return [{'name': f'{prefix} {i + 1}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'} for i in range(n)]


def main():
    started = time.time()
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: d.dismiss())
        app = KsmApp.local(page)
        app.configure([
            {'name': POOLS, 'format': 'Round Robin', 'court': 'A', 'entrants': people('P', 7)},
            {'name': ELIM, 'format': 'Single Elimination', 'court': 'B', 'entrants': people('E', 4)},
            {'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'teams': 8, 'court': 'Both'},
        ])
        text = lambda testid: page.inner_text(f'#score {sel(testid)}')

        # --- Specific placeholders ---------------------------------------------------------------
        app.open_court('A')
        app.switch_division(POOLS)
        assert 'Winner of Semifinal Match 1' in text('court-queue'), text('court-queue')
        app.open_court('B')
        assert 'Winner SF1' in text('court-context') and 'Winner SF2' in text('court-context'), text('court-context')
        for court in 'AB':
            app.open_court(court)
            for testid in ('court-queue', 'court-context'):
                assert 'TBD' not in text(testid), f'Court {court} {testid} shows TBD:\n{text(testid)}'

        # --- Pools tab keeps its own division ------------------------------------------------------
        app.pools(TEAM)
        app.open_court('A')
        app.switch_division(POOLS)
        app.score_point('W', 'M')
        app.nav('registration')
        app.click('reg-tab-pools')
        assert page.input_value(sel('pool-division-select')) == TEAM, 'the court changed the Pools tab division'
        page.select_option(sel('pool-division-select'), label=POOLS)
        app.open_court('A')
        assert app.court_screen()['division'] == POOLS
        app.switch_division(TEAM)
        app.nav('registration')
        app.click('reg-tab-pools')
        assert page.input_value(sel('pool-division-select')) == POOLS, 'the court changed the Pools tab division'
        app.open_court('A')
        app.switch_division(POOLS)
        app.undo()  # back to an unplayed division before editing its pools

        # --- Edit Pool ------------------------------------------------------------------------------
        before = app.pools(POOLS)
        championship_before = sum(1 for m in app.structure()[POOLS]['matches'] if m['championship'])
        mover = before['A'][-1]
        app.click('pool-edit')
        source = page.locator(sel('pool-edit-player'), has_text=mover)
        target = page.locator(sel('pool-edit-pool')).nth(1).locator(sel('pool-edit-drop')).last
        source.drag_to(target)
        app.click('pool-edit-save')
        after = app.pools(POOLS)
        assert after['A'] == before['A'][:-1] and after['B'] == before['B'] + [mover], f'{before} -> {after}'
        slots = page.evaluate("""() => [...document.querySelectorAll('[data-testid="pool"]')].map(p =>
          [...p.querySelectorAll('[data-testid="pool-slot"]')].map(s => s.textContent.trim()))""")
        assert slots == [list('ABC'[:len(after['A'])]), list('ABCD'[:len(after['B'])])], f'slots after edit: {slots}'
        structure = app.structure()[POOLS]
        assert sum(1 for m in structure['matches'] if m['championship']) == championship_before, 'Edit Pool dropped championship matches'
        pool_pairs = {frozenset((m['white'], m['red'])) for m in structure['matches'] if m['pool'] == 'B'}
        assert all(frozenset((mover, other)) in pool_pairs for other in before['B']), 'moved player has no pool B matches'
        app.open_court('A')
        assert 'Winner of Semifinal Match 1' in text('court-queue'), 'championship left the court queue after Edit Pool'

        # --- Print sheet slot letters ---------------------------------------------------------------
        app.nav('setup')
        app.click('setup-export-brackets')
        printed = page.evaluate("""() => [...document.querySelectorAll('[data-testid="print-pool"]')].map(p =>
          [...p.querySelectorAll('[data-testid="print-pool-player"]')].map(r => r.innerText.replace(/\\s+/g, ' ').trim()))""")
        want = [[f'{letter} {name}' for letter, name in zip('ABCD', players)] for players in (after['A'], after['B'])]
        assert [[r[:len(w)] for r, w in zip(rows, ws)] for rows, ws in zip(printed, want)] == want, f'print pools: {printed}'

        # --- Mid-tournament court context -----------------------------------------------------------
        app.open_court('A')
        app.switch_division(POOLS)
        cards = lambda: page.evaluate("""() => {
          const ctx = document.querySelector('#score [data-testid="court-context"]');
          const bracket = ctx.querySelector('[data-testid="context-bracket"]').getBoundingClientRect().top;
          return [...ctx.querySelectorAll('[data-testid="context-pool"]')].map(c => { const r = c.getBoundingClientRect();
            return {title: c.querySelector('[data-testid="context-pool-title"]').textContent.trim(),
                    done: !!c.querySelector('[data-testid="context-pool-complete"]'),
                    above: r.top < bracket, x: Math.round(r.left), w: Math.round(r.width)}; }); }""")
        start = cards()
        assert [c['title'] for c in start] == ['Pool A', 'Pool B'] and all(c['above'] and not c['done'] for c in start), start
        for _ in range(12):
            if any(c['done'] for c in cards()):
                break
            app.score_point('W', 'M')
            app.next_match()
        now = cards()
        done = [c for c in now if c['done']]
        assert len(done) == 1, now
        assert all(not c['above'] for c in done) and all(c['above'] for c in now if not c['done']), \
            f'in-progress pools above the championship preview, completed below: {now}'
        assert len({c['x'] for c in now}) == 1 and len({c['w'] for c in now}) == 1, f'pool cards not in one column: {now}'

        # --- Team context ----------------------------------------------------------------------------
        app.switch_division(TEAM)
        ctx = text('court-context')
        tm = app.current_match()
        assert page.locator(f'#score {sel("court-context")} {sel("current-bout-white-name")}').inner_text().strip() == tm['white']
        assert 'Wins 0' in ctx and 'Points 0' in ctx, ctx
        assert page.locator(f'#score {sel("court-context")} {sel("context-bracket")}').count() == 0 and 'Quarterfinal' not in ctx, \
            f'live team context should show only the team sheet:\n{ctx}'
        # Court B finishes its team matches and waits: its context shows the team bracket.
        app.open_court('B')
        app.switch_division(TEAM)
        for _ in range(20):
            if not app.current_match():
                break
            app.score_point('W', 'M')
            app.next_match()
        heads = page.evaluate("""() => [...document.querySelectorAll('#score [data-testid="court-context"] [data-testid="team-round-head"]')]
          .map(h => h.innerText.replace(/\\s+/g, ' ').trim().toUpperCase())""")
        assert heads and all(h.endswith('WINS POINTS WINS POINTS') for h in heads), f'team bracket Wins/Points headers: {heads}'
        boxes = page.evaluate("""() => [...document.querySelectorAll('#score [data-testid="court-context"] [data-testid="team-round-head"]')]
          .map(h => Math.round(h.getBoundingClientRect().left))""")
        assert len(set(boxes)) == 1, f'team rounds should be one column in the court context: {boxes}'

        assert not errors, errors
        print(f'PASS court screen details: placeholders, pools tab, Edit Pool, print slots, pool context, team context ({time.time() - started:.0f}s)')
        browser.close()


if __name__ == '__main__':
    main()
