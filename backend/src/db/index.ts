import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { runMigrations } from './migrate.js';

export type DB = BetterSQLite3Database<typeof schema>;

let _db: DB | null = null;

// Create a DB instance against a file path or ':memory:' (tests). Runs migrations.
export function createDb(filePath: string): DB {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  runMigrations(sqlite);
  return db;
}

// Lazily-initialised singleton used by the running app.
export function initDb(filePath: string): DB {
  _db = createDb(filePath);
  return _db;
}

export function getDb(): DB {
  if (!_db) throw new Error('Database not initialised — call initDb() first');
  return _db;
}

export { schema };
