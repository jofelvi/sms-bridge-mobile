import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import type { Server } from 'node:http';
import { openDb, migrate, type Db } from '../src/db.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { DeviceHub } from '../src/deviceHub.js';

const config = loadConfig({
  API_KEY: 'api-key',
  DEVICE_TOKEN: 'device-token',
  DATABASE_PATH: ':memory:',
});

let db: Db;
let hub: DeviceHub;
let server: Server;
let port: number;

beforeEach(async () => {
  db = openDb(':memory:');
  migrate(db);
  hub = new DeviceHub();

  await new Promise<void>((resolve) => {
    server = createApp({ db, config, hub }).listen(0, () => {
      const address = server.address();
      port = typeof address === 'object' && address ? address.port : 0;
      resolve();
    });
  });
  hub.attach(server, config.deviceToken);
});

afterEach(async () => {
  hub.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

interface TestClient {
  ws: WebSocket;
  /** Espera un mensaje de ese tipo, contando tambien los ya recibidos. */
  waitFor(type: string, timeoutMs?: number): Promise<void>;
}

/**
 * El listener se adjunta ANTES del open y se bufferiza: el servidor saluda en
 * cuanto se establece el socket, asi que escuchar despues del open pierde el
 * saludo. La app real registra su listener al crear el socket, igual que aqui.
 */
function connect(token: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/device?token=${token}`);
    const seen: string[] = [];
    const waiters = new Map<string, () => void>();

    ws.on('message', (data) => {
      const type = JSON.parse(data.toString()).type as string;
      seen.push(type);
      waiters.get(type)?.();
    });
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) =>
      reject(new Error(`HTTP ${res.statusCode}`)),
    );

    ws.on('open', () =>
      resolve({
        ws,
        waitFor: (type, timeoutMs = 3000) =>
          new Promise<void>((ok, fail) => {
            if (seen.includes(type)) return ok();
            const timer = setTimeout(
              () => fail(new Error(`No llego "${type}"`)),
              timeoutMs,
            );
            waiters.set(type, () => {
              clearTimeout(timer);
              ok();
            });
          }),
      }),
    );
  });
}

describe('DeviceHub', () => {
  it('rechaza el handshake con token invalido', async () => {
    await expect(connect('token-malo')).rejects.toThrow(/401/);
  });

  it('acepta el token correcto y saluda', async () => {
    const client = await connect('device-token');
    await client.waitFor('connected');
    expect(hub.connectedCount).toBe(1);
    client.ws.close();
  });

  it('avisa al telefono en cuanto se encola un mensaje', async () => {
    const client = await connect('device-token');
    const res = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer api-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: '+58414', body: 'push!' }),
    });
    const json = (await res.json()) as { pushedTo: number };

    expect(json.pushedTo).toBe(1);
    await client.waitFor('new-message');
    client.ws.close();
  });

  it('un duplicado NO vuelve a despertar al telefono', async () => {
    const client = await connect('device-token');
    const body = JSON.stringify({
      to: '+58414',
      body: 'push!',
      clientMessageId: 'dup-1',
    });
    const headers = {
      Authorization: 'Bearer api-key',
      'content-type': 'application/json',
    };

    const first = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers,
      body,
    });
    expect(((await first.json()) as { pushedTo: number }).pushedTo).toBe(1);

    const second = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers,
      body,
    });
    expect(((await second.json()) as { pushedTo: number }).pushedTo).toBe(0);
    client.ws.close();
  });

  it('el estado del dispositivo refleja la conexion push', async () => {
    const before = await fetch(`http://localhost:${port}/api/device/status`, {
      headers: { Authorization: 'Bearer api-key' },
    });
    expect(((await before.json()) as { pushConnected: boolean }).pushConnected).toBe(
      false,
    );

    const client = await connect('device-token');
    const after = await fetch(`http://localhost:${port}/api/device/status`, {
      headers: { Authorization: 'Bearer api-key' },
    });
    const json = (await after.json()) as {
      pushConnected: boolean;
      online: boolean;
    };
    expect(json.pushConnected).toBe(true);
    expect(json.online).toBe(true);
    client.ws.close();
  });
});
