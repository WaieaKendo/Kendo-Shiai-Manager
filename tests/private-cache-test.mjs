// A signed-in API response must never be replayed by the PWA to a signed-out device.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners=new Map();
const cachedResponse=new Response('cached private payload');
let reads=0;
const context={self:{location:{origin:'https://ksm.test'},addEventListener:(name,fn)=>listeners.set(name,fn)},URL,
  caches:{match:async()=>{reads++;return cachedResponse;}},fetch:async()=>new Response('network')};
vm.runInNewContext(fs.readFileSync(new URL('../app/service-worker.js',import.meta.url),'utf8'),context);
for(const path of ['/api/auth/config','/api/auth/me','/api/tournaments','/api/tournaments/abc','/api/tournaments/abc/status']){
  let intercepted=false;
  listeners.get('fetch')({request:{method:'GET',url:`https://ksm.test${path}`,mode:'cors'},respondWith:()=>{intercepted=true;}});
  assert.equal(intercepted,false,path);
}
assert.equal(reads,0);
let response;
listeners.get('fetch')({request:{method:'GET',url:'https://ksm.test/assets/app.js',mode:'cors'},respondWith:value=>{response=value;}});
assert.equal(await response,cachedResponse);assert.equal(reads,1);
console.log('PASS API reads bypass even pre-existing PWA cache entries; app assets retain offline caching');

// Exercise the actual application cache and offline fetch overrides, separately from the PWA.
const source=fs.readFileSync(new URL('../app/js/54-auth0-access.js',import.meta.url),'utf8');
const entries=new Map();
const app={ksmAccount:{enabled:true},navigator:{onLine:false},Response,JSON,
  localStorage:{getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)},
  ksmAccountCacheTournament:record=>entries.set('ksm.tournament.record:'+record.tournamentId,JSON.stringify(record))};
vm.createContext(app);
vm.runInContext(source.split('\n').find(line=>line.startsWith('ksmCacheTournament=function')),app);
vm.runInContext(source.slice(source.indexOf('async function ksmPrivateFetch('),source.indexOf('var ksmAccountCacheTournament=')),app);
app.ksmCacheTournament({tournamentId:'public',isPublic:true,payload:{name:'Public Cup'}});
assert.equal((await (await app.ksmPrivateFetch('public')).json()).payload.name,'Public Cup');
app.ksmCacheTournament({tournamentId:'private',isPublic:false,payload:{name:'Private Cup'}});
assert.equal(entries.has('ksm.tournament.record:private'),false);
await assert.rejects(app.ksmPrivateFetch('private'),/No public offline copy/);
app.ksmCacheTournament({tournamentId:'public',isPublic:false});
assert.equal(entries.has('ksm.tournament.record:public'),false);
console.log('PASS public snapshots load offline; private snapshots are never cached and publication revocation drops the copy');
