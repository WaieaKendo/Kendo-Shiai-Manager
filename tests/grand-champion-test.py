"""#86: grand champion — Setup, fill-in, the court queue, awards (Results, TV, print), a withdrawal,
a source corrected before and after the start, a pool of winners, and two devices racing.

Every app operation goes through KsmApp / KSMTest and the Setup island's controls. Held requests
order the cloud saves; no sleeps.
"""
from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, sel, fetch_record
from ksm_browser import launch_chromium
from ksm_server import local_worker

def entrants(*names):
    return [{'name': n, 'dojo': n + ' Dojo', 'seed': '', 'status': 'Checked'} for n in names]

DIVISIONS = [
    {'name': 'Open', 'format': 'Single Elimination', 'court': 'A', 'entrants': entrants('Aki', 'Ben')},
    {'name': 'Women', 'format': 'Single Elimination', 'court': 'B', 'entrants': entrants('Cora', 'Dee')},
    {'name': 'Masters', 'format': 'Single Elimination', 'court': 'A', 'entrants': entrants('Eli', 'Fay')},
]


def gc_matches(app, gc):
    return [m for m in app.page.evaluate('id=>KSMTest.structure()[id]?.matches||[]', gc)]


def play_court(app, court, points):
    """Play the court's next ready match with `points` (engine-level, as the court buttons do)."""
    m = app.page.evaluate("([court,points])=>{const m=KSMTest.prepareCourt(court);if(!m)return null;const d=m.division;KSMTest.play(points);return d;}", [court, points])
    assert m, f'nothing to play on Court {court}'
    return m


def status(app):
    app.nav('setup')
    return app.page.locator(sel('grand-champion-status')).first.inner_text()


def open_decision(app):
    """Setup: the director's question opens when Setup shows (else its row's Decide…)."""
    app.nav('setup')
    if not app.page.evaluate('KSMTest.grandChampionQuestion()'):
        app.page.wait_for_selector(sel('grand-champion-decide'))
        app.click('grand-champion-decide')
    return app.page.evaluate('KSMTest.grandChampionQuestion()')


def choose(app, choice):
    """Answer the open grand champion question by clicking its button."""
    app.page.wait_for_selector(f'{sel("grand-champion-choice")}[data-choice="{choice}"]')
    app.page.click(f'{sel("grand-champion-choice")}[data-choice="{choice}"]')


