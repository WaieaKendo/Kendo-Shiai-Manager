// @ts-check
export function esc(s){return KSMEngine.esc(s);// moved to app/engine/html-text.ts
  }
// A value as a JavaScript string literal inside an inline on*="..." handler. esc() alone is not enough:
// the HTML parser decodes &#39; back to ' before the handler runs, so a name could break out of '...'.
export function jsArg(v){return KSMEngine.jsArg(v);// moved to app/engine/html-text.ts
  }
