"""The court history and Undo/Redo in the store (#15 PR 13b, docs/STORE.md section 3 item 13).

`courtActionHistory`, `courtRedoHistory` and `courtUndoLog` are the `tournament` slice's; `state` reads them through
getters and every write is one court/… action (app/modules/court/court-history-store.js): `court/actionRecorded` (a
court action's entry pushed, the Redo list cleared, the list trimmed), `court/undo` / `court/redo` (the entry moved
between the lists, the F30 Undo log appended, and every store-owned key the entry's patches change, in one dispatch),
`court/historyNormalized` (the maps created, old-format entries dropped) and `court/historyForgotten` (a grand
champion's draw cleared: its bouts' patches dropped). No behaviour change. Checked (one offline page, strict store: a
write the conversion missed, an entry edited in place included, throws):

  1. The saved snapshot is the same, value for value: after each step (points and hansoku on Court A, each
     undone and redone; a new action clearing Redo; Next Match, undone and redone across it; Court B's bouts and Undos;
     a bracket bout that advances its winner undone and redone (#199 review L1); bouts drawn into a tiebreak, the Next
     Match that inserted it undone and redone; the history limit reached (105 actions); the Undo log limit reached (21
     Undo / Redo pairs); a Redo after a remote apply; a 4.0-shaped save with old entries (no identities, a pre-patch-v1
     entry) loaded and its entries undone and redone; four save conflicts (two devices on different courts, then one
     undoes; an Undo here while the other court's history arrives; the F30 log replayed by the rebase; a Redo here
     against the other court's Next Match); the grand champion drawn, the Next Match that drew it undone and redone, a point on it undone, the draw cleared (its history
     forgotten); the tournament closed; another tournament played; the first loaded again), every key of
     `tournamentPayload().state` has the JSON the code before PR 13b saved (EXPECTED_FILE, recorded by running this file
     with `--dump` on next/4.1 at 2a805d3; random ids, times and the tab id are replaced by marks; keys other than the
     history, the pointers and the view are kept as a hash). The history is compared exactly: entry order, patch order,
     every field (by hash).
  2. (this PR's code only) Strict store: writing a history map, a court's list, a list method or an entry in place throws.
"""
import hashlib
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

DUMP = '--dump' in sys.argv
EXPECTED_FILE = Path(__file__).parent / 'store/fixtures/court-history-snapshots-before.json'
checks = 0

SNAPSHOT = r"""() => {
  const p = KSMTest.app.tournamentPayload(), st = p.state;
  if (Array.isArray(st.divisionRenames)) st.divisionRenames = st.divisionRenames.map((r, i) => ({...r, id: `rename ${i}`}));
  const ids = new Map(), number = text => text.replace(/(team|gc):[0-9a-f]{24,32}/g, id => { if (!ids.has(id)) ids.set(id, `${id.split(':')[0]} #${ids.size}`); return ids.get(id); })
    .replace(/"tabId":"[^"]*"/g, '"tabId":"<tab>"').replace(/"clientId":"[^"]*"/g, '"clientId":"<client>"').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/":1[6-9]\d{11}\b/g, '":<ms>');
  const values = {};
  for (const k of Object.keys(st).sort()) values[k] = number(JSON.stringify(st[k]) ?? 'undefined');
  return {keys: Object.keys(st), values};
}"""
KEPT = {'courtState', 'courtActiveDivision', 'currentByDivision', 'currentDivision', 'current', 'score'}
# The history is compared by hash too (its JSON is megabytes over the steps); run with --dump on both versions to see a difference.


def shrink(snapshot):
    return {**snapshot, 'values': {k: v if k in KEPT else 'sha256:' + hashlib.sha256(v.encode()).hexdigest() for k, v in snapshot['values'].items()}}


SEED = r"""() => { let a = 17; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""
RR, SE, KIDS, JUN = 'Open RR', 'Open SE', 'Kids', 'Juniors'


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


def on(court, script):
    """`script` on `court` (the court opened as its own buttons would be pressed there)."""
    return ev(f"() => {{ KSMTest.prepareCourt('{court}'); {script} }}")


def load(state_over=None, drop=(), source='court history store test', live=False, edit=''):
    """A load of this page's own payload with some fields changed (`edit`: JS on `p`, the payload)."""
    return ev(r"""([over, drop, source, live, edit]) => {
      const p = KSMTest.app.tournamentPayload();
      for (const k of drop) delete p.state[k];
      for (const [k, v] of Object.entries(over)) p.state[k] = v === null ? undefined : v;
      (new Function('p', edit))(p);
      if (live) KSMTest.app.applyTournamentPayload(p, false, {pinnedCourt: KSMTest.app.state.currentCourt, preserveLocalDivision: true, source: 'live sync'});
      else KSMTest.app.applyTournamentPayload(p, false, {source});
    }""", [state_over or {}, list(drop), source, live, edit])


