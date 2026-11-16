"""The bracket nodes in the store (#15 PR 12b, docs/STORE.md section 3 item 12).

`championshipNodes`, `singleElimNodes`, `teamBracketNodes` and `teamElimTeams` are the `tournament` slice's; `state`
reads them through getters and every write is one tournament/… action (app/modules/engine/structure-store.js): a
division's draw with the rest of its draw, the winners a scored bout advances as one tournament/advancementApplied. No
behaviour change. Checked (one offline page, strict store: a write the conversion missed, a node edited in place
included, throws):

  1. The saved snapshot is the same, value for value: after each step (a division renamed before the draw; pools with a
     championship on split courts, a single elimination on split courts (the split-court template), a team bracket of
     five (a bye), a small round robin; single divisions regenerated; a team's No Show in the bracket; every bout played
     on both courts, with an advancing bout undone and redone on the way; a 4.0-shaped load without `teamElimTeams`; the
     grand champion drawn from finished sources, a runner-up standing in, then the draw cleared; a player's No Show in a
     bracket; the undo-regenerate restore point; three save conflicts merged on payload copies and applied: two devices
     scoring different divisions' brackets, one advancing a bracket while the other regenerates another division, a No
     Show against a score in the same bracket), every key of `tournamentPayload().state` has the JSON the code before PR
     12b saved (EXPECTED_FILE, recorded by running this file with `--dump` on next/4.1 at 1010b95; random ids, times and
     the tab id are replaced by marks; keys other than the bracket's are kept as a hash). The order of the top-level
     keys may differ after a load (docs/STORE.md section 3 item 5 (3)), and with it the order of a court action's
     patches on different keys (compared grouped by key); the order inside each value may not.
  2. (this PR's code only) No half state: while bouts are scored, no store notification shows a finished bracket bout
     whose node has not got its winner yet.
  3. Strict store: writing a map, an entry, a node or a team row in place throws (the nodes are store data).
"""
import hashlib
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

DUMP = '--dump' in sys.argv
EXPECTED_FILE = Path(__file__).parent / 'store/fixtures/bracket-nodes-snapshots-before.json'
checks = 0

SNAPSHOT = r"""() => {
  const p = KSMTest.app.tournamentPayload(), st = p.state;
  // A court action's patches follow the order of the app's top-level keys, which after a load differs once a key is a store getter
  // (docs/STORE.md section 3 item 5 (3)): patches on different top-level keys are independent, so they are compared
  // grouped by key (a stable sort: the order of one key's patches is kept).
  const byKey = v => { if (Array.isArray(v)) return v.map(byKey); if (!v || typeof v !== 'object') return v;
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, byKey(x)]));
    if (Array.isArray(o.patches) && o.patches.every(x => x && Array.isArray(x.path))) o.patches = [...o.patches].sort((x, y) => String(x.path[0]) < String(y.path[0]) ? -1 : String(x.path[0]) > String(y.path[0]) ? 1 : 0);
    return o; };
  for (const k of ['courtActionHistory', 'courtRedoHistory', 'courtUndoLog']) if (st[k] !== undefined) st[k] = byKey(st[k]);
  if (Array.isArray(st.divisionRenames)) st.divisionRenames = st.divisionRenames.map((r, i) => ({...r, id: `rename ${i}`}));
  const ids = new Map(), number = text => text.replace(/(team|gc):[0-9a-f]{24,32}/g, id => { if (!ids.has(id)) ids.set(id, `${id.split(':')[0]} #${ids.size}`); return ids.get(id); })
    .replace(/"tabId":"[^"]*"/g, '"tabId":"<tab>"').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/":1[6-9]\d{11}\b/g, '":<ms>');
  const values = {};
  for (const k of Object.keys(st).sort()) values[k] = number(JSON.stringify(st[k]) ?? 'undefined');
  return {keys: Object.keys(st), values};
}"""
KEPT = {'championshipNodes', 'singleElimNodes', 'teamBracketNodes', 'teamElimTeams', 'singleElimComps', 'managementRevision', 'generated'}


def shrink(snapshot):
    return {**snapshot, 'values': {k: v if k in KEPT else 'sha256:' + hashlib.sha256(v.encode()).hexdigest() for k, v in snapshot['values'].items()}}


