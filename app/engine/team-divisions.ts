import { readSettings } from './settings.ts';
import type { TeamFormat, TeamTournamentFormat, TeamAwardMode } from './settings.ts';

/** IDs are persisted identities; names and running order never identify a competition. */
export interface TeamDivision {
  id: string;
  name: string;
  teamFormat: TeamFormat;
  teamTournamentFormat: TeamTournamentFormat;
  court: string;
  awardMode: TeamAwardMode;
  order: number;
}
export interface AssignedTeam { id?: string; teamDivisionId?: string; [key: string]: unknown }
export interface TeamDivisionState {
  teamDivisions?: TeamDivision[];
  teams?: AssignedTeam[];
  teamAwardMode?: string;
  divisionCourts?: Record<string, string>;
  [key: string]: unknown;
}
export const LEGACY_TEAM_DIVISION_ID = 'Team Tournament';

/** Single load boundary, shared by file, cloud, autosave and recovery. Does not touch draws. */
export function migrateTeamDivisions<S extends TeamDivisionState>(state: S, setup: Record<string, unknown> = {}): S {
  const settings = readSettings(setup);
  const supplied = state.teamDivisions ?? (settings.teamEnabled === 'Disabled' ? [] : [{
    id: LEGACY_TEAM_DIVISION_ID, name: 'Team Tournament', teamFormat: settings.teamFormat,
    teamTournamentFormat: settings.teamTournamentFormat,
    court: setup.teamCourt ? settings.teamCourt : state.divisionCourts?.[LEGACY_TEAM_DIVISION_ID] || settings.teamCourt,
    awardMode: (setup.teamAwardMode ? settings.teamAwardMode : state.teamAwardMode || settings.teamAwardMode) as TeamAwardMode, order: 0,
  }]);
  const divisions = [...supplied].sort((a,b) => a.order-b.order || a.id.localeCompare(b.id));
  const ids = new Set(divisions.map(d => d.id));
  const occurrences = new Map<string, number>();
  const teams = (state.teams || []).map(t => {
    const name = String(t.team || ''), occurrence = occurrences.get(name) || 0;
    occurrences.set(name, occurrence + 1);
    return { ...t, id: t.id || `legacy-team:${encodeURIComponent(name)}:${occurrence}`,
      teamDivisionId: t.teamDivisionId && ids.has(t.teamDivisionId) ? t.teamDivisionId : divisions[0]?.id || '' };
  });
  return { ...state, teamDivisions: divisions, teams };
}

/** Deleted divisions win over concurrent edits; independent fields and additions survive. */
export function mergeTeamDivisionRecords<T extends { id?: string }>(server: readonly T[], local: readonly T[], base: readonly T[], label: string, conflicts: string[]): T[] {
  const map = (rows: readonly T[]) => new Map(rows.map(r => [r.id, r]));
  const s = map(server), l = map(local), b = map(base), out: T[] = [];
  const same = (a: unknown, z: unknown) => JSON.stringify(a) === JSON.stringify(z);
  const conflict = (fieldLabel = label) => { if (!conflicts.includes(fieldLabel)) conflicts.push(fieldLabel); };
  for (const id of new Set([...s.keys(), ...l.keys()])) {
    const theirs = s.get(id), mine = l.get(id), before = b.get(id);
    if (before && (!theirs || !mine)) { if (!same(theirs || mine, before)) conflict(); continue; }
    if (!theirs || !mine) { out.push({ ...(theirs || mine)! }); continue; }
    const merged = { ...theirs };
    for (const key of new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(before || {})]) as Set<keyof T>) {
      if (same(mine[key], before?.[key]) || same(mine[key], theirs[key])) continue;
      if (!before || same(theirs[key], before[key])) {
        if (mine[key] === undefined) delete merged[key]; else merged[key] = mine[key];
      } else conflict(key === 'teamDivisionId' ? 'Team division assignment' : label);
    }
    out.push(merged);
  }
  return out;
}

export function reconcileTeamAssignments<S extends TeamDivisionState>(state: S, conflicts?: string[]): S {
  const divisions = [...(state.teamDivisions || [])].sort((a,b) => a.order-b.order || a.id.localeCompare(b.id));
  const ids = new Set(divisions.map(d => d.id));
  const teams = (state.teams || []).map(t => {
    if (ids.has(t.teamDivisionId || '') || (!divisions.length && !t.teamDivisionId)) return t;
    const label = 'Team division assignment (division removed)';
    if (conflicts && !conflicts.includes(label)) conflicts.push(label);
    return { ...t, teamDivisionId: divisions[0]?.id || '' };
  });
  return { ...state, teamDivisions: divisions, teams };
}