# A save conflict: `local` is this page's payload after `edit` (the app's own functions) on `base` (this page's payload,
# with its history when `keep_history`); `server` is the same base edited as JSON by `remote`; the rebase merges them on
# payload copies and the result is applied as a load.
def conflict(edit, remote, keep_history=False):
    return ev(r"""async ([edit, remote, keep]) => {
      const base = KSMTest.app.tournamentPayload();
      if (!keep) { base.state.courtActionHistory = {A: [], B: []}; base.state.courtRedoHistory = {A: [], B: []}; }
      KSMTest.app.applyTournamentPayload(structuredClone(base), false, {source: 'court history store test base'});
      await (new Function('return (async () => {' + edit + '})()'))();
      const local = KSMTest.app.tournamentPayload(), server = structuredClone(base);
      (new Function('p', remote))(server);
      const merged = KSMTest.app.rebaseLocalPayloadOnRecord(local, {payload: server, revision: 1}, 0, base);
      KSMTest.app.applyTournamentPayload(merged, false, {source: 'court history store test merge'});
    }""", [edit, remote, keep_history])


PLAY = """async ([court, n, pts]) => { const played = []; for (let i = 0; i < n; i++) { const m = KSMTest.prepareCourt(court); if (!m) break; played.push(m.division); KSMTest.play(pts); }
  KSMTest.saveNow('played'); await new Promise(r => setTimeout(r, 300)); return played; }"""


def play(court, n, pts=(('W', 'M'),)):
    return ev(PLAY, [court, n, [list(x) for x in pts]])


# Court B's Next Match in a server copy (the other court's save), with the court action entry its device recorded.
REMOTE_B_NEXT = r"""const st = p.state, d = st.courtState.B && st.courtState.B.division, arr = st.allMatches[d] || [];
  const i = arr.findIndex((m, k) => k >= (st.courtState.B.index || 0) && !m.done && m.court === 'B' && m.white && m.red);
  if (i >= 0) { const was = JSON.parse(JSON.stringify(arr[i])); arr[i].wp = ['M']; arr[i].done = true; const n = arr.findIndex((m, k) => k > i && !m.done && m.court === 'B');
    st.courtState.B = {division: d, index: n < 0 ? arr.length : n}; st.courtActiveDivision.B = d; st.currentByDivision[d] = st.courtState.B.index;
    st.courtActionHistory = st.courtActionHistory || {A: [], B: []}; st.courtActionHistory.B = st.courtActionHistory.B || [];
    st.courtActionHistory.B.push({format: 'patch-v1', label: 'Next Match: remote', court: 'B', when: '2030-01-01T00:00:00.000Z', clientId: 'other-device', tabId: 'other-tab', revision: 1,
      patches: [{path: ['allMatches', d, i, 'wp'], before: was.wp || [], after: ['M']}, {path: ['allMatches', d, i, 'done'], before: Boolean(was.done), after: true}], identityStamps: 1}); }"""

# A 4.0-shaped history: entries without the identity stamps (matchIdentities, indexRefs, identityStamps, matchOps), and a
# pre-patch-v1 entry (dropped on the first ensureCourtHistory()).
OLD_ENTRIES = r"""for (const key of ['courtActionHistory', 'courtRedoHistory']) for (const c of ['A', 'B']) {
    const list = (p.state[key] || {})[c] || [];
    list.forEach(e => { delete e.identityStamps; delete e.matchOps; (e.patches || []).forEach(x => { delete x.matchIdentities; delete x.indexRefs; delete x.matchIdentity; }); });
  }
  p.state.courtActionHistory.A.unshift({format: 'snapshot', label: 'Old action', court: 'A', when: '2024-01-01T00:00:00.000Z', state: {}});"""


