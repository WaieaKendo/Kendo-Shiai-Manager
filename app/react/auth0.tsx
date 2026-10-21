import { Auth0Client } from '@auth0/auth0-spa-js';
import { tabSessionCache } from './auth-session-cache.ts';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { mountIsland } from './island.tsx';

type Account = { enabled: boolean; token: string; role: string; globalRole: string; tournamentId: string; email: string; passwordFallback: boolean };
type Bridge = { state(): Account; tournament(): string; name(): string; update(patch: Partial<Account>): void; reconnect(): void; refreshUi(): void; headers(): Record<string,string>; clearStaff(): void; restore(): Promise<unknown>; library(): Promise<unknown> };
const w = window as unknown as { ksmAuthBridge: Bridge; ksmResolveAuthReady(): void; ksmRefreshAccount?: (id?: string) => Promise<void> };
const bridge = w.ksmAuthBridge;
let sdk: Auth0Client | undefined;
let snapshot = { ...bridge.state() };
let message = '';
const listeners = new Set<() => void>();
function publish() {
  snapshot = { ...bridge.state() };
  (window as unknown as { ksmAuthMessage: string }).ksmAuthMessage = message;
  window.dispatchEvent(new CustomEvent('ksm:auth-message'));
  listeners.forEach(fn => fn());
}
window.addEventListener('ksm:account', publish);
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
async function refresh(id = bridge.tournament()) {
  if (!sdk || (!bridge.state().email && !(await sdk.isAuthenticated()))) return;
  const token = await sdk.getTokenSilently();
  const headers = { authorization: `Bearer ${token}` };
  const me = await fetch('/api/auth/me', { headers, cache: 'no-store' });
  if (!me.ok) throw new Error('Sign-in could not be verified.');
  const account = await me.json() as { email: string; role: string };
  const access = id ? await fetch(`/api/tournaments/${encodeURIComponent(id)}/access`, { headers, cache: 'no-store' }) : null;
  if (access && !access.ok) throw new Error('Tournament access could not be verified.');
  const permission = access ? await access.json() as { role: string; passwordFallback: boolean } : { role: account.role, passwordFallback: true };
  // A request begun for A must never grant access while B is displayed.
  bridge.update({ token, globalRole: account.role, email: account.email, role: permission.role, tournamentId: id, passwordFallback: permission.passwordFallback });
}
w.ksmRefreshAccount = async id => {
  const before = { ...bridge.state() };
  try { await refresh(id); message = ''; }
  catch (error) { bridge.update({ token: '', role: 'spectator', globalRole: 'spectator' }); message = (error as Error).message; }
  const after = bridge.state();
  if (before.token !== after.token || before.role !== after.role || before.globalRole !== after.globalRole) bridge.reconnect();
  publish();
};
async function login() {
  try {
    await sdk?.loginWithRedirect({ appState: { returnTo: location.pathname + location.search }, authorizationParams: { redirect_uri: `${location.origin}/`, prompt: 'select_account' } });
  } catch (error) { message = (error as Error).message; publish(); }
}
async function logout() {
  bridge.clearStaff();
  bridge.update({ token: '', role: 'spectator', globalRole: 'spectator', email: '' });
  bridge.reconnect();
  await sdk?.logout({ logoutParams: { returnTo: `${location.origin}/` } });
}
function AuthControls() {
  const account = useSyncExternalStore(subscribe, () => snapshot);
  if (!account.enabled) return null;
  return <>{account.email ? <details className="ksm-account-menu"><summary>Account</summary><div className="ksm-account-panel"><strong>{account.email}</strong><span>{account.globalRole === 'admin' ? 'Admin' : account.role === 'director' ? 'Director' : 'Spectator'}</span><a href="/">Tournament Library</a><button type="button" className="secondary" data-testid="auth0-sign-in" onClick={() => { void logout(); }}>Sign out</button></div></details> : <button type="button" className="secondary" data-testid="auth0-sign-in" onClick={() => { void login(); }}>Sign in</button>}{message && <span role="status">{message}</span>}</>;
}
function RoleStrip() {
  const account = useSyncExternalStore(subscribe, () => snapshot);
  const role = account.globalRole === 'admin' ? 'admin' : account.role === 'director' && account.tournamentId === bridge.tournament() ? 'director' : '';
  if (!account.enabled || !account.token || !role || document.body.classList.contains('ksm-tv') || document.body.classList.contains('ksm-spectator') && !!bridge.tournament()) return null;
  return <div className={`ksm-role-strip ksm-role-${role}`} data-testid="account-role" role="status">{role === 'admin' ? '◆ Admin' : `◆ Director · ${bridge.name()}`}</div>;
}
function Directors() {
  const account = useSyncExternalStore(subscribe, () => snapshot);
  const id = bridge.tournament();
  const [emails, setEmails] = useState<string[]>([]), [email, setEmail] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const admin = account.enabled && account.globalRole === 'admin' && !!account.token;
  useEffect(() => {
    let current = true;
    setEmails([]); setError('');
    if (admin && id) void fetch(`/api/tournaments/${encodeURIComponent(id)}/directors`, { headers: { authorization: `Bearer ${account.token}` } }).then(async response => {
      if (!response.ok) throw new Error('Unable to load directors');
      const body = await response.json() as { directors: string[] }; if (current) setEmails(body.directors);
    }).catch(e => { if (current) setError((e as Error).message); });
    return () => { current = false; };
  }, [admin, id, account.token]);
  if (!admin || !id) return null;
  async function change(method: 'POST' | 'DELETE', value: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(id)}/directors`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${account.token}` }, body: JSON.stringify({ email: value }) });
      const result = await response.json() as { directors: string[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to update directors');
      if (id === bridge.tournament()) { setEmails(result.directors); setEmail(''); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="ksm-directors" data-testid="directors-management"><h4>Tournament directors</h4>
    <p>Directors can manage this tournament. Appointing a director turns off its shared-password access.</p>
    <ul>{emails.map(value => <li key={value}>{value} <button type="button" disabled={busy} onClick={() => { void change('DELETE', value); }} aria-label={`Remove ${value}`}>Remove</button></li>)}</ul>
    {!emails.length && <p>No directors appointed. Staff password access is available.</p>}
    <form onSubmit={event => { event.preventDefault(); void change('POST', email); }}><label>Director email <input type="email" required value={email} onChange={event => setEmail(event.target.value)} data-testid="director-email" /></label><button type="submit" disabled={busy}>Add director</button></form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
function Visibility() {
  const account = useSyncExternalStore(subscribe, () => snapshot);
  const id = bridge.tournament();
  const manage = account.globalRole === 'admin' || account.role === 'director' && account.tournamentId === id;
  const [isPublic, setPublic] = useState<boolean | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true; setPublic(null);
    if (manage && id && account.token) void fetch(`/api/tournaments/${id}/visibility`, { headers: { authorization: `Bearer ${account.token}` } }).then(async response => {
      if (!response.ok) throw new Error('Unable to read visibility');
      const body = await response.json() as { isPublic: boolean }; if (active) setPublic(body.isPublic);
    }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [manage, id, account.token]);
  if (!manage || !id || !account.token) return null;
  async function change(value: boolean) {
    const previous = isPublic;
    setPublic(value); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/tournaments/${id}/visibility`, { method: 'PUT', headers: { 'content-type':'application/json', authorization: `Bearer ${account.token}` }, body: JSON.stringify({ isPublic:value }) });
      if (!response.ok) throw new Error('Unable to update visibility');
      if (id === bridge.tournament()) setPublic(value);
      await bridge.library(); bridge.reconnect();
    } catch (e) { setPublic(previous); setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="ksm-visibility" data-testid="tournament-visibility"><h4>Public listing</h4>
    <label><input type="checkbox" checked={isPublic === true} disabled={isPublic === null || busy} onChange={e => { void change(e.target.checked); }} /> Show this tournament publicly</label>
    <p>{isPublic ? 'Anyone can find this tournament and watch without signing in.' : 'Private: only admins and assigned directors can view or manage this tournament.'}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
window.addEventListener('ksm:sign-in', () => { void login(); });
window.addEventListener('ksm:sign-out', () => { void logout(); });
function mountAccountUi() {
// Separate islands leave the existing status and Setup markup intact when disabled.
const controls = document.createElement('span'); controls.className = 'ksm-auth-controls';
const status = document.querySelector('.cloud-status-wrap');
if (status) { const group = document.createElement('div'); group.className = 'ksm-account-status'; status.before(group); group.append(controls, status); }
mountIsland(controls, <AuthControls />);
const strip = document.createElement('div'); strip.className = 'ksm-role-host';
document.querySelector('header.ksm-topbar')?.before(strip);
mountIsland(strip, <RoleStrip />);
const management = document.createElement('div');
document.querySelector('#setup-tournament-actions .setup-tournament-actions > div')?.append(management);
mountIsland(management, <><Visibility /><Directors /></>);
// Explicit TV/spectator navigation and tournament renames must repaint the strip as well.
new MutationObserver(publish).observe(document.body, { attributes: true, attributeFilter: ['class'] });
document.getElementById('tName')?.addEventListener('input', publish);
}
async function initialize() {
  try {
    const response = await fetch('/api/auth/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Sign-in configuration unavailable');
    const config = await response.json() as { enabled: boolean; domain: string; audience: string; clientId: string };
    if (!config.enabled) return;
    mountAccountUi();
    bridge.update({ enabled: true });
    void bridge.library();
    sdk = new Auth0Client({ domain: config.domain, clientId: config.clientId, cache: tabSessionCache(`${config.domain}|${config.clientId}|${config.audience}`), authorizationParams: { audience: config.audience, scope: 'openid profile email', redirect_uri: `${location.origin}/` } });
    const params = new URLSearchParams(location.search);
    if (params.has('state') && (params.has('code') || params.has('error'))) {
      const result = await sdk.handleRedirectCallback<{ returnTo?: string }>();
      const target = result.appState?.returnTo || '/';
      // Only relative same-origin paths saved by this app may become the return address.
      history.replaceState(null, '', target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') ? target : '/');
      w.ksmResolveAuthReady();
      await w.ksmRefreshAccount?.();
      await bridge.restore();
    }
    if (!(await sdk.isAuthenticated())) { try { await sdk.getTokenSilently(); } catch (_) { /* No Auth0 session yet. */ } }
    if (await sdk.isAuthenticated()) await w.ksmRefreshAccount?.();
    bridge.refreshUi(); bridge.reconnect();
    setInterval(() => { if (bridge.state().email) void w.ksmRefreshAccount?.().then(() => bridge.refreshUi()); }, 30000);
    window.addEventListener('online', () => { void w.ksmRefreshAccount?.().then(() => bridge.reconnect()); });
  } catch (error) {
    message = (error as Error).message;
    const url = new URL(location.href);
    if (url.searchParams.has('state') && (url.searchParams.has('code') || url.searchParams.has('error'))) {
      for (const key of ['state', 'code', 'error', 'error_description', 'iss']) url.searchParams.delete(key);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    publish();
  }
  finally { w.ksmResolveAuthReady(); }
}
void initialize();
