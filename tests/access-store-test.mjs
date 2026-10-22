import assert from 'node:assert/strict';
import { AccessStore } from '../access-store.mjs';
import { MemoryStorage, createInProcessApi } from './lib/worker-runtime.mjs';
import { mockAuth0 } from './lib/mock-auth0.mjs';
import { VERIFIED_CLAIM } from '../auth0-worker.mjs';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const storage = new MemoryStorage(), store = new AccessStore(storage);
const permissions = identity => { const {userId,...roles} = store.resolve(identity); return roles; };
const identity = {sub:'auth0|one', email:' Person@Example.com ', emailVerified:true};
test('resolve creates normalized user and updates last sign-in', () => {
  assert.deepEqual(permissions(identity), {roles:[], tournamentRoles:{}});
  const [user] = store.listPeople().users;
  assert.notEqual(user.id, identity.sub); assert.match(user.id,/^[0-9a-f-]{36}$/); assert.equal(user.email, 'person@example.com');
  assert(user.created_at); assert(user.last_sign_in_at);
});
test('password then Google with same verified email links one KSM user', () => {
  store.grant({email:'person@example.com',scope:'global',role:'creator'});
  const first = store.resolve(identity);
  const second = store.resolve({...identity,sub:'google-oauth2|one'});
  assert.equal(first.userId,second.userId);
  assert.deepEqual(second.roles,['creator']);
  assert.equal(store.listPeople().users.length,1);
  assert.equal(store.listPeople().identities.length,2);
  store.revoke({userId:first.userId,scope:'global',role:'creator'});
});
test('pending invites become grants atomically on verified sign-in', () => {
  for (const [scope,role] of [['global','creator'],['cup','director'],['cup','owner']]) store.grant({email:'invited@example.com',scope,role,grantedBy:'admin'});
  assert.equal(store.listPeople().invites.length, 3);
  assert.deepEqual(permissions({sub:'auth0|invited',email:'invited@example.com',emailVerified:true}), {roles:['creator'],tournamentRoles:{cup:'owner'}});
  assert.equal(store.listPeople().invites.length, 0);
  assert.equal(store.listTournament({id:'cup'}).grants[0].granted_by,'admin');
});
test('email changes preserve grants by sub and free the old email without transferring access', () => {
  assert.deepEqual(permissions({sub:'auth0|invited',email:'new@example.com',emailVerified:true}), {roles:['creator'],tournamentRoles:{cup:'owner'}});
  assert.deepEqual(permissions({sub:'auth0|different',email:'invited@example.com',emailVerified:true}), {roles:[],tournamentRoles:{}});
});
test('unverified identities neither create users nor consume invites', () => {
  store.grant({email:'unverified@example.com',scope:'global',role:'admin'});
  for (const emailVerified of [false,undefined]) assert.deepEqual(permissions({sub:'unverified',email:'unverified@example.com',emailVerified}), {roles:[],tournamentRoles:{}});
  assert(!store.listPeople().identities.some(u=>u.sub==='unverified'));
  assert.equal(store.listPeople().invites.length,1);
  permissions({sub:'google-oauth2|unverified',email:'person@example.com',emailVerified:false});
  assert(!store.listPeople().identities.some(i=>i.sub==='google-oauth2|unverified'));
});
test('known identities keep their user when email changes to another established user email', () => {
  store.grant({email:'new@example.com',scope:'other',role:'director'});
  store.grant({email:'collision@example.com',scope:'global',role:'creator'});
  permissions({sub:'collision',email:'collision@example.com',emailVerified:true});
  store.sql.exec('INSERT INTO invites VALUES(?,?,?,?,?)', 'new@example.com', 'global', 'creator', 'admin', new Date().toISOString());
  assert.deepEqual(permissions({sub:'collision',email:'new@example.com',emailVerified:true}).roles,['creator']);
  assert(store.listPeople().invites.some(i=>i.email==='new@example.com'));
  store.revoke({email:'new@example.com',scope:'global',role:'creator'});
  assert.equal(store.listPeople().users.find(u=>u.id===store.lookup({sub:'collision'}).userId).email,'collision@example.com');
  assert.equal(store.listTournament({id:'other'}).grants[0].user_id,store.lookup({sub:'auth0|invited'}).userId);
});
test('grant after sign-in uses permanent user id; revoke removes selected role only', () => {
  store.grant({email:'new@example.com',scope:'global',role:'admin'});
  store.revoke({userId:store.lookup({sub:'auth0|invited'}).userId,scope:'global',role:'creator'});
  assert.deepEqual(permissions({sub:'auth0|invited',email:'new@example.com',emailVerified:true}).roles,['admin']);
  store.grant({email:'new@example.com',scope:'cup',role:'director'});
  assert.equal(store.listTournament({id:'cup'}).grants[0].role,'owner');
  store.revoke({email:'new@example.com',scope:'cup',role:'director'});
  assert.equal(store.listTournament({id:'cup'}).grants.length,1);
  store.revoke({email:'new@example.com',scope:'cup',role:'owner'});
  assert.equal(store.listTournament({id:'cup'}).grants.length,0);
});
test('schema initialization is idempotent and tournament removal clears grants and invites', () => {
  store.grant({email:'new@example.com',scope:'other',role:'owner'});
  store.grant({email:'pending@example.com',scope:'other',role:'director'});
  const reopened = new AccessStore(storage);
  assert.equal(reopened.listTournament({id:'other'}).grants.length,1);
  reopened.removeTournament({id:'other'});
  assert.deepEqual(store.listTournament({id:'other'}),{grants:[],invites:[]});
  assert(store.listPeople().globalRoles.length);
  store.revoke({email:'unverified@example.com',scope:'global',role:'admin'});
  assert.equal(store.listPeople().invites.length,0);
});
test('step 1 sub-keyed users and all grants migrate once to KSM IDs', () => {
  const legacy = new MemoryStorage();
  legacy.sql.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL,display_name TEXT,created_at TEXT,last_sign_in_at TEXT);
    CREATE UNIQUE INDEX users_email ON users(lower(email));
    CREATE TABLE global_roles(user_id TEXT,role TEXT,granted_by TEXT,granted_at TEXT,PRIMARY KEY(user_id,role));
    CREATE TABLE tournament_access(user_id TEXT,tournament_id TEXT,role TEXT,granted_by TEXT,granted_at TEXT,PRIMARY KEY(user_id,tournament_id));
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
    INSERT INTO meta VALUES('schema_version','1');
    INSERT INTO users VALUES('auth0|legacy','legacy@example.com',NULL,'then','now');
    INSERT INTO global_roles VALUES('auth0|legacy','creator','auth0|legacy','then');
    INSERT INTO tournament_access VALUES('auth0|legacy','legacy-cup','owner','auth0|legacy','then');`);
  const migrated = new AccessStore(legacy);
  const linked = migrated.resolve({sub:'auth0|legacy',email:'legacy@example.com',emailVerified:true});
  assert.notEqual(linked.userId,'auth0|legacy');
  assert.deepEqual(linked.roles,['creator']); assert.deepEqual(linked.tournamentRoles,{'legacy-cup':'owner'});
  assert.equal(migrated.listTournament({id:'legacy-cup'}).grants[0].granted_by,linked.userId);
  const again = new AccessStore(legacy);
  assert.equal(again.lookup({sub:'auth0|legacy'}).userId,linked.userId);
  assert.equal(again.listPeople().identities.length,1);
});
const mock = await mockAuth0();
try {
  const api = await createInProcessApi({auth0:{AUTH0_DOMAIN:mock.issuer,AUTH0_AUDIENCE:mock.audience,AUTH0_CLIENT_ID:mock.clientId,ADMIN_EMAILS:'admin@example.com'}});
  const central = api.durableObject('__ksm_access__');
  async function internal(operation,body) { return (await central.fetch(new Request(`https://durable-object/internal/access/${operation}`, {method:'POST',body:JSON.stringify(body)}))).json(); }
  await internal('grant',{email:'creator@example.com',scope:'global',role:'creator'});
  const me = async (email,claims) => api.call('GET','/api/auth/me',{headers:{authorization:`Bearer ${await mock.token(email,claims)}`}});
  assert.deepEqual(await (await me('creator@example.com')).json(),{email:'creator@example.com',role:'creator',roles:['creator']});
  assert.deepEqual(await (await me('renamed@example.com',{sub:'mock|creator@example.com'})).json(),{email:'renamed@example.com',role:'creator',roles:['creator']});
  assert.equal((await me('unverified@example.com',{[VERIFIED_CLAIM]:false})).status,401);
  assert.deepEqual(await (await me('admin@example.com')).json(),{email:'admin@example.com',role:'admin',roles:['admin']});
  assert(!(await internal('listPeople',{})).users.some(u=>u.email==='unverified@example.com'));
  passed++; console.log('PASS Worker me resolves roles by sub and rejects unverified JWTs before storage');
  for (const path of ['/internal/access/grant','/api/internal/access/grant','/api/tournaments/__ksm_access__/internal/access/grant']) await api.call('POST',path,{body:{email:'attacker@example.com',scope:'global',role:'admin'}});
  assert(!(await internal('listPeople',{})).invites.some(u=>u.email==='attacker@example.com'));
  passed++; console.log('PASS public paths cannot reach access-store operations');
} finally { await mock.close(); }
console.log(`${passed} access store checks passed`);
