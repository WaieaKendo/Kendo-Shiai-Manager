// @ts-check
// Replaceable functions (step 4d of #136).
//
// Tests (KSMTest.app.NAME = ..., window.NAME = ..., the goldens' window wrappers around the save functions)
// replace or wrap a few app functions AFTER the app has loaded, and every caller must then run the replacement:
// other modules, document listeners, inline handlers. An ES module cannot do that on its own, because an
// imported function is a fixed binding.
//
// replaceable(name, impl) is the one shared way:
//   - the module that owns the function keeps the real code as `impl` and exports what replaceable() returns, a
//     STABLE function that never changes: it reads the current implementation at call time and calls it;
//   - callers import and call that stable function, never `impl`, so a replacement installed later is what runs.
//     (A listener registered with the original function, as scheduleAutoSave's document listeners are in
//     app/main.js, is not seen by a replacement: that is how they behaved before step 4d and the goldens depend on it.)
//   - window.NAME is a live accessor: reading it gives the current implementation (so a test can wrap it and
//     put it back), writing it swaps the implementation.
// The accessor is defined when the owning module is evaluated, before the entry (app/main.js) runs any code.
// Add a function here only when a test replaces it; every other call between modules is an ordinary import.
// tests/window-exports-test.mjs keeps `name` equal to the exported const's name.
/**
 * @template {(...args: any[]) => any} F
 * @param {string} name  the window property tests use (the exported const has the same name)
 * @param {F} impl  the real implementation
 * @returns {F}  the stable function callers use
 */
export function replaceable(name, impl) {
  let current = impl;
  const stable = /** @type {F} */ ((...args) => current(...args));
  Object.defineProperty(window, name, { get: () => current, set: v => { current = v; }, enumerable: true, configurable: true });
  return stable;
}
