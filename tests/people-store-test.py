"""The people in the store (#15 PR 10, docs/STORE.md section 3 item 10).

`competitors`, `teams`, `exhibitions` and `teamDivisions` are the `tournament` slice's; `state` reads them through
getters and every write is one tournament/… action (app/modules/registration/people-store.js). No behaviour change.
Checked (one offline page, strict store: a write the conversion missed, a row edited in place included, throws):

  1. The saved snapshot is the same, value for value: after each step of a Registration session (rows added, edited
     through the rows the island binds, two edits on the same bound row, a status cycled, a paste, a CSV import, a
     removal, the samples, a division rename with players, Clear), the team divisions (added, a team moved into one,
     match format, the legacy division's court and awards, moved, removed with its teams), the exhibitions, the sample
     tournament with a draw and a No Show after it, a single elimination and a team bracket with Registration edits after
     the draw and the next team round played (the draw holds those rows themselves: the edits show there), four kinds of
     load (a 4.0-shaped save without team divisions or team ids, one with team divisions, one with exhibitions, one with
     renames) and four save conflicts merged on payload copies and applied (both devices add players; one edits a player
     the other removes; both cycle a status; teams by id: both add, one edits a team the other removes), every key of
     `tournamentPayload().state` has the JSON the code before PR 10 saved (EXPECTED_FILE, recorded by running this file
     with `--dump` on next/4.1 at b4d6897, whose test API was given only this PR's `KSMTest.app` Registration entries,
     which call the same window functions; random ids, times and the tab id are replaced by marks; keys other than the
     people's and the divisions' are kept as a hash). The order of the top-level keys may differ after a load
     (docs/STORE.md section 3 item 5 (3)); the order inside each value, rows included, may not.
  2. The team court: `divisionCourts['Team Tournament']` equals the Setup field after every step.
  3. A row is named by its index, resolved from the row the island showed right before the dispatch: an edit through a
     bound row lands on its player after the list was reordered by another device (a new list, F17 / F20) and after a
     player before it was removed here; a filtered table edits the right player; the bound row keeps naming its player
     through edits without a redraw in between (a field, a status click, a field: each a new row object, followed as
     identity was). The same for a team card and an exhibition row.
  4. Strict store: writing a list or a row in place throws (rows are store data).
"""
import hashlib
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

TT = 'Team Tournament'
DUMP = '--dump' in sys.argv
EXPECTED_FILE = Path(__file__).parent / 'store/fixtures/people-snapshots-before.json'
checks = 0

SNAPSHOT = r"""() => {
  const p = KSMTest.app.tournamentPayload(), st = p.state;
  if (Array.isArray(st.divisionRenames)) st.divisionRenames = st.divisionRenames.map((r, i) => ({...r, id: `rename ${i}`}));
  // New team / team division ids are random (crypto): numbered in the order they first appear, keys in sorted order.
  // Played bouts carry the time (recordedAt, the court history) and the court history this tab's random id: marks.
  const ids = new Map(), number = text => text.replace(/team:[0-9a-f]{32}/g, id => { if (!ids.has(id)) ids.set(id, `team #${ids.size}`); return ids.get(id); })
    .replace(/"tabId":"[^"]*"/g, '"tabId":"<tab>"').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/":1[6-9]\d{11}\b/g, '":<ms>');
  const values = {};
  for (const k of Object.keys(st).sort()) values[k] = number(JSON.stringify(st[k]) ?? 'undefined');
  return {teamCourt: p.setup.teamCourt, keys: Object.keys(st), values};
}"""
# The people's and the divisions' keys are kept as JSON in the fixture; the rest (the draw, the matches) as a hash.
KEPT = {'competitors', 'teams', 'exhibitions', 'teamDivisions', 'divisions', 'divisionTypes', 'divisionCourts', 'divisionRenames', 'hiddenPresets'}


def shrink(snapshot):
    return {**snapshot, 'values': {k: v if k in KEPT else 'sha256:' + hashlib.sha256(v.encode()).hexdigest() for k, v in snapshot['values'].items()}}

# A seeded Math.random (the sample tournament's players and the draw).
SEED = r"""() => { let a = 7; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }"""

YONENBU = 'Yonenbu (11 years and under)'
WOMEN = 'Women’s Open'


