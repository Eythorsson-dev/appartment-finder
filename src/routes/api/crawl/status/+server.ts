import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';

export function GET() {
	const db = getDb();
	const status = db.prepare('SELECT * FROM crawl_status WHERE id = 1').get();
	return json(status);
}