def steps():
    return [
        ('opened', None),
        ('generated: pools (split), single elimination (split), two round robins, a team bracket', configure()),
        ('court A: points, a hansoku pair, a point', on('A', "point('W', 'M'); hansoku('R'); hansoku('R'); point('R', 'K');")),
        ('court A: two undone', on('A', 'undo(); undo();')),
        ('court A: one redone', on('A', 'redo();')),
        ('court A: a new point clears Redo', on('A', "point('W', 'K');")),
        ('court A: a hansoku, undone and redone', on('A', "hansoku('W'); undo(); redo();")),
        ('court A: Next Match', on('A', 'nextMatch();')),
        ('court A: Next Match undone', on('A', 'undo();')),
        ('court A: Next Match redone', on('A', 'redo();')),
        ('court A: undone across Next Match (twice)', on('A', 'undo(); undo();')),
        ('court A: redone twice', on('A', 'redo(); redo();')),
        ('court B: 3 bouts', play('B', 3)),
        ('court B: undone twice', on('B', 'undo(); undo();')),
        ('court B: a point (Redo cleared)', on('B', "point('R', 'D');")),
        ('court A: the single elimination picked', ev(f"() => {{ KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('{SE}'); }}")),
        ('court A: bracket bouts (a winner advances)', ev(f"""() => {{ for (let i = 0; i < 2; i++) {{ const m = KSMTest.prepareCourt('A'); if (!m || m.division !== '{SE}') break; KSMTest.play([['W', 'M']]); }} }}""")),
        ('court A: the advancing bout undone', on('A', 'undo();')),
        ('court A: the advancing bout redone', on('A', 'redo();')),
        ('court A: Kids picked, bouts drawn into a tiebreak', ev(f"""async () => {{ KSMTest.app.chooseCourt('A'); KSMTest.app.selectScorekeeperDivision('{KIDS}');
            for (let i = 0; i < 3; i++) {{ const m = KSMTest.prepareCourt('A'); if (!m || m.division !== '{KIDS}') break; KSMTest.play([]); }} }}""")),
        ('court A: the Next Match that drew the tiebreak undone', on('A', 'undo();')),
        ('court A: redone', on('A', 'redo();')),
        ('court A: 4 bouts', play('A', 4)),
        ('court A: the history limit (105 points)', on('A', "for (let i = 0; i < 105; i++) point(i % 2 ? 'R' : 'W', 'M');")),
        ('court A: 100 undone, 1 redone', on('A', 'for (let i = 0; i < 100; i++) undo(); redo();')),
        ('court A: the Undo log limit (21 Undo / Redo pairs)', on('A', 'for (let i = 0; i < 21; i++) { undo(); redo(); }')),
        ('court A: nothing to redo, Next Match', on('A', 'redo(); nextMatch();')),
        ('court B: 3 more bouts', play('B', 3)),
        ('court A: undone before a remote apply', on('A', 'undo();')),
        ('a remote apply (court B\'s Next Match elsewhere)', load({}, live=True, edit=REMOTE_B_NEXT)),
        ('court A: redone after the remote apply', on('A', 'redo();')),
        ('load: a 4.0-shaped save with old entries', load({}, edit=OLD_ENTRIES)),
        ('court A: old entries undone', on('A', 'undo(); undo();')),
        ('court A: an old entry redone', on('A', 'redo();')),
        ('court B: old entries undone and redone', on('B', 'undo(); redo();')),
        ('load: without the history', load({}, drop=('courtActionHistory', 'courtRedoHistory', 'courtUndoLog'))),
        ('court A: a point after it', on('A', "point('W', 'M');")),
        ('court A: 2 bouts', play('A', 2)),
        ('conflict: two courts score, then Court A undoes', conflict(
            "KSMTest.prepareCourt('A'); KSMTest.play([['W', 'M']]); undo();", REMOTE_B_NEXT)),
        ('conflict: an Undo here while the other court\'s history arrives', conflict(
            "KSMTest.prepareCourt('A'); undo(); undo();", REMOTE_B_NEXT, keep_history=True)),
        ('court A: 2 bouts before the F30 case', play('A', 2)),
        ('conflict: the F30 log replayed (an Undo here, the server still has the action)', conflict(
            "KSMTest.prepareCourt('A'); undo(); redo(); undo();", REMOTE_B_NEXT, keep_history=True)),
        ('conflict: a Redo here against the other court\'s Next Match', conflict(
            "KSMTest.prepareCourt('A'); redo();", REMOTE_B_NEXT, keep_history=True)),
        ('court A: the rest', play('A', 60)),
        ('court B: the rest', play('B', 60)),
        ('court B: undone and redone at the end', on('B', 'undo(); redo(); undo();')),
        # The grand champion: drawn from finished sources, played, then cleared (its history forgotten)
        ('two single eliminations drawn', ev("""p => KSMTest.configure([
            {name: 'GC A', format: 'Single Elimination', court: 'A', entrants: p[0]},
            {name: 'GC B', format: 'Single Elimination', court: 'B', entrants: p[1]}])""", [entrants('GA', 2), entrants('GB', 2)])),
        ('grand champion added', ev("() => { KSMTest.addGrandChampion(['GC A', 'GC B'], {name: 'Grand Champion', court: 'A'}); }")),
        ('GC A played', play('A', 1)),
        ('GC B played, the grand champion drawn', play('B', 1)),
        ('court B: the Next Match that drew it undone and redone', on('B', 'undo(); redo();')),
        ('the grand champion: a point, undone (not started)', on('A', "point('W', 'M'); undo();")),
        ('a source reopened on a load: the draw cleared, its history forgotten', ev("""() => { const p = KSMTest.app.tournamentPayload();
            p.state.allMatches['GC B'].forEach(m => { m.done = false; m.wp = []; m.rp = []; delete m.completedResult; });
            KSMTest.app.applyTournamentPayload(p, false, {source: 'court history store test'}); KSMTest.app.renderAll(); }""")),
        ('court A: undone after the clear', on('A', 'undo(); redo();')),
        ('kept for the switch', ev("() => { window.__historyKept = KSMTest.app.tournamentPayload(); }")),
        ('the tournament closed', ev("() => KSMTest.app.ksmResetTournament()")),
        ('another tournament drawn', configure(team=False, kids=4)),
        ('court A: 3 bouts there, one undone', ev(f'async () => {{ await ({PLAY})(["A", 3, [["W", "M"]]]); KSMTest.prepareCourt("A"); undo(); }}')),
        ('the first tournament loaded again', ev("() => KSMTest.app.applyTournamentPayload(window.__historyKept, false, {pinnedCourt: 'A', source: 'tournament switch'})")),
        ('court A: undone after the switch', on('A', 'undo();')),
    ]


