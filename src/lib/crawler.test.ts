import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

// ---- module-level mocks (hoisted by vitest) ----

let testDb: Database.Database;

vi.mock('./db.js', () => ({
	getDb: () => testDb
}));

const mockPage = {
	goto: vi.fn().mockResolvedValue(null),
	$$eval: vi.fn(),
	$eval: vi.fn(),
	content: vi.fn().mockResolvedValue('<html>listing</html>'),
	close: vi.fn().mockResolvedValue(null)
};

const mockContext = {
	newPage: vi.fn().mockResolvedValue(mockPage)
};

const mockBrowser = {
	newContext: vi.fn().mockResolvedValue(mockContext),
	close: vi.fn().mockResolvedValue(null)
};

vi.mock('playwright', () => ({
	chromium: {
		launch: vi.fn().mockResolvedValue(mockBrowser)
	}
}));

// ---- helpers ----

const SCHEMA = `
	CREATE TABLE raw_finn_appartments (
		id TEXT PRIMARY KEY,
		html_document TEXT NOT NULL,
		crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
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

function getStatus() {
	return testDb.prepare('SELECT * FROM crawl_status WHERE id = 1').get() as {
		status: string;
		total: number;
		processed: number;
		error: string | null;
	};
}

function getApartments() {
	return testDb.prepare('SELECT * FROM raw_finn_appartments').all() as {
		id: string;
		html_document: string;
	}[];
}

// ---- tests ----

describe('crawler', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.clearAllMocks();

		testDb = new Database(':memory:');
		testDb.exec(SCHEMA);

		// Default: first search page returns two codes, second returns none (stops pagination)
		mockPage.$$eval
			.mockResolvedValueOnce(['111111111', '222222222'])
			.mockResolvedValue([]);
		// No next-page link
		mockPage.$eval.mockRejectedValue(new Error('no element'));
	});

	afterEach(async () => {
		const { resetCrawlState } = await import('./crawler.js');
		resetCrawlState();
		testDb.close();
		vi.useRealTimers();
	});

	it('is not running initially', async () => {
		const { isCrawlRunning } = await import('./crawler.js');
		expect(isCrawlRunning()).toBe(false);
	});

	it('sets crawlRunning to true synchronously when started', async () => {
		const { startCrawl, isCrawlRunning } = await import('./crawler.js');
		startCrawl();
		expect(isCrawlRunning()).toBe(true);
		await vi.runAllTimersAsync();
	});

	it('is a no-op when already running', async () => {
		const { chromium } = await import('playwright');
		const { startCrawl } = await import('./crawler.js');

		startCrawl();
		startCrawl(); // second call should be ignored

		await vi.runAllTimersAsync();

		expect(vi.mocked(chromium.launch)).toHaveBeenCalledTimes(1);
	});

	it('sets status to running in the DB when started', async () => {
		const { startCrawl } = await import('./crawler.js');
		startCrawl();
		expect(getStatus().status).toBe('running');
		await vi.runAllTimersAsync();
	});

	it('saves found listings to raw_finn_appartments', async () => {
		const { startCrawl } = await import('./crawler.js');
		startCrawl();
		await vi.runAllTimersAsync();

		const rows = getApartments();
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(['111111111', '222222222']));
		expect(rows[0].html_document).toBe('<html>listing</html>');
	});

	it('sets status to done after successful crawl', async () => {
		const { startCrawl } = await import('./crawler.js');
		startCrawl();
		await vi.runAllTimersAsync();

		const status = getStatus();
		expect(status.status).toBe('done');
		expect(status.processed).toBe(2);
		expect(status.total).toBe(2);
	});

	it('sets crawlRunning to false after completion', async () => {
		const { startCrawl, isCrawlRunning } = await import('./crawler.js');
		startCrawl();
		await vi.runAllTimersAsync();
		expect(isCrawlRunning()).toBe(false);
	});

	it('sets status to error and clears crawlRunning when browser throws', async () => {
		const { chromium } = await import('playwright');
		vi.mocked(chromium.launch).mockRejectedValueOnce(new Error('launch failed'));

		const { startCrawl, isCrawlRunning } = await import('./crawler.js');
		startCrawl();
		await vi.runAllTimersAsync();

		const status = getStatus();
		expect(status.status).toBe('error');
		expect(status.error).toBe('launch failed');
		expect(isCrawlRunning()).toBe(false);
	});
});
