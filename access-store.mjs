import { normalizeEmail, isAdmin } from './auth0-worker.mjs';

// Central access persistence. follows (#44) and participant_links (#132) will be
// added here later. Keep SQL and identity linking here so storage can move to D1.
export class AccessStore {
  constructor(storage) {
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
    `);
  }
  rows(query, ...args) { return this.sql.exec(query, ...args).toArray(); }
  validate(scope, role) {
    if (typeof scope !== 'string' || !scope || scope.startsWith('__ksm_') || !(scope === 'global' ? ['admin','creator'] : ['owner','director']).includes(role)) throw new Error('Invalid access grant');
  }
  putGrant(userId, scope, role, by, at) {
    if (scope === 'global') this.sql.exec('INSERT OR IGNORE INTO global_roles VALUES(?,?,?,?)', userId, role, by, at);
    else this.sql.exec(`INSERT INTO tournament_access VALUES(?,?,?,?,?) ON CONFLICT(user_id,tournament_id) DO UPDATE SET role=excluded.role, granted_by=excluded.granted_by, granted_at=excluded.granted_at WHERE tournament_access.role != 'owner'`, userId, scope, role, by, at);
  }
  resolve(identity) {
    const email = normalizeEmail(identity?.email);
    if (!email || !identity?.sub || identity.emailVerified !== true) return { roles: [], tournamentRoles: {} };
    return this.storage.transactionSync(() => {
      const now = new Date().toISOString();
      // A different sub claiming an already-linked email must never inherit its grants.
      // The unique email constraint rejects the collision and rolls back invite linking.
      this.sql.exec(`INSERT INTO users VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, last_sign_in_at=excluded.last_sign_in_at`, identity.sub, email, identity.displayName || null, now, now);
      for (const invite of this.rows('SELECT * FROM invites WHERE email=?', email)) this.putGrant(identity.sub, invite.scope, invite.role, invite.invited_by, invite.created_at);
      this.sql.exec('DELETE FROM invites WHERE email=?', email);
      return {
        roles: this.rows('SELECT role FROM global_roles WHERE user_id=? ORDER BY role', identity.sub).map(row => row.role),
        tournamentRoles: Object.fromEntries(this.rows('SELECT tournament_id,role FROM tournament_access WHERE user_id=?', identity.sub).map(row => [row.tournament_id, row.role]))
      };
    });
  }
  grant({email, scope, role, grantedBy = ''}) {
    email = normalizeEmail(email); if (!email) throw new Error('Valid email required'); this.validate(scope, role);
    return this.storage.transactionSync(() => {
      const user = this.rows('SELECT id FROM users WHERE lower(email)=?', email)[0];
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
  listPeople() { return {users:this.rows('SELECT * FROM users ORDER BY email'), invites:this.rows('SELECT * FROM invites ORDER BY email,scope,role'), globalRoles:this.rows('SELECT * FROM global_roles'), tournamentAccess:this.rows('SELECT * FROM tournament_access')}; }
  listTournament({id}) { return {grants:this.rows('SELECT a.*,u.email,u.display_name FROM tournament_access a JOIN users u ON u.id=a.user_id WHERE tournament_id=?', id), invites:this.rows('SELECT * FROM invites WHERE scope=?', id)}; }
  removeTournament({id}) {
    return this.storage.transactionSync(() => {
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
