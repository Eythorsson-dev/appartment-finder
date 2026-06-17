import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';

export async function DELETE({ params }) {
	const db = getDb();
	db.prepare('DELETE FROM destinations WHERE id=?').run(params.id);
	return json({ ok: true });
}
