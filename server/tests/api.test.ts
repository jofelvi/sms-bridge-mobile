import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb, migrate, type Db } from '../src/db.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({
  API_KEY: 'api-key',
  DEVICE_TOKEN: 'device-token',
  DATABASE_PATH: ':memory:',
});

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  app = createApp({ db, config });
});

const asClient = (r: request.Test) => r.set('Authorization', 'Bearer api-key');
const asDevice = (r: request.Test) =>
  r.set('Authorization', 'Bearer device-token');

describe('POST /api/messages', () => {
  it('encola y responde 201', async () => {
    const res = await asClient(request(app).post('/api/messages'))
      .send({ to: '+584141234567', body: 'hola' })
      .expect(201);
    expect(res.body.status).toBe('queued');
    expect(res.body.id).toBeTruthy();
  });

  it('valida que to y body sean obligatorios', async () => {
    await asClient(request(app).post('/api/messages'))
      .send({ to: '' })
      .expect(400);
  });

  it('el token del dispositivo NO puede encolar mensajes', async () => {
    await asDevice(request(app).post('/api/messages'))
      .send({ to: '+58414', body: 'hola' })
      .expect(401);
  });

  it('el mismo clientMessageId responde 200 y no duplica', async () => {
    const body = { to: '+58414', body: 'hola', clientMessageId: 'x-1' };
    await asClient(request(app).post('/api/messages')).send(body).expect(201);
    const second = await asClient(request(app).post('/api/messages'))
      .send(body)
      .expect(200);
    expect(second.body.duplicate).toBe(true);
  });
});

describe('flujo completo con el dispositivo', () => {
  it('encolar -> el telefono lo reclama -> confirma entrega', async () => {
    const created = await asClient(request(app).post('/api/messages'))
      .send({ to: '+58414', body: 'hola' })
      .expect(201);
    const id = created.body.id as string;

    const pending = await asDevice(
      request(app).get('/api/device/pending'),
    ).expect(200);
    expect(pending.body.messages).toHaveLength(1);
    expect(pending.body.messages[0].id).toBe(id);

    await asDevice(request(app).post('/api/device/result'))
      .send({ id, status: 'delivered' })
      .expect(200);

    const detail = await asClient(
      request(app).get(`/api/messages/${id}`),
    ).expect(200);
    expect(detail.body.status).toBe('delivered');
  });

  it('la API key NO puede consultar la cola del dispositivo', async () => {
    await asClient(request(app).get('/api/device/pending')).expect(401);
  });

  it('el telefono sube un SMS entrante y aparece en el listado', async () => {
    await asDevice(request(app).post('/api/device/inbox'))
      .send({ from: '+584149999999', body: 'PAGUE' })
      .expect(201);

    const res = await asClient(
      request(app).get('/api/messages?direction=inbound'),
    ).expect(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].body).toBe('PAGUE');
  });

  it('heartbeat deja al dispositivo como visto', async () => {
    await asDevice(request(app).post('/api/device/heartbeat'))
      .send({ batteryLevel: 80, appVersion: '0.1.0' })
      .expect(200);

    const res = await asClient(
      request(app).get('/api/device/status'),
    ).expect(200);
    expect(res.body.online).toBe(true);
    expect(res.body.batteryLevel).toBe(80);
  });
});

describe('GET /health', () => {
  it('responde sin autenticacion', async () => {
    await request(app).get('/health').expect(200);
  });
});
