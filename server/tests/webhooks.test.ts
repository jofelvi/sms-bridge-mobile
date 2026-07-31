import { describe, it, expect, vi } from 'vitest';
import { notifyWebhook, buildPayload } from '../src/webhooks.js';
import type { MessageRow } from '../src/db.js';

const message: MessageRow = {
  id: 'm-1',
  direction: 'outbound',
  phone_number: '+584141234567',
  body: 'hola',
  status: 'delivered',
  client_message_id: null,
  error: null,
  segments: 1,
  attempts: 1,
  webhook_url: null,
  created_at: '2026-07-27T00:00:00.000Z',
  updated_at: '2026-07-27T00:00:01.000Z',
};

describe('buildPayload', () => {
  it('expone los campos utiles sin filtrar columnas internas', () => {
    const payload = buildPayload(message);
    expect(payload).toEqual({
      id: 'm-1',
      direction: 'outbound',
      phoneNumber: '+584141234567',
      body: 'hola',
      status: 'delivered',
      error: null,
      segments: 1,
      updatedAt: '2026-07-27T00:00:01.000Z',
    });
  });
});

describe('notifyWebhook', () => {
  it('devuelve true cuando el destino responde ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const ok = await notifyWebhook(
      'https://x.test/hook',
      buildPayload(message),
      fetchImpl,
    );
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reintenta y devuelve false si nunca responde ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
    const ok = await notifyWebhook(
      'https://x.test/hook',
      buildPayload(message),
      fetchImpl,
    );
    expect(ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('no revienta si el destino lanza una excepcion', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('sin red'));
    await expect(
      notifyWebhook('https://x.test/hook', buildPayload(message), fetchImpl),
    ).resolves.toBe(false);
  });
});
