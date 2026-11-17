/**
 * Accounts and sessions. Passwords are hashed with scrypt and a per-user salt;
 * sessions are random 256-bit tokens in an HttpOnly, SameSite=Strict cookie.
 *
 * Roles map onto the Approvals Inbox's reviewer roles:
 *   admin     → manages users and matters, and may approve Tier 3 actions
 *   partner   → may approve Tier 3 actions and delegate that authority
 *   associate → drafts, delegates runs, cannot approve unless a partner delegates
 *   paralegal → same as associate in this build
 */
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import type { Db } from '../store/db.js';

export type Role = 'admin' | 'partner' | 'associate' | 'paralegal';
export interface User { id: string; email: string; name: string; role: Role; created_at: string; disabled: number }

const SESSION_DAYS = 14;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function checkPassword(pw: string, stored: string): boolean {
  const [alg, saltHex, keyHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(keyHex, 'hex');
  return key.length === want.length && timingSafeEqual(key, want);
}

export function reviewerRoles(role: Role): string[] {
  if (role === 'admin') return ['workspace:owner', 'role:approver', 'role:admin'];
  if (role === 'partner') return ['role:approver', 'role:partner'];
  return [`role:${role}`];
}

export class AuthError extends Error {
  constructor(message: string, readonly status = 401) { super(message); this.name = 'AuthError'; }
}

export class Auth {
  constructor(private db: Db) {}

  needsSetup(): boolean {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    return Number(r.n) === 0;
  }

  createUser(input: { email: string; name: string; role: Role; password: string }): User {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new AuthError('Enter a valid email address.', 400);
    if (input.password.length < 10) throw new AuthError('Passwords must be at least 10 characters.', 400);
    if (!['admin', 'partner', 'associate', 'paralegal'].includes(input.role)) throw new AuthError('Unknown role.', 400);
    const exists = this.db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
    if (exists) throw new AuthError('A user with that email already exists.', 409);
    const user: User = { id: `usr_${randomUUID().slice(0, 8)}`, email, name: input.name.trim() || email, role: input.role, created_at: new Date().toISOString(), disabled: 0 };
    this.db.prepare('INSERT INTO users (id, email, name, role, pw_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, user.email, user.name, user.role, hashPassword(input.password), user.created_at);
    return user;
  }

  updateUser(id: string, patch: { role?: Role; disabled?: boolean; name?: string; password?: string }): User {
    const u = this.getUser(id);
    if (!u) throw new AuthError('Unknown user.', 404);
    if (patch.role) this.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(patch.role, id);
    if (patch.name) this.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(patch.name, id);
    if (patch.disabled !== undefined) {
      this.db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(patch.disabled ? 1 : 0, id);
      if (patch.disabled) this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    if (patch.password) {
      if (patch.password.length < 10) throw new AuthError('Passwords must be at least 10 characters.', 400);
      this.db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(hashPassword(patch.password), id);
    }
    return this.getUser(id)!;
  }

  getUser(id: string): User | undefined {
    return this.db.prepare('SELECT id, email, name, role, created_at, disabled FROM users WHERE id = ?').get(id) as unknown as User | undefined;
  }

  listUsers(): User[] {
    return this.db.prepare('SELECT id, email, name, role, created_at, disabled FROM users ORDER BY created_at').all() as unknown as User[];
  }

  login(email: string, password: string): { token: string; user: User; expires_at: string } {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as unknown as (User & { pw_hash: string }) | undefined;
    if (!row || row.disabled || !checkPassword(password, row.pw_hash)) throw new AuthError('Email or password is incorrect.');
    const token = randomBytes(32).toString('base64url');
    const expires_at = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    this.db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, row.id, new Date().toISOString(), expires_at);
    const { pw_hash: _p, ...user } = row;
    return { token, user, expires_at };
  }

  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  userForToken(token: string | undefined): User | null {
    if (!token) return null;
    const row = this.db.prepare('SELECT u.id, u.email, u.name, u.role, u.created_at, u.disabled, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token) as unknown as (User & { expires_at: string }) | undefined;
    if (!row || row.disabled || Date.parse(row.expires_at) < Date.now()) return null;
    const { expires_at: _e, ...user } = row;
    return user;
  }
}
