import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { reaction } = await request.json();

	if (reaction !== 'like' && reaction !== 'dislike' && reaction !== null) {
		error(400, 'reaction must be "like", "dislike", or null');
	}

	const db = getDb();

	const listing = db
		.prepare('SELECT id FROM finn_appartments WHERE id = ? AND deleted_at IS NULL')
		.get(params.id);
	if (!listing) error(404, 'Listing not found');

	if (reaction === null) {
		db.prepare('DELETE FROM reactions WHERE appartment_id = ?').run(params.id);
	} else {
		db.prepare('INSERT OR REPLACE INTO reactions (appartment_id, reaction) VALUES (?, ?)')
			.run(params.id, reaction);
	}

	return json({ ok: true });
};
