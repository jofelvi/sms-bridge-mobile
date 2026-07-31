import { loadConfig } from './config.js';
import { openDb, migrate } from './db.js';
import { createApp } from './app.js';

const config = loadConfig(process.env);
const db = openDb(config.databasePath);
migrate(db);

createApp({ db, config }).listen(config.port, () => {
  console.log(`sms-bridge escuchando en el puerto ${config.port}`);
});
