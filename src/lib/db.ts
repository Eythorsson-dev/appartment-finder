import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';

const DEFAULT_DB_PATH = join(process.cwd(), 'data', 'appartments.db');

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS raw_finn_appartments (
		id TEXT PRIMARY KEY,
		html_document TEXT NOT NULL,
		crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		deleted_at DATETIME DEFAULT NULL
	);

	CREATE TABLE IF NOT EXISTS finn_appartments (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		listing_url TEXT,
		price INTEGER,
		image_urls TEXT NOT NULL DEFAULT '[]',
		address TEXT,
		bedrooms INTEGER,
		area INTEGER,
		parsed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		deleted_at DATETIME DEFAULT NULL
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

	CREATE TABLE IF NOT EXISTS destinations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		address TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS travel_times (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		appartment_address TEXT NOT NULL,
		destination_id INTEGER NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
		duration_seconds INTEGER,
		fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(appartment_address, destination_id)
	);

	CREATE TABLE IF NOT EXISTS travel_time_status (
		id INTEGER PRIMARY KEY DEFAULT 1,
		status TEXT NOT NULL DEFAULT 'idle',
		total INTEGER DEFAULT 0,
		processed INTEGER DEFAULT 0,
		started_at DATETIME,
		finished_at DATETIME,
		error TEXT
	);

	INSERT OR IGNORE INTO travel_time_status (id, status) VALUES (1, 'idle');
`;

const MIGRATIONS = [
	`ALTER TABLE raw_finn_appartments ADD COLUMN deleted_at DATETIME DEFAULT NULL`,
	`ALTER TABLE finn_appartments ADD COLUMN listing_url TEXT`,
	`ALTER TABLE finn_appartments ADD COLUMN deleted_at DATETIME DEFAULT NULL`,
	`ALTER TABLE finn_appartments ADD COLUMN reaction TEXT DEFAULT NULL`
];

export function createDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
	mkdirSync(dirname(dbPath), { recursive: true });
	const db = new Database(dbPath);
	db.exec(SCHEMA);
	for (const migration of MIGRATIONS) {
		try {
			db.exec(migration);
		} catch {
			// column already exists
		}
	}
	// Reset any in-progress status left over from a previous server process
	db.exec(`
		UPDATE crawl_status SET status='idle', finished_at=CURRENT_TIMESTAMP WHERE id=1 AND status IN ('searching', 'downloading');
		UPDATE travel_time_status SET status='idle', finished_at=CURRENT_TIMESTAMP WHERE id=1 AND status='running';
	`);
	return db;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (!_db) {
		_db = createDb();
	}
	return _db;
}
