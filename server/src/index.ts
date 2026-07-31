import { loadConfig } from './config.js';
import { openDb, migrate } from './db.js';
import { createApp } from './app.js';
import { DeviceHub } from './deviceHub.js';

const config = loadConfig(process.env);
const db = openDb(config.databasePath);
migrate(db);

const hub = new DeviceHub();
const server = createApp({ db, config, hub }).listen(config.port, () => {
  console.log(`sms-bridge escuchando en el puerto ${config.port}`);
  console.log(`push por WebSocket en /ws/device`);
});

hub.attach(server, config.deviceToken);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    hub.close();
    server.close(() => process.exit(0));
  });
}
