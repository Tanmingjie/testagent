import { Database } from 'bun:sqlite';
import { resolve } from 'path';

const dbPath = process.env.DB_PATH || './data/testagent.db';
const db = new Database(dbPath);
db.run('PRAGMA journal_mode = WAL');

db.run(`
  CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    product_line TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    original_steps_json TEXT,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'raw',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES test_cases(id),
    status TEXT NOT NULL DEFAULT 'running',
    summary_json TEXT NOT NULL,
    generated_python_code TEXT,
    fix_prompt TEXT,
    created_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    product_line TEXT NOT NULL UNIQUE,
    config_yaml TEXT,
    updated_at TEXT NOT NULL
  )
`);

db.close();
console.log('Database migrated successfully.');
