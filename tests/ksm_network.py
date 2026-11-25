"""Shared setup/assertions for the network audit; all app access uses KsmApp."""
from ksm_app import KsmApp, app_path, fetch_record


def two_courts(browser, base, problems, name):
    a = KsmApp.open_device(browser, base, 'Court A', problems, tournament_name=name)
    tid = a.create_tournament()
    a.configure([{'name': f'Court {c} Open', 'format': 'Round Robin', 'court': c,
                  'entrants': [{'name': f'{c} {i}', 'dojo': 'Dojo', 'seed': '', 'status': 'Checked'}
                               for i in range(1, 5)]} for c in 'AB'])
    a.save_now()
    a.wait_idle()
    a.open_court('A')
    b = KsmApp.open_device(browser, base, 'Court B', problems, app_path(tid, 'court', 'B'))
    b.wait_generated()
    b.staff_login()
    b.open_court('B')
    for app in (a, b):
        app.wait_idle()
        app.page.wait_for_function("KSMTest.pendingReason().socket === 'open'")
    a.wait_revision(fetch_record(base, tid)['revision'])
    return tid, a, b


def match(payload, court, shown):
    return next(m for m in payload['state']['allMatches'][f'Court {court} Open']
                if (m['white'], m['red']) == (shown['white'], shown['red']))


def assert_points(payload, court, shown, white, red, done=False):
    m = match(payload, court, shown)
    assert (m.get('wp') or [], m.get('rp') or [], bool(m.get('done'))) == (white, red, done), m


def converge(base, tid, devices):
    record = fetch_record(base, tid)
    for app in devices:
        app.wait_revision(record['revision'])
        app.wait_idle()
    return record['payload']