def compare(name, got, want):
    global checks
    assert sorted(got['keys']) == sorted(want['keys']), f'{name}: keys {sorted(set(got["keys"]) ^ set(want["keys"]))}'; checks += 1
    for key in want['keys']:
        assert got['values'][key] == want['values'][key], f'{name}: state.{key}\n  now    {got["values"][key][:900]}\n  before {want["values"][key][:900]}'
        checks += 1


def strict_writes(page):
    """2: a history map, a court's list or an entry written in place throws in the browser tests (the store runs strict)."""
    global checks
    load_app(page)
    configure()(page)
    on('A', "point('W', 'M'); point('R', 'K'); undo();")(page)
    for write in ("KSMTest.app.state.courtActionHistory = {A: [], B: []}", "KSMTest.app.state.courtActionHistory.A = []",
                  "KSMTest.app.state.courtActionHistory.A.push({})", "KSMTest.app.state.courtActionHistory.A.pop()",
                  "KSMTest.app.state.courtActionHistory.A.splice(0, 1)", "KSMTest.app.state.courtActionHistory.A[0].label = 'x'",
                  "KSMTest.app.state.courtActionHistory.A[0].patches.push({})", "delete KSMTest.app.state.courtActionHistory.B",
                  "KSMTest.app.state.courtRedoHistory = {}", "KSMTest.app.state.courtRedoHistory.A.shift()", "KSMTest.app.state.courtRedoHistory.A = []",
                  "KSMTest.app.state.courtUndoLog = {}", "KSMTest.app.state.courtUndoLog.A.push({})", "KSMTest.app.state.courtUndoLog.A[0].kind = 'REDO'"):
        threw = page.evaluate(f"() => {{ 'use strict'; try {{ {write}; return false; }} catch (e) {{ return e instanceof TypeError; }} }}")
        assert threw, f'{write} did not throw'; checks += 1


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
        assert len({n for n, _ in steps()}) == len(steps()), 'step names are unique'
        for name, run in steps():
            page.evaluate(SEED)
            if run:
                run(page)
            seen[name] = shrink(page.evaluate(SNAPSHOT))
            # Run in both modes: the step's own timers (a save, a render) settle the same way when recording and comparing.
            counts = page.evaluate('() => [Object.values(KSMTest.app.state.allMatches).flat().filter(m => m.done).length, (KSMTest.app.state.courtActionHistory?.A||[]).length, (KSMTest.app.state.courtRedoHistory?.A||[]).length, (KSMTest.app.state.courtUndoLog?.A||[]).length, (KSMTest.app.state.courtActionHistory?.B||[]).length, JSON.stringify(KSMTest.app.state.courtState)]')
            if DUMP:
                sys.stderr.write(f'{name}: {counts}\n')
            assert not errors, f'{name}: {errors}'
            if not DUMP:
                compare(name, seen[name], expected[name])
        if DUMP:
            print(json.dumps(seen, indent=1, ensure_ascii=False))
        else:
            assert list(seen) == list(expected), 'the same steps as recorded'; checks += 1
            strict_writes(browser.new_page())
            assert not errors, errors
        browser.close()
    if not DUMP:
        print(f'PASS court history store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
