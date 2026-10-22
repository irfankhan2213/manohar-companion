import { createApp } from './app.js';
import { initDatabase } from './db/database.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const DB_PATH = process.env.DB_PATH || 'manohar.sqlite';

console.log(`[Manohar Server] Initializing SQLite database at ${DB_PATH}...`);
initDatabase(DB_PATH);

const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Manohar Server] API server running on http://0.0.0.0:${PORT}`);
  console.log(`[Manohar Server] Health check: http://localhost:${PORT}/api/health`);
});
