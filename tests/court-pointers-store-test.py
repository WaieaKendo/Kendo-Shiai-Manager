"""The court pointers in the store (#15 PR 13a, docs/STORE.md section 3 item 13).

`courtState`, `courtActiveDivision` and `currentByDivision` are the `tournament` slice's; `state` reads them through
getters and every write is one action (app/modules/court/court-pointers-store.js): `court/divisionSelected` (a court's
scorekeeper picking a division), `court/pointerMoved` (Next Match, a render's self-heal, the catch-up after Staff Login),
`court/pointersResolved` (a structural edit re-resolving the courts), the draw actions (a division drawn with its
queue position) and `tournament/divisionRenamed` (the rename rewrites the courts' divisions). No behaviour change.
Checked (one offline page, strict store: a write the conversion missed, a pointer edited in place included, throws):

  1. The saved snapshot is the same, value for value: after each step (a court's division picked and renamed before the
     draw; several divisions drawn on two courts; Next Match through pools, a bracket and a team bracket on both courts;
     a director on Court A picking a division; a spectator and a TV on Court B picking a division and drawing Court B; a
     Court B tablet picking before Staff Login, then the login's catch-up; the catch-up before a court action; Undo and
     Redo across a Next Match; a tiebreak created while play goes on; Edit Pool; a single division regenerated; a
     4.0-shaped load with and without `courtActiveDivision` and with a court missing; a remote apply while a spectator
     shows another division; two save conflicts (both courts pressing Next Match at once; a tablet catching up after
     Staff Login against the other court's Next Match); the tournament closed; another tournament loaded), every key of
     `tournamentPayload().state` has the JSON the code before PR 13a saved (EXPECTED_FILE, recorded by running this
     file with `--dump` on next/4.1 at 726880b with this PR's two test API entries added; random ids, times and the tab
     id are replaced by marks; keys other than the court pointers and the view are kept as a hash). As in PR 12b, a
     court action's patches are compared grouped by top-level key (their order follows Object.keys(state), which after
     a load differs once a key is a store getter: docs/STORE.md section 3 item 5 (3)).
  2. (this PR's code only) No half state: at every court/* notification, each court's pointer is inside its division's
     match list, and Next Match's pointer is never on the bout it just finished.
  3. Strict store: writing a pointer map, a court's entry or its index in place throws.
"""
import hashlib
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

DUMP = '--dump' in sys.argv
EXPECTED_FILE = Path(__file__).parent / 'store/fixtures/court-pointers-snapshots-before.json'
checks = 0

SNAPSHOT = r"""() => {
  const p = KSMTest.app.tournamentPayload(), st = p.state;
  const byKey = v => { if (Array.isArray(v)) return v.map(byKey); if (!v || typeof v !== 'object') return v;
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, byKey(x)]));
    if (Array.isArray(o.patches) && o.patches.every(x => x && Array.isArray(x.path))) o.patches = [...o.patches].sort((x, y) => String(x.path[0]) < String(y.path[0]) ? -1 : String(x.path[0]) > String(y.path[0]) ? 1 : 0);
    return o; };
  for (const k of ['courtActionHistory', 'courtRedoHistory', 'courtUndoLog']) if (st[k] !== undefined) st[k] = byKey(st[k]);
  if (Array.isArray(st.divisionRenames)) st.divisionRenames = st.divisionRenames.map((r, i) => ({...r, id: `rename ${i}`}));
  const ids = new Map(), number = text => text.replace(/(team|gc):[0-9a-f]{24,32}/g, id => { if (!ids.has(id)) ids.set(id, `${id.split(':')[0]} #${ids.size}`); return ids.get(id); })
    .replace(/"tabId":"[^"]*"/g, '"tabId":"<tab>"').replace(/"clientId":"[^"]*"/g, '"clientId":"<client>"').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/":1[6-9]\d{11}\b/g, '":<ms>');
  const values = {};
  for (const k of Object.keys(st).sort()) values[k] = number(JSON.stringify(st[k]) ?? 'undefined');
  return {keys: Object.keys(st), values};
}"""
KEPT = {'courtState', 'courtActiveDivision', 'currentByDivision', 'currentDivision', 'currentCourt', 'current'}


def shrink(snapshot):
    return {**snapshot, 'values': {k: v if k in KEPT else 'sha256:' + hashlib.sha256(v.encode()).hexdigest() for k, v in snapshot['values'].items()}}


