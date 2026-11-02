// The Pools view's input, computed here from the legacy app (was ksmPoolsViewInput() and the
// editor's input in app/js/41-react-pools.js). Same output as the legacy builders gave, which
// tests/golden/pools/*.json (recorded from the legacy renderer) pin; text is what esc() showed
// (ksmText(), String(x||'')). Legacy is read only through shared/legacy.ts.
import { legacy } from '../../shared/legacy.ts';
import { POOLS_EVENT, type PoolsInput } from './pools-model.ts';

/** What legacy asked for last (renderPools() asks for the view, toggleEditPools() for the editor). */
interface PoolsRequest {
  kind: 'pools' | 'editor';
  div: string;
}

interface PoolsPublishWindow {
  /** The view as last computed (the island and the golden test read it here). */
  ksmPoolsInput?: PoolsInput;
  /** Set by legacy ksmRenderPools() / ksmRenderPoolEditor(): the last request, possibly from before this module ran. */
  ksmPoolsRequested?: PoolsRequest;
}

const poolsWindow = (): PoolsPublishWindow => window as unknown as PoolsPublishWindow;

/** renderPools() (08) as data. */
export function ksmPoolsViewInput(div: string): Extract<PoolsInput, { kind: 'pools' }> {
  const state = legacy('ksmLegacyState')();
  const text = legacy('ksmText');
  const isTeamDivision = legacy('isTeamDivision');
  const isTeamRoundRobinDivision = legacy('isTeamRoundRobinDivision');
  const poolPlayerSlot = legacy('poolPlayerSlot');
  const pools = state.pools[div] || [];
  // The heading printed the label as it is (no esc()); labels are the engine's A, B, C, ...
  const poolData = pools.map(p => ({
    label: String(p.label ?? ''), title: `${isTeamDivision(div) ? 'Team Pool' : 'Pool'} ${p.label}`,
    players: p.players.map((x, idx) => ({ slot: text(poolPlayerSlot(x, idx)), name: text(x.name), dojo: text(x.dojo) })),
  }));
  const message = pools.length ? null : (isTeamDivision(div) && state.allMatches[div]?.length ? 'Single-elimination team bracket created. Team position matches are available in the Court queue.' : ((state.divisionTypes[div] === 'Single Elimination' && state.allMatches[div]?.length) ? 'Single-elimination bracket created. Matches are available in the Court queue.' : 'No pools generated yet.'));
  const edit = !!(pools.length && !isTeamRoundRobinDivision(div));
  const rightTitle = isTeamRoundRobinDivision(div) ? 'Team Standings' : 'Championship Preview';
  return { kind: 'pools', pools: poolData, message, edit, rightTitle, bracket: legacy('ksmBracket')(div) };
}

/**
 * toggleEditPools() (16) as data: the editor of the division's pools (slot letters by position).
 * The pools are the F12 edit copy (classic state, ksmPoolEditPools()); classic created it before
 * signalling, so this returns the existing copy.
 */
export function ksmPoolEditorInput(div: string): Extract<PoolsInput, { kind: 'editor' }> {
  const text = legacy('ksmText');
  const poolPlayerSlotLetter = legacy('poolPlayerSlotLetter');
  const pools = legacy('ksmPoolEditPools')(div);
  return {
    kind: 'editor',
    pools: pools.map(p => ({
      label: String(p.label ?? ''), title: `Pool ${text(p.label)}`,
      players: p.players.map((x, idx) => ({ slot: text(poolPlayerSlotLetter(idx)), name: text(x.name), dojo: text(x.dojo || '') })),
    })),
    bracket: legacy('ksmBracket')(div),
  };
}

/** Computes the input of the last request legacy made (the view or the editor, of its division). */
function refresh(): void {
  const request = poolsWindow().ksmPoolsRequested;
  if (!request) return;
  poolsWindow().ksmPoolsInput = request.kind === 'editor' ? ksmPoolEditorInput(request.div) : ksmPoolsViewInput(request.div);
}

/**
 * Pull: computes the input on every ksm:pools event, and once now for a request legacy made before
 * this module ran (until then the island draws the static markup). Call it before mounting, so it
 * runs ahead of the island's own listener (it redraws on the same event and reads the input this
 * computed); it dispatches nothing, so there is no loop.
 */
export function startPoolsInput(): void {
  window.addEventListener(POOLS_EVENT, refresh);
  refresh();
}
