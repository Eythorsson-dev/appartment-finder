import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('$lib/db.js', () => ({
	getDb: () => testDb
}));

const SCHEMA = `
	CREATE TABLE crawl_status (
		id INTEGER PRIMARY KEY DEFAULT 1,
		status TEXT NOT NULL DEFAULT 'idle',
		total INTEGER DEFAULT 0,
		processed INTEGER DEFAULT 0,
		started_at DATETIME,
		finished_at DATETIME,
		error TEXT
	);
	INSERT INTO crawl_status (id, status) VALUES (1, 'idle');
`;

describe('GET /api/crawl/status', () => {
	beforeEach(() => {
		testDb = new Database(':memory:');
		testDb.exec(SCHEMA);
	});

	afterEach(() => {
		testDb.close();
		vi.resetModules();
	});

	it('returns the current crawl_status row', async () => {
		const { GET } = await import('./+server.js');
		const response = await GET({} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.id).toBe(1);
		expect(body.status).toBe('idle');
		expect(body.total).toBe(0);
		expect(body.processed).toBe(0);
	});

	it('reflects status updates in the DB', async () => {
		testDb
			.prepare(
				`UPDATE crawl_status
				 SET status = 'running', total = 80, processed = 30
				 WHERE id = 1`
			)
			.run();

		const { GET } = await import('./+server.js');
		const response = await GET({} as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(body.status).toBe('running');
		expect(body.total).toBe(80);
		expect(body.processed).toBe(30);
	});

	it('returns error details when crawl failed', async () => {
		testDb
			.prepare(
				`UPDATE crawl_status SET status = 'error', error = 'timeout' WHERE id = 1`
			)
			.run();

		const { GET } = await import('./+server.js');
		const response = await GET({} as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(body.status).toBe('error');
		expect(body.error).toBe('timeout');
	});
});
