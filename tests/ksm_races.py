"""Deterministic save races between devices, shared by the edit-path conflict tests (issue #59).

`Races(base, tid, devices)` gives each test the same three moves, with no fixed sleeps:

  settle()                          every device idle and on the server's latest revision;
  race(second, edit2, first, edit1) `second` edits, its save is held at the network; `first` edits
                                    and saves; then `second`'s save goes on, meets the conflict (HTTP
                                    409) and is rebased onto the first device's save;
  server()                          the server's record.
race(..., between=fn) runs fn after the first device saved and before the held save is released.

(The older edit-conflicts-test.py has its own copy of these helpers.)
"""
from ksm_app import fetch_record

FLUSH_JS = """() => {
  if (!KSMTest.app.ksmSaveTimer && !KSMTest.app.ksmCloudTimer) return;
  clearTimeout(KSMTest.app.ksmSaveTimer); KSMTest.app.ksmSaveTimer = null;
  clearTimeout(KSMTest.app.ksmCloudTimer); KSMTest.app.ksmCloudTimer = null;
  KSMTest.saveNow('Conflict race');
}"""


def people(prefix, n, status='Checked'):
    return [{'name': f'{prefix} {i + 1}', 'dojo': f'{prefix} Dojo', 'seed': '', 'status': status} for i in range(n)]


class Races:
    def __init__(self, base, tid, devices):
        self.base, self.tid, self.devices = base, tid, devices
        for app in devices:
            app.watch_conflicts()
            app.socket_barrier()

    def server(self):
        return fetch_record(self.base, self.tid)

    @staticmethod
    def flush_edit(app):
        """Start a pending save now: these races test server ordering, not the edit debounce."""
        app.page.evaluate(FLUSH_JS)

    def settle(self):
        for app in self.devices:
            app.blur()
            self.flush_edit(app)
            app.wait_idle()
        rev = self.server()['revision']
        for app in self.devices:
            app.wait_revision(rev)
        return rev

    def race(self, second, second_edit, first, first_edit, between=None, settle_after=True):
        rev = self.settle()
        seen = second.conflicts()
        second.hold_next_save()
        second_edit()
        self.flush_edit(second)
        second.wait_held_save()
        first_edit()
        first.blur()
        self.flush_edit(first)
        first.wait_idle()
        assert self.server()['revision'] > rev, f'{first.name}: its save did not reach the server first'
        if between:
            between()  # the second device's save is still held: both sides' edits are in place
        second.release_save()
        second.wait_for(lambda: second.conflicts() > seen, message='the held save to meet the conflict')
        if settle_after:
            self.settle()
        return self.server()


def state_of(record):
    return record['payload']['state']
