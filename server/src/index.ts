import { loadConfig } from './config.js';
import { openDb, migrate } from './db.js';
import { createApp } from './app.js';
import { DeviceHub } from './deviceHub.js';
import { FcmPush } from './fcm.js';

const config = loadConfig(process.env);
const db = openDb(config.databasePath);
migrate(db);

const hub = new DeviceHub();
const fcm = new FcmPush(db, config.fcmServiceAccountPath);

// Notificador compuesto: al encolar avisa por TODOS los canales disponibles.
// WebSocket (instantaneo si el socket esta vivo) + FCM (despierta al telefono
// aunque Android lo haya dormido). El polling del telefono sigue de respaldo.
// Drenar la cola es idempotente, asi que recibir varios avisos no duplica.
const notifier = {
  notifyNewMessage(): number {
    const viaSocket = hub.notifyNewMessage();
    fcm.notifyNewMessage();
    return viaSocket;
  },
  get connectedCount(): number {
    return hub.connectedCount;
  },
};

const server = createApp({ db, config, hub: notifier, fcm }).listen(
  config.port,
  () => {
    console.log(`sms-bridge escuchando en el puerto ${config.port}`);
    console.log(`push por WebSocket en /ws/device`);
    if (fcm.enabled) console.log(`push por FCM activo`);
  },
);

hub.attach(server, config.deviceToken);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    hub.close();
    server.close(() => process.exit(0));
  });
}
