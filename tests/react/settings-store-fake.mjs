// window.KSMStore for a publisher test: the publishers read the Setup values from the store's tournament.settings
// (#15 PR 8, app/react/shared/legacy.ts setupSetting()). `read(key)` gives a field's value at read time (undefined:
// not set), so a test changes a value between two signals as it changed an input's value before.
export function fakeSettingsStore(read) {
  const settings = new Proxy({}, { get: (_, key) => (typeof key === 'string' ? read(key) : undefined) });
  return { getState: () => ({ tournament: { settings } }) };
}
