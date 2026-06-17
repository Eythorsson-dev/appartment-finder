import { getDb } from '$lib/db.js';

export function load() {
	const db = getDb();
	const { count } = db
		.prepare('SELECT COUNT(*) as count FROM raw_finn_appartments')
		.get() as { count: number };
	const { last_crawled } = db
		.prepare('SELECT MAX(crawled_at) as last_crawled FROM raw_finn_appartments')
		.get() as { last_crawled: string | null };
	const destinations = db
		.prepare('SELECT * FROM destinations ORDER BY name')
		.all() as { id: number; name: string; address: string }[];

	const { apt_count } = db
		.prepare(
			`SELECT COUNT(DISTINCT address) as apt_count FROM finn_appartments WHERE address IS NOT NULL AND deleted_at IS NULL`
		)
		.get() as { apt_count: number };

	const { fetched_count } = db
		.prepare(`SELECT COUNT(*) as fetched_count FROM travel_times`)
		.get() as { fetched_count: number };

	const total_pairs = apt_count * destinations.length;
	const missing_count = total_pairs - fetched_count;

	return { count, last_crawled, destinations, apt_count, fetched_count, total_pairs, missing_count };
}
