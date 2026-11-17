/**
 * The firm: one SQLite file, accounts, matters with membership and ethical screens, the
 * hash-chained audit log, the research library and assistant, drafts and workflows.
 * Matters load lazily and each gets its own sealed kernel.
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb, type Db } from '../store/db.js';
import { Auth, AuthError, type User, type Role, reviewerRoles } from './auth.js';
import { AuditLog } from './audit.js';
import { MatterRuntime, type MatterRow } from './matter.js';
import type { ModelProvider } from '../models/provider.js';
import { ResearchLibrary } from '../research/library.js';
import { ResearchAgent } from '../research/agent.js';
import { CourtListener } from '../research/courtlistener.js';
import { Drafts } from '../research/drafts.js';
import { WorkflowStore } from '../workflows/store.js';

export interface FirmOptions {
  dataDir: string;
  provider: ModelProvider;
  providerLabel: string;
  sampleDir?: string;
  /** Use an existing folder as the sample matter's documents instead of copying the sample. */
  legacyWorkspace?: string;
  communityDir: string;
  concurrency?: number;
  watchFolders?: boolean;
  courtListenerToken?: string;
}

export class Firm {
  readonly db: Db;
  readonly auth: Auth;
  readonly audit: AuditLog;
  readonly library: ResearchLibrary;
  readonly agent: ResearchAgent;
  readonly drafts: Drafts;
  readonly workflows: WorkflowStore;
  readonly provider: ModelProvider;
  readonly providerLabel: string;
  readonly dataDir: string;
  readonly concurrency: number;
  readonly watchFolders: boolean;
  private matters = new Map<string, Promise<MatterRuntime>>();

  constructor(private opts: FirmOptions) {
    this.dataDir = opts.dataDir;
    this.db = openDb(join(opts.dataDir, 'meridian.db'));
    this.auth = new Auth(this.db);
    this.audit = new AuditLog(this.db);
    this.library = new ResearchLibrary(this.db);
    this.library.seedIfEmpty();
    this.provider = opts.provider;
    this.providerLabel = opts.providerLabel;
    this.agent = new ResearchAgent(this.library, opts.provider, new CourtListener(opts.courtListenerToken ?? process.env['COURTLISTENER_TOKEN'] ?? ''));
    this.drafts = new Drafts(this.db);
    this.workflows = new WorkflowStore(this.db, opts.communityDir);
    this.concurrency = opts.concurrency ?? 8;
    this.watchFolders = opts.watchFolders ?? true;
  }

  // ---------------------------------------------------------------- setup
  needsSetup(): boolean { return this.auth.needsSetup(); }

  async setup(input: { email: string; name: string; password: string }): Promise<{ user: User; matter: MatterRow }> {
    if (!this.needsSetup()) throw new AuthError('Setup is already complete.', 409);
    const user = this.auth.createUser({ ...input, role: 'admin' });
    this.audit.append(user.id, 'firm.setup', { email: user.email });
    const matter = await this.createMatter({ name: 'Harbor Logistics v. Cinder Freight (sample)', client: 'Harbor Logistics, Inc. (fictional)', sample: true }, user);
    return { user, matter };
  }

