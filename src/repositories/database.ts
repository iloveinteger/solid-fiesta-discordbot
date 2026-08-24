import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(filePath: string): DatabaseSync {
  const absolute = resolve(filePath);
  mkdirSync(dirname(absolute), { recursive: true });
  const database = new DatabaseSync(absolute);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS factor_cache (
      input TEXT PRIMARY KEY,
      factors_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS exchange_cache (
      cache_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);
  return database;
}
