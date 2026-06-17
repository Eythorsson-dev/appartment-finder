import { getDb } from '$lib/db.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const minPrice = url.searchParams.get('minPrice');
	const maxPrice = url.searchParams.get('maxPrice');
	const reaction = url.searchParams.get('reaction'); // 'like' | 'dislike' | 'none' | null

	const db = getDb();

	const conditions = ['deleted_at IS NULL'];
	const params: (number | string | null)[] = [];

	if (minPrice) { conditions.push('price >= ?'); params.push(Number(minPrice)); }
	if (maxPrice) { conditions.push('price <= ?'); params.push(Number(maxPrice)); }
	if (reaction === 'like' || reaction === 'dislike') {
		conditions.push('reaction = ?');
		params.push(reaction);
	} else if (reaction === 'none') {
		conditions.push('reaction IS NULL');
	}

	const rows = db
		.prepare(
			`SELECT id, listing_url, price, image_urls, address, bedrooms, area, reaction
       FROM finn_appartments
       WHERE ${conditions.join(' AND ')}
       ORDER BY parsed_at DESC`
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

	const listings = rows.map((r) => ({
		...r,
		image_urls: JSON.parse(r.image_urls) as string[],
		reaction: r.reaction ?? null
	}));

	return {
		listings,
		filters: {
			minPrice: minPrice ? Number(minPrice) : null,
			maxPrice: maxPrice ? Number(maxPrice) : null,
			reaction: (reaction === 'like' || reaction === 'dislike' || reaction === 'none') ? reaction : null
		}
	};
};
