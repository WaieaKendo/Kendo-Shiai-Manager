// HTML escaping and print-sheet markup (issue #136 step 1c): moved from app/js/16-court-context-and-pool-editing.js
// and 17-print.js. Pure string builders.

/** Escapes & < > " ' for HTML text and attributes; null, undefined, 0, false and '' come back as ''. */
export function esc(s: unknown): string {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));
}

/** A value as a JSON string literal that is safe inside a double-quoted HTML attribute (for inline handlers). */
export function jsArg(v: unknown): string {
  return esc(JSON.stringify(String(v ?? '')));
}

/** The wrapper of one printed sheet: kicker, title and subtitle, then `body` as given. */
export function printSheet(title: unknown, subtitle: unknown, body: string, kicker: unknown = 'Kendo Shiai Manager'): string {
  return `<article class="print-sheet"><div class="print-head"><div class="print-kicker">${esc(kicker)}</div><div class="print-title">${esc(title)}</div><div class="print-subtitle">${esc(subtitle || '')}</div></div>${body}</article>`;
}

/** A competitor's name (TBD if empty) with their dojo underneath when there is one. */
export function printNameBlock(name: unknown, dojo: unknown): string {
  return `<div><div class="print-name">${esc(name || 'TBD')}</div>${dojo ? `<div class="print-dojo">${esc(dojo)}</div>` : ''}</div>`;
}
