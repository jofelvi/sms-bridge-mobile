export interface Config {
  port: number;
  apiKey: string;
  deviceToken: string;
  databasePath: string;
  deviceBatchSize: number;
  maxAttempts: number;
  /**
   * Ruta al service account de Firebase para el push por FCM. OPCIONAL:
   * sin ella el servidor funciona igual (WebSocket + polling); con ella
   * ademas despierta al telefono aunque Android lo tenga dormido.
   */
  fcmServiceAccountPath: string | null;
}

function requireVar(env: NodeJS.ProcessEnv, name: string): string {
  const value = (env[name] ?? '').trim();
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`,
    );
  }
  return value;
}

function numberVar(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = (env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`La variable ${name} debe ser un número positivo.`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const apiKey = requireVar(env, 'API_KEY');
  const deviceToken = requireVar(env, 'DEVICE_TOKEN');

  // Si fueran iguales, quien tenga el telefono podria encolar mensajes.
  if (apiKey === deviceToken) {
    throw new Error('DEVICE_TOKEN debe ser distinto de API_KEY.');
  }

  return {
    port: numberVar(env, 'PORT', 8080),
    apiKey,
    deviceToken,
    databasePath: (env.DATABASE_PATH ?? './data/sms-bridge.db').trim(),
    deviceBatchSize: numberVar(env, 'DEVICE_BATCH_SIZE', 10),
    maxAttempts: numberVar(env, 'MAX_ATTEMPTS', 3),
    fcmServiceAccountPath:
      (env.FCM_SERVICE_ACCOUNT_PATH ?? '').trim() || null,
  };
}