def local_cases(browser):
    problems = []
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    app = KsmApp.local(page, problems=problems, query='?court=B')  # its TV shows Court B
    app.expect_dialog('Create Staff password')  # an offline page's autosave offers the cloud
    app.configure(DIVISIONS[:2])
    # Setup: add the row with the island's controls (before the draw).
    page.evaluate('KSMTest.app.state.generated=false;KSMTest.app.renderAll()')
    app.nav('setup')
    app.click('grand-champion-add')
    page.wait_for_selector(sel('grand-champion-row'))
    assert 'Choose at least two divisions' in status(app)
    for div in ('Open', 'Women'):
        page.click(f'{sel("grand-champion-source")}[data-division="{div}"]')
    page.select_option(sel('grand-champion-court'), 'B')
    page.select_option(sel('grand-champion-awardMode'), 'top2')
    name = page.locator(sel('grand-champion-name'))
    name.fill('Grand Champion 2026'); name.press('Enter')
    page.wait_for_function("KSMTest.grandChampions()[0]?.name==='Grand Champion 2026'")
    assert page.locator(sel('grand-champion-format')).is_disabled(), 'two sources always play one match'
    row = page.evaluate('KSMTest.grandChampions()[0]')
    gc = row['id']
    assert row['sources'] == ['Open', 'Women'] and row['court'] == 'B' and row['awardMode'] == 'top2', row
    assert 'Waiting for Open, Women' in status(app)
    page.evaluate('KSMTest.app.generatePools({validated:true})')
    app.nav('setup')
    assert page.locator(sel('grand-champion-court')).is_disabled() and not page.locator(sel('grand-champion-awardMode')).is_disabled(), 'not locked after generation'
    assert page.locator(sel('grand-champion-add')).is_disabled()
    assert 'can no longer be added or removed' in page.locator(sel('grand-champion-note')).inner_text()

    # Fill-in: nothing until both sources are decided, then one Final on Court B (Encho).
    assert play_court(app, 'A', [['W', 'M']]) == 'Open'
    assert not gc_matches(app, gc), 'drawn before every source finished'
    assert 'Waiting for Women' in status(app)
    assert play_court(app, 'B', [['W', 'M']]) == 'Women'
    final = gc_matches(app, gc)
    assert len(final) == 1 and final[0]['position'] == 'Final' and final[0]['court'] == 'B', final
    open_winner = page.evaluate("KSMTest.finalState().Open.placements[0].name")
    women_winner = page.evaluate("KSMTest.finalState().Women.placements[0].name")
    assert sorted([final[0]['white'], final[0]['red']]) == sorted([open_winner, women_winner]), final
    assert 'Ready on Court B' in status(app)

    # The court queue: Court B's division list has it, and Continue goes there.
    app.open_court('B')
    assert 'Grand Champion 2026' in app.division_options()
    page.wait_for_selector(sel('court-continue'))
    assert page.locator(sel('court-continue')).inner_text() == 'Continue to Grand Champion 2026 →'
    app.click('court-continue')
    assert page.evaluate("KSMTest.app.state.courtState.B.division") == gc

    # Corrected before the start (Undo of the Open final on Court A): cleared, then refilled.
    app.open_court('A')
    app.undo()  # Next Match: the Open final is open again
    page.wait_for_function('id=>!(KSMTest.app.state.allMatches[id]||[]).length', arg=gc)
    app.undo()  # and its point
    assert 'Waiting for Open' in status(app)
    open_runner_up = 'Ben' if open_winner == 'Aki' else 'Aki'
    app.open_court('A')
    page.evaluate("KSMTest.play([['R','M']])")  # the other side wins this time
    corrected = page.evaluate("KSMTest.finalState().Open.placements[0].name")
    assert corrected == open_runner_up, corrected
    final = gc_matches(app, gc)
    assert corrected in (final[0]['white'], final[0]['red']), 'not refilled with the corrected winner'

    # Corrected after the start: the court is told, the director decides in Setup (keep).
    app.open_court('B')
    app.switch_division('Grand Champion 2026')
    app.score_point('W', 'M')
    page.wait_for_function('id=>KSMTest.app.state.allMatches[id][0].wp.length===1', arg=gc)
    app.open_court('A')
    app.undo()  # the Open final's Next Match
    app.wait_toast('Grand Champion 2026: a source division changed after it started. The director decides in Setup.')
    assert gc_matches(app, gc)[0]['wp'] == ['M'], 'a started grand champion changed without the director'
    assert not page.evaluate('KSMTest.grandChampionQuestion()'), 'a court device was asked (only Setup asks)'
    q = open_decision(app)
    assert q['choices'] == ['keep', 'rebuild'] and 'no longer decided' in q['message'], q
    choose(app, 'keep')
    assert gc_matches(app, gc)[0]['wp'] == ['M'] and page.evaluate('KSMTest.grandChampions()[0].keep'), 'keep did not keep the match'
    assert not page.locator(sel('grand-champion-decide')).count()
    # Asked again for the next change; "draw again" with the corrected players deletes its results.
    app.open_court('A')
    app.undo()  # the Open final's point
    page.evaluate("KSMTest.play([['W','M']])")  # Open decided the other way round
    assert page.evaluate("KSMTest.finalState().Open.placements[0].name") == open_winner
    assert open_winner in open_decision(app)['message']
    choose(app, 'rebuild')
    final = gc_matches(app, gc)
    assert final[0]['wp'] == [] and not final[0]['done'], 'draw again kept the old score'
    assert open_winner in (final[0]['white'], final[0]['red']), final

    # A winner withdraws: the director chooses the runner-up.
    app.nav('setup')
    app.click('grand-champion-withdraw')
    choose(app, 'source:Open')
    q = page.evaluate('KSMTest.grandChampionQuestion()')
    assert q['choices'] == ['runner-up', 'fusen-sho', 'cancel'], q
    choose(app, 'runner-up')
    final = gc_matches(app, gc)
    assert open_runner_up in (final[0]['white'], final[0]['red']), 'the runner-up did not step in'
    assert f'{open_runner_up} (for Open, runner-up)' in status(app)
    # Review #86: a runner-up standing in is not withdrawn again here (that is the court's Fusen-sho).
    app.click('grand-champion-withdraw')
    q = page.evaluate('KSMTest.grandChampionQuestion()')
    assert 'source:Open' not in q['choices'], q
    choose(app, q['choices'][0]); choose(app, 'cancel')

    # Encho: a tie is refused; then a winner gives the Grand Champion award everywhere.
    app.open_court('B')
    app.switch_division('Grand Champion 2026')
    app.score_point('W', 'M'); app.score_point('R', 'K')
    page.wait_for_function('id=>KSMTest.app.state.allMatches[id][0].rp.length===1', arg=gc)
    assert page.locator(sel('next-match')).is_disabled(), 'a tie could end the grand champion (Encho)'
    app.score_point('R', 'M')
    app.next_match(settle=True)
    placements = page.evaluate('id=>KSMTest.finalState()[id].placements', gc)
    champion = final[0]['red']
    runner_up = final[0]['white']
    assert placements == [{'place': 'Grand Champion', 'name': champion}, {'place': 'Runner-up', 'name': runner_up}], placements
    assert app.placements()['Grand Champion 2026'] == [('Grand Champion', champion), ('Runner-up', runner_up)]
    assert 'Grand Champion: ' + champion in status(app)
    page.evaluate("()=>{KSMTest.app.state.publicCourt='B';KSMTest.renderTv();}")
    page.wait_for_function("document.querySelector('[data-testid=tv-division]')?.textContent==='Grand Champion 2026'")
    tv = app.tv_screen()
    assert tv['complete'] and tv['division'] == 'Grand Champion 2026', tv
    shown = page.locator(f'{sel("tv-display")} {sel("division-complete")}').inner_text()
    assert 'Grand Champion' in shown and champion in shown and 'Runner-up' in shown, shown
    page.evaluate("id=>KSMTest.updateGrandChampion(id,{awardMode:'top1'})", gc)
    app.nav('setup'); app.click('setup-export-results')
    printed = page.locator('#printBody').inner_text()
    assert 'Grand Champion 2026' in printed and champion in printed and gc not in printed, printed
    assert 'Runner-up' not in printed, 'award mode change did not reach print'
    assert not problems, problems
    page.close()


