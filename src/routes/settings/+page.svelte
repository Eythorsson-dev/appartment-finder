<script lang="ts">
	import { onDestroy } from 'svelte';

	type CrawlStatus = {
		status: 'idle' | 'running' | 'done' | 'error';
		total: number;
		processed: number;
		started_at: string | null;
		finished_at: string | null;
		error: string | null;
	};

	let status = $state<CrawlStatus | null>(null);
	let polling: ReturnType<typeof setInterval> | null = null;

	async function fetchStatus() {
		const res = await fetch('/api/crawl/status');
		status = await res.json();
	}

	async function startCrawl() {
		const res = await fetch('/api/crawl', { method: 'POST' });
		if (res.status === 202) {
			await fetchStatus();
			startPolling();
		}
	}

	function startPolling() {
		if (polling) return;
		polling = setInterval(async () => {
			await fetchStatus();
			if (status?.status !== 'running') stopPolling();
		}, 2000);
	}

	function stopPolling() {
		if (polling) {
			clearInterval(polling);
			polling = null;
		}
	}

	onDestroy(stopPolling);

	fetchStatus().then(() => {
		if (status?.status === 'running') startPolling();
	});
</script>

<main>
	<h1>Settings</h1>

	<section>
		<h2>Data Collection</h2>
		<button onclick={startCrawl} disabled={status?.status === 'running'}>
			{status?.status === 'running' ? 'Crawling…' : 'Crawl Finn.no'}
		</button>

		{#if status && status.status !== 'idle'}
			<div class="status">
				{#if status.status === 'running'}
					<p>
						Fetching listings: <strong>{status.processed}</strong> /
						<strong>{status.total || '?'}</strong>
					</p>
					{#if status.total > 0}
						<progress value={status.processed} max={status.total}></progress>
					{:else}
						<p class="muted">Discovering listings…</p>
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
