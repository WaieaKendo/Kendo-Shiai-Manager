import type { ICache } from '@auth0/auth0-spa-js';

// Tab-scoped SDK cache: reloads retain unexpired tokens; logout uses the SDK's remove/allKeys.
// Entries are namespaced to the exact issuer/application/audience. Roles still come from the API.
export function tabSessionCache(namespace: string): ICache {
  const prefix = `ksm.auth0.${encodeURIComponent(namespace)}.`;
  const memory = new Map<string, unknown>();
  return {
    set<T>(key: string, entry: T) {
      memory.set(key, entry);
      try { sessionStorage.setItem(prefix + key, JSON.stringify(entry)); } catch (_) { /* Memory fallback. */ }
    },
    get<T>(key: string): T | undefined {
      try {
        const value = sessionStorage.getItem(prefix + key);
        if (value) return JSON.parse(value) as T;
      } catch (_) { /* Invalid/unavailable storage falls back to memory. */ }
      return memory.get(key) as T | undefined;
    },
    remove(key: string) {
      memory.delete(key);
      try { sessionStorage.removeItem(prefix + key); } catch (_) { /* Memory already cleared. */ }
    },
    allKeys() {
      const keys = new Set(memory.keys());
      try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) keys.add(key.slice(prefix.length)); } catch (_) { /* Memory fallback. */ }
      return [...keys];
    },
  };
}
