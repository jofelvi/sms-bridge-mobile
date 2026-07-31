import type { RequestHandler } from 'express';

/**
 * Limitador por ventana fija, en memoria y sin dependencias.
 *
 * Protege dos cosas distintas:
 *  - Fuerza bruta sobre la API key / token (cada intento fallido cuesta).
 *  - Que un bug en el backend del adoptante encole miles de SMS por error.
 *    Un SMS cuesta dinero real: el limite es una red de seguridad, no un lujo.
 *
 * En memoria a proposito: este servidor es un solo proceso con SQLite. Si algun
 * dia corre replicado, hay que mover el contador a un almacen compartido.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
}): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const key = req.ip ?? 'desconocido';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });

      // Limpieza oportunista: sin esto el Map crece sin tope si el servidor
      // queda expuesto a muchas IPs distintas.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          if (now > v.resetAt) hits.delete(k);
        }
      }
      next();
      return;
    }

    entry.count++;
    if (entry.count > options.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Demasiadas peticiones. Intenta de nuevo en unos segundos.',
      });
      return;
    }
    next();
  };
}