# The draws shuffle with Math.random: the same seed before every step, so both versions draw the same brackets.
SEED = r"""() => { let a = 11; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""
RR, SE, KIDS = 'Open RR', 'Open SE', 'Kids'


def ev(script, arg=None):
    return lambda pg: pg.evaluate(script, arg)


def entrants(prefix, n, status='Checked'):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo {i % 3}', 'seed': '', 'status': status} for i in range(n)]


TEAM_SE = {'format': '3-Person Team', 'tournament': 'Single Elimination', 'court': 'B', 'teams': 5}


def configure(team=TEAM_SE, se=6, se_court='split'):
    divisions = [{'name': RR, 'format': 'Round Robin', 'court': 'split', 'entrants': entrants('R', 8)},
                 {'name': SE, 'format': 'Single Elimination', 'court': se_court, 'entrants': entrants('S', se)},
                 {'name': KIDS, 'format': 'Round Robin', 'court': 'A', 'entrants': entrants('K', 3)}]
    if team:
        divisions.append({'team': True, **team})
    return ev('entries => KSMTest.configure(entries)', divisions)


def load(state_over=None, drop=(), source='bracket nodes store test'):
    """A load of this page's own payload with some fields changed (a 4.0 device saves every field)."""
    return ev(r"""([over, drop, source]) => {
      const p = KSMTest.app.tournamentPayload();
      for (const k of drop) delete p.state[k];
      Object.assign(p.state, over);
      KSMTest.app.applyTournamentPayload(p, false, {source});
    }""", [state_over or {}, list(drop), source])


# A save conflict: `local` is this page's payload after `edit` (the app's own functions); `server` is the same base
# edited as JSON by `remote`; the rebase merges them on payload copies and the result is applied as a load.
def conflict(edit, remote):
    return ev(r"""async ([edit, remote]) => {
      const base = KSMTest.app.tournamentPayload();
      base.state.courtActionHistory = {A: [], B: []}; base.state.courtRedoHistory = {A: [], B: []};
      KSMTest.app.applyTournamentPayload(structuredClone(base), false, {source: 'bracket nodes store test base'});
      await (new Function('return (async () => {' + edit + '})()'))();
      const local = KSMTest.app.tournamentPayload(), server = structuredClone(base);
      (new Function('p', remote))(server);
      const merged = KSMTest.app.rebaseLocalPayloadOnRecord(local, {payload: server, revision: 1}, 0, base);
      KSMTest.app.applyTournamentPayload(merged, false, {source: 'bracket nodes store test merge'});
    }""", [edit, remote])


# Up to `n` bouts on `court`, each one point then Next Match (what the court buttons call); the divisions played.
PLAY = """async ([court, n]) => { const played = []; for (let i = 0; i < n; i++) { const m = KSMTest.prepareCourt(court); if (!m) break; played.push(m.division); KSMTest.play([['W', 'M']]); }
  KSMTest.saveNow('played'); await new Promise(r => setTimeout(r, 300)); return played; }"""
KEEP_PAYLOAD = "() => { window.__nodesRestorePoint = KSMTest.app.tournamentPayload(); }"
RESTORE = """() => KSMTest.app.applyTournamentPayload(window.__nodesRestorePoint, false, {pinnedCourt: 'A', preserveLocalDivision: false, source: 'undo regenerate'})"""


def play(court, n):
    return ev(PLAY, [court, n])


def court_do(court, fn):
    """Undo / Redo on `court` (the court's own buttons call these)."""
    return ev("""([court, fn]) => { KSMTest.prepareCourt(court); window[fn](); }""", [court, fn])


