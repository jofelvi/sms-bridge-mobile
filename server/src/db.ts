import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type MessageDirection = 'outbound' | 'inbound';
export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'received';

export interface MessageRow {
  id: string;
  direction: MessageDirection;
  phone_number: string;
  body: string;
  status: MessageStatus;
  client_message_id: string | null;
  error: string | null;
  segments: number;
  attempts: number;
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
}

export type Db = Database.Database;

export function openDb(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  return db;
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      client_message_id TEXT,
      error TEXT,
      segments INTEGER NOT NULL DEFAULT 1,
      attempts INTEGER NOT NULL DEFAULT 0,
      webhook_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_status
      ON messages (status, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_id
      ON messages (client_message_id)
      WHERE client_message_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS device_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_seen_at TEXT,
      battery_level INTEGER,
      app_version TEXT
    );
  `);
}
