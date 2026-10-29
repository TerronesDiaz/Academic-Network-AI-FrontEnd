<script lang="ts">
	import { onMount } from 'svelte';
	import { listAttentionRuns, startAttentionRun, getAttentionRun } from '$lib/api/client';
	import type { AttentionInput, AttentionJob, AttentionResult } from '$lib/api/client';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber } from '$lib/i18n/format';

	let input = $state<AttentionInput | null>(null);
	let jobs = $state<AttentionJob[]>([]);
	let selected = $state<AttentionResult | null>(null);
	let configured = $state(false);
	let reviewed = $state(false);
	let busy = $state(false);
	let error = $state('');

	const formatExample = '{"version":"publication-altmetrics-v1","publications":[{"publication_id":"123","doi":"10.1234/example","pmid":null,"review_reference":"https://doi.org/10.1234/example"}]}';

	function stateLabel(status: string) {
		switch (status) {
			case 'OK': return m.altmetrics_state_ok();
			case 'NOT_FOUND': return m.altmetrics_state_not_found();
			case 'NO_IDENTIFIER': return m.altmetrics_state_no_identifier();
			case 'pending': return m.altmetrics_state_pending();
			case 'success': return m.altmetrics_state_success();
			case 'error': return m.altmetrics_state_error();
			default: return status;
		}
	}

	function stateBadge(status: string) {
		if (status === 'OK' || status === 'success') return 'badge-success';
		if (status === 'error') return 'badge-danger';
		if (status === 'pending') return 'badge-warning';
		return 'badge-neutral';
	}

	function bridgeLabel(status: string) {
		switch (status) {
			case 'NOT_NEEDED': return m.altmetrics_bridge_not_needed();
			case 'MATCHED': return m.altmetrics_bridge_matched();
			case 'CONFLICT': return m.altmetrics_bridge_conflict();
			case 'NOT_FOUND': return m.altmetrics_state_not_found();
			case 'NO_IDENTIFIER': return m.altmetrics_state_no_identifier();
			default: return status;
		}
	}

	function bridgeBadge(status: string) {
		if (status === 'MATCHED') return 'badge-info';
		if (status === 'CONFLICT') return 'badge-danger';
		return 'badge-neutral';
	}

	function fmt(v: number | null | undefined) {
		return v == null ? '—' : formatNumber(v);
	}

	function pairs(values: [string, number][]) {
		return values.map(([key, value]) => `${key.replaceAll('_', ' ')}: ${formatNumber(value)}`).join(' · ') || '—';
	}

	async function refresh() {
		try {
			const result = await listAttentionRuns();
			jobs = result.runs;
			configured = result.configured;
			if (selected) selected = await getAttentionRun(selected.run_id);
		} catch {
			error = m.altmetrics_error_status();
		}
	}

	onMount(() => { void refresh(); });

	async function load(event: Event) {
		input = null;
		reviewed = false;
		error = '';
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		if (file.size > 100000) { error = m.altmetrics_error_size(); return; }
		try {
			const data = JSON.parse(await file.text()) as AttentionInput;
			if (data.version !== 'publication-altmetrics-v1' || !Array.isArray(data.publications) ||
				data.publications.length < 1 || data.publications.length > 20 ||
				data.publications.some((p) => typeof p.publication_id !== 'string' || typeof p.review_reference !== 'string'))
				throw new Error();
			input = data;
		} catch {
			error = m.altmetrics_error_invalid();
		}
	}

	async function start() {
		if (!input || !reviewed || busy) return;
		busy = true;
		error = '';
		try {
			const job = await startAttentionRun(input);
			selected = { ...job, report: null };
			reviewed = false;
			await refresh();
		} catch {
			error = m.altmetrics_error_start();
		} finally {
			busy = false;
		}
	}

	async function select(id: string) {
		try { selected = await getAttentionRun(id); }
		catch { error = m.altmetrics_error_open(); }
	}

	let rows = $derived(selected?.report ? Object.entries(selected.report.publications) : []);
	let kpis = $derived.by(() => {
		const scores = rows.map(([, row]) => row.attention.score).filter((s): s is number => s != null);
		return {
			total: rows.length,
			found: rows.filter(([, row]) => row.attention.status === 'OK').length,
			bridged: rows.filter(([, row]) => row.dimensions_bridge === 'MATCHED').length,
			max: scores.length ? Math.max(...scores) : null
		};
	});
</script>

<svelte:head><title>{m.altmetrics_title()} · AcademicNetwork</title></svelte:head>

