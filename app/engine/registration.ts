// Registration helpers (issue #136 step 1): moved from app/js/03-registration-and-validation.js.

/** A registration's check-in status, as stored on competitors, teams and exhibition rows. */
export type EntryStatus = 'Registered' | 'Checked' | 'NoShow';

/** The status a click on the status badge moves to: Registered/other -> Checked -> NoShow -> Registered. */
export function statusCycle(s: string | null | undefined): EntryStatus {
  return s === 'Checked' ? 'NoShow' : s === 'NoShow' ? 'Registered' : 'Checked';
}