def steps():
    return [
        ('opened', None),
        ('a division renamed before the draw', ev("""() => { KSMTest.app.setDivisionLists({divisions: ['Juniors', 'Masters'], divisionTypes: {Juniors: 'Single Elimination', Masters: 'Round Robin'}, divisionCourts: {Juniors: 'A', Masters: 'B'}}); KSMTest.app.ksmRenameSetupDivision('Juniors', 'Juniors U15'); }""")),
        ('generated: pools + championship, single elimination (split), team bracket of five, small round robin', configure()),
        ('single division regenerated: single elimination', ev(f"() => KSMTest.app.regenerateSingleDivision('{SE}')")),
        ('single division regenerated: round robin', ev(f"() => KSMTest.app.regenerateSingleDivision('{RR}')")),
        ('a team No Show in the team bracket', ev("() => KSMTest.app.cycleTeamStatus(1)")),
        ('kept for the restore point', ev(KEEP_PAYLOAD)),
        ('court A: 6 bouts', play('A', 6)),
        ('court B: 6 bouts', play('B', 6)),
        ('court B: an advancing bout undone', court_do('B', 'undo')),
        ('court B: redone', court_do('B', 'redo')),
        ('court A: 10 bouts', play('A', 10)),
        ('court B: 10 bouts', play('B', 10)),
        ('court A: an advancing bout undone', court_do('A', 'undo')),
        ('court A: redone', court_do('A', 'redo')),
        ('court A: 30 bouts', play('A', 30)),
        ('court B: 30 bouts', play('B', 30)),
        ('court A: the rest', play('A', 40)),
        ('court B: the rest', play('B', 40)),
        ('load: 4.0 shape without teamElimTeams', load({}, drop=('teamElimTeams',))),
        ('load: a file', load({}, source='file')),
        ('undo regenerate: the restore point applied', ev(RESTORE)),
        ('court B: 8 bouts after the restore', play('B', 8)),
        # A player's No Show in a bracket (before any bout of it)
        ('generated again: single elimination of 7 on B', configure(team=None, se=7, se_court='B')),
        ('a player No Show in the bracket', ev(f"() => KSMTest.app.applyIndividualNoShow('{SE}', 'S 3')")),
        ('court B: 5 bouts', play('B', 5)),
        # The grand champion: drawn from finished sources, a runner-up standing in, then cleared
        ('three single eliminations drawn', ev("""p => KSMTest.configure([
            {name: 'GC A', format: 'Single Elimination', court: 'A', entrants: p[0]},
            {name: 'GC B', format: 'Single Elimination', court: 'B', entrants: p[1]},
            {name: 'GC C', format: 'Single Elimination', court: 'A', entrants: p[2]}])""", [entrants('GA', 2), entrants('GB', 2), entrants('GC', 2)])),
        ('grand champion added', ev("() => { window.__gc = KSMTest.addGrandChampion(['GC A', 'GC B', 'GC C'], {name: 'Grand Champion'}); }")),
        ('GC A and GC C played', play('A', 2)),
        ('GC B played, the grand champion drawn', play('B', 1)),
        ('a runner-up stands in for GC C (the director\'s choice arrives on a load)', ev("""() => { const p = KSMTest.app.tournamentPayload(), winner = KSMTest.finalState()['GC C'].placements[0].name;
            p.state.grandChampions = p.state.grandChampions.map(g => ({...g, standIns: {'GC C': {winner, kind: 'runner-up'}}}));
            KSMTest.app.applyTournamentPayload(p, false, {source: 'bracket nodes store test'}); }""")),
        ('a grand champion bout played', play('A', 1)),
        ('a source reopened on a load: the draw cleared', ev("""() => { const p = KSMTest.app.tournamentPayload();
            p.state.allMatches['GC B'].forEach(m => { m.done = false; m.wp = []; m.rp = []; delete m.completedResult; });
            KSMTest.app.applyTournamentPayload(p, false, {source: 'bracket nodes store test'}); }""")),
        # Save conflicts (merged on payload copies, then applied)
        ('generated for the conflicts', configure()),
        ('conflict: two devices score different divisions\' brackets', conflict(
            "const m = KSMTest.prepareCourt('A'); KSMTest.play([['W', 'M']]);",
            f"""const d = '{SE}', m = p.state.allMatches[d].find(x => x.singleElim && x.ready && x.court === 'B');
                if (m) {{ m.rp = ['K']; m.done = true; }}""")),
        ('court B: 6 bouts on the merge', play('B', 6)),
        ('conflict: a bracket advanced against a regenerate of another division', conflict(
            "KSMTest.prepareCourt('B'); KSMTest.play([['R', 'M']]);",
            f"const d = '{KIDS}'; p.state.pools[d] = p.state.pools[d].map(x => ({{...x, players: [...x.players].reverse()}})); p.state.managementRevision += 1;")),
        ('generated for the No Show conflict', configure(team=None, se=6, se_court='B')),
        ('conflict: a No Show against a score in the same bracket', conflict(
            f"KSMTest.app.applyIndividualNoShow('{SE}', KSMTest.app.state.singleElimComps['{SE}'].find(Boolean).name);",
            f"""const d = '{SE}', m = p.state.allMatches[d].find(x => x.singleElim && x.ready);
                if (m) {{ m.wp = ['M']; m.done = true; }}""")),
        ('court B: the rest after the No Show conflict', play('B', 20)),
    ]