def ev(script, arg=None):
    return lambda pg: pg.evaluate(script, arg)


def load(state_over=None, setup_over=None, drop=(), team_strip=False):
    """A load of this page's own payload with some fields changed (a 4.0 device saves every field)."""
    return ev(r"""([over, setup, drop, strip]) => {
      const p = KSMTest.app.tournamentPayload();
      for (const k of drop) delete p.state[k];
      Object.assign(p.state, over); Object.assign(p.setup, setup);
      if (strip) (p.state.teams || []).forEach(t => { delete t.id; delete t.teamDivisionId; });
      KSMTest.app.applyTournamentPayload(p, false, {source: 'people store test'});
    }""", [state_over or {}, setup_over or {}, list(drop), team_strip])


# A save conflict: `local` is this page's payload after `edit` (the app's own functions); `server` is the same base
# edited as JSON by `remote`; the rebase merges them on payload copies and the result is applied as a load.
def conflict(edit, remote):
    return ev(r"""([edit, remote]) => {
      const base = KSMTest.app.tournamentPayload();
      base.state.courtActionHistory = {A: [], B: []}; base.state.courtRedoHistory = {A: [], B: []};
      KSMTest.app.applyTournamentPayload(structuredClone(base), false, {source: 'people store test base'});
      (0, eval)(edit);
      const local = KSMTest.app.tournamentPayload(), server = structuredClone(base);
      (new Function('p', remote))(server);
      const merged = KSMTest.app.rebaseLocalPayloadOnRecord(local, {payload: server, revision: 1}, 0, base);
      KSMTest.app.applyTournamentPayload(merged, false, {source: 'people store test merge'});
    }""", [edit, remote])


