// Tournament settings the engine depends on (step 2.1 engine-settings). The Setup
// form's selects are only views of these values; the persisted `setup` object
// (tournamentPayload().setup, keyed by input id) is where they are saved and loaded.

export type TeamFormat = '3-Person Team' | '5-Person Team' | 'Kachinuki' | (string & {});
export type TeamTournamentFormat = 'Single Elimination' | 'Round Robin' | (string & {});
export type EnabledFlag = 'Enabled' | 'Disabled' | (string & {});
export type TeamAwardMode = 'top1' | 'top2' | 'dual3' | (string & {});

export interface TournamentSettings {
  teamEnabled: EnabledFlag;
  teamFormat: TeamFormat;
  teamTournamentFormat: TeamTournamentFormat;
  teamCourt: string;
  teamAwardMode: TeamAwardMode;
  exhibitionEnabled: EnabledFlag;
}

/**
 * Fallbacks used when a value is missing or empty. They are the engine's historical
 * `input?.value || fallback` defaults (a fresh Setup form selects '3-Person Team', but
 * a missing value has always meant '5-Person Team').
 */
export const DEFAULT_SETTINGS: Readonly<TournamentSettings> = Object.freeze({
  teamEnabled: 'Enabled',
  teamFormat: '5-Person Team',
  teamTournamentFormat: 'Single Elimination',
  teamCourt: 'Both',
  teamAwardMode: 'top2',
  exhibitionEnabled: 'Disabled',
});

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof TournamentSettings)[];

/** Normalise a persisted/DOM `setup` snapshot (any shape) into settings. Pure; new object. */
export function readSettings(setup?: unknown): TournamentSettings {
  const src = (setup && typeof setup === 'object' ? setup : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SETTINGS };
  for (const key of KEYS) {
    const v = src[key];
    if (v !== undefined && v !== null && v !== '') out[key] = String(v);
  }
  return out;
}

// The Setup form's fields (#15 PR 8): the store keeps them (tournament.settings, app/store/slices/tournament.ts); these
// rules say what each field can hold, as its input in app/index.html does.

/** The Setup fields in the saved snapshot's key order (`payload.setup`), each the id of its Setup input. */
export const SETUP_KEYS = [
  'tName', 'tHost', 'tDate', 'tLocation', 'tCourts', 'teamEnabled', 'teamFormat', 'teamTournamentFormat', 'teamCourt',
  'teamAwardMode', 'exhibitionEnabled', 'court1Refs', 'court2Refs', 'court1RedSide', 'court2RedSide', 'timeRegular',
  'timeQuarterfinal', 'timeSemifinal', 'timeFinal', 'timeEncho', 'court1TimerSound', 'court2TimerSound',
  'court1TimerEnabled', 'court2TimerEnabled', 'court1TvRedSide', 'court2TvRedSide',
] as const;

export type SetupKey = typeof SETUP_KEYS[number];

const SIDES = ['right', 'left'] as const;
/**
 * The options of each Setup <select> (tests/store/settings.test.mjs checks them against app/index.html). A select holds
 * one of its options' values or, set to anything else, '' (no option selected).
 */
export const SETUP_SELECT_OPTIONS: Readonly<Partial<Record<SetupKey, readonly string[]>>> = {
  teamEnabled: ['Enabled', 'Disabled'],
  teamFormat: ['3-Person Team', '5-Person Team', 'Kachinuki'],
  teamTournamentFormat: ['Single Elimination', 'Round Robin'],
  teamCourt: ['A', 'B', 'Both'],
  teamAwardMode: ['top1', 'top2', 'dual3'],
  exhibitionEnabled: ['Disabled', 'Enabled'],
  court1RedSide: SIDES, court2RedSide: SIDES, court1TvRedSide: SIDES, court2TvRedSide: SIDES,
  court1TimerSound: ['whistle01', 'whistle02'], court2TimerSound: ['whistle01', 'whistle02'],
  court1TimerEnabled: ['On', 'Off'], court2TimerEnabled: ['On', 'Off'],
};

/** Whether `key` is a Setup field. */
export function isSetupKey(key: unknown): key is SetupKey {
  return typeof key === 'string' && (SETUP_KEYS as readonly string[]).includes(key);
}

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// A "valid date string" (HTML), which <input type="date"> keeps; years 1 to 275760, Chromium's range.
function validDate(v: string): boolean {
  const m = /^(\d{4,})-(\d\d)-(\d\d)$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1 || y > 275760 || mo < 1 || mo > 12 || d < 1 || d > (DAYS[mo - 1] as number)) return false;
  return mo !== 2 || d < 29 || (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
}

/**
 * `value` as the Setup input `key` holds it once set to it (`el.value = value; el.value`): what the page shows, and
 * what getSetupSnapshot() read from the page before #15 PR 8. Text inputs drop line breaks; the textareas (referees)
 * turn CR LF and CR into LF; the date and number inputs hold '' for a value they do not accept; a select holds one of
 * its options or ''. Like the DOM, null is '' (a select: 'null', no option) and anything else is its text.
 * tests/setup-settings-store-test.py checks this against Chromium's own inputs.
 */
export function normalizeSetupValue(key: SetupKey, value: unknown): string {
  const options = SETUP_SELECT_OPTIONS[key];
  if (options) { const v = String(value); return options.includes(v) ? v : ''; }
  const v = value === null ? '' : String(value);
  if (key === 'court1Refs' || key === 'court2Refs') return v.replace(/\r\n?/g, '\n');
  if (key === 'tDate') return v === '' || validDate(v) ? v : '';
  if (key === 'tCourts') return v === '' || (/^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/.test(v) && Number.isFinite(Number(v))) ? v : '';
  return v.replace(/[\r\n]/g, '');
}

/** The Setup fields `data` names, normalized (normalizeSetupValue); other keys are left out. Pure; new object. */
export function normalizeSetup(data: unknown): Partial<Record<SetupKey, string>> {
  const src = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const out: Partial<Record<SetupKey, string>> = {};
  for (const key of Object.keys(src)) if (isSetupKey(key)) out[key] = normalizeSetupValue(key, src[key]);
  return out;
}
