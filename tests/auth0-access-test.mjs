import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { createInProcessApi } from './lib/worker-runtime.mjs';
import { mockAuth0 } from './lib/mock-auth0.mjs';
import { EMAIL_CLAIM, VERIFIED_CLAIM } from '../auth0-worker.mjs';
const mock = await mockAuth0();
const auth0 = { AUTH0_DOMAIN:mock.issuer, AUTH0_AUDIENCE:mock.audience, AUTH0_CLIENT_ID:mock.clientId, ADMIN_EMAILS:' ADMIN@Example.com ' };
const api = await createInProcessApi({auth0});
const jwt = {};
for (const email of ['admin@example.com','director@example.com','outsider@example.com']) jwt[email.split('@')[0]] = await mock.token(email);
const headers = token => ({authorization:`Bearer ${token}`,'x-ksm-role':'staff'});
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const body = {payload:{setup:{tName:'Auth Cup'},state:{}},revision:0};
async function create() { const response=await api.call('POST','/api/tournaments',{headers:headers(jwt.admin),body});assert.equal(response.status,200);assert.equal(response.headers.get('x-ksm-session-token'),null);return {id:(await response.json()).tournamentId,session:''}; }
try {
  const a = await create(), b = await create();
  for(const item of [a,b])assert.equal((await api.call('PUT',`/api/tournaments/${item.id}/visibility`,{headers:headers(jwt.admin),body:{isPublic:true}})).status,200);
  await test('create/delete are admin-only when Auth0 is configured', async () => {
    for (const token of ['',jwt.director,jwt.outsider]) {
      assert.equal((await api.call('POST','/api/tournaments',{headers:token?headers(token):{},body})).status,403);
      assert.equal((await api.call('DELETE',`/api/tournaments/${b.id}`,{headers:token?headers(token):{'x-ksm-session-key':b.session}})).status,403);
    }
  });
  await test('JWKS cached across repeated verifications in a tournament object', async () => {
    const before=mock.jwksRequests;
    for(let i=0;i<3;i++) assert.equal((await api.call('GET',`/api/tournaments/${a.id}/access`,{headers:headers(jwt.admin)})).status,200);
    assert.equal(mock.jwksRequests,before);
  });
  await test('directors list/add/remove only accepts admin; normalizes and deduplicates email', async () => {
    for (const method of ['GET','POST','DELETE']) for(const token of [jwt.director,jwt.outsider]) assert.equal((await api.call(method,`/api/tournaments/${a.id}/directors`,{headers:headers(token),...(method==='GET'?{}:{body:{email:'director@example.com'}})})).status,403);
    for(let i=0;i<2;i++) assert.equal((await api.call('POST',`/api/tournaments/${a.id}/directors`,{headers:headers(jwt.admin),body:{email:' Director@Example.com '}})).status,200);
    assert.deepEqual((await (await api.call('GET',`/api/tournaments/${a.id}/directors`,{headers:headers(jwt.admin)})).json()).directors,['director@example.com']);
    assert.equal((await api.call('POST',`/api/tournaments/${a.id}/directors`,{headers:headers(jwt.admin),body:{email:'invalid'}})).status,400);
  });
  await test('director may write A and rename it, cannot write B or delete A; client roles do not grant access',async()=>{
    assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:headers(jwt.director),body:{revision:1,payload:body.payload}})).status,200);
    assert.equal((await api.call('POST',`/api/tournaments/${a.id}/slug`,{headers:headers(jwt.director),body:{slug:'director-renamed'}})).status,200);
    assert.equal((await api.call('PUT',`/api/tournaments/${b.id}`,{headers:headers(jwt.director),body:{revision:1,payload:body.payload}})).status,403);
    assert.equal((await api.call('DELETE',`/api/tournaments/${a.id}`,{headers:headers(jwt.director)})).status,403);
    assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:{'x-ksm-role':'admin'},body})).status,403);
    assert.equal((await api.call('PUT',`/api/tournaments/${b.id}`,{headers:headers(jwt.admin),body:{revision:1,payload:body.payload}})).status,200);
  });
  await test('Auth0 disables password and session fallback even without directors',async()=>{
    assert.equal((await api.call('POST',`/api/tournaments/${b.id}/auth`,{body:{password:'fallback-pass'}})).status,403);
    assert.equal((await api.call('PUT',`/api/tournaments/${b.id}`,{headers:{'x-ksm-role':'staff','x-ksm-session-key':b.session},body:{revision:-1}})).status,403);
    assert.equal((await api.call('POST',`/api/tournaments/${a.id}/auth`,{body:{password:'fallback-pass'}})).status,403);
    assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:{'x-ksm-role':'staff','x-ksm-session-key':a.session},body:{revision:-1}})).status,403);
  });
  await test('JWT rejects bad issuer, audience, expiry, wrong key, unverified/missing email, alg and absent exp',async()=>{
    const {privateKey:wrong} = await generateKeyPair('RS256');
    const now=Math.floor(Date.now()/1000);
    for(const override of [{iss:'https://wrong/'},{aud:'wrong'},{exp:now-1},{[VERIFIED_CLAIM]:false},{[EMAIL_CLAIM]:''},{exp:undefined},{sub:''}]) {
      const token=await mock.token('admin@example.com',override);
      assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:headers(token),body})).status,401);
    }
    for(const token of [await mock.token('admin@example.com',{[VERIFIED_CLAIM]:false}),await mock.token('',{}),await mock.token('admin@example.com',{},wrong)]) assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:headers(token),body})).status,401);
    const hs256 = await new SignJWT({sub:'forged',exp:now+60}).setProtectedHeader({alg:'HS256'}).sign(new Uint8Array(32));
    assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:headers(hs256),body})).status,401);
    assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:headers('e30.e30.fake'),body})).status,401);
  });
  await test('staff live sockets verify identity; revoke directors on subsequent messages and reconnect',async()=>{
    const socket=await api.openSocket(a.id,{role:'staff',access_token:jwt.director});assert.equal(socket.status,101);
    assert.equal((await api.openSocket(b.id,{role:'staff',access_token:jwt.director})).status,403);
    const object=api.durableObject(a.id), verify=object.verifyIdentity;let verifications=0;
    object.verifyIdentity=async token=>{verifications++;return verify(token)};
    const adminSocket=await api.openSocket(a.id,{role:'staff',access_token:jwt.admin});
    assert.equal(verifications,1);object.verifyIdentity=verify;
    const closed=[];for(const ws of object.state.getWebSockets()){const close=ws.close.bind(ws);ws.close=(...args)=>{closed.push(ws.deserializeAttachment().identity?.email);return close(...args)}}
    await api.call('POST',`/api/tournaments/${a.id}/directors`,{headers:headers(jwt.admin),body:{email:'other@example.com'}});
    assert.deepEqual(closed,[]);
    const flash=JSON.stringify({type:'flash',court:'A',kind:'encho',id:'one'});
    await socket.send(flash);assert(socket.messages.some(m=>m.id==='one'));
    await api.call('DELETE',`/api/tournaments/${a.id}/directors`,{headers:headers(jwt.admin),body:{email:'director@example.com'}});
    assert.deepEqual(closed,['director@example.com']);
    await adminSocket.send(JSON.stringify({type:'flash',court:'A',kind:'encho',id:'admin-still-connected'}));
    assert(adminSocket.messages.some(m=>m.id==='admin-still-connected'));
    const before=socket.messages.length;await socket.send(JSON.stringify({type:'flash',court:'A',kind:'encho',id:'two'}));assert.equal(socket.messages.length,before);
    assert.equal((await api.openSocket(a.id,{role:'staff',access_token:jwt.director})).status,403);
    assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:headers(jwt.director),body})).status,403);
  });
  await test('public snapshots/status/live remain anonymous and never expose directors or identities',async()=>{
    const response=await api.call('GET',`/api/tournaments/${a.id}`);assert.equal(response.status,200);assert(!JSON.stringify(await response.json()).includes('director@example.com'));
    assert.equal((await api.call('GET',`/api/tournaments/${a.id}/status`)).status,200);
    assert.equal((await api.openSocket(a.id,{role:'spectator'})).status,101);
  });
  await test('admin deletes; password sessions stay disabled; partial config fails closed',async()=>{
    assert.equal((await api.call('DELETE',`/api/tournaments/${b.id}`,{headers:headers(jwt.admin)})).status,200);
    assert.equal((await api.call('PUT',`/api/tournaments/${a.id}`,{headers:{'x-ksm-role':'staff','x-ksm-session-key':a.session},body:{revision:-1}})).status,403);
    const partial=await createInProcessApi({auth0:{AUTH0_DOMAIN:mock.issuer}});
    assert.equal((await partial.call('GET','/api/auth/config')).status,503);
    assert.equal((await partial.call('POST','/api/tournaments',{body})).status,403);
  });
  await test('Auth0 PUT cannot recreate a missing private record',async()=>{
    const missing=await create();await api.storage(missing.id).delete('record');await api.storage(missing.id).delete('isPublic');
    assert.equal((await api.call('PUT',`/api/tournaments/${missing.id}`,{headers:headers(jwt.admin),body:{revision:0,payload:body.payload}})).status,404);
    assert.equal(await api.storage(missing.id).get('record'),undefined);
  });
  await test('unconfigured keeps existing create/password/session/delete behavior',async()=>{
    const legacy=await createInProcessApi();const response=await legacy.call('POST','/api/tournaments',{body:{...body,staffPassword:'fallback-pass'}});assert.equal(response.status,200);const id=(await response.json()).tournamentId;
    const session=response.headers.get('x-ksm-session-token');
    assert.equal((await legacy.call('PUT',`/api/tournaments/${id}`,{headers:{authorization:'Bearer ignored','x-ksm-role':'spectator','x-ksm-session-key':session},body:{revision:-1}})).status,403);
    assert.equal((await legacy.call('POST',`/api/tournaments/${id}/auth`,{body:{password:'fallback-pass'}})).status,200);
    assert.equal((await legacy.call('DELETE',`/api/tournaments/${id}`,{headers:{'x-ksm-session-key':session}})).status,200);
  });
  console.log(`${passed} Auth0 access checks passed`);
} finally { await mock.close(); }
