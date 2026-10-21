// The app shell's islands in the page header (header.ksm-topbar): the navigation bar (the contents
// of nav.minimal-nav: the tiles, the Courts / TV menus, the hidden file
// inputs) and the status row (the contents of .cloud-status-wrap: Staff Login / Logout and the
// status line), with the same elements, classes, ids, titles and test IDs as the static markup of
// app/index.html (and the overlay items app/js added to the TV menu), so the header CSS and every
// test apply unchanged; tests/golden/shell pins them. The brand (Tournament Library) stays static
// markup.
//
// The legacy app decides what is shown and runs every action: toggleNavMenu(), closeNavMenus(),
// the resize listener and setActiveNavForView() publish the open menu, its placement on a phone
// and the screen shown (ksm:shell-nav); setSessionRole(), setConnectionStatus(),
// renderPersistentSaveStatus(), updateSaveStatus() and renderCloudPresence() publish the status
// row (ksm:shell-header), through app/js/44-react-shell.js. Every control calls what its inline
// handler called (toggleNavMenu(id, event) with the click event), from a native click listener on
// the control itself, as the inline handlers ran (the islands' roots take no mouse, pointer
// or touch listeners: see withoutPointingListeners() in shell-dom.ts), before the document-wide
// listeners. The file inputs run their loaders from a native change listener with the native
// event (they read event.target.files and clear its value).
// No colors of their own (the header CSS and theme tokens); the tile icons come from the branding
// module.
import { pressOnKey } from '../keyboard.ts';
import { TOURNAMENT_HOME } from '../../engine/routes.ts';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_NAV_ICONS } from '../court/branding.ts';
import { EMPTY_HEADER, type HeaderInput } from './header-model.ts';
import {
  EMPTY_NAV, NAV_ENTRIES, NAV_FILE_ACCEPT, NAV_FILE_INPUTS, NAV_FILE_STYLE, NAV_MENU_ARROW,
  activeEntryIndex, menuClass, tileClass,
  type NavAction, type NavFileInput, type NavInput, type NavMenu, type NavMenuEntry, type NavTile,
} from './nav-model.ts';
import { rawStyle, shellWindow, subscribeTo, useNativeClick } from './shell-dom.ts';

export const NAV_EVENT = 'ksm:shell-nav';
export const HEADER_EVENT = 'ksm:shell-header';

const subscribeNav = subscribeTo(NAV_EVENT);
const subscribeHeader = subscribeTo(HEADER_EVENT);
const navSnapshot = (): NavInput => shellWindow().ksmShellNavInput ?? EMPTY_NAV;
const headerSnapshot = (): HeaderInput => shellWindow().ksmShellHeaderInput ?? EMPTY_HEADER;

/** What an inline handler did: closeNavMenus() first if it did, then its call. */
function run(action: NavAction) {
  const w = shellWindow() as unknown as Record<string, unknown>;
  if (action.close) (w.closeNavMenus as (() => unknown) | undefined)?.();
  const args = action.args ?? [];
  if (action.fn === 'alert') {
    window.alert(args[0]);
    return;
  }
  (w[action.fn] as ((...a: string[]) => unknown) | undefined)?.(...args);
}

function Tile({ tile, active }: { tile: NavTile; active: boolean }) {
  const ref = useNativeClick<HTMLButtonElement>(() => run(tile.action));
  return (
    <button ref={ref} className={tileClass(tile.className, active)} aria-current={active ? 'page' : undefined}
      title={tile.title} data-testid={tile.testId}>
      <img src={DEFAULT_NAV_ICONS[tile.icon]} alt="" />
      <span>{tile.label}</span>
    </button>
  );
}

/** A menu item (or heading, divider). An item with an address is a link: a plain click runs its
 * action in this tab as before; Cmd/Ctrl/Shift-click, the middle button and the context menu's
 * "Open Link in New Tab" open the address. */
