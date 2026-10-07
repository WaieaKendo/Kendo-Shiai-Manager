// Pure logic of the stream overlay page (/t/<id>/overlay/a|b, app/overlay.html): URL options, what the bar shows,
// and where it sits (normal lower third, or "band mode" for PRISM's portrait widgets).
import { courtDivision, individualSideLabel, matchMetaLine, selectCourtMatch } from './court-match.ts';

export interface OverlayParams {
  tournament: string | null;
  court: Court;
  /** Which side of the bar Red is on (White takes the other). */
  red: 'left' | 'right';
  /** Normal mode: bar at the top or bottom of the page. */
  pos: 'top' | 'bottom';
  /** Band mode: bar's top edge at this % of the page height (?y=); null = default. */
  y: number | null;
  /** ?band=1 forces band mode, ?band=0 turns it off; null = auto-detect. */
  band: boolean | null;
  debug: boolean;
}

export const DEFAULT_BAND_Y = 74;
/** The bar is designed at 1920 px wide; everything scales with the page width. */
export const DESIGN_WIDTH = 1920;

export function parseOverlayParams(search: string): OverlayParams {
  const q = new URLSearchParams(search);
  const court = (q.get('court') || 'A').toUpperCase() === 'B' ? 'B' : 'A';
  const yRaw = q.get('y');
  const y = yRaw !== null && yRaw.trim() !== '' && Number.isFinite(Number(yRaw)) ? Math.min(100, Math.max(0, Number(yRaw))) : null;
  const bandRaw = q.get('band');
  return {
    tournament: q.get('tournament') || null,
    court,
    red: q.get('red') === 'left' ? 'left' : 'right',
    pos: q.get('pos') === 'top' ? 'top' : 'bottom',
    y,
    band: bandRaw === '1' || bandRaw === 'true' ? true : bandRaw === '0' || bandRaw === 'false' ? false : null,
    debug: q.get('debug') === '1' || q.get('debug') === 'true',
  };
}

export interface Viewport {
  width: number;
  height: number;
  /** The device (screen) is landscape, e.g. screen.orientation.type 'landscape-primary'. */
  deviceLandscape: boolean;
}

export interface OverlayLayout {
  mode: 'normal' | 'band';
  /** CSS px per design px (page width / 1920). */
  unit: number;
  /** Band mode: top of the bar, % of the page height. */
  y: number;
  pageOrientation: 'portrait' | 'landscape';
  deviceOrientation: 'portrait' | 'landscape';
}

/**
 * Band mode: PRISM Live Studio keeps web widgets portrait even while the phone streams
 * landscape, stretching the portrait page over the landscape video. A bar pinned to
 * the bottom of that page would sit off the video, so in band mode it is placed at
 * y% of the page height and sized by the page width. Auto-detected when the device is
 * landscape but the page is portrait; ?y= (or ?band=1) turns it on, ?band=0 off.
 */
export function overlayLayout(viewport: Viewport, params: OverlayParams): OverlayLayout {
  const pagePortrait = viewport.height > viewport.width;
  const detected = pagePortrait && viewport.deviceLandscape;
  const band = params.band ?? (params.y !== null || detected);
  return {
    mode: band ? 'band' : 'normal',
    unit: Math.max(0.1, viewport.width / DESIGN_WIDTH),
    y: params.y ?? DEFAULT_BAND_Y,
    pageOrientation: pagePortrait ? 'portrait' : 'landscape',
    deviceOrientation: viewport.deviceLandscape ? 'landscape' : 'portrait',
  };
}

export interface OverlaySide {
  name: string;
  /** Dojo (individual) or team name (team matches). */
  sub: string;
  /** Point letters in order (M, K, D, T, H, F). */
  points: string[];
  hansoku: number;
}

export type OverlayView =
  | {
      kind: 'match';
      court: Court;
      division: string;
      /** 'Pool A', 'Semifinal', or the team position ('Senpo'). */
      meta: string;
      teamMode: boolean;
      white: OverlaySide;
      red: OverlaySide;
      /** "White vs Red" of the next match on the court, or null. */
      next: string | null;
    }
  | { kind: 'idle'; court: Court; division: string | null };

export function overlayView(state: Partial<TournamentState> | null | undefined, court: Court): OverlayView {
  const found = selectCourtMatch(state, court);
  if (!state || !found) return { kind: 'idle', court, division: courtDivision(state, court) };
  const m = found.match;
  const side = (s: 'white' | 'red'): OverlaySide => {
    const white = s === 'white';
    return {
      name: found.teamMode ? ((white ? m.white : m.red) || 'TBD') : individualSideLabel(state, m, s),
      sub: found.teamMode ? ((white ? m.teamWhite : m.teamRed) || (white ? 'White Team' : 'Red Team')) : ((white ? m.wdojo : m.rdojo) || ''),
      points: [...((white ? m.wp : m.rp) || [])].map(String),
      hansoku: Math.max(0, Number((white ? m.wt : m.rt) || 0)),
    };
  };
  const next = found.upcoming[0];
  return {
    kind: 'match',
    court,
    division: m.division || found.division,
    meta: matchMetaLine(m),
    teamMode: found.teamMode,
    white: side('white'),
    red: side('red'),
    next: next ? `${next.white} vs ${next.red}` : null,
  };
}