# The draws shuffle with Math.random: the same seed before every step, so both versions draw the same brackets.
SEED = r"""() => { let a = 13; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""
RR, SE, KIDS, JUN = 'Open RR', 'Open SE', 'Kids', 'Juniors'
DRAG_JS = """([player, pool, index]) => {
  const dt = new DataTransfer(), source = document.querySelector(player), target = document.querySelectorAll(pool)[index];
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt}));
  fire(source, 'dragstart'); fire(target, 'dragover'); fire(target, 'drop'); fire(source, 'dragend');
}"""


def ev(script, arg=None):
    return lambda pg: pg.evaluate(script, arg)


def entrants(prefix, n, status='Checked'):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i % 3}', 'seed': '', 'status': status} for i in range(n)]


def configure(team=True, kids=3):
    divisions = [{'name': RR, 'format': 'Round Robin', 'court': 'split', 'entrants': entrants('R', 8)},
                 {'name': SE, 'format': 'Single Elimination', 'court': 'split', 'entrants': entrants('S', 6)},
                 {'name': KIDS, 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('K', kids)},
                 {'name': JUN, 'format': 'Round Robin', 'court': 'B', 'entrants': entrants('J', 4)}]
    if team:
        divisions.append({'team': True, 'format': '3-Person Team', 'tournament': 'Single Elimination', 'court': 'B', 'teams': 4})
    return ev('entries => KSMTest.configure(entries)', divisions)


def load(state_over=None, drop=(), source='court pointers store test', live=False):
    """A load of this page's own payload with some fields changed (a 4.0 device saves every field)."""
    return ev(r"""([over, drop, source, live]) => {
      const p = KSMTest.app.tournamentPayload();
      for (const k of drop) delete p.state[k];
      for (const [k, v] of Object.entries(over)) p.state[k] = v === null ? undefined : v;
      if (live) KSMTest.app.applyTournamentPayload(p, false, {pinnedCourt: KSMTest.app.state.currentCourt, preserveLocalDivision: true, source: 'live sync'});
      else KSMTest.app.applyTournamentPayload(p, false, {source});
    }""", [state_over or {}, list(drop), source, live])


# A save conflict: `local` is this page's payload after `edit` (the app's own functions); `server` is the same base
# edited as JSON by `remote`; the rebase merges them on payload copies and the result is applied as a load.
def conflict(edit, remote):
    return ev(r"""async ([edit, remote]) => {
      const base = KSMTest.app.tournamentPayload();
      base.state.courtActionHistory = {A: [], B: []}; base.state.courtRedoHistory = {A: [], B: []};
      KSMTest.app.applyTournamentPayload(structuredClone(base), false, {source: 'court pointers store test base'});
      await (new Function('return (async () => {' + edit + '})()'))();
      const local = KSMTest.app.tournamentPayload(), server = structuredClone(base);
      (new Function('p', remote))(server);
      const merged = KSMTest.app.rebaseLocalPayloadOnRecord(local, {payload: server, revision: 1}, 0, base);
      KSMTest.app.applyTournamentPayload(merged, false, {source: 'court pointers store test merge'});
    }""", [edit, remote])


PLAY = """async ([court, n, pts]) => { const played = []; for (let i = 0; i < n; i++) { const m = KSMTest.prepareCourt(court); if (!m) break; played.push(m.division); KSMTest.play(pts); }
  KSMTest.saveNow('played'); await new Promise(r => setTimeout(r, 300)); return played; }"""
# A device that cannot write the tournament (a spectator, a TV link): a cloud tournament seen without Staff Login.
AS_SPECTATOR = "KSMTest.app.cloudSession.tournamentId = 'court-pointers-cup'; KSMTest.app.ksmSessionRole = 'spectator';"
AS_LOCAL = "KSMTest.app.cloudSession.tournamentId = ''; KSMTest.app.ksmSessionRole = 'staff';"
# A court action's own Next Match on Court B in a server copy (the other court's save).
REMOTE_B_NEXT = f"""const st = p.state, d = st.courtState.B && st.courtState.B.division, arr = st.allMatches[d] || [];
  const i = arr.findIndex((m, k) => k >= (st.courtState.B.index || 0) && !m.done && m.court === 'B' && m.white && m.red);
  if (i >= 0) {{ arr[i].wp = ['M']; arr[i].done = true; const n = arr.findIndex((m, k) => k > i && !m.done && m.court === 'B');
    st.courtState.B = {{division: d, index: n < 0 ? arr.length : n}}; st.courtActiveDivision.B = d; st.currentByDivision[d] = st.courtState.B.index; }}"""


def play(court, n, pts=(('W', 'M'),)):
    return ev(PLAY, [court, n, [list(x) for x in pts]])


def court_do(court, fn):
    """Undo / Redo on `court` (the court's own buttons call these)."""
    return ev("""([court, fn]) => { KSMTest.prepareCourt(court); window[fn](); }""", [court, fn])