def steps():
    team = {'id': 'team:fixed', 'name': 'Juniors', 'teamFormat': '3-Person Team', 'teamTournamentFormat': 'Single Elimination',
            'court': 'A', 'awardMode': 'top2', 'order': 1}
    legacy = {**team, 'id': TT, 'name': TT, 'court': 'B', 'order': 0}
    csv = "Name,Dojo,Division,Seed,Status\nCsv One,Hilo,Women's Open,1,Checked In\nCsv Two,Kona,,,\nCsv Three,X,Nowhere,,\nCsv Four,Y,Women’s Open,,Maybe\n"
    return [
        ('opened', None),
        # Competitors
        ('add 3 rows', ev('() => KSMTest.app.addRow(3)')),
        ('two edits on one bound row', ev("""() => { KSMTest.app.renderReg(); const row = KSMTest.app.registrationInputs.players.rows[0];
            KSMTest.app.ksmUpdateCompetitor(row, 'name', 'Ann'); KSMTest.app.ksmUpdateCompetitor(row, 'dojo', 'Aiea'); KSMTest.app.ksmUpdateCompetitor(row, 'seed', '1'); }""")),
        ('edit by index', ev("() => { KSMTest.app.ksmUpdateCompetitor({index: 1}, 'name', 'Ben'); KSMTest.app.ksmUpdateCompetitor({index: 1}, 'division', 'Yudansha 1–3 Dan'); }")),
        ('edit offers a division again', ev(f"""() => {{ KSMTest.app.toggleDivision({json.dumps(YONENBU)}, false);
            KSMTest.app.ksmUpdateCompetitor({{index: 2}}, 'division', {json.dumps(YONENBU)}); KSMTest.app.ksmUpdateCompetitor({{index: 2}}, 'name', 'Cy'); }}""")),
        ('status cycled', ev('() => { KSMTest.app.cycleCompetitorStatus(0); KSMTest.app.cycleCompetitorStatus(1); KSMTest.app.cycleCompetitorStatus(1); KSMTest.app.cycleCompetitorStatus(2); KSMTest.app.cycleCompetitorStatus(2); KSMTest.app.cycleCompetitorStatus(2); }')),
        ('csv import', ev("""async csv => { KSMTest.app.ksmImportCSVFile({target: {files: [new File([csv], 'players.csv')]}});
            await new Promise(r => setTimeout(r, 200)); }""", csv)),
        ('remove a player', ev('() => KSMTest.app.ksmRemoveCompetitor(1)')),
        ('rename with players', ev(f"() => KSMTest.app.ksmRenameSetupDivision({json.dumps(WOMEN)}, 'Women')")),
        ('sample players', ev('() => KSMTest.app.loadSamples()')),
        ('clear players', ev('() => KSMTest.app.clearCompetitors()')),
        # Teams and team divisions
        ('team divisions migrated', ev('() => KSMTest.teamDivisions()')),
        ('add teams', ev('() => { KSMTest.app.addTeamRow(2); KSMTest.app.addAutoTeam(); }')),
        ('team fields on one bound card', ev("""() => { KSMTest.app.renderTeams(); const card = KSMTest.app.registrationInputs.teams.cards[0];
            KSMTest.app.ksmSetTeamField(card, 'team', 'Aiea A'); KSMTest.app.ksmSetTeamField(card, 'senpo', 'Sato'); KSMTest.app.ksmSetTeamField({index: 1}, 'team', 'Hilo A'); }""")),
        ('team status cycled', ev('() => { KSMTest.app.cycleTeamStatus(0); KSMTest.app.cycleTeamStatus(2); KSMTest.app.cycleTeamStatus(2); }')),
        ('team division added', ev("() => KSMTest.addTeamDivision('Juniors')")),
        ('team moved into it', ev("() => KSMTest.app.ksmSetTeamField({index: 1}, 'teamDivisionId', KSMTest.teamDivisions()[1].id)")),
        ('its match format', ev("() => KSMTest.updateTeamDivision(KSMTest.teamDivisions()[1].id, {teamFormat: '5-Person Team', name: ' Juniors 2 '})")),
        ('legacy division court and awards', ev(f"() => KSMTest.updateTeamDivision({json.dumps(TT)}, {{court: 'A', awardMode: 'top1'}})")),
        ('team division moved up', ev("() => KSMTest.moveTeamDivision(KSMTest.teamDivisions()[1].id, 'up')")),
        ('team division removed with its team', ev("() => KSMTest.removeTeamDivision(KSMTest.teamDivisions()[0].id)")),
        ('a second one, then the first removed', ev("() => { const id = KSMTest.addTeamDivision('Seniors'); KSMTest.assignTeamDivision(0, id); KSMTest.removeTeamDivision(KSMTest.teamDivisions()[0].id); }")),
        ('remove a team', ev('() => KSMTest.app.ksmRemoveTeam(2)')),
        ('sample teams', ev('() => KSMTest.app.loadTeamSamples()')),
        ('clear teams', ev('() => KSMTest.app.clearTeams()')),
        # Exhibitions
        ('add exhibitions', ev('() => KSMTest.app.addExhibitionRow(3)')),
        ('exhibition fields on one bound row', ev("""() => { KSMTest.app.ksmSetSetting('exhibitionEnabled', 'Enabled'); KSMTest.app.renderExhibitions();
            const row = KSMTest.app.registrationInputs.exhibitions.rows[0];
            KSMTest.app.ksmSetExhibitionField(row, 'white', 'W1'); KSMTest.app.ksmSetExhibitionField(row, 'red', 'R1'); KSMTest.app.ksmSetExhibitionField({index: 2}, 'white', 'W3'); }""")),
        ('exhibition status cycled', ev('() => { KSMTest.app.ksmCycleExhibitionStatus(0); KSMTest.app.ksmCycleExhibitionStatus(2); KSMTest.app.ksmCycleExhibitionStatus(2); }')),
        ('remove an exhibition', ev('() => KSMTest.app.ksmRemoveExhibition(1)')),
        ('clear exhibitions', ev('() => KSMTest.app.clearExhibitions()')),
        # The sample tournament, a draw, a No Show after it
        ('sample tournament', lambda pg: (pg.evaluate(SEED), pg.evaluate('() => KSMTest.app.loadFullTournament()'))),
        ('drawn', ev('() => KSMTest.app.generatePools({validated: true})')),
        ('no show after the draw', ev('() => { const i = KSMTest.app.state.competitors.findIndex(c => c.status === "Registered"); KSMTest.app.cycleCompetitorStatus(i); KSMTest.app.cycleCompetitorStatus(i); }')),
        ('team no show after the draw', ev('() => { KSMTest.app.cycleTeamStatus(0); KSMTest.app.cycleTeamStatus(0); }')),
        # A single elimination and a team bracket hold the drawn rows themselves (singleElimComps, teamElimTeams): an edit
        # after the draw showed there too, and a roster edit reaches the next rounds' bouts.
        ('single elimination and team bracket drawn', ev("""() => KSMTest.configure([
            {name: 'SE', format: 'Single Elimination', court: 'B', entrants: Array.from({length: 6}, (_, i) => ({name: 'P' + i, dojo: 'D' + i, seed: i < 2 ? String(i + 1) : '', status: 'Checked'}))},
            {team: true, format: '3-Person Team', tournament: 'Single Elimination', teams: 4, court: 'A'}])""")),
        ('edits after the draw', ev("""() => { const a = KSMTest.app, st = a.state;
            const p = st.singleElimComps.SE[0], i = st.competitors.findIndex(c => c.name === p.name);
            a.ksmUpdateCompetitor({index: i}, 'dojo', 'Edited dojo'); a.ksmUpdateCompetitor({index: i}, 'seed', '9');
            const tt = Object.keys(st.teamElimTeams)[0], t = st.teamElimTeams[tt][1], j = st.teams.findIndex(x => x.team === t.team);
            a.ksmSetTeamField({index: j}, 'senpo', 'Substitute'); a.ksmSetTeamField({index: j}, 'chuken', 'Second sub'); }""")),
        ('the next team round', ev("""() => { for (let n = 0; n < 12; n++) { const m = KSMTest.prepareCourt('A'); if (!m || !m.teamWhite) break; KSMTest.play([['W', 'M']]); } }""")),
        # Loads
        ('load: 4.0 shape (no team divisions, no team ids)', load(
            {'teams': [{'team': 'Old A', 'senpo': 'a', 'status': 'Checked', 'type': '3-Person Team', 'division': TT},
                       {'team': 'Old A', 'senpo': 'b', 'status': 'Registered', 'type': '3-Person Team', 'division': TT}],
             'exhibitions': []}, {'teamCourt': 'B'}, drop=('teamDivisions', 'grandChampions'), team_strip=True)),
        ('its teams read', ev('() => { KSMTest.teamDivisions(); KSMTest.app.renderTeams(); }')),
        ('load: team divisions', load(
            {'teamDivisions': [legacy, team],
             'teams': [{'id': 'team:a', 'team': 'A', 'teamDivisionId': 'team:fixed', 'status': 'Checked'},
                       {'id': 'team:b', 'team': 'B', 'teamDivisionId': 'gone', 'status': 'Checked'}]}, {'teamCourt': 'A'})),
        ('load: exhibitions', load({'exhibitions': [{'white': 'W', 'red': 'R', 'division': 'Exhibition Matches', 'status': 'Checked'}]})),
        ('load: renames', load({'competitors': [{'name': 'K', 'dojo': '', 'division': 'Kids', 'seed': '', 'status': 'Registered'}],
                                'divisionRenames': [{'id': 'c1:a', 'from': 'Kids', 'to': 'Under 12'}]})),
        # Save conflicts (merged on payload copies, then applied)
        ('reset for conflicts', ev("""() => { KSMTest.app.clearCompetitors(); KSMTest.app.clearTeams(); KSMTest.app.clearExhibitions(); KSMTest.app.addRow(3);
            ['A', 'B', 'C'].forEach((n, i) => KSMTest.app.ksmUpdateCompetitor({index: i}, 'name', n)); KSMTest.app.addTeamRow(2);
            KSMTest.app.ksmSetTeamField({index: 0}, 'team', 'T1'); KSMTest.app.ksmSetTeamField({index: 1}, 'team', 'T2'); }""")),
        ('conflict: both add players', conflict(
            "KSMTest.app.addRow(1); KSMTest.app.ksmUpdateCompetitor({index: 3}, 'name', 'Local D');",
            "p.state.competitors.push({name: 'Server E', dojo: '', division: p.state.divisions[0], seed: '', status: 'Registered'});")),
        ('conflict: edit vs remove', conflict(
            "KSMTest.app.ksmUpdateCompetitor({index: 1}, 'dojo', 'Edited here');",
            "p.state.competitors.splice(1, 1);")),
        ('conflict: status cycled on both', conflict(
            "KSMTest.app.cycleCompetitorStatus(0);",
            "p.state.competitors[0].status = 'NoShow'; p.state.competitors[2].status = 'Checked';")),
        ('conflict: teams by id', conflict(
            "KSMTest.app.addTeamRow(1); KSMTest.app.ksmSetTeamField({index: 2}, 'team', 'T3 here'); KSMTest.app.ksmSetTeamField({index: 0}, 'senpo', 'Local senpo');",
            "p.state.teams.splice(0, 1); p.state.teams.push({...p.state.teams[0], id: 'team:server', team: 'T4 there'});")),
    ]


