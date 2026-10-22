// Default branding assets the court islands, the Tournament Library (app/react/features/library/) and the
// navigation bar (app/react/features/shell/) render.
// One place, so a per-tournament logo can replace them later (passed in as props); the values match
// the legacy markup (app/index.html) and templates.
// Colors come from the CSS custom properties in app/styles/02-branding.css, never from here.
// (The .active-match-watermark image in #score .scoreboard-card is still legacy markup.)

/** The header logo in #score .scoreboard-tournament. */
export const DEFAULT_COURT_LOGO_SRC = '/assets/ksm-fuji-logo.svg';

/** The action row's icons (#score .bottom-action-row), as the legacy markup draws them. */
export interface CourtActionIcons {
  /** The Undo arrow: a 64×64 viewBox and its two stroked paths (Redo draws it mirrored). */
  undo: { viewBox: string; paths: Array<{ d: string; round: boolean }> };
  /** Text symbols of the Fusen-gachi and Next Match buttons. */
  fusen: string;
  next: string;
}

export const DEFAULT_COURT_ACTION_ICONS: CourtActionIcons = {
  undo: {
    viewBox: '0 0 64 64',
    paths: [
      // round: stroke-linejoin="round" as well as stroke-linecap="round".
      { d: 'M24 14H10v14', round: true },
      { d: 'M11 27c4-10 14-17 26-17 15 0 27 12 27 27S52 64 37 64c-11 0-21-7-25-17', round: false },
    ],
  },
  fusen: '⚑',
  next: '»',
};

/** Symbols in the context panel (#courtContext), as the legacy markup draws them. */
export interface CourtPanelIcons {
  /** The mark after a completed pool's title (.pool-complete-mark). */
  poolComplete: string;
}

export const DEFAULT_COURT_PANEL_ICONS: CourtPanelIcons = { poolComplete: '✓' };

/** The KSM logo in the Tournament Library's brand (#home .home-brand), as the markup draws it. */
export const DEFAULT_HOME_LOGO_SRC = '/assets/ksm-fuji-logo.svg';

/** The mark on a Tournament Library card (.home-card-placeholder), until a tournament has a logo (M.11). */
export const DEFAULT_LIBRARY_CARD_MARK = '🏆';

/** The navigation tiles' icons (header.ksm-topbar .icon-nav), as the markup draws them. Live
 * Scores, TV and Overview share one. (The bar's KSM brand logo is static markup.) */
export interface NavIcons {
  setup: string;
  registration: string;
  courts: string;
  liveScores: string;
  results: string;
  export: string;
  saveLoad: string;
}

export const DEFAULT_NAV_ICONS: NavIcons = {
  setup: '/assets/nav-icons/setup.svg',
  registration: '/assets/nav-icons/registration.svg',
  courts: '/assets/nav-icons/courts.svg',
  liveScores: '/assets/nav-icons/live-scores.svg',
  results: '/assets/nav-icons/results.svg',
  export: '/assets/nav-icons/export.svg',
  saveLoad: '/assets/nav-icons/save-load.svg',
};
