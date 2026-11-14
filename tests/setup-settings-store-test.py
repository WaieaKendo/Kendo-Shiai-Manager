"""The Setup form in the store (#15 PR 8, docs/STORE.md section 3 item 8).

tournament.settings holds the Setup values; the Setup inputs show them. Checked against what the
inputs did before (getSetupSnapshot() read them, applySetupSnapshot() wrote them):

  1. KSMEngine.normalizeSetupValue() is what each Setup input holds once set to a value (Chromium's
     own inputs: a copy of each field is set and read back).
  2. applySetupSnapshot(): the snapshot's `setup` afterwards is, key for key and byte for byte, what
     the old code read from the inputs after writing the same data into them (a 4.0 save, the
     open Setup, an old save without the timer and audience fields, odd values); every input shows
     the store's value.
  3. A user's edit reaches the store before the field's own handler runs (the red side, the
     exhibitions), and is saved as before (the autosave's listener and the mutation version).
  4. A Setup applied while a field has focus: the field shows the applied value, as before (the
     deferral of a remote save while typing is unchanged and not part of this); an applied equal
     value leaves the caret where it was. ksmSetSetting() with an unchanged value dispatches nothing.
  5. Two staff devices edit Setup at once (a save conflict): different fields, both kept; the same
     field, the first save wins (the three-way merge of payload.setup, unchanged).
"""
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from ksm_app import KsmApp, fetch_record, sel, app_path
from ksm_browser import launch_chromium, load_app

checks = 0

PARITY = r"""() => {
  const values = ['', 'Aiea Cup', ' padded ', 'line\nbreak', 'cr\rlf\r\n', null, undefined, 0, 12, 2.5, true, '2026-11-14', '2024-02-29',
    '2026-02-29', '0000-01-01', '275760-09-13', '275761-01-01', '11/14/2026', '3', '-1', '.5', '2.', '1e3', '1e400', '+2', ' 2', '0x10',
    'Enabled', 'enabled', 'Disabled', 'A', 'B', 'Both', 'split', 'top1', 'dual3', 'left', 'Left', 'right', 'On', 'Off', 'whistle01',
    'whistle02', '3-Person Team', '5-Person Team', 'Kachinuki', 'Round Robin', 'Single Elimination', '3:00', 'null', 'undefined'];
  const bad = [];
  for (const key of KSMEngine.SETUP_KEYS) {
    const field = document.getElementById(key);
    for (const value of values) {
      const copy = field.cloneNode(true);
      copy.removeAttribute('id');
      copy.value = value;
      const want = copy.value, got = KSMEngine.normalizeSetupValue(key, value);
      if (want !== got) bad.push({key, value: String(value), want, got});
    }
  }
  return bad;
}"""

# The old applySetupSnapshot() and getSetupSnapshot() on copies of the inputs (as they were before PR 8, from the
# inputs' current values): the expected `setup` for `data`.
OLD_SETUP = r"""data => {
  const copies = {};
  for (const key of KSMEngine.SETUP_KEYS) { const el = document.getElementById(key); const c = el.cloneNode(true); c.removeAttribute('id'); c.value = el.value; copies[key] = c; }
  if (data) {
    data = {...data, ...window.ksmNormalizeTimerSettings(data)};
    data = {...data, court1TvRedSide: data.court1TvRedSide === 'left' ? 'left' : 'right', court2TvRedSide: data.court2TvRedSide === 'left' ? 'left' : 'right'};
    Object.keys(data).forEach(id => { if (copies[id]) copies[id].value = data[id]; });
    // ksmSyncLegacyTeamDivision(): the Team Tournament division's own values win over the legacy team fields.
    const d = (KSMTest.app.state.teamDivisions || []).find(x => x.id === 'Team Tournament');
    if (d) Object.entries({teamFormat: d.teamFormat, teamTournamentFormat: d.teamTournamentFormat, teamCourt: d.court, teamAwardMode: d.awardMode})
      .forEach(([k, v]) => { copies[k].value = v; });
  }
  const out = {};
  for (const key of KSMEngine.SETUP_KEYS) out[key] = copies[key].value;
  return JSON.stringify(out);
}"""

APPLY = r"""data => {
  KSMTest.app.applySetupSnapshot(data);
  const snap = KSMTest.app.getSetupSnapshot();
  const shown = KSMEngine.SETUP_KEYS.filter(k => document.getElementById(k).value !== snap[k]);
  return {json: JSON.stringify(snap), shown};
}"""


