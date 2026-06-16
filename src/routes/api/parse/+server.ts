import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';
import { parseFinnListing } from '$lib/parser.js';

export async function POST() {
	const db = getDb();

	const rows = (
		db
			.prepare('SELECT id, html_document FROM raw_finn_appartments WHERE deleted_at IS NULL')
			.all() as { id: string; html_document: string }[]
	).filter((r) => !r.html_document.includes('<h1>404</h1>'));

	const insert = db.prepare(`
		INSERT INTO finn_appartments (id, type, listing_url, price, image_urls, address, bedrooms, area, parsed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			type = excluded.type,
			listing_url = excluded.listing_url,
			price = excluded.price,
			image_urls = excluded.image_urls,
			address = excluded.address,
			bedrooms = excluded.bedrooms,
			area = excluded.area,
			parsed_at = CURRENT_TIMESTAMP,
			deleted_at = NULL
	`);

	const validIds = rows.map((r) => r.id);
	const idPlaceholders = validIds.map(() => '?').join(',');

	const parseAll = db.transaction(() => {
		// Soft-delete parsed rows that are now 404s or no longer in raw
		if (validIds.length > 0) {
			db.prepare(
				`UPDATE finn_appartments SET deleted_at = CURRENT_TIMESTAMP
				 WHERE deleted_at IS NULL AND id NOT IN (${idPlaceholders})`
			).run(...validIds);
			// Restore any that have reappeared
			db.prepare(
				`UPDATE finn_appartments SET deleted_at = NULL
				 WHERE deleted_at IS NOT NULL AND id IN (${idPlaceholders})`
			).run(...validIds);
		}

		for (const row of rows) {
			const listing = parseFinnListing(row.id, row.html_document);
			insert.run(
				listing.id,
				listing.type,
				listing.listing_url,
				listing.price,
				JSON.stringify(listing.image_urls),
				listing.address,
				listing.bedrooms,
				listing.area
			);
		}
	});

	parseAll();

	return json({ parsed: rows.length });
}
