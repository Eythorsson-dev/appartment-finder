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

	let status = $state<CrawlStatus | null>(null);
	let polling: ReturnType<typeof setInterval> | null = null;
	let phaseStartedAt: number | null = null;
	let phaseStartedProcessed: number = 0;
	let lastPhase: string | null = null;

	async function fetchStatus() {
		const res = await fetch('/api/crawl/status');
		const next: CrawlStatus = await res.json();

		// Reset ETA tracking when phase changes
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

	async function startCrawl() {
		const res = await fetch('/api/crawl', { method: 'POST' });
		if (res.status === 202) {
			await fetchStatus();
			startPolling();
		}
	}

	function isActive(s: CrawlStatus['status'] | undefined) {
		return s === 'searching' || s === 'downloading';
	}

	function startPolling() {
		if (polling) return;
		polling = setInterval(async () => {
			await fetchStatus();
			if (!isActive(status?.status)) stopPolling();
		}, 2000);
	}

	function stopPolling() {
		if (polling) {
			clearInterval(polling);
			polling = null;
			if (browser) invalidateAll();
		}
	}

	async function cancelCrawl() {
		await fetch('/api/crawl', { method: 'DELETE' });
		await fetchStatus();
		stopPolling();
	}

	onMount(() => {
		fetchStatus().then(() => {
			if (isActive(status?.status)) startPolling();
		});
	});

	onDestroy(stopPolling);
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
			<button onclick={startCrawl} disabled={isActive(status?.status)}>
				{isActive(status?.status) ? 'Crawling…' : 'Crawl Finn.no'}
			</button>
			{#if isActive(status?.status)}
				<button class="cancel" onclick={cancelCrawl}>Cancel</button>
			{/if}
		</div>

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
</style>
