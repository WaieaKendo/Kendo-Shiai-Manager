import assert from 'node:assert/strict';
import { createInProcessApi } from './lib/worker-runtime.mjs';
import { mockAuth0 } from './lib/mock-auth0.mjs';
const mock=await mockAuth0();
const api=await createInProcessApi({auth0:{AUTH0_DOMAIN:mock.issuer,AUTH0_AUDIENCE:mock.audience,AUTH0_CLIENT_ID:mock.clientId,ADMIN_EMAILS:'admin@example.com,server@example.com'}});
const tokens={};for(const name of ['admin','stored','other','creator','director'])tokens[name]=await mock.token(`${name}@example.com`);
const headers=name=>({authorization:`Bearer ${tokens[name]}`});
const call=(method,path,name,body)=>api.call(method,path,{headers:headers(name),...(body?{body}:{})});
const people=async()=> (await call('GET','/api/people','admin')).json();
let passed=0;async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
try{
  await test('people routes are absent when Auth0 disabled and forbidden for nonadmins',async()=>{
    const legacy=await createInProcessApi();
    for(const [method,path]of [['GET','/api/people'],['POST','/api/people/roles'],['DELETE','/api/people/roles'],['DELETE','/api/people/someone']]){
      assert.equal((await legacy.call(method,path)).status,404);assert.equal((await call(method,path,'creator')).status,403);
    }
  });
  await test('admin invites global roles and lists server admins without creating their accounts',async()=>{
    assert.equal((await call('POST','/api/people/roles','admin',{email:'stored@example.com',role:'admin'})).status,200);
    assert.equal((await call('POST','/api/people/roles','admin',{email:'creator@example.com',role:'creator'})).status,200);
    await call('POST','/api/people/roles','admin',{email:'future@example.com',role:'creator'});
    const data=await people();assert(data.invites.some(i=>i.email==='future@example.com'&&i.role==='creator'));
    assert(data.users.some(u=>u.email==='server@example.com'&&u.fromServer&&u.userId===null));
    await call('GET','/api/auth/me','stored');await call('GET','/api/auth/me','creator');
    const user=(await people()).users.find(u=>u.email==='stored@example.com');assert(user.roles.includes('admin'));assert.deepEqual(user.providers,['mock']);
  });
  await test('server settings and last stored self-admin are protected with 409',async()=>{
    const admin=(await people()).users.find(u=>u.email==='admin@example.com');
    assert.equal((await call('DELETE','/api/people/roles','admin',{email:'server@example.com',role:'admin'})).status,409);
    assert.equal((await call('DELETE',`/api/people/${admin.userId}`,'stored')).status,409);
    const stored=(await people()).users.find(u=>u.email==='stored@example.com');
    assert.equal((await call('DELETE','/api/people/roles','stored',{userId:stored.userId,role:'admin'})).status,409);
    assert.equal((await call('DELETE',`/api/people/${stored.userId}`,'stored')).status,409);
    // Server admins remain protected even when they also have a stored grant.
    await call('POST','/api/people/roles','admin',{userId:admin.userId,role:'admin'});
    assert.equal((await call('DELETE','/api/people/roles','admin',{userId:admin.userId,role:'admin'})).status,409);
    await call('POST','/api/people/roles','admin',{email:'other@example.com',role:'admin'});await call('GET','/api/auth/me','other');
    assert.equal((await call('DELETE','/api/people/roles','stored',{userId:stored.userId,role:'admin'})).status,200);
    assert.equal((await call('GET','/api/people','stored')).status,403);
  });
  await test('remove everything retains history, lists tournament names and closes only target sockets',async()=>{
    const response=await call('POST','/api/tournaments','creator',{payload:{setup:{tName:'People Cup'},state:{}}});assert.equal(response.status,200);const id=(await response.json()).tournamentId;
    await call('POST',`/api/tournaments/${id}/access`,'creator',{email:'director@example.com',role:'director'});
    const sockets=[];for(const name of ['creator','director','admin']){const ws=await api.openSocket(id,{role:'staff',access_token:tokens[name]});assert.equal(ws.status,101);sockets.push(ws)}
    const director=(await people()).users.find(u=>u.email==='director@example.com');assert.equal(director.tournamentAccess[0].name,'People Cup');
    const closed=[];for(const ws of api.durableObject(id).state.getWebSockets()){const close=ws.close.bind(ws);ws.close=(...args)=>{closed.push(ws.deserializeAttachment().identity.sub);return close(...args)}}
    assert.equal((await call('DELETE',`/api/people/${director.userId}`,'admin')).status,200);assert.deepEqual(closed,['mock|director@example.com']);
    const after=(await people()).users.find(u=>u.userId===director.userId);assert.deepEqual(after.tournamentAccess,[]);assert.deepEqual(after.roles,[]);assert.deepEqual(after.providers,['mock']);
    assert.equal((await api.openSocket(id,{role:'staff',access_token:tokens.director})).status,403);
    await sockets[0].send(JSON.stringify({type:'flash',court:'A',kind:'encho',id:'still-owner'}));assert(sockets[0].messages.some(m=>m.id==='still-owner'));
  });
  await test('role validation, pending revoke and missing-role no-op are explicit',async()=>{
    assert.equal((await call('POST','/api/people/roles','admin',{email:'bad',role:'admin'})).status,400);
    assert.equal((await call('POST','/api/people/roles','admin',{email:'x@example.com',role:'owner'})).status,400);
    await call('POST','/api/people/roles','admin',{email:'pending@example.com',role:'creator'});
    assert.equal((await (await call('DELETE','/api/people/roles','admin',{email:'pending@example.com',role:'creator'})).json()).removed,true);
    assert.equal((await (await call('DELETE','/api/people/roles','admin',{email:'pending@example.com',role:'creator'})).json()).removed,false);
  });
  console.log(`${passed} people API checks passed`);
}finally{await mock.close()}
