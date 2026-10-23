import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createInProcessApi } from './lib/worker-runtime.mjs';
import { mockAuth0 } from './lib/mock-auth0.mjs';
const mock = await mockAuth0();
const api = await createInProcessApi({auth0:{AUTH0_DOMAIN:mock.issuer,AUTH0_AUDIENCE:mock.audience,AUTH0_CLIENT_ID:mock.clientId,ADMIN_EMAILS:'admin@example.com'}});
const tokens = {};
for (const name of ['admin','creator','other','director','second','guest']) tokens[name] = await mock.token(`${name}@example.com`);
const headers = name => ({authorization:`Bearer ${tokens[name]}`,'x-ksm-role':'staff'});
const payload = {setup:{tName:'Access Cup'},state:{}};
const central = api.durableObject('__ksm_access__');
async function internal(op, body={}) { return (await central.fetch(new Request(`https://durable-object/internal/access/${op}`,{method:'POST',body:JSON.stringify(body)}))).json(); }
async function create(name='creator', extra={}) {
  const response = await api.call('POST','/api/tournaments',{headers:headers(name),body:{payload,revision:0,...extra}});
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  return (await response.json()).tournamentId;
}
const endpoint = (id, action='') => `/api/tournaments/${id}${action ? '/'+action : ''}`;
async function change(id, method, actor, body, alias='access') { return api.call(method,endpoint(id,alias),{headers:headers(actor),body}); }
let passed=0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
try {
  for (const email of ['creator@example.com','other@example.com']) await internal('grant',{email,scope:'global',role:'creator'});
  let a,b;
  await test('creator bootstrap and file-as-new share owner grant; admin creation also has an owner',async()=>{
    a = await create(); b = await create('other');
    const imported = await create('creator',{payload:{...payload,setup:{tName:'Loaded file'}}});
    const adminCreated = await create('admin');
    for (const [id,email] of [[a,'creator@example.com'],[b,'other@example.com'],[imported,'creator@example.com'],[adminCreated,'admin@example.com']]) {
      const list = await internal('listTournament',{id});
      assert.equal(list.grants.length,1); assert.equal(list.grants[0].role,'owner'); assert.equal(list.grants[0].email,email);
    }
  });
  await test('creator cannot read, write, change visibility, or open private live sockets for another creator',async()=>{
    for (const action of ['','status','visibility']) assert.equal((await api.call('GET',endpoint(b,action),{headers:headers('creator')})).status,403);
    assert.equal((await api.call('PUT',endpoint(b),{headers:headers('creator'),body:{payload,revision:1}})).status,403);
    for (const role of ['staff','spectator']) assert.equal((await api.openSocket(b,{role,access_token:tokens.creator})).status,403);
    assert.equal((await api.call('POST','/api/tournaments',{headers:headers('guest'),body:{payload}})).status,403);
  });
  await test('owner grants directors; directors edit and change visibility but cannot manage grants',async()=>{
    assert.equal((await change(a,'POST','creator',{email:'director@example.com',role:'director'})).status,200);
    assert.equal((await api.call('PUT',endpoint(a),{headers:headers('director'),body:{payload,revision:1}})).status,200);
    assert.equal((await api.call('PUT',endpoint(a,'visibility'),{headers:headers('director'),body:{isPublic:true}})).status,200);
    assert.equal((await api.call('PUT',endpoint(a,'visibility'),{headers:headers('director'),body:{isPublic:false}})).status,200);
    for (const method of ['POST','DELETE']) assert.equal((await change(a,method,'director',{email:'guest@example.com',role:'owner'})).status,403);
    for (const method of ['GET','POST','DELETE']) assert.equal((await api.call(method,endpoint(a,'directors'),{headers:headers('director'),...(method === 'GET' ? {} : {body:{email:'guest@example.com'}})})).status,403);
    const list = await (await api.call('GET',endpoint(a,'access'),{headers:headers('creator')})).json();
    assert.equal(list.role,'owner'); assert(list.grants.some(g=>g.email==='director@example.com'));
    assert.equal((await change(a,'POST','creator',{email:'guest@example.com',role:'admin'})).status,400);
  });
  await test('owner cannot delete; admin deletes and removes grants and pending invites',async()=>{
    const id = await create();
    await change(id,'POST','creator',{email:'pending@example.com',role:'director'});
    assert.equal((await api.call('DELETE',endpoint(id),{headers:headers('creator')})).status,403);
    assert.equal((await api.call('DELETE',endpoint(id),{headers:headers('admin')})).status,200);
    assert.deepEqual(await internal('listTournament',{id}),{grants:[],invites:[]});
    assert.equal((await api.call('GET',endpoint(id),{headers:headers('admin')})).status,410);
    assert(!(await (await api.call('GET','/api/tournaments',{headers:headers('admin')})).json()).some(row=>row.id===id));
  });
  await test('failed owner grant (including lost response after commit) leaves no tournament, library card or grants',async()=>{
    const original = central.fetch.bind(central);
    for (const commitFirst of [false,true]) {
      let failedId;
      const slug = `failed-owner-${commitFirst}`;
      central.fetch = async request => {
        if (new URL(request.url).pathname === '/internal/access/grant') {
          const body = await request.clone().json();
          if (body.role === 'owner') { failedId=body.scope; if (commitFirst) await original(request); return new Response('injected',{status:503}); }
        }
        return original(request);
      };
      const response = await api.call('POST','/api/tournaments',{headers:headers('creator'),body:{payload,revision:0,slug}});
      central.fetch = original;
      assert.equal(response.status,500); assert(failedId);
      assert.equal(await api.storage(failedId).get('record'),undefined);
      assert.equal((await api.call('GET',endpoint(failedId),{headers:headers('admin')})).status,410);
      assert.deepEqual(await internal('listTournament',{id:failedId}),{grants:[],invites:[]});
      assert.equal((await api.call('GET',`/api/slugs/${slug}`)).status,404);
      await create('creator',{slug});
      assert(!(await (await api.call('GET','/api/tournaments',{headers:headers('admin')})).json()).some(row=>row.id===failedId));
    }
  });
  await test('legacy director migration makes grants and invites once and preserves old key for rollback',async()=>{
    const id = randomUUID(), legacy = api.storage(id);
    await api.call('GET','/api/auth/me',{headers:headers('director')});
    await legacy.put('record',{tournamentId:id,revision:1,payload}); await legacy.put('isPublic',false);
    const old = ['director@example.com','not-signed-in@example.com']; await legacy.put('directors',old);
    assert.equal((await api.call('GET',endpoint(id),{headers:headers('director')})).status,200);
    const list = await internal('listTournament',{id});
    assert.equal(list.grants[0].role,'director'); assert.equal(list.invites[0].email,'not-signed-in@example.com');
    assert.deepEqual(await legacy.get('directors'),old);
    assert.equal((await change(id,'DELETE','admin',{email:'director@example.com',role:'director'})).status,200);
    // Simulate losing the local optimization; central meta remains authoritative.
    await legacy.delete('accessMigrationVersion');
    assert.equal((await api.call('GET',endpoint(id),{headers:headers('director')})).status,403);
    assert.equal((await internal('listTournament',{id})).grants.length,0);
    assert.equal(central.accessStore.rows('SELECT value FROM meta WHERE key=?',`directors:${id}`)[0].value,'done');
  });
  await test('revocation closes only the targeted KSM user sockets across linked identities and changed email',async()=>{
    const secondToken = await mock.token('director@example.com',{sub:'google-oauth2|director'});
    const sockets = [];
    for (const token of [tokens.director,secondToken]) { const ws=await api.openSocket(a,{role:'staff',access_token:token}); assert.equal(ws.status,101); sockets.push(ws); }
    const owner = await api.openSocket(a,{role:'staff',access_token:tokens.creator}); assert.equal(owner.status,101);
    const admin = await api.openSocket(a,{role:'staff',access_token:tokens.admin}); assert.equal(admin.status,101);
    const renamed = await mock.token('renamed-director@example.com',{sub:'mock|director@example.com'});
    await api.call('GET','/api/auth/me',{headers:{authorization:`Bearer ${renamed}`}});
    const target = (await internal('lookup',{sub:'mock|director@example.com'})).userId;
    const object = api.durableObject(a), closed=[];
    for (const ws of object.state.getWebSockets()) { const close=ws.close.bind(ws); ws.close=(...args)=>{closed.push(ws.deserializeAttachment().identity?.sub);return close(...args)}; }
    assert.equal((await change(a,'DELETE','creator',{userId:target,role:'director'})).status,200);
    assert.deepEqual(closed.sort(),['google-oauth2|director','mock|director@example.com'].sort());
    const flash = id => JSON.stringify({type:'flash',court:'A',kind:'encho',id});
    for (const ws of sockets) { const before=ws.messages.length; await ws.send(flash('revoked')); assert.equal(ws.messages.length,before); }
    await owner.send(flash('owner-still-connected')); assert(owner.messages.some(m=>m.id==='owner-still-connected'));
    await admin.send(flash('admin-still-connected')); assert(admin.messages.some(m=>m.id==='admin-still-connected'));
    assert.equal((await api.openSocket(a,{role:'staff',access_token:secondToken})).status,403);
  });
  await test('store revocation is rechecked for HTTP writes, socket messages and private broadcasts',async()=>{
    await change(a,'POST','creator',{email:'second@example.com',role:'director'});
    const ws=await api.openSocket(a,{role:'staff',access_token:tokens.second}); assert.equal(ws.status,101);
    await internal('revoke',{email:'second@example.com',scope:a,role:'director'});
    const object=api.durableObject(a);
    await object.broadcast({type:'probe',private:'secret'});
    assert(!ws.messages.some(m=>m.type==='probe'));
    await ws.send(JSON.stringify({type:'clock',court:'A',source:'second',state:'running'}));
    assert(!ws.messages.some(m=>m.type==='clock'));
    assert.equal((await api.call('PUT',endpoint(a),{headers:headers('second'),body:{payload,revision:2}})).status,403);
  });
  await test('owner cannot remove last owner, pending invite is insufficient, admin can override',async()=>{
    const id = await create();
    assert.equal((await change(id,'DELETE','creator',{email:'creator@example.com',role:'owner'})).status,409);
    await change(id,'POST','creator',{email:'pending-owner@example.com',role:'owner'});
    assert.equal((await change(id,'DELETE','creator',{email:'creator@example.com',role:'owner'})).status,409);
    await change(id,'POST','creator',{email:'second@example.com',role:'owner'});
    assert.equal((await change(id,'DELETE','creator',{email:'creator@example.com',role:'owner'})).status,200);
    assert.equal((await change(id,'DELETE','second',{email:'second@example.com',role:'owner'})).status,409);
    assert.equal((await change(id,'DELETE','admin',{email:'second@example.com',role:'owner'})).status,200);
  });
  await test('concurrent owners cannot both remove the last owners',async()=>{
    const id=await create(); await change(id,'POST','creator',{email:'second@example.com',role:'owner'});
    const results=await Promise.all([change(id,'DELETE','creator',{email:'creator@example.com',role:'owner'}),change(id,'DELETE','second',{email:'second@example.com',role:'owner'})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await internal('listTournament',{id})).grants.filter(g=>g.role==='owner').length,1);
  });
  await test('deleted access cannot be restored by delayed grants or migration',async()=>{
    const id=await create(); await api.call('DELETE',endpoint(id),{headers:headers('admin')});
    await assert.rejects(()=>internal('grant',{email:'guest@example.com',scope:id,role:'owner'}),/deleted/);
    await internal('migrateTournament',{id,directors:['director@example.com']});
    assert.deepEqual(await internal('listTournament',{id}),{grants:[],invites:[]});
    const result=await internal('changeTournament',{actor:{sub:'mock|admin@example.com',email:'admin@example.com'},id,action:'grant',email:'guest@example.com',role:'owner'});
    assert.equal(result.status,410);
  });
  await test('a delayed migration index cannot restore public listing after a visibility change',async()=>{
    const id=await create();
    await api.call('PUT',endpoint(id,'visibility'),{headers:headers('creator'),body:{isPublic:true}});
    await api.call('PUT',endpoint(id,'visibility'),{headers:headers('creator'),body:{isPublic:false}});
    const obj=api.durableObject(id), record=await api.storage(id).get('record');
    await obj.indexAccess(record,true,0);
    const rows=await (await api.call('GET','/api/tournaments')).json(); assert(!rows.some(row=>row.id===id));
    assert.equal(await api.storage(id).get('isPublic'),false);
  });
  await test('library uses one central resolve and no per-tournament calls after indexing, with private isolation',async()=>{
    const publicId=await create('other');
    await api.call('PUT',endpoint(publicId,'visibility'),{headers:headers('other'),body:{isPublic:true}});
    const original=central.fetch.bind(central); let resolves=0;
    central.fetch=async req=>{if(new URL(req.url).pathname.endsWith('/resolve')) resolves++;return original(req)};
    // Reject all tournament fetches: a library request must use only its registry
    // and central access object, even when many tournaments are present.
    const rows=Object.values(await api.storage('__ksm_library__').get('library'));
    const saved=[];
    for(const row of rows) {const obj=api.durableObject(row.id); saved.push([obj,obj.fetch]);obj.fetch=()=>{throw new Error('Unexpected tournament lookup')};}
    try {
      const response=await api.call('GET','/api/tournaments',{headers:headers('creator')}); assert.equal(response.status,200);
      const list=await response.json(); assert(list.some(row=>row.id===a&&row.canManage)); assert(!list.some(row=>row.id===b)); assert(list.some(row=>row.id===publicId&&!row.canManage)); assert.equal(resolves,1);
      const guests=await (await api.call('GET','/api/tournaments')).json(); assert(guests.every(row=>row.isPublic)); assert(guests.some(row=>row.id===publicId));
    } finally { for(const [obj,fn] of saved)obj.fetch=fn;central.fetch=original; }
  });
  console.log(`${passed} user access checks passed`);
} finally { await mock.close(); }