def team_court_agrees(page, name):
    global checks
    got = page.evaluate("() => [KSMTest.app.ksmSetting('teamCourt'), KSMTest.app.state.divisionCourts?.['Team Tournament']]")
    assert got[0] == got[1], f'{name}: the team court {got}'; checks += 1


def compare(name, got, want):
    global checks
    assert sorted(got['keys']) == sorted(want['keys']), f'{name}: keys {sorted(set(got["keys"]) ^ set(want["keys"]))}'; checks += 1
    for key in want['keys']:
        assert got['values'][key] == want['values'][key], f'{name}: state.{key}\n  now    {got["values"][key][:600]}\n  before {want["values"][key][:600]}'
        checks += 1
    assert got['teamCourt'] == want['teamCourt'], f'{name}: setup.teamCourt {got["teamCourt"]} / {want["teamCourt"]}'; checks += 1


def rows_named_by_index(page):
    """3: the index an edit uses is the bound row's, resolved right before the dispatch."""
    global checks
    got = page.evaluate(r"""() => {
      const a = KSMTest.app, out = {};
      a.setPeople({competitors: ['Ann', 'Ben', 'Cy', 'Dee'].map(name => ({name, dojo: '', division: a.state.divisions[0], seed: '', status: 'Registered'}))});
      document.getElementById('regFilter').value = ''; KSMTest.app.renderReg();
      const bound = name => KSMTest.app.registrationInputs.players.rows.find(r => r.name === name);
      // Another device's list, reordered (new objects): Cy's row is found by its fields, at its new place.
      const cy = bound('Cy'), p = a.tournamentPayload();
      p.state.competitors = [...p.state.competitors].reverse();
      a.applyTournamentPayload(p, false, {source: 'people store test reorder'});
      KSMTest.app.ksmUpdateCompetitor(cy, 'dojo', 'Cy dojo');
      // Found by its fields, so the table is drawn again (its stale flag, as before); the new row, edited twice
      // without a redraw in between, keeps naming its player (the row an edit replaced is followed, as identity did).
      KSMTest.app.renderReg();
      const cy2 = bound('Cy');
      KSMTest.app.ksmUpdateCompetitor(cy2, 'seed', '3'); KSMTest.app.cycleCompetitorStatus(cy2.index); KSMTest.app.ksmUpdateCompetitor(cy2, 'name', 'Cyd');
      out.reordered = a.state.competitors.map(c => `${c.name}:${c.dojo}:${c.seed}`);
      // A player before it removed here: Dee's row (bound by identity) is still Dee at index 0 → found, not index 1.
      KSMTest.app.renderReg();
      const ann = bound('Ann'), dee = bound('Dee');
      KSMTest.app.ksmRemoveCompetitor(0);
      KSMTest.app.ksmUpdateCompetitor(ann, 'dojo', 'Ann dojo');
      out.removed = a.state.competitors.map(c => `${c.name}:${c.dojo}`);
      out.deeGone = (() => { KSMTest.app.ksmUpdateCompetitor(dee, 'dojo', 'lost'); return a.state.competitors.some(c => c.dojo === 'lost'); })();
      // A filtered table: the shown row's index is the player's index in the whole list.
      document.getElementById('regFilter').value = 'ben'; KSMTest.app.renderReg();
      const ben = KSMTest.app.registrationInputs.players.rows;
      KSMTest.app.ksmUpdateCompetitor(ben[0], 'name', 'Benji');
      out.filtered = [ben.length, a.state.competitors.map(c => c.name)];
      document.getElementById('regFilter').value = ''; KSMTest.app.renderReg();
      document.getElementById('regFilter').value = ''; KSMTest.app.renderReg();
      // Teams and exhibitions: two edits through one bound card / row after a reorder.
      a.setPeople({teams: ['T1', 'T2', 'T3'].map((team, i) => ({team, id: 'team:' + i, teamDivisionId: 'Team Tournament', type: '3-Person Team', status: 'Registered'})),
                   exhibitions: ['E1', 'E2'].map(white => ({white, red: 'R', division: 'Exhibition Matches', status: 'Registered'}))});
      KSMTest.app.renderTeams(); KSMTest.app.renderExhibitions();
      const t3 = KSMTest.app.registrationInputs.teams.cards.find(c => c.team === 'T3'), e2 = KSMTest.app.registrationInputs.exhibitions.rows.find(r => r.white === 'E2');
      const q = a.tournamentPayload(); q.state.teams = [...q.state.teams].reverse(); q.state.exhibitions = [...q.state.exhibitions].reverse();
      a.applyTournamentPayload(q, false, {source: 'people store test reorder 2'});
      KSMTest.app.ksmSetTeamField(t3, 'senpo', 'S'); KSMTest.app.ksmSetExhibitionField(e2, 'red', 'R2');
      KSMTest.app.renderTeams(); KSMTest.app.renderExhibitions();
      const t3b = KSMTest.app.registrationInputs.teams.cards.find(c => c.team === 'T3'), e2b = KSMTest.app.registrationInputs.exhibitions.rows.find(r => r.white === 'E2');
      KSMTest.app.ksmSetTeamField(t3b, 'jiho', 'J'); KSMTest.app.cycleTeamStatus(t3b.index); KSMTest.app.ksmSetTeamField(t3b, 'chuken', 'C');
      KSMTest.app.ksmSetExhibitionField(e2b, 'white', 'E2b'); KSMTest.app.ksmCycleExhibitionStatus(e2b.index); KSMTest.app.ksmSetExhibitionField(e2b, 'red', 'R2b');
      out.teams = a.state.teams.map(t => `${t.team}:${t.senpo || ''}:${t.jiho || ''}:${t.chuken || ''}:${t.status}`);
      out.exhibitions = a.state.exhibitions.map(e => `${e.white}:${e.red}:${e.status}`);
      return out;
    }""")
    assert got['reordered'] == ['Dee::', 'Cyd:Cy dojo:3', 'Ben::', 'Ann::'], got; checks += 1
    assert got['removed'] == ['Cyd:Cy dojo', 'Ben:', 'Ann:Ann dojo'], got; checks += 1
    assert got['deeGone'] is False, 'an edit for a removed player is dropped (with a notice), not written elsewhere'; checks += 1
    assert got['filtered'] == [1, ['Cyd', 'Benji', 'Ann']], got; checks += 1
    assert got['teams'] == ['T3:S:J:C:Checked', 'T2::::Registered', 'T1::::Registered'], got; checks += 1
    assert got['exhibitions'] == ['E2b:R2b:Checked', 'E1:R:Registered'], got; checks += 1


def strict_rows(page):
    """4: a list or row written in place throws in the browser tests (the store runs strict there)."""
    global checks
    for write in ("KSMTest.app.state.competitors = []", "KSMTest.app.state.teams.push({})", "KSMTest.app.state.competitors[0].name = 'x'",
                  "KSMTest.app.state.teams[0].teamDivisionId = 'x'", "KSMTest.app.state.exhibitions[0].status = 'Checked'",
                  "KSMTest.app.state.teamDivisions[0].order = 5"):
        # Strict-mode code, as every app module is (sloppy code would fail silently on a frozen row).
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
        for name, run in steps():
            if run:
                run(page)
            seen[name] = shrink(page.evaluate(SNAPSHOT))
            assert not errors, f'{name}: {errors}'
            if not DUMP:
                compare(name, seen[name], expected[name])
                team_court_agrees(page, name)
        if DUMP:
            print(json.dumps(seen, indent=1, ensure_ascii=False))
        else:
            assert list(seen) == list(expected), 'the same steps as recorded'; checks += 1
            rows_named_by_index(page)
            strict_rows(page)
            assert not errors, errors
        browser.close()
    if not DUMP:
        print(f'PASS people store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
