import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createDb } from './db.js';

let db: Database.Database;

beforeEach(() => {
	db = createDb(':memory:');
});

afterEach(() => {
	db.close();
});

describe('createDb', () => {
	it('creates raw_finn_appartments table', () => {
		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all() as { name: string }[];
		expect(tables.map((t) => t.name)).toContain('raw_finn_appartments');
	});

	it('creates crawl_status table', () => {
		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all() as { name: string }[];
		expect(tables.map((t) => t.name)).toContain('crawl_status');
	});

	it('seeds crawl_status with idle status', () => {
		const row = db.prepare('SELECT * FROM crawl_status WHERE id = 1').get() as {
			status: string;
			total: number;
			processed: number;
			error: string | null;
		};
		expect(row.status).toBe('idle');
		expect(row.total).toBe(0);
		expect(row.processed).toBe(0);
		expect(row.error).toBeNull();
	});

	it('is idempotent — calling twice does not duplicate the seed row', () => {
		const db2 = createDb(':memory:');
		const rows = db2
			.prepare('SELECT * FROM crawl_status')
			.all() as { id: number }[];
		expect(rows).toHaveLength(1);
		db2.close();
	});

	it('stores and retrieves an apartment by finn id', () => {
		db.prepare('INSERT INTO raw_finn_appartments (id, html_document) VALUES (?, ?)').run(
			'465989057',
			'<html><body>test</body></html>'
		);
		const row = db
			.prepare('SELECT * FROM raw_finn_appartments WHERE id = ?')
			.get('465989057') as { id: string; html_document: string };
		expect(row.id).toBe('465989057');
		expect(row.html_document).toBe('<html><body>test</body></html>');
	});

	it('upserts on duplicate finn id', () => {
		db.prepare('INSERT INTO raw_finn_appartments (id, html_document) VALUES (?, ?)').run(
			'123',
			'<html>v1</html>'
		);
		db.prepare(
			'INSERT OR REPLACE INTO raw_finn_appartments (id, html_document) VALUES (?, ?)'
		).run('123', '<html>v2</html>');

		const rows = db
			.prepare('SELECT * FROM raw_finn_appartments WHERE id = ?')
			.all('123') as { html_document: string }[];
		expect(rows).toHaveLength(1);
		expect(rows[0].html_document).toBe('<html>v2</html>');
	});

	it('tracks crawl progress updates', () => {
		db.prepare(
			`UPDATE crawl_status SET status = 'running', total = 100, processed = 42 WHERE id = 1`
		).run();
		const row = db.prepare('SELECT * FROM crawl_status WHERE id = 1').get() as {
			status: string;
			total: number;
			processed: number;
		};
		expect(row.status).toBe('running');
		expect(row.total).toBe(100);
		expect(row.processed).toBe(42);
	});

	it('stores error message in crawl_status', () => {
		db.prepare(
			`UPDATE crawl_status SET status = 'error', error = 'timeout' WHERE id = 1`
		).run();
		const row = db.prepare('SELECT * FROM crawl_status WHERE id = 1').get() as {
			status: string;
			error: string;
		};
		expect(row.status).toBe('error');
		expect(row.error).toBe('timeout');
	});
});
