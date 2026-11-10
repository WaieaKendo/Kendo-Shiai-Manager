// Step 3d/4a of #136: the modules (app/modules) call the app/js functions that have not moved yet through
// app/modules/legacy.js, which reads window.NAME at call time. Those are the functions tests replace or wrap through
// window (the six pool/standings functions of 13- to 15-, the save functions of 18- and 20-). They are put on window HERE,
// first, as live accessors, like 99-window-exports.js (which lists them too): they are function declarations, which are
// hoisted, so they exist before any file runs. tests/window-exports-test.mjs keeps this list equal to the legacy.js wrappers.
// Delete a name here with its wrapper when its function moves into a module (step 4b/4c).
{
  const live = (get, set) => ({ get, set, enumerable: true, configurable: true });
  Object.defineProperties(window, {
    criticalAutoSave: live(() => criticalAutoSave, v => { criticalAutoSave = v; }),
    initialPoolStandings: live(() => initialPoolStandings, v => { initialPoolStandings = v; }),
    noteLocalMutation: live(() => noteLocalMutation, v => { noteLocalMutation = v; }),
    pendingTiebreak: live(() => pendingTiebreak, v => { pendingTiebreak = v; }),
    poolPositionsResolved: live(() => poolPositionsResolved, v => { poolPositionsResolved = v; }),
    poolStandings: live(() => poolStandings, v => { poolStandings = v; }),
    saveAuto: live(() => saveAuto, v => { saveAuto = v; }),
    scheduleAutoSave: live(() => scheduleAutoSave, v => { scheduleAutoSave = v; }),
  });
}
