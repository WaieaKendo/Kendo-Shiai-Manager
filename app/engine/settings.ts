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
