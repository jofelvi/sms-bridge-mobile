import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { openDb, migrate } from '../src/db.js';

const baseEnv = {
  API_KEY: 'k-test',
  DEVICE_TOKEN: 'd-test',
  DATABASE_PATH: ':memory:',
};

describe('loadConfig', () => {
  it('falla si falta API_KEY', () => {
    expect(() => loadConfig({ ...baseEnv, API_KEY: '' })).toThrow(/API_KEY/);
  });

  it('falla si API_KEY y DEVICE_TOKEN son iguales', () => {
    expect(() => loadConfig({ ...baseEnv, DEVICE_TOKEN: 'k-test' })).toThrow(
      /distinto/i,
    );
  });

  it('aplica valores por defecto no secretos', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.port).toBe(8080);
    expect(cfg.deviceBatchSize).toBe(10);
    expect(cfg.maxAttempts).toBe(3);
  });
});

describe('migrate', () => {
  it('crea la tabla messages con sus indices', () => {
    const db = openDb(':memory:');
    migrate(db);
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'",
      )
      .get();
    expect(table).toBeTruthy();
  });

  it('es idempotente', () => {
    const db = openDb(':memory:');
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
  });
});
