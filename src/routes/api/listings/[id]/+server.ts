import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { reaction } = await request.json();

	if (reaction !== 'like' && reaction !== 'dislike' && reaction !== null) {
		error(400, 'reaction must be "like", "dislike", or null');
	}

	const db = getDb();
	const result = db
		.prepare('UPDATE finn_appartments SET reaction = ? WHERE id = ? AND deleted_at IS NULL')
		.run(reaction, params.id);

	if (result.changes === 0) {
		error(404, 'Listing not found');
	}

	return json({ ok: true });
};
