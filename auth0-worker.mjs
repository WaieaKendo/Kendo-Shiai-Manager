import { createRemoteJWKSet, jwtVerify } from 'jose';

export const EMAIL_CLAIM = 'https://ksm.app/email';
export const VERIFIED_CLAIM = 'https://ksm.app/email_verified';
export function auth0Enabled(env) {
  return Boolean(env.AUTH0_DOMAIN || env.AUTH0_AUDIENCE || env.AUTH0_CLIENT_ID);
}
export function auth0Config(env) {
  if (!auth0Enabled(env)) return null;
  if (!env.AUTH0_DOMAIN || !env.AUTH0_AUDIENCE || !env.AUTH0_CLIENT_ID) throw new Error('Incomplete Auth0 configuration');
  const domain = String(env.AUTH0_DOMAIN).trim();
  const issuer = new URL(domain.includes('://') ? domain : `https://${domain}`);
  // Plain HTTP is exclusively for the local mock issuer used by tests.
  if (issuer.protocol !== 'https:' && !(issuer.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(issuer.hostname))) throw new Error('Auth0 requires HTTPS');
  if (issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname !== '/') throw new Error('Invalid Auth0 domain');
  return { domain: issuer.origin, issuer: issuer.href, audience: String(env.AUTH0_AUDIENCE), clientId: String(env.AUTH0_CLIENT_ID) };
}
export function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email) ? email : '';
}
export function isAdmin(env, email) {
  return Boolean(email && String(env.ADMIN_EMAILS || '').split(',').map(normalizeEmail).includes(email));
}
// Each Worker/DO owns its resolver: jose caches JWKS for 10 min and rate-limits unknown-kid
// refreshes. No tokens, identities or roles are cached; account checks re-read the access store.
const verifiers = new WeakMap();
export function identityVerifier(env) {
  if (verifiers.has(env)) return verifiers.get(env);
  let resolver, issuer;
  const verify = async token => {
    const config = auth0Config(env);
    if (!config || !token) throw new Error('Sign-in required');
    if (issuer !== config.issuer) {
      issuer = config.issuer;
      resolver = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer), { cacheMaxAge: 600000, cooldownDuration: 30000, timeoutDuration: 5000 });
    }
    const { payload } = await jwtVerify(token, resolver, { issuer, audience: config.audience, algorithms: ['RS256'], requiredClaims: ['exp', 'sub'], clockTolerance: 0 });
    const email = normalizeEmail(payload[EMAIL_CLAIM]);
    if (!email || payload[VERIFIED_CLAIM] !== true || typeof payload.sub !== 'string' || !payload.sub) throw new Error('Verified email required');
    return { email, sub: payload.sub, emailVerified: true, expiresAt: payload.exp * 1000 };
  };
  verifiers.set(env, verify);
  return verify;
}
export function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return /^Bearer\s+\S+$/i.test(header) ? header.replace(/^Bearer\s+/i, '') : '';
}
