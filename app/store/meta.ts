// Who / when / device / court for every store action (#15). Court actions already record these on their patch-v1
// entries (court-scoring-and-history.js: label, court, when, clientId, tabId, revision); store actions carry the same
// facts in `action.meta`, so the action log answers "what happened on Court B?" and Phase 3 can replay actions on the
// server. Everything is plain JSON (the serializable-action check enforces it).

export type StoreCourt = 'A' | 'B';

export interface ActionMeta {
  /** Who did it: the signed-in account or the session role's display name; '' when unknown (local use). */
  who: string;
  /** When, as an ISO 8601 string (not a Date: actions must be serializable). */
  when: string;
  /** This device: the cloud session's clientId plus the tab (KSM_TAB_ID), e.g. 'c-123/t-4'; '' when unknown. */
  device: string;
  /** The court the action happened on, or null for actions that are not tied to a court (registration, setup). */
  court: StoreCourt | null;
}

export interface ActionMetaInput {
  who?: string | null | undefined;
  when?: string | Date | null | undefined;
  device?: string | null | undefined;
  court?: string | null | undefined;
}

/** 'A' or 'B' for a court value ('a', ' b ', 'B'), null for anything else. */
export function metaCourt(value: unknown): StoreCourt | null {
  const c = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return c === 'A' || c === 'B' ? c : null;
}

/** A complete, serializable ActionMeta: missing fields become '' / now / null. */
export function actionMeta(input: ActionMetaInput = {}, now: () => Date = () => new Date()): ActionMeta {
  const when = input.when instanceof Date ? input.when : typeof input.when === 'string' && input.when ? new Date(input.when) : now();
  if (Number.isNaN(when.getTime())) throw new RangeError(`actionMeta: invalid time ${String(input.when)}`);
  return {
    who: typeof input.who === 'string' ? input.who : '',
    when: when.toISOString(),
    device: typeof input.device === 'string' ? input.device : '',
    court: metaCourt(input.court),
  };
}

/**
 * The `prepare` callback for a slice reducer whose actions carry ActionMeta:
 *   scorePoint: { reducer(state, action: PayloadAction<P, string, ActionMeta>) {...}, prepare: withMeta<P>() }
 * then `dispatch(scorePoint(payload, { who, device, court }))`.
 */
export function withMeta<P>(now?: () => Date): (payload: P, meta?: ActionMetaInput) => { payload: P; meta: ActionMeta } {
  return (payload, meta) => ({ payload, meta: actionMeta(meta, now) });
}
