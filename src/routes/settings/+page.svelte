<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';

	let { data } = $props();

	type CrawlStatus = {
		status: 'idle' | 'searching' | 'downloading' | 'done' | 'error';
		total: number;
		processed: number;
		started_at: string | null;
		finished_at: string | null;
		error: string | null;
	};

	type TravelTimeStatus = {
		status: 'idle' | 'running' | 'done' | 'error';
		total: number;
		processed: number;
		started_at: string | null;
		finished_at: string | null;
		error: string | null;
	};

	type Destination = { id: number; name: string; address: string };

	// ── Crawl state ──────────────────────────────────────────────────────────────

	let status = $state<CrawlStatus | null>(null);
	let crawlPolling: ReturnType<typeof setInterval> | null = null;
	let phaseStartedAt: number | null = null;
	let phaseStartedProcessed: number = 0;
	let lastPhase: string | null = null;

	async function fetchCrawlStatus() {
		const res = await fetch('/api/crawl/status');
		const next: CrawlStatus = await res.json();
		if (next.status !== lastPhase) {
			phaseStartedAt = Date.now();
			phaseStartedProcessed = next.processed;
			lastPhase = next.status;
		}
		status = next;
	}

	function formatEta(secondsRemaining: number): string {
		if (secondsRemaining < 60) return `${Math.round(secondsRemaining)}s`;
		const m = Math.floor(secondsRemaining / 60);
		const s = Math.round(secondsRemaining % 60);
		return `${m}m ${s}s`;
	}

	function eta(): string | null {
		if (!status || !phaseStartedAt) return null;
		const elapsed = (Date.now() - phaseStartedAt) / 1000;
		const done = status.processed - phaseStartedProcessed;
		if (done <= 0 || elapsed < 2) return null;
		if (status.status === 'downloading' && status.total > 0) {
			const remaining = status.total - status.processed;
			const rate = done / elapsed;
			return formatEta(remaining / rate);
		}
		return null;
	}

	let parseResult = $state<{ parsed: number } | null>(null);
	let parsing = $state(false);

	async function parseListings() {
		parsing = true;
		parseResult = null;
		try {
			const res = await fetch('/api/parse', { method: 'POST' });
			parseResult = await res.json();
		} finally {
			parsing = false;
		}
	}

	async function startCrawl() {
		const res = await fetch('/api/crawl', { method: 'POST' });
		if (res.status === 202) {
			await fetchCrawlStatus();
			startCrawlPolling();
		}
	}

	function isCrawlActive(s: CrawlStatus['status'] | undefined) {
		return s === 'searching' || s === 'downloading';
	}

	function startCrawlPolling() {
		if (crawlPolling) return;
		crawlPolling = setInterval(async () => {
			await fetchCrawlStatus();
			if (!isCrawlActive(status?.status)) stopCrawlPolling();
		}, 2000);
	}

	function stopCrawlPolling() {
		if (crawlPolling) {
			clearInterval(crawlPolling);
			crawlPolling = null;
			if (browser) invalidateAll();
		}
	}

	async function cancelCrawl() {
		await fetch('/api/crawl', { method: 'DELETE' });
		await fetchCrawlStatus();
		stopCrawlPolling();
	}

	// ── Destinations state ────────────────────────────────────────────────────────

	let destinations = $state<Destination[]>(data.destinations);
	let newDestName = $state('');
	let newDestAddress = $state('');
	let addingDest = $state(false);

	async function addDestination(e: SubmitEvent) {
		e.preventDefault();
		if (!newDestName.trim() || !newDestAddress.trim()) return;
		addingDest = true;
		try {
			const res = await fetch('/api/destinations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newDestName.trim(), address: newDestAddress.trim() })
			});
			if (res.ok) {
				const dest = await res.json();
				destinations = [...destinations, dest];
				newDestName = '';
				newDestAddress = '';
			}
		} finally {
			addingDest = false;
		}
	}

	async function removeDestination(id: number) {
		await fetch(`/api/destinations/${id}`, { method: 'DELETE' });
		destinations = destinations.filter((d) => d.id !== id);
	}

	// ── Travel time state ─────────────────────────────────────────────────────────

	let travelStatus = $state<TravelTimeStatus | null>(null);
	let travelPolling: ReturnType<typeof setInterval> | null = null;

	async function fetchTravelStatus() {
		const res = await fetch('/api/travel-time/status');
		travelStatus = await res.json();
	}

	function isTravelActive(s: TravelTimeStatus['status'] | undefined) {
		return s === 'running';
	}

	function startTravelPolling() {
		if (travelPolling) return;
		travelPolling = setInterval(async () => {
			await fetchTravelStatus();
			if (!isTravelActive(travelStatus?.status)) stopTravelPolling();
		}, 2000);
	}

	function stopTravelPolling() {
		if (travelPolling) {
			clearInterval(travelPolling);
			travelPolling = null;
		}
	}

	async function startTravelTime() {
		const res = await fetch('/api/travel-time', { method: 'POST' });
		if (res.status === 202) {
			await fetchTravelStatus();
			startTravelPolling();
		}
	}

	async function cancelTravelTime() {
		await fetch('/api/travel-time', { method: 'DELETE' });
		// Keep polling — the background job finishes its current iteration before stopping,
		// so we let the poll interval detect the 'idle' status and stop itself.
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────────

	onMount(() => {
		fetchCrawlStatus().then(() => {
			if (isCrawlActive(status?.status)) startCrawlPolling();
		});
		fetchTravelStatus().then(() => {
			if (isTravelActive(travelStatus?.status)) startTravelPolling();
		});
	});

	onDestroy(() => {
		stopCrawlPolling();
		stopTravelPolling();
	});
</script>

<main>
	<h1>Settings</h1>

	<section>
		<h2>Data Collection</h2>

		<div class="summary">
			<span><strong>{data.count}</strong> listings in database</span>
			{#if data.last_crawled}
				<span class="muted">Last downloaded {new Date(data.last_crawled + 'Z').toLocaleString()}</span>
			{:else}
				<span class="muted">Never downloaded</span>
			{/if}
		</div>

		<div class="actions">
			<button onclick={startCrawl} disabled={isCrawlActive(status?.status)}>
				{isCrawlActive(status?.status) ? 'Crawling…' : 'Crawl Finn.no'}
			</button>
			{#if isCrawlActive(status?.status)}
				<button class="cancel" onclick={cancelCrawl}>Cancel</button>
			{/if}
			<button onclick={parseListings} disabled={parsing}>
				{parsing ? 'Parsing…' : 'Parse Finn.no listings'}
			</button>
		</div>

		{#if parseResult}
			<p class="success">{parseResult.parsed} listings parsed.</p>
		{/if}

		{#if status && status.status !== 'idle'}
			<div class="status">
				{#if status.status === 'searching'}
					<p>Searching pages: <strong>{status.processed}</strong> pages found so far…</p>
					<p class="muted">Discovering listing pages…</p>
				{/if}

				{#if status.status === 'downloading'}
					<p>
						Downloading listings: <strong>{status.processed}</strong> /
						<strong>{status.total}</strong>
					</p>
					<progress value={status.processed} max={status.total}></progress>
					{#if eta()}
						<p class="muted">~{eta()} remaining</p>
					{/if}
				{/if}

				{#if status.status === 'done'}
					<p class="success">Done — {status.processed} listings saved.</p>
				{/if}

				{#if status.status === 'error'}
					<p class="error">Error: {status.error}</p>
				{/if}
			</div>
		{/if}
	</section>

	<section>
		<h2>Destinations</h2>

		<form class="dest-form" onsubmit={addDestination}>
			<input
				type="text"
				bind:value={newDestName}
				placeholder="Name (e.g. Work)"
				required
				disabled={addingDest}
			/>
			<input
				type="text"
				bind:value={newDestAddress}
				placeholder="Address"
				required
				disabled={addingDest}
			/>
			<button type="submit" disabled={addingDest}>Add</button>
		</form>

		{#if destinations.length}
			<ul class="dest-list">
				{#each destinations as dest (dest.id)}
					<li>
						<div class="dest-info">
							<strong>{dest.name}</strong>
							<span class="muted">{dest.address}</span>
						</div>
						<button class="remove" onclick={() => removeDestination(dest.id)}>Remove</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">No destinations added yet.</p>
		{/if}
	</section>

	<section>
		<h2>Travel Times</h2>

		<div class="summary">
			{#if data.destinations.length === 0}
				<span class="muted">Add destinations above to enable travel time fetching.</span>
			{:else}
				<span><strong>{data.fetched_count}</strong> / <strong>{data.total_pairs}</strong> pairs fetched</span>
				{#if data.missing_count > 0}
					<span class="muted">{data.missing_count} missing across {data.apt_count} addresses and {data.destinations.length} destination{data.destinations.length !== 1 ? 's' : ''}</span>
				{:else}
					<span class="muted">All pairs up to date</span>
				{/if}
			{/if}
		</div>

		<div class="actions">
			<button onclick={startTravelTime} disabled={isTravelActive(travelStatus?.status)}>
				{isTravelActive(travelStatus?.status) ? 'Fetching…' : 'Get travel time'}
			</button>
			{#if isTravelActive(travelStatus?.status)}
				<button class="cancel" onclick={cancelTravelTime}>Cancel</button>
			{/if}
		</div>

		{#if travelStatus && travelStatus.status !== 'idle'}
			<div class="status">
				{#if travelStatus.status === 'running'}
					{#if travelStatus.total > 0}
						<p>
							Fetching travel times: <strong>{travelStatus.processed}</strong> /
							<strong>{travelStatus.total}</strong>
						</p>
						<progress value={travelStatus.processed} max={travelStatus.total}></progress>
					{:else}
						<p class="muted">Preparing…</p>
					{/if}
				{/if}

				{#if travelStatus.status === 'done'}
					<p class="success">Done — {travelStatus.processed} travel times fetched.</p>
				{/if}

				{#if travelStatus.status === 'error'}
					<p class="error">Error: {travelStatus.error}</p>
				{/if}
			</div>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 720px;
		margin: 3rem auto;
		padding: 0 1.5rem;
		font-family: system-ui, sans-serif;
	}

	h1 {
		font-size: 1.75rem;
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.1rem;
		margin-bottom: 1rem;
		color: #444;
	}

	section {
		margin-bottom: 2.5rem;
	}

	.summary {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 1.25rem;
		font-size: 0.95rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	button {
		padding: 0.6rem 1.4rem;
		font-size: 1rem;
		background: #0066cc;
		color: #fff;
		border: none;
		border-radius: 6px;
		cursor: pointer;
	}

	button:disabled {
		background: #999;
		cursor: not-allowed;
	}

	button.cancel {
		background: #fff;
		color: #c00;
		border: 1px solid #c00;
	}

	button.cancel:hover {
		background: #fff0f0;
	}

	button.remove {
		padding: 0.3rem 0.8rem;
		font-size: 0.85rem;
		background: #fff;
		color: #c00;
		border: 1px solid #c00;
	}

	button.remove:hover {
		background: #fff0f0;
	}

	.status {
		margin-top: 1.25rem;
		padding: 1rem 1.25rem;
		background: #f5f7fa;
		border-radius: 6px;
		font-size: 0.95rem;
	}

	progress {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		height: 8px;
		border-radius: 4px;
	}

	.success {
		color: #1a7a1a;
	}

	.error {
		color: #c00;
	}

	.muted {
		color: #888;
		font-style: italic;
	}

	.dest-form {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.dest-form input {
		padding: 0.55rem 0.8rem;
		font-size: 0.95rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		flex: 1;
		min-width: 140px;
	}

	.dest-form button {
		flex-shrink: 0;
	}

	.dest-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.dest-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		background: #f5f7fa;
		border-radius: 6px;
		font-size: 0.95rem;
	}

	.dest-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
</style>