def edit_pool(div):
    """Registration -> Pools -> Edit Pool: the first player dragged onto the second pool, Save Pool Changes."""
    def run(page):
        page.evaluate("""div => { KSMTest.app.regTab('pools'); const s = document.getElementById('poolDiv'); s.value = div; KSMTest.app.renderPools(); KSMTest.app.toggleEditPools(); }""", div)
        page.wait_for_selector('[data-testid="pool-edit-player"]', state='attached')
        page.evaluate(DRAG_JS, ['[data-testid="pool-edit-player"]', '[data-testid="pool-edit-pool"]', 1])
        page.evaluate("""() => document.querySelector('[data-testid="pool-edit-save"]').click()""")
    return run


def steps():
    return [
        ('opened', None),
        ('a court\'s division picked, then renamed, before the draw', ev(f"""() => {{ KSMTest.app.setDivisionLists({{divisions: ['{JUN}', 'Masters'], divisionTypes: {{'{JUN}': 'Round Robin', Masters: 'Round Robin'}}, divisionCourts: {{'{JUN}': 'B', Masters: 'A'}}}});
            KSMTest.app.chooseCourt('B'); KSMTest.app.selectScorekeeperDivision('{JUN}'); KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('Masters');
            KSMTest.app.ksmRenameSetupDivision('{JUN}', 'Juniors U15'); KSMTest.app.ksmRenameSetupDivision('Masters', 'Masters 40'); }}""")),
        ('generated: pools (split), single elimination (split), two round robins, a team bracket', configure()),
        ('a single division regenerated', ev(f"() => KSMTest.app.regenerateSingleDivision('{SE}')")),
        ('Edit Pool saved', edit_pool(RR)),
        ('a director on Court A picks Kids', ev(f"() => {{ KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('{KIDS}'); }}")),
        ('court A: Kids bouts drawn (a tiebreak)', play('A', 3, ())),
        ('court A: 4 bouts', play('A', 4)),
        ('court B: 4 bouts', play('B', 4)),
        ('the director on Court A draws Live Scores and the TV for Court B', ev("() => { KSMTest.app.setPublicCourt('B'); KSMTest.app.renderPublic(); KSMTest.renderTv(); KSMTest.app.setPublicCourt('A'); }")),
        ('a spectator on Court B picks Juniors and draws Court B', ev(f"() => {{ {AS_SPECTATOR} KSMTest.app.chooseCourt('B'); KSMTest.app.selectScorekeeperDivision('{JUN}'); KSMTest.app.renderPublic(); KSMTest.renderTv(); }}")),
        ('the spectator\'s TV view on Court B', ev(f"() => {{ KSMTest.app.selectScorekeeperDivision('{SE}'); KSMTest.renderTv(); }}")),
        ('a remote apply while the spectator shows another division', load({}, live=True)),
        ('Staff Login on the Court B tablet: the catch-up', ev(f"() => {{ KSMTest.app.selectScorekeeperDivision('{JUN}'); KSMTest.app.ksmAccountSetRole('staff'); }}")),
        ('back to a local tournament', ev(f"() => {{ {AS_LOCAL} }}")),
        ('the catch-up before a court action', ev(f"""() => {{ {AS_SPECTATOR} KSMTest.app.chooseCourt('B'); KSMTest.app.selectScorekeeperDivision('{RR}');
            KSMTest.app.ksmSessionRole = 'staff'; KSMTest.app.cloudSession.tournamentId = ''; KSMTest.play([['R', 'K']]); }}""")),
        ('court B: 6 bouts', play('B', 6)),
        ('court A: Next Match undone', court_do('A', 'undo')),
        ('court A: redone', court_do('A', 'redo')),
        ('court A: undone twice', ev("() => { KSMTest.prepareCourt('A'); undo(); undo(); }")),
        ('court A: 3 bouts after the undo', play('A', 3)),
        ('court A: 12 bouts', play('A', 12)),
        ('court B: 12 bouts', play('B', 12)),
        ('load: 4.0 shape without courtActiveDivision', load({}, drop=('courtActiveDivision',))),
        ('load: a court missing from courtState', load({'courtState': {'A': {'division': RR, 'index': 0}}})),
        ('load: without courtState and courtActiveDivision', load({}, drop=('courtState', 'courtActiveDivision'))),
        ('court B: 6 bouts after the loads', play('B', 6)),
        ('conflict: both courts press Next Match at once', conflict(
            "KSMTest.prepareCourt('A'); KSMTest.play([['W', 'M']]);", REMOTE_B_NEXT)),
        ('conflict: a Court B tablet catches up after Staff Login against Court B\'s Next Match elsewhere', conflict(
            f"""{AS_SPECTATOR} KSMTest.app.chooseCourt('B'); KSMTest.app.selectScorekeeperDivision('{JUN}'); {AS_LOCAL} KSMTest.app.ksmAccountSetRole('staff'); KSMTest.play([['W', 'K']]);""",
            REMOTE_B_NEXT)),
        ('court A: the rest', play('A', 60)),
        ('court B: the rest', play('B', 60)),
        ('kept for the switch', ev("() => { window.__pointersKept = KSMTest.app.tournamentPayload(); }")),
        ('the tournament closed', ev("() => KSMTest.app.ksmResetTournament()")),
        ('another tournament drawn', configure(team=False, kids=4)),
        ('court A: 3 bouts there', play('A', 3)),
        ('the first tournament loaded again', ev("() => KSMTest.app.applyTournamentPayload(window.__pointersKept, false, {pinnedCourt: 'A', source: 'tournament switch'})")),
    ]