def single_page(browser):
    global checks
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.dismiss())
    load_app(page)

    # 1. The normalization is the inputs' own.
    bad = page.evaluate(PARITY)
    assert bad == [], f'normalizeSetupValue differs from the inputs: {bad[:8]}'; checks += 1

    # The page opened: the store took the inputs' values.
    opened = page.evaluate("JSON.stringify(KSMTest.app.getSetupSnapshot())")
    assert opened == page.evaluate(OLD_SETUP, None), 'the opening Setup'; checks += 1
    assert list(json.loads(opened).keys()) == page.evaluate('[...KSMEngine.SETUP_KEYS]'); checks += 1

    # 2. Loaded Setups give the snapshot the old code gave.
    save40 = json.loads((Path(__file__).parent / 'store/fixtures/setup-4.0-save.json').read_text())['setup']
    setups = [
        ('a 4.0 save', save40),
        ('the opening Setup', json.loads(opened)),
        ('an old save (no timers, no audience side, an unknown key)', {'tName': 'Old Cup', 'tType': 'Individual', 'teamCourt': 'A', 'court1RedSide': 'left'}),
        ('odd values', {'tName': 'Two\nlines', 'tDate': '2026-02-30', 'tCourts': 'two', 'teamCourt': 'split', 'teamAwardMode': None,
                        'court1Refs': 'A\r\nB', 'timeRegular': '5', 'timeEncho': '0:00', 'court2TimerSound': 'bell', 'tHost': 42}),
        ('an empty Setup', {}),
        ('a 4.0 save again', save40),
    ]
    for name, data in setups:
        want = page.evaluate(OLD_SETUP, data)
        got = page.evaluate(APPLY, data)
        assert got['json'] == want, f'{name}: setup {got["json"]} != {want}'; checks += 1
        assert got['shown'] == [], f'{name}: inputs not showing the store: {got["shown"]}'; checks += 1
    assert page.evaluate("JSON.stringify(KSMTest.app.tournamentPayload().setup)") == page.evaluate(OLD_SETUP, save40), 'the saved setup text'; checks += 1

    # 3. A user's edit: in the store before the field's own handler (applyCourtSides() reads the store), and saved.
    page.evaluate("KSMTest.show('setup')")
    version = page.evaluate('KSMTest.app.ksmLocalMutationVersion')
    page.select_option(sel('setup-red-side-a'), 'right')
    page.evaluate("KSMTest.app.chooseCourt('A')")
    assert not page.evaluate("document.body.classList.contains('ksm-red-left')"); checks += 1
    page.evaluate("KSMTest.show('setup')")
    page.select_option(sel('setup-red-side-a'), 'left')
    assert page.evaluate("KSMTest.app.ksmSetting('court1RedSide')") == 'left'; checks += 1
    assert page.evaluate("document.body.classList.contains('ksm-red-left')"), 'the field\'s handler read the new side'; checks += 1
    page.evaluate("KSMTest.show('setup')")
    page.select_option(sel('exhibition-enabled'), 'Enabled')
    assert page.evaluate("[KSMTest.app.ksmSetting('exhibitionEnabled'), window.ksmExhibitionsEnabled()]") == ['Enabled', True]; checks += 1
    page.fill(sel('setup-host'), 'Typed Host')
    assert page.evaluate("KSMTest.app.getSetupSnapshot().tHost") == 'Typed Host'; checks += 1
    assert page.evaluate('KSMTest.app.ksmLocalMutationVersion') > version, 'the edits are local mutations, as before'; checks += 1

    # 4. Focus: an applied Setup replaces a focused field's text, as before; an equal value keeps the caret.
    page.click(sel('setup-tournament-name'))
    page.keyboard.press('End')
    page.keyboard.type(' typed')
    assert page.evaluate("KSMTest.app.ksmSetting('tName')").endswith(' typed'); checks += 1
    page.evaluate("KSMTest.app.applySetupSnapshot({...KSMTest.app.getSetupSnapshot(), tName: 'Remote Cup'})")
    assert page.input_value(sel('setup-tournament-name')) == 'Remote Cup'; checks += 1
    assert page.evaluate("document.activeElement.id") == 'tName', 'focus stays'; checks += 1
    page.evaluate("tName.setSelectionRange(3, 3)")
    page.evaluate("KSMTest.app.applySetupSnapshot(KSMTest.app.getSetupSnapshot())")
    assert page.evaluate("[tName.selectionStart, tName.selectionEnd]") == [3, 3], 'an equal value does not move the caret'; checks += 1
    counted = page.evaluate("""() => {
      let n = 0; const off = KSMStore.subscribe(() => n++);
      KSMTest.app.ksmSetSetting('tName', KSMTest.app.ksmSetting('tName'));
      const same = n;
      KSMTest.app.ksmSetSetting('tName', 'Set Cup');
      off(); return [same, n, tName.value];
    }""")
    assert counted == [0, 1, 'Set Cup'], f'ksmSetSetting dispatches: {counted}'; checks += 1

    assert errors == [], errors
    page.close()