def compare(name, got, want):
    global checks
    assert sorted(got['keys']) == sorted(want['keys']), f'{name}: keys {sorted(set(got["keys"]) ^ set(want["keys"]))}'; checks += 1
    for key in want['keys']:
        assert got['values'][key] == want['values'][key], f'{name}: state.{key}\n  now    {got["values"][key][:900]}\n  before {want["values"][key][:900]}'
        checks += 1


def strict_writes(page):
    """3: a map, an entry, a node or a team row written in place throws in the browser tests (the store runs strict)."""
    global checks
    configure()(page)
    for write in ("KSMTest.app.state.singleElimNodes = {}", f"KSMTest.app.state.singleElimNodes['{SE}'] = []",
                  f"KSMTest.app.state.singleElimNodes['{SE}'][0].winner = {{name: 'x', dojo: ''}}", f"delete KSMTest.app.state.singleElimNodes['{SE}']",
                  "KSMTest.app.state.championshipNodes = {}", f"KSMTest.app.state.championshipNodes['{RR}'][0].round = 'x'",
                  "KSMTest.app.state.teamBracketNodes = {}", "Object.values(KSMTest.app.state.teamBracketNodes)[0][0].winner = 'Team A'",
                  "Object.values(KSMTest.app.state.teamBracketNodes)[0].push({})",
                  "KSMTest.app.state.teamElimTeams = {}", "Object.values(KSMTest.app.state.teamElimTeams)[0][0] = null"):
        threw = page.evaluate(f"() => {{ 'use strict'; try {{ {write}; return false; }} catch (e) {{ return e instanceof TypeError; }} }}")
        assert threw, f'{write} did not throw'; checks += 1


def no_half_state(page):
    """2: every store notification while bouts are scored shows each finished bracket bout's winner on its node."""
    global checks
    load_app(page)
    page.evaluate(SEED)
    configure()(page)
    got = page.evaluate(r"""async () => {
      const store = window.KSMStore, a = KSMTest.app, bad = [], types = [];
      const dispatch = store.dispatch;
      store.dispatch = action => { types.push(action.type); return dispatch(action); };
      const check = () => {
        const t = store.getState().tournament;
        for (const [div, nodes] of Object.entries(t.singleElimNodes || {})) for (const m of a.state.allMatches[div] || []) {
          if (!m.singleElim || !m.done) continue;
          const w = KSMTest.matchSummary(m).winner, n = nodes.find(x => x.id === m.elimNodeId);
          if (w && w !== 'Hikiwake' && n?.winner?.name !== w) bad.push([types[types.length - 1], div, m.elimNodeId, w, n?.winner?.name]);
        }
        for (const [div, nodes] of Object.entries(t.teamBracketNodes || {})) for (const n of nodes) {
          const pair = (a.state.allMatches[div] || []).filter(m => m.teamNodeId === n.id && m.teamPair === 'node-' + n.id);
          if (pair.length && pair.every(m => m.done) && !n.winner) bad.push([types[types.length - 1], div, n.id, 'team pairing done, no winner']);
        }
      };
      const off = store.subscribe(check);
      for (const court of ['A', 'B', 'A', 'B', 'A', 'B']) for (let i = 0; i < 15; i++) { if (!KSMTest.prepareCourt(court)) break; KSMTest.play([['W', 'M']]); }
      off(); store.dispatch = dispatch;
      return {bad: bad.slice(0, 5), advanced: types.filter(t => t === 'tournament/advancementApplied').length,
        winners: Object.values(store.getState().tournament.singleElimNodes || {}).flat().filter(n => n.winner).length};
    }""")
    assert not got['bad'], got; checks += 1
    assert got['advanced'] > 0 and got['winners'] > 0, got; checks += 1


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
                sys.stderr.write(f"{name}: {page.evaluate('() => [Object.values(KSMTest.app.state.allMatches).flat().filter(m => m.done).length, JSON.stringify(KSMTest.app.state.singleElimNodes).match(/winner\":\\{/g)?.length || 0]')}\n")
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
        print(f'PASS bracket nodes store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
