import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';

export async function GET() {
	const db = getDb();
	const status = db.prepare('SELECT * FROM travel_time_status WHERE id=1').get();
	return json(status);
}
