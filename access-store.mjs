import { normalizeEmail, isAdmin } from './auth0-worker.mjs';

// Central access persistence. follows (#44) and participant_links (#132) will be
// added here later. Keep SQL and identity linking here so storage can move to D1.
export class AccessStore {
  constructor(storage, env = {}) {
    this.env = env;
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT, created_at TEXT, last_sign_in_at TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(lower(email));
      CREATE TABLE IF NOT EXISTS invites(email TEXT, scope TEXT, role TEXT, invited_by TEXT, created_at TEXT, PRIMARY KEY(email, scope, role));
      CREATE TABLE IF NOT EXISTS global_roles(user_id TEXT, role TEXT, granted_by TEXT, granted_at TEXT, PRIMARY KEY(user_id, role));
      CREATE TABLE IF NOT EXISTS tournament_access(user_id TEXT, tournament_id TEXT, role TEXT, granted_by TEXT, granted_at TEXT, PRIMARY KEY(user_id, tournament_id));
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
      INSERT OR IGNORE INTO meta VALUES('schema_version', '1');
      CREATE TABLE IF NOT EXISTS user_identities(sub TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT, linked_at TEXT);
      CREATE INDEX IF NOT EXISTS identities_user ON user_identities(user_id);
    `);
    this.storage.transactionSync(() => {
      if (this.rows("SELECT value FROM meta WHERE key='schema_version'")[0]?.value === '2') return;
      const users = this.rows('SELECT id FROM users');
      const ids = new Map(users.map(user => [user.id, crypto.randomUUID()]));
      for (const [sub, id] of ids) {
        this.sql.exec('UPDATE users SET id=? WHERE id=?', id, sub);
        this.sql.exec('UPDATE global_roles SET user_id=? WHERE user_id=?', id, sub);
        this.sql.exec('UPDATE tournament_access SET user_id=? WHERE user_id=?', id, sub);
        this.sql.exec('INSERT INTO user_identities VALUES(?,?,?,?)', sub, id, sub.split('|')[0], new Date().toISOString());
      }
      for (const [sub, id] of ids) {
        this.sql.exec('UPDATE global_roles SET granted_by=? WHERE granted_by=?', id, sub);
        this.sql.exec('UPDATE tournament_access SET granted_by=? WHERE granted_by=?', id, sub);
        this.sql.exec('UPDATE invites SET invited_by=? WHERE invited_by=?', id, sub);
      }
      this.sql.exec("UPDATE meta SET value='2' WHERE key='schema_version'");
    });
  }
  rows(query, ...args) { return this.sql.exec(query, ...args).toArray(); }
  validate(scope, role) {
    if (typeof scope !== 'string' || !scope || scope.startsWith('__ksm_') || !(scope === 'global' ? ['admin','creator'] : ['owner','director']).includes(role)) throw new Error('Invalid access grant');
  }
  putGrant(userId, scope, role, by, at) {
    if (scope !== 'global' && this.rows('SELECT 1 FROM meta WHERE key=?', `deleted:${scope}`).length) throw new Error('Tournament deleted');
    if (scope === 'global') this.sql.exec('INSERT OR IGNORE INTO global_roles VALUES(?,?,?,?)', userId, role, by, at);
    else this.sql.exec(`INSERT INTO tournament_access VALUES(?,?,?,?,?) ON CONFLICT(user_id,tournament_id) DO UPDATE SET role=excluded.role, granted_by=excluded.granted_by, granted_at=excluded.granted_at WHERE tournament_access.role != 'owner'`, userId, scope, role, by, at);
  }
  accessFor(userId) {
    return {
      userId,
      roles: this.rows('SELECT role FROM global_roles WHERE user_id=? ORDER BY role', userId).map(row => row.role),
      tournamentRoles: Object.fromEntries(this.rows('SELECT tournament_id,role FROM tournament_access WHERE user_id=?', userId).map(row => [row.tournament_id, row.role]))
    };
  }
  lookup({sub}) {
    const user = this.rows('SELECT u.* FROM user_identities i JOIN users u ON u.id=i.user_id WHERE i.sub=?', sub)[0];
    return user ? {...this.accessFor(user.id), email:user.email} : {userId:null,roles:[],tournamentRoles:{}};
  }
  lookupMany({subs}) {
    const result = {};
    for (const row of this.rows(`SELECT i.sub,u.id AS user_id,u.email,g.role AS global_role,t.tournament_id,t.role AS tournament_role
      FROM user_identities i JOIN users u ON u.id=i.user_id
      LEFT JOIN global_roles g ON g.user_id=u.id
      LEFT JOIN tournament_access t ON t.user_id=u.id
      WHERE i.sub IN (SELECT value FROM json_each(?))`, JSON.stringify([...new Set(subs)]))) {
      const user = result[row.sub] ||= {userId:row.user_id,email:row.email,roles:[],tournamentRoles:{}};
      if (row.global_role && !user.roles.includes(row.global_role)) user.roles.push(row.global_role);
      if (row.tournament_id) user.tournamentRoles[row.tournament_id] = row.tournament_role;
    }
    return result;
  }
  resolve(identity) {
    const email = normalizeEmail(identity?.email);
    if (!email || typeof identity?.sub !== 'string' || !identity.sub || identity.emailVerified !== true) return {userId:null, roles:[], tournamentRoles:{}};
    return this.storage.transactionSync(() => {
      const now = new Date().toISOString();
      const known = this.rows('SELECT i.user_id,u.* FROM user_identities i JOIN users u ON u.id=i.user_id WHERE sub=?', identity.sub)[0];
      const emailUser = this.rows('SELECT id FROM users WHERE lower(email)=?', email)[0];
      const userId = known?.user_id || emailUser?.id || crypto.randomUUID();
      if (!known) this.sql.exec('INSERT INTO user_identities VALUES(?,?,?,?)', identity.sub, userId, identity.sub.split('|')[0], now);
      // Never merge two established KSM users on an email change. The identity
      // retains its grants; an occupied canonical email stays with its user.
      const emailAvailable = !emailUser || emailUser.id === userId;
      const user = known || (emailUser && this.rows('SELECT * FROM users WHERE id=?', emailUser.id)[0]);
      const invites = emailAvailable ? this.rows('SELECT * FROM invites WHERE email=?', email) : [];
      const stale = !user?.last_sign_in_at || Date.now() - Date.parse(user.last_sign_in_at) >= 3600000;
      if (emailAvailable) {
        if (!user || user.email !== email || (identity.displayName && identity.displayName !== user.display_name) || invites.length || stale) this.sql.exec(`INSERT INTO users VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=COALESCE(excluded.display_name,users.display_name), last_sign_in_at=excluded.last_sign_in_at`, userId, email, identity.displayName || null, now, now);
        for (const invite of invites) this.putGrant(userId, invite.scope, invite.role, invite.invited_by, invite.created_at);
        if (invites.length) this.sql.exec('DELETE FROM invites WHERE email=?', email);
      } else if (stale) this.sql.exec('UPDATE users SET last_sign_in_at=? WHERE id=?', now, userId);
      return this.accessFor(userId);
    });
  }
  grant({email, userId, scope, role, grantedBy = ''}) {
    email = normalizeEmail(email); if (!email && !userId) throw new Error('Valid email required'); this.validate(scope, role);
    return this.storage.transactionSync(() => {
      if (scope !== 'global' && this.rows('SELECT 1 FROM meta WHERE key=?', `deleted:${scope}`).length) throw new Error('Tournament deleted');
      const user = userId ? this.rows('SELECT id FROM users WHERE id=?', userId)[0] : this.rows('SELECT id FROM users WHERE lower(email)=?', email)[0];
      if (userId && !user) throw new Error('Unknown user');
      const now = new Date().toISOString();
      if (user) this.putGrant(user.id, scope, role, grantedBy, now);
      else this.sql.exec('INSERT OR IGNORE INTO invites VALUES(?,?,?,?,?)', email, scope, role, grantedBy, now);
      return {ok:true};
    });
  }
  revoke({userId, email, scope, role}) {
    this.validate(scope, role);
    email = normalizeEmail(email);
    return this.storage.transactionSync(() => {
      const id = userId || this.rows('SELECT id FROM users WHERE lower(email)=?', email)[0]?.id;
      if (id) {
        if (scope === 'global') this.sql.exec('DELETE FROM global_roles WHERE user_id=? AND role=?', id, role);
        else this.sql.exec('DELETE FROM tournament_access WHERE user_id=? AND tournament_id=? AND role=?', id, scope, role);
      }
      this.sql.exec('DELETE FROM invites WHERE email=? AND scope=? AND role=?', email, scope, role);
      return {ok:true};
    });
  }
  listPeople() { return {identities:this.rows('SELECT * FROM user_identities'), users:this.rows('SELECT * FROM users ORDER BY email'), invites:this.rows('SELECT * FROM invites ORDER BY email,scope,role'), globalRoles:this.rows('SELECT * FROM global_roles'), tournamentAccess:this.rows('SELECT * FROM tournament_access')}; }
  listTournament({id}) { return {grants:this.rows('SELECT a.*,u.email,u.display_name FROM tournament_access a JOIN users u ON u.id=a.user_id WHERE tournament_id=?', id), invites:this.rows('SELECT * FROM invites WHERE scope=?', id)}; }
  migrateTournament({id, directors = []}) {
    this.validate(id, 'director');
    return this.storage.transactionSync(() => {
      const key = `directors:${id}`;
      if (this.rows('SELECT 1 FROM meta WHERE key=?', `deleted:${id}`).length) return {ok:true};
      if (this.rows('SELECT value FROM meta WHERE key=?', key).length) return {ok:true};
      for (const value of directors) {
        const email = normalizeEmail(value); if (!email) continue;
        const user = this.rows('SELECT id FROM users WHERE lower(email)=?', email)[0];
        const at = new Date().toISOString();
        if (user) this.putGrant(user.id, id, 'director', 'legacy-migration', at);
        else this.sql.exec('INSERT OR IGNORE INTO invites VALUES(?,?,?,?,?)', email, id, 'director', 'legacy-migration', at);
      }
      this.sql.exec('INSERT INTO meta VALUES(?,?)', key, 'done');
      return {ok:true};
    });
  }
  changeTournament({actor, id, action, email, userId, role}) {
    this.validate(id, role);
    if (!['grant','revoke'].includes(action)) throw new Error('Invalid access action');
    email = normalizeEmail(email);
    if (!email && !userId) return {ok:false,status:400,error:'Valid email or user ID required'};
    return this.storage.transactionSync(() => {
      if (this.rows('SELECT 1 FROM meta WHERE key=?', `deleted:${id}`).length) return {ok:false,status:410,error:'Tournament deleted'};
      const current = this.lookup(actor);
      const admin = isAdmin(this.env, actor.email) || current.roles.includes('admin');
      if (!admin && current.tournamentRoles[id] !== 'owner') return {ok:false,status:403,error:'Owner or admin authorization required'};
      const target = userId ? this.rows('SELECT * FROM users WHERE id=?', userId)[0] : this.rows('SELECT * FROM users WHERE lower(email)=?', email)[0];
      if (userId && !target) return {ok:false,status:400,error:'Unknown user'};
      if (action === 'grant' && role === 'director') {
        const owner = target ? this.rows("SELECT 1 FROM tournament_access WHERE user_id=? AND tournament_id=? AND role='owner'",target.id,id).length : this.rows("SELECT 1 FROM invites WHERE email=? AND scope=? AND role='owner'",email,id).length;
        if (owner) return {ok:false,status:409,error:'Already an owner'};
      }
      if (action === 'revoke' && role === 'owner' && !admin && target) {
        const owner = this.rows("SELECT 1 FROM tournament_access WHERE user_id=? AND tournament_id=? AND role='owner'", target.id, id).length;
        const owners = this.rows("SELECT count(*) AS n FROM tournament_access WHERE tournament_id=? AND role='owner'", id)[0].n;
        if (owner && owners <= 1) return {ok:false,status:409,error:'The last owner can only be removed by an admin'};
      }
      // Mutate inline so authorization, the last-owner check and the write share
      // one transaction, including concurrent requests from different devices.
      const at = new Date().toISOString();
      const removed = action === 'revoke' && ((!!target && this.rows('SELECT 1 FROM tournament_access WHERE user_id=? AND tournament_id=? AND role=?', target.id, id, role).length > 0) || this.rows('SELECT 1 FROM invites WHERE email=? AND scope=? AND role=?', target?.email || email,id,role).length > 0);
      if (action === 'grant') {
        if (target) this.putGrant(target.id, id, role, current.userId, at);
        else this.sql.exec('INSERT OR IGNORE INTO invites VALUES(?,?,?,?,?)', email, id, role, current.userId, at);
      } else {
        if (target) this.sql.exec('DELETE FROM tournament_access WHERE user_id=? AND tournament_id=? AND role=?', target.id, id, role);
        this.sql.exec('DELETE FROM invites WHERE email=? AND scope=? AND role=?', target?.email || email, id, role);
      }
      return {ok:true,userId:target?.id || null,removed};
    });
  }
  peopleView({tournaments = []}) {
    const data = this.listPeople();
    const names = new Map(tournaments.map(item=>[item.id,item.name]));
    const users = data.users.map(user => ({userId:user.id,email:user.email,displayName:user.display_name,lastSignInAt:user.last_sign_in_at,
      providers:[...new Set(data.identities.filter(identity=>identity.user_id === user.id).map(identity=>identity.provider))],
      roles:[...new Set([...data.globalRoles.filter(row=>row.user_id===user.id).map(row=>row.role),...(isAdmin(this.env,user.email)?['admin']:[])])],
      tournamentAccess:data.tournamentAccess.filter(row=>row.user_id===user.id).map(row=>({tournamentId:row.tournament_id,name:names.get(row.tournament_id)||'Tournament',role:row.role})),
      fromServer:isAdmin(this.env,user.email)}));
    for (const email of String(this.env.ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean)) {
      if (!users.some(user=>user.email === email)) users.push({userId:null,email,providers:[],roles:['admin'],tournamentAccess:[],fromServer:true});
    }
    return {users,invites:data.invites.map(invite=>({email:invite.email,scope:invite.scope,role:invite.role,name:invite.scope==='global'?'Global':names.get(invite.scope)||'Tournament',fromServer:isAdmin(this.env,invite.email)}))};
  }
  adminChange({actor,action,email,userId,role}) {
    return this.storage.transactionSync(() => {
      const current = this.lookup(actor);
      if (!isAdmin(this.env,actor.email) && !current.roles.includes('admin')) return {ok:false,status:403,error:'Admin authorization required'};
      if (!['grant','revoke','remove'].includes(action) || (action !== 'remove' && !['admin','creator'].includes(role))) return {ok:false,status:400,error:'Admin or creator role required'};
      email = normalizeEmail(email);
      const target = userId ? this.rows('SELECT * FROM users WHERE id=?',userId)[0] : this.rows('SELECT * FROM users WHERE lower(email)=?',email)[0];
      if (userId && !target) return {ok:false,status:404,error:'User not found'};
      email = target?.email || email;
      if (!email) return {ok:false,status:400,error:'Valid email or user ID required'};
      if (action !== 'grant' && isAdmin(this.env,email)) return {ok:false,status:409,error:'Access comes from server settings'};
      if (action !== 'grant' && (action === 'remove' || role === 'admin') && target?.id === current.userId && !isAdmin(this.env,actor.email)) {
        const count = this.rows("SELECT count(*) AS n FROM global_roles WHERE role='admin'")[0].n;
        if (count <= 1) return {ok:false,status:409,error:'You cannot remove the last stored admin'};
      }
      const at = new Date().toISOString();
      if (action === 'grant') {
        if (target) this.putGrant(target.id,'global',role,current.userId,at);
        else this.sql.exec('INSERT OR IGNORE INTO invites VALUES(?,?,?,?,?)',email,'global',role,current.userId,at);
        return {ok:true};
      }
      if (action === 'revoke') {
        const removed = (target && this.rows('SELECT 1 FROM global_roles WHERE user_id=? AND role=?',target.id,role).length > 0) || this.rows("SELECT 1 FROM invites WHERE email=? AND scope='global' AND role=?",email,role).length > 0;
        if (target) this.sql.exec('DELETE FROM global_roles WHERE user_id=? AND role=?',target.id,role);
        this.sql.exec("DELETE FROM invites WHERE email=? AND scope='global' AND role=?",email,role);
        return {ok:true,removed:!!removed};
      }
      if (!target) return {ok:false,status:404,error:'User not found'};
      const tournaments = this.rows('SELECT tournament_id FROM tournament_access WHERE user_id=?',target.id).map(row=>row.tournament_id);
      const wasAdmin = this.rows("SELECT 1 FROM global_roles WHERE user_id=? AND role='admin'",target.id).length > 0;
      this.sql.exec('DELETE FROM global_roles WHERE user_id=?',target.id);
      this.sql.exec('DELETE FROM tournament_access WHERE user_id=?',target.id);
      this.sql.exec('DELETE FROM invites WHERE email=?',email);
      return {ok:true,userId:target.id,tournaments,wasAdmin};
    });
  }
  removeTournament({id}) {
    return this.storage.transactionSync(() => {
      this.sql.exec('INSERT OR IGNORE INTO meta VALUES(?,?)', `deleted:${id}`, new Date().toISOString());
      this.sql.exec('DELETE FROM tournament_access WHERE tournament_id=?', id);
      this.sql.exec('DELETE FROM invites WHERE scope=?', id);
      return {ok:true};
    });
  }
}

// These URLs are only used on the DO binding; the public Worker never forwards them.
export async function accessCall(env, operation, body = {}) {
  const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName('__ksm_access__'));
  const response = await stub.fetch(new Request(`https://durable-object/internal/access/${operation}`, {method:'POST', body:JSON.stringify(body)}));
  if (!response.ok) throw new Error('Access store unavailable');
  return response.json();
}
export async function resolveAccess(env, identity) {
  const result = await accessCall(env, 'resolve', identity);
  const roles = [...new Set([...result.roles, ...(isAdmin(env, identity.email) ? ['admin'] : [])])];
  return {...result, roles, role:roles.includes('admin') ? 'admin' : roles.includes('creator') ? 'creator' : 'spectator'};
}
