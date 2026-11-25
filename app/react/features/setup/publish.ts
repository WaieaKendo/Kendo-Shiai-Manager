// The Setup screen's input, computed here from the legacy app (was ksmSetupDivisionsData() and
// the header data in app/js/42-react-setup.js). Same output as the legacy builders gave, which
// tests/golden/setup/*.json (recorded from the legacy renderer) pin; text is what esc() showed
// (ksmText(), String(x||'')). Legacy is read only through shared/legacy.ts.
import { legacy, setupSetting } from '../../shared/legacy.ts';
import {
  SETUP_DIVISIONS_EVENT, SETUP_HEADER_EVENT,
  type SetupDivisionRowInput, type SetupDivisionsInput, type SetupHeaderInput,
} from './setup-model.ts';

interface SetupPublishWindow {
  /** The divisions table as last computed (the golden test reads it here). */
  ksmSetupDivisionsInput?: SetupDivisionsInput;
  /** The hero's name as last computed. */
  ksmSetupHeaderInput?: SetupHeaderInput;
  /** Set by legacy ksmRenderSetupDivisions(): a signal came, possibly before this module ran. */
  ksmSetupDivisionsRequested?: boolean;
  /** Set by legacy ksmRenderSetupHeader(): a signal came, possibly before this module ran. */
  ksmSetupHeaderRequested?: boolean;
}

const setupWindow = (): SetupPublishWindow => window as unknown as SetupPublishWindow;

/**
 * renderDivisionSetup() (01) as data, as the removed divisionSetupRow() read it.
 * Issue #31 (was: the presets in their order, then the enabled custom divisions): the enabled
 * divisions in their running order (state.divisions: the order generation, each court's division
 * dropdown, Continue and the TV's Up next use), each with whether it can move up / down, then the
 * switched-off presets in their order, then (owner decision 12) the switched-off custom divisions:
 * switching one off keeps its format and court in state (toggleDivision()), so a custom division
 * with a format that is not in state.divisions is listed, unchecked, until × removes it.
 * Issue #25: a renamed preset is still a preset (no ×, listed among the presets when switched
 * off) under its new name, and its old name is not listed again (ksmDivisionPresetNames()).
 */
export function ksmSetupDivisionsData(): SetupDivisionsInput {
  const state = legacy('ksmLegacyState')();
  const text = legacy('ksmText');
  const removeBlocked = legacy('ksmDivisionRemoveBlocked');
  const presets = legacy('ksmDivisionPresetNames')();
  const preset = (d: string): boolean => presets.includes(d);
  const on = state.divisions;
  const row = (d: string, enabled: boolean, custom: boolean, move: SetupDivisionRowInput['move']): SetupDivisionRowInput => ({
    division: String(d ?? ''), name: text(d), enabled: !!enabled, custom: !!custom,
    format: state.divisionTypes[d] ?? null, court: state.divisionCourts[d] || 'A', move, removable: true, removeBlocked: removeBlocked(d),
  });
  // Owner request: any division can be removed before its draw; a removed preset is hidden for this
  // tournament (state.hiddenPresets) until "Restore standard divisions".
  const hidden = state.hiddenPresets || [];
  const off = presets.filter(d => !on.includes(d) && !hidden.includes(d));
  const customOff = Object.keys(state.divisionTypes || {}).filter(d => d && !preset(d) && !on.includes(d) && d !== 'Team Tournament' && d !== 'Exhibition Matches');
  return {
    rows: [
      ...on.map((d, i) => row(d, true, !preset(d), { up: i > 0, down: i < on.length - 1 })),
      ...off.map(d => row(d, false, false, null)),
      ...customOff.map(d => row(d, false, true, null)),
    ],
    hiddenPresets: presets.filter(d => hidden.includes(d) && !on.includes(d)).length,
  };
}

/**
 * syncSetupHeader() (30) as data: the name field's value (the island shows 'Kendo Tournament'
 * when it is empty), from the store (tournament.settings.tName, #15 PR 8).
 */
export function ksmSetupHeaderData(): SetupHeaderInput {
  return { name: String(setupSetting('tName') ?? '') };
}

function refreshDivisions(): void {
  setupWindow().ksmSetupDivisionsInput = ksmSetupDivisionsData();
}

function refreshHeader(): void {
  setupWindow().ksmSetupHeaderInput = ksmSetupHeaderData();
}

/**
 * Pull: computes the input on every ksm:setup-divisions / ksm:setup-header event, and once now for
 * a signal legacy sent before this module ran (until then the islands draw the static markup).
 * Call it before mounting, so it runs ahead of the islands' own listeners (they redraw on the
 * same events and read the input this computed); it dispatches nothing, so there is no loop.
 */
export function startSetupInput(): void {
  window.addEventListener(SETUP_DIVISIONS_EVENT, refreshDivisions);
  window.addEventListener(SETUP_HEADER_EVENT, refreshHeader);
  if (setupWindow().ksmSetupDivisionsRequested) refreshDivisions();
  if (setupWindow().ksmSetupHeaderRequested) refreshHeader();
}