def pool_and_fusen_cases(browser):
    """Three sources as a pool of winners; a winner withdraws by Fusen-sho; a duplicate winner."""
    problems = []
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    app = KsmApp.local(page, problems=problems)
    app.expect_dialog('Create Staff password')
    app.configure(DIVISIONS)
    page.evaluate('KSMTest.app.state.generated=false')
    gc = page.evaluate("KSMTest.addGrandChampion(['Open','Women','Masters'],{format:'Round Robin',court:'A',name:'Champions Pool'})")
    assert page.evaluate("id=>KSMTest.updateGrandChampion(id,{format:'Round Robin'})", gc) is None
    page.evaluate('KSMTest.app.generatePools({validated:true})')
    for court in ('A', 'B', 'A'):
        play_court(app, court, [['W', 'M']])
    pool = gc_matches(app, gc)
    assert len(pool) == 3 and all(m['court'] == 'A' and not m['championship'] for m in pool), pool
    women = page.evaluate("KSMTest.finalState().Women.placements[0].name")
    app.nav('setup')
    app.click('grand-champion-withdraw')
    choose(app, 'source:Women')
    choose(app, 'fusen-sho')
    pool = gc_matches(app, gc)
    lost = [m for m in pool if women in (m['white'], m['red'])]
    assert len(lost) == 2 and all(m['done'] and m['winner'] != women and ['F', 'F'] in (m['wp'], m['rp']) for m in lost), lost
    assert not [m for m in pool if women not in (m['white'], m['red'])][0]['done']
    assert f'{women} (withdrew: Fusen-sho)' in status(app)
    play_court(app, 'A', [['W', 'M']])
    placements = page.evaluate('id=>KSMTest.finalState()[id].placements', gc)
    assert [p['place'] for p in placements] == ['Grand Champion'] and placements[0]['name'] != women, placements
    # Review #86: switching a source division off after the grand champion was played keeps it.
    played = gc_matches(app, gc)
    page.evaluate("KSMTest.app.toggleDivision('Masters',false);KSMTest.saveNow('source off')")
    assert gc_matches(app, gc) == played, 'a played grand champion was deleted when a source was switched off'
    page.evaluate("KSMTest.app.toggleDivision('Masters',true)")

    # The same person won two sources: no draw until the director picks the runner-up for one.
    page.evaluate("""()=>{const st=KSMTest.app.state;st.generated=false;
      st.competitors=st.competitors.map(c=>c.division==='Masters'&&c.name==='Eli'?{...c,name:'Aki',dojo:'Aki Dojo'}:c);}""")
    dup = page.evaluate("KSMTest.addGrandChampion(['Open','Masters'],{name:'Twice'})")
    page.evaluate('KSMTest.app.generatePools({validated:true})')
    page.evaluate("""()=>{for(let i=0;i<4;i++){const m=KSMTest.prepareCourt('A');if(!m)break;KSMTest.play([[m.white==='Aki'?'W':'R','M']]);}}""")
    assert not gc_matches(app, dup), 'drew the same person twice'
    app.nav('setup')
    rows = page.locator(sel('grand-champion-status')).all_text_contents()
    assert any('The same person won Masters' in t for t in rows), rows
    page.locator(sel('grand-champion-withdraw')).last.click()
    q = page.evaluate('KSMTest.grandChampionQuestion()')
    assert q['choices'] == ['runner-up', 'cancel'], q
    choose(app, 'runner-up')
    final = gc_matches(app, dup)
    assert sorted([final[0]['white'], final[0]['red']]) == ['Aki', 'Fay'], final

    # PR review: a pool of winners under way; a winner who has not played yet withdraws, the runner-up
    # takes their place (no question, nothing played touched).
    page.evaluate("""()=>{const st=KSMTest.app.state;st.generated=false;
      st.competitors=st.competitors.map(c=>c.division==='Masters'&&c.name==='Aki'?{...c,name:'Eli',dojo:'Eli Dojo'}:c);}""")
    sub = page.evaluate("KSMTest.addGrandChampion(['Open','Women','Masters'],{format:'Round Robin',court:'B',name:'Sub Pool'})")
    page.evaluate('KSMTest.app.generatePools({validated:true})')
    for court in ('A', 'B', 'A'):
        play_court(app, court, [['W', 'M']])
    pool = gc_matches(app, sub)
    page.evaluate("id=>{const m=KSMTest.prepareCourt('B');KSMTest.play([['W','M']]);}", sub)
    pool = gc_matches(app, sub)
    first = next(m for m in pool if m['done'])
    winners = {d: page.evaluate(f"KSMTest.finalState()['{d}'].placements[0].name") for d in ('Open', 'Women', 'Masters')}
    waiting_source, waiting_player = next((d, n) for d, n in winners.items() if n not in (first['white'], first['red']))
    app.nav('setup')
    page.locator(sel('grand-champion-withdraw')).last.click()
    choose(app, 'source:' + waiting_source)
    choose(app, 'runner-up')
    assert not page.evaluate('KSMTest.grandChampionQuestion()'), 'asked although nothing of theirs was played'
    after = gc_matches(app, sub)
    runner_up = page.evaluate(f"KSMTest.finalState()['{waiting_source}'].placements[1].name")
    assert next(m for m in after if m['done']) == first, 'a played bout changed'
    names = {n for m in after for n in (m['white'], m['red'])}
    assert runner_up in names and waiting_player not in names, after
    assert not problems, problems
    page.close()


