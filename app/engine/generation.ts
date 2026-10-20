// Division generation, moved from app/js/08-engine-generation.js and 04-engine-pools.js
// (step 2.7): who is eligible, and the pools, bracket templates, nodes and Match Objects
// of one freshly generated division (individual round robin + championship, individual
// single elimination, team round robin / single elimination incl. kachinuki, exhibitions).
// Pure: the plan comes back as data. The legacy generateDivisionState() writes it to
// `state` and then runs the advancement syncs (championship seeds, single-elimination byes,
// team bracket byes), which read other state (standings, court modes) and stay legacy.
import { buildPools, buildPoolMatches } from './pools.ts';
import type { BuiltPool, PoolEntrant, PoolMatch, SlottedPlayer } from './pools.ts';
import { championshipTemplateForTotal, championshipCourtFor, buildChampionshipTemplateMatches } from './championship.ts';
import type { ChampNode, ChampionshipMatch } from './championship.ts';
import { placeIndividualsForSingleElim, buildIndividualSingleElimMatches } from './single-elim.ts';
import type { SingleElimMatch, SingleElimNode, SingleElimTemplateNode } from './single-elim.ts';
import { buildTeamMatches, teamBracketNodesForCount } from './teams.ts';
import type { TeamBout, TeamBracketNode, TeamEntry } from './teams.ts';
import type { TournamentSettings } from './settings.ts';

export const TEAM_DIVISION = 'Team Tournament';
export const EXHIBITION_DIVISION = 'Exhibition Matches';

export interface CompetitorRow extends PoolEntrant { division?: string | undefined; status?: string | undefined }
export type TeamRow = TeamEntry & { status?: string | undefined; teamDivisionId?: string | undefined };
export interface ExhibitionRow { white?: string | undefined; red?: string | undefined; status?: string | undefined }

/** Registered competitors of a division who are not no-shows (and have a name). */
export function eligibleIndividuals<C extends CompetitorRow>(competitors: readonly C[], div: string): C[] {
  return competitors.filter(c => c.division === div && c.status !== 'NoShow' && c.name);
}

/** Registered teams that are not no-shows (and have a name). */
export function eligibleTeams<T extends TeamRow>(teams: readonly T[]): T[] {
  return teams.filter(t => t.status !== 'NoShow' && t.team);
}

export interface GenerationInput {
  division: string;
  teamDivisionId?: string | undefined;
  competitors: readonly CompetitorRow[];
  teams: readonly TeamRow[];
  exhibitions?: readonly ExhibitionRow[] | null | undefined;
  /** state.divisionTypes[division] ('Round Robin' when missing). */
  divisionType?: string | undefined;
  /** state.divisionCourts[division] as saved (may be missing). */
  courtMode?: string | undefined;
  settings: Pick<TournamentSettings, 'teamFormat' | 'teamTournamentFormat' | 'exhibitionEnabled'>;
  /** Bracket template for n entrants; the legacy caller passes its alerting wrapper. */
  bracketNodesForCount?: ((n: number) => TeamBracketNode<'A' | 'B'>[]) | undefined;
}

export type RoundRobinPool = BuiltPool<SlottedPlayer<CompetitorRow>> & { court?: 'A' | 'B' };
type PoolPlayer = { name: string; dojo: string; team?: true; exhibition?: true };
export interface ExhibitionMatch { division: string; pool: string; white: string; red: string; wdojo: string; rdojo: string; done: boolean; wp: never[]; rp: never[]; type: 'exhibition'; court: string }

export type DivisionPlan =
  | { kind: 'team'; generated: true; pools: BuiltPool<PoolPlayer>[]; teamPools: BuiltPool<PoolPlayer>[]; teamElimTeams: TeamRow[]; singleElim: boolean; teamBracketNodes: TeamBracketNode<'A' | 'B'>[] | null; matches: TeamBout[]; divisionCourt: string }
  | { kind: 'exhibition'; generated: boolean; pools: BuiltPool<PoolPlayer>[]; matches: ExhibitionMatch[]; divisionCourt: string }
  | { kind: 'singleElim'; generated: true; pools: never[]; singleElimComps: CompetitorRow[]; singleElimNodes: SingleElimNode<string>[]; matches: SingleElimMatch<string>[] }
  | { kind: 'roundRobin'; generated: true; pools: RoundRobinPool[]; brackets: string[][]; championshipNodes: ChampNode<string>[] | null; matches: (PoolMatch<string> | ChampionshipMatch<string>)[] };

