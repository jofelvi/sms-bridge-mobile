import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate, type Db } from '../src/db.js';
import {
  countSegments,
  enqueue,
  claimPending,
  markResult,
  recordInbound,
  getById,
  list,
} from '../src/messages.js';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
});

describe('countSegments', () => {
  it('cuenta 1 segmento hasta 160 caracteres', () => {
    expect(countSegments('hola')).toBe(1);
    expect(countSegments('a'.repeat(160))).toBe(1);
  });

  it('cuenta 2 segmentos a partir de 161', () => {
    expect(countSegments('a'.repeat(161))).toBe(2);
  });

  it('un cuerpo vacio sigue siendo 1 segmento', () => {
    expect(countSegments('')).toBe(1);
  });
});

describe('enqueue', () => {
  it('encola un mensaje en estado queued', () => {
    const { message, duplicate } = enqueue(db, {
      to: '+584141234567',
      body: 'hola',
    });
    expect(duplicate).toBe(false);
    expect(message.status).toBe('queued');
    expect(message.direction).toBe('outbound');
    expect(message.phone_number).toBe('+584141234567');
    expect(message.segments).toBe(1);
  });

  it('con el mismo clientMessageId NO crea un segundo mensaje', () => {
    const first = enqueue(db, {
      to: '+584141234567',
      body: 'hola',
      clientMessageId: 'abc-123',
    });
    const second = enqueue(db, {
      to: '+584141234567',
      body: 'hola',
      clientMessageId: 'abc-123',
    });
    expect(second.duplicate).toBe(true);
    expect(second.message.id).toBe(first.message.id);
    expect(list(db, {})).toHaveLength(1);
  });
});

describe('claimPending', () => {
  it('devuelve los queued y los pasa a sent incrementando attempts', () => {
    enqueue(db, { to: '+58414', body: 'uno' });
    enqueue(db, { to: '+58414', body: 'dos' });

    const claimed = claimPending(db, 10);
    expect(claimed).toHaveLength(2);

    // Ya reclamados: una segunda consulta no los vuelve a entregar.
    expect(claimPending(db, 10)).toHaveLength(0);
    expect(getById(db, claimed[0]!.id)!.attempts).toBe(1);
  });

  it('respeta el limite', () => {
    enqueue(db, { to: '+58414', body: 'uno' });
    enqueue(db, { to: '+58414', body: 'dos' });
    expect(claimPending(db, 1)).toHaveLength(1);
  });

  it('no entrega mensajes entrantes', () => {
    recordInbound(db, { from: '+58414', body: 'respuesta' });
    expect(claimPending(db, 10)).toHaveLength(0);
  });
});

describe('markResult', () => {
  it('marca delivered', () => {
    const { message } = enqueue(db, { to: '+58414', body: 'hola' });
    claimPending(db, 10);
    const updated = markResult(db, message.id, 'delivered');
    expect(updated!.status).toBe('delivered');
  });

  it('marca failed con motivo', () => {
    const { message } = enqueue(db, { to: '+58414', body: 'hola' });
    claimPending(db, 10);
    const updated = markResult(db, message.id, 'failed', 'sin senal');
    expect(updated!.status).toBe('failed');
    expect(updated!.error).toBe('sin senal');
  });

  it('devuelve null si el id no existe', () => {
    expect(markResult(db, 'no-existe', 'delivered')).toBeNull();
  });
});

describe('recordInbound', () => {
  it('guarda el SMS entrante como received', () => {
    const msg = recordInbound(db, { from: '+584149999999', body: 'PAGUE' });
    expect(msg.direction).toBe('inbound');
    expect(msg.status).toBe('received');
    expect(msg.phone_number).toBe('+584149999999');
  });
});

describe('list', () => {
  it('filtra por direccion', () => {
    enqueue(db, { to: '+58414', body: 'saliente' });
    recordInbound(db, { from: '+58414', body: 'entrante' });
    expect(list(db, { direction: 'inbound' })).toHaveLength(1);
  });
});