def merge_cases(browser, base):
    """Two devices: Setup edits of the same row race (409), and both finish a source at once."""
    problems = []
    a = KsmApp.open_device(browser, base, 'A', problems, tournament_name='Grand champion sync')
    tid = a.create_tournament(); a.wait_idle()
    a.page.evaluate('entries=>KSMTest.configure(entries)', DIVISIONS[:2])
    a.page.evaluate('KSMTest.app.state.generated=false')
    gc = a.page.evaluate("KSMTest.addGrandChampion(['Open','Women'],{court:'A'})")
    a.save_now(); a.wait_idle()
    b = KsmApp.open_device(browser, base, 'B', problems, f'?tournament={tid}')
    b.staff_login(); b.wait_idle(); b.watch_conflicts()

    def race(mine, theirs):
        a.wait_idle(); b.wait_idle()
        b.hold_next_save(); mine()
        b.page.evaluate("KSMTest.saveNow('Grand champion race')")
        b.wait_held_save()
        theirs(); a.save_now(); a.wait_idle()
        b.release_save(); b.wait_idle()
        rev = fetch_record(base, tid)['revision']; a.wait_revision(rev); b.wait_revision(rev)
        return fetch_record(base, tid)['payload']['state']

    st = race(lambda: b.page.evaluate("id=>KSMTest.updateGrandChampion(id,{court:'B'})", gc),
              lambda: a.page.evaluate("id=>KSMTest.updateGrandChampion(id,{name:'Kings and Queens',awardMode:'top2'})", gc))
    row = st['grandChampions'][0]
    assert (row['court'], row['name'], row['awardMode']) == ('B', 'Kings and Queens', 'top2'), row
    assert st['divisionCourts'][gc] == 'B'
    st = race(lambda: b.page.evaluate("id=>KSMTest.updateGrandChampion(id,{court:'A'})", gc),
              lambda: a.page.evaluate("id=>KSMTest.removeGrandChampion(id)", gc))
    assert st.get('grandChampions') == [], 'a removed row came back'
    assert 'Grand champion' in b.page.evaluate('KSMTest.diagnostics().mergeConflicts'), b.page.evaluate('KSMTest.diagnostics()')

    # Both sources finish at once on two devices (B's save meets A's): one draw, both winners.
    a.page.evaluate('KSMTest.app.state.generated=false')
    gc = a.page.evaluate("KSMTest.addGrandChampion(['Open','Women'],{court:'B',name:'Grand Champion'})")
    a.page.evaluate('KSMTest.app.generatePools({validated:true})')
    a.save_now(); a.wait_idle(); b.wait_revision(fetch_record(base, tid)['revision'])
    st = race(lambda: play_court(b, 'B', [['W', 'M']]), lambda: play_court(a, 'A', [['W', 'M']]))
    rev = fetch_record(base, tid)['revision']
    final = st['allMatches'].get(gc) or []
    winners = {st_div: next(m for m in st['allMatches'][st_div] if m.get('position') == 'Final') for st_div in ('Open', 'Women')}
    assert all(m['done'] for m in winners.values()), 'a source result was lost in the race'
    assert len(final) == 1 and final[0]['white'] and final[0]['red'], final
    for device in (a, b):
        device.wait_revision(rev)
        assert device.payload()['state']['allMatches'][gc] == final, f'{device.name} has another draw'

    # Court B scores the grand champion while A corrects Open (not started on A: drawn again). B's
    # point was for the old players: it is not moved onto the new pairing, and B is told.
    old_pair = {final[0]['white'], final[0]['red']}
    def score_on_b():
        b.page.evaluate("KSMTest.prepareCourt('B')"); b.open_court('B'); b.score_point('W', 'M')
    def correct_on_a():
        a.open_court('A'); a.undo(); a.undo(); a.page.evaluate("KSMTest.play([['R','M']])")
    st = race(score_on_b, correct_on_a)
    redrawn = st['allMatches'][gc][0]
    assert {redrawn['white'], redrawn['red']} != old_pair, redrawn
    assert redrawn['wp'] == [] and redrawn['rp'] == [] and not redrawn['done'], f'a point for the old players landed on the new pairing: {redrawn}'
    b.wait_toast('Grand Champion: the players changed on another device, so this court\'s score for the old players was not saved.')

    # Review #86: B finishes the last source and scores the grand champion before its save lands; the
    # server copy has no draw yet (A saved meanwhile). B's draw and score are kept.
    a.page.evaluate('KSMTest.app.state.generated=false')
    late = a.page.evaluate("KSMTest.addGrandChampion(['Open','Women'],{court:'B',name:'Late'})")
    a.page.evaluate('KSMTest.app.generatePools({validated:true})')
    play_court(a, 'A', [['W', 'M']])
    a.save_now(); a.wait_idle(); b.wait_revision(fetch_record(base, tid)['revision'])
    def finish_and_score_on_b():
        play_court(b, 'B', [['W', 'M']])
        b.page.evaluate("id=>{KSMTest.prepareCourt('B');}", late); b.open_court('B'); b.switch_division('Late'); b.score_point('R', 'K')
    st = race(finish_and_score_on_b, lambda: a.page.evaluate("id=>KSMTest.updateGrandChampion(id,{awardMode:'top2'})", late))
    got = st['allMatches'].get(late) or []
    assert len(got) == 1 and got[0]['rp'] == ['K'], f'B\'s grand champion score was lost in the rebase: {got}'
    assert next(g for g in st['grandChampions'] if g['id'] == late)['awardMode'] == 'top2'
    assert b.conflicts() >= 3, b.conflicts()

    # PR review: two devices withdraw different winners at once: both stand-ins are kept.
    a.page.evaluate('''entries=>{const st=KSMTest.app.state;st.generated=false;st.divisions.push('Masters');st.divisionTypes.Masters='Single Elimination';
      st.divisionCourts.Masters='A';st.competitors.push(...entries.map(e=>({...e,division:'Masters'})));}''', DIVISIONS[2]['entrants'])
    both = a.page.evaluate("KSMTest.addGrandChampion(['Open','Women'],{court:'B',name:'Both out'})")
    tie = a.page.evaluate("KSMTest.addGrandChampion(['Open','Women','Masters'],{court:'B',name:'Tie Pool',format:'Round Robin'})")
    a.page.evaluate('KSMTest.app.generatePools({validated:true})')
    for court in ('A', 'B', 'A'):
        play_court(a, court, [['W', 'M']])
    a.save_now(); a.wait_idle(); b.wait_revision(fetch_record(base, tid)['revision'])
    def withdraw(device, source):
        device.nav('setup')
        device.page.click(f'[data-grand-champion-id="{both}"] + tr {sel("grand-champion-withdraw")}')
        choose(device, 'source:' + source); choose(device, 'runner-up')
    st = race(lambda: withdraw(b, 'Open'), lambda: withdraw(a, 'Women'))
    row = next(g for g in st['grandChampions'] if g['id'] == both)
    assert set(row.get('standIns', {})) == {'Open', 'Women'}, f'a withdrawal was undone by the other device: {row}'
    pair = st['allMatches'][both][0]
    finals = {d: next(m for m in st['allMatches'][d] if m.get('position') == 'Final') for d in ('Open', 'Women')}
    losers = {(f['red'] if f['wp'] else f['white']) for f in finals.values()}
    assert {pair['white'], pair['red']} == losers, (pair, losers)

    # PR review: a pool of winners' tiebreak made on Court B during a save conflict reaches the server.
    play_pool = """id=>{KSMTest.prepareCourt('B');KSMTest.app.selectScorekeeperDivision(id);const st=KSMTest.app.state,m=st.matches[st.current];
      const wins={};for(const x of st.allMatches[id])if(x.done){const w=x.wp.length>x.rp.length?x.white:x.red;wins[w]=(wins[w]||0)+1}
      KSMTest.play([[(wins[m.white]||0)<(wins[m.red]||0)?'W':'R','M']]);}"""
    for _ in range(2):
        b.page.evaluate(play_pool, tie)
    b.save_now(); b.wait_idle(); a.wait_revision(fetch_record(base, tid)['revision'])
    def last_bout_on_b():
        b.page.evaluate(play_pool, tie)
        # Replayed by its index patches (as an entry without match ops is), the path the guard is on.
        b.page.evaluate("()=>{const h=KSMTest.app.state.courtActionHistory.B;delete h[h.length-1].matchOps}")
    st = race(last_bout_on_b, lambda: a.page.evaluate("id=>KSMTest.updateGrandChampion(id,{awardMode:'top2'})", tie))
    bouts = st['allMatches'][tie]
    assert sum(1 for m in bouts if m.get('tiebreak')) >= 1 and sum(1 for m in bouts if m['done'] and not m.get('tiebreak')) == 3, f'the tiebreak or the last bout was dropped: {bouts}'
    assert next(g for g in st['grandChampions'] if g['id'] == tie)['awardMode'] == 'top2'
    assert not problems, problems
    a.close(); b.close()


def main():
    with sync_playwright() as p:
        browser = launch_chromium(p)
        local_cases(browser)
        pool_and_fusen_cases(browser)
        with local_worker() as base:
            merge_cases(browser, base)
        browser.close()
    print('PASS grand champion: setup, fill-in, court queue, awards on Results/TV/print, withdrawals, corrections before/after start, pool, two-device race')


if __name__ == '__main__':
    main()