  // ---------------------------------------------------------------- matters
  async createMatter(input: { name: string; client?: string; docs_dir?: string; sample?: boolean }, by: User): Promise<MatterRow> {
    if (by.role !== 'admin' && by.role !== 'partner') throw new AuthError('Only partners and admins open matters.', 403);
    const id = `mtr_${randomUUID().slice(0, 8)}`;
    let docs = input.docs_dir ?? join(this.dataDir, 'matters', id, 'docs');
    if (input.sample) {
      if (this.opts.legacyWorkspace) docs = this.opts.legacyWorkspace;
      else if (this.opts.sampleDir) { await mkdir(docs, { recursive: true }); await cp(this.opts.sampleDir, docs, { recursive: true }); }
    }
    await mkdir(docs, { recursive: true });
    const row: MatterRow = { id, name: input.name.trim() || 'Untitled matter', client: input.client ?? null, docs_dir: docs, status: 'open', created_by: by.id, created_at: new Date().toISOString() };
    this.db.prepare('INSERT INTO matters (id, name, client, docs_dir, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(row.id, row.name, row.client, row.docs_dir, row.status, row.created_by, row.created_at);
    this.db.prepare('INSERT INTO matter_members (matter_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)').run(id, by.id, by.id, row.created_at);
    this.audit.append(by.id, 'matter.created', { name: row.name, docs_dir: docs }, id);
    return row;
  }

  matterRow(id: string): MatterRow | undefined { return this.db.prepare('SELECT * FROM matters WHERE id = ?').get(id) as unknown as MatterRow | undefined; }
  allMatters(): MatterRow[] { return this.db.prepare('SELECT * FROM matters ORDER BY created_at').all() as unknown as MatterRow[]; }

  mattersFor(user: User): MatterRow[] {
    return this.db.prepare('SELECT m.* FROM matters m JOIN matter_members mm ON mm.matter_id = m.id WHERE mm.user_id = ? AND NOT EXISTS (SELECT 1 FROM screens s WHERE s.matter_id = m.id AND s.user_id = ?) ORDER BY m.created_at').all(user.id, user.id) as unknown as MatterRow[];
  }

  isScreened(matter_id: string, user_id: string): boolean { return !!this.db.prepare('SELECT 1 FROM screens WHERE matter_id = ? AND user_id = ?').get(matter_id, user_id); }

  members(matter_id: string): Array<User & { screened: boolean }> {
    const users = this.db.prepare('SELECT u.id, u.email, u.name, u.role, u.created_at, u.disabled FROM matter_members mm JOIN users u ON u.id = mm.user_id WHERE mm.matter_id = ?').all(matter_id) as unknown as User[];
    const screened = this.db.prepare('SELECT u.id, u.email, u.name, u.role, u.created_at, u.disabled FROM screens s JOIN users u ON u.id = s.user_id WHERE s.matter_id = ?').all(matter_id) as unknown as User[];
    return [...users.map((u) => ({ ...u, screened: false })), ...screened.map((u) => ({ ...u, screened: true }))];
  }

  addMember(matter_id: string, user_id: string, by: User): void {
    this.requireManager(by);
    if (this.isScreened(matter_id, user_id)) throw new AuthError('That user is screened from this matter. Lift the screen first, after a conflicts review.', 409);
    this.db.prepare('INSERT OR IGNORE INTO matter_members (matter_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)').run(matter_id, user_id, by.id, new Date().toISOString());
    this.audit.append(by.id, 'matter.member_added', { user_id }, matter_id);
  }

  removeMember(matter_id: string, user_id: string, by: User): void {
    this.requireManager(by);
    this.db.prepare('DELETE FROM matter_members WHERE matter_id = ? AND user_id = ?').run(matter_id, user_id);
    this.audit.append(by.id, 'matter.member_removed', { user_id }, matter_id);
  }

  screen(matter_id: string, user_id: string, reason: string, by: User): void {
    this.requireManager(by);
    if (user_id === by.id) throw new AuthError('You cannot screen yourself.', 400);
    this.db.prepare('DELETE FROM matter_members WHERE matter_id = ? AND user_id = ?').run(matter_id, user_id);
    this.db.prepare('INSERT OR REPLACE INTO screens (matter_id, user_id, reason, placed_by, placed_at) VALUES (?, ?, ?, ?, ?)').run(matter_id, user_id, reason, by.id, new Date().toISOString());
    this.audit.append(by.id, 'screen.placed', { user_id, reason }, matter_id);
  }

  liftScreen(matter_id: string, user_id: string, by: User): void {
    this.requireManager(by);
    this.db.prepare('DELETE FROM screens WHERE matter_id = ? AND user_id = ?').run(matter_id, user_id);
    this.audit.append(by.id, 'screen.lifted', { user_id }, matter_id);
  }

  requireManager(by: User): void { if (by.role !== 'admin' && by.role !== 'partner') throw new AuthError('Only partners and admins manage matters.', 403); }

  /** The only way to reach a matter's kernel: membership checked, screens enforced, attempts audited. */
  async matterFor(user: User, matter_id: string): Promise<MatterRuntime> {
    const row = this.matterRow(matter_id);
    if (!row) throw new AuthError('Matter not found.', 404);
    if (this.isScreened(matter_id, user.id)) { this.audit.append(user.id, 'screen.blocked_access', {}, matter_id); throw new AuthError('You are screened from this matter.', 403); }
    const member = this.db.prepare('SELECT 1 FROM matter_members WHERE matter_id = ? AND user_id = ?').get(matter_id, user.id);
    if (!member) throw new AuthError('You are not on this matter. Ask a partner to add you.', 403);
    return this.load(row);
  }

  private load(row: MatterRow): Promise<MatterRuntime> {
    let p = this.matters.get(row.id);
    if (!p) { p = new MatterRuntime(this, row).init(); this.matters.set(row.id, p); p.catch(() => this.matters.delete(row.id)); }
    return p;
  }

  async loadedMatters(): Promise<MatterRuntime[]> { return Promise.all([...this.matters.values()]); }

  /** Rebuild every loaded matter's templates after workflows change. */
  async workflowsChanged(): Promise<void> { for (const m of await this.loadedMatters()) m.buildTemplates(); }

  reviewer(user: User): { id: string; roles: string[] } { return { id: user.id, roles: reviewerRoles(user.role) }; }

  createUser(input: { email: string; name: string; role: Role; password: string }, by: User): User {
    if (by.role !== 'admin') throw new AuthError('Only admins add users.', 403);
    const u = this.auth.createUser(input);
    this.audit.append(by.id, 'user.created', { user_id: u.id, email: u.email, role: u.role });
    return u;
  }

  async close(): Promise<void> { for (const m of await this.loadedMatters()) m.close(); this.db.close(); }
}

export async function exists(p: string): Promise<boolean> { try { await stat(p); return true; } catch { return false; } }
