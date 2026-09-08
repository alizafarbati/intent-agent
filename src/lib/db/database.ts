import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? "/tmp/intent-agent.db" : path.join(process.cwd(), "data", "intent-agent.db"));

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS intents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      original_prompt TEXT NOT NULL,
      objective TEXT NOT NULL,
      functional_requirements TEXT,
      non_functional_requirements TEXT,
      permissions TEXT,
      misunderstandings TEXT,
      edge_cases TEXT,
      acceptance_criteria TEXT,
      tech_constraints TEXT,
      completeness_score REAL DEFAULT 0,
      status TEXT DEFAULT 'compiled',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      service TEXT,
      scopes TEXT,
      destructive INTEGER DEFAULT 0,
      intent_id TEXT,
      status TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (intent_id) REFERENCES intents(id)
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      preference_key TEXT NOT NULL,
      preference_value TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      usage_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, preference_key)
    );

    CREATE TABLE IF NOT EXISTS step_up_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      service TEXT NOT NULL,
      scopes TEXT,
      destructive INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      connection_name TEXT NOT NULL,
      status TEXT DEFAULT 'connected',
      connected_at TEXT DEFAULT (datetime('now')),
      disconnected_at TEXT,
      UNIQUE(user_id, connection_name)
    );

    CREATE INDEX IF NOT EXISTS idx_intents_user ON intents(user_id);
    CREATE INDEX IF NOT EXISTS idx_intents_created ON intents(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_preferences_user ON user_preferences(user_id);
    CREATE INDEX IF NOT EXISTS idx_stepup_user ON step_up_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
  `);

  return db;
}

export function query<T = any>(sql: string, params: any[] = []): T[] {
  const database = getDb();
  return database.prepare(sql).all(...params) as T[];
}

export function execute(sql: string, params: any = {}): any {
  const database = getDb();
  return database.prepare(sql).run(params);
}

export function transaction(fn: (db: Database.Database) => void): (this: Database.Database, ...params: any[]) => void {
  const database = getDb();
  return database.transaction(fn);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export { getDb };