def two_devices(browser, base, problems):
    global checks
    director = KsmApp.open_device(browser, base, 'Director', problems, tournament_name='Setup Race Cup')
    tid = director.create_tournament()
    director.save_now()
    director.wait_idle()
    desk = KsmApp.open_device(browser, base, 'Desk', problems, app_path(tid))
    desk.staff_login()
    devices = [director, desk]
    for app in devices:
        app.watch_conflicts()
        app.socket_barrier()
        app.nav('setup')

    def server():
        return fetch_record(base, tid)

    def flush_edit(app):
        app.page.evaluate("""() => {
          if (!KSMTest.app.ksmSaveTimer && !KSMTest.app.ksmCloudTimer) return;
          clearTimeout(KSMTest.app.ksmSaveTimer); KSMTest.app.ksmSaveTimer=null;
          clearTimeout(KSMTest.app.ksmCloudTimer); KSMTest.app.ksmCloudTimer=null;
          KSMTest.saveNow('Setup race');
        }""")

    def settle():
        for app in devices:
            app.blur()
            flush_edit(app)
            app.wait_idle()
        rev = server()['revision']
        for app in devices:
            app.wait_revision(rev)
        return rev

    def edit(app, test_id, value):
        def run():
            app.page.fill(sel(test_id), value)
            app.page.press(sel(test_id), 'Tab')
        return run

    def race(second, second_edit, first, first_edit):
        rev = settle()
        seen = second.conflicts()
        second.hold_next_save()
        second_edit()
        flush_edit(second)
        second.wait_held_save()
        first_edit()
        first.blur()
        flush_edit(first)
        first.wait_idle()
        assert server()['revision'] > rev, f'{first.name}: its save did not reach the server first'
        second.release_save()
        second.wait_for(lambda: second.conflicts() > seen, message='the held save to meet the conflict')
        settle()
        return server()

    # Different fields: both kept, on the server and on both devices (inputs and store).
    record = race(desk, edit(desk, 'setup-host', 'Desk Host'), director, edit(director, 'setup-location', 'Director Hall'))
    setup = record['payload']['setup']
    assert (setup['tHost'], setup['tLocation']) == ('Desk Host', 'Director Hall'), setup; checks += 1
    for app in devices:
        app.wait_for(lambda: app.page.input_value(sel('setup-host')) == 'Desk Host' and app.page.input_value(sel('setup-location')) == 'Director Hall',
                     message=f'{app.name}: both Setup edits shown')
        assert app.page.evaluate("[KSMTest.app.ksmSetting('tHost'), KSMTest.app.ksmSetting('tLocation')]") == ['Desk Host', 'Director Hall']; checks += 1

    # The same field: the first save wins (mergeValueThreeWay keeps the server's value), as before.
    record = race(desk, edit(desk, 'setup-tournament-name', 'Desk Cup'), director, edit(director, 'setup-tournament-name', 'Director Cup'))
    assert record['payload']['setup']['tName'] == 'Director Cup', record['payload']['setup']['tName']; checks += 1
    for app in devices:
        app.wait_for(lambda: app.page.input_value(sel('setup-tournament-name')) == 'Director Cup', message=f'{app.name}: the first save\'s name')
        assert app.page.evaluate("KSMTest.app.ksmSetting('tName')") == 'Director Cup'; checks += 1
    assert record['payload']['setup']['tHost'] == 'Desk Host', 'the earlier race kept'; checks += 1


def main():
    from ksm_server import local_worker
    problems = []
    started = time.time()
    with local_worker() as base, sync_playwright() as p:
        browser = launch_chromium(p)
        single_page(browser)
        two_devices(browser, base, problems)
        browser.close()
    assert not problems, problems
    print(f'PASS setup settings store: {checks} checks ({time.time() - started:.0f}s)')


if __name__ == '__main__':
    main()
