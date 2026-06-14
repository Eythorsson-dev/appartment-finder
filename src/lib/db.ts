import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';

const DEFAULT_DB_PATH = join(process.cwd(), 'data', 'appartments.db');

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS raw_finn_appartments (
		id TEXT PRIMARY KEY,
		html_document TEXT NOT NULL,
		crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS crawl_status (
		id INTEGER PRIMARY KEY DEFAULT 1,
		status TEXT NOT NULL DEFAULT 'idle',
		total INTEGER DEFAULT 0,
		processed INTEGER DEFAULT 0,
		started_at DATETIME,
		finished_at DATETIME,
		error TEXT
	);

	INSERT OR IGNORE INTO crawl_status (id, status) VALUES (1, 'idle');
`;

export function createDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
	mkdirSync(dirname(dbPath), { recursive: true });
	const db = new Database(dbPath);
	db.exec(SCHEMA);
	return db;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (!_db) {
		_db = createDb();
	}
	return _db;
}
