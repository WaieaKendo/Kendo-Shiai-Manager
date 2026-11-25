// Registration helpers (issue #136 step 1): moved from app/js/03-registration-and-validation.js.

/** A registration's check-in status, as stored on competitors, teams and exhibition rows. */
export type EntryStatus = 'Registered' | 'Checked' | 'NoShow';

/** The status a click on the status badge moves to: Registered/other -> Checked -> NoShow -> Registered. */
export function statusCycle(s: string | null | undefined): EntryStatus {
  return s === 'Checked' ? 'NoShow' : s === 'NoShow' ? 'Registered' : 'Checked';
}

/** The record the registration validation reports for one problem (issue #136 step 1c). */
export function validationIssue(
  severity: unknown, code: unknown, divisionId: unknown, message: unknown, suggestedAction: unknown = '',
) {
  return { severity, code, divisionId, message, suggestedAction };
}
