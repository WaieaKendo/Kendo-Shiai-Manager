// The shell's three inputs, computed here from the classic state (was ksmPublishShell() and
// ksmNavLinks() in app/js/44-react-shell.js). The shell is a thin move: classic writers
// (ksmRenderSaveStatus(), ksmShowValidationDialog(), the nav menu functions, ...) patch classic
// state synchronously and read it back (ksmShellHeaderState(), ksmShellDialogsState(),
// ksmNavOpenMenu, ...), so that state stays classic; classic only signals, and this copies it.
// Same output as the classic publisher gave, which tests/golden/shell/*.json pin. Legacy is read
// only through shared/legacy.ts.
import { legacy, legacyNavState } from '../../shared/legacy.ts';
import { DIALOGS_EVENT, type DialogsInput } from './dialogs-model.ts';
import { HEADER_EVENT, type HeaderInput } from './header-model.ts';
import { NAV_EVENT, type NavInput } from './nav-model.ts';

interface ShellPublishWindow {
  /** The inputs as last computed (the islands and the golden test read them here). */
  ksmShellNavInput?: NavInput;
  ksmShellHeaderInput?: HeaderInput;
  ksmShellDialogsInput?: DialogsInput;
  /** Set by the classic signal stubs (ksmPublishNav(), ksmPublishHeader(), ksmPublishDialogs()), possibly from before this module ran. */
  ksmShellNavRequested?: boolean;
  ksmShellHeaderRequested?: boolean;
  ksmShellDialogsRequested?: boolean;
}

const shellWindow = (): ShellPublishWindow => window as unknown as ShellPublishWindow;

/**
 * The Courts and TV menus' items as links (their addresses, worked out as a menu opens): a plain
 * click still runs chooseCourt() / launchTvDisplay(); a new-tab click opens the address. None
 * before the tournament has a cloud ID (launchTvDisplay() saves it first).
 */
export function ksmNavLinks(): Record<string, string> {
  const id = legacy('ksmLegacyCloudSession')()?.tournamentId;
  if (!id) return {};
  const ksmLinkUrl = legacy('ksmLinkUrl');
  const tvLink = legacy('tvLink');
  const links: Record<string, string> = {};
  for (const c of ['A', 'B']) {
    links[`nav-court-${c.toLowerCase()}`] = ksmLinkUrl({ screen: 'court', id, court: c });
    const tv = tvLink(c);
    if (tv) links[`nav-tv-${c.toLowerCase()}`] = tv;
  }
  return links;
}

/** The bar's input: the open menu, its placement, the screen shown and the links. */
export function ksmShellNavInput(): NavInput {
  const nav = legacyNavState();
  return { open: nav.open, style: nav.style, active: nav.active, links: ksmNavLinks() };
}

/** A shallow copy of the classic header state (classic patches it in place afterwards). */
export function ksmShellHeaderInput(): HeaderInput {
  return { ...legacy('ksmShellHeaderState')() };
}

/** A shallow copy of the classic dialogs state. */
export function ksmShellDialogsInput(): DialogsInput {
  return { ...legacy('ksmShellDialogsState')() };
}

function refreshNav(): void {
  if (shellWindow().ksmShellNavRequested) shellWindow().ksmShellNavInput = ksmShellNavInput();
}
function refreshHeader(): void {
  if (shellWindow().ksmShellHeaderRequested) shellWindow().ksmShellHeaderInput = ksmShellHeaderInput();
}
function refreshDialogs(): void {
  if (shellWindow().ksmShellDialogsRequested) shellWindow().ksmShellDialogsInput = ksmShellDialogsInput();
}

/**
 * Pull: computes each input on its ksm:shell-* event, and once now for each one classic asked for
 * before this module ran (boot code publishes first; until then the islands draw the static
 * markup). Call it before mounting, so it runs ahead of the islands' own listeners (they redraw on
 * the same event and read the input this computed); it dispatches nothing, so there is no loop.
 */
export function startShellInput(): void {
  const listeners: Array<[string, () => void]> = [
    [NAV_EVENT, refreshNav], [HEADER_EVENT, refreshHeader], [DIALOGS_EVENT, refreshDialogs],
  ];
  for (const [event, refresh] of listeners) {
    window.addEventListener(event, refresh);
    refresh();
  }
}
