import Database from "better-sqlite3";
import { ensureDatabaseDir, getDatabasePath } from "./config.js";
import { SCHEMA_SQL } from "./schema.js";

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;

  const path = getDatabasePath();
  ensureDatabaseDir(path);

  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
