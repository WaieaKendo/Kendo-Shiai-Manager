// The header's status row (header.ksm-topbar .cloud-status-wrap): the Staff Login / Logout button
// and the status line (the role, the connection status, the devices online, the save status; a
// click opens Developer Tools), as the static markup of app/index.html has them and the legacy
// code writes them. setSessionRole(), setConnectionStatus(), renderPersistentSaveStatus(),
// updateSaveStatus() and renderCloudPresence() (app/js) publish what they wrote (ksm:shell-header);
// Header.tsx draws it; tests/golden/shell pins it.

export interface HeaderInput {
  /** #staffAuthButton's text: "Staff Login", or "Logout" in a staff session. */
  staffLabel: string;
  /** #sessionRole (hidden): its text, and its data-role once setSessionRole() set it. */
  role: { text: string; dataRole: string | null };
  /** #connectionStatus: its text, and data-mode and title once setConnectionStatus() set them. */
  connection: { text: string; mode: string | null; title: string | null };
  /** #cloudPresence (hidden): "3 online", or empty. */
  presence: string;
  /** #saveStatus: "Not saved yet", "✓ Saved 5 min ago", "Saved locally · 1 change waiting", ... */
  save: string;
}

/** Nothing published yet: the static markup. */
export const EMPTY_HEADER: HeaderInput = {
  staffLabel: 'Staff Login',
  role: { text: 'Spectator', dataRole: null },
  connection: { text: 'Local', mode: null, title: null },
  presence: '',
  save: 'Not saved yet',
};

/** The status line's tooltip (it opens Developer Tools). */
export const STATUS_TITLE = 'Open Cloud Diagnostics';