def compare(name, got, want):
    global checks
    assert sorted(got['keys']) == sorted(want['keys']), f'{name}: keys {sorted(set(got["keys"]) ^ set(want["keys"]))}'; checks += 1
    for key in want['keys']:
        assert got['values'][key] == want['values'][key], f'{name}: state.{key}\n  now    {got["values"][key][:900]}\n  before {want["values"][key][:900]}'
        checks += 1


def strict_writes(page):
    """3: a pointer map, a court's entry or its index written in place throws in the browser tests (the store runs strict)."""
    global checks
    configure()(page)
    for write in ("KSMTest.app.state.courtState = {}", "KSMTest.app.state.courtState.A = {division: null, index: 0}",
                  "KSMTest.app.state.courtState.A.index = 3", "KSMTest.app.state.courtState.B.division = 'x'", "delete KSMTest.app.state.courtState.B",
                  "KSMTest.app.state.courtActiveDivision = {}", "KSMTest.app.state.courtActiveDivision.A = 'x'",
                  "KSMTest.app.state.currentByDivision = {}", f"KSMTest.app.state.currentByDivision['{RR}'] = 2", f"delete KSMTest.app.state.currentByDivision['{RR}']"):
        threw = page.evaluate(f"() => {{ 'use strict'; try {{ {write}; return false; }} catch (e) {{ return e instanceof TypeError; }} }}")
        assert threw, f'{write} did not throw'; checks += 1


def no_half_state(page):
    """2: at every court/* notification the courts' pointers are inside their lists; Next Match's never on the bout it finished."""
    global checks
    load_app(page)
    page.evaluate(SEED)
    configure()(page)
    got = page.evaluate(r"""async () => {
      const store = window.KSMStore, a = KSMTest.app, bad = [], types = [];
      const dispatch = store.dispatch;
      store.dispatch = action => { types.push(action.type); return dispatch(action); };
      let finished = null;
      const check = () => {
        const type = types[types.length - 1];
        if (!String(type).startsWith('court/')) return;
        const t = store.getState().tournament;
        for (const [c, cs] of Object.entries(t.courtState || {})) {
          const list = cs && cs.division != null ? a.state.allMatches[cs.division] : null;
          if (Array.isArray(list) && !(cs.index >= 0 && cs.index <= list.length)) bad.push([type, c, cs, list.length]);
          if (finished && type === 'court/pointerMoved' && Array.isArray(list) && list[cs.index] === finished) bad.push([type, c, 'on the bout it finished']);
        }
      };
      const off = store.subscribe(check);
      for (const court of ['A', 'B', 'A', 'B', 'A', 'B']) for (let i = 0; i < 15; i++) {
        const m = KSMTest.prepareCourt(court); if (!m) break; finished = m; KSMTest.play([['W', 'M']]); finished = null;
      }
      off(); store.dispatch = dispatch;
      return {bad: bad.slice(0, 5), moved: types.filter(t => t === 'court/pointerMoved').length};
    }""")
    assert not got['bad'], got; checks += 1
    assert got['moved'] > 0, got; checks += 1


def main():
    global checks
    started = time.time()
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: d.accept())
        load_app(page)
        expected = None if DUMP else json.loads(EXPECTED_FILE.read_text())
        seen = {}
        for name, run in steps():
            page.evaluate(SEED)
            if run:
                run(page)
            seen[name] = shrink(page.evaluate(SNAPSHOT))
            if DUMP:
                sys.stderr.write(f"{name}: {page.evaluate('() => [Object.values(KSMTest.app.state.allMatches).flat().filter(m => m.done).length, JSON.stringify(KSMTest.app.state.courtState), (KSMTest.app.state.allMatches.Kids||[]).length]')}\n")
            assert not errors, f'{name}: {errors}'
            if not DUMP:
                compare(name, seen[name], expected[name])
        if DUMP:
            print(json.dumps(seen, indent=1, ensure_ascii=False))
        else:
            assert list(seen) == list(expected), 'the same steps as recorded'; checks += 1
            strict_writes(page)
            no_half_state(browser.new_page())
            assert not errors, errors
        browser.close()
    if not DUMP:
        print(f'PASS court pointers store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
