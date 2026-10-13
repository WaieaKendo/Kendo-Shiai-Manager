// Shared parts of the shell islands (Shell.tsx, Dialogs.tsx): the legacy globals they read and
// call, the publish subscriptions, style attributes written as the markup printed them, and the
// header islands' native click listeners.
import { useLayoutEffect, useRef } from 'react';
import type { DialogsInput } from './dialogs-model.ts';
import type { HeaderInput } from './header-model.ts';
import type { NavInput } from './nav-model.ts';

export interface ShellWindow {
  /** What app/js/44-react-shell.js last published. */
  ksmShellNavInput?: NavInput;
  ksmShellHeaderInput?: HeaderInput;
  ksmShellDialogsInput?: DialogsInput;
  /** Set by main.tsx once the islands are mounted; the legacy code checks it. */
  ksmShellMounted?: boolean;
  toggleNavMenu?: (id: string, event: Event) => unknown;
  closeNavMenus?: (exceptId?: string) => unknown;
  toggleStaffSession?: () => unknown;
  cloudDiagnostics?: () => unknown;
  confirmFusen?: (side: 'W' | 'R') => unknown;
  closeFusenDialog?: () => unknown;
  /** Owner decision 20: Developer Tools' test tools switch. */
  ksmToggleTestTools?: () => unknown;
  closeManagementModal?: (id: string) => unknown;
  /** The generation check's Generate: closes it and runs what showValidationDialog() was given. */
  ksmConfirmValidation?: () => unknown;
  continueRegenerateDivision?: () => unknown;
  regenerateSingleDivision?: (division: string) => unknown;
  closeCloudModal?: () => unknown;
  copyTextValue?: (value: string, success: string, closeAfter?: boolean) => unknown;
  downloadSnapshotAnalysis?: () => unknown;
  downloadActionHistorySample?: () => unknown;
  retryQueuedCloudSave?: () => unknown;
  replaceTournamentFromFile?: () => unknown;
  loadTournamentFileAsNew?: () => unknown;
}

export const shellWindow = (): ShellWindow => window as unknown as ShellWindow;

export const subscribeTo = (event: string) => (onChange: () => void): (() => void) => {
  window.addEventListener(event, onChange);
  return () => window.removeEventListener(event, onChange);
};

const styleRefs = new Map<string, (el: HTMLElement | null) => void>();

/** A ref that writes a style attribute as the markup printed it (React's style prop would write
 * "display: none;"); one callback per style text, so React does not detach and attach it on every
 * render. */
export function rawStyle(style: string): (el: HTMLElement | null) => void {
  let ref = styleRefs.get(style);
  if (!ref) {
    ref = el => { if (el && el.getAttribute('style') !== style) el.setAttribute('style', style); };
    styleRefs.set(style, ref);
  }
  return ref;
}

// React handles events by listening on its root element, for every event type. Mouse, pointer and
// touch listeners there make every part of the header a tap target for Chrome's touch adjustment
// (a node "responds to taps" when it or an ancestor listens to clicks or mouse moves), so on a
// phone a tap just outside an open menu was moved into the menu instead of closing it
// (tests/mobile-dropdown-test.py). The header islands (the navigation bar, the status row)
// therefore take none of those listeners on their roots, and their controls listen to their own
// clicks, as the inline handlers did. (They use no other React mouse, pointer or touch events.)
const POINTING_EVENT = /^(click|dblclick|auxclick|contextmenu|mouse|pointer|touch|gotpointercapture|lostpointercapture)/;

/** Runs `mount` (which creates a React root on `root`) without React's mouse, pointer and touch
 * listeners on `root`; React's empty onclick handler on its root (set for iOS Safari as it inserts
 * the root's first elements) is refused too: it is a click listener as well. */
export function withoutPointingListeners(root: Element, mount: () => void): void {
  const own = root.addEventListener;
  root.addEventListener = function (this: Element, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (POINTING_EVENT.test(type)) return;
    if (listener) own.call(this, type, listener, options);
  } as typeof root.addEventListener;
  Object.defineProperty(root, 'onclick', { configurable: true, get: () => null, set: () => {} });
  try {
    mount();
  } finally {
    delete (root as unknown as { addEventListener?: unknown }).addEventListener;
  }
}

/** A native click listener on the element (what an inline onclick did), with the native event;
 * attached as React inserts the element (a layout effect) and kept until React removed it. */
export function useNativeClick<T extends HTMLElement>(handler: (event: MouseEvent) => void) {
  const ref = useRef<T>(null);
  const latest = useRef(handler);
  latest.current = handler;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const click = (event: MouseEvent) => latest.current(event);
    el.addEventListener('click', click);
    return () => el.removeEventListener('click', click);
  }, []);
  return ref;
}
