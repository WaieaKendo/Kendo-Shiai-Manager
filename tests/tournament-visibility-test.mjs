import assert from 'node:assert/strict';
import { createInProcessApi } from './lib/worker-runtime.mjs';
import { mockAuth0 } from './lib/mock-auth0.mjs';
const mock = await mockAuth0();
try {
  const api=await createInProcessApi({auth0:{AUTH0_DOMAIN:mock.issuer,AUTH0_AUDIENCE:mock.audience,AUTH0_CLIENT_ID:mock.clientId,ADMIN_EMAILS:'admin@example.com'}});
  const admin=await mock.token('admin@example.com'), director=await mock.token('director@example.com'), outsider=await mock.token('outsider@example.com');
  const headers=token=>({authorization:`Bearer ${token}`,'x-ksm-role':'staff'});
  const response=await api.call('POST','/api/tournaments',{headers:headers(admin),body:{staffPassword:'secret',payload:{setup:{tName:'Private Cup'},state:{}}}});
  assert.equal(response.status,200); const id=(await response.json()).tournamentId;
  const session=response.headers.get('x-ksm-session-token');
  const base=`/api/tournaments/${id}`;
  assert.equal((await (await api.call('GET',base+'/visibility',{headers:headers(admin)})).json()).isPublic,false);
  for(const token of ['',outsider]){
    const h=token?headers(token):{};
    for(const path of [base,base+'/status']) {const r=await api.call('GET',path,{headers:h});assert.equal(r.status,403);assert.equal((await r.json()).code,'tournament-private');}
    assert.deepEqual(await (await api.call('GET','/api/tournaments',{headers:h})).json(),[]);
    assert.deepEqual(await (await api.call('POST','/api/tournaments/discover',{headers:h,body:{ids:[id]}})).json(),[]);
    assert.equal((await api.openSocket(id,{role:'spectator',...(token?{access_token:token}:{})})).status,403);
    assert.equal((await api.call('PUT',base+'/visibility',{headers:h,body:{isPublic:true}})).status,403);
  }
  assert.equal((await api.call('GET','/api/tournaments/00000000-0000-4000-8000-000000000000')).status,404);
  assert.equal((await api.call('PUT',base,{headers:headers(admin),body:{revision:1,isPublic:true,payload:{setup:{tName:'Private Cup'},state:{},isPublic:true}}})).status,200);
  assert.equal((await api.call('GET',base)).status,403); // Snapshot/file data cannot publish.
  assert.equal((await api.call('PUT',base,{headers:{'x-ksm-role':'staff','x-ksm-session-key':session},body:{revision:-1}})).status,403);
  assert.equal((await api.call('POST',base+'/auth',{body:{password:'secret'}})).status,403);
  await api.call('POST',base+'/directors',{headers:headers(admin),body:{email:'director@example.com'}});
  assert.equal((await api.call('GET',base,{headers:headers(director)})).status,200);
  const list=await (await api.call('GET','/api/tournaments',{headers:headers(director)})).json();assert.equal(list[0].id,id);assert.equal(list[0].canManage,true);
  const privateSocket=await api.openSocket(id,{role:'spectator',access_token:director});assert.equal(privateSocket.status,101);
  assert.equal((await api.call('PUT',base+'/visibility',{headers:headers(director),body:{isPublic:true}})).status,200);
  assert.equal((await api.call('GET',base)).status,200);
  assert.equal((await api.call('GET','/api/tournaments').then(r=>r.json()))[0].id,id);
  const spectator=await api.openSocket(id,{role:'spectator'});assert.equal(spectator.status,101);
  await api.call('PUT',base+'/visibility',{headers:headers(director),body:{isPublic:false}});
  assert.equal((await api.call('GET',base)).status,403);
  // Missing visibility on existing records remains public; Auth0 disabled ignores the flag.
  await api.storage(id).delete('isPublic');assert.equal((await api.call('GET',base)).status,200);
  await api.storage(id).put('isPublic',false);
  const legacy=await createInProcessApi();const old=await legacy.call('POST','/api/tournaments',{body:{staffPassword:'secret',payload:{setup:{tName:'Legacy'},state:{}}}});
  const oldId=(await old.json()).tournamentId;await legacy.storage(oldId).put('isPublic',false);
  assert.equal((await legacy.call('GET',`/api/tournaments/${oldId}`)).status,200);
  console.log('PASS visibility defaults, authenticated reads, lists/discovery, private live access, publishing, and legacy compatibility');
} finally { await mock.close(); }
