import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Comparacion en tiempo constante: no filtra el token por cuanto tarda. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function bearerAuth(expectedToken: string): RequestHandler {
  return (req, res, next) => {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token || !safeEqual(token, expectedToken)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    next();
  };
}
