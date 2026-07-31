import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { bearerAuth } from '../src/auth.js';

function appWith(token: string) {
  const app = express();
  app.get('/protegido', bearerAuth(token), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('bearerAuth', () => {
  it('rechaza sin cabecera', async () => {
    await request(appWith('secreto')).get('/protegido').expect(401);
  });

  it('rechaza con token equivocado', async () => {
    await request(appWith('secreto'))
      .get('/protegido')
      .set('Authorization', 'Bearer otro')
      .expect(401);
  });

  it('acepta el token correcto', async () => {
    const res = await request(appWith('secreto'))
      .get('/protegido')
      .set('Authorization', 'Bearer secreto')
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
