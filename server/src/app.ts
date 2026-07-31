import express, { type Express } from 'express';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { bearerAuth } from './auth.js';
import { rateLimit } from './rateLimit.js';
import { publicRoutes } from './routes/public.js';
import { deviceRoutes, deviceStatusHandler } from './routes/device.js';
import type { FetchLike } from './webhooks.js';

export interface AppDeps {
  db: Db;
  config: Config;
  fetchImpl?: FetchLike;
  /** Hub de WebSocket. Ausente en los tests que no ejercitan el push. */
  hub?: { notifyNewMessage(): number; connectedCount: number };
}

export function createApp({ db, config, fetchImpl, hub }: AppDeps): Express {
  const app = express();

  // Detras de un proxy con TLS (nginx/Caddy), sin esto todas las peticiones
  // se ven con la IP del proxy y el limitador seria inutil.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // El telefono y el backend usan credenciales distintas a proposito: si se
  // pierde el telefono se revoca su token sin tocar la API key.
  //
  // /status va como ruta EXACTA y antes del router del dispositivo: la consulta
  // el backend con la API key, no el telefono. Montarla dentro del router haria
  // que el auth del dispositivo la rechazara primero.
  app.get(
    '/api/device/status',
    bearerAuth(config.apiKey),
    deviceStatusHandler(db, hub),
  );

  // El telefono consulta seguido (push + respaldo + acuses): tope alto.
  app.use(
    '/api/device',
    rateLimit({ windowMs: 60_000, max: 240 }),
    bearerAuth(config.deviceToken),
    deviceRoutes(db, config, fetchImpl),
  );

  // Encolar SMS cuesta dinero real: tope conservador para que un bug del
  // backend del adoptante no vacie su saldo antes de que lo note.
  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, max: 120 }),
    bearerAuth(config.apiKey),
    publicRoutes(db, hub),
  );

  return app;
}
