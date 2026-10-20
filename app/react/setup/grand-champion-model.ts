// Setup's Grand Champion section (#86, #grandChampionSetup): one row per grand champion match,
// published by ksmRenderGrandChampionSetup() (app/js/01-grand-champion.js, from
// renderDivisionSetup()) as a GrandChampionSetupInput (ksm:setup-grand-champions). The legacy code
// decides everything (the rows, what is locked, who plays); this module turns it into what a row
// shows. Rules: app/engine/grand-champion.ts.

export interface GrandChampionEntrantView {
  name: string;
  via: 'winner' | 'runner-up' | 'fusen-sho';
  /** The source division's display name. */
  source: string;
}

export interface GrandChampionRowInput {
  id: string;
  name: string;
  /** Source division keys, in Setup's running order. */
  sources: string[];
  format: string;
  court: string;
  awardMode: string;
  move: { up: boolean; down: boolean };
  /** Why it cannot be drawn as set up, or null. */
  error: string | null;
  /** Sources (display names) not decided yet. */
  waiting: string[];
  /** Sources (display names) whose winner also won an earlier source. */
  duplicates: string[];
  /** Sources (display names) whose chosen runner-up is not there: choose again. */
  unavailable?: string[];
  /** Who plays for each source now (null: not decided). */
  entrants: (GrandChampionEntrantView | null)[];
  drawn: boolean;
  started: boolean;
  complete: boolean;
  champion: string | null;
  /** A source changed after the start: the director decides ("Decide…"). */
  decide: boolean;
  /** "Withdraw…" is offered. */
  canWithdraw: boolean;
}

export interface GrandChampionSetupInput {
  /** Some row is drawn (its divisions, format and court are fixed): the Setup note says so. */
  locked: boolean;
  readOnly: boolean;
  /** The enabled individual divisions, in running order: the possible sources. */
  divisions: { key: string; name: string }[];
  rows: GrandChampionRowInput[];
}

export const EMPTY_GRAND_CHAMPION_SETUP: GrandChampionSetupInput = { locked: false, readOnly: false, divisions: [], rows: [] };

export const GC_TEXTS = {
  add: '＋ Add grand champion match',
  help: 'The winners of the chosen divisions meet for the Grand Champion award. The match fills in by itself when those divisions finish and joins its court.',
  none: 'No grand champion match.',
  nameLabel: 'Grand champion name',
  withdraw: 'Withdraw a player…',
  decide: 'Decide…',
  remove: '×',
  missing: '(not in use)',
  locked: 'A drawn grand champion match is fixed: its divisions, format and court. Its name and awards can still change.',
  enabledLabel: 'Grand champion',
  enabled: 'Enabled',
  disabled: 'Disabled',
  enabledDrawnTip: 'The grand champion match is drawn: it can no longer be switched off.',
  sourcesLabel: 'Divisions',
  sourceAdd: '＋ Add division',
  drawnTip: 'Fixed: this grand champion match is drawn (its divisions finished). Its name and awards can still change.',
  formatTwoTip: 'Two divisions always play one match: the format matters from three.',
} as const;
/**
 * Several grand champion matches are supported (data, engine, merge); Setup offers one for now (owner
 * decision): an Enabled/Disabled switch instead of the Add button, and no Order column. A tournament
 * that already has several still shows them all. Set to true to offer several again.
 */
export const GC_MULTIPLE = false;
export const GC_FORMAT_OPTIONS = [['Single Elimination', 'Single elimination'], ['Round Robin', 'Pool of winners']] as const;
export const GC_COURT_OPTIONS = [['A', 'Court A'], ['B', 'Court B']] as const;
export const GC_AWARD_OPTIONS = [['top1', 'Grand Champion only'], ['top2', 'Grand Champion + Runner-up']] as const;

export interface GrandChampionControls {
  name: boolean;
  sources: boolean;
  /** Two sources always play one match: the format only matters from three. */
  format: boolean;
  court: boolean;
  awards: boolean;
  remove: boolean;
}

/** Which controls of a row can be used (true: enabled). */
export function grandChampionControls(input: Pick<GrandChampionSetupInput, 'readOnly'>, row: Pick<GrandChampionRowInput, 'sources' | 'drawn'>): GrandChampionControls {
  // A drawn row is fixed (its divisions, format and court); one not drawn yet stays editable after generation.
  const edit = !input.readOnly, structure = edit && !row.drawn;
  return { name: edit, sources: structure, format: structure && row.sources.length > 2, court: structure, awards: edit, remove: structure };
}

/** The source checkboxes: every division in use, then any chosen source that is not (flagged). */
export function grandChampionSourceOptions(input: Pick<GrandChampionSetupInput, 'divisions'>, row: Pick<GrandChampionRowInput, 'sources'>): { key: string; name: string; checked: boolean; missing: boolean }[] {
  const known = new Set(input.divisions.map(d => d.key));
  return [
    ...input.divisions.map(d => ({ key: d.key, name: d.name, checked: row.sources.includes(d.key), missing: false })),
    ...row.sources.filter(s => !known.has(s)).map(s => ({ key: s, name: s, checked: true, missing: true })),
  ];
}

const plays = (e: GrandChampionEntrantView) => e.via === 'runner-up' ? `${e.name} (for ${e.source}, runner-up)` : e.via === 'fusen-sho' ? `${e.name} (withdrew: Fusen-sho)` : e.name;

/** The row's status line: what the match is waiting for, who plays, or who won. */
export function grandChampionStatus(row: GrandChampionRowInput): { tone: 'info' | 'warn' | 'done'; text: string } {
  if (row.error) return { tone: 'warn', text: row.error };
  if (row.decide) return { tone: 'warn', text: 'A source division changed after this match started: decide whether it stands.' };
  if (row.complete && row.champion) return { tone: 'done', text: `Grand Champion: ${row.champion}` };
  if (row.unavailable?.length) return { tone: 'warn', text: `${row.unavailable.join(', ')}: the runner-up chosen to play is not there. Choose again (Withdraw a player…).` };
  if (row.duplicates.length) return { tone: 'warn', text: `The same person won ${row.duplicates.join(', ')} and an earlier division: choose who plays.` };
  const entrants = row.entrants.filter((e): e is GrandChampionEntrantView => !!e);
  if (row.drawn) return { tone: 'info', text: `${row.started ? 'Playing' : 'Ready'} on Court ${row.court}: ${entrants.map(plays).join(' vs ')}` };
  if (row.waiting.length) {
    const known = entrants.length ? ` (so far: ${entrants.map(e => `${plays(e)} from ${e.source}`).join(', ')})` : '';
    return { tone: 'info', text: `Waiting for ${row.waiting.join(', ')}${known}` };
  }
  return { tone: 'info', text: `Fills in on Court ${row.court} when the divisions finish.` };
}

export const gcMoveLabel = (name: string, direction: 'up' | 'down') => `Move ${direction} — ${name}`;
export const gcRemoveLabel = (name: string) => `Remove — ${name}`;
export const gcSourceRemoveLabel = (division: string, name: string) => `Remove ${division} — ${name}`;
