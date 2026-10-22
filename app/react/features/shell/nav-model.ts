// The navigation bar (header.ksm-topbar nav.minimal-nav): its tiles, menus and items as the static
// markup of app/index.html has them (and the stream overlay items app/js added to the TV menu at
// startup), and the state the legacy code publishes (ksm:shell-nav): which menu is open, where a
// menu is placed on a phone, which screen is shown. Nav.tsx draws them with the markup's elements,
// classes, ids, titles and test IDs; tests/golden/shell pins them.
//
// A tile or item is one object: a new tile is one more entry here.
import type { NavIcons } from '../court/branding.ts';

// ------------------------------------------------------------------------------ input

/** Where an open menu is placed on a phone or tablet (positionMobileNavMenu()): the style
 * properties it set, as CSS texts ("148.41px"). */
export interface NavMenuStyle {
  top: string;
  left: string;
  right: string;
  maxHeight: string;
}

export interface NavInput {
  /** The id of the open menu (courtsMenu, tvMenu), or null. */
  open: string | null;
  /** The open menu's placement on a phone or tablet; null on a wider window. */
  style: NavMenuStyle | null;
  /** The label of the screen shown (setActiveNavForView()'s mapping: "Setup", "Courts",
   * "TV Display", ...), or null for a screen without one. */
  active: string | null;
  /** Addresses of menu items that are pages (by test ID: nav-court-a, nav-tv-b, ...), so they are
   * links that open in a new tab; a plain click still runs the item's action. Absent: buttons. */
  links?: Readonly<Record<string, string>>;
}

/** Nothing published yet: the static markup (every menu closed, no tile marked). */
export const EMPTY_NAV: NavInput = { open: null, style: null, active: null };

// ------------------------------------------------------------------------------ the bar

/** What a control does: the legacy call its inline handler made. `close` runs closeNavMenus()
 * first; `alert` is a message the handler showed instead of calling a function. */
export interface NavAction {
  fn: string;
  args?: readonly string[];
  close?: boolean;
}

export type NavIcon = keyof NavIcons;

export interface NavTile {
  kind: 'tile';
  /** The tile's class without "active". */
  className: string;
  title: string;
  testId: string;
  icon: NavIcon;
  label: string;
  action: NavAction;
}

export type NavMenuEntry =
  | { kind: 'item'; label: string; testId?: string; title?: string; action: NavAction }
  | { kind: 'heading'; label: string }
  | { kind: 'divider' };

export interface NavMenu {
  kind: 'menu';
  /** The wrapper's class (.nav-menu.nav-tile-wrap plus the role classes). */
  wrapClassName: string;
  menuId: string;
  /** The dropdown's class without "hidden" / "is-open". */
  menuClassName: string;
  trigger: { title: string; testId: string; icon: NavIcon; label: string };
  entries: readonly NavMenuEntry[];
}

export type NavEntry = NavTile | NavMenu;

const call = (fn: string, ...args: string[]): NavAction => ({ fn, args });

