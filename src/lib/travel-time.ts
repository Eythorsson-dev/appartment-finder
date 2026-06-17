import { getDb } from './db.js';

const NOMINATIM_RATE_LIMIT_MS = 100;

let running = false;
let cancelled = false;

export function isTravelTimeRunning() {
	return running;
}

export function cancelTravelTime() {
	cancelled = true;
}

function resetState() {
	running = false;
	cancelled = false;
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
	const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'appartment-finder/1.0 (s.eythorsson@gmail.com)' }
		});
		const data = await res.json();
		if (!data.length) return null;
		return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
	} catch {
		return null;
	}
}

async function getTransitDuration(
	from: { lat: number; lon: number },
	to: { lat: number; lon: number }
): Promise<number | null> {
	const query = `{
		trip(
			from: { coordinates: { latitude: ${from.lat}, longitude: ${from.lon} } }
			to: { coordinates: { latitude: ${to.lat}, longitude: ${to.lon} } }
			numTripPatterns: 1
		) {
			tripPatterns {
				duration
			}
		}
	}`;

	try {
		const res = await fetch('https://api.entur.io/journey-planner/v3/graphql', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'ET-Client-Name': 'appartment-finder'
			},
			body: JSON.stringify({ query })
		});
		const data = await res.json();
		const patterns = data?.data?.trip?.tripPatterns;
		if (!patterns?.length) return null;
		return patterns[0].duration;
	} catch {
		return null;
	}
}

export function startTravelTime() {
	running = true;
	cancelled = false;

	const db = getDb();
	db.prepare(
		`UPDATE travel_time_status SET status='running', total=0, processed=0, started_at=CURRENT_TIMESTAMP, finished_at=NULL, error=NULL WHERE id=1`
	).run();

	runTravelTime().catch((err) => {
		console.error('Travel time error:', err);
		getDb()
			.prepare(
				`UPDATE travel_time_status SET status='error', error=?, finished_at=CURRENT_TIMESTAMP WHERE id=1`
			)
			.run(String(err?.message ?? err));
		resetState();
	});
}

async function runTravelTime() {
	const db = getDb();

	const apartments = db
		.prepare(
			`SELECT DISTINCT address FROM finn_appartments WHERE address IS NOT NULL AND deleted_at IS NULL`
		)
		.all() as { address: string }[];

	const destinations = db
		.prepare(`SELECT id, name, address FROM destinations`)
		.all() as { id: number; name: string; address: string }[];

	if (!destinations.length || !apartments.length) {
		db.prepare(
			`UPDATE travel_time_status SET status='done', finished_at=CURRENT_TIMESTAMP WHERE id=1`
		).run();
		resetState();
		return;
	}

	// Pre-geocode destinations (rate-limited: 1 req/sec for Nominatim)
	const destCoords = new Map<number, { lat: number; lon: number } | null>();
	for (const dest of destinations) {
		if (cancelled) break;
		destCoords.set(dest.id, await geocode(dest.address));
		await sleep(NOMINATIM_RATE_LIMIT_MS);
	}

	// Build pairs that still need fetching
	const pairs: Array<{ appartmentAddress: string; destinationId: number }> = [];
	for (const apt of apartments) {
		for (const dest of destinations) {
			const existing = db
				.prepare(
					`SELECT id FROM travel_times WHERE appartment_address=? AND destination_id=?`
				)
				.get(apt.address, dest.id);
			if (!existing) {
				pairs.push({ appartmentAddress: apt.address, destinationId: dest.id });
			}
		}
	}

	db.prepare(`UPDATE travel_time_status SET total=? WHERE id=1`).run(pairs.length);

	// Process pairs — cache apartment geocoding to avoid redundant calls
	const aptCoordCache = new Map<string, { lat: number; lon: number } | null>();
	let processed = 0;

	for (const pair of pairs) {
		if (cancelled) break;

		let aptCoord: { lat: number; lon: number } | null;
		if (aptCoordCache.has(pair.appartmentAddress)) {
			aptCoord = aptCoordCache.get(pair.appartmentAddress)!;
		} else {
			aptCoord = await geocode(pair.appartmentAddress);
			aptCoordCache.set(pair.appartmentAddress, aptCoord);
			await sleep(NOMINATIM_RATE_LIMIT_MS);
		}

		const destCoord = destCoords.get(pair.destinationId) ?? null;
		let duration: number | null = null;

		if (aptCoord && destCoord) {
			duration = await getTransitDuration(aptCoord, destCoord);
		}

		db.prepare(
			`INSERT OR IGNORE INTO travel_times (appartment_address, destination_id, duration_seconds) VALUES (?, ?, ?)`
		).run(pair.appartmentAddress, pair.destinationId, duration);

		processed++;
		db.prepare(`UPDATE travel_time_status SET processed=? WHERE id=1`).run(processed);
	}

	const finalStatus = cancelled ? 'idle' : 'done';
	db.prepare(
		`UPDATE travel_time_status SET status=?, finished_at=CURRENT_TIMESTAMP WHERE id=1`
	).run(finalStatus);
	resetState();
}
