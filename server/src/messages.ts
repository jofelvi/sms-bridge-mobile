import { randomUUID } from 'node:crypto';
import type { Db, MessageDirection, MessageRow, MessageStatus } from './db.js';

/** Un SMS son 160 caracteres; pasado eso la operadora cobra otro mensaje. */
export const SMS_SEGMENT_CHARS = 160;

export interface EnqueueInput {
  to: string;
  body: string;
  clientMessageId?: string;
  webhookUrl?: string;
}

export interface EnqueueResult {
  message: MessageRow;
  /** true cuando el clientMessageId ya existia: NO se encolo un segundo SMS. */
  duplicate: boolean;
}

export interface InboundInput {
  from: string;
  body: string;
}

export interface ListFilters {
  status?: MessageStatus;
  direction?: MessageDirection;
  limit?: number;
}

export function countSegments(body: string): number {
  if (body.length <= SMS_SEGMENT_CHARS) return 1;
  return Math.ceil(body.length / SMS_SEGMENT_CHARS);
}

function now(): string {
  return new Date().toISOString();
}

export function getById(db: Db, id: string): MessageRow | null {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
    | MessageRow
    | undefined;
  return row ?? null;
}

function findByClientId(db: Db, clientMessageId: string): MessageRow | null {
  const row = db
    .prepare('SELECT * FROM messages WHERE client_message_id = ?')
    .get(clientMessageId) as MessageRow | undefined;
  return row ?? null;
}

const INSERT_SQL = `INSERT INTO messages
    (id, direction, phone_number, body, status, client_message_id, error,
     segments, attempts, webhook_url, created_at, updated_at)
   VALUES
    (@id, @direction, @phone_number, @body, @status, @client_message_id,
     @error, @segments, @attempts, @webhook_url, @created_at, @updated_at)`;

export function enqueue(db: Db, input: EnqueueInput): EnqueueResult {
  // Idempotencia: el mismo clientMessageId nunca manda dos SMS. La red movil
  // falla y los clientes reintentan; sin esto el reintento cuesta dinero real.
  if (input.clientMessageId) {
    const existing = findByClientId(db, input.clientMessageId);
    if (existing) return { message: existing, duplicate: true };
  }

  const timestamp = now();
  const row: MessageRow = {
    id: randomUUID(),
    direction: 'outbound',
    phone_number: input.to,
    body: input.body,
    status: 'queued',
    client_message_id: input.clientMessageId ?? null,
    error: null,
    segments: countSegments(input.body),
    attempts: 0,
    webhook_url: input.webhookUrl ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  db.prepare(INSERT_SQL).run(row);
  return { message: row, duplicate: false };
}

/**
 * Entrega trabajo al telefono y lo marca como 'sent' en la misma transaccion,
 * para que dos consultas simultaneas no manden el mismo SMS dos veces.
 * 'sent' significa "entregado al telefono"; 'delivered' lo confirma el telefono.
 */
export function claimPending(db: Db, limit: number): MessageRow[] {
  const claim = db.transaction((max: number): MessageRow[] => {
    const rows = db
      .prepare(
        `SELECT * FROM messages
         WHERE status = 'queued' AND direction = 'outbound'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(max) as MessageRow[];

    const update = db.prepare(
      `UPDATE messages
       SET status = 'sent', attempts = attempts + 1, updated_at = ?
       WHERE id = ?`,
    );
    for (const row of rows) update.run(now(), row.id);

    return rows.map((row) => ({
      ...row,
      status: 'sent' as MessageStatus,
      attempts: row.attempts + 1,
    }));
  });

  return claim(limit);
}

export function markResult(
  db: Db,
  id: string,
  status: MessageStatus,
  error?: string,
): MessageRow | null {
  const result = db
    .prepare(
      'UPDATE messages SET status = ?, error = ?, updated_at = ? WHERE id = ?',
    )
    .run(status, error ?? null, now(), id);

  if (result.changes === 0) return null;
  return getById(db, id);
}

export function recordInbound(db: Db, input: InboundInput): MessageRow {
  const timestamp = now();
  const row: MessageRow = {
    id: randomUUID(),
    direction: 'inbound',
    phone_number: input.from,
    body: input.body,
    status: 'received',
    client_message_id: null,
    error: null,
    segments: countSegments(input.body),
    attempts: 0,
    webhook_url: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  db.prepare(INSERT_SQL).run(row);
  return row;
}

export function list(db: Db, filters: ListFilters): MessageRow[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.direction) {
    clauses.push('direction = ?');
    params.push(filters.direction);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(filters.limit ?? 100);

  return db
    .prepare(`SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params) as MessageRow[];
}
