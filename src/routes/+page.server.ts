import { getDb } from '$lib/db.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const minPrice = url.searchParams.get('minPrice');
	const maxPrice = url.searchParams.get('maxPrice');
	const reactions = url.searchParams.getAll('reaction').filter((r) => ['like', 'dislike', 'none'].includes(r));
	const bedroomsMin = url.searchParams.get('bedroomsMin');
	const bedroomsMax = url.searchParams.get('bedroomsMax');

	const db = getDb();

	const destinations = db
		.prepare('SELECT id, name FROM destinations ORDER BY name')
		.all() as { id: number; name: string }[];

	// Parse per-destination travel time filters (URL values in minutes, stored as seconds)
	const travelTimeFilters = destinations
		.map((d) => ({
			id: d.id,
			name: d.name,
			min: url.searchParams.get(`tt_min_${d.id}`),
			max: url.searchParams.get(`tt_max_${d.id}`)
		}))
		.filter((f) => f.min || f.max);

	const conditions = ['a.deleted_at IS NULL'];
	const params: (number | string | null)[] = [];

	if (minPrice) { conditions.push('a.price >= ?'); params.push(Number(minPrice)); }
	if (maxPrice) { conditions.push('a.price <= ?'); params.push(Number(maxPrice)); }
	if (reactions.length > 0) {
		const clauses: string[] = [];
		const explicit = reactions.filter((r) => r !== 'none');
		if (explicit.length > 0) {
			clauses.push(`r.reaction IN (${explicit.map(() => '?').join(', ')})`);
			params.push(...explicit);
		}
		if (reactions.includes('none')) clauses.push('r.reaction IS NULL');
		conditions.push(`(${clauses.join(' OR ')})`);
	}
	if (bedroomsMin) { conditions.push('a.bedrooms >= ?'); params.push(Number(bedroomsMin)); }
	if (bedroomsMax) { conditions.push('a.bedrooms <= ?'); params.push(Number(bedroomsMax)); }

	for (const f of travelTimeFilters) {
		const inner = ['tt.appartment_address = a.address', 'tt.destination_id = ?'];
		const innerParams: number[] = [f.id];
		if (f.min) { inner.push('tt.duration_seconds >= ?'); innerParams.push(Number(f.min) * 60); }
		if (f.max) { inner.push('tt.duration_seconds <= ?'); innerParams.push(Number(f.max) * 60); }
		conditions.push(`EXISTS (SELECT 1 FROM travel_times tt WHERE ${inner.join(' AND ')})`);
		params.push(...innerParams);
	}

	const rows = db
		.prepare(
			`SELECT a.id, a.listing_url, a.price, a.image_urls, a.address, a.bedrooms, a.area, r.reaction
       FROM finn_appartments a
       LEFT JOIN reactions r ON r.appartment_id = a.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.parsed_at DESC`
		)
		.all(...params) as {
		id: string;
		listing_url: string | null;
		price: number | null;
		image_urls: string;
		address: string | null;
		bedrooms: number | null;
		area: number | null;
		reaction: 'like' | 'dislike' | null;
	}[];

	const travelTimeRows = db
		.prepare(
			`SELECT tt.appartment_address, d.name as destination_name, tt.duration_seconds
			 FROM travel_times tt
			 JOIN destinations d ON d.id = tt.destination_id
			 WHERE tt.duration_seconds IS NOT NULL`
		)
		.all() as { appartment_address: string; destination_name: string; duration_seconds: number }[];

	const travelTimesByAddress = new Map<string, { name: string; duration_seconds: number }[]>();
	for (const row of travelTimeRows) {
		const list = travelTimesByAddress.get(row.appartment_address) ?? [];
		list.push({ name: row.destination_name, duration_seconds: row.duration_seconds });
		travelTimesByAddress.set(row.appartment_address, list);
	}

	const listings = rows.map((r) => ({
		...r,
		image_urls: JSON.parse(r.image_urls) as string[],
		reaction: r.reaction ?? null,
		travel_times: r.address ? (travelTimesByAddress.get(r.address) ?? []) : []
	}));

	return {
		listings,
		destinations,
		filters: {
			minPrice: minPrice ? Number(minPrice) : null,
			maxPrice: maxPrice ? Number(maxPrice) : null,
			reactions,
			bedroomsMin: bedroomsMin ? Number(bedroomsMin) : null,
			bedroomsMax: bedroomsMax ? Number(bedroomsMax) : null,
			travelTime: Object.fromEntries(
				travelTimeFilters.map((f) => [f.id, { min: f.min ? Number(f.min) : null, max: f.max ? Number(f.max) : null }])
			) as Record<number, { min: number | null; max: number | null }>
		}
	};
};
