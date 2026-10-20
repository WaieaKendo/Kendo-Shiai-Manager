// The court screen's division-complete presentation: the .division-complete class on
// #score .scoreboard-card (the court CSS then hides the match display, the score buttons and
// Fusen-gachi / Next Match; Undo and Redo stay, F2) and the .division-complete-panel at the end
// of that card, with
// the division's placements.
//
// The legacy app decides when a division is complete on this court (the renderScore()
// wrapper in app/js/32-split-court-templates.js) and computes the placements
// (resultPlacements(), from the engine); setCourtCompletePresentation() publishes them
// (ksm:court-complete) instead of writing the card. courtCompleteView() turns that into what
// CourtComplete renders: the markup of the legacy divisionCompletePanelHtml() (removed in M.13),
// which Live Scores and the TV draw with the same component (DivisionCompletePanel).

export interface PlacementInput {
  /** '1st', '2nd', '3rd' ... as resultPlacements() gives them. */
  place: string;
  name: string;
  /** The medal class ('gold', 'silver', 'bronze') or ''. */
  tier: string;
}

export interface CourtCompleteInput {
  /** The division on this court is complete (no match of it left to play here). */
  complete: boolean;
  placements: PlacementInput[];
  /** Court screen only (owner decision 7, #31): the court and its completed division. */
  court?: string;
  division?: string;
  /** Stable team division key; names may change while results remain on screen. */
  divisionId?: string;
  /** The division to continue to (the next in the court's running order with a match ready here), or null. */
  next?: string | null;
  /** Display label; next remains the navigation key. */
  nextName?: string;
}

/** Before the legacy app published anything: the static markup (no panel). */
export const NOT_COMPLETE: CourtCompleteInput = { complete: false, placements: [] };

/** The class on #score .scoreboard-card while the division-complete panel shows. */
export const DIVISION_COMPLETE_CLASS = 'division-complete';

/** Shown when a complete division has no placements. */
export const NO_PLACEMENTS_TEXT = 'Final results are available in Results.';

export interface PlacementRowView {
  place: string;
  name: string;
  /** The class of the place label (the medal color); '' keeps an empty class attribute. */
  placeClass: string;
}

export interface CourtCompleteView {
  complete: boolean;
  /** The placement rows, or null for the "no placements" message. */
  rows: PlacementRowView[] | null;
}

export function courtCompleteView(input: CourtCompleteInput): CourtCompleteView {
  if (!input.complete) return { complete: false, rows: null };
  const placements = input.placements || [];
  if (!placements.length) return { complete: true, rows: null };
  return { complete: true, rows: placements.map(p => ({ place: p.place, name: p.name, placeClass: p.tier })) };
}

// ------------------------------------------------------------------ continue box (decision 7)

/**
 * Owner decision 7 and issue #31: on the court screen, a completed division's box: "<Division> is
 * complete. Final results are showing on the Court X TV." with [Continue to <next> →] and
 * [Keep showing results]; once results are kept, [Close TV results] (the same move-on) stays; with
 * no division left to continue to, "All divisions on Court X are done." No timer.
 */
export type ContinueBoxView =
  | { kind: 'offer'; message: string; next: string; continueLabel: string }
  | { kind: 'kept'; message: string; next: string }
  | { kind: 'done'; message: string; doneText: string };

export const CONTINUE_TEXTS = {
  keep: 'Keep showing results',
  close: 'Close TV results',
} as const;

export function continueLabel(next: string): string {
  return `Continue to ${next} →`;
}

/** The box for a published court-complete state, or null (not complete, or not the court screen). kept: Keep showing results was pressed for this court and division. */
export function continueBoxView(input: CourtCompleteInput, kept: boolean): ContinueBoxView | null {
  if (!input.complete || !input.division || !input.court) return null;
  const message = `${input.division} is complete. Final results are showing on the Court ${input.court} TV.`;
  if (!input.next) return { kind: 'done', message, doneText: `All divisions on Court ${input.court} are done.` };
  if (kept) return { kind: 'kept', message, next: input.next };
  return { kind: 'offer', message, next: input.next, continueLabel: continueLabel(input.nextName || input.next) };
}

/** What "Keep showing results" remembers: the court and division it was pressed for. */
export function keptKey(input: CourtCompleteInput): string {
  return `${input.court ?? ''}|${input.divisionId ?? input.division ?? ''}`;
}
