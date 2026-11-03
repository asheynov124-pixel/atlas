/**
 * Durable store on Node's built-in SQLite (node:sqlite). One file holds the firm:
 * users and sessions, matters and membership, per-matter kernel snapshots, the
 * hash-chained audit log, the research database, drafts, workflows and deadlines.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = DatabaseSync;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('admin','partner','associate','paralegal')),
     pw_hash TEXT NOT NULL, created_at TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS matters (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT, docs_dir TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'open', created_by TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS matter_members (matter_id TEXT NOT NULL, user_id TEXT NOT NULL, added_by TEXT, added_at TEXT, PRIMARY KEY (matter_id, user_id));
   CREATE TABLE IF NOT EXISTS screens (matter_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT, placed_by TEXT, placed_at TEXT, PRIMARY KEY (matter_id, user_id));
   CREATE TABLE IF NOT EXISTS snapshots (matter_id TEXT NOT NULL, store TEXT NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (matter_id, store));
   CREATE TABLE IF NOT EXISTS audit (
     seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, matter_id TEXT, actor TEXT NOT NULL,
     action TEXT NOT NULL, detail TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS audit_matter ON audit(matter_id, seq);`,

  `CREATE TABLE IF NOT EXISTS cases (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT, citation TEXT, citations TEXT NOT NULL DEFAULT '[]',
     court TEXT, court_rank INTEGER NOT NULL DEFAULT 9, date TEXT, reporter TEXT, volume INTEGER, first_page INTEGER,
     source TEXT NOT NULL, url TEXT, text TEXT NOT NULL, excerpt INTEGER NOT NULL DEFAULT 0,
     tags TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '', starred INTEGER NOT NULL DEFAULT 0,
     treatment TEXT, imported_by TEXT, imported_at TEXT NOT NULL, opens INTEGER NOT NULL DEFAULT 0);
   CREATE VIRTUAL TABLE IF NOT EXISTS cases_fts USING fts5(case_id UNINDEXED, name, citation, body, tokenize='porter unicode61');
   CREATE TABLE IF NOT EXISTS quotes (
     id TEXT PRIMARY KEY, case_id TEXT NOT NULL, text TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL,
     pin TEXT, tags TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', proposition TEXT NOT NULL DEFAULT '',
     uses INTEGER NOT NULL DEFAULT 0, matter_id TEXT, created_by TEXT, created_at TEXT NOT NULL);
   CREATE VIRTUAL TABLE IF NOT EXISTS quotes_fts USING fts5(quote_id UNINDEXED, text, proposition, tags, tokenize='porter unicode61');
   CREATE TABLE IF NOT EXISTS cites_out (case_id TEXT NOT NULL, cited TEXT NOT NULL, PRIMARY KEY (case_id, cited));
   CREATE TABLE IF NOT EXISTS search_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, query TEXT NOT NULL, at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS drafts (
     id TEXT PRIMARY KEY, matter_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
     owner TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS workflows (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, def TEXT NOT NULL, source TEXT NOT NULL,
     created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS deadlines (
     id TEXT PRIMARY KEY, matter_id TEXT NOT NULL, rule_id TEXT NOT NULL, title TEXT NOT NULL, due TEXT NOT NULL,
     trigger TEXT NOT NULL, math TEXT NOT NULL, status TEXT NOT NULL, approval_id TEXT, source_doc TEXT,
     created_at TEXT NOT NULL, decided_by TEXT);
   CREATE TABLE IF NOT EXISTS tripwires (
     id TEXT PRIMARY KEY, matter_id TEXT NOT NULL, doc TEXT NOT NULL, paragraph INTEGER NOT NULL,
     text TEXT NOT NULL, keys TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'armed', tripped_by TEXT, tripped_at TEXT, detail TEXT);`,
];

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | undefined;
  let version = row ? Number(row.value) : 0;
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      version += 1;
      db.prepare("INSERT INTO meta(key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(version));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

export function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
