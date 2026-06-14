import { json } from '@sveltejs/kit';
import { startCrawl, isCrawlRunning } from '$lib/crawler.js';

export async function POST() {
	if (isCrawlRunning()) {
		return json({ message: 'Crawl already in progress' }, { status: 409 });
	}
	startCrawl();
	return json({ message: 'Crawl started' }, { status: 202 });
}
