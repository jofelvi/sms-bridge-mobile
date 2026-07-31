import type { MessageRow } from './db.js';

export interface WebhookPayload {
  id: string;
  direction: string;
  phoneNumber: string;
  body: string;
  status: string;
  error: string | null;
  segments: number;
  updatedAt: string;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean }>;

const MAX_TRIES = 3;

export function buildPayload(message: MessageRow): WebhookPayload {
  return {
    id: message.id,
    direction: message.direction,
    phoneNumber: message.phone_number,
    body: message.body,
    status: message.status,
    error: message.error,
    segments: message.segments,
    updatedAt: message.updated_at,
  };
}

/**
 * Entrega el webhook con reintentos. Nunca lanza: un webhook caido del
 * adoptante no puede tumbar el envio de SMS. El estado siempre queda
 * consultable por la API aunque el webhook falle.
 */
export async function notifyWebhook(
  url: string,
  payload: WebhookPayload,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
    } catch {
      // se reintenta abajo
    }
  }
  return false;
}
