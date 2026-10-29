<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listIndicators, getIndicatorSummary } from '$lib/api/client';
	import type { IndicatorRow, IndicatorSummary } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';

	let indicators = $state<IndicatorRow[]>([]);
	let summary = $state<IndicatorSummary | null>(null);
	let total = $state(0);
	let limit = $state(100);
	let offset = $state(0);
	let loading = $state(true);
	let error = $state('');
	let activeTab = $state<'summary' | 'table'>('summary');

	type IndicatorSortKey = 'canonical_name' | 'total_publications' | 'total_citations' | 'h_index' | 'i10_index' | 'pagerank' | 'betweenness_centrality' | 'clustering_coeff';

	const backendField: Record<IndicatorSortKey, string> = {
		canonical_name: 'canonical_name',
		total_publications: 'total_publications',
		total_citations: 'total_citations',
		h_index: 'h_index',
		i10_index: 'i10_index',
		pagerank: 'pagerank',
		betweenness_centrality: 'betweenness_centrality',
		clustering_coeff: 'clustering_coeff',
	};

	let sortKey = $state<IndicatorSortKey>('h_index');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function toggleSort(key: IndicatorSortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'desc';
		}
		offset = 0;
		fetchData();
	}

	function sortIndicator(key: IndicatorSortKey) {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u2191' : ' \u2193';
	}

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchData() {
		loading = true;
		error = '';
		try {
			const sortParam = sortDir === 'desc' ? `-${backendField[sortKey]}` : backendField[sortKey];
			const [indData, sumData] = await Promise.all([
				listIndicators({ limit, offset, sort: sortParam }),
				getIndicatorSummary({ top_n: 10 })
			]);
			indicators = indData.items;
			total = indData.total;
			summary = sumData;
		} catch (e) {
			error = userError(e, m.indicators_load_error());
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchData();
	});

	function fmtNum(v: unknown, digits = 0) {
		if (v == null) return '—';
		const n = Number(v);
		return isNaN(n) ? String(v) : formatNumber(n, { maximumFractionDigits: digits });
	}

	function fmtCell(value: unknown) {
		if (value == null) return '—';
		if (typeof value === 'number') return formatNumber(value);
		return String(value);
	}

	const displayColumns = [
		'author_name',
		'total_publications',
		'h_index',
		'scholar_h_index',
		'openalex_h_index',
		'i10_index',
		'scholar_i10_index',
		'openalex_i10_index',
		'scholar_citations',
		'openalex_citations',
		'pagerank',
		'betweenness_centrality',
		'clustering_coeff'
	];

	const columnLabels: Record<string, string> = {
		author_name: m.authors_name(),
		total_publications: m.publications_title(),
		h_index: m.indicators_h_computed(),
		scholar_h_index: m.indicators_scholar_h_short(),
		openalex_h_index: m.indicators_openalex_h_short(),
		i10_index: 'i10',
		scholar_i10_index: m.indicators_scholar_i10_short(),
		openalex_i10_index: m.indicators_openalex_i10_short(),
		scholar_citations: m.indicators_scholar_citations_short(),
		openalex_citations: m.indicators_openalex_citations_short(),
		pagerank: 'PageRank',
		betweenness_centrality: m.indicators_betweenness(),
		clustering_coeff: m.indicators_clustering(),
	};

	const columnSortKey: Record<string, IndicatorSortKey | null> = {
		author_name: 'canonical_name',
		total_publications: 'total_publications',
		h_index: 'h_index',
		scholar_h_index: null,
		openalex_h_index: null,
		i10_index: 'i10_index',
		scholar_i10_index: null,
		openalex_i10_index: null,
		scholar_citations: null,
		openalex_citations: null,
		pagerank: 'pagerank',
		betweenness_centrality: 'betweenness_centrality',
		clustering_coeff: 'clustering_coeff',
	};

	const networkColumns = new Set(['pagerank', 'betweenness_centrality', 'clustering_coeff']);

	function fmtCol(col: string, value: unknown) {
		if (value == null) return '—';
		if (typeof value === 'number' && networkColumns.has(col)) {
			return formatNumber(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
		}
		return fmtCell(value);
	}

	function num(row: IndicatorRow, key: string) {
		const value = (row as Record<string, unknown>)[key];
		return typeof value === 'number' ? value : null;
	}

	let topMaxH = $derived(Math.max(1, ...(summary?.top_h_index ?? []).map((row) => num(row, 'h_index') ?? 0)));
</script>

<div class="app-page">
	<header class="page-header">
		<h1 class="page-heading">{m.indicators_title()}</h1>
		<a href="/indicators/altmetrics" class="btn-secondary">{m.altmetrics_title()}</a>
	</header>
	<div class="tabs" role="tablist" aria-label={m.indicators_views()}>
		<button
			role="tab"
			aria-selected={activeTab === 'summary'}
			class="tab {activeTab === 'summary' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'summary')}>{m.indicators_summary()}</button>
		<button
			role="tab"
			aria-selected={activeTab === 'table'}
			class="tab {activeTab === 'table' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'table')}>{m.indicators_all()}</button>
	</div>

	{#if error}
		<div role="alert" class="notice-error">{error}</div>
	{/if}

	{#if loading}
		<div class="metric-strip animate-pulse" aria-hidden="true">
			{#each Array(4) as _}
				<div class="metric-cell">
					<div class="mb-2 h-3 w-24 rounded bg-gray-100"></div>
					<div class="h-7 w-16 rounded bg-gray-200"></div>
				</div>
			{/each}
		</div>
	{:else}
		{#if activeTab === 'summary' && summary}
			<div class="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<dl class="metric-strip sm:grid-cols-2 lg:grid-cols-2">
					<div class="metric-cell"><dt class="metric-label">{m.authors_title()}</dt><dd class="metric-value">{fmtNum(summary.authors)}</dd></div>
					<div class="metric-cell"><dt class="metric-label">{m.indicators_total_publications()}</dt><dd class="metric-value">{fmtNum(summary.total_publications)}</dd></div>
				</dl>

				<div class="data-shell">
					<table class="data-table">
						<caption class="sr-only">{m.indicators_summary()}</caption>
						<thead>
							<tr>
								<th scope="col"><span class="sr-only">{m.indicators_general()}</span></th>
								<th class="num" scope="col">Google Scholar</th>
								<th class="num" scope="col">OpenAlex</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<th class="font-medium text-gray-700" scope="row">{m.indicators_citations()}</th>
								<td class="num text-lg font-semibold text-gray-950">{fmtNum(summary.total_citations_scholar)}</td>
								<td class="num text-lg font-semibold text-gray-950">{fmtNum(summary.total_citations_openalex)}</td>
							</tr>
							<tr>
								<th class="font-medium text-gray-700" scope="row">{m.indicators_h_average()}</th>
								<td class="num text-lg font-semibold text-gray-950">{fmtNum(summary.average_scholar_h_index, 1)}</td>
								<td class="num text-lg font-semibold text-gray-950">{fmtNum(summary.average_openalex_h_index, 1)}</td>
							</tr>
							<tr>
								<th class="font-medium text-gray-700" scope="row">{m.indicators_h_median()}</th>
								<td class="num text-lg font-semibold text-gray-950">{fmtNum(summary.median_scholar_h_index, 1)}</td>
								<td class="num text-lg font-semibold text-gray-950">{fmtNum(summary.median_openalex_h_index, 1)}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<section class="surface" aria-labelledby="top-h-heading">
				<div class="surface-header">
					<h2 id="top-h-heading" class="section-title">{m.indicators_top_h()}</h2>
					<p class="section-description">{m.indicators_top_h_help()}</p>
				</div>
				{#if summary.top_h_index.length === 0}
					<p class="empty-state border-0">{m.indicators_empty()}</p>
				{:else}
					<div class="data-scroll">
						<table class="data-table" aria-label={m.indicators_top_list()}>
							<thead>
								<tr>
									<th class="w-10" scope="col">#</th>
									<th scope="col">{m.authors_name()}</th>
									<th class="min-w-48" scope="col">{m.indicators_h_computed()}</th>
									<th class="num" scope="col">{m.indicators_scholar_h_short()}</th>
									<th class="num" scope="col">{m.indicators_openalex_h_short()}</th>
									<th class="num" scope="col">{m.indicators_scholar_citations_short()}</th>
									<th class="num" scope="col">{m.indicators_openalex_citations_short()}</th>
									<th class="num" scope="col">{m.publications_title()}</th>
								</tr>
							</thead>
							<tbody>
								{#each summary.top_h_index as row, i}
									{@const h = num(row, 'h_index')}
									<tr>
										<td class="tabular-nums text-gray-500">{i + 1}</td>
										<th class="font-normal" scope="row">
											<a href="/authors/{(row as Record<string, unknown>).author_id}?from=/indicators&fromLabel={encodeURIComponent(m.indicators_title())}" class="font-medium text-indigo-700 hover:underline">{fmtCell(row.author_name)}</a>
										</th>
										<td>
											<div class="flex items-center gap-3" title="{m.indicators_h_computed()}: {fmtNum(h)}">
												<span class="w-8 text-right font-semibold tabular-nums text-gray-950">{fmtNum(h)}</span>
												<div class="data-bar"><span style="width: {((h ?? 0) / topMaxH) * 100}%"></span></div>
											</div>
										</td>
										<td class="num text-gray-700">{fmtNum(num(row, 'scholar_h_index'))}</td>
										<td class="num text-gray-700">{fmtNum(num(row, 'openalex_h_index'))}</td>
										<td class="num text-gray-700">{fmtNum(num(row, 'scholar_citations'))}</td>
										<td class="num text-gray-700">{fmtNum(num(row, 'openalex_citations'))}</td>
										<td class="num text-gray-700">{fmtNum(num(row, 'total_publications'))}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{:else if activeTab === 'table'}
			{#if indicators.length === 0}
				<div class="empty-state">
					<p>{m.indicators_empty()}</p>
				</div>
			{:else}
				<p class="text-sm text-gray-600">{m.indicators_showing({ shown: indicators.length, total })}</p>
				<div class="data-shell">
					<div class="data-scroll">
						<table class="data-table" aria-label={m.indicators_all_list()}>
							<thead>
								<tr>
									{#each displayColumns as col}
										{@const sk = columnSortKey[col]}
										<th
											class="whitespace-nowrap {col === 'author_name' ? 'sticky left-0 z-10 bg-gray-50' : 'num'} {sk ? 'cursor-pointer select-none hover:text-gray-900' : ''} {sk && sortKey === sk ? 'text-indigo-700' : ''}"
											scope="col"
											aria-sort={sk && sortKey === sk ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
										>
											{#if sk}
												<button class="uppercase tracking-wide" onclick={() => toggleSort(sk)}>{columnLabels[col] ?? col}{sortIndicator(sk)}</button>
											{:else}
												{columnLabels[col] ?? col}
											{/if}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each indicators as row}
									<tr class="group">
										{#each displayColumns as col}
											{@const val = (row as Record<string, unknown>)[col]}
											{#if col === 'author_name'}
												<th class="sticky left-0 z-10 whitespace-nowrap bg-white font-normal group-hover:bg-gray-50" scope="row">
													<a href="/authors/{(row as Record<string, unknown>).author_id}?from=/indicators&fromLabel={encodeURIComponent(m.indicators_title())}" class="font-medium text-indigo-700 hover:underline">{fmtCell(val)}</a>
												</th>
											{:else}
												<td class="num {col === 'h_index' ? 'font-semibold text-gray-950' : 'text-gray-700'}">{fmtCol(col, val)}</td>
											{/if}
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				<div class="flex items-center justify-between">
					<button onclick={() => { offset = Math.max(0, offset - limit); fetchData(); }} disabled={offset === 0} class="btn-secondary">{m.common_previous()}</button>
					<span class="text-sm text-gray-600">{m.common_page_of({ page: Math.floor(offset / limit) + 1, total: Math.ceil(total / limit) || 1 })}</span>
					<button onclick={() => { offset = offset + limit; fetchData(); }} disabled={offset + limit >= total} class="btn-secondary">{m.common_next()}</button>
				</div>
			{/if}
		{/if}
	{/if}
</div>