function MenuItem({ entry, href }: { entry: NavMenuEntry; href?: string | undefined }) {
  const ref = useNativeClick<HTMLElement>(event => {
    if (entry.kind !== 'item') return;
    if (href) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
    }
    run(entry.action);
  });
  if (entry.kind === 'heading') return <div className="menu-heading">{entry.label}</div>;
  if (entry.kind === 'divider') return <div className="menu-divider"></div>;
  if (href) return <a ref={ref as React.RefObject<HTMLAnchorElement>} className="nav-menu-link" href={href} data-testid={entry.testId} title={entry.title}>{entry.label}</a>;
  return <button ref={ref as React.RefObject<HTMLButtonElement>} data-testid={entry.testId} title={entry.title}>{entry.label}</button>;
}

function Menu({ menu, open, style, active, links }: { menu: NavMenu; open: boolean; style: NavInput['style']; active: boolean; links: NavInput['links'] }) {
  const ref = useNativeClick<HTMLButtonElement>(event => { shellWindow().toggleNavMenu?.(menu.menuId, event); });
  return (
    <div className={menu.wrapClassName}>
      <button ref={ref} className={tileClass('nav-tile nav-menu-trigger', active)} aria-current={active ? 'page' : undefined}
        type="button" aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} aria-controls={menu.menuId}
        title={menu.trigger.title} data-testid={menu.trigger.testId}>
        <img src={DEFAULT_NAV_ICONS[menu.trigger.icon]} alt="" />
        <span>{`${menu.trigger.label} `}<b aria-hidden="true">{NAV_MENU_ARROW}</b></span>
      </button>
      <div id={menu.menuId} role="menu" className={menuClass(menu.menuClassName, open)}
        style={open && style ? { top: style.top, left: style.left, right: style.right, maxHeight: style.maxHeight } : undefined}>
        {menu.entries.map((entry, i) => <MenuItem key={i} entry={entry} href={entry.kind === 'item' && entry.testId ? links?.[entry.testId] : undefined} />)}
      </div>
    </div>
  );
}

/** A hidden file input; its change event runs the loader with the native event, as the inline
 * onchange did (attached as React inserts it, kept until React removed it). */
function FileInput({ input }: { input: NavFileInput }) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const change = (event: Event) => { (shellWindow() as unknown as Record<string, ((e: Event) => unknown) | undefined>)[input.onChange]?.(event); };
    el.addEventListener('change', change);
    return () => el.removeEventListener('change', change);
  }, [input.onChange]);
  return (
    <input ref={el => { ref.current = el; rawStyle(NAV_FILE_STYLE)(el); }} id={input.id} type="file" accept={NAV_FILE_ACCEPT} data-testid={input.testId} />
  );
}

/** The contents of header.ksm-topbar nav.minimal-nav. */
export function Nav() {
  const input = useSyncExternalStore(subscribeNav, navSnapshot, () => EMPTY_NAV);
  const active = activeEntryIndex(NAV_ENTRIES, input.active);
  return (
    <>
      {NAV_ENTRIES.map((entry, i) => entry.kind === 'tile'
        ? <Tile key={entry.testId} tile={entry} active={i === active} />
        : <Menu key={entry.menuId} menu={entry} open={input.open === entry.menuId} style={input.style} active={i === active} links={input.links} />)}
      {NAV_FILE_INPUTS.map(f => <FileInput key={f.id} input={f} />)}
    </>
  );
}

