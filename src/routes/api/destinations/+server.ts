import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db.js';

export async function GET() {
	const db = getDb();
	const destinations = db.prepare('SELECT * FROM destinations ORDER BY name').all();
	return json(destinations);
}

export async function POST({ request }) {
	const { name, address } = await request.json();
	if (!name?.trim() || !address?.trim()) {
		return json({ error: 'Name and address are required' }, { status: 400 });
	}
	const db = getDb();
	const result = db
		.prepare('INSERT INTO destinations (name, address) VALUES (?, ?)')
		.run(name.trim(), address.trim());
	return json(
		{ id: result.lastInsertRowid, name: name.trim(), address: address.trim() },
		{ status: 201 }
	);
}