const defaultNodes = (n: number): TeamBracketNode<'A' | 'B'>[] => teamBracketNodesForCount(n) || [];

/**
 * The generated structure of one division, or null when it has nobody to generate
 * (the division is then left untouched). An exhibition plan with no playable match is
 * still written (its pool lists the exhibitions) but reports `generated: false`.
 */
export function generateDivision(input: GenerationInput): DivisionPlan | null {
  const div = input.division, nodesFor = input.bracketNodesForCount || defaultNodes;
  if (div === TEAM_DIVISION || input.teamDivisionId) {
    const teams = eligibleTeams(input.teamDivisionId ? input.teams.filter(t => t.teamDivisionId === input.teamDivisionId) : input.teams); if (!teams.length) return null;
    const fmt = input.settings.teamTournamentFormat || 'Single Elimination';
    let pools: BuiltPool<PoolPlayer>[], teamPools: BuiltPool<PoolPlayer>[];
    if (fmt === 'Round Robin') { pools = [{ label: 'A', size: teams.length, players: teams.map(t => ({ name: t.team, dojo: '', team: true as const })) }]; teamPools = pools; }
    else { pools = []; teamPools = []; }
    const plan = buildTeamMatches(div, teams, input.settings);
    // F21: Setup's team court A or B puts every team bout on that court (round robin
    // pairings and every bracket node, so the bouts syncTeamBracket adds later follow);
    // 'Both' (or nothing saved) keeps the alternating pairings and the template's courts.
    const only = input.courtMode === 'A' || input.courtMode === 'B' ? input.courtMode : null;
    const nodes = plan.singleElim ? nodesFor(teams.length) : null;
    const matches = only ? plan.matches.map(m => ({ ...m, court: only })) : plan.matches;
    return {
      kind: 'team', generated: true, pools, teamPools, teamElimTeams: [...teams], singleElim: plan.singleElim,
      teamBracketNodes: nodes && only ? nodes.map(n => ({ ...n, court: only })) : nodes, matches,
      divisionCourt: input.courtMode || 'Both',
    };
  }
  if (div === EXHIBITION_DIVISION) {
    const ex = input.exhibitions;
    if ((input.settings.exhibitionEnabled || 'Disabled') !== 'Enabled' || !ex?.length) return null;
    const court = input.courtMode || 'B';
    const pools = [{ label: 'Exhibition', size: ex.length, players: ex.map(e => ({ name: `${e.white} vs ${e.red}`, dojo: '', exhibition: true as const })) }];
    const matches = ex.filter(e => e.status !== 'NoShow' && e.white && e.red).map((e): ExhibitionMatch => ({ division: div, pool: 'Exhibition', white: e.white!, red: e.red!, wdojo: '', rdojo: '', done: false, wp: [], rp: [], type: 'exhibition', court }));
    return { kind: 'exhibition', generated: !!matches.length, pools, matches, divisionCourt: court };
  }
  const comps = eligibleIndividuals(input.competitors, div); if (!comps.length) return null;
  const mode = input.courtMode || 'A';
  if ((input.divisionType || 'Round Robin') === 'Single Elimination') {
    const ordered = placeIndividualsForSingleElim(comps, comps.length > 1 ? nodesFor(comps.length) : []);
    const built = buildIndividualSingleElimMatches(div, nodesFor(ordered.length) as SingleElimTemplateNode<string>[], mode);
    return { kind: 'singleElim', generated: true, pools: [], singleElimComps: ordered, singleElimNodes: built.nodes, matches: built.matches };
  }
  const pools: RoundRobinPool[] = buildPools(comps);
  // Split courts: the first half of the pools on Court A, the rest on B (saved on the pool).
  const aCount = Math.floor(pools.length / 2);
  const courts = pools.map((pool, idx) => {
    if (mode !== 'split') return mode;
    pool.court = idx < aCount ? 'A' : 'B';
    return pool.court;
  });
  const brackets = championshipTemplateForTotal(comps.length);
  let championshipNodes: ChampNode<string>[] | null = null, champMatches: ChampionshipMatch<string>[] = [];
  if ((brackets || []).length) {
    const built = buildChampionshipTemplateMatches(div, brackets, (round, slot, total) => championshipCourtFor(mode, round, slot, total), brackets.length);
    championshipNodes = built.nodes; champMatches = built.matches;
  }
  const matches: (PoolMatch<string> | ChampionshipMatch<string>)[] = [...buildPoolMatches(div, pools, courts), ...champMatches];
  return { kind: 'roundRobin', generated: true, pools, brackets, championshipNodes, matches };
}
