export type FinnListing = {
	id: string;
	type: 'rent' | 'buy';
	listing_url: string | null;
	price: number | null;
	image_urls: string[];
	address: string | null;
	bedrooms: number | null;
	area: number | null;
};

function extractTestIdValue(html: string, testId: string): string | null {
	const pattern = new RegExp(`data-testid="${testId}"[^>]*>[\\s\\S]*?<dd[^>]*>([^<]+)<\\/dd>`, 'i');
	const match = html.match(pattern);
	return match ? match[1].replace(/&nbsp;/g, ' ').trim() : null;
}

export function parseFinnListing(id: string, html: string): FinnListing {
	const type = html.includes('/lettings/') ? 'rent' : 'buy';

	const listing_url =
		html.match(/property="og:url"\s+content="([^"]+)"/)?.[1] ??
		html.match(/content="([^"]+)"\s+property="og:url"/)?.[1] ??
		null;

	const address =
		html.match(/data-testid="object-address"[^>]*>([^<]+)<\/span>/)?.[1]?.trim() ??
		html.match(/Åpne kart for ([^"]+)"/)?.[1]?.trim() ??
		null;

	const priceRaw = extractTestIdValue(html, 'pricing-common-monthly-cost');
	const price = priceRaw ? parseInt(priceRaw.replace(/\D/g, ''), 10) || null : null;

	const areaRaw = extractTestIdValue(html, 'info-primary-area');
	const area = areaRaw ? parseInt(areaRaw.replace(/\D/g, ''), 10) || null : null;

	const bedroomsRaw = extractTestIdValue(html, 'info-bedrooms');
	const bedrooms = bedroomsRaw ? parseInt(bedroomsRaw.replace(/\D/g, ''), 10) || null : null;

	const seen = new Set<string>();
	const image_urls: string[] = [];
	const imgTagPattern = /<img[^>]*alt="Galleribilde"[^>]*>/gi;
	let imgMatch: RegExpExecArray | null;
	while ((imgMatch = imgTagPattern.exec(html)) !== null) {
		const tag = imgMatch[0];
		const srcsetAttr = tag.match(/data-srcset="([^"]+)"/)?.[1] ?? tag.match(/srcset="([^"]+)"/)?.[1];
		if (!srcsetAttr) continue;
		const url1280 = srcsetAttr.match(/(https:\/\/images\.finncdn\.no\/dynamic\/1280w\/[^\s,]+)/)?.[1];
		if (url1280 && !seen.has(url1280)) {
			seen.add(url1280);
			image_urls.push(url1280);
		}
	}

	return { id, type, listing_url, price, image_urls, address, bedrooms, area };
}
