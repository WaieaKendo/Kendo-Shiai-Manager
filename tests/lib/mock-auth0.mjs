// Local-only OAuth/JWKS issuer. Private keys and authorization codes never leave this process.
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { EMAIL_CLAIM, VERIFIED_CLAIM } from '../../auth0-worker.mjs';
export async function mockAuth0() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'local-key', alg: 'RS256', use: 'sig' };
  let issuer, jwksRequests = 0;
  const codes = new Map(), refreshTokens = new Map();
  const audience = 'https://ksm.test/api', clientId = 'mock-spa';
  async function token(email = 'admin@example.com', claims = {}, key = privateKey) {
    return new SignJWT({ iss: issuer, aud: audience, sub: `mock|${email}`, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, [EMAIL_CLAIM]: email, [VERIFIED_CLAIM]: true, ...claims }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(key);
  }
  const server = createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', req.headers.origin || '*');
    res.setHeader('access-control-allow-headers', 'content-type,auth0-client');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const url = new URL(req.url, issuer);
    const send = body => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
    if (url.pathname === '/.well-known/jwks.json') { jwksRequests++; send({ keys: [jwk] }); return; }
    if (url.pathname === '/test/token') { send({ token: await token(url.searchParams.get('email') || undefined) }); return; }
    if (url.pathname === '/authorize') {
      if (url.searchParams.get('prompt') === 'none') {
        const redirect = new URL(url.searchParams.get('redirect_uri'));
        const state = url.searchParams.get('state');
        if (url.searchParams.get('response_mode') === 'web_message') {
          res.setHeader('content-type', 'text/html');
          res.end(`<script>parent.postMessage({type:'authorization_response',response:{error:'login_required',state:${JSON.stringify(state)}}},${JSON.stringify(redirect.origin)})</script>`); return;
        }
      }
      if (url.searchParams.get('code_challenge_method') !== 'S256' || !url.searchParams.get('code_challenge')) { res.writeHead(400).end('PKCE required'); return; }
      // Pick a mock identity on this local form; preserve the complete SDK authorization request.
      if (!url.searchParams.has('email')) {
        res.setHeader('content-type', 'text/html');
        res.end(`<form method="get"><label>Email <input name="email" type="email" required></label>${[...url.searchParams].map(([key,value]) => `<input type="hidden" name="${key}" value="${value.replaceAll('&','&amp;').replaceAll('"','&quot;')}">`).join('')}<button>Continue</button></form>`); return;
      }
      if (url.searchParams.get('email') === 'denied@example.com') {
        const target = new URL(url.searchParams.get('redirect_uri'));
        target.searchParams.set('error', 'access_denied');
        target.searchParams.set('error_description', 'Service not found: https://ksm.test/api');
        target.searchParams.set('state', url.searchParams.get('state'));
        res.writeHead(302, { location: target.href }).end(); return;
      }
      const code = randomUUID(); codes.set(code, Object.fromEntries(url.searchParams));
      const target = new URL(url.searchParams.get('redirect_uri')); target.searchParams.set('code', code); target.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { location: target.href }).end(); return;
    }
    if (url.pathname === '/oauth/token') {
      let text = ''; for await (const chunk of req) text += chunk;
      let body; try { body = JSON.parse(text); } catch (_) { body = Object.fromEntries(new URLSearchParams(text)); }
      if (body.grant_type === 'refresh_token') {
        const email = refreshTokens.get(body.refresh_token);
        if (!email || body.client_id !== clientId) { res.writeHead(400); send({error:'invalid_grant'}); return; }
        refreshTokens.delete(body.refresh_token);
        const refresh_token = randomUUID(); refreshTokens.set(refresh_token, email);
        const id_token = await new SignJWT({email,email_verified:true}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(issuer).setAudience(clientId).setSubject(`mock|${email}`).setIssuedAt().setExpirationTime('1h').sign(privateKey);
        send({access_token:await token(email),refresh_token,id_token,token_type:'Bearer',expires_in:3600,scope:'openid profile email offline_access'}); return;
      }
      const authorization = codes.get(body.code); codes.delete(body.code);
      if (!authorization || createHash('sha256').update(body.code_verifier || '').digest('base64url') !== authorization.code_challenge || body.redirect_uri !== authorization.redirect_uri || body.client_id !== clientId) { res.writeHead(400); send({ error: 'invalid_grant' }); return; }
      const id_token = await new SignJWT({ email: authorization.email, email_verified: true, nonce: authorization.nonce }).setProtectedHeader({ alg:'RS256',kid:jwk.kid }).setIssuer(issuer).setAudience(clientId).setSubject(`mock|${authorization.email}`).setIssuedAt().setExpirationTime('1h').sign(privateKey);
      const refresh_token = randomUUID(); refreshTokens.set(refresh_token, authorization.email);
      send({ refresh_token, access_token: await token(authorization.email), id_token, token_type:'Bearer', expires_in:3600, scope:'openid profile email offline_access' }); return;
    }
    if (url.pathname === '/v2/logout') { res.writeHead(302, {location:url.searchParams.get('returnTo')}).end(); return; }
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${server.address().port}/`;
  return { issuer, audience, clientId, token, get jwksRequests() { return jwksRequests; }, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
if (process.argv[1]?.endsWith('/mock-auth0.mjs')) {
  const mock = await mockAuth0();
  console.log(JSON.stringify({issuer:mock.issuer,audience:mock.audience,clientId:mock.clientId}));
}
