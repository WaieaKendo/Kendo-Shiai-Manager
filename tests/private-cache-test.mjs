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