/** The bar, in order. */
export const NAV_ENTRIES: readonly NavEntry[] = [
  { kind: 'tile', className: 'nav-tile role-court-access', title: 'Tournament Overview', testId: 'nav-overview', icon: 'liveScores', label: 'Overview', action: call('navigateTo', 'director') },
  { kind: 'tile', className: 'nav-tile', title: 'Live Scores', testId: 'nav-live-scores', icon: 'liveScores', label: 'Live Scores', action: call('navigateTo', 'public') },
  {
    kind: 'menu', wrapClassName: 'nav-menu nav-tile-wrap role-court-access', menuId: 'courtsMenu', menuClassName: 'nav-dropdown',
    trigger: { title: 'Courts', testId: 'nav-courts', icon: 'courts', label: 'Courts' },
    entries: [
      { kind: 'item', label: 'Court A', testId: 'nav-court-a', action: call('chooseCourt', 'A') },
      { kind: 'item', label: 'Court B', testId: 'nav-court-b', action: call('chooseCourt', 'B') },
    ],
  },
  {
    kind: 'menu', wrapClassName: 'nav-menu nav-tile-wrap role-court-access tv-role-access', menuId: 'tvMenu', menuClassName: 'nav-dropdown',
    trigger: { title: 'TV Display', testId: 'nav-tv', icon: 'liveScores', label: 'TV' },
    entries: [
      { kind: 'item', label: 'Court A TV', testId: 'nav-tv-a', action: call('launchTvDisplay', 'A') },
      { kind: 'item', label: 'Court B TV', testId: 'nav-tv-b', action: call('launchTvDisplay', 'B') },
      // The stream overlay links (feat/react-overlay), which app/js added at startup.
      { kind: 'heading', label: 'Stream overlay' },
      ...(['A', 'B'] as const).map((c): NavMenuEntry => ({
        kind: 'item', label: `Copy Court ${c} overlay link`, testId: `nav-overlay-${c.toLowerCase()}`,
        title: `Copy the Court ${c} stream overlay link (OBS / PRISM browser source)`, action: call('copyStreamOverlayLink', c),
      })),
    ],
  },
  { kind: 'tile', className: 'nav-tile', title: 'Results', testId: 'nav-results', icon: 'results', label: 'Results', action: call('navigateTo', 'results') },
  { kind: 'tile', className: 'nav-tile director-only', title: 'Registration', testId: 'nav-registration', icon: 'registration', label: 'Registration', action: call('openRegistrationTab', 'individual') },
  { kind: 'tile', className: 'nav-tile director-only setup-nav-tile', title: 'Setup', testId: 'nav-setup', icon: 'setup', label: 'Setup', action: call('navigateTo', 'setup') },
];


/** The hidden file inputs at the end of the bar: Load Tournament File and Load Recovery File
 * click them (by id) and their change event runs the loader with the event. */
export interface NavFileInput {
  id: string;
  testId: string;
  /** The loader the inline onchange called with the event. */
  onChange: string;
}

export const NAV_FILE_INPUTS: readonly NavFileInput[] = [
  { id: 'ksmLoadFile', testId: 'load-file-input', onChange: 'loadTournamentFromFile' },
  { id: 'ksmRecoveryFile', testId: 'recovery-file-input', onChange: 'loadRecoveryFile' },
];
export const NAV_FILE_ACCEPT = '.ksm,application/json';
/** The inputs' style attribute as the markup has it. */
export const NAV_FILE_STYLE = 'display:none';

/** The menu triggers' arrow (<b aria-hidden="true">▾</b> after the label). */
export const NAV_MENU_ARROW = '▾';

// ------------------------------------------------------------------------------ state

/** A tile's text as setActiveNavForView() read it (textContent, trimmed): the label, and a menu
 * trigger's arrow after a space. */
export function tileText(entry: NavEntry): string {
  return entry.kind === 'tile' ? entry.label : `${entry.trigger.label} ${NAV_MENU_ARROW}`;
}

/** The tile marked active for a screen label: the first tile (in order) whose text starts with
 * it, as setActiveNavForView() found it; -1 for none (no label, or no tile: "TV Display" is not
 * the start of "TV ▾"). */
export function activeEntryIndex(entries: readonly NavEntry[], active: string | null): number {
  if (!active) return -1;
  return entries.findIndex(e => tileText(e).startsWith(active));
}

/** A tile's class: its own, plus " active" when marked (classList.add / remove). */
export function tileClass(base: string, active: boolean): string {
  return active ? `${base} active` : base;
}

/** A menu's class: open "<base> is-open", closed "<base> hidden" (setNavMenuState()'s
 * classList.toggle('hidden') / toggle('is-open')). */
export function menuClass(base: string, open: boolean): string {
  return open ? `${base} is-open` : `${base} hidden`;
}
