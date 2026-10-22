// Keyboard access for elements that act as buttons but are not <button>s (the status chips,
// the header's status row): role="button", a tab stop, and Enter or Space press them. The key
// becomes a real click on the element (HTMLElement.click()), so the same handlers run as for a
// mouse click, including the document-wide listeners (autosave, closing menus).
import type { KeyboardEvent } from 'react';

/** Enter and Space activate a button (Space would otherwise scroll the page). */
export function isPressKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

/** onKeyDown for a role="button" element: Enter or Space clicks it. */
export function pressOnKey(event: KeyboardEvent<HTMLElement>): void {
  if (!isPressKey(event.key) || event.repeat) return;
  event.preventDefault();
  event.currentTarget.click();
}
