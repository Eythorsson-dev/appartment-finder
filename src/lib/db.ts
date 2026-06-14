import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'appartments.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (!_db) {
		mkdirSync(DATA_DIR, { recursive: true });
		_db = new Database(DB_PATH);
		_db.exec(`
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
		`);
	}
	return _db;
}