/** The primary tournament text next to the logo. */
export function TournamentChip() {
  const h = useSyncExternalStore(subscribeHeader, headerSnapshot, () => EMPTY_HEADER);
  const [expanded, setExpanded] = useState(false);
  const toggle = useNativeClick<HTMLButtonElement>(() => setExpanded(value => !value));
  const home = useNativeClick<HTMLAnchorElement>(event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    shellWindow().navigateTo?.(TOURNAMENT_HOME.view);
    setExpanded(false);
  });
  useLayoutEffect(() => {
    if (!expanded) return;
    const nav = document.querySelector<HTMLElement>('header.ksm-topbar nav.minimal-nav');
    if (!nav) return;
    const marker = document.createComment('mobile navigation');
    nav.before(marker);
    const layer = document.createElement('div'); layer.className = 'mobile-nav-layer';
    const backdrop = document.createElement('div'); backdrop.className = 'mobile-nav-backdrop';
    const drawer = document.createElement('div'); drawer.className = 'mobile-nav-drawer';
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-label', 'Tournament navigation');
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'mobile-nav-close'; dismiss.textContent = 'Close navigation ×';
    const close = () => { setExpanded(false); shellWindow().closeNavMenus?.(); };
    dismiss.addEventListener('click', close); backdrop.addEventListener('click', close);
    drawer.append(dismiss, nav); layer.append(backdrop, drawer); document.body.append(layer);
    // The nav is a separate React island: move its root, keeping its controls and listeners.
    const background = [...document.querySelectorAll<HTMLElement>('body > header, body > main, body > footer')];
    const inert = background.map(el => el.inert); background.forEach(el => { el.inert = true; });
    document.body.classList.add('ksm-nav-expanded');
    dismiss.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const controls = [...drawer.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el => el.checkVisibility());
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const click = (event: MouseEvent) => {
      const el = event.target as Element;
      if (el.closest('.nav-dropdown button') || el.closest('.nav-tile:not([aria-haspopup])')) close();
    };
    const resize = () => { if (innerWidth > 900) close(); };
    document.addEventListener('keydown', keyboard); drawer.addEventListener('click', click); window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('keydown', keyboard); drawer.removeEventListener('click', click); window.removeEventListener('resize', resize);
      marker.replaceWith(nav); layer.remove(); background.forEach((el, i) => { el.inert = inert[i] ?? false; });
      document.body.classList.remove('ksm-nav-expanded'); toggle.current?.focus();
    };
  }, [expanded, toggle]);
  useLayoutEffect(() => { if (!h.tournamentName) setExpanded(false); }, [h.tournamentName]);
  useLayoutEffect(() => {
    document.querySelector('.nav-brand')?.setAttribute('title', h.role.dataRole === 'staff' ? 'Tournament Library' : TOURNAMENT_HOME.label);
  }, [h.role.dataRole]);
  if (!h.tournamentName) return null;
  return <>
    <a ref={home} className="tournament-home-link" data-testid="tournament-chip" href={shellWindow().ksmTournamentHomeUrl?.() ?? '/'} title={`${h.tournamentName} — ${TOURNAMENT_HOME.label}`}>
      <span className="tournament-chip-name">{h.tournamentName}</span>
    </a>
    <button ref={toggle} className="mobile-nav-toggle" type="button" data-testid="nav-toggle" aria-label={expanded ? 'Close navigation' : 'Open navigation'} aria-expanded={expanded} aria-controls="tournamentNavigation">☰</button>
  </>;
}

/** The contents of header.ksm-topbar .cloud-status-wrap. */
export function StatusRow() {
  const h = useSyncExternalStore(subscribeHeader, headerSnapshot, () => EMPTY_HEADER);
  const staff = useNativeClick<HTMLButtonElement>(() => { shellWindow().toggleStaffSession?.(); });
  const diagnostics = useNativeClick<HTMLSpanElement>(() => shellWindow().cloudDiagnostics?.());
  const retry = useNativeClick<HTMLButtonElement>(() => { shellWindow().saveNow?.(); });
  return (
    <>
      <button ref={staff} id="staffAuthButton" className="secondary" type="button" data-testid="staff-auth">{h.staffLabel}</button>
      <div className={h.warning ? 'save-warning' : undefined} role="status">
        <span id="sessionRole" hidden data-role={h.role.dataRole ?? undefined}>{h.role.text}</span>
        <span ref={diagnostics} role="button" tabIndex={0} onKeyDown={pressOnKey} id="connectionStatus" className="small nav-save-status" data-testid="connection-status"
          data-mode={h.connection.mode ?? undefined} title={h.connection.title ?? undefined}>{h.connection.text}</span>
        <span id="cloudPresence" hidden>{h.presence}</span>
        <span id="saveStatus" className="small nav-save-status" data-testid="save-status">{h.save}</span>
      </div>
      {h.retry && <button ref={retry} type="button" data-testid="header-save-now"><span className="retry-warning">Not saved</span>Save now</button>}
    </>
  );
}
