import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockStartCrawl = vi.fn();
const mockIsCrawlRunning = vi.fn();

vi.mock('$lib/crawler.js', () => ({
	startCrawl: mockStartCrawl,
	isCrawlRunning: mockIsCrawlRunning
}));

describe('POST /api/crawl', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetModules();
	});

	it('returns 202 and starts crawl when not already running', async () => {
		mockIsCrawlRunning.mockReturnValue(false);
		const { POST } = await import('./+server.js');

		const response = await POST({} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(202);
		expect(mockStartCrawl).toHaveBeenCalledTimes(1);
		const body = await response.json();
		expect(body.message).toMatch(/started/i);
	});

	it('returns 409 and does not call startCrawl when already running', async () => {
		mockIsCrawlRunning.mockReturnValue(true);
		const { POST } = await import('./+server.js');

		const response = await POST({} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(409);
		expect(mockStartCrawl).not.toHaveBeenCalled();
	});
});
