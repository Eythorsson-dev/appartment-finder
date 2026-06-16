import { getDb } from '$lib/db.js';

export function load() {
	const db = getDb();
	const { count } = db
		.prepare('SELECT COUNT(*) as count FROM raw_finn_appartments')
		.get() as { count: number };
	const { last_crawled } = db
		.prepare('SELECT MAX(crawled_at) as last_crawled FROM raw_finn_appartments')
		.get() as { last_crawled: string | null };

	return { count, last_crawled };
}
