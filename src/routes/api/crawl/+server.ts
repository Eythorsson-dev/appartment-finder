import { json } from '@sveltejs/kit';
import { startCrawl, isCrawlRunning, cancelCrawl } from '$lib/crawler.js';

export async function POST() {
	if (isCrawlRunning()) {
		return json({ message: 'Crawl already in progress' }, { status: 409 });
	}
	startCrawl();
	return json({ message: 'Crawl started' }, { status: 202 });
}

export async function DELETE() {
	if (!isCrawlRunning()) {
		return json({ message: 'No crawl in progress' }, { status: 409 });
	}
	cancelCrawl();
	return json({ message: 'Crawl cancelled' });
}
