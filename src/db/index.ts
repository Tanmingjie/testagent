import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

const dbPath = process.env.DB_PATH || './data/testagent.db';
const sqlite = new Database(dbPath);
sqlite.run('PRAGMA journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export { schema };
