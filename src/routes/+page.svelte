<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { data } = $props();

	type Reaction = 'like' | 'dislike' | null;
	type Listing = typeof data.listings[number];

	const initialReactions = Object.fromEntries(data.listings.map((l) => [l.id, l.reaction]));
	let reactions = $state<Record<string, Reaction>>(initialReactions);

	let modal = $state<{ listing: Listing; index: number } | null>(null);

	function formatPriceInput(value: string): string {
		const n = parseInt(value.replace(/\s/g, ''), 10);
		return isNaN(n) ? '' : n.toLocaleString('nb-NO');
	}

	function parsePriceInput(value: string): string {
		return value.replace(/\s/g, '');
	}

	let minPrice = $state<string>(data.filters.minPrice ? formatPriceInput(String(data.filters.minPrice)) : '');
	let maxPrice = $state<string>(data.filters.maxPrice ? formatPriceInput(String(data.filters.maxPrice)) : '');
	let reactionFilter = $state<string[]>(data.filters.reactions ?? []);
	let bedroomsMin = $state<string>(data.filters.bedroomsMin?.toString() ?? '');
	let bedroomsMax = $state<string>(data.filters.bedroomsMax?.toString() ?? '');
	let travelTimeFilters = $state<Record<number, { min: string; max: string }>>(
		Object.fromEntries(
			data.destinations.map((d) => [
				d.id,
				{
					min: data.filters.travelTime[d.id]?.min?.toString() ?? '',
					max: data.filters.travelTime[d.id]?.max?.toString() ?? ''
				}
			])
		)
	);

	function formatDuration(seconds: number): string {
		const m = Math.round(seconds / 60);
		if (m < 60) return `${m} min`;
		const h = Math.floor(m / 60);
		const rem = m % 60;
		return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
	}

	function formatPrice(price: number | null): string {
		if (price == null) return 'Price on request';
		return price.toLocaleString('nb-NO') + ' kr';
	}

	async function setReaction(id: string, value: Reaction, e?: MouseEvent) {
		e?.stopPropagation();
		const next = reactions[id] === value ? null : value;
		reactions[id] = next;
		await fetch(`/api/listings/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reaction: next })
		});
	}

	function applyFilters() {
		const params = new URLSearchParams($page.url.searchParams);
		const rawMin = parsePriceInput(minPrice);
		const rawMax = parsePriceInput(maxPrice);
		if (rawMin) params.set('minPrice', rawMin); else params.delete('minPrice');
		if (rawMax) params.set('maxPrice', rawMax); else params.delete('maxPrice');
		params.delete('reaction');
		for (const r of reactionFilter) params.append('reaction', r);
		if (bedroomsMin) params.set('bedroomsMin', bedroomsMin); else params.delete('bedroomsMin');
		if (bedroomsMax) params.set('bedroomsMax', bedroomsMax); else params.delete('bedroomsMax');
		for (const d of data.destinations) {
			const f = travelTimeFilters[d.id];
			if (f?.min) params.set(`tt_min_${d.id}`, f.min); else params.delete(`tt_min_${d.id}`);
			if (f?.max) params.set(`tt_max_${d.id}`, f.max); else params.delete(`tt_max_${d.id}`);
		}
		goto(`?${params}`, { replaceState: true, invalidateAll: true });
	}

	function openModal(listing: Listing) {
		if (listing.image_urls.length === 0) return;
		modal = { listing, index: 0 };
	}

	function closeModal() { modal = null; }

	function prev() {
		if (!modal) return;
		modal.index = (modal.index - 1 + modal.listing.image_urls.length) % modal.listing.image_urls.length;
	}

	function next() {
		if (!modal) return;
		modal.index = (modal.index + 1) % modal.listing.image_urls.length;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!modal) return;
		if (e.key === 'ArrowRight') next();
		else if (e.key === 'ArrowLeft') prev();
		else if (e.key === 'Escape') closeModal();
	}

	$effect(() => {
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

<main>
	<header>
		<h1>Listings</h1>
		<span class="count">{data.listings.length} found</span>
		<a href="/settings" class="settings-link">Settings</a>
	</header>

	<form class="filters" onsubmit={(e) => { e.preventDefault(); applyFilters(); }}>
		<div class="filter-row">
			<div class="filter-group">
				<label for="minPrice">Min price</label>
				<input
					id="minPrice"
					type="text"
					inputmode="numeric"
					placeholder="0"
					bind:value={minPrice}
					onfocus={() => (minPrice = parsePriceInput(minPrice))}
					onblur={() => (minPrice = formatPriceInput(minPrice))}
				/>
			</div>
			<div class="filter-group">
				<label for="maxPrice">Max price</label>
				<input
					id="maxPrice"
					type="text"
					inputmode="numeric"
					placeholder="Any"
					bind:value={maxPrice}
					onfocus={() => (maxPrice = parsePriceInput(maxPrice))}
					onblur={() => (maxPrice = formatPriceInput(maxPrice))}
				/>
			</div>
			<div class="filter-group">
				<label>Reaction</label>
				<div class="checkbox-group">
					<label class="checkbox-label"><input type="checkbox" bind:group={reactionFilter} value="like" /> 👍</label>
					<label class="checkbox-label"><input type="checkbox" bind:group={reactionFilter} value="dislike" /> 👎</label>
					<label class="checkbox-label"><input type="checkbox" bind:group={reactionFilter} value="none" /> None</label>
				</div>
			</div>
			<div class="filter-separator"></div>
			<div class="filter-group">
				<label>Bedrooms</label>
				<div class="range-inputs">
					<input type="number" min="0" placeholder="Min" bind:value={bedroomsMin} />
					<span class="range-sep">–</span>
					<input type="number" min="0" placeholder="Max" bind:value={bedroomsMax} />
				</div>
			</div>
		</div>
		{#if data.destinations.length > 0}
			<div class="filter-row">
				{#each data.destinations as dest}
					<div class="filter-group">
						<label>🚌 {dest.name} (min)</label>
						<div class="range-inputs">
							<input type="number" min="0" placeholder="Min" bind:value={travelTimeFilters[dest.id].min} />
							<span class="range-sep">–</span>
							<input type="number" min="0" placeholder="Max" bind:value={travelTimeFilters[dest.id].max} />
						</div>
					</div>
				{/each}
			</div>
		{/if}
		<button type="submit" class="apply-btn">Apply</button>
	</form>

	{#if data.listings.length === 0}
		<p class="empty">No listings match your filters.</p>
	{:else}
		<div class="grid">
			{#each data.listings as listing (listing.id)}
				<div class="card">
					<button class="card-body" onclick={() => openModal(listing)}>
						<div class="image-wrap">
							{#if listing.image_urls.length > 0}
								<img src={listing.image_urls[0]} alt={listing.address ?? 'Listing'} loading="lazy" />
								{#if listing.image_urls.length > 1}
									<span class="photo-count">📷 {listing.image_urls.length}</span>
								{/if}
							{:else}
								<div class="no-image">No image</div>
							{/if}
						</div>
						<div class="info">
							<p class="price">{formatPrice(listing.price)}</p>

							{#if listing.bedrooms != null || listing.area != null}
								<p class="meta">
									{#if listing.bedrooms != null}{listing.bedrooms} bed{/if}
									{#if listing.bedrooms != null && listing.area != null} · {/if}
									{#if listing.area != null}{listing.area} m²{/if}
								</p>
							{/if}
							{#if listing.travel_times.length > 0}
								<div class="travel-times">
									{#each listing.travel_times as t}
										<p>🚌 {t.name}: {formatDuration(t.duration_seconds)}</p>
									{/each}
								</div>
							{/if}
						</div>
					</button>
					<div class="reactions">
						<button
							class="reaction-btn like"
							class:active={reactions[listing.id] === 'like'}
							onclick={(e) => setReaction(listing.id, 'like', e)}
							aria-label="Like"
						>👍</button>
						<button
							class="reaction-btn dislike"
							class:active={reactions[listing.id] === 'dislike'}
							onclick={(e) => setReaction(listing.id, 'dislike', e)}
							aria-label="Dislike"
						>👎</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>

{#if modal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={closeModal}>
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<button class="close-btn" onclick={closeModal} aria-label="Close">✕</button>

			<div class="modal-image-wrap">
				<img src={modal.listing.image_urls[modal.index]} alt={modal.listing.address ?? 'Listing'} />
				{#if modal.listing.image_urls.length > 1}
					<button class="nav prev" onclick={prev} aria-label="Previous">‹</button>
					<button class="nav next" onclick={next} aria-label="Next">›</button>
					<span class="modal-count">{modal.index + 1} / {modal.listing.image_urls.length}</span>
				{/if}
			</div>

			<div class="modal-info">
				<div class="modal-details">
					<p class="modal-price">{formatPrice(modal.listing.price)}</p>
					<p class="modal-address">{modal.listing.address ?? 'Unknown address'}</p>
					{#if modal.listing.bedrooms != null || modal.listing.area != null}
						<p class="modal-meta">
							{#if modal.listing.bedrooms != null}{modal.listing.bedrooms} bed{/if}
							{#if modal.listing.bedrooms != null && modal.listing.area != null} · {/if}
							{#if modal.listing.area != null}{modal.listing.area} m²{/if}
						</p>
					{/if}
					{#if modal.listing.travel_times.length > 0}
						<div class="modal-travel-times">
							{#each modal.listing.travel_times as t}
								<span class="modal-travel-time">🚌 {t.name}: {formatDuration(t.duration_seconds)}</span>
							{/each}
						</div>
					{/if}
				</div>
				<div class="modal-actions">
					<button
						class="reaction-btn like"
						class:active={reactions[modal.listing.id] === 'like'}
						onclick={() => modal && setReaction(modal.listing.id, 'like')}
						aria-label="Like"
					>👍</button>
					<button
						class="reaction-btn dislike"
						class:active={reactions[modal.listing.id] === 'dislike'}
						onclick={() => modal && setReaction(modal.listing.id, 'dislike')}
						aria-label="Dislike"
					>👎</button>
					{#if modal.listing.listing_url}
						<a href={modal.listing.listing_url} target="_blank" rel="noopener noreferrer" class="finn-link">
							View on Finn.no ↗
						</a>
					{/if}
				</div>
			</div>

			{#if modal.listing.image_urls.length > 1}
				<div class="thumbnails">
					{#each modal.listing.image_urls as url, i}
						<button
							class="thumb"
							class:active={i === modal.index}
							onclick={() => { if (modal) modal.index = i; }}
							aria-label="Photo {i + 1}"
						>
							<img src={url} alt="Photo {i + 1}" loading="lazy" />
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		font-family: system-ui, sans-serif;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	h1 { font-size: 1.75rem; margin: 0; }
	.count { color: #888; font-size: 0.95rem; }

	.settings-link {
		margin-left: auto;
		color: #0066cc;
		font-size: 0.9rem;
		text-decoration: none;
	}
	.settings-link:hover { text-decoration: underline; }

	/* Filters */
	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 2rem;
		padding: 1rem 1.25rem;
		background: #f5f7fa;
		border-radius: 8px;
	}

	.filter-row {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.filter-group label {
		font-size: 0.75rem;
		color: #666;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.filter-group input:not([type='checkbox']),
	.filter-group select {
		padding: 0.45rem 0.7rem;
		font-size: 0.95rem;
		font-family: system-ui, sans-serif;
		border: 1.5px solid #ddd;
		border-radius: 6px;
		background: #fff;
		min-width: 120px;
	}

	.filter-group input:focus,
	.filter-group select:focus {
		outline: none;
		border-color: #0066cc;
	}

	.checkbox-group {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.45rem 0;
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		font-size: 0.95rem;
		cursor: pointer;
		user-select: none;
	}
	.checkbox-label input[type='checkbox'] {
		margin: 0;
	}

	.filter-separator {
		width: 1px;
		height: 2rem;
		background: #ddd;
		align-self: flex-end;
		margin-bottom: 0.45rem;
	}

	.range-inputs {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.range-inputs input {
		width: 72px;
		min-width: unset;
	}
	.range-sep {
		color: #aaa;
		font-size: 0.85rem;
	}

	.apply-btn {
		padding: 0.45rem 1.2rem;
		font-size: 0.95rem;
		font-family: system-ui, sans-serif;
		background: #0066cc;
		color: #fff;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		align-self: flex-end;
	}
	.apply-btn:hover { background: #0052a3; }

	.empty { color: #666; font-size: 1rem; }

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		background: #fff;
		transition: box-shadow 0.15s, transform 0.15s;
	}
	.card:hover {
		box-shadow: 0 6px 20px rgba(0,0,0,0.15);
		transform: translateY(-2px);
	}

	.card-body {
		display: flex;
		flex-direction: column;
		text-align: left;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex: 1;
		font-family: system-ui, sans-serif;
	}

	.image-wrap {
		width: 100%;
		aspect-ratio: 4 / 3;
		background: #f0f0f0;
		overflow: hidden;
		position: relative;
	}
	.image-wrap img { width: 100%; height: 100%; object-fit: cover; }

	.photo-count {
		position: absolute;
		bottom: 0.5rem;
		right: 0.6rem;
		background: rgba(0,0,0,0.55);
		color: #fff;
		font-size: 0.75rem;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
	}

	.no-image {
		width: 100%; height: 100%;
		display: flex; align-items: center; justify-content: center;
		color: #aaa; font-size: 0.85rem;
	}

	.info {
		padding: 0.9rem 1rem 0.5rem;
		display: flex; flex-direction: column; gap: 0.25rem;
	}
	.price { font-size: 1.15rem; font-weight: 700; margin: 0; color: #111; }
	.address { font-size: 0.9rem; color: #444; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.meta { font-size: 0.8rem; color: #888; margin: 0; }
	.travel-times { display: flex; flex-direction: column; gap: 0.1rem; }
	.travel-times p { font-size: 0.8rem; color: #555; margin: 0; }

	.reactions {
		display: flex;
		gap: 0.5rem;
		padding: 0.6rem 1rem 0.75rem;
	}

	.reaction-btn {
		flex: 1;
		padding: 0.4rem 0;
		font-size: 1.2rem;
		border: 1.5px solid #e0e0e0;
		border-radius: 6px;
		background: #fafafa;
		cursor: pointer;
		transition: background 0.1s, border-color 0.1s;
	}
	.reaction-btn:hover { background: #f0f0f0; }
	.reaction-btn.like.active { background: #e8f5e9; border-color: #4caf50; }
	.reaction-btn.dislike.active { background: #fce4ec; border-color: #e91e63; }

	/* Modal */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}

	.modal {
		background: #fff;
		border-radius: 12px;
		overflow: hidden;
		max-width: 860px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		position: relative;
		font-family: system-ui, sans-serif;
	}

	.close-btn {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 10;
		background: rgba(0,0,0,0.5);
		color: #fff;
		border: none;
		border-radius: 50%;
		width: 2rem;
		height: 2rem;
		font-size: 1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.close-btn:hover { background: rgba(0,0,0,0.75); }

	.modal-image-wrap {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: #111;
		overflow: hidden;
		flex-shrink: 0;
	}
	.modal-image-wrap img { width: 100%; height: 100%; object-fit: contain; }

	.nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(0,0,0,0.45);
		color: #fff;
		border: none;
		font-size: 2rem;
		line-height: 1;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		border-radius: 4px;
		transition: background 0.1s;
	}
	.nav:hover { background: rgba(0,0,0,0.7); }
	.nav.prev { left: 0.75rem; }
	.nav.next { right: 0.75rem; }

	.modal-count {
		position: absolute;
		bottom: 0.6rem;
		right: 0.75rem;
		background: rgba(0,0,0,0.55);
		color: #fff;
		font-size: 0.8rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}

	.modal-info {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.85rem 1.25rem;
		border-bottom: 1px solid #f0f0f0;
		gap: 1rem;
	}
	.modal-details { display: flex; flex-direction: column; gap: 0.1rem; }
	.modal-price { font-size: 1.2rem; font-weight: 700; margin: 0; color: #111; }
	.modal-address { font-size: 0.9rem; color: #555; margin: 0; }
	.modal-meta { font-size: 0.85rem; color: #888; margin: 0; }
	.modal-travel-times { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.4rem; }
	.modal-travel-time { font-size: 0.85rem; color: #555; background: #f0f4f8; padding: 0.2rem 0.55rem; border-radius: 4px; }

	.modal-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.modal-actions .reaction-btn {
		flex: none;
		width: 2.5rem;
		padding: 0.35rem 0;
	}

	.finn-link {
		flex-shrink: 0;
		color: #0066cc;
		font-size: 0.9rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.finn-link:hover { text-decoration: underline; }

	.thumbnails {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		overflow-x: auto;
	}

	.thumb {
		flex-shrink: 0;
		width: 72px;
		height: 54px;
		border-radius: 5px;
		overflow: hidden;
		border: 2px solid transparent;
		padding: 0;
		cursor: pointer;
		transition: border-color 0.1s;
		background: none;
	}
	.thumb.active { border-color: #0066cc; }
	.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