<div class="app-page">
	<nav><a href="/indicators" class="btn-link">&larr; {m.common_back_to({ target: m.indicators_title() })}</a></nav>

	<header class="page-header">
		<div>
			<h1 class="page-heading">{m.altmetrics_title()}</h1>
			<p class="page-description">{m.altmetrics_description()}</p>
		</div>
	</header>

	{#if error}<p role="alert" class="notice-error">{error}</p>{/if}

	<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
		<section class="surface" aria-labelledby="upload-heading">
			<div class="surface-header">
				<h2 id="upload-heading" class="section-title">{m.altmetrics_upload_title()}</h2>
				<p class="section-description">{m.altmetrics_upload_help()}</p>
			</div>
			<div class="surface-body space-y-4">
				<details class="text-sm">
					<summary class="cursor-pointer font-medium text-gray-700">{m.altmetrics_format()}</summary>
					<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800">{formatExample}</pre>
				</details>
				<label class="block text-sm font-medium text-gray-700">
					{m.altmetrics_file()}
					<input class="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-50" type="file" accept=".json,application/json" onchange={load} />
				</label>
				{#if input}
					<div class="rounded-md border border-gray-200">
						<p class="border-b border-gray-200 px-3 py-2 text-xs font-medium text-gray-500">{m.altmetrics_ready({ count: input.publications.length })}</p>
						<ul class="max-h-48 divide-y divide-gray-100 overflow-auto text-sm">
							{#each input.publications as p}
								<li class="flex justify-between gap-3 px-3 py-1.5">
									<span class="text-gray-900">{m.altmetrics_publication({ id: p.publication_id })}</span>
									<span class="truncate text-gray-500">{p.doi ?? p.pmid ?? m.altmetrics_no_identifier()}</span>
								</li>
							{/each}
						</ul>
					</div>
					<label class="flex items-start gap-2 text-sm text-gray-700">
						<input class="mt-0.5" type="checkbox" bind:checked={reviewed} />
						<span>{m.altmetrics_confirm()}</span>
					</label>
				{/if}
				{#if !configured}<p class="notice-warning">{m.altmetrics_not_configured()}</p>{/if}
				<button class="btn-primary" disabled={!input || !reviewed || !configured || busy} onclick={start}>
					{busy ? m.altmetrics_starting() : m.altmetrics_start()}
				</button>
				<p class="text-xs text-gray-500">{m.altmetrics_limits()}</p>
			</div>
		</section>

		<section class="surface self-start" aria-labelledby="runs-heading">
			<div class="surface-header flex items-center justify-between gap-3">
				<h2 id="runs-heading" class="section-title">{m.altmetrics_runs()}</h2>
				<button class="btn-link" onclick={refresh}>{m.altmetrics_refresh()}</button>
			</div>
			{#if jobs.length === 0}
				<p class="px-5 py-6 text-sm text-gray-600">{m.altmetrics_runs_empty()}</p>
			{:else}
				<ul class="divide-y divide-gray-100">
					{#each jobs as job}
						<li>
							<button
								class="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-50 {selected?.run_id === job.run_id ? 'bg-indigo-50/60' : ''}"
								aria-current={selected?.run_id === job.run_id ? 'true' : undefined}
								onclick={() => select(job.run_id)}
							>
								<span class="min-w-0">
									<span class="block truncate font-mono text-xs text-gray-700" title={job.run_id}>{job.run_id}</span>
									<span class="text-xs text-indigo-700">{selected?.run_id === job.run_id ? m.altmetrics_selected_run() : m.altmetrics_open()}</span>
								</span>
								<span class="badge {stateBadge(job.status)} shrink-0">{stateLabel(job.status)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	{#if selected}
		<section class="space-y-4" aria-labelledby="result-heading">
			<div class="flex flex-wrap items-center gap-2">
				<h2 id="result-heading" class="section-title">{m.altmetrics_result()}</h2>
				<span class="badge {stateBadge(selected.status)}">{stateLabel(selected.status)}</span>
			</div>
			{#if selected.report}
				<dl class="metric-strip">
					<div class="metric-cell"><dt class="metric-label">{m.altmetrics_kpi_publications()}</dt><dd class="metric-value">{fmt(kpis.total)}</dd></div>
					<div class="metric-cell"><dt class="metric-label">{m.altmetrics_kpi_found()}</dt><dd class="metric-value">{fmt(kpis.found)}<span class="text-base font-normal text-gray-400"> / {fmt(kpis.total)}</span></dd></div>
					<div class="metric-cell"><dt class="metric-label">{m.altmetrics_kpi_bridge()}</dt><dd class="metric-value">{fmt(kpis.bridged)}</dd></div>
					<div class="metric-cell"><dt class="metric-label">{m.altmetrics_kpi_max()}</dt><dd class="metric-value">{fmt(kpis.max)}</dd></div>
				</dl>
				<div class="data-shell">
					<div class="data-scroll">
						<table class="data-table" aria-label={m.altmetrics_table_label()}>
							<thead>
								<tr>
									<th scope="col">{m.altmetrics_col_publication()}</th>
									<th scope="col">{m.altmetrics_status()}</th>
									<th scope="col">{m.altmetrics_col_bridge()}</th>
									<th class="num" scope="col">{m.altmetrics_col_score()}</th>
									<th class="num" scope="col">{m.altmetrics_col_posts()}</th>
									<th class="num" scope="col">{m.altmetrics_col_accounts()}</th>
									<th scope="col">{m.altmetrics_col_readers()}</th>
									<th scope="col">{m.altmetrics_col_channels()}</th>
								</tr>
							</thead>
							<tbody>
								{#each rows as [id, row]}
									<tr>
										<th class="font-normal" scope="row"><a class="font-medium text-indigo-700 hover:underline" href={`/publications/${id}?from=/indicators/altmetrics&fromLabel=${encodeURIComponent(m.altmetrics_title())}`}>{id}</a></th>
										<td><span class="badge {stateBadge(row.attention.status)}">{stateLabel(row.attention.status)}</span></td>
										<td><span class="badge {bridgeBadge(row.dimensions_bridge)}">{bridgeLabel(row.dimensions_bridge)}</span></td>
										<td class="num font-semibold text-gray-950">{fmt(row.attention.score)}</td>
										<td class="num text-gray-700">{fmt(row.attention.posts)}</td>
										<td class="num text-gray-700">{fmt(row.attention.accounts)}</td>
										<td class="text-gray-700">{pairs(row.attention.readers)}</td>
										<td class="text-gray-700">{pairs(row.attention.channels)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				<p class="text-xs text-gray-500">{m.altmetrics_missing_note()}</p>
			{:else}
				<p class="empty-state">{m.altmetrics_result_pending()}</p>
			{/if}
		</section>
	{/if}
</div>
