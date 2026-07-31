import { Router } from 'express';
import type { Db, MessageDirection, MessageStatus } from '../db.js';
import { enqueue, getById, list } from '../messages.js';

/** Solo la parte del hub que estas rutas necesitan (facilita testear). */
export interface Notifier {
  notifyNewMessage(): number;
}

export function publicRoutes(db: Db, notifier?: Notifier): Router {
  const router = Router();

  router.post('/messages', (req, res) => {
    const { to, body, clientMessageId, webhookUrl } = req.body ?? {};

    if (typeof to !== 'string' || !to.trim()) {
      res.status(400).json({ error: 'El campo "to" es obligatorio.' });
      return;
    }
    if (typeof body !== 'string' || !body.trim()) {
      res.status(400).json({ error: 'El campo "body" es obligatorio.' });
      return;
    }

    const { message, duplicate } = enqueue(db, {
      to: to.trim(),
      body,
      clientMessageId:
        typeof clientMessageId === 'string' ? clientMessageId : undefined,
      webhookUrl: typeof webhookUrl === 'string' ? webhookUrl : undefined,
    });

    // Push: se avisa al telefono en el momento. Solo si es nuevo — reavisar
    // por un duplicado haria trabajar al telefono para nada.
    const pushedTo = duplicate ? 0 : (notifier?.notifyNewMessage() ?? 0);

    // 200 en el duplicado: no se creo nada nuevo, pero no es un error.
    res.status(duplicate ? 200 : 201).json({
      id: message.id,
      status: message.status,
      segments: message.segments,
      duplicate,
      pushedTo,
    });
  });

  router.get('/messages/:id', (req, res) => {
    const message = getById(db, req.params.id);
    if (!message) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }
    res.json(message);
  });

  router.get('/messages', (req, res) => {
    const { status, direction, limit } = req.query;
    res.json({
      messages: list(db, {
        status:
          typeof status === 'string' ? (status as MessageStatus) : undefined,
        direction:
          typeof direction === 'string'
            ? (direction as MessageDirection)
            : undefined,
        limit: typeof limit === 'string' ? Number(limit) : undefined,
      }),
    });
  });

  return router;
}
