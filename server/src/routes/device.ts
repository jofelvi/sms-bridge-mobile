import { Router, type RequestHandler } from 'express';
import type { Config } from '../config.js';
import type { Db, MessageStatus } from '../db.js';
import { claimPending, markResult, recordInbound } from '../messages.js';
import { buildPayload, notifyWebhook, type FetchLike } from '../webhooks.js';

/** Se considera caido si no da senales por mas de este tiempo. */
const OFFLINE_AFTER_MS = 2 * 60 * 1000;

export function deviceRoutes(
  db: Db,
  config: Config,
  fetchImpl?: FetchLike,
): Router {
  const router = Router();

  router.get('/pending', (_req, res) => {
    res.json({ messages: claimPending(db, config.deviceBatchSize) });
  });

  router.post('/result', (req, res) => {
    const { id, status, error } = req.body ?? {};

    if (
      typeof id !== 'string' ||
      (status !== 'delivered' && status !== 'failed')
    ) {
      res
        .status(400)
        .json({ error: 'Se requiere "id" y "status" (delivered|failed).' });
      return;
    }

    const message = markResult(
      db,
      id,
      status as MessageStatus,
      typeof error === 'string' ? error : undefined,
    );
    if (!message) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }

    if (message.webhook_url) {
      void notifyWebhook(message.webhook_url, buildPayload(message), fetchImpl);
    }
    res.json({ ok: true, status: message.status });
  });

  router.post('/inbox', (req, res) => {
    const { from, body } = req.body ?? {};
    if (typeof from !== 'string' || !from.trim() || typeof body !== 'string') {
      res.status(400).json({ error: 'Se requiere "from" y "body".' });
      return;
    }

    const message = recordInbound(db, { from: from.trim(), body });
    res.status(201).json({ id: message.id });
  });

  router.post('/heartbeat', (req, res) => {
    const { batteryLevel, appVersion } = req.body ?? {};
    db.prepare(
      `INSERT INTO device_status (id, last_seen_at, battery_level, app_version)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         battery_level = excluded.battery_level,
         app_version = excluded.app_version`,
    ).run(
      new Date().toISOString(),
      typeof batteryLevel === 'number' ? batteryLevel : null,
      typeof appVersion === 'string' ? appVersion : null,
    );
    res.json({ ok: true });
  });

  return router;
}

/**
 * Handler suelto (no Router) a proposito: se monta como ruta exacta ANTES del
 * middleware del token de dispositivo. Si fuera un Router montado en
 * '/api/device', el auth del dispositivo correria primero y devolveria 401
 * aunque el llamante traiga la API key correcta.
 */
export function deviceStatusHandler(db: Db): RequestHandler {
  return (_req, res) => {
    const row = db.prepare('SELECT * FROM device_status WHERE id = 1').get() as
      | {
          last_seen_at: string | null;
          battery_level: number | null;
          app_version: string | null;
        }
      | undefined;

    if (!row?.last_seen_at) {
      res.json({ online: false, lastSeenAt: null, batteryLevel: null });
      return;
    }

    const age = Date.now() - new Date(row.last_seen_at).getTime();
    res.json({
      online: age < OFFLINE_AFTER_MS,
      lastSeenAt: row.last_seen_at,
      batteryLevel: row.battery_level,
      appVersion: row.app_version,
    });
  };
}
