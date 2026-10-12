// The court screen's division-complete presentation: the .division-complete class on
// #score .scoreboard-card (the court CSS then hides the match display, the score buttons and
// the action row, finding F2) and the .division-complete-panel at the end of that card, with
// the division's placements.
//
// The legacy app decides when a division is complete on this court (the renderScore()
// wrapper in app/js/32-split-court-templates.js) and computes the placements
// (resultPlacements(), from the engine); setCourtCompletePresentation() publishes them
// (ksm:court-complete) instead of writing the card. courtCompleteView() turns that into what
// CourtComplete renders: the markup of divisionCompletePanelHtml(), which Live Scores and the
// TV still use.

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
