import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function getDatabasePath(): string {
  return resolve(process.env.DATABASE_PATH ?? "./data/cloud-playout.db");
}

export function ensureDatabaseDir(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
}
