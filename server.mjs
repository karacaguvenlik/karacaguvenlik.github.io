import { createServer } from 'node:http';
import { openDatabase, seedMenu, bootstrapOwner } from './lib/db.mjs';
import { createApp } from './lib/app.mjs';

const db = openDatabase();
try {
  await seedMenu(db, new URL('./data/menu.json', import.meta.url));
  await bootstrapOwner(db);
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}

const app = createApp({ db });
const server = createServer(app);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => console.log(`Çıtır Pizza server listening on http://${host}:${port}`));

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
