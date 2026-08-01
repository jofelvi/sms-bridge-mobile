import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import type { Db } from './db.js';

/**
 * Push por FCM (Firebase Cloud Messaging) — canal ADICIONAL al WebSocket.
 *
 * El WebSocket sigue siendo el canal principal cuando el telefono tiene la
 * app en primer plano/servicio activo. FCM cubre lo que el socket no puede:
 * despierta al telefono aunque Android haya dormido el proceso (Doze), porque
 * viaja por la conexion unica que Google Play Services ya mantiene para todo
 * el sistema — costo de bateria ~cero para nuestra app.
 *
 * Es 100% OPCIONAL: sin FCM_SERVICE_ACCOUNT_PATH el modulo queda apagado y
 * el proyecto sigue funcionando solo con WebSocket + polling (quien lo adopte
 * no esta obligado a crear un proyecto Firebase).
 *
 * Sin firebase-admin a proposito: FCM HTTP v1 solo necesita un access token
 * OAuth2 firmado con la clave del service account (RS256 con node:crypto) y
 * un POST. Cero dependencias nuevas.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export class FcmPush {
  private readonly account: ServiceAccount | null = null;
  private accessToken = '';
  private tokenExpiresAt = 0;

  constructor(
    private readonly db: Db,
    serviceAccountPath: string | null,
  ) {
    if (!serviceAccountPath) return;
    try {
      const raw = JSON.parse(readFileSync(serviceAccountPath, 'utf8')) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!raw.project_id || !raw.client_email || !raw.private_key) {
        throw new Error('faltan project_id/client_email/private_key');
      }
      this.account = {
        project_id: raw.project_id,
        client_email: raw.client_email,
        private_key: raw.private_key,
      };
      console.log(`push por FCM habilitado (proyecto ${raw.project_id})`);
    } catch (err) {
      console.error(
        `FCM desactivado: no se pudo leer ${serviceAccountPath}: ${(err as Error).message}`,
      );
    }
  }

  get enabled(): boolean {
    return this.account !== null;
  }

  /** Cuantos telefonos tienen token FCM registrado. */
  get tokenCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM fcm_tokens')
      .get() as { n: number };
    return row.n;
  }

  saveToken(token: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO fcm_tokens (token, created_at, last_seen_at)
         VALUES (?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      )
      .run(token, now, now);
  }

  private deleteToken(token: string): void {
    this.db.prepare('DELETE FROM fcm_tokens WHERE token = ?').run(token);
  }

  /**
   * Access token OAuth2 a partir del service account (cacheado ~55 min).
   * JWT RS256 hecho a mano: header.claims firmados con la private key.
   */
  private async getAccessToken(): Promise<string> {
    if (!this.account) throw new Error('FCM no configurado');
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: SCOPE,
        aud: OAUTH_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const signature = base64url(signer.sign(this.account.private_key));
    const assertion = `${header}.${claims}.${signature}`;

    const res = await fetch(OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(`OAuth ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = json.access_token;
    // 5 min de margen antes del vencimiento real
    this.tokenExpiresAt = Date.now() + (json.expires_in - 300) * 1000;
    return this.accessToken;
  }

  /**
   * Despierta a todos los telefonos registrados. Fire-and-forget: un fallo de
   * FCM jamas afecta el encolado (el WebSocket y el polling siguen ahi).
   */
  notifyNewMessage(): void {
    if (!this.account) return;
    const tokens = this.db
      .prepare('SELECT token FROM fcm_tokens')
      .all() as Array<{ token: string }>;
    if (tokens.length === 0) return;

    void (async () => {
      for (const { token } of tokens) {
        try {
          await this.sendWake(token);
        } catch (err) {
          console.warn(`FCM: fallo al notificar: ${(err as Error).message}`);
        }
      }
    })();
  }

  private async sendWake(token: string): Promise<void> {
    if (!this.account) return;
    const accessToken = await this.getAccessToken();

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            // Solo data (sin notification): no muestra nada al usuario, la app
            // decide que hacer — igual que el mensaje del WebSocket.
            data: { type: 'new-message' },
            android: {
              // HIGH atraviesa Doze: para eso existe este canal.
              priority: 'HIGH',
              // Si el telefono esta apagado 5 min, el mensaje ya no aporta
              // (el polling de respaldo llegara antes) — que caduque.
              ttl: '300s',
              collapse_key: 'new-message',
            },
          },
        }),
      },
    );

    if (res.ok) return;

    const body = await res.text();
    // Token vencido/desinstalado: se limpia solo para no insistir.
    if (res.status === 404 || body.includes('UNREGISTERED')) {
      this.deleteToken(token);
      console.log('FCM: token vencido eliminado');
      return;
    }
    throw new Error(`FCM ${res.status}: ${body.slice(0, 200)}`);
  }
}
