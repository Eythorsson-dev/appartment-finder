import { chromium } from 'playwright';
import { getDb } from './db.js';

const SEARCH_BASE = 'https://www.finn.no/realestate/lettings/search.html?location=0.20061';
const LISTING_BASE = 'https://www.finn.no/realestate/lettings/ad.html?finnkode=';
const DELAY_MS = 80;

let crawlRunning = false;
let crawlCancelled = false;

export function isCrawlRunning(): boolean {
	return crawlRunning;
}

export function cancelCrawl(): void {
	crawlCancelled = true;
}

export function resetCrawlState(): void {
	crawlRunning = false;
	crawlCancelled = false;
}

export function startCrawl(): void {
	if (crawlRunning) return;
	crawlRunning = true;

	crawlCancelled = false;
	const db = getDb();
	db.prepare(
		`UPDATE crawl_status
		 SET status = 'searching', total = 0, processed = 0,
		     started_at = CURRENT_TIMESTAMP, finished_at = NULL, error = NULL
		 WHERE id = 1`
	).run();

	runCrawl().catch((err) => {
		console.error('Crawl failed:', err);
		getDb()
			.prepare(
				`UPDATE crawl_status
				 SET status = 'error', error = ?, finished_at = CURRENT_TIMESTAMP
				 WHERE id = 1`
			)
			.run(String(err?.message ?? err));
		crawlRunning = false;
	});
}

async function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function runCrawl(): Promise<void> {
	const db = getDb();
	const browser = await chromium.launch({ headless: true });

	try {
		const context = await browser.newContext({
			userAgent:
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
			viewport: { width: 1280, height: 800 }
		});

		// Phase 1: collect all finn codes from search result pages
		const finnCodes = new Set<string>();
		let pageNum = 1;

		while (!crawlCancelled) {
			const pageUrl = `${SEARCH_BASE}&page=${pageNum}`;
			const page = await context.newPage();
			await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

			const codes = await page.$$eval('a[href*="finnkode="]', (els) =>
				els
					.map((el) => {
						const match = (el.getAttribute('href') ?? '').match(/finnkode=(\d+)/);
						return match?.[1] ?? null;
					})
					.filter((c): c is string => c !== null)
			);

			await page.close();

			if (codes.length === 0) break;

			codes.forEach((c) => finnCodes.add(c));
			db.prepare('UPDATE crawl_status SET processed = ? WHERE id = 1').run(pageNum);
			pageNum++;
			await sleep(DELAY_MS);
		}

		if (crawlCancelled) {
			db.prepare(
				`UPDATE crawl_status SET status = 'idle', finished_at = CURRENT_TIMESTAMP WHERE id = 1`
			).run();
			return;
		}

		const codesArray = Array.from(finnCodes);
		db.prepare(
			`UPDATE crawl_status SET status = 'downloading', total = ?, processed = 0 WHERE id = 1`
		).run(codesArray.length);
		console.log(`Found ${codesArray.length} listings, fetching HTML…`);

		// Phase 2: fetch each listing page and store HTML
		const insert = db.prepare(
			'INSERT OR REPLACE INTO raw_finn_appartments (id, html_document) VALUES (?, ?)'
		);

		for (let i = 0; i < codesArray.length && !crawlCancelled; i++) {
			const finnCode = codesArray[i];
			const page = await context.newPage();
			try {
				await page.goto(`${LISTING_BASE}${finnCode}`, {
					waitUntil: 'domcontentloaded',
					timeout: 30_000
				});
				const html = await page.content();
				insert.run(finnCode, html);
				db.prepare('UPDATE crawl_status SET processed = ? WHERE id = 1').run(i + 1);
			} catch (err) {
				console.warn(`Skipping listing ${finnCode}:`, err);
			} finally {
				await page.close();
			}

			await sleep(DELAY_MS);
		}

		if (crawlCancelled) {
			db.prepare(
				`UPDATE crawl_status SET status = 'idle', finished_at = CURRENT_TIMESTAMP WHERE id = 1`
			).run();
			return;
		}

		db.prepare(
			`UPDATE crawl_status SET status = 'done', finished_at = CURRENT_TIMESTAMP WHERE id = 1`
		).run();
		console.log('Crawl complete.');
	} finally {
		await browser.close();
		crawlRunning = false;
	}
}
