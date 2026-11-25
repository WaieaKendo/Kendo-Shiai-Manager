import assert from 'node:assert/strict';
import { createInProcessApi } from './lib/worker-runtime.mjs';
import { mockAuth0 } from './lib/mock-auth0.mjs';
const mock=await mockAuth0();
const api=await createInProcessApi({auth0:{AUTH0_DOMAIN:mock.issuer,AUTH0_AUDIENCE:mock.audience,AUTH0_CLIENT_ID:mock.clientId,ADMIN_EMAILS:'admin@example.com'}});
const token=await mock.token('admin@example.com'), headers={authorization:`Bearer ${token}`};
const central=api.durableObject('__ksm_access__');
const payload={setup:{tName:'Review cup'},state:{}};
let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
async function create(){const response=await api.call('POST','/api/tournaments',{headers,body:{payload}});assert.equal(response.status,200);return (await response.json()).tournamentId}
try {
  const privateId=await create(), publicId=await create();
  await api.call('PUT',`/api/tournaments/${publicId}/visibility`,{headers,body:{isPublic:true}});
  await test('invalid and expired library tokens retain only public rows and identify invalid authentication',async()=>{
    for(const token of ['bad',await mock.token('admin@example.com',{exp:Math.floor(Date.now()/1000)-1})]){
      const response=await api.call('GET','/api/tournaments',{headers:{authorization:`Bearer ${token}`}});
      assert.equal(response.status,200);assert.equal(response.headers.get('x-ksm-auth'),'invalid');
      const rows=await response.json();assert(rows.some(row=>row.id===publicId));assert(!rows.some(row=>row.id===privateId));assert(rows.every(row=>!row.canManage));
    }
  });
  await test('cleanup continues after access cleanup failure and preserves original owner grant error',async()=>{
    const original=central.fetch.bind(central);let id;
    central.fetch=async req=>{const op=new URL(req.url).pathname.split('/').pop();if(op==='grant'){id=(await req.clone().json()).scope;throw new Error('Original owner grant failed')}if(op==='removeTournament')throw new Error('Secondary cleanup failed');return original(req)};
    try {
      const response=await api.call('POST','/api/tournaments',{headers,body:{payload,slug:'cleanup-review'}});
      assert.equal(response.status,500);assert.equal((await response.json()).message,'Original owner grant failed');
      assert.equal((await api.call('GET','/api/slugs/cleanup-review')).status,404);
      assert(!(Object.values(await api.storage('__ksm_library__').get('library'))).some(row=>row.id===id));
    } finally {central.fetch=original}
  });
  await test('resolve throttles last sign-in writes to an hour and still updates changed profiles and invites',async()=>{
    const store=central.accessStore;
    const identity={sub:'auth0|throttle',email:'throttle@example.com',emailVerified:true};
    const first=store.resolve(identity);
    const recent=new Date(Date.now()-1000).toISOString();store.sql.exec('UPDATE users SET last_sign_in_at=? WHERE id=?',recent,first.userId);
    store.resolve(identity);store.resolve(identity);
    assert.equal(store.listPeople().users.find(user=>user.id===first.userId).last_sign_in_at,recent);
    store.resolve({...identity,displayName:'Changed'});
    assert.equal(store.listPeople().users.find(user=>user.id===first.userId).display_name,'Changed');
    const stale=new Date(Date.now()-3600001).toISOString();store.sql.exec('UPDATE users SET last_sign_in_at=? WHERE id=?',stale,first.userId);
    store.resolve(identity);assert.notEqual(store.listPeople().users.find(user=>user.id===first.userId).last_sign_in_at,stale);
  });
  await test('private broadcast makes one access call for three sockets and one SQL query',async()=>{
    for(let i=0;i<3;i++)assert.equal((await api.openSocket(privateId,{role:'staff',access_token:token})).status,101);
    const original=central.fetch.bind(central);let calls=0,queries=0;
    const store=central.accessStore, rows=store.rows.bind(store);
    store.rows=(...args)=>{queries++;return rows(...args)};
    central.fetch=async req=>{calls++;return original(req)};
    try {await api.durableObject(privateId).broadcast({type:'review'});assert.equal(calls,1);assert.equal(queries,1)}finally{central.fetch=original;store.rows=rows}
  });
  await test('granting director to owner is a conflict and revoking absent role reports not changed',async()=>{
    const response=await api.call('POST',`/api/tournaments/${privateId}/access`,{headers,body:{email:'admin@example.com',role:'director'}});
    assert.equal(response.status,409);assert.equal((await response.json()).error,'Already an owner');
    const result=central.accessStore.changeTournament({actor:{sub:'mock|admin@example.com',email:'admin@example.com'},id:privateId,action:'revoke',email:'absent@example.com',role:'director'});
    assert.equal(result.ok,true);assert.equal(result.removed,false);
  });
  console.log(`${passed} step 2 review checks passed`);
}finally{await mock.close()}
